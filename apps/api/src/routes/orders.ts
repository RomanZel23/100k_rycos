import { FastifyInstance } from 'fastify';
import { CreateOrderRequestSchema, UpdateOrderStatusRequestSchema } from '@rycos/shared';
import { createOrder, getOrderById, updateOrderStatus } from '../services/orderEngine.js';
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
}
