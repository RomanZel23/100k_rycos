import type { FastifyInstance } from 'fastify';
import { getDatabase, orders, companies, terminals, eq, and, sql, desc, gte, lte } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, error } from '../../lib/response.js';

export async function adminBillingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/billing/summary - Monthly billing & commissions summary
  fastify.get('/v1/admin/billing/summary', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    try {
      const [company] = await db
        .select({ currency: companies.currency, name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      const currency = company?.currency || 'PLN';

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      // Month name in ISO format (e.g. "2026-09")
      const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Aggregate current month orders (excluding synthetic load tests)
      const monthOrdersRes = await db
        .select({
          ordersCount: sql<number>`count(*)::int`,
          salesGross: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.companyId, companyId),
            sql`${orders.status} IN ('paid', 'in_progress', 'ready_to_collect', 'completed')`,
            sql`${orders.orderType} != 'test'`,
            gte(orders.createdAt, startOfMonth),
            lte(orders.createdAt, endOfMonth)
          )
        );

      const ordersCount = monthOrdersRes[0]?.ordersCount ?? 0;
      const salesGross = parseFloat(monthOrdersRes[0]?.salesGross || '0');

      // Commission calculation (1.0% default platform commission)
      const commissionPct = 1.0;
      const commission = +(salesGross * (commissionPct / 100)).toFixed(2);

      // Tier Determination based on volume
      let tier: { label: string; up_to: number | null; base_usd: number } = {
        label: 'Starter (do 2 000 zam.)',
        up_to: 2000,
        base_usd: 49,
      };
      if (ordersCount > 10000) {
        tier = {
          label: 'Stadium / Enterprise (100k+ zam.)',
          up_to: null,
          base_usd: 249,
        };
      } else if (ordersCount > 2000) {
        tier = {
          label: 'Growth (do 10 000 zam.)',
          up_to: 10000,
          base_usd: 99,
        };
      }

      // Group by terminal / channel
      const byTerminalRes = await db
        .select({
          terminalId: orders.terminalId,
          orderCount: sql<number>`count(*)::int`,
          gross: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.companyId, companyId),
            sql`${orders.status} IN ('paid', 'in_progress', 'ready_to_collect', 'completed')`,
            sql`${orders.orderType} != 'test'`,
            gte(orders.createdAt, startOfMonth),
            lte(orders.createdAt, endOfMonth)
          )
        )
        .groupBy(orders.terminalId)
        .orderBy(desc(sql`sum(${orders.totalAmount})`));

      const byTerminal = byTerminalRes.map((t) => {
        const grossVal = parseFloat(t.gross || '0');
        return {
          terminal_id: t.terminalId || null,
          order_count: t.orderCount,
          gross: grossVal,
          commission: +(grossVal * (commissionPct / 100)).toFixed(2),
        };
      });

      return success(reply, {
        month: monthLabel,
        currency,
        orders: ordersCount,
        sales_gross: salesGross,
        commission_pct: commissionPct,
        commission,
        tier,
        base_usd: tier.base_usd,
        base_currency: 'USD',
        by_terminal: byTerminal,
        note: 'Prowizja transakcyjna naliczana od opłaconych zamówień. Rozliczenie abonamentu i prowizji następuje na koniec okresu rozliczeniowego.',
      }, 'Billing summary retrieved');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to load billing summary');
    }
  });

  // GET /v1/admin/stats/orders - Historical order volume series (monthly / weekly)
  fastify.get('/v1/admin/stats/orders', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const { bucket } = (req.query ?? {}) as { bucket?: string };

    const isWeekly = bucket === 'week';

    try {
      if (isWeekly) {
        // Last 8 weeks
        const weeksRes = await db
          .select({
            bucket: sql<string>`to_char(date_trunc('week', ${orders.createdAt}), 'YYYY-MM-DD')`,
            orderCount: sql<number>`count(*)::int`,
            gross: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
          })
          .from(orders)
          .where(
            and(
              eq(orders.companyId, companyId),
              sql`${orders.status} IN ('paid', 'in_progress', 'ready_to_collect', 'completed')`,
              sql`${orders.orderType} != 'test'`,
              sql`${orders.createdAt} >= NOW() - INTERVAL '8 weeks'`
            )
          )
          .groupBy(sql`date_trunc('week', ${orders.createdAt})`)
          .orderBy(sql`date_trunc('week', ${orders.createdAt}) ASC`);

        let totalOrders = 0;
        let totalGross = 0;
        const series = weeksRes.map((r) => {
          const grossVal = parseFloat(r.gross || '0');
          totalOrders += r.orderCount;
          totalGross += grossVal;
          return {
            bucket: r.bucket,
            order_count: r.orderCount,
            gross: grossVal,
          };
        });

        return success(reply, {
          bucket: 'week',
          series,
          totals: {
            order_count: totalOrders,
            gross: +totalGross.toFixed(2),
          },
        });
      } else {
        // Last 6 months
        const monthsRes = await db
          .select({
            bucket: sql<string>`to_char(date_trunc('month', ${orders.createdAt}), 'YYYY-MM-DD')`,
            orderCount: sql<number>`count(*)::int`,
            gross: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
          })
          .from(orders)
          .where(
            and(
              eq(orders.companyId, companyId),
              sql`${orders.status} IN ('paid', 'in_progress', 'ready_to_collect', 'completed')`,
              sql`${orders.orderType} != 'test'`,
              sql`${orders.createdAt} >= NOW() - INTERVAL '6 months'`
            )
          )
          .groupBy(sql`date_trunc('month', ${orders.createdAt})`)
          .orderBy(sql`date_trunc('month', ${orders.createdAt}) ASC`);

        let totalOrders = 0;
        let totalGross = 0;
        const series = monthsRes.map((r) => {
          const grossVal = parseFloat(r.gross || '0');
          totalOrders += r.orderCount;
          totalGross += grossVal;
          return {
            bucket: r.bucket,
            order_count: r.orderCount,
            gross: grossVal,
          };
        });

        return success(reply, {
          bucket: 'month',
          series,
          totals: {
            order_count: totalOrders,
            gross: +totalGross.toFixed(2),
          },
        });
      }
    } catch (err: any) {
      return error(reply, err.message || 'Failed to load order stats');
    }
  });
}
