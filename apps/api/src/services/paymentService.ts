import { getDatabase, orders, orderEvents, brands, companyPaymentGateways, eq, and, sql } from '@rycos/database';
import { InitiatePaymentRequest, InitiatePaymentResponse } from '@rycos/shared';
import { updateOrderStatus, markOrderPaid, expireUnpaidOrders } from './orderEngine.js';
import { initializePaymentPage, assertPaymentPage, captureTransaction, SaferpayCredentials } from './saferpayClient.js';
import { getRedis } from '../config/redis.js';
import { env } from '../config/env.js';
import { HttpError } from '../lib/response.js';
import { acquireLock } from '../lib/rateLimit.js';
import { isUuid, toGrosze } from '../lib/ids.js';

/** Saferpay errors that mean the payment definitely did not (and will not) succeed. */
const DEFINITIVE_FAILURES = new Set([
  'TRANSACTION_ABORTED',
  'TRANSACTION_DECLINED',
  '3DS_AUTHENTICATION_FAILED',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'PAYMENTMEANS_INVALID',
]);

const REDIRECT_TTL_S = 20 * 60;

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

/** Only allow redirects back to our own customer app. */
function safeCustomerUrl(candidate: string | undefined, fallback: string): string {
  if (!candidate) return fallback;
  try {
    const base = new URL(env.PUBLIC_CUSTOMER_URL);
    const url = new URL(candidate, base);
    return url.origin === base.origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

export async function processPayment(input: InitiatePaymentRequest): Promise<InitiatePaymentResponse> {
  const db = getDatabase();

  const [row] = await db
    .select({ order: orders, allowPayAtCounter: brands.allowPayAtCounter })
    .from(orders)
    .innerJoin(brands, eq(orders.brandId, brands.id))
    .where(eq(orders.id, input.orderId))
    .limit(1);

  if (!row) throw new HttpError(404, `Nie znaleziono zamówienia: ${input.orderId}`);
  const order = row.order;

  if (order.paymentStatus === 'paid' || order.paymentStatus === 'confirmed') {
    return { success: true, paymentId: order.id, status: 'captured', message: 'Zamówienie jest już opłacone' };
  }
  if (order.status !== 'pending_payment' && order.status !== 'payment_failed') {
    throw new HttpError(409, `Nie można opłacić zamówienia o statusie: ${order.status}`);
  }

  // Płatność gotówką / przy kasie
  if (input.method === 'cash') {
    if (!row.allowPayAtCounter) throw new HttpError(400, 'Płatność przy kasie nie jest dostępna dla tej marki');
    await db.update(orders).set({ paymentMethod: 'cash', updatedAt: new Date() }).where(eq(orders.id, order.id));
    if (order.status === 'payment_failed') await updateOrderStatus(order.id, 'pending_payment', { actor: 'customer' });
    const updated = await updateOrderStatus(order.id, 'in_progress', { reason: 'pay_at_counter', actor: 'customer' });

    return {
      success: true,
      paymentId: order.id,
      status: 'pending_user_action',
      message: updated.status === 'ready_to_collect'
        ? 'Zamówienie natychmiast gotowe do odbioru przy kasie/barze. Płatność przy odbiorze.'
        : 'Zamówienie przekazane do realizacji w kuchni. Płatność przy odbiorze.',
    };
  }

  if (input.method === 'terminal_tap') {
    throw new HttpError(400, 'Płatność terminalem jest dostępna tylko na stanowisku POS');
  }

  // One payment page per order at a time (prevents double charging from two tabs)
  const unlock = await acquireLock(`saferpay:init:${order.id}`, 20_000);
  if (!unlock) throw new HttpError(409, 'Płatność jest właśnie inicjowana — spróbuj ponownie za chwilę');

  try {
    const redis = getRedis();

    // An earlier payment page exists: it may already be paid
    if (order.paymentToken) {
      const fin = await finalizeSaferpayPayment(order.id);
      if (fin.success) {
        return { success: true, paymentId: order.id, status: 'captured', message: 'Płatność została już zrealizowana' };
      }
      if (fin.pending) {
        const existingRedirect = await redis.get(`saferpay:redirect:${order.id}`).catch(() => null);
        if (existingRedirect) {
          return { success: true, paymentId: order.id, status: 'pending_user_action', redirectUrl: existingRedirect, message: 'Kontynuuj płatność' };
        }
      }
    }

    if (order.status === 'payment_failed') {
      await updateOrderStatus(order.id, 'pending_payment', { actor: 'customer', reason: 'payment_retry' });
    }

    const customCreds = await getSaferpayCredentialsForCompany(order.companyId);
    const amountGrosze = toGrosze(order.totalAmount);
    const next = safeCustomerUrl(input.returnUrl, `${env.PUBLIC_CUSTOMER_URL}/order/${order.id}`);
    const returnUrl = `${env.PUBLIC_API_URL}/v1/payments/saferpay/return?orderId=${order.id}&next=${encodeURIComponent(next)}`;
    const notifyUrl = `${env.PUBLIC_API_URL}/v1/payments/saferpay/webhook?orderId=${order.id}`;

    const initResult = await initializePaymentPage({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: amountGrosze,
      currency: order.currency || 'PLN',
      method: input.method,
      returnUrl,
      notifyUrl,
      credentials: customCreds,
    });

    if (!initResult.success || !initResult.token || !initResult.redirectUrl) {
      console.error(`[PaymentService] Saferpay init failed for order ${order.id}:`, initResult.error);
      throw new HttpError(502, initResult.error || 'Błąd inicjalizacji bramki płatności Saferpay');
    }

    // Persist the token in the DB (source of truth) — Redis is only a cache for the redirect URL
    await db
      .update(orders)
      .set({ paymentMethod: input.method, paymentToken: initResult.token, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await db.insert(orderEvents).values({
      orderId: order.id,
      eventType: 'payment.initialized',
      payload: {
        method: input.method,
        amountGrosze,
        gateway: 'saferpay',
        credentials: customCreds ? 'company' : 'platform_env',
        testMode: customCreds ? customCreds.testMode ?? true : env.SAFERPAY_TEST_MODE,
      },
    });

    try {
      await redis.setex(`saferpay:redirect:${order.id}`, REDIRECT_TTL_S, initResult.redirectUrl);
    } catch {}

    return {
      success: true,
      paymentId: order.id,
      status: 'pending_user_action',
      redirectUrl: initResult.redirectUrl,
      message: 'Przekierowanie do bramki płatności Saferpay...',
    };
  } finally {
    await unlock();
  }
}

export interface FinalizeResult {
  success: boolean;
  pending?: boolean;
  error?: string;
}

/**
 * Assert & capture a Saferpay payment. Called from the return URL, the server-to-server
 * notification and the reconciliation job. Idempotent and serialized per order.
 */
export async function finalizeSaferpayPayment(orderId: string): Promise<FinalizeResult> {
  if (!isUuid(orderId)) return { success: false, error: 'Nieprawidłowe zamówienie' };
  const db = getDatabase();

  const unlock = await acquireLock(`saferpay:finalize:${orderId}`, 45_000);
  if (!unlock) return { success: false, pending: true, error: 'Płatność jest właśnie weryfikowana' };

  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return { success: false, error: 'Nie znaleziono zamówienia' };
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'confirmed') return { success: true };

    const token = order.paymentToken;
    if (!token) return { success: false, error: 'Brak aktywnej sesji płatności dla zamówienia' };

    const customCreds = await getSaferpayCredentialsForCompany(order.companyId);
    const assertResult = await assertPaymentPage(token, customCreds);

    if (!assertResult.success || !assertResult.transactionId) {
      if (assertResult.errorName && DEFINITIVE_FAILURES.has(assertResult.errorName)) {
        if (order.status === 'pending_payment') {
          await updateOrderStatus(orderId, 'payment_failed', { reason: assertResult.errorName, actor: 'saferpay' }).catch(() => {});
        }
        return { success: false, error: assertResult.error || 'Płatność odrzucona' };
      }
      return { success: false, pending: true, error: assertResult.error || 'Płatność nie została jeszcze potwierdzona' };
    }

    // Amount / currency must match the order exactly
    const expected = toGrosze(order.totalAmount);
    if (assertResult.amount !== undefined && assertResult.amount !== expected) {
      await db.insert(orderEvents).values({
        orderId,
        eventType: 'order.payment_amount_mismatch',
        payload: { expected, got: assertResult.amount, transactionId: assertResult.transactionId },
      });
      return { success: false, error: 'Kwota płatności nie zgadza się z kwotą zamówienia — skontaktuj się z obsługą' };
    }
    if (assertResult.currency && order.currency && assertResult.currency.toUpperCase() !== order.currency.toUpperCase()) {
      return { success: false, error: 'Waluta płatności nie zgadza się z zamówieniem' };
    }

    let finalStatus = assertResult.status;
    if (assertResult.status === 'AUTHORIZED') {
      const captureResult = await captureTransaction(assertResult.transactionId, customCreds);
      if (!captureResult.success) {
        console.error(`[PaymentService] Capture nie powiódł się dla ${orderId}:`, captureResult.error);
        return { success: false, pending: true, error: captureResult.error || 'Błąd rozliczenia transakcji' };
      }
      finalStatus = captureResult.status || 'CAPTURED';
    }

    if (finalStatus !== 'CAPTURED') {
      // e.g. PENDING (some payment methods confirm asynchronously) — do not mark paid yet
      return { success: false, pending: true, error: `Płatność w trakcie potwierdzania (${finalStatus})` };
    }

    await markOrderPaid(orderId, {
      method: order.paymentMethod || 'online',
      amountGrosze: expected,
      reference: assertResult.transactionId,
      paymentStatus: 'confirmed',
      actor: 'saferpay',
    });
    // Fiscalization is triggered by the outbox event created in markOrderPaid (worker).

    try {
      await getRedis().del(`saferpay:redirect:${orderId}`);
    } catch {}

    console.log(`[PaymentService] Płatność Saferpay dla zamówienia ${orderId} zrealizowana (tx: ${assertResult.transactionId})`);
    return { success: true };
  } finally {
    await unlock();
  }
}

/**
 * Background reconciliation (every minute, one instance at a time):
 * 1. finalize online payments whose customer never came back to the return URL
 * 2. cancel unpaid orders older than PENDING_PAYMENT_TTL_MINUTES (releases stock)
 */
export async function reconcilePayments(): Promise<void> {
  const unlock = await acquireLock('payments:reconcile', 55_000);
  if (!unlock) return;
  try {
    const db = getDatabase();
    const pending = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(
        eq(orders.status, 'pending_payment'),
        sql`${orders.paymentToken} IS NOT NULL`,
        sql`${orders.updatedAt} < now() - interval '2 minutes'`
      ))
      .limit(50);

    for (const o of pending) {
      try {
        await finalizeSaferpayPayment(o.id);
      } catch (err: any) {
        console.warn(`[Reconcile] finalize ${o.id} failed:`, err.message);
      }
    }

    const cancelled = await expireUnpaidOrders(env.PENDING_PAYMENT_TTL_MINUTES, 200, async (orderId, hasToken) => {
      if (!hasToken) return false;
      const fin = await finalizeSaferpayPayment(orderId);
      // keep the order if it got paid, or if the gateway state is still unknown (pending)
      return fin.success || !!fin.pending && !fin.error?.includes('Brak aktywnej sesji');
    });
    if (cancelled.length) console.log(`[Reconcile] Cancelled ${cancelled.length} unpaid orders (payment timeout)`);
  } catch (err: any) {
    console.error('[Reconcile] error:', err.message);
  } finally {
    await unlock();
  }
}

let reconcileTimer: NodeJS.Timeout | null = null;
export function startPaymentReconciliation() {
  if (reconcileTimer) return;
  reconcileTimer = setInterval(() => {
    reconcilePayments().catch(() => {});
  }, 60_000);
}

/** Startup report of Saferpay modes — makes an accidental test/production mix-up visible in logs. */
export async function logSaferpayModes(): Promise<void> {
  const prod = env.NODE_ENV === 'production';
  const line = (label: string, test: boolean) =>
    `${label}: ${test ? 'TEST (test.saferpay.com)' : 'PRODUKCJA (www.saferpay.com)'}`;
  console.log(`[Saferpay] ${line('Platforma (env SAFERPAY_*)', env.SAFERPAY_TEST_MODE)}`);
  console.log(`[Saferpay] ${line('Onboarding SolutionsBay', env.SOLUTIONSBAY_SAFERPAY_TEST_MODE)}`);
  if (prod && env.SAFERPAY_TEST_MODE) console.warn('⚠️ [Saferpay] NODE_ENV=production, ale SAFERPAY_TEST_MODE=true — płatności klientów idą na bramkę TESTOWĄ');
  if (prod && env.SOLUTIONSBAY_SAFERPAY_TEST_MODE) console.warn('⚠️ [Saferpay] NODE_ENV=production, ale SOLUTIONSBAY_SAFERPAY_TEST_MODE=true — onboarding na bramce TESTOWEJ');
  try {
    const rows = await getDatabase()
      .select({ companyId: companyPaymentGateways.companyId, isTest: companyPaymentGateways.isTest })
      .from(companyPaymentGateways)
      .where(and(eq(companyPaymentGateways.gatewayName, 'SaferPay'), eq(companyPaymentGateways.isActive, true)));
    const testCompanies = rows.filter((r) => r.isTest).map((r) => r.companyId);
    if (testCompanies.length) {
      console.warn(`[Saferpay] Firmy z bramką w trybie TEST: ${testCompanies.join(', ')}${prod ? ' ⚠️ (środowisko produkcyjne)' : ''}`);
    }
  } catch {}
}
