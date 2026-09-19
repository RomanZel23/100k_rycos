import { sql, eq, and } from 'drizzle-orm';
import { getDatabase } from './client.js';
import { orders, orderItems } from './schema/orders.js';
import { fiscalReceipts, fiscalDevices } from './schema/fiscal.js';
import { terminals } from './schema/companies.js';

/**
 * Atomic fiscalization claim shared by the API (synchronous POS path) and the worker (outbox path).
 *
 * Exactly one caller can move an order into fiscal_status='pending'. A claim older than
 * `staleSeconds` is considered abandoned (process crash) and may be re-claimed.
 * Only paid, non-cancelled orders can be claimed.
 */
export async function claimOrderFiscalization(orderId: string, staleSeconds = 120) {
  const db = getDatabase();
  const rows = await db
    .update(orders)
    .set({
      fiscalStatus: 'pending',
      fiscalClaimedAt: new Date(),
      fiscalAttempts: sql`${orders.fiscalAttempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      sql`${orders.id} = ${orderId}
        AND ${orders.paymentStatus} IN ('paid', 'confirmed')
        AND ${orders.status} <> 'cancelled'
        AND (
          ${orders.fiscalStatus} IN ('none', 'failed')
          OR (${orders.fiscalStatus} = 'pending' AND (${orders.fiscalClaimedAt} IS NULL OR ${orders.fiscalClaimedAt} < now() - make_interval(secs => ${staleSeconds})))
        )`
    )
    .returning();

  const order = rows[0];
  if (!order) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return { order, items };
}

export interface FiscalCompletion {
  orderId: string;
  companyId: number;
  displayId: string;
  requestId: string;
  receiptNumber: string;
  jpkId: string;
  jobId: string | null;
  pdfUrl: string | null;
  qrCodeBase64: string | null;
  grossAmountGrosze: number;
  currency: string;
  customerNip: string | null;
  rawResult: any;
}

export async function completeOrderFiscalization(c: FiscalCompletion) {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx
      .insert(fiscalReceipts)
      .values({
        orderId: c.orderId,
        companyId: c.companyId,
        displayId: c.displayId,
        requestId: c.requestId,
        receiptNumber: c.receiptNumber,
        jpkId: c.jpkId,
        jobId: c.jobId,
        grossAmountGrosze: c.grossAmountGrosze,
        currency: c.currency,
        customerNip: c.customerNip,
        pdfReceiptUrl: c.pdfUrl,
        rawResult: c.rawResult,
      })
      .onConflictDoUpdate({
        target: fiscalReceipts.orderId,
        set: {
          receiptNumber: c.receiptNumber,
          jpkId: c.jpkId,
          jobId: c.jobId,
          pdfReceiptUrl: c.pdfUrl,
          rawResult: c.rawResult,
        },
      });

    await tx
      .update(orders)
      .set({
        fiscalStatus: 'issued',
        fiscalDeviceId: c.displayId,
        fiscalReceiptNumber: c.receiptNumber,
        fiscalPdfUrl: c.pdfUrl,
        fiscalJobId: c.jobId,
        fiscalQrCode: c.qrCodeBase64,
        fiscalError: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, c.orderId));
  });
}

export async function failOrderFiscalization(orderId: string, message: string) {
  const db = getDatabase();
  await db
    .update(orders)
    .set({ fiscalStatus: 'failed', fiscalError: String(message).substring(0, 2000), updatedAt: new Date() })
    .where(sql`${orders.id} = ${orderId} AND ${orders.fiscalStatus} = 'pending'`);
}

/**
 * Resolve the fiscal device for an order — identical rules for API and worker:
 * 1. terminal's configured fiscal device (or the terminal itself if it is an SBR/SBT device)
 * 2. company primary fiscal device
 * 3. any active company fiscal device
 * 4. fallback (env default)
 */
export async function resolveFiscalDisplayId(companyId: number, orderTerminalId: string | null | undefined, fallback: string): Promise<string> {
  const db = getDatabase();

  if (orderTerminalId) {
    const cleanTerm = orderTerminalId.trim().toUpperCase();
    const [term] = await db
      .select()
      .from(terminals)
      .where(and(eq(terminals.terminalId, cleanTerm), eq(terminals.companyId, companyId)))
      .limit(1);

    if (term) {
      if (term.fiscalDeviceId && term.fiscalDeviceId !== 'self' && term.fiscalDeviceId.trim() !== '') {
        return term.fiscalDeviceId.trim();
      }
      if (term.terminalId.startsWith('SBR-') || term.terminalId.startsWith('SBT-')) {
        return term.terminalId;
      }
    }
  }

  const [primaryDevice] = await db
    .select()
    .from(fiscalDevices)
    .where(and(eq(fiscalDevices.companyId, companyId), eq(fiscalDevices.isPrimary, true)))
    .limit(1);
  if (primaryDevice?.deviceId) return primaryDevice.deviceId;

  const [anyDevice] = await db
    .select()
    .from(fiscalDevices)
    .where(and(eq(fiscalDevices.companyId, companyId), eq(fiscalDevices.status, 'active')))
    .limit(1);
  if (anyDevice?.deviceId) return anyDevice.deviceId;

  return fallback;
}

/**
 * The device rejected the request as a duplicate reference: the receipt was already issued by an
 * earlier attempt whose response was lost. Mark as issued (without receipt details) and stop retrying.
 */
export async function markFiscalIssuedByDuplicate(orderId: string, deviceMessage: string, displayId: string) {
  const db = getDatabase();
  await db
    .update(orders)
    .set({
      fiscalStatus: 'issued',
      fiscalDeviceId: displayId,
      fiscalError: `duplicate_ref: paragon wystawiony we wcześniejszej próbie (brak danych paragonu w systemie). ${String(deviceMessage).substring(0, 1500)}`,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));
}
