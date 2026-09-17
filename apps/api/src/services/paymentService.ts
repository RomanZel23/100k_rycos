import { getDatabase, orders, companyPaymentGateways, eq, and } from '@rycos/database';
import { InitiatePaymentRequest, InitiatePaymentResponse } from '@rycos/shared';
import { updateOrderStatus, isZeroPrepOrder } from './orderEngine.js';
import { initializePaymentPage, assertPaymentPage, captureTransaction, SaferpayCredentials } from './saferpayClient.js';
import { broadcastToStaff, broadcastToOrder } from '../plugins/websocket.js';
import { getRedis } from '../config/redis.js';
import { env } from '../config/env.js';

async function getSaferpayCredentialsForCompany(companyId: number): Promise<SaferpayCredentials | undefined> {
  const db = getDatabase();
  try {
    const [gateway] = await db
      .select()
      .from(companyPaymentGateways)
      .where(and(
        eq(companyPaymentGateways.companyId, companyId),
        eq(companyPaymentGateways.gatewayName, 'SaferPay'),
        eq(companyPaymentGateways.isActive, true)
      ))
      .limit(1);

    if (gateway && gateway.customerId && gateway.publicKey && gateway.privateKey) {
      return {
        customerId: gateway.customerId,
        terminalId: gateway.terminalId || env.SAFERPAY_TERMINAL_ID,
        username: gateway.publicKey,
        password: gateway.privateKey,
        testMode: gateway.isTest ?? true,
      };
    }
  } catch (err: any) {
    console.warn('[PaymentGateway] Could not check custom gateway for company:', companyId, err.message);
  }
  return undefined;
}

export async function processPayment(input: InitiatePaymentRequest): Promise<InitiatePaymentResponse> {
  const db = getDatabase();

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);

  if (!order) {
    throw new Error(`Nie znaleziono zamówienia: ${input.orderId}`);
  }

  if (order.status !== 'pending_payment') {
    return {
      success: true,
      paymentId: order.id,
      status: 'captured',
      message: `Zamówienie ma już status: ${order.status}`,
    };
  }

  // Płatność gotówką / przy kasie
  if (input.method === 'cash') {
    const isZeroPrep = await isZeroPrepOrder(order.id, db);
    const targetStatus = isZeroPrep ? 'ready_to_collect' : 'in_progress';

    const [updatedOrder] = await db
      .update(orders)
      .set({
        paymentMethod: 'cash',
        status: targetStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    // Powiadom personel i KDS przez WebSocket o nowym zamówieniu
    try {
      await broadcastToStaff(order.companyId, {
        type: 'order.created',
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: targetStatus,
          paymentStatus: 'pending',
          paymentMethod: 'cash',
        },
      } as any);

      await broadcastToOrder(order.id, {
        type: 'order.status_updated',
        data: {
          orderId: order.id,
          status: targetStatus,
          paymentStatus: 'pending',
          paymentMethod: 'cash',
        },
      } as any);
    } catch (e) {
      console.warn('[PaymentService] Failed to broadcast cash order:', e);
    }

    return {
      success: true,
      paymentId: order.id,
      status: 'pending_user_action',
      message: isZeroPrep
        ? 'Zamówienie natychmiast gotowe do odbioru przy kasie/barze. Płatność przy odbiorze.'
        : 'Zamówienie przekazane do realizacji w kuchni. Płatność przy odbiorze.',
    };
  }

  // Sprawdź dedykowane poświadczenia Saferpay dla firmy w bazie
  const customCreds = await getSaferpayCredentialsForCompany(order.companyId);

  // Płatność elektroniczna (BLIK, Karta, Apple Pay, Google Pay) przez Saferpay
  const amountGrosze = Math.round(Number(order.totalAmount) * 100);
  const returnUrl =
    input.returnUrl || `${env.PUBLIC_API_URL}/v1/payments/saferpay/return?orderId=${order.id}`;

  const initResult = await initializePaymentPage({
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: amountGrosze,
    currency: order.currency || 'PLN',
    method: input.method,
    returnUrl,
    credentials: customCreds,
  });

  if (!initResult.success || !initResult.token || !initResult.redirectUrl) {
    console.error(`[PaymentService] Saferpay init failed for order ${order.id}:`, initResult.error);
    throw new Error(initResult.error || 'Błąd inicjalizacji bramki płatności Saferpay');
  }

  // Zapisz sesję Saferpay w Redis na 1 godzinę
  const redis = getRedis();
  const sessionData = JSON.stringify({
    token: initResult.token,
    orderId: order.id,
    orderNumber: order.orderNumber,
    method: input.method,
    amount: amountGrosze,
    currency: order.currency || 'PLN',
  });

  await redis.setex(`saferpay:order:${order.id}`, 3600, sessionData);
  await redis.setex(`saferpay:token:${initResult.token}`, 3600, order.id);

  await db
    .update(orders)
    .set({
      paymentMethod: input.method,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  return {
    success: true,
    paymentId: order.id,
    status: 'pending_user_action',
    redirectUrl: initResult.redirectUrl,
    message: 'Przekierowanie do bramki płatności Saferpay...',
  };
}

/**
 * Potwierdzenie powrotu z bramki Saferpay (Assert & Capture)
 */
export async function finalizeSaferpayPayment(orderId: string): Promise<{ success: boolean; error?: string }> {
  const db = getDatabase();
  const redis = getRedis();

  const rawSession = await redis.get(`saferpay:order:${orderId}`);
  if (!rawSession) {
    console.warn(`[PaymentService] Brak aktywnej sesji Saferpay w Redis dla order ${orderId}`);
    return { success: false, error: 'Sesja płatności wygasła lub nie została odnaleziona' };
  }

  const session = JSON.parse(rawSession);
  const token = session.token;

  // Pobierz zamówienie, aby poznać firmę i pobrać jej poświadczenia bramki
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  const customCreds = order ? await getSaferpayCredentialsForCompany(order.companyId) : undefined;

  // Sprawdź autoryzację w Saferpay
  const assertResult = await assertPaymentPage(token, customCreds);
  if (!assertResult.success || !assertResult.transactionId) {
    console.error(`[PaymentService] Assert nie powiódł się dla ${orderId}:`, assertResult.error);
    return { success: false, error: assertResult.error || 'Brak autoryzacji płatności' };
  }

  // Jeśli status to AUTHORIZED, wykonaj Capture
  if (assertResult.status === 'AUTHORIZED') {
    const captureResult = await captureTransaction(assertResult.transactionId, customCreds);
    if (!captureResult.success) {
      console.error(`[PaymentService] Capture nie powiódł się dla ${orderId}:`, captureResult.error);
      return { success: false, error: captureResult.error || 'Błąd rozliczenia transakcji' };
    }
  }

  // Sukces: najpierw oznacz paymentStatus jako 'confirmed'
  await db
    .update(orders)
    .set({
      paymentStatus: 'confirmed',
      paymentMethod: session.method || 'online',
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  // Następnie zaktualizuj status cyklu zamówienia na 'paid' (co wywoła bezpieczną fiskalizację)
  await updateOrderStatus(orderId, 'paid');

  // Wyczyść token z Redis
  await redis.del(`saferpay:order:${orderId}`);
  await redis.del(`saferpay:token:${token}`);

  console.log(`[PaymentService] Płatność Saferpay dla zamówienia ${orderId} została pomyślnie zrealizowana (tx: ${assertResult.transactionId})`);
  return { success: true };
}
