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

/** Stable per-order reference so the fiscal device can de-duplicate retries. */
export function fiscalExternalRef(orderId: string): string {
  return `ORD-${orderId.replace(/-/g, '')}`.substring(0, 40);
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

/** Normalizes the RYCOS /fiscal/issue response into the fields we persist. */
export function parseFiscalResult(result: any, fallbackNumber: string | number) {
  return {
    receiptNumber: String(result?.receiptNumber || result?.number || `PAR_${fallbackNumber}`),
    jpkId: String(result?.jpkId || ''),
    pdfUrl: (result?.pdfReceiptUrl || result?.pdfUrl || null) as string | null,
    qrCodeBase64: (result?.qrCodeBase64 || result?.qrCode || result?.qrBase64 || null) as string | null,
    jobId: (result?.jobId || result?.printJob?.jobId || null) as string | null,
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
