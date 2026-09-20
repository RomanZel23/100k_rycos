import type { RycosFiscalPayload } from '../schemas/fiscal.js';

/**
 * Single source of truth for building a RYCOS /fiscal/issue payload.
 * Used by both the API (synchronous POS fiscalization) and the worker (async outbox).
 *
 * Invariant: sum(priceItem * qty) === sum(order_items.unit_price * quantity) (in grosze),
 * so the receipt always matches what was actually charged for goods (tips are not fiscalized).
 */

export interface FiscalSourceOrder {
  id: string;
  currency?: string | null;
  customerNip?: string | null;
  paymentMethod?: string | null;
}

export interface FiscalSourceItem {
  name: string;
  unitPrice: string | number;
  quantity: number;
  ptuCode?: string | null;
  taxRate?: number | null;
  addons?: Array<{ name?: string; priceDelta?: number | string }> | null;
}

const PAYMENT_METHOD_MAP: Record<string, RycosFiscalPayload['payment'][number]['paymentMethod']> = {
  cash: 'Cash',
  card: 'Card',
  terminal_tap: 'Card',
  google_pay: 'Mobile',
  apple_pay: 'Mobile',
  blik: 'Transfer',
  online: 'Transfer',
};

export function mapFiscalPaymentMethod(method?: string | null): RycosFiscalPayload['payment'][number]['paymentMethod'] {
  if (!method) return 'Cash';
  return PAYMENT_METHOD_MAP[method.toLowerCase()] || 'Transfer';
}

export function taxRateToPtuCode(taxRate?: number | null): string {
  if (taxRate === 23) return 'a';
  if (taxRate === 8) return 'b';
  if (taxRate === 5) return 'c';
  if (taxRate === 0) return 'd';
  return 'a';
}

export function toGrosze(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Stable per-order reference so the fiscal device can de-duplicate retries.
 *
 * LENGTH MATTERS: the register answers
 *   "id paragonu nadany przez klienta: dlugosc poza dozwolonym zakresem"
 * for anything outside its allowed range. Every reference it has accepted so far was
 * exactly 20 characters ("REQ-50-1789799914919"), so this one is 20 as well:
 * "ORD-" + 16 hex digits of the order UUID — stable per order, unique across orders.
 */
export const FISCAL_EXTERNAL_REF_LENGTH = 20;

export function fiscalExternalRef(orderId: string): string {
  const hex = orderId.replace(/[^0-9a-fA-F]/g, '').toUpperCase().padEnd(16, '0').substring(0, 16);
  return `ORD-${hex}`;
}

export function buildFiscalPayload(
  order: FiscalSourceOrder,
  items: FiscalSourceItem[],
  opts: { autoPrint?: boolean } = {}
): { payload: RycosFiscalPayload; totalGrosze: number } {
  const currency = (order.currency || 'PLN').toUpperCase();
  const lines: RycosFiscalPayload['items'] = [];

  for (const item of items) {
    const ptu = (item.ptuCode || taxRateToPtuCode(item.taxRate)) as RycosFiscalPayload['items'][number]['ptuCode'];
    const unitGrosze = toGrosze(item.unitPrice);
    const qty = item.quantity;
    const addons = Array.isArray(item.addons) ? item.addons : [];
    const deltas = addons.map((a) => ({ name: String(a?.name || 'Dodatek'), grosze: toGrosze(a?.priceDelta as any) }));
    const hasNegative = deltas.some((d) => d.grosze < 0);
    const addonsTotal = deltas.reduce((s, d) => s + d.grosze, 0);
    const baseGrosze = unitGrosze - addonsTotal;

    if (hasNegative || baseGrosze <= 0) {
      // Cannot split cleanly: one line with the full effective unit price
      if (unitGrosze > 0) {
        lines.push({ nameItem: String(item.name).substring(0, 40), ptuCode: ptu, priceItem: unitGrosze, qty, typeItem: 'GENERAL', units: 'szt' });
      }
      continue;
    }

    lines.push({ nameItem: String(item.name).substring(0, 40), ptuCode: ptu, priceItem: baseGrosze, qty, typeItem: 'GENERAL', units: 'szt' });
    for (const d of deltas) {
      if (d.grosze <= 0) continue;
      lines.push({ nameItem: `+ ${d.name}`.substring(0, 40), ptuCode: ptu, priceItem: d.grosze, qty, typeItem: 'GENERAL', units: 'szt' });
    }
  }

  const totalGrosze = lines.reduce((sum, l) => sum + l.priceItem * l.qty, 0);

  const payload: RycosFiscalPayload = {
    header: {
      externalrefFR: fiscalExternalRef(order.id),
      currency,
      customerNIP: order.customerNip || undefined,
    },
    items: lines,
    payment: [
      {
        paymentMethod: mapFiscalPaymentMethod(order.paymentMethod),
        amount: totalGrosze,
        currency,
      },
    ],
    output: {
      autoPrint: opts.autoPrint === true,
      showQrScreen: false,
      returnQrCodeBase64: true,
    },
  };

  return { payload, totalGrosze };
}

/** Short, log/DB-safe representation of any device response. */
export function summarizeFiscalResponse(result: any, maxLen = 1200): string {
  if (result === undefined) return '(brak pola result w odpowiedzi urządzenia)';
  if (result === null) return 'null';
  if (typeof result === 'string') return result.substring(0, maxLen);
  try {
    return JSON.stringify(result).substring(0, maxLen);
  } catch {
    return String(result).substring(0, maxLen);
  }
}

export interface ParsedFiscalResult {
  receiptNumber: string;
  jpkId: string;
  pdfUrl: string | null;
  qrCodeBase64: string | null;
  jobId: string | null;
  /** The device actually returned receipt data (number / JPK id / QR / PDF / print job). */
  hasReceipt: boolean;
  /** Error reported by the device inside a 2xx envelope, if any. */
  deviceError: string | null;
}

/**
 * Normalizes the RYCOS /fiscal/issue response into the fields we persist.
 *
 * IMPORTANT: a 2xx envelope does not by itself mean a receipt was issued — some devices
 * answer 200 with an empty body or with an error object. `hasReceipt` tells the caller
 * whether anything provable came back; without it the order must NOT be marked as issued.
 */
export function parseFiscalResult(result: any, fallbackNumber: string | number): ParsedFiscalResult {
  const rawNumber = result?.receiptNumber || result?.number || result?.receipt_number || null;
  const jpkId = result?.jpkId || result?.jpk_id || '';
  const pdfUrl = (result?.pdfReceiptUrl || result?.pdfUrl || result?.pdf_url || null) as string | null;
  const qrCodeBase64 = (result?.qrCodeBase64 || result?.qrCode || result?.qrBase64 || result?.qr_code || null) as string | null;
  const jobId = (result?.jobId || result?.job_id || result?.printJob?.jobId || null) as string | null;

  // RYCOS reports a rejection as { created: false, error: { code, message }, errorDescription }
  const rawError =
    result?.error ??
    result?.errorMessage ??
    result?.errorDescription ??
    result?.errorCondition ??
    result?.errorCode ??
    result?.remark ??
    null;

  const errText =
    rawError && typeof rawError === 'object'
      ? `${rawError.code ? `[${rawError.code}] ` : ''}${rawError.message || JSON.stringify(rawError)}`
      : rawError ||
        (result?.created === false ? 'Urządzenie nie wystawiło paragonu (created = false)' : null) ||
        (result?.success === false ? 'Urządzenie zwróciło success = false' : null) ||
        null;

  return {
    receiptNumber: String(rawNumber || `PAR_${fallbackNumber}`),
    jpkId: String(jpkId),
    pdfUrl,
    qrCodeBase64,
    jobId,
    hasReceipt: result?.created !== false && result?.success !== false && Boolean(rawNumber || jpkId || pdfUrl || qrCodeBase64 || jobId),
    deviceError: errText ? String(errText).substring(0, 500) : null,
  };
}

/**
 * The fiscal device rejects a second receipt with the same externalrefFR.
 * Such a rejection on a retry means the receipt WAS issued by an earlier attempt
 * (e.g. the first response was lost to a timeout) — it must not be treated as a failure.
 */
export function isDuplicateFiscalRefError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /duplicat|duplikat|already\s+(exists|issued|used)|ju[żz]\s+(istnieje|wystawion)|externalref/i.test(message);
}
