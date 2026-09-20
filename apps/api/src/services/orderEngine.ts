import { randomInt } from 'crypto';
import {
  getDatabase,
  orders,
  orderItems,
  orderEvents,
  outboxEvents,
  idempotencyKeys,
  products,
  brands,
  companies,
  brandProducts,
  addonOptions,
  addonGroups,
  productAddonGroups,
  productAddonOptionPrices,
  inventoryHistory,
  companySettings,
  eq,
  and,
  inArray,
  sql,
} from '@rycos/database';
import { CreateOrderRequest, OrderDetail, OrderStatus, canTransitionOrder } from '@rycos/shared';
import { broadcastToStaff, broadcastToOrder } from '../plugins/websocket.js';
import { HttpError } from '../lib/response.js';
import { isUuid, toGrosze, fromGrosze } from '../lib/ids.js';
import { invalidateBrandMenuCache } from './catalogService.js';

/** Set inside transactions when a product's availability flips; menu cache is invalidated after commit. */
let menuAvailabilityDirty = false;
function flushMenuCache() {
  if (!menuAvailabilityDirty) return;
  menuAvailabilityDirty = false;
  invalidateBrandMenuCache().catch(() => {});
}

type Db = ReturnType<typeof getDatabase>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type OrderRow = typeof orders.$inferSelect;

export interface OrderPrincipal {
  company_id: number;
  role?: string;
  terminal_id?: string;
  [key: string]: unknown;
}

const ACTIVE_PIN_STATUSES = ['pending_payment', 'paid', 'in_progress', 'ready_to_collect'];
const PAID_STATUSES = ['paid', 'confirmed'];

function isPaid(paymentStatus: string | null | undefined): boolean {
  return PAID_STATUSES.includes(String(paymentStatus));
}

// ---------------------------------------------------------------------------
// Create order
// ---------------------------------------------------------------------------

interface VerifiedAddon {
  optionId: number;
  name: string;
  priceDelta: number;
  groupId: number;
}

interface VerifiedItem {
  productId: number;
  name: string;
  quantity: number;
  unitGrosze: number;
  lineGrosze: number;
  taxRate: number;
  ptuCode: string;
  addons: VerifiedAddon[];
  specialInstructions?: string;
}

export async function createOrder(
  input: CreateOrderRequest,
  idempotencyKeyHeader?: string,
  principal?: OrderPrincipal | null
): Promise<{ order: OrderDetail; isDuplicate: boolean }> {
  const db = getDatabase();
  const rawIdempKey = (idempotencyKeyHeader || input.idempotencyKey || '').trim();
  if (rawIdempKey && rawIdempKey.length > 100) {
    throw new HttpError(400, 'Idempotency-Key is too long');
  }

  // 1. Brand + company (must be active and accepting orders)
  const [brandRow] = await db
    .select({ brand: brands, company: companies })
    .from(brands)
    .innerJoin(companies, eq(brands.companyId, companies.id))
    .where(eq(brands.id, input.brandId))
    .limit(1);

  if (!brandRow) throw new HttpError(404, `Brand with ID ${input.brandId} not found`);
  const { brand, company } = brandRow;
  const companyId = brand.companyId;

  if (!brand.isActive) throw new HttpError(409, 'Ta marka nie przyjmuje obecnie zamówień');
  if (!company.isAcceptingOrders) throw new HttpError(409, 'Lokal nie przyjmuje obecnie zamówień');

  const isStaff = !!principal && principal.company_id === companyId;
  if (principal && principal.company_id !== companyId && principal.role !== 'platform_admin') {
    throw new HttpError(403, 'Stanowisko nie należy do firmy tej marki');
  }

  // Payment method policy
  if (input.paymentMethod === 'terminal_tap' && !isStaff) {
    throw new HttpError(403, 'Płatność terminalem dostępna tylko na stanowisku POS');
  }
  if (input.paymentMethod === 'cash' && !isStaff && !brand.allowPayAtCounter) {
    throw new HttpError(400, 'Płatność przy kasie nie jest dostępna dla tej marki');
  }

  const idempKey = rawIdempKey ? `order:${brand.id}:${rawIdempKey}` : '';

  // Fast path: already processed idempotent request
  if (idempKey) {
    const [existing] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, idempKey)).limit(1);
    if (existing && existing.expiresAt > new Date() && (existing.responseBody as any)?.id) {
      return { order: existing.responseBody as OrderDetail, isDuplicate: true };
    }
  }

  // 2. Products — must belong to the company AND be assigned to this brand
  const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
  const dbProducts = await db
    .select({ product: products })
    .from(products)
    .innerJoin(brandProducts, and(eq(brandProducts.productId, products.id), eq(brandProducts.brandId, brand.id)))
    .where(and(eq(products.companyId, companyId), inArray(products.id, productIds)));
  const productMap = new Map(dbProducts.map((r) => [r.product.id, r.product]));

  // 3. Addons — resolved from DB (client names/prices are ignored)
  const optionIds = Array.from(new Set(input.items.flatMap((i) => i.addons.map((a) => a.optionId))));
  const optionRows = optionIds.length
    ? await db
        .select({ option: addonOptions, group: addonGroups })
        .from(addonOptions)
        .innerJoin(addonGroups, eq(addonOptions.groupId, addonGroups.id))
        .where(and(inArray(addonOptions.id, optionIds), eq(addonGroups.companyId, companyId)))
    : [];
  const optionMap = new Map(optionRows.map((r) => [r.option.id, r]));

  // Per-product price overrides for add-on options (admin: "Add-ons for <product>")
  const overrideRows = optionIds.length
    ? await db
        .select({ productId: productAddonOptionPrices.productId, optionId: productAddonOptionPrices.optionId, priceDelta: productAddonOptionPrices.priceDelta })
        .from(productAddonOptionPrices)
        .where(and(inArray(productAddonOptionPrices.productId, productIds), inArray(productAddonOptionPrices.optionId, optionIds)))
    : [];
  const overrideMap = new Map(overrideRows.map((r) => [`${r.productId}:${r.optionId}`, parseFloat(r.priceDelta)]));

  const productGroupRows = await db
    .select({ productId: productAddonGroups.productId, group: addonGroups })
    .from(productAddonGroups)
    .innerJoin(addonGroups, eq(productAddonGroups.groupId, addonGroups.id))
    .where(inArray(productAddonGroups.productId, productIds));
  const groupsByProduct = new Map<number, (typeof addonGroups.$inferSelect)[]>();
  for (const r of productGroupRows) {
    if (!groupsByProduct.has(r.productId)) groupsByProduct.set(r.productId, []);
    groupsByProduct.get(r.productId)!.push(r.group);
  }

  const verifiedItems: VerifiedItem[] = [];
  let subtotalGrosze = 0;

  for (const item of input.items) {
    const p = productMap.get(item.productId);
    if (!p) throw new HttpError(400, `Produkt ${item.productId} nie jest dostępny w menu tej marki`);
    if (!p.isAvailable) throw new HttpError(409, `Produkt "${p.name}" jest chwilowo niedostępny`);
    if (p.isAgeRestricted && !input.ageConsentAccepted) {
      throw new HttpError(400, `Wymagane potwierdzenie pełnoletności (18+) dla "${p.name}"`);
    }

    const productGroups = groupsByProduct.get(p.id) || [];
    const allowedGroupIds = new Set(productGroups.map((g) => g.id));
    const seen = new Set<number>();
    const addons: VerifiedAddon[] = [];

    for (const a of item.addons) {
      if (seen.has(a.optionId)) throw new HttpError(400, `Zduplikowany dodatek w pozycji "${p.name}"`);
      seen.add(a.optionId);
      const row = optionMap.get(a.optionId);
      if (!row || !allowedGroupIds.has(row.group.id)) {
        throw new HttpError(400, `Dodatek ${a.optionId} nie jest dostępny dla "${p.name}"`);
      }
      if (!row.option.isAvailable) throw new HttpError(409, `Dodatek "${row.option.name}" jest niedostępny`);
      if (row.option.stockQuantity !== null && row.option.stockQuantity !== undefined && row.option.stockQuantity < item.quantity) {
        throw new HttpError(409, `Brak wystarczającej ilości dodatku "${row.option.name}" (dostępne: ${Math.max(0, row.option.stockQuantity)})`);
      }
      const priceDelta = overrideMap.get(`${p.id}:${row.option.id}`) ?? parseFloat(row.option.priceDelta);
      addons.push({ optionId: row.option.id, name: row.option.name, priceDelta, groupId: row.group.id });
    }

    // Group selection rules
    for (const g of productGroups) {
      const count = addons.filter((x) => x.groupId === g.id).length;
      const min = Math.max(g.required ? 1 : 0, g.minSelect || 0);
      const multi = String(g.selectionMode).startsWith('multi');
      // maxSelect 0 (or empty in the panel) means "no upper limit" for a multi group
      const max = multi ? (g.maxSelect > 0 ? Math.max(g.maxSelect, min) : Number.MAX_SAFE_INTEGER) : 1;
      if (count < min) throw new HttpError(400, `Wybierz wymagany dodatek "${g.name}" dla "${p.name}"`);
      if (count > max) throw new HttpError(400, `Za dużo opcji w grupie "${g.name}" dla "${p.name}" (max ${max})`);
    }

    const unitGrosze = toGrosze(p.price) + addons.reduce((s, x) => s + toGrosze(x.priceDelta), 0);
    if (unitGrosze < 0) throw new HttpError(400, `Nieprawidłowa cena pozycji "${p.name}"`);
    const lineGrosze = unitGrosze * item.quantity;
    subtotalGrosze += lineGrosze;

    verifiedItems.push({
      productId: p.id,
      name: p.name,
      quantity: item.quantity,
      unitGrosze,
      lineGrosze,
      taxRate: p.taxRate,
      ptuCode: p.ptuCode,
      addons,
      specialInstructions: item.specialInstructions,
    });
  }

  const tipGrosze = toGrosze(input.tipAmount || 0);
  const totalGrosze = subtotalGrosze + tipGrosze;
  if (totalGrosze <= 0) throw new HttpError(400, 'Kwota zamówienia musi być większa od zera');

  // Quantity per product (stock)
  const qtyByProduct = new Map<number, number>();
  for (const it of verifiedItems) qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + it.quantity);

  const isZeroPrep =
    verifiedItems.length > 0 &&
    !verifiedItems.some((it) => {
      const pt = productMap.get(it.productId)?.prepTimeMinutes;
      return pt !== null && pt !== undefined && pt > 0;
    });

  let initialStatus: OrderStatus = input.paymentMethod === 'cash' ? 'in_progress' : 'pending_payment';
  if (input.paymentMethod === 'cash' && isZeroPrep) initialStatus = 'ready_to_collect';

  const collectionPin = await generateCollectionPin(db, companyId);

  class DuplicateRequest extends Error {}

  let orderDetail: OrderDetail;
  try {
    orderDetail = await db.transaction(async (tx) => {
      // Idempotency reservation — concurrent duplicates block here until the first commits
      if (idempKey) {
        await tx.delete(idempotencyKeys).where(and(eq(idempotencyKeys.key, idempKey), sql`${idempotencyKeys.expiresAt} < now()`));
        const reserved = await tx
          .insert(idempotencyKeys)
          .values({ key: idempKey, statusCode: 202, responseBody: {}, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) })
          .onConflictDoNothing()
          .returning({ key: idempotencyKeys.key });
        if (reserved.length === 0) throw new DuplicateRequest();
      }

      // Atomic per-company order number
      const seq: any = await tx.execute(sql`
        INSERT INTO order_counters (company_id, last_number)
        SELECT ${companyId}, COALESCE(MAX(order_number), 0) + 1 FROM orders WHERE company_id = ${companyId} AND order_type <> 'test'
        ON CONFLICT (company_id) DO UPDATE SET last_number = order_counters.last_number + 1, updated_at = now()
        RETURNING last_number
      `);
      const orderNumber = Number(seq[0]?.last_number);

      const [newOrder] = await tx
        .insert(orders)
        .values({
          companyId,
          brandId: brand.id,
          orderNumber,
          collectionPin,
          status: initialStatus,
          orderType: input.orderType,
          tableLabel: input.tableLabel || null,
          parkingSpot: input.parkingSpot || null,
          customerNip: input.customerNip || null,
          customerNote: input.customerNote || null,
          subtotalAmount: fromGrosze(subtotalGrosze),
          tipAmount: fromGrosze(tipGrosze),
          totalAmount: fromGrosze(totalGrosze),
          currency: (input.currency || brand.currency || 'PLN').toUpperCase().slice(0, 4),
          paymentMethod: input.paymentMethod,
          paymentStatus: 'pending',
          fiscalStatus: 'none',
          terminalId: principal?.terminal_id || null,
        })
        .returning();

      await tx.insert(orderItems).values(
        verifiedItems.map((item) => ({
          orderId: newOrder.id,
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: fromGrosze(item.unitGrosze),
          taxRate: item.taxRate,
          ptuCode: item.ptuCode,
          lineTotal: fromGrosze(item.lineGrosze),
          addonsJson: item.addons.map((a) => ({ optionId: a.optionId, name: a.name, priceDelta: a.priceDelta })),
          specialInstructions: item.specialInstructions || null,
        }))
      );

      // Stock reservation (atomic, never below zero)
      await reserveStock(tx, companyId, newOrder.id, qtyByProduct, productMap);
      await reserveAddonStock(tx, verifiedItems);

      await tx.insert(orderEvents).values({
        orderId: newOrder.id,
        eventType: 'order.created',
        payload: { status: initialStatus, paymentMethod: input.paymentMethod, terminalId: principal?.terminal_id || null },
      });

      const detail = buildOrderDetail(newOrder, brand.name, verifiedItems.map((it) => ({
        productId: it.productId,
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.unitGrosze / 100,
        taxRate: it.taxRate,
        ptuCode: it.ptuCode,
        addons: it.addons.map((a) => ({ optionId: a.optionId, name: a.name, priceDelta: a.priceDelta })),
        specialInstructions: it.specialInstructions,
        lineTotal: it.lineGrosze / 100,
      })), true);

      if (idempKey) {
        await tx.update(idempotencyKeys).set({ statusCode: 201, responseBody: detail }).where(eq(idempotencyKeys.key, idempKey));
      }

      return detail;
    });
  } catch (err) {
    if (err instanceof DuplicateRequest) {
      const [existing] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, idempKey)).limit(1);
      if (existing && (existing.responseBody as any)?.id) {
        return { order: existing.responseBody as OrderDetail, isDuplicate: true };
      }
      throw new HttpError(409, 'Zamówienie z tym kluczem jest właśnie przetwarzane');
    }
    throw err;
  }

  flushMenuCache();

  broadcastToStaff(companyId, {
    type: 'order.created',
    timestamp: new Date().toISOString(),
    companyId,
    brandId: brand.id,
    payload: orderDetail,
  });

  return { order: orderDetail, isDuplicate: false };
}

async function generateCollectionPin(db: Db, companyId: number): Promise<string> {
  // Avoid collisions with currently active orders of the company (best effort, 8 tries)
  let pin = String(randomInt(1000, 10000));
  for (let i = 0; i < 8; i++) {
    const [clash] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.companyId, companyId),
          eq(orders.collectionPin, pin),
          inArray(orders.status, ACTIVE_PIN_STATUSES),
          sql`${orders.createdAt} > now() - interval '24 hours'`
        )
      )
      .limit(1);
    if (!clash) return pin;
    pin = String(randomInt(1000, 10000));
  }
  return pin;
}

async function reserveStock(
  tx: Tx,
  companyId: number,
  orderId: string,
  qtyByProduct: Map<number, number>,
  productMap: Map<number, typeof products.$inferSelect>
) {
  for (const [productId, qty] of qtyByProduct) {
    const p = productMap.get(productId);
    if (!p || p.stockQuantity === null || p.stockQuantity === undefined) continue; // untracked stock

    const updated = await tx
      .update(products)
      .set({
        stockQuantity: sql`${products.stockQuantity} - ${qty}`,
        isAvailable: sql`CASE WHEN ${products.stockQuantity} - ${qty} <= 0 THEN false ELSE ${products.isAvailable} END`,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, productId), sql`${products.stockQuantity} IS NOT NULL`, sql`${products.stockQuantity} >= ${qty}`))
      .returning({ stockQuantity: products.stockQuantity, isAvailable: products.isAvailable });

    if (updated.length === 0) {
      // Stock may have become untracked concurrently — re-check
      const [cur] = await tx.select({ stockQuantity: products.stockQuantity }).from(products).where(eq(products.id, productId)).limit(1);
      if (cur && cur.stockQuantity === null) continue;
      throw new HttpError(409, `Brak wystarczającej ilości "${p.name}" (dostępne: ${Math.max(0, cur?.stockQuantity ?? 0)})`);
    }

    const after = updated[0];
    await tx.insert(inventoryHistory).values({
      companyId,
      productId,
      quantityChange: -qty,
      quantityAfter: after.stockQuantity,
      isAvailableAfter: after.isAvailable,
      source: 'order',
      reference: orderId,
    });
    if (!after.isAvailable && (after.stockQuantity ?? 0) <= 0) {
      menuAvailabilityDirty = true;
      await tx.insert(inventoryHistory).values({
        companyId,
        productId,
        quantityChange: 0,
        quantityAfter: after.stockQuantity,
        isAvailableAfter: false,
        source: 'auto_disable',
        reference: orderId,
        note: 'Produkt wyłączony automatycznie — stan 0',
      });
    }
  }
}

/** Return reserved stock of an order (cancel / payment timeout). Idempotent via orders.stock_released. */
/** Add-on options with a tracked stock are decremented together with the products. */
async function reserveAddonStock(tx: Tx, items: VerifiedItem[]) {
  const qtyByOption = new Map<number, number>();
  for (const it of items) {
    for (const a of it.addons) qtyByOption.set(a.optionId, (qtyByOption.get(a.optionId) || 0) + it.quantity);
  }

  for (const [optionId, qty] of qtyByOption) {
    const updated = await tx
      .update(addonOptions)
      .set({ stockQuantity: sql`${addonOptions.stockQuantity} - ${qty}` })
      .where(and(
        eq(addonOptions.id, optionId),
        sql`${addonOptions.stockQuantity} IS NOT NULL`,
        sql`${addonOptions.stockQuantity} >= ${qty}`
      ))
      .returning({ stockQuantity: addonOptions.stockQuantity });

    if (updated.length === 0) {
      const [cur] = await tx
        .select({ name: addonOptions.name, stockQuantity: addonOptions.stockQuantity })
        .from(addonOptions)
        .where(eq(addonOptions.id, optionId))
        .limit(1);
      if (!cur || cur.stockQuantity === null) continue; // untracked stock
      throw new HttpError(409, `Brak wystarczającej ilości dodatku "${cur.name}" (dostępne: ${Math.max(0, cur.stockQuantity ?? 0)})`);
    }
    if ((updated[0].stockQuantity ?? 0) <= 0) menuAvailabilityDirty = true;
  }
}

/** Give tracked add-on stock back when an order is cancelled. */
async function releaseAddonStock(tx: Tx, orderId: string) {
  const items = await tx
    .select({ quantity: orderItems.quantity, addonsJson: orderItems.addonsJson })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const qtyByOption = new Map<number, number>();
  for (const it of items) {
    const list = Array.isArray(it.addonsJson) ? (it.addonsJson as any[]) : [];
    for (const a of list) {
      const id = Number(a?.optionId);
      if (Number.isFinite(id)) qtyByOption.set(id, (qtyByOption.get(id) || 0) + it.quantity);
    }
  }

  for (const [optionId, qty] of qtyByOption) {
    const back = await tx
      .update(addonOptions)
      .set({ stockQuantity: sql`COALESCE(${addonOptions.stockQuantity}, 0) + ${qty}` })
      .where(and(eq(addonOptions.id, optionId), sql`${addonOptions.stockQuantity} IS NOT NULL`))
      .returning({ stockQuantity: addonOptions.stockQuantity });
    if (back.length) menuAvailabilityDirty = true;
  }
}

async function releaseStock(tx: Tx, order: OrderRow, reason: string) {
  if (order.stockReleased) return;
  await releaseAddonStock(tx, order.id);
  const released = await tx
    .select({ productId: inventoryHistory.productId, qty: sql<number>`-SUM(${inventoryHistory.quantityChange})::int` })
    .from(inventoryHistory)
    .where(and(eq(inventoryHistory.reference, order.id), eq(inventoryHistory.source, 'order')))
    .groupBy(inventoryHistory.productId);

  for (const r of released) {
    if (!r.qty || r.qty <= 0) continue;
    const [after] = await tx
      .update(products)
      .set({ stockQuantity: sql`COALESCE(${products.stockQuantity}, 0) + ${r.qty}`, updatedAt: new Date() })
      .where(and(eq(products.id, r.productId), sql`${products.stockQuantity} IS NOT NULL`))
      .returning({ stockQuantity: products.stockQuantity, isAvailable: products.isAvailable });
    if (after) {
      // Re-enable a product that was switched off automatically when it hit zero
      if (!after.isAvailable && (after.stockQuantity ?? 0) > 0) {
        const [last] = await tx
          .select({ source: inventoryHistory.source })
          .from(inventoryHistory)
          .where(and(eq(inventoryHistory.productId, r.productId), sql`${inventoryHistory.source} IN ('auto_disable', 'manual')`))
          .orderBy(sql`${inventoryHistory.id} DESC`)
          .limit(1);
        if (last?.source === 'auto_disable') {
          await tx.update(products).set({ isAvailable: true }).where(eq(products.id, r.productId));
          after.isAvailable = true;
          menuAvailabilityDirty = true;
        }
      }
      await tx.insert(inventoryHistory).values({
        companyId: order.companyId,
        productId: r.productId,
        quantityChange: r.qty,
        quantityAfter: after.stockQuantity,
        isAvailableAfter: after.isAvailable,
        source: 'order_release',
        reference: order.id,
        note: reason,
      });
    }
  }
  await tx.update(orders).set({ stockReleased: true }).where(eq(orders.id, order.id));
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function buildOrderDetail(o: OrderRow, brandName: string, items: OrderDetail['items'], showReceiptQr: boolean): OrderDetail {
  return {
    id: o.id,
    companyId: o.companyId,
    brandId: o.brandId,
    brandName,
    orderNumber: o.orderNumber,
    collectionPin: o.collectionPin,
    status: o.status as OrderStatus,
    orderType: o.orderType as any,
    tableLabel: o.tableLabel,
    parkingSpot: o.parkingSpot,
    customerNip: o.customerNip,
    items,
    subtotalAmount: parseFloat(o.subtotalAmount),
    tipAmount: parseFloat(o.tipAmount),
    totalAmount: parseFloat(o.totalAmount),
    currency: o.currency,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus as any,
    fiscalStatus: o.fiscalStatus as any,
    fiscalReceiptNumber: o.fiscalReceiptNumber,
    fiscalPdfUrl: o.fiscalPdfUrl,
    showReceiptQr,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/**
 * Check whether all items in an order have empty (null/undefined) or zero prep time.
 */
export async function isZeroPrepOrder(orderId: string, dbInstance?: any): Promise<boolean> {
  const db = dbInstance ? (dbInstance as Db) : getDatabase();
  const itemsWithProducts = await db
    .select({ prepTimeMinutes: products.prepTimeMinutes })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));

  if (!itemsWithProducts.length) return false;
  return !itemsWithProducts.some((it) => it.prepTimeMinutes !== null && it.prepTimeMinutes !== undefined && it.prepTimeMinutes > 0);
}

export async function getOrderById(orderId: string): Promise<OrderDetail | null> {
  if (!isUuid(orderId)) return null;
  const db = getDatabase();

  const [orderRow] = await db
    .select({ order: orders, brandName: brands.name })
    .from(orders)
    .leftJoin(brands, eq(orders.brandId, brands.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  let showReceiptQr = true;
  try {
    const [st] = await db
      .select({ isEnabled: companySettings.isEnabled })
      .from(companySettings)
      .where(and(eq(companySettings.companyId, orderRow.order.companyId), eq(companySettings.featureKey, 'show_receipt_qr')))
      .limit(1);
    if (st) showReceiptQr = st.isEnabled;
  } catch {}

  return buildOrderDetail(
    orderRow.order,
    orderRow.brandName || '',
    items.map((it) => ({
      productId: it.productId || 0,
      name: it.name,
      quantity: it.quantity,
      unitPrice: parseFloat(it.unitPrice),
      taxRate: it.taxRate,
      ptuCode: it.ptuCode,
      addons: it.addonsJson as any,
      specialInstructions: it.specialInstructions || undefined,
      lineTotal: parseFloat(it.lineTotal),
    })),
    showReceiptQr
  );
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export interface TransitionOptions {
  reason?: string;
  /** When set, the order must belong to this company (tenant isolation). */
  companyId?: number;
  actor?: string;
}

async function lockOrder(tx: Tx, orderId: string, companyId?: number): Promise<OrderRow> {
  if (!isUuid(orderId)) throw new HttpError(404, 'Nie znaleziono zamówienia');
  const [row] = await tx
    .select()
    .from(orders)
    .where(companyId ? and(eq(orders.id, orderId), eq(orders.companyId, companyId)) : eq(orders.id, orderId))
    .for('update')
    .limit(1);
  if (!row) throw new HttpError(404, 'Nie znaleziono zamówienia');
  return row;
}

function broadcastStatus(o: OrderRow) {
  const event = {
    type: 'order.status_updated' as const,
    timestamp: new Date().toISOString(),
    companyId: o.companyId,
    brandId: o.brandId,
    payload: {
      orderId: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      collectionPin: o.collectionPin,
    },
  };
  broadcastToStaff(o.companyId, event as any);
  broadcastToOrder(o.id, event as any);
}

/**
 * Validated lifecycle transition (kitchen / pickup / cancel).
 * - 'paid' can NOT be set here unless payment is already recorded (use markOrderPaid).
 * - 'completed' requires a recorded payment.
 * - 'cancelled' releases reserved stock; cancelling a paid order flags a refund.
 */
export async function updateOrderStatus(orderId: string, newStatus: OrderStatus, reasonOrOpts?: string | TransitionOptions): Promise<OrderDetail> {
  const opts: TransitionOptions = typeof reasonOrOpts === 'string' ? { reason: reasonOrOpts } : reasonOrOpts || {};
  const db = getDatabase();

  const updated = await db.transaction(async (tx) => {
    const current = await lockOrder(tx, orderId, opts.companyId);
    const from = current.status as OrderStatus;

    if (!canTransitionOrder(from, newStatus)) {
      throw new HttpError(409, `Niedozwolona zmiana statusu: ${from} → ${newStatus}`);
    }
    if (from === newStatus) return current;

    if (newStatus === 'paid' && !isPaid(current.paymentStatus)) {
      throw new HttpError(409, 'Zamówienie nie jest opłacone — zarejestruj płatność (POS / bramka), zamiast zmieniać status');
    }
    if (newStatus === 'completed' && !isPaid(current.paymentStatus)) {
      throw new HttpError(409, `Zamówienie #${current.orderNumber} nie zostało jeszcze opłacone`);
    }

    let effective: OrderStatus = newStatus;
    if ((newStatus === 'paid' || newStatus === 'in_progress') && (from === 'pending_payment' || from === 'paid')) {
      if (await isZeroPrepOrder(orderId, tx)) effective = 'ready_to_collect';
    }

    const set: Partial<typeof orders.$inferInsert> = { status: effective, updatedAt: new Date() };
    if (newStatus === 'payment_failed') set.paymentStatus = 'failed';
    if (newStatus === 'cancelled') set.cancellationReason = opts.reason || null;

    const [row] = await tx.update(orders).set(set).where(eq(orders.id, orderId)).returning();

    // payment_failed keeps the reservation (customer may retry); the payment timeout cancels it later.
    if (newStatus === 'cancelled') {
      await releaseStock(tx, row, opts.reason || newStatus);
    }

    await tx.insert(orderEvents).values({
      orderId,
      eventType: 'order.status_updated',
      payload: { from, newStatus: effective, requestedStatus: newStatus, reason: opts.reason, actor: opts.actor },
    });

    if (newStatus === 'cancelled' && isPaid(current.paymentStatus)) {
      const refundPayload = {
        orderId,
        companyId: row.companyId,
        amount: row.totalAmount,
        paymentMethod: row.paymentMethod,
        paymentReference: row.paymentReference,
        fiscalStatus: row.fiscalStatus,
        fiscalReceiptNumber: row.fiscalReceiptNumber,
        note: row.fiscalStatus === 'issued'
          ? 'Wymagany zwrot środków oraz korekta/zwrot na paragonie fiskalnym'
          : 'Wymagany zwrot środków',
      };
      await tx.insert(orderEvents).values({ orderId, eventType: 'order.refund_required', payload: refundPayload });
      await tx.insert(outboxEvents).values({ aggregateType: 'order', aggregateId: orderId, eventType: 'order.refund_required', payload: refundPayload });
    }

    return row;
  });

  flushMenuCache();
  broadcastStatus(updated);
  return (await getOrderById(orderId))!;
}

export interface PaymentRecord {
  method: string;
  terminalId?: string | null;
  /** Amount actually charged (grosze). When provided it must equal the order total. */
  amountGrosze?: number;
  reference?: string | null;
  /** 'confirmed' for gateway-verified online payments, 'paid' for POS / cash. */
  paymentStatus?: 'paid' | 'confirmed';
  companyId?: number;
  actor?: string;
}

export class PaymentAmountMismatchError extends HttpError {
  constructor(expected: number, got: number) {
    super(409, `Kwota płatności (${fromGrosze(got)}) nie zgadza się z kwotą zamówienia (${fromGrosze(expected)})`);
  }
}

/**
 * Record a payment. Idempotent: a second call for an already paid order is a no-op
 * (no second fiscalization event). Exactly one 'order.fiscalize' outbox event per order.
 */
export async function markOrderPaid(orderId: string, p: PaymentRecord): Promise<{ order: OrderDetail; alreadyPaid: boolean }> {
  const db = getDatabase();
  let alreadyPaid = false;

  const updated = await db.transaction(async (tx) => {
    const current = await lockOrder(tx, orderId, p.companyId);

    if (isPaid(current.paymentStatus)) {
      alreadyPaid = true;
      return current;
    }

    const totalGrosze = toGrosze(current.totalAmount);
    if (p.amountGrosze !== undefined && p.amountGrosze !== totalGrosze) {
      await tx.insert(orderEvents).values({
        orderId,
        eventType: 'order.payment_amount_mismatch',
        payload: { expected: totalGrosze, got: p.amountGrosze, reference: p.reference, method: p.method },
      });
      throw new PaymentAmountMismatchError(totalGrosze, p.amountGrosze);
    }

    let from = current.status as OrderStatus;
    if (from === 'completed') throw new HttpError(409, 'Zamówienie jest już zakończone');
    if (from === 'cancelled') {
      // Late gateway payment for an order cancelled by the payment timeout: revive it (money was taken).
      if (current.cancellationReason === 'payment_timeout') {
        from = 'pending_payment';
        await tx.update(orders).set({ stockReleased: false }).where(eq(orders.id, orderId));
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        for (const it of items) {
          if (!it.productId) continue;
          const [after] = await tx
            .update(products)
            .set({ stockQuantity: sql`${products.stockQuantity} - ${it.quantity}`, updatedAt: new Date() })
            .where(and(eq(products.id, it.productId), sql`${products.stockQuantity} IS NOT NULL`))
            .returning({ stockQuantity: products.stockQuantity, isAvailable: products.isAvailable });
          if (after) {
            await tx.insert(inventoryHistory).values({
              companyId: current.companyId, productId: it.productId, quantityChange: -it.quantity,
              quantityAfter: after.stockQuantity, isAvailableAfter: after.isAvailable, source: 'order', reference: orderId,
              note: 'Ponowna rezerwacja — spóźniona płatność',
            });
          }
        }
      } else {
        await tx.insert(orderEvents).values({
          orderId,
          eventType: 'order.refund_required',
          payload: { reason: 'payment_after_cancel', method: p.method, reference: p.reference, amountGrosze: p.amountGrosze ?? totalGrosze },
        });
        throw new HttpError(409, 'Zamówienie zostało anulowane — płatność wymaga zwrotu');
      }
    }

    let nextStatus: OrderStatus = from;
    if (from === 'pending_payment' || from === 'payment_failed') {
      nextStatus = (await isZeroPrepOrder(orderId, tx)) ? 'ready_to_collect' : 'paid';
    } else if (from === 'in_progress' && (await isZeroPrepOrder(orderId, tx))) {
      nextStatus = 'ready_to_collect';
    }

    const [row] = await tx
      .update(orders)
      .set({
        paymentStatus: p.paymentStatus || 'paid',
        paymentMethod: p.method || current.paymentMethod || 'cash',
        paymentReference: p.reference || current.paymentReference,
        paidAmountGrosze: p.amountGrosze ?? totalGrosze,
        paidAt: new Date(),
        terminalId: p.terminalId || current.terminalId || null,
        status: nextStatus,
        cancellationReason: current.status === 'cancelled' ? null : current.cancellationReason,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    await tx.insert(orderEvents).values({
      orderId,
      eventType: 'order.payment_recorded',
      payload: { method: p.method, amount: row.totalAmount, terminalId: p.terminalId, reference: p.reference, actor: p.actor },
    });

    if (row.fiscalStatus !== 'issued') {
      await tx.insert(outboxEvents).values({
        aggregateType: 'order',
        aggregateId: orderId,
        eventType: 'order.fiscalize',
        payload: { orderId, companyId: row.companyId },
      });
    }

    return row;
  });

  if (!alreadyPaid) broadcastStatus(updated);
  return { order: (await getOrderById(orderId))!, alreadyPaid };
}

/**
 * Record payment for an order (POS / Staff settlement / cash desk). Kept for backwards compatibility.
 */
export async function recordOrderPayment(
  orderId: string,
  paymentMethod: string,
  terminalId?: string,
  opts: Omit<PaymentRecord, 'method' | 'terminalId'> = {}
): Promise<OrderDetail> {
  const res = await markOrderPaid(orderId, { method: paymentMethod || 'cash', terminalId, ...opts });
  return res.order;
}

/** Cancel unpaid online orders older than ttlMinutes (releases stock). Returns number of cancelled orders. */
export async function expireUnpaidOrders(
  ttlMinutes: number,
  limit = 200,
  beforeCancel?: (orderId: string, hasPaymentToken: boolean) => Promise<boolean>
): Promise<string[]> {
  const db = getDatabase();
  const stale = await db
    .select({ id: orders.id, paymentToken: orders.paymentToken })
    .from(orders)
    .where(and(inArray(orders.status, ['pending_payment', 'payment_failed']), sql`${orders.createdAt} < now() - make_interval(mins => ${ttlMinutes})`))
    .limit(limit);

  const cancelled: string[] = [];
  for (const s of stale) {
    // Give the payment gateway a last chance (a paid order must never be cancelled by the timeout)
    if (beforeCancel) {
      const keep = await beforeCancel(s.id, !!s.paymentToken).catch(() => true);
      if (keep) continue;
    }
    try {
      await updateOrderStatus(s.id, 'cancelled', { reason: 'payment_timeout', actor: 'system' });
      cancelled.push(s.id);
    } catch (err: any) {
      console.warn(`[OrderExpiry] Could not cancel ${s.id}:`, err.message);
    }
  }
  return cancelled;
}
