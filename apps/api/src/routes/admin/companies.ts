import type { FastifyInstance } from 'fastify';
import { getDatabase, companies, brands, eq, desc } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';

export async function adminCompaniesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/companies/me - Current company details
  fastify.get('/v1/admin/companies/me', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      return notFound(reply, 'Company not found');
    }

    return success(reply, company);
  });

  // PUT /v1/admin/companies/me - Update company settings
  fastify.put('/v1/admin/companies/me', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.email !== undefined) updateData.email = body.email;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.country !== undefined) updateData.country = body.country;
    if (body.isAcceptingOrders !== undefined) updateData.isAcceptingOrders = Boolean(body.isAcceptingOrders);

    try {
      const [updated] = await db
        .update(companies)
        .set(updateData)
        .where(eq(companies.id, companyId))
        .returning();

      return success(reply, updated, 'Company updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update company');
    }
  });

  // GET /v1/admin/brands - List brands for company
  fastify.get('/v1/admin/brands', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const rows = await db
      .select()
      .from(brands)
      .where(eq(brands.companyId, companyId))
      .orderBy(desc(brands.id));

    const mapped = rows.map((r) => ({
      ...r,
      qr_slug: r.slug,
      menu_layout: 'standard',
      product_count: 0,
    }));

    return success(reply, mapped, 'Brands retrieved');
  });

  // POST /v1/admin/brands - Create brand
  fastify.post('/v1/admin/brands', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    const brandName = body.name ? String(body.name).trim() : '';
    let brandSlug = body.slug ? String(body.slug).trim().toLowerCase() : '';
    if (!brandSlug && brandName) {
      brandSlug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    if (!brandName || !brandSlug) {
      return validationError(reply, {
        name: !brandName ? 'name is required' : '',
        slug: !brandSlug ? 'slug is required' : '',
      });
    }

    try {
      const [inserted] = await db
        .insert(brands)
        .values({
          companyId,
          name: brandName,
          slug: brandSlug,
          logoUrl: body.logoUrl || null,
          bannerUrl: body.bannerUrl || null,
          locationId: body.locationId ? parseInt(String(body.locationId), 10) : null,
          isActive: body.isActive !== false,
        })
        .returning();

      return success(reply, {
        ...inserted,
        qr_slug: inserted.slug,
      }, 'Brand created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create brand');
    }
  });
}
