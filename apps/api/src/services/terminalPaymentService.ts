import { randomUUID } from 'crypto';
import { getDatabase, terminals, fiscalDevices, orders, orderEvents, eq, and } from '@rycos/database';
import { env } from '../config/env.js';
import { rycosRpc } from '../lib/rycos.js';
import { MqttTimeoutError } from '../lib/mqttRpc.js';
import { HttpError } from '../lib/response.js';
import { acquireLock } from '../lib/rateLimit.js';
import { isUuid, toGrosze } from '../lib/ids.js';
import { markOrderPaid } from './orderEngine.js';

export interface TapPaymentRequest {
  companyId: number;
  terminalId?: string;
  tapDeviceId?: string;
  /** Order to charge. The amount is ALWAYS taken from the order, never from the client. */
  orderId: string;
  /** Optional client-side amount, only used as a sanity check. */
  clientAmountGrosz?: number;
  currency?: string;
  reference?: string;
  idPay?: string;
}

export interface TapPaymentCancelRequest {
  companyId: number;
  terminalId?: string;
  tapDeviceId?: string;
  idPay: string;
}

export interface TapPaymentResult {
  success: boolean;
  result?: string;
  paymentSolutionReference?: string;
  brandName?: string;
  idPay?: string;
  displayId?: string;
  amountGrosz?: number;
  error?: string;
  remark?: string;
  errorCondition?: string;
  raw?: any;
}

/**
 * Resolve target RYCOS display ID for card payment. Only devices of the caller's company are allowed.
 */
export async function resolveTapDisplayId(companyId: number, terminalId?: string, explicitTapDeviceId?: string): Promise<string> {
  const db = getDatabase();
  const companyTerms = await db.select().from(terminals).where(eq(terminals.companyId, companyId));
  const companyFiscal = await db
    .select()
    .from(fiscalDevices)
    .where(and(eq(fiscalDevices.companyId, companyId), eq(fiscalDevices.status, 'active')));

  const allowed = new Set<string>();
  for (const t of companyTerms) {
    allowed.add(t.terminalId);
    if (t.tapDeviceId && t.tapDeviceId !== 'self') allowed.add(t.tapDeviceId.trim());
  }
  for (const f of companyFiscal) allowed.add(f.deviceId);

  // 1. Explicit device — only if it belongs to the company
  if (explicitTapDeviceId && explicitTapDeviceId.trim() !== '' && explicitTapDeviceId !== 'self') {
    const clean = explicitTapDeviceId.trim();
    if (!allowed.has(clean)) throw new HttpError(403, `Urządzenie ${clean} nie należy do tej firmy`);
    return clean;
  }

  // 2. Terminal configuration
  if (terminalId) {
    const cleanTermId = terminalId.trim().toUpperCase();
    const term = companyTerms.find((t) => t.terminalId === cleanTermId);
    if (term) {
      if (term.tapDeviceId && term.tapDeviceId !== 'self' && term.tapDeviceId.trim() !== '') return term.tapDeviceId.trim();
      if (term.tapDeviceId === 'self' || term.terminalId.startsWith('SBR-') || term.terminalId.startsWith('SBT-')) return term.terminalId;
    }
  }

  // 3. Any company SBR/SBT device
  for (const t of companyTerms) {
    if (t.tapDeviceId && t.tapDeviceId !== 'self' && t.tapDeviceId.trim() !== '') return t.tapDeviceId.trim();
    if (t.terminalId.startsWith('SBR-') || t.terminalId.startsWith('SBT-')) return t.terminalId;
  }
  for (const f of companyFiscal) {
    if (f.deviceId.startsWith('SBR-') || f.deviceId.startsWith('SBT-')) return f.deviceId;
  }

  if (env.NODE_ENV !== 'production') return env.RYCOS_DISPLAY_ID || 'SBT-NMLL2M';
  throw new HttpError(409, 'Brak skonfigurowanego terminala płatniczego (SBR/SoftPOS) dla tej firmy');
}

function interpretTapResponse(data: any, idPay: string, displayId: string, amountGrosz: number): TapPaymentResult {
  if (data.status >= 200 && data.status < 300) {
    const res = data.result || {};
    if (res._error || res.result === 'WPI_RESULT_FAILURE') {
      return {
        success: false,
        result: res.result || 'WPI_RESULT_FAILURE',
        errorCondition: res.errorCondition,
        remark: res.remark || 'Płatność kartą odrzucona przez terminal',
        idPay, displayId, amountGrosz, raw: res,
      };
    }
    return {
      success: true,
      result: res.result || 'WPI_RESULT_SUCCESS',
      paymentSolutionReference: res.paymentSolutionReference,
      brandName: res.brandName,
      idPay, displayId, amountGrosz, raw: res,
    };
  }
  return {
    success: false,
    result: 'WPI_RESULT_FAILURE',
    remark: data.result?.remark || data.result?.message || `Błąd terminala (kod ${data.status})`,
    errorCondition: data.result?.errorCondition,
    idPay, displayId, amountGrosz, raw: data.result,
  };
}

/**
 * Charge an order on a physical SBR-* / SoftPOS device and, on success, record the payment.
 * - amount is taken from the order (client amount is only a sanity check)
 * - one in-flight charge per order (distributed lock)
 * - late approvals (customer tapped after our 60s timeout) are still recorded
 */
export async function requestTapPayment(params: TapPaymentRequest): Promise<TapPaymentResult & { alreadyPaid?: boolean }> {
  const { companyId, terminalId, tapDeviceId: explicitTap, orderId, currency } = params;
  if (!isUuid(orderId)) throw new HttpError(400, 'order_id jest wymagany do płatności kartą');

  const db = getDatabase();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.companyId, companyId))).limit(1);
  if (!order) throw new HttpError(404, 'Nie znaleziono zamówienia');
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'confirmed') {
    return { success: true, alreadyPaid: true, result: 'ALREADY_PAID', idPay: order.paymentReference || undefined };
  }
  if (order.status === 'cancelled' || order.status === 'completed') {
    throw new HttpError(409, `Zamówienie #${order.orderNumber} ma status ${order.status} — nie można go opłacić`);
  }

  const amountGrosz = toGrosze(order.totalAmount);
  if (params.clientAmountGrosz !== undefined && params.clientAmountGrosz !== amountGrosz) {
    throw new HttpError(409, `Kwota na stanowisku (${params.clientAmountGrosz} gr) różni się od kwoty zamówienia (${amountGrosz} gr). Odśwież zamówienie.`);
  }

  const unlock = await acquireLock(`tap:${orderId}`, 150_000);
  if (!unlock) throw new HttpError(409, 'Płatność kartą dla tego zamówienia jest już w toku');

  const idPay = params.idPay && /^[\w-]{8,64}$/.test(params.idPay) ? params.idPay : randomUUID();
  const reference = (params.reference || `ORD-${order.orderNumber}-${order.id.slice(0, 8)}`).slice(0, 64);

  try {
    const displayId = await resolveTapDisplayId(companyId, terminalId, explicitTap);
    console.log(`[POS Tap Payment] Charging order #${order.orderNumber} on ${displayId}: ${amountGrosz} gr, idPay=${idPay}`);

    await db.insert(orderEvents).values({
      orderId, eventType: 'payment.tap_requested', payload: { idPay, displayId, amountGrosz, terminalId },
    });

    const recordSuccess = async (res: TapPaymentResult, late: boolean) => {
      await markOrderPaid(orderId, {
        method: 'card',
        terminalId: terminalId || null,
        amountGrosze: amountGrosz,
        reference: res.paymentSolutionReference || idPay,
        paymentStatus: 'paid',
        companyId,
        actor: late ? 'tap-late-approval' : 'tap',
      });
    };

    let data: any;
    try {
      data = await rycosRpc.request(
        displayId,
        '/pay',
        'POST',
        {
          idPay,
          command: 'PAYMENT',
          amount: amountGrosz,
          currency: (currency || order.currency || 'PLN').toUpperCase(),
          reference,
          returnReceipt: false,
        },
        60000,
        {
          lateWindowMs: 120000,
          onLate: (lateData) => {
            const late = interpretTapResponse(lateData, idPay, displayId, amountGrosz);
            if (late.success) {
              console.warn(`[POS Tap Payment] LATE approval for order ${orderId} (idPay=${idPay}) — recording payment`);
              recordSuccess(late, true).catch((e) =>
                console.error(`[POS Tap Payment] Failed to record late approval for ${orderId}:`, e?.message)
              );
            }
          },
        }
      );
    } catch (err: any) {
      if (err instanceof MqttTimeoutError) {
        // Ask the device to abort; a late approval is still handled by onLate above.
        rycosRpc
          .publish(displayId, '/pay', 'POST', { idPay, command: 'CANCEL_PAYMENT', amount: 0, currency: 'PLN' })
          .catch(() => {});
        return {
          success: false,
          result: 'TIMEOUT',
          remark: `Przekroczono czas oczekiwania na kartę (60s). Jeśli klient zdążył zapłacić, płatność zostanie zaksięgowana automatycznie.`,
          idPay, displayId, amountGrosz,
        };
      }
      return { success: false, error: err.message, remark: err.message, idPay, displayId, amountGrosz };
    }

    const res = interpretTapResponse(data, idPay, displayId, amountGrosz);
    if (res.success) await recordSuccess(res, false);
    return res;
  } finally {
    await unlock();
  }
}

/**
 * Cancel an in-flight Tap-on-Mobile / SBR-* payment transaction.
 */
export async function cancelTapPayment(params: TapPaymentCancelRequest): Promise<{ success: boolean; displayId: string }> {
  const { companyId, terminalId, tapDeviceId: explicitTap, idPay } = params;
  if (!idPay) throw new HttpError(400, 'id_pay is required');

  const displayId = await resolveTapDisplayId(companyId, terminalId, explicitTap);
  try {
    await rycosRpc.publish(displayId, '/pay', 'POST', { idPay, command: 'CANCEL_PAYMENT', amount: 0, currency: 'PLN' });
    return { success: true, displayId };
  } catch (err: any) {
    console.warn(`[POS Tap Payment] Cancel MQTT error:`, err?.message);
    return { success: false, displayId };
  }
}
