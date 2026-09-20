import type { FastifyInstance } from 'fastify';
import { getDatabase, companies, orders, locations, brands, platformPricing, eq, sql, desc } from '@rycos/database';
import { requirePlatformAdmin } from '../../middleware/adminAuth.js';
import { paidOrdersOnly } from '../../lib/orderFilters.js';
import { success, notFound, error } from '../../lib/response.js';

export async function adminMasterRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePlatformAdmin);

  // GET /v1/admin/master/overview - Global platform KPIs
  fastify.get('/v1/admin/master/overview', async (_req, reply) => {
    const db = getDatabase();

    try {
      const [totalCompaniesRes] = await db.select({ count: sql<number>`count(*)::int` }).from(companies);
      const [activeCompaniesRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(companies)
        .where(eq(companies.isAcceptingOrders, true));

      // GMV = paid orders only (see lib/orderFilters)
      const [ordersStats] = await db.select({
        totalOrders: sql<number>`count(*)::int`,
        totalVolume: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
      }).from(orders).where(paidOrdersOnly());

      const [signups7d] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(companies).where(sql`${companies.createdAt} >= NOW() - INTERVAL '7 days'`);

      const [signups30d] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(companies).where(sql`${companies.createdAt} >= NOW() - INTERVAL '30 days'`);

      const compRows = await db
        .select({
          id: companies.id,
          name: companies.name,
          slug: companies.slug,
          nip: companies.nip,
          email: companies.email,
          country: companies.country,
          currency: companies.currency,
          isAcceptingOrders: companies.isAcceptingOrders,
          createdAt: companies.createdAt,
        })
        .from(companies)
        .orderBy(desc(companies.createdAt));

      // One grouped pass over orders instead of a correlated sub-select per company
      const perCompany = await db
        .select({
          companyId: orders.companyId,
          ordersCount: sql<number>`count(*)::int`,
          totalVolume: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
        })
        .from(orders)
        .where(paidOrdersOnly())
        .groupBy(orders.companyId);
      const statsByCompany = new Map(perCompany.map((r) => [Number(r.companyId), r]));

      const mappedCompanies = compRows.map((c) => {
        const stats = statsByCompany.get(Number(c.id));
        return {
          id: c.id,
          name: c.name,
          nip: c.nip,
          country: c.country,
          currency: c.currency,
          status: c.isAcceptingOrders ? 'active' : 'suspended',
          createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
          ordersCount: stats?.ordersCount ?? 0,
          orders_count: stats?.ordersCount ?? 0,
          totalVolume: parseFloat(stats?.totalVolume || '0'),
          total_volume: parseFloat(stats?.totalVolume || '0'),
        };
      });

      return success(reply, {
        totalCompanies: totalCompaniesRes?.count || 0,
        total_companies: totalCompaniesRes?.count || 0,
        activeCompanies: activeCompaniesRes?.count || 0,
        active_companies: activeCompaniesRes?.count || 0,
        totalOrders: ordersStats?.totalOrders || 0,
        total_orders: ordersStats?.totalOrders || 0,
        totalVolume: parseFloat(ordersStats?.totalVolume || '0'),
        total_volume: parseFloat(ordersStats?.totalVolume || '0'),
        signups7d: signups7d?.count || 0,
        signups_7d: signups7d?.count || 0,
        signups30d: signups30d?.count || 0,
        signups_30d: signups30d?.count || 0,
        companies: mappedCompanies,
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
        })
        .from(companies)
        .orderBy(desc(companies.createdAt));

      const [orderStats, brandStats, locationStats] = await Promise.all([
        db.select({ companyId: orders.companyId, cnt: sql<number>`count(*)::int`, volume: sql<string>`coalesce(sum(${orders.totalAmount}), 0)` }).from(orders).where(paidOrdersOnly()).groupBy(orders.companyId),
        db.select({ companyId: brands.companyId, cnt: sql<number>`count(*)::int` }).from(brands).groupBy(brands.companyId),
        db.select({ companyId: locations.companyId, cnt: sql<number>`count(*)::int` }).from(locations).groupBy(locations.companyId),
      ]);
      const orderMap = new Map(orderStats.map((r) => [Number(r.companyId), r]));
      const brandMap = new Map(brandStats.map((r) => [Number(r.companyId), r.cnt]));
      const locationMap = new Map(locationStats.map((r) => [Number(r.companyId), r.cnt]));

      const withCounts = rows.map((c) => ({
        ...c,
        ordersCount: orderMap.get(Number(c.id))?.cnt ?? 0,
        orders_count: orderMap.get(Number(c.id))?.cnt ?? 0,
        totalVolume: parseFloat(orderMap.get(Number(c.id))?.volume || '0'),
        total_volume: parseFloat(orderMap.get(Number(c.id))?.volume || '0'),
        brandsCount: brandMap.get(Number(c.id)) ?? 0,
        brands_count: brandMap.get(Number(c.id)) ?? 0,
        locationsCount: locationMap.get(Number(c.id)) ?? 0,
        locations_count: locationMap.get(Number(c.id)) ?? 0,
      }));

      return success(reply, withCounts, 'Companies retrieved');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to list companies');
    }
  });

  // POST /v1/admin/master/companies - Create a new company/tenant
  fastify.post('/v1/admin/master/companies', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const db = getDatabase();

    const companyName = String(body.company_name || body.name || '').trim();
    if (!companyName) {
      return error(reply, 'Nazwa firmy jest wymagana', 400);
    }

    const nip = body.nip ? String(body.nip).trim() : null;
    const email = String(body.email || '').trim().toLowerCase();
    const country = String(body.country || 'PL').trim().toUpperCase();
    const currency = String(body.currency || 'PLN').trim().toUpperCase();
    const businessType = String(body.business_type || 'product').trim();
    const address = body.address ? String(body.address).trim() : null;
    const phone = body.phone ? String(body.phone).trim() : null;
    const ownerName = body.owner_name ? String(body.owner_name).trim() : companyName;
    const ownerPassword = body.owner_password ? String(body.owner_password).trim() : 'Start@123';

    // Generate unique slug
    let baseSlug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!baseSlug) baseSlug = `company-${Date.now()}`;

    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const [existing] = await db.select().from(companies).where(eq(companies.slug, slug)).limit(1);
      if (!existing) break;
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    try {
      const [newCompany] = await db
        .insert(companies)
        .values({
          name: companyName,
          slug,
          nip,
          email: email || `${slug}@rycos.eu`,
          country,
          currency,
          businessType,
          address,
          phone,
          isAcceptingOrders: true,
        })
        .returning();

      // Create default location
      const [defaultLocation] = await db
        .insert(locations)
        .values({
          companyId: newCompany.id,
          name: 'Lokal Główny',
          address: address || null,
          isActive: true,
        })
        .returning();

      // Create default brand
      const [defaultBrand] = await db
        .insert(brands)
        .values({
          companyId: newCompany.id,
          locationId: defaultLocation.id,
          name: companyName,
          slug: `${slug}-menu`,
          currency,
          menuLayout: 'list',
          language: 'pl',
          isActive: true,
        })
        .returning();

      return success(reply, {
        ...newCompany,
        defaultLocationId: defaultLocation.id,
        defaultBrandId: defaultBrand.id,
        defaultBrandSlug: defaultBrand.slug,
      }, 'Firma została pomyślnie utworzona');
    } catch (err: any) {
      return error(reply, err.message || 'Nie udało się utworzyć firmy');
    }
  });

  // PUT /v1/admin/master/companies/:companyId/status - Update company status (active / suspended)
  fastify.put('/v1/admin/master/companies/:companyId/status', async (req, reply) => {
    const { companyId } = req.params as { companyId: string };
    const body = (req.body ?? {}) as any;
    const db = getDatabase();
    const id = parseInt(companyId, 10);
    if (!id || isNaN(id)) return error(reply, 'Nieprawidłowe ID firmy', 400);

    const rawStatus = String(body.status || '').trim().toLowerCase();
    const isAcceptingOrders = rawStatus === 'active';
    const licenseStatus = rawStatus === 'active' ? 'active' : 'suspended';

    try {
      const [updated] = await db
        .update(companies)
        .set({
          isAcceptingOrders,
          licenseStatus,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, id))
        .returning();

      if (!updated) return error(reply, 'Nie znaleziono firmy', 404);

      return success(
        reply,
        {
          id: updated.id,
          name: updated.name,
          status: updated.isAcceptingOrders ? 'active' : 'suspended',
          isAcceptingOrders: updated.isAcceptingOrders,
        },
        isAcceptingOrders ? 'Firma została aktywowana' : 'Firma została zawieszona'
      );
    } catch (err: any) {
      return error(reply, err.message || 'Nie udało się zmienić statusu firmy', 500);
    }
  });

  // GET /v1/admin/master/pricing - Get current shop pricing
  fastify.get('/v1/admin/master/pricing', async (_req, reply) => {
    try {
      const db = getDatabase();
      const rows = await db.select().from(platformPricing);
      return success(reply, rows, 'Pricing list retrieved');
    } catch (err: any) {
      return success(reply, [], 'Pricing list fallback');
    }
  });

  // PUT /v1/admin/master/pricing - Update pricing items
  fastify.put('/v1/admin/master/pricing', async (req, reply) => {
    try {
      const db = getDatabase();
      const body = (req.body ?? {}) as any;
      const items = Array.isArray(body.items) ? body.items : [];

      for (const item of items) {
        if (!item.itemKey && !item.item_key) continue;
        const key = String(item.itemKey || item.item_key);
        const title = String(item.title || key);
        const description = item.description ? String(item.description) : null;
        const monthlyPricePln = parseInt(String(item.monthlyPricePln || item.monthly_price_pln || 0), 10);
        const discount6mPercent = parseInt(String(item.discount6mPercent ?? item.discount_6m_percent ?? 10), 10);
        const discount12mPercent = parseInt(String(item.discount12mPercent ?? item.discount_12m_percent ?? 20), 10);

        await db
          .insert(platformPricing)
          .values({
            itemKey: key,
            title,
            description,
            monthlyPricePln,
            discount6mPercent,
            discount12mPercent,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: platformPricing.itemKey,
            set: {
              title,
              description,
              monthlyPricePln,
              discount6mPercent,
              discount12mPercent,
              updatedAt: new Date(),
            },
          });
      }

      const updated = await db.select().from(platformPricing);
      return success(reply, updated, 'Cennik został pomyślnie zaktualizowany');
    } catch (err: any) {
      return error(reply, err.message || 'Nie udało się zapisać cennika', 500);
    }
  });
}

