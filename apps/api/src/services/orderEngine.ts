import { getDatabase, orders, orderItems, orderEvents, outboxEvents, idempotencyKeys, products, brands, companySettings, eq, and, inArray, sql } from '@rycos/database';
import { CreateOrderRequest, OrderDetail, OrderStatus } from '@rycos/shared';
import { broadcastToStaff, broadcastToOrder } from '../plugins/websocket.js';

export async function createOrder(input: CreateOrderRequest, idempotencyKeyHeader?: string): Promise<{ order: OrderDetail; isDuplicate: boolean }> {
  const db = getDatabase();
  const idempKey = idempotencyKeyHeader || input.idempotencyKey;

  // 1. Idempotency Check
  if (idempKey) {
    const existingKey = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, idempKey))
      .limit(1);

    if (existingKey.length > 0) {
      return { order: existingKey[0].responseBody as OrderDetail, isDuplicate: true };
    }
  }

  // 2. Fetch Brand & Company
  const brandRows = await db
    .select()
    .from(brands)
    .where(eq(brands.id, input.brandId))
    .limit(1);

  if (brandRows.length === 0) {
    throw new Error(`Brand with ID ${input.brandId} not found`);
  }
  const brand = brandRows[0];
  const companyId = brand.companyId;

  // 3. Verify Prices & Calculate Totals securely on backend
  // Map any legacy/demo fallback IDs (101->1, 102->2, 103->3, 104->4) to real product IDs
  const normalizedItems = input.items.map((i) => ({
    ...i,
    productId: i.productId >= 101 && i.productId <= 104 ? i.productId - 100 : i.productId,
  }));
  const productIds = normalizedItems.map((i) => i.productId);
  const dbProducts = await db
    .select()
    .from(products)
    .where(and(eq(products.companyId, companyId), inArray(products.id, productIds)));

  const productMap = new Map(dbProducts.map((p) => [p.id, p]));

  let calculatedSubtotal = 0;
  const verifiedItems: {
    productId: number;
    name: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    ptuCode: string;
    lineTotal: number;
    addons: any[];
    specialInstructions?: string;
  }[] = [];

  for (const item of normalizedItems) {
    const p = productMap.get(item.productId);
    if (!p) {
      throw new Error(`Product ${item.productId} does not belong to company or does not exist`);
    }
    if (!p.isAvailable) {
      throw new Error(`Product "${p.name}" is currently sold out`);
    }
    if (p.isAgeRestricted && !input.ageConsentAccepted) {
      throw new Error(`Age verification (18+) is required for "${p.name}"`);
    }

    const basePrice = parseFloat(p.price);
    const addonsDelta = item.addons.reduce((sum, a) => sum + (a.priceDelta || 0), 0);
    const effectiveUnitPrice = basePrice + addonsDelta;
    const lineTotal = effectiveUnitPrice * item.quantity;

    calculatedSubtotal += lineTotal;

    verifiedItems.push({
      productId: p.id,
      name: p.name,
      quantity: item.quantity,
      unitPrice: effectiveUnitPrice,
      taxRate: p.taxRate,
      ptuCode: p.ptuCode,
      lineTotal,
      addons: item.addons,
      specialInstructions: item.specialInstructions,
    });
  }

  const tip = input.tipAmount || 0;
  const grandTotal = calculatedSubtotal + tip;

  // 4. Generate Random 4-digit Collection PIN (e.g. "4819")
  const collectionPin = String(Math.floor(1000 + Math.random() * 9000));

  // 5. Execute Atomic ACID Transaction
  const createdOrder = await db.transaction(async (tx) => {
    // Generate sequential order number per company (locks max sequence row safely)
    const seqResult = await tx.execute(
      sql`SELECT COALESCE(MAX(order_number), 0) + 1 AS next_order_number FROM orders WHERE company_id = ${companyId}`
    );
    const nextOrderNumber = Number(seqResult[0]?.next_order_number || 1);

    const initialStatus: OrderStatus = input.paymentMethod === 'cash' ? 'in_progress' : 'pending_payment';
    const initialPaymentStatus = input.paymentMethod === 'cash' ? 'pending' : 'pending';

    // Insert Order
    const [newOrder] = await tx
      .insert(orders)
      .values({
        companyId,
        brandId: brand.id,
        orderNumber: nextOrderNumber,
        collectionPin,
        status: initialStatus,
        orderType: input.orderType,
        tableLabel: input.tableLabel || null,
        parkingSpot: input.parkingSpot || null,
        customerNip: input.customerNip || null,
        customerNote: input.customerNote || null,
        subtotalAmount: calculatedSubtotal.toFixed(2),
        tipAmount: tip.toFixed(2),
        totalAmount: grandTotal.toFixed(2),
        currency: input.currency || 'PLN',
        paymentMethod: input.paymentMethod,
        paymentStatus: initialPaymentStatus,
        fiscalStatus: 'none',
      })
      .returning();

    // Insert Order Items
    for (const item of verifiedItems) {
      await tx.insert(orderItems).values({
        orderId: newOrder.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        taxRate: item.taxRate,
        ptuCode: item.ptuCode,
        lineTotal: item.lineTotal.toFixed(2),
        addonsJson: item.addons,
        specialInstructions: item.specialInstructions || null,
      });
    }

    // Insert Initial Order Event
    await tx.insert(orderEvents).values({
      orderId: newOrder.id,
      eventType: 'order.created',
      payload: { status: initialStatus, paymentMethod: input.paymentMethod },
    });

    // Insert Outbox Event for background processing (guaranteed delivery)
    await tx.insert(outboxEvents).values({
      aggregateType: 'order',
      aggregateId: newOrder.id,
      eventType: 'order.created',
      payload: {
        orderId: newOrder.id,
        companyId,
        brandId: brand.id,
        orderNumber: nextOrderNumber,
        totalAmount: grandTotal,
      },
      status: 'pending',
    });

    return {
      ...newOrder,
      brandName: brand.name,
    };
  });

  const orderDetail: OrderDetail = {
    id: createdOrder.id,
    companyId: createdOrder.companyId,
    brandId: createdOrder.brandId,
    brandName: createdOrder.brandName,
    orderNumber: createdOrder.orderNumber,
    collectionPin: createdOrder.collectionPin,
    status: createdOrder.status as OrderStatus,
    orderType: createdOrder.orderType as any,
    tableLabel: createdOrder.tableLabel,
    parkingSpot: createdOrder.parkingSpot,
    customerNip: createdOrder.customerNip,
    items: verifiedItems.map((it) => ({
      productId: it.productId,
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      taxRate: it.taxRate,
      ptuCode: it.ptuCode,
      addons: it.addons,
      specialInstructions: it.specialInstructions,
      lineTotal: it.lineTotal,
    })),
    subtotalAmount: parseFloat(createdOrder.subtotalAmount),
    tipAmount: parseFloat(createdOrder.tipAmount),
    totalAmount: parseFloat(createdOrder.totalAmount),
    currency: createdOrder.currency,
    paymentMethod: createdOrder.paymentMethod,
    paymentStatus: createdOrder.paymentStatus as any,
    fiscalStatus: createdOrder.fiscalStatus as any,
    showReceiptQr: true,
    createdAt: createdOrder.createdAt.toISOString(),
    updatedAt: createdOrder.updatedAt.toISOString(),
  };

  // 6. Save Idempotency Key (expires in 24 hours)
  if (idempKey) {
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    await db
      .insert(idempotencyKeys)
      .values({
        key: idempKey,
        statusCode: 201,
        responseBody: orderDetail,
        expiresAt,
      })
      .onConflictDoNothing();
  }

  // 7. Realtime Notification via WebSockets
  broadcastToStaff(companyId, {
    type: 'order.created',
    timestamp: new Date().toISOString(),
    companyId,
    brandId: brand.id,
    payload: orderDetail,
  });

  return { order: orderDetail, isDuplicate: false };
}

export async function getOrderById(orderId: string): Promise<OrderDetail | null> {
  const db = getDatabase();

  const [orderRow] = await db
    .select({
      order: orders,
      brandName: brands.name,
    })
    .from(orders)
    .leftJoin(brands, eq(orders.brandId, brands.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  let showReceiptQr = true;
  try {
    const [st] = await db
      .select({ isEnabled: companySettings.isEnabled })
      .from(companySettings)
      .where(and(eq(companySettings.companyId, orderRow.order.companyId), eq(companySettings.featureKey, 'show_receipt_qr')))
      .limit(1);
    if (st) {
      showReceiptQr = st.isEnabled;
    }
  } catch {}

  return {
    id: orderRow.order.id,
    companyId: orderRow.order.companyId,
    brandId: orderRow.order.brandId,
    brandName: orderRow.brandName || '',
    orderNumber: orderRow.order.orderNumber,
    collectionPin: orderRow.order.collectionPin,
    status: orderRow.order.status as OrderStatus,
    orderType: orderRow.order.orderType as any,
    tableLabel: orderRow.order.tableLabel,
    parkingSpot: orderRow.order.parkingSpot,
    customerNip: orderRow.order.customerNip,
    items: items.map((it) => ({
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
    subtotalAmount: parseFloat(orderRow.order.subtotalAmount),
    tipAmount: parseFloat(orderRow.order.tipAmount),
    totalAmount: parseFloat(orderRow.order.totalAmount),
    currency: orderRow.order.currency,
    paymentMethod: orderRow.order.paymentMethod,
    paymentStatus: orderRow.order.paymentStatus as any,
    fiscalStatus: orderRow.order.fiscalStatus as any,
    fiscalReceiptNumber: orderRow.order.fiscalReceiptNumber,
    fiscalPdfUrl: orderRow.order.fiscalPdfUrl,
    showReceiptQr,
    createdAt: orderRow.order.createdAt.toISOString(),
    updatedAt: orderRow.order.updatedAt.toISOString(),
  };
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus, reason?: string): Promise<OrderDetail> {
  const db = getDatabase();

  const updateFields: Record<string, any> = {
    status: newStatus,
    updatedAt: new Date(),
  };

  // If status is updated to 'paid', ensure paymentStatus is also 'paid' (unless already confirmed)
  if (newStatus === 'paid') {
    updateFields.paymentStatus = sql`CASE WHEN ${orders.paymentStatus} = 'confirmed' THEN 'confirmed' ELSE 'paid' END`;
  }

  const [updatedOrder] = await db
    .update(orders)
    .set(updateFields)
    .where(eq(orders.id, orderId))
    .returning();

  if (!updatedOrder) {
    throw new Error(`Order ${orderId} not found`);
  }

  // Insert event log
  await db.insert(orderEvents).values({
    orderId,
    eventType: 'order.status_updated',
    payload: { newStatus, reason },
  });

  // Outbox trigger for fiscalization: strictly ONLY when order is paid and payment is confirmed/paid.
  // Kitchen readiness (ready_to_collect) MUST NEVER trigger fiscalization!
  if (newStatus === 'paid' && (updatedOrder.paymentStatus === 'paid' || updatedOrder.paymentStatus === 'confirmed')) {
    if (updatedOrder.fiscalStatus !== 'issued') {
      await db.insert(outboxEvents).values({
        aggregateType: 'order',
        aggregateId: orderId,
        eventType: 'order.fiscalize',
        payload: { orderId, companyId: updatedOrder.companyId },
      });
    }
  }

  const orderDetail = (await getOrderById(orderId))!;

  // Broadcast to Staff
  broadcastToStaff(updatedOrder.companyId, {
    type: 'order.status_updated',
    timestamp: new Date().toISOString(),
    companyId: updatedOrder.companyId,
    brandId: updatedOrder.brandId,
    payload: {
      orderId,
      orderNumber: updatedOrder.orderNumber,
      status: newStatus,
      collectionPin: updatedOrder.collectionPin,
    },
  });

  // Broadcast to Customer Tracker
  broadcastToOrder(orderId, {
    type: 'order.status_updated',
    timestamp: new Date().toISOString(),
    companyId: updatedOrder.companyId,
    brandId: updatedOrder.brandId,
    payload: {
      orderId,
      orderNumber: updatedOrder.orderNumber,
      status: newStatus,
      collectionPin: updatedOrder.collectionPin,
    },
  });

  return orderDetail;
}

/**
 * Record payment for an order (POS / Staff settlement / cash desk).
 * Ensures paymentStatus is 'paid', assigns payment method, triggers fiscalization,
 * and preserves kitchen fulfillment status if already in progress or ready.
 */
export async function recordOrderPayment(
  orderId: string,
  paymentMethod: string,
  terminalId?: string
): Promise<OrderDetail> {
  const db = getDatabase();

  const [existingOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!existingOrder) {
    throw new Error(`Order ${orderId} not found`);
  }

  // If order was pending_payment, advance to paid.
  // If order was already in_progress or ready_to_collect, preserve kitchen status.
  let nextStatus = existingOrder.status;
  if (existingOrder.status === 'pending_payment') {
    nextStatus = 'paid';
  }

  const [updatedOrder] = await db
    .update(orders)
    .set({
      paymentStatus: 'paid',
      paymentMethod: paymentMethod || existingOrder.paymentMethod || 'cash',
      terminalId: terminalId || existingOrder.terminalId || null,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .returning();

  // Log payment event
  await db.insert(orderEvents).values({
    orderId,
    eventType: 'order.payment_recorded',
    payload: {
      paymentMethod,
      amount: updatedOrder.totalAmount,
      terminalId,
    },
  });

  // Trigger fiscalization outbox event if not already issued
  if (updatedOrder.fiscalStatus !== 'issued') {
    await db.insert(outboxEvents).values({
      aggregateType: 'order',
      aggregateId: orderId,
      eventType: 'order.fiscalize',
      payload: { orderId, companyId: updatedOrder.companyId },
    });
  }

  const orderDetail = (await getOrderById(orderId))!;

  // Broadcast to Staff
  broadcastToStaff(updatedOrder.companyId, {
    type: 'order.status_updated',
    timestamp: new Date().toISOString(),
    companyId: updatedOrder.companyId,
    brandId: updatedOrder.brandId,
    payload: {
      orderId,
      orderNumber: updatedOrder.orderNumber,
      status: nextStatus,
      collectionPin: updatedOrder.collectionPin,
    },
  });

  // Broadcast to Customer Tracker
  broadcastToOrder(orderId, {
    type: 'order.status_updated',
    timestamp: new Date().toISOString(),
    companyId: updatedOrder.companyId,
    brandId: updatedOrder.brandId,
    payload: {
      orderId,
      orderNumber: updatedOrder.orderNumber,
      status: nextStatus,
      collectionPin: updatedOrder.collectionPin,
    },
  });

  return orderDetail;
}
