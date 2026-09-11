import type { FastifyInstance } from 'fastify';
import { getDatabase, companies, orders, locations, brands, eq, sql, desc } from '@rycos/database';
import { requireAdminAuth } from '../../middleware/adminAuth.js';
import { success, notFound, error } from '../../lib/response.js';

export async function adminMasterRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/master/overview - Global platform KPIs
  fastify.get('/v1/admin/master/overview', async (_req, reply) => {
    const db = getDatabase();

    try {
      const [totalCompaniesRes] = await db.select({ count: sql<number>`count(*)::int` }).from(companies);
      const [activeCompaniesRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(companies)
        .where(eq(companies.isAcceptingOrders, true));

      const [ordersStats] = await db.select({
        totalOrders: sql<number>`count(*)::int`,
        totalVolume: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
      }).from(orders);

      const [signups7d] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(companies).where(sql`${companies.createdAt} >= NOW() - INTERVAL '7 days'`);

      const [signups30d] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(companies).where(sql`${companies.createdAt} >= NOW() - INTERVAL '30 days'`);

      return success(reply, {
        total_companies: totalCompaniesRes?.count || 0,
        active_companies: activeCompaniesRes?.count || 0,
        total_orders: ordersStats?.totalOrders || 0,
        total_volume: parseFloat(ordersStats?.totalVolume || '0'),
        signups_7d: signups7d?.count || 0,
        signups_30d: signups30d?.count || 0,
      }, 'Platform overview retrieved');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to load master overview');
    }
  });

  // GET /v1/admin/master/companies - List all companies across the platform
  fastify.get('/v1/admin/master/companies', async (_req, reply) => {
    const db = getDatabase();

    try {
      const rows = await db
        .select({
          id: companies.id,
          name: companies.name,
          slug: companies.slug,
          email: companies.email,
          country: companies.country,
          currency: companies.currency,
          isAcceptingOrders: companies.isAcceptingOrders,
          createdAt: companies.createdAt,
          ordersCount: sql<number>`(SELECT count(*)::int FROM orders WHERE orders.company_id = ${companies.id})`,
          brandsCount: sql<number>`(SELECT count(*)::int FROM brands WHERE brands.company_id = ${companies.id})`,
          locationsCount: sql<number>`(SELECT count(*)::int FROM locations WHERE locations.company_id = ${companies.id})`,
        })
        .from(companies)
        .orderBy(desc(companies.createdAt));

      return success(reply, rows, 'Companies retrieved');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to list companies');
    }
  });

  // PUT /v1/admin/master/companies/:id/status - Toggle company active status
  fastify.put('/v1/admin/master/companies/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const companyId = parseInt(id, 10);
    const body = (req.body ?? {}) as any;
    const db = getDatabase();

    const isAcceptingOrders = body.isAcceptingOrders !== undefined
      ? Boolean(body.isAcceptingOrders)
      : body.is_accepting_orders !== undefined
      ? Boolean(body.is_accepting_orders)
      : true;

    try {
      const [updated] = await db
        .update(companies)
        .set({ isAcceptingOrders, updatedAt: new Date() })
        .where(eq(companies.id, companyId))
        .returning();

      if (!updated) {
        return notFound(reply, 'Company not found');
      }

      return success(reply, updated, 'Company status updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update company status');
    }
  });
}
