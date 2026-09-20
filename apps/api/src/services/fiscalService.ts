import {
  getDatabase,
  orders,
  fiscalReceipts,
  terminals,
  eq,
  and,
  claimOrderFiscalization,
  completeOrderFiscalization,
  failOrderFiscalization,
  markFiscalIssuedByDuplicate,
  repairBogusFiscalIssue,
  resolveFiscalDisplayId as resolveFiscalDisplayIdShared,
} from '@rycos/database';
import {
  buildFiscalPayload,
  parseFiscalResult,
  fiscalExternalRef,
  isDuplicateFiscalRefError,
  summarizeFiscalResponse,
} from '@rycos/shared';
import { env } from '../config/env.js';
import { broadcastToStaff, broadcastToOrder } from '../plugins/websocket.js';
import { rycosRpc } from '../lib/rycos.js';
import { HttpError } from '../lib/response.js';
import { isUuid } from '../lib/ids.js';

export interface FiscalizeOptions {
  orderId: string;
  autoPrint?: boolean;
  printerDeviceId?: string;
  terminalId?: string;
  /** Tenant guard: order must belong to this company. */
  companyId?: number;
  /**
   * Manual retry: an order stuck in 'issued' although the device never returned any receipt
   * data is released and fiscalized again (a truly printed receipt is caught by the duplicate
   * reference check on the device).
   */
  repair?: boolean;
}

export interface FiscalizeResult {
  success: boolean;
  pending?: boolean;
  receiptNumber?: string;
  pdfReceiptUrl?: string | null;
  qrCodeBase64?: string | null;
  jobId?: string | null;
  displayId?: string;
  error?: string;
  raw?: any;
}

export interface PrintJobOptions {
  companyId?: number;
  terminalId?: string;
  printerDeviceId?: string;
  jobId?: string;
  orderId?: string;
}

/** Generic correlated command to a RYCOS device (kept for other callers). */
export async function sendMqttCommand(displayId: string, action: string, method: string, payload: any, timeoutMs = 15000): Promise<any> {
  return rycosRpc.call(displayId, action, method, payload, timeoutMs);
}

export async function resolveFiscalDisplayId(companyId: number, orderTerminalId?: string | null): Promise<string> {
  return resolveFiscalDisplayIdShared(companyId, orderTerminalId, env.RYCOS_DISPLAY_ID || 'SBT-NMLL2M');
}

/**
 * Resolve target thermal printer display ID (SBR-* printer). Only devices of the given company are considered.
 */
export async function resolvePrinterDisplayId(
  companyId?: number,
  terminalId?: string | null,
  explicitPrinterDeviceId?: string | null,
  fallbackFiscalDeviceId?: string | null
): Promise<string> {
  const db = getDatabase();

  if (terminalId && companyId) {
    const cleanTerm = terminalId.trim().toUpperCase();
    const [term] = await db
      .select()
      .from(terminals)
      .where(and(eq(terminals.terminalId, cleanTerm), eq(terminals.companyId, companyId)))
      .limit(1);

    if (term) {
      if (explicitPrinterDeviceId && explicitPrinterDeviceId.trim() !== '' && explicitPrinterDeviceId !== 'self'
        && explicitPrinterDeviceId.trim() === (term.printerDeviceId || '').trim()) {
        return explicitPrinterDeviceId.trim();
      }
      if (term.printerDeviceId && term.printerDeviceId !== 'self' && term.printerDeviceId.trim() !== '') {
        return term.printerDeviceId.trim();
      }
      if (term.printerDeviceId === 'self' || term.terminalId.startsWith('SBR-') || term.terminalId.startsWith('SBT-')) {
        return term.terminalId;
      }
    }
  }

  if (fallbackFiscalDeviceId && fallbackFiscalDeviceId.trim() !== '') {
    return fallbackFiscalDeviceId.trim();
  }

  if (companyId) {
    const companyTerms = await db.select().from(terminals).where(eq(terminals.companyId, companyId));
    for (const t of companyTerms) {
      if (t.printerDeviceId && t.printerDeviceId !== 'self') return t.printerDeviceId.trim();
      if (t.terminalId.startsWith('SBR-')) return t.terminalId;
    }
  }

  return env.RYCOS_DISPLAY_ID || 'SBT-NMLL2M';
}

function existingResult(order: typeof orders.$inferSelect): FiscalizeResult {
  return {
    success: true,
    receiptNumber: order.fiscalReceiptNumber || undefined,
    pdfReceiptUrl: order.fiscalPdfUrl,
    qrCodeBase64: order.fiscalQrCode,
    jobId: order.fiscalJobId,
    displayId: order.fiscalDeviceId || undefined,
  };
}

/**
 * Issue the fiscal receipt for a paid order.
 * Safe against double fiscalization: uses the shared atomic DB claim (the worker uses the same one),
 * and a stable externalrefFR per order so a device can de-duplicate retries.
 */
export async function fiscalizeOrder(options: FiscalizeOptions): Promise<FiscalizeResult> {
  const { orderId, autoPrint = false, terminalId, companyId, repair = false } = options;
  if (!isUuid(orderId)) throw new HttpError(404, 'Nie znaleziono zamówienia');
  const db = getDatabase();

  if (repair) {
    const released = await repairBogusFiscalIssue(orderId);
    if (released) console.warn(`[Fiscal Service] Order ${orderId}: released an empty 'issued' state for a retry`);
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(companyId ? and(eq(orders.id, orderId), eq(orders.companyId, companyId)) : eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new HttpError(404, 'Nie znaleziono zamówienia');

  if (order.fiscalStatus === 'issued') return existingResult(order);
  if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'confirmed') {
    throw new HttpError(409, `Nie można fiskalizować nieopłaconego zamówienia #${order.orderNumber}`);
  }

  const claim = await claimOrderFiscalization(orderId);
  if (!claim) {
    const [fresh] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (fresh?.fiscalStatus === 'issued') return existingResult(fresh);
    return { success: false, pending: true, error: 'Fiskalizacja tego zamówienia jest już w toku' };
  }

  const claimed = claim.order;
  const displayId = await resolveFiscalDisplayId(claimed.companyId, terminalId || claimed.terminalId);
  const { payload, totalGrosze } = buildFiscalPayload(
    { id: claimed.id, currency: claimed.currency, customerNip: claimed.customerNip, paymentMethod: claimed.paymentMethod },
    claim.items.map((it) => ({
      name: it.name,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      ptuCode: it.ptuCode,
      taxRate: it.taxRate,
      addons: it.addonsJson as any,
    })),
    { autoPrint }
  );

  console.log(`[Fiscal Service] Issuing fiscal receipt for Order #${claimed.orderNumber} via ${displayId}...`);

  let result: any;
  try {
    result = await rycosRpc.call(displayId, '/fiscal/issue', 'POST', payload, 20000);
  } catch (err: any) {
    if (claimed.fiscalAttempts > 1 && isDuplicateFiscalRefError(err.message)) {
      console.warn(`[Fiscal Service] Order #${claimed.orderNumber}: device reports duplicate reference — receipt already issued earlier`);
      await markFiscalIssuedByDuplicate(orderId, err.message, displayId);
      return { success: true, displayId, error: 'Paragon był już wystawiony wcześniej (duplikat numeru referencyjnego)' };
    }
    console.error(`[Fiscal Service] Failed communicating with RYCOS device ${displayId}:`, err.message);
    await failOrderFiscalization(orderId, err.message);
    throw err;
  }

  console.log(
    `[Fiscal Service] \u2190 ${displayId} responded for Order #${claimed.orderNumber} (ref ${fiscalExternalRef(orderId)}): ${summarizeFiscalResponse(result)}`
  );

  const parsed = parseFiscalResult(result, claimed.orderNumber);

  // A 2xx envelope without any receipt data means NO receipt was issued — never mark it as issued,
  // otherwise the order is silently lost (no QR, no print job, no retry).
  if (!parsed.hasReceipt || parsed.deviceError) {
    const detail = parsed.deviceError || summarizeFiscalResponse(result);

    // The device rejected a repeat of the same reference: the receipt was issued by an earlier attempt.
    if (claimed.fiscalAttempts > 1 && isDuplicateFiscalRefError(detail)) {
      console.warn(`[Fiscal Service] Order #${claimed.orderNumber}: duplicate reference — receipt already issued earlier`);
      await markFiscalIssuedByDuplicate(orderId, detail, displayId);
      return { success: true, displayId, error: 'Paragon był już wystawiony wcześniej (duplikat numeru referencyjnego)' };
    }

    const message = `Urz\u0105dzenie ${displayId} nie zwr\u00f3ci\u0142o danych paragonu: ${detail}`;
    console.error(`[Fiscal Service] Order #${claimed.orderNumber}: ${message}`);
    await failOrderFiscalization(orderId, message);
    return { success: false, error: message, displayId, raw: result };
  }

  await completeOrderFiscalization({
    orderId,
    companyId: claimed.companyId,
    displayId,
    requestId: fiscalExternalRef(orderId),
    receiptNumber: parsed.receiptNumber,
    jpkId: parsed.jpkId,
    jobId: parsed.jobId,
    pdfUrl: parsed.pdfUrl,
    qrCodeBase64: parsed.qrCodeBase64,
    grossAmountGrosze: totalGrosze,
    currency: claimed.currency,
    customerNip: claimed.customerNip,
    rawResult: result,
  });

  const fiscalEvent = {
    type: 'order.fiscalized',
    timestamp: new Date().toISOString(),
    companyId: claimed.companyId,
    brandId: claimed.brandId,
    payload: {
      orderId,
      orderNumber: claimed.orderNumber,
      receiptNumber: parsed.receiptNumber,
      pdfUrl: parsed.pdfUrl,
      qrCode: parsed.qrCodeBase64,
      jobId: parsed.jobId,
    },
  };
  broadcastToStaff(claimed.companyId, fiscalEvent as any);
  broadcastToOrder(orderId, fiscalEvent as any);

  return {
    success: true,
    receiptNumber: parsed.receiptNumber,
    pdfReceiptUrl: parsed.pdfUrl,
    qrCodeBase64: parsed.qrCodeBase64,
    jobId: parsed.jobId,
    displayId,
    raw: result,
  };
}

/**
 * Trigger paper print job on thermal printer (SBR-*) via MQTT. Scoped to the caller's company.
 */
export async function printFiscalJob(options: PrintJobOptions): Promise<{ success: boolean; displayId: string; jobId?: string }> {
  const { companyId, terminalId, printerDeviceId: explicitPrinter, jobId: explicitJobId, orderId } = options;
  const db = getDatabase();

  let targetJobId = explicitJobId;
  let fallbackFiscalDevice: string | null = null;

  if (orderId) {
    if (!isUuid(orderId)) throw new HttpError(404, 'Nie znaleziono zamówienia');
    const [ord] = await db
      .select()
      .from(orders)
      .where(companyId ? and(eq(orders.id, orderId), eq(orders.companyId, companyId)) : eq(orders.id, orderId))
      .limit(1);
    if (!ord) throw new HttpError(404, 'Nie znaleziono zamówienia');

    // For a known order only its own print job may be printed (ignore any client-supplied jobId)
    targetJobId = ord.fiscalJobId || undefined;
    fallbackFiscalDevice = ord.fiscalDeviceId;

    // Not fiscalized yet, or marked as issued although the device returned nothing:
    // fiscalize (again) with autoPrint — the printout comes straight from the register.
    // 'PAR_<number>' is our own placeholder — it means the device never sent a receipt number
    const placeholderNumber = !ord.fiscalReceiptNumber || ord.fiscalReceiptNumber === `PAR_${ord.orderNumber}`;
    const nothingRecorded = placeholderNumber && !ord.fiscalJobId && !ord.fiscalQrCode && !ord.fiscalPdfUrl;
    if (!targetJobId && (ord.fiscalStatus !== 'issued' || nothingRecorded)) {
      const res = await fiscalizeOrder({ orderId, autoPrint: true, terminalId, companyId, repair: nothingRecorded });
      if (!res.success) throw new HttpError(409, res.error || 'Fiskalizacja w toku — spróbuj za chwilę');
      return { success: true, displayId: res.displayId || 'SBR', jobId: res.jobId || undefined };
    }

    if (!targetJobId) {
      throw new HttpError(
        409,
        `Paragon #${ord.fiscalReceiptNumber || ord.orderNumber} został zafiskalizowany na urządzeniu ${ord.fiscalDeviceId || '—'}, ale urządzenie nie zwróciło zadania druku (jobId) — wydruk papierowy nie jest dostępny dla tego paragonu.`
      );
    }
  } else if (targetJobId && companyId) {
    // A bare jobId must belong to this company
    const [rec] = await db
      .select({ orderId: fiscalReceipts.orderId })
      .from(fiscalReceipts)
      .where(and(eq(fiscalReceipts.jobId, targetJobId), eq(fiscalReceipts.companyId, companyId)))
      .limit(1);
    if (!rec) throw new HttpError(404, 'Nie znaleziono zadania druku');
  }

  if (!targetJobId) {
    throw new HttpError(400, 'Brak numeru zadania druku (jobId) do wydrukowania paragonu.');
  }

  const printerDisplayId = await resolvePrinterDisplayId(companyId, terminalId, explicitPrinter, fallbackFiscalDevice);

  console.log(`[Fiscal Service] Printing job ${targetJobId} on thermal printer ${printerDisplayId}...`);
  await rycosRpc.call(printerDisplayId, `/printer/jobs/print/${encodeURIComponent(targetJobId)}`, 'POST', {}, 15000);

  if (orderId) {
    await db.update(fiscalReceipts).set({ printedAt: new Date() }).where(eq(fiscalReceipts.orderId, orderId));
  }

  return { success: true, displayId: printerDisplayId, jobId: targetJobId };
}
