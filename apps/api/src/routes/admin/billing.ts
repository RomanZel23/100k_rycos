import type { FastifyInstance } from 'fastify';
import {
  getDatabase,
  orders,
  companies,
  terminals,
  onboardingOrders,
  platformPricing,
  eq,
  and,
  sql,
  desc,
  gte,
  lte,
  inArray,
  or,
} from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, error } from '../../lib/response.js';
import { paidOrdersOnly } from '../../lib/orderFilters.js';

/** Catalogue item for every seat type a subscription can contain. */
const PLAN_ITEMS: { key: string; planField: string; title: string; fallbackPln: number }[] = [
  { key: 'platform_100k', planField: 'platform_100k', title: 'Platforma 100k-RYCOS', fallbackPln: 199 },
  { key: 'rycos_pf', planField: 'seats_pf', title: 'SBR Pełna (POS + Kasa fiskalna + SoftPOS)', fallbackPln: 89 },
  { key: 'rycos_f', planField: 'seats_f', title: 'SBR Fiskalna (Aplikasa)', fallbackPln: 49 },
  { key: 'rycos_p', planField: 'seats_p', title: 'SBR Płatnicza (SoftPOS)', fallbackPln: 39 },
  { key: 'rycos_0', planField: 'seats_0', title: 'SBR Podstawowa (POS)', fallbackPln: 19 },
];

/**
 * The company's real subscription: the plan it actually bought during onboarding,
 * priced with the current platform price list (all in PLN).
 */
async function loadSubscription(db: ReturnType<typeof getDatabase>, companyId: number) {
  const [row] = await db
    .select({
      months: onboardingOrders.months,
      planDetails: onboardingOrders.planDetails,
      netAmountGrosze: onboardingOrders.netAmountGrosze,
      createdAt: onboardingOrders.createdAt,
      completedAt: onboardingOrders.completedAt,
    })
    .from(onboardingOrders)
    .where(and(eq(onboardingOrders.createdCompanyId, companyId), inArray(onboardingOrders.status, ['paid', 'completed'])))
    .orderBy(desc(onboardingOrders.id))
    .limit(1);

  if (!row) return null;

  const priceRows = await db.select().from(platformPricing);
  const priceMap = new Map(priceRows.map((r) => [r.itemKey, r.monthlyPricePln]));
  const plan = (row.planDetails ?? {}) as Record<string, number>;

  const items = PLAN_ITEMS.map((item) => {
    const qty = Number(plan[item.planField] ?? 0) || 0;
    const unit = priceMap.get(item.key) ?? item.fallbackPln;
    return { key: item.key, title: item.title, qty, monthly_price_pln: unit, monthly_total_pln: qty * unit };
  }).filter((i) => i.qty > 0);

  const monthlyNetPln = items.reduce((sum, i) => sum + i.monthly_total_pln, 0);
  const months = row.months || 1;
  const paidAt = row.completedAt || row.createdAt;
  const validUntil = paidAt ? new Date(paidAt.getTime()) : null;
  if (validUntil) validUntil.setMonth(validUntil.getMonth() + months);

  return {
    items,
    monthly_net_pln: monthlyNetPln,
    months,
    prepaid_net_pln: row.netAmountGrosze ? row.netAmountGrosze / 100 : monthlyNetPln * months,
    paid_at: paidAt ? paidAt.toISOString() : null,
    valid_until: validUntil ? validUntil.toISOString() : null,
    label: months > 1 ? `Abonament ${months} mies.` : 'Abonament miesięczny',
  };
}

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

      // Current month — paid orders only (same rule as every other revenue figure)
      const monthOrdersRes = await db
        .select({
          ordersCount: sql<number>`count(*)::int`,
          salesGross: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.companyId, companyId),
            paidOrdersOnly(),
            gte(orders.createdAt, startOfMonth),
            lte(orders.createdAt, endOfMonth)
          )
        );

      const ordersCount = monthOrdersRes[0]?.ordersCount ?? 0;
      const salesGross = parseFloat(monthOrdersRes[0]?.salesGross || '0');

      // Transaction commission (1.0% of paid sales)
      const commissionPct = 1.0;
      const commission = +(salesGross * (commissionPct / 100)).toFixed(2);

      const subscription = await loadSubscription(db, companyId);
      const baseMonthlyPln = subscription?.monthly_net_pln ?? 0;

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
            paidOrdersOnly(),
            gte(orders.createdAt, startOfMonth),
            lte(orders.createdAt, endOfMonth)
          )
        )
        .groupBy(orders.terminalId)
        .orderBy(desc(sql`sum(${orders.totalAmount})`));

      // Resolve station names: orders carry either the station code (SZSM99V3) or,
      // for older rows, the numeric terminal row id.
      const rawIds = byTerminalRes.map((t) => (t.terminalId || '').trim()).filter((v) => v !== '');
      const numericIds = rawIds.filter((v) => /^\d+$/.test(v)).map((v) => parseInt(v, 10));
      const codeIds = rawIds.filter((v) => !/^\d+$/.test(v)).map((v) => v.toUpperCase());

      const idConditions = [
        ...(codeIds.length ? [inArray(terminals.terminalId, codeIds)] : []),
        ...(numericIds.length ? [inArray(terminals.id, numericIds)] : []),
      ];
      const terminalRows = idConditions.length
        ? await db
            .select({ id: terminals.id, terminalId: terminals.terminalId, name: terminals.name, role: terminals.role })
            .from(terminals)
            .where(and(eq(terminals.companyId, companyId), idConditions.length === 1 ? idConditions[0] : or(...idConditions)))
        : [];
      const byCode = new Map(terminalRows.map((t) => [t.terminalId.toUpperCase(), t]));
      const byRowId = new Map(terminalRows.map((t) => [String(t.id), t]));

      const byTerminal = byTerminalRes.map((t) => {
        const raw = (t.terminalId || '').trim();
        const match = raw ? byCode.get(raw.toUpperCase()) || byRowId.get(raw) : undefined;
        const grossVal = parseFloat(t.gross || '0');
        return {
          terminal_id: match?.terminalId ?? (raw || null),
          terminal_name: match?.name ?? null,
          terminal_role: match?.role ?? null,
          // a station that no longer exists still has to show its historical sales
          unknown_terminal: Boolean(raw) && !match,
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
        subscription,
        base_monthly_pln: baseMonthlyPln,
        base_currency: 'PLN',
        estimated_total_pln: +(baseMonthlyPln + commission).toFixed(2),
        by_terminal: byTerminal,
        note: 'Liczone są wyłącznie zamówienia opłacone (gotówka, karta, płatność online). Otwarte rachunki i anulowane zamówienia nie wchodzą do podstawy prowizji.',
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
              paidOrdersOnly(),
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
              paidOrdersOnly(),
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
