import { getDatabase, orders, eq } from '@rycos/database';
import { InitiatePaymentRequest, InitiatePaymentResponse } from '@rycos/shared';
import { updateOrderStatus } from './orderEngine.js';
import { initializePaymentPage, assertPaymentPage, captureTransaction } from './saferpayClient.js';
import { getRedis } from '../config/redis.js';
import { env } from '../config/env.js';

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
    await db
      .update(orders)
      .set({
        paymentMethod: 'cash',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return {
      success: true,
      paymentId: order.id,
      status: 'pending_user_action',
      message: 'Prosimy o uregulowanie płatności przy odbiorze / u obsługi.',
    };
  }

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

  // Sprawdź autoryzację w Saferpay
  const assertResult = await assertPaymentPage(token);
  if (!assertResult.success || !assertResult.transactionId) {
    console.error(`[PaymentService] Assert nie powiódł się dla ${orderId}:`, assertResult.error);
    return { success: false, error: assertResult.error || 'Brak autoryzacji płatności' };
  }

  // Jeśli status to AUTHORIZED, wykonaj Capture
  if (assertResult.status === 'AUTHORIZED') {
    const captureResult = await captureTransaction(assertResult.transactionId);
    if (!captureResult.success) {
      console.error(`[PaymentService] Capture nie powiódł się dla ${orderId}:`, captureResult.error);
      return { success: false, error: captureResult.error || 'Błąd rozliczenia transakcji' };
    }
  }

  // Sukces: oznacz zamówienie jako 'paid', wyślij zdarzenie outbox dla rycos i websocket
  await updateOrderStatus(orderId, 'paid');

  await db
    .update(orders)
    .set({
      paymentStatus: 'confirmed',
      paymentMethod: session.method || 'online',
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  // Wyczyść token z Redis
  await redis.del(`saferpay:order:${orderId}`);
  await redis.del(`saferpay:token:${token}`);

  console.log(`[PaymentService] Płatność Saferpay dla zamówienia ${orderId} została pomyślnie zrealizowana (tx: ${assertResult.transactionId})`);
  return { success: true };
}
