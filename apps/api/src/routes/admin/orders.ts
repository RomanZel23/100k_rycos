import type { FastifyInstance } from 'fastify';
import { getDatabase, orders, orderItems, products, brands, eq, and, desc, sql, inArray, gte, lte } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import { updateOrderStatus, recordOrderPayment } from '../../services/orderEngine.js';
import { fiscalizeOrder } from '../../services/fiscalService.js';

export async function adminOrdersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/orders - List orders for staff/kitchen/admin
  fastify.get('/v1/admin/orders', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const { status, limit } = req.query as { status?: string; limit?: string };

    const takeLimit = limit ? Math.min(parseInt(limit, 10), 100) : 50;

    let query = db
      .select()
      .from(orders)
      .where(
        status
          ? and(eq(orders.companyId, companyId), eq(orders.status, status))
          : eq(orders.companyId, companyId)
      )
      .orderBy(desc(orders.createdAt))
      .limit(takeLimit);

    const rows = await query;
    const orderIds = rows.map((r) => r.id);
    const itemsByOrderId: Record<string, any[]> = {};

    if (orderIds.length > 0) {
      const items = await db
        .select({
          id: orderItems.id,
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          name: orderItems.name,
          quantity: orderItems.quantity,
          addons: orderItems.addonsJson,
          specialInstructions: orderItems.specialInstructions,
          prepTimeMinutes: products.prepTimeMinutes,
        })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));

      for (const item of items) {
        if (!itemsByOrderId[item.orderId]) {
          itemsByOrderId[item.orderId] = [];
        }
        itemsByOrderId[item.orderId].push({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          addons: item.addons,
          specialInstructions: item.specialInstructions,
          prepTimeMinutes: item.prepTimeMinutes,
        });
      }
    }

    const rowsWithItems = rows.map((r) => {
      const ordItems = itemsByOrderId[r.id] || [];
      const isZeroPrep =
        ordItems.length > 0 &&
        !ordItems.some(
          (it) => it.prepTimeMinutes !== null && it.prepTimeMinutes !== undefined && it.prepTimeMinutes > 0
        );

      return {
        ...r,
        items: ordItems,
        isZeroPrep,
      };
    });

    return success(reply, rowsWithItems, 'Orders retrieved');
  });

  // PUT /v1/admin/orders/:id/status - Update order lifecycle status (e.g. kitchen starts prep, marks ready)
  fastify.put('/v1/admin/orders/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    let { status } = req.body as { status?: string };

    if (status === 'preparing') status = 'in_progress';
    if (status === 'ready_for_pickup') status = 'ready_to_collect';

    const validStatuses = ['pending_payment', 'paid', 'in_progress', 'ready_to_collect', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return validationError(reply, {
        status: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    try {
      const updated = await updateOrderStatus(id, status as any);
      return success(reply, updated, `Order status updated to ${status}`);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update order status');
    }
  });

  // POST /v1/admin/orders/:id/pay - Settle order payment and trigger fiscalization (POS / Staff / Tables)
  fastify.post('/v1/admin/orders/:id/pay', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { paymentMethod, terminalId, autoPrint } = (req.body || {}) as {
      paymentMethod?: string;
      terminalId?: string;
      autoPrint?: boolean;
    };

    const method = paymentMethod || 'cash';
    try {
      const updated = await recordOrderPayment(id, method, terminalId);
      let fiscalData = null;
      try {
        fiscalData = await fiscalizeOrder({
          orderId: id,
          autoPrint: autoPrint ?? false,
          terminalId,
        });
      } catch (fErr: any) {
        console.warn('[Admin Pay] Fiscalization warning:', fErr.message);
      }

      return success(
        reply,
        { ...updated, fiscal: fiscalData },
        `Płatność dla zamówienia #${updated.orderNumber} została zarejestrowana i przekazana do fiskalizacji`
      );
    } catch (err: any) {
      return error(reply, err.message || 'Nie udało się zarejestrować płatności');
    }
  });

  // POST /v1/admin/orders/verify-pin - Verify pickup PIN or QR code and complete order
  fastify.post('/v1/admin/orders/verify-pin', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    let { orderId, orderNumber, pin, qrData } = (req.body ?? {}) as {
      orderId?: string;
      orderNumber?: number | string;
      pin?: string;
      qrData?: string;
    };

    // If QR code scanned: e.g. "4:5412" or "UUID:5412"
    if (qrData && typeof qrData === 'string') {
      const parts = qrData.trim().split(':');
      if (parts.length === 2) {
        if (parts[0].length > 10) {
          orderId = parts[0];
        } else {
          orderNumber = parseInt(parts[0], 10);
        }
        pin = parts[1];
      } else if (parts.length === 1) {
        pin = parts[0];
      }
    }

    if (!pin) {
      return validationError(reply, { pin: 'Wprowadź 4-cyfrowy PIN lub zeskanuj kod QR' });
    }

    const cleanPin = String(pin).trim();

    // Find order
    let targetOrder = null;
    if (orderId) {
      const [o] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.companyId, companyId), eq(orders.id, orderId)))
        .limit(1);
      targetOrder = o;
    } else if (orderNumber && !isNaN(Number(orderNumber))) {
      const [o] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.companyId, companyId), eq(orders.orderNumber, Number(orderNumber))))
        .limit(1);
      targetOrder = o;
    } else {
      // Find candidate by PIN among active orders
      const candidates = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.companyId, companyId),
            sql`${orders.status} IN ('ready_to_collect', 'in_progress', 'paid')`,
            eq(orders.collectionPin, cleanPin)
          )
        )
        .orderBy(desc(orders.createdAt))
        .limit(1);
      targetOrder = candidates[0];
    }

    if (!targetOrder) {
      return error(reply, 'Nie znaleziono zamówienia pasującego do podanego PIN-u', 404);
    }

    if (targetOrder.collectionPin !== cleanPin) {
      return error(reply, `Błędny PIN dla zamówienia #${targetOrder.orderNumber}`, 400);
    }

    if (targetOrder.status === 'completed') {
      const completionTime = targetOrder.updatedAt
        ? new Date(targetOrder.updatedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
        : '';
      return error(
        reply,
        `⚠️ Zamówienie #${targetOrder.orderNumber} zostało już wcześniej odebrane / wydane${completionTime ? ` o godz. ${completionTime}` : ''}!`,
        400
      );
    }

    if (targetOrder.status === 'cancelled') {
      return error(
        reply,
        `⚠️ Zamówienie #${targetOrder.orderNumber} zostało anulowane i nie może zostać wydane!`,
        400
      );
    }

    if (targetOrder.status === 'pending_payment' || targetOrder.paymentStatus === 'pending') {
      return error(
        reply,
        `⚠️ Zamówienie #${targetOrder.orderNumber} nie zostało jeszcze opłacone!`,
        400
      );
    }

    try {
      const updated = await updateOrderStatus(targetOrder.id, 'completed');
      return success(reply, updated, `Zamówienie #${targetOrder.orderNumber} zostało pomyślnie wydane!`);
    } catch (err: any) {
      return error(reply, err.message || 'Nie udało się wydać zamówienia');
    }
  });

  // GET /v1/admin/orders/analytics - Sales & volume summary
  fastify.get('/v1/admin/orders/analytics', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;
    let prevStartDate: Date;
    let prevEndDate: Date;

    const query = (req.query ?? {}) as any;
    const rangeType = String(query.range || '30d').toLowerCase();
    const brandIdParam = query.brand_id;
    const brandId = brandIdParam ? parseInt(String(brandIdParam), 10) : undefined;

    if (rangeType === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const diffMs = endDate.getTime() - startDate.getTime();
      prevStartDate = new Date(startDate.getTime() - diffMs - 1);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else if (rangeType === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const diffMs = endDate.getTime() - startDate.getTime();
      prevStartDate = new Date(startDate.getTime() - diffMs);
      prevEndDate = new Date(startDate.getTime());
    } else if (rangeType === '90d') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const diffMs = endDate.getTime() - startDate.getTime();
      prevStartDate = new Date(startDate.getTime() - diffMs);
      prevEndDate = new Date(startDate.getTime());
    } else if (rangeType === 'mtd') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      const diffMs = endDate.getTime() - startDate.getTime();
      prevStartDate = new Date(startDate.getTime() - diffMs);
      prevEndDate = new Date(startDate.getTime());
    } else if (rangeType === 'ytd') {
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      const diffMs = endDate.getTime() - startDate.getTime();
      prevStartDate = new Date(startDate.getTime() - diffMs);
      prevEndDate = new Date(startDate.getTime());
    } else if (rangeType === 'custom' && query.from && query.to) {
      startDate = new Date(`${query.from}T00:00:00`);
      endDate = new Date(`${query.to}T23:59:59.999`);
      const diffMs = endDate.getTime() - startDate.getTime();
      prevStartDate = new Date(startDate.getTime() - diffMs);
      prevEndDate = new Date(startDate.getTime());
    } else {
      // default '30d'
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const diffMs = endDate.getTime() - startDate.getTime();
      prevStartDate = new Date(startDate.getTime() - diffMs);
      prevEndDate = new Date(startDate.getTime());
    }

    // Orders included in stats: completed or in fulfillment/paid
    const currentConditions = [
      eq(orders.companyId, companyId),
      sql`${orders.status} IN ('paid', 'in_progress', 'ready_to_collect', 'completed')`,
      gte(orders.createdAt, startDate),
      lte(orders.createdAt, endDate),
    ];
    if (brandId) {
      currentConditions.push(eq(orders.brandId, brandId));
    }

    const priorConditions = [
      eq(orders.companyId, companyId),
      sql`${orders.status} IN ('paid', 'in_progress', 'ready_to_collect', 'completed')`,
      gte(orders.createdAt, prevStartDate),
      lte(orders.createdAt, prevEndDate),
    ];
    if (brandId) {
      priorConditions.push(eq(orders.brandId, brandId));
    }

    // Fetch current orders
    const currentOrders = await db
      .select({
        id: orders.id,
        brandId: orders.brandId,
        totalAmount: orders.totalAmount,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(...currentConditions));

    // Fetch prior orders
    const priorOrders = await db
      .select({
        id: orders.id,
        totalAmount: orders.totalAmount,
      })
      .from(orders)
      .where(and(...priorConditions));

    // Fetch order items for current orders
    const currentOrderIds = currentOrders.map((o) => o.id);
    let currentItems: {
      orderId: string;
      productId: number | null;
      name: string;
      quantity: number;
      lineTotal: string;
    }[] = [];

    if (currentOrderIds.length > 0) {
      currentItems = await db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          name: orderItems.name,
          quantity: orderItems.quantity,
          lineTotal: orderItems.lineTotal,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, currentOrderIds));
    }

    // Prior items count
    const priorOrderIds = priorOrders.map((o) => o.id);
    let priorItemsCount = 0;
    if (priorOrderIds.length > 0) {
      const [priorItemsRes] = await db
        .select({ count: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int` })
        .from(orderItems)
        .where(inArray(orderItems.orderId, priorOrderIds));
      priorItemsCount = priorItemsRes?.count || 0;
    }

    // Calculate current KPIs
    const revenue = currentOrders.reduce((acc, o) => acc + parseFloat(o.totalAmount || '0'), 0);
    const orderCount = currentOrders.length;
    const aov = orderCount > 0 ? revenue / orderCount : 0;
    const itemsSold = currentItems.reduce((acc, it) => acc + (it.quantity || 0), 0);

    // Calculate prior KPIs
    const priorRevenue = priorOrders.reduce((acc, o) => acc + parseFloat(o.totalAmount || '0'), 0);
    const priorOrdersCount = priorOrders.length;
    const priorAov = priorOrdersCount > 0 ? priorRevenue / priorOrdersCount : 0;

    function calcDelta(curr: number, prev: number): number | null {
      if (prev === 0) return curr > 0 ? 100 : null;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    }

    // 1. Daily breakdown
    const dailyMap = new Map<string, { revenue: number; orders: number }>();
    const curDay = new Date(startDate);
    curDay.setHours(0, 0, 0, 0);
    const lastDay = new Date(endDate);
    lastDay.setHours(23, 59, 59, 999);

    while (curDay <= lastDay) {
      const key = curDay.toISOString().slice(0, 10);
      dailyMap.set(key, { revenue: 0, orders: 0 });
      curDay.setDate(curDay.getDate() + 1);
    }

    for (const o of currentOrders) {
      const d = new Date(o.createdAt).toISOString().slice(0, 10);
      const entry = dailyMap.get(d) || { revenue: 0, orders: 0 };
      entry.revenue += parseFloat(o.totalAmount || '0');
      entry.orders += 1;
      dailyMap.set(d, entry);
    }

    const daily = Array.from(dailyMap.entries()).map(([day, val]) => ({
      day,
      revenue: Math.round(val.revenue * 100) / 100,
      orders: val.orders,
    }));

    // 2. Monthly breakdown (last 12 months, independent of range filter)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0);
    const monthlyConditions = [
      eq(orders.companyId, companyId),
      sql`${orders.status} IN ('paid', 'in_progress', 'ready_to_collect', 'completed')`,
      gte(orders.createdAt, twelveMonthsAgo),
    ];
    if (brandId) {
      monthlyConditions.push(eq(orders.brandId, brandId));
    }

    const lastYearOrders = await db
      .select({
        totalAmount: orders.totalAmount,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(...monthlyConditions));

    const monthlyMap = new Map<string, { revenue: number; orders: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(mKey, { revenue: 0, orders: 0 });
    }

    for (const o of lastYearOrders) {
      const d = new Date(o.createdAt);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap.has(mKey)) {
        const entry = monthlyMap.get(mKey)!;
        entry.revenue += parseFloat(o.totalAmount || '0');
        entry.orders += 1;
      }
    }

    const monthly = Array.from(monthlyMap.entries()).map(([month, val]) => ({
      month,
      revenue: Math.round(val.revenue * 100) / 100,
      orders: val.orders,
    }));

    // 3. Top products
    const productMap = new Map<string, { id: number; name: string; qty: number; revenue: number }>();
    for (const it of currentItems) {
      const pKey = it.productId ? String(it.productId) : it.name;
      const existing = productMap.get(pKey) || {
        id: it.productId || 0,
        name: it.name,
        qty: 0,
        revenue: 0,
      };
      existing.qty += it.quantity || 0;
      existing.revenue += parseFloat(it.lineTotal || '0');
      productMap.set(pKey, existing);
    }
    const top_products = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((p) => ({
        ...p,
        revenue: Math.round(p.revenue * 100) / 100,
      }));

    // 4. Hour heatmap (dow: 0 Sun - 6 Sat, hour: 0 - 23)
    const heatMap = new Map<string, number>();
    for (const o of currentOrders) {
      const d = new Date(o.createdAt);
      const dow = d.getDay();
      const hour = d.getHours();
      const key = `${dow}_${hour}`;
      heatMap.set(key, (heatMap.get(key) || 0) + 1);
    }
    const hour_heatmap: { dow: number; hour: number; orders: number }[] = [];
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        const oCount = heatMap.get(`${dow}_${hour}`) || 0;
        if (oCount > 0) {
          hour_heatmap.push({ dow, hour, orders: oCount });
        }
      }
    }

    // 5. Revenue by brand
    const companyBrands = await db
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(eq(brands.companyId, companyId));

    const brandNameMap = new Map<number, string>();
    for (const b of companyBrands) {
      brandNameMap.set(b.id, b.name);
    }

    const brandAggMap = new Map<number, { brand_name: string; revenue: number; orders: number }>();
    for (const o of currentOrders) {
      const bName = brandNameMap.get(o.brandId) || `Brand ${o.brandId}`;
      const entry = brandAggMap.get(o.brandId) || { brand_name: bName, revenue: 0, orders: 0 };
      entry.revenue += parseFloat(o.totalAmount || '0');
      entry.orders += 1;
      brandAggMap.set(o.brandId, entry);
    }

    const by_brand = Array.from(brandAggMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((b) => ({
        ...b,
        revenue: Math.round(b.revenue * 100) / 100,
      }));

    // Active orders in kitchen
    const [activeOrdersRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.companyId, companyId),
          sql`${orders.status} IN ('paid', 'in_progress')`
        )
      );

    return success(reply, {
      range: rangeType,
      kpis: {
        revenue: Math.round(revenue * 100) / 100,
        orders: orderCount,
        aov: Math.round(aov * 100) / 100,
        items_sold: itemsSold,
        revenue_delta_pct: calcDelta(revenue, priorRevenue),
        orders_delta_pct: calcDelta(orderCount, priorOrdersCount),
        aov_delta_pct: calcDelta(aov, priorAov),
        items_delta_pct: calcDelta(itemsSold, priorItemsCount),
      },
      daily,
      monthly,
      top_products,
      hour_heatmap,
      by_brand,
      // Backward compatibility fields:
      totalOrders: orderCount,
      activeOrdersInKitchen: activeOrdersRes?.count || 0,
      totalTurnover: (Math.round(revenue * 100) / 100).toFixed(2),
      currency: 'PLN',
    });
  });
}
