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

      const compRows = await db
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
          totalVolume: sql<string>`coalesce((SELECT sum(total_amount) FROM orders WHERE orders.company_id = ${companies.id}), 0)`,
        })
        .from(companies)
        .orderBy(desc(companies.createdAt));

      const mappedCompanies = compRows.map((c) => ({
        id: c.id,
        name: c.name,
        nip: null,
        country: c.country,
        currency: c.currency,
        status: c.isAcceptingOrders ? 'active' : 'suspended',
        createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
        ordersCount: c.ordersCount || 0,
        totalVolume: parseFloat(c.totalVolume || '0'),
      }));

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

  // POST /v1/admin/master/companies - Create a new company/tenant
  fastify.post('/v1/admin/master/companies', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const db = getDatabase();

    const companyName = String(body.company_name || body.name || '').trim();
    if (!companyName) {
      return error(reply, 'Nazwa firmy jest wymagana', 400);
    }

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
}

