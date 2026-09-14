import { FastifyInstance } from 'fastify';
import { CreateOrderRequestSchema, UpdateOrderStatusRequestSchema } from '@rycos/shared';
import { getDatabase, orders, eq, and, desc, sql } from '@rycos/database';
import { createOrder, getOrderById, updateOrderStatus, recordOrderPayment } from '../services/orderEngine.js';
import { broadcastToStaff } from '../plugins/websocket.js';

export async function orderRoutes(fastify: FastifyInstance) {
  // POST /v1/orders - Place a new order
  fastify.post('/v1/orders', async (req, reply) => {
    const parseResult = CreateOrderRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    try {
      const { order, isDuplicate } = await createOrder(parseResult.data, idempotencyKey);
      const statusCode = isDuplicate ? 200 : 201;
      return reply.code(statusCode).send({ data: order, duplicate: isDuplicate });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Failed to create order' });
    }
  });

  // POST /v1/orders/:id/pay - Settle payment & fiscalize
  fastify.post('/v1/orders/:id/pay', async (req, reply) => {
    const params = req.params as { id: string };
    const body = (req.body ?? {}) as { paymentMethod?: string; terminalId?: string };

    try {
      const order = await recordOrderPayment(params.id, body.paymentMethod || 'cash', body.terminalId);
      return reply.send({ data: order, success: true });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Failed to settle order payment' });
    }
  });

  // GET /v1/orders/:id - Get order details
  fastify.get('/v1/orders/:id', async (req, reply) => {
    const params = req.params as { id: string };
    const order = await getOrderById(params.id);

    if (!order) {
      return reply.code(404).send({ error: 'Order not found' });
    }

    return reply.send({ data: order });
  });

  // PATCH /v1/orders/:id/status - Update order status (Staff / KDS)
  fastify.patch('/v1/orders/:id/status', async (req, reply) => {
    const params = req.params as { id: string };
    const parseResult = UpdateOrderStatusRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    try {
      const order = await updateOrderStatus(params.id, parseResult.data.status, parseResult.data.cancellationReason);
      return reply.send({ data: order });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Failed to update order status' });
    }
  });

  // POST /v1/orders/service-call - Customer calls waiter or requests bill
  fastify.post('/v1/orders/service-call', async (req, reply) => {
    const body = (req.body ?? {}) as {
      companyId?: number;
      brandId?: number;
      tableLabel?: string;
      parkingSpot?: string;
      serviceType?: 'call_waiter' | 'request_bill' | 'custom';
      note?: string;
    };

    if (!body.tableLabel && !body.parkingSpot) {
      return reply.code(400).send({ error: 'tableLabel or parkingSpot is required' });
    }

    const companyId = body.companyId || 1;
    const event = {
      type: 'service_call' as const,
      data: {
        companyId,
        brandId: body.brandId,
        tableLabel: body.tableLabel,
        parkingSpot: body.parkingSpot,
        serviceType: body.serviceType || 'call_waiter',
        note: body.note,
        timestamp: new Date().toISOString(),
      },
    };

    await broadcastToStaff(companyId, event as any);

    return reply.send({
      success: true,
      message: 'Service request sent to staff',
      data: event.data,
    });
  });

  // POST /v1/orders/verify-pin - Staff / POS / KDS verification
  fastify.post('/v1/orders/verify-pin', async (req, reply) => {
    const db = getDatabase();
    let { orderId, orderNumber, pin, qrData, companyId } = (req.body ?? {}) as {
      orderId?: string;
      orderNumber?: number | string;
      pin?: string;
      qrData?: string;
      companyId?: number;
    };

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
      return reply.code(400).send({ error: 'Wprowadź 4-cyfrowy PIN lub zeskanuj kod QR' });
    }

    const cleanPin = String(pin).trim();
    const effectiveCompanyId = companyId || 1;

    let targetOrder = null;
    if (orderId) {
      const [o] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.companyId, effectiveCompanyId), eq(orders.id, orderId)))
        .limit(1);
      targetOrder = o;
    } else if (orderNumber && !isNaN(Number(orderNumber))) {
      const [o] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.companyId, effectiveCompanyId), eq(orders.orderNumber, Number(orderNumber))))
        .limit(1);
      targetOrder = o;
    } else {
      const candidates = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.companyId, effectiveCompanyId),
            sql`${orders.status} IN ('ready_to_collect', 'in_progress', 'paid')`,
            eq(orders.collectionPin, cleanPin)
          )
        )
        .orderBy(desc(orders.createdAt))
        .limit(1);
      targetOrder = candidates[0];
    }

    if (!targetOrder) {
      return reply.code(404).send({ error: 'Nie znaleziono zamówienia pasującego do podanego PIN-u' });
    }

    if (targetOrder.collectionPin !== cleanPin) {
      return reply.code(400).send({ error: `Błędny PIN dla zamówienia #${targetOrder.orderNumber}` });
    }

    try {
      const updated = await updateOrderStatus(targetOrder.id, 'completed');
      return reply.send({
        success: true,
        message: `Zamówienie #${targetOrder.orderNumber} zostało pomyślnie wydane!`,
        data: updated,
      });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Nie udało się wydać zamówienia' });
    }
  });
}
