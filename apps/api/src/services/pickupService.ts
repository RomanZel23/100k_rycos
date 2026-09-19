import { getDatabase, orders, orderItems, eq, and, desc, inArray, sql } from '@rycos/database';
import { HttpError } from '../lib/response.js';
import { rateLimit, resetRateLimit } from '../lib/rateLimit.js';
import { isUuid } from '../lib/ids.js';
import { updateOrderStatus } from './orderEngine.js';
import { broadcastToOrder } from '../plugins/websocket.js';

type OrderRow = typeof orders.$inferSelect;

const MAX_PIN_ATTEMPTS = 5; // per order, per 10 minutes
const PIN_WINDOW_S = 600;
const HANDOVER_STATUSES = ['ready_to_collect', 'in_progress', 'paid'];

export interface PickupInput {
  companyId: number;
  orderId?: string;
  orderNumber?: number | string;
  pin?: string;
  qrData?: string;
  /** Who is scanning (terminal id / user id) — used for rate limiting. */
  actorKey: string;
}

function parseQr(input: PickupInput): { orderId?: string; orderNumber?: number; pin?: string } {
  let { orderId, pin } = input;
  let orderNumber = input.orderNumber !== undefined && input.orderNumber !== '' ? Number(input.orderNumber) : undefined;

  if (input.qrData && typeof input.qrData === 'string') {
    const raw = input.qrData.trim();
    if (raw.startsWith('rycos:pickup:')) {
      orderId = raw.replace('rycos:pickup:', '').trim();
    } else if (raw.includes(':')) {
      const parts = raw.split(':');
      if (parts[0].length > 10) orderId = parts[0];
      else orderNumber = parseInt(parts[0], 10);
      if (parts[1]) pin = parts[1];
    } else if (isUuid(raw)) {
      orderId = raw;
    } else {
      pin = raw;
    }
  }
  if (orderId && !isUuid(orderId)) throw new HttpError(404, 'Nie znaleziono zamówienia (nieprawidłowy kod)');
  if (orderNumber !== undefined && (!Number.isFinite(orderNumber) || orderNumber <= 0)) orderNumber = undefined;
  return { orderId, orderNumber, pin: pin ? String(pin).trim() : undefined };
}

async function findOrder(companyId: number, orderId?: string, orderNumber?: number): Promise<OrderRow | undefined> {
  const db = getDatabase();
  if (orderId) {
    const [o] = await db.select().from(orders).where(and(eq(orders.companyId, companyId), eq(orders.id, orderId))).limit(1);
    return o;
  }
  if (orderNumber) {
    const [o] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.companyId, companyId), eq(orders.orderNumber, orderNumber), sql`${orders.orderType} <> 'test'`))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    return o;
  }
  return undefined;
}

function assertHandoverable(o: OrderRow) {
  if (o.status === 'completed') {
    const t = o.updatedAt ? new Date(o.updatedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '';
    throw new HttpError(400, `⚠️ Zamówienie #${o.orderNumber} zostało już wcześniej odebrane / wydane${t ? ` o godz. ${t}` : ''}!`, { alreadyCompleted: true });
  }
  if (o.status === 'cancelled') {
    throw new HttpError(400, `⚠️ Zamówienie #${o.orderNumber} zostało anulowane i nie może zostać wydane!`, { cancelled: true });
  }
  if (o.paymentStatus !== 'paid' && o.paymentStatus !== 'confirmed') {
    throw new HttpError(400, `⚠️ Zamówienie #${o.orderNumber} nie zostało jeszcze opłacone!`, { unpaid: true });
  }
}

async function checkPin(o: OrderRow, pin: string) {
  const key = `pin:${o.id}`;
  if (!(await rateLimit(key, MAX_PIN_ATTEMPTS, PIN_WINDOW_S))) {
    throw new HttpError(429, `Zbyt wiele błędnych prób PIN dla zamówienia #${o.orderNumber}. Zeskanuj kod QR klienta lub odczekaj 10 minut.`);
  }
  if (o.collectionPin !== pin) {
    throw new HttpError(400, `Błędny PIN dla zamówienia #${o.orderNumber}`);
  }
  await resetRateLimit(key);
}

/** Verify PIN (or QR "orderRef:PIN") and hand the order over. */
export async function verifyPinAndComplete(input: PickupInput) {
  const { orderId, orderNumber, pin } = parseQr(input);
  if (!pin) throw new HttpError(400, 'Wprowadź 4-cyfrowy PIN lub zeskanuj kod QR');

  let target = await findOrder(input.companyId, orderId, orderNumber);

  if (!target && !orderId && !orderNumber) {
    // PIN-only lookup: throttled per scanner and refused when ambiguous
    if (!(await rateLimit(`pinscan:${input.companyId}:${input.actorKey}`, 30, 60))) {
      throw new HttpError(429, 'Zbyt wiele prób. Podaj numer zamówienia lub zeskanuj kod QR.');
    }
    const db = getDatabase();
    const candidates = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.companyId, input.companyId),
          inArray(orders.status, HANDOVER_STATUSES),
          eq(orders.collectionPin, pin),
          sql`${orders.createdAt} > now() - interval '24 hours'`
        )
      )
      .orderBy(desc(orders.createdAt))
      .limit(2);
    if (candidates.length > 1) {
      throw new HttpError(409, 'Ten PIN pasuje do więcej niż jednego aktywnego zamówienia — podaj numer zamówienia lub zeskanuj kod QR.', { ambiguous: true });
    }
    target = candidates[0];
    if (!target) throw new HttpError(404, 'Nie znaleziono zamówienia pasującego do podanego PIN-u');
  }

  if (!target) throw new HttpError(404, 'Nie znaleziono zamówienia pasującego do podanego PIN-u');
  await checkPin(target, pin);
  assertHandoverable(target);

  const updated = await updateOrderStatus(target.id, 'completed', { companyId: input.companyId, actor: input.actorKey, reason: 'pickup_pin' });
  return { order: updated, message: `Zamówienie #${target.orderNumber} zostało pomyślnie wydane!` };
}

/** Staff scanned the customer's QR: push the PIN to the customer's phone and return items for checking. */
export async function pickupChallenge(input: PickupInput) {
  const { orderId, orderNumber } = parseQr(input);
  const target = await findOrder(input.companyId, orderId, orderNumber);
  if (!target) throw new HttpError(404, 'Nie znaleziono zamówienia do wydania');
  assertHandoverable(target);

  const db = getDatabase();
  const items = await db
    .select({
      id: orderItems.id,
      name: orderItems.name,
      quantity: orderItems.quantity,
      addons: orderItems.addonsJson,
      specialInstructions: orderItems.specialInstructions,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, target.id));

  await broadcastToOrder(target.id, {
    type: 'pickup.challenge',
    orderId: target.id,
    orderNumber: target.orderNumber,
    pin: target.collectionPin,
    timestamp: new Date().toISOString(),
  });

  return {
    challengeActive: true,
    order: {
      id: target.id,
      orderNumber: target.orderNumber,
      orderType: target.orderType,
      tableLabel: target.tableLabel,
      parkingSpot: target.parkingSpot,
      totalAmount: target.totalAmount,
      currency: target.currency,
      status: target.status,
      customerNote: target.customerNote,
      items,
    },
  };
}

/** Staff typed the PIN shown on the customer's phone: finalize handover. */
export async function pickupConfirm(input: PickupInput) {
  if (!input.orderId || !input.pin) throw new HttpError(400, 'orderId oraz pin są wymagane do potwierdzenia odbioru');
  if (!isUuid(input.orderId)) throw new HttpError(404, 'Nie znaleziono zamówienia');
  const target = await findOrder(input.companyId, input.orderId);
  if (!target) throw new HttpError(404, 'Nie znaleziono zamówienia');

  await checkPin(target, String(input.pin).trim());
  assertHandoverable(target);

  const updated = await updateOrderStatus(target.id, 'completed', { companyId: input.companyId, actor: input.actorKey, reason: 'pickup_challenge' });
  return { order: updated, message: `Zamówienie #${target.orderNumber} zostało pomyślnie wydane!` };
}
