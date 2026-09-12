import type { FastifyInstance } from 'fastify';
import { getDatabase, orders, orderItems, eq, and, desc, sql } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import { updateOrderStatus } from '../../services/orderEngine.js';

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
    return success(reply, rows, 'Orders retrieved');
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

  // GET /v1/admin/orders/analytics - Sales & volume summary
  fastify.get('/v1/admin/orders/analytics', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    // Total orders count
    const [totalOrdersRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.companyId, companyId));

    // Completed & Paid orders turnover
    const [turnoverRes] = await db
      .select({ total: sql<string>`coalesce(sum(${orders.totalAmount}), 0)` })
      .from(orders)
      .where(
        and(
          eq(orders.companyId, companyId),
          sql`${orders.status} IN ('paid', 'in_progress', 'ready_to_collect', 'completed')`
        )
      );

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
      totalOrders: totalOrdersRes?.count || 0,
      activeOrdersInKitchen: activeOrdersRes?.count || 0,
      totalTurnover: parseFloat(turnoverRes?.total || '0').toFixed(2),
      currency: 'PLN',
    });
  });
}
