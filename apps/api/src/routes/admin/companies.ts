import type { FastifyInstance } from 'fastify';
import { getDatabase, companies, brands, brandProducts, eq, and, desc, inArray } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import { uploadImageToSupabase, deleteImageFromSupabase } from '../../lib/storage.js';

export async function adminCompaniesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  const getCompanyHandler = async (req: any, reply: any) => {
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

    return success(reply, {
      ...company,
      is_accepting_orders: company.isAcceptingOrders,
      business_type: 'product',
    });
  };

  // GET /v1/admin/companies - Current company details
  fastify.get('/v1/admin/companies', getCompanyHandler);
  fastify.get('/v1/admin/companies/me', getCompanyHandler);
  fastify.get('/v1/admin/companies/details', getCompanyHandler);

  const updateCompanyHandler = async (req: any, reply: any) => {
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
    if (body.isAcceptingOrders !== undefined || body.is_accepting_orders !== undefined) {
      updateData.isAcceptingOrders = Boolean(body.isAcceptingOrders ?? body.is_accepting_orders);
    }

    try {
      const [updated] = await db
        .update(companies)
        .set(updateData)
        .where(eq(companies.id, companyId))
        .returning();

      return success(reply, {
        ...updated,
        is_accepting_orders: updated.isAcceptingOrders,
        business_type: 'product',
      }, 'Company updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update company');
    }
  };

  // PUT /v1/admin/companies - Update company settings
  fastify.put('/v1/admin/companies', updateCompanyHandler);
  fastify.put('/v1/admin/companies/me', updateCompanyHandler);

  // PATCH /v1/admin/companies/accepting-orders - Toggle order intake
  fastify.patch('/v1/admin/companies/accepting-orders', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const isAccepting = Boolean(body.is_accepting_orders ?? body.isAcceptingOrders);

    const [updated] = await db
      .update(companies)
      .set({ isAcceptingOrders: isAccepting, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
      .returning();

    return success(reply, {
      ...updated,
      is_accepting_orders: updated.isAcceptingOrders,
    }, 'Order acceptance updated');
  });

  // Settings in-memory / company storage
  const inMemorySettings: Record<number, Record<string, boolean>> = {};

  // GET /v1/admin/companies/settings - List company feature settings
  fastify.get('/v1/admin/companies/settings', async (req, reply) => {
    const companyId = getCompanyId(req);
    const compSettings = inMemorySettings[companyId] ?? {
      onboarding_locations_ack: false,
      onboarding_team_ack: false,
    };
    const list = Object.entries(compSettings).map(([k, v]) => ({
      feature_key: k,
      is_enabled: v,
    }));
    return success(reply, list);
  });

  // GET /v1/admin/companies/settings/:featureKey
  fastify.get('/v1/admin/companies/settings/:featureKey', async (req, reply) => {
    const { featureKey } = req.params as { featureKey: string };
    const companyId = getCompanyId(req);
    const compSettings = inMemorySettings[companyId] ?? {};
    return success(reply, {
      feature_key: featureKey,
      is_enabled: compSettings[featureKey] ?? false,
    });
  });

  // PUT /v1/admin/companies/settings/:featureKey
  fastify.put('/v1/admin/companies/settings/:featureKey', async (req, reply) => {
    const { featureKey } = req.params as { featureKey: string };
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const isEnabled = Boolean(body.is_enabled ?? body.isEnabled);

    inMemorySettings[companyId] ??= {};
    inMemorySettings[companyId][featureKey] = isEnabled;

    return success(reply, {
      feature_key: featureKey,
      is_enabled: isEnabled,
    }, 'Setting updated');
  });

  // GET /v1/admin/companies/languages
  fastify.get('/v1/admin/companies/languages', async (_req, reply) => {
    return success(reply, ['pl', 'en', 'de']);
  });

  // PUT /v1/admin/companies/languages
  fastify.put('/v1/admin/companies/languages', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    return success(reply, body.codes ?? ['pl', 'en', 'de'], 'Languages saved');
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

    const brandIds = rows.map((b) => b.id);
    const productsCountMap: Record<number, number> = {};

    if (brandIds.length > 0) {
      const bProducts = await db
        .select()
        .from(brandProducts)
        .where(inArray(brandProducts.brandId, brandIds));
      for (const bp of bProducts) {
        productsCountMap[bp.brandId] = (productsCountMap[bp.brandId] || 0) + 1;
      }
    }

    const mapped = rows.map((r) => ({
      ...r,
      qr_slug: r.slug,
      menu_layout: 'standard',
      product_count: productsCountMap[r.id] || 0,
    }));

    return success(reply, mapped, 'Brands retrieved');
  });

  // GET /v1/admin/brands/:id - Brand details
  fastify.get('/v1/admin/brands/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const brandId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [brand] = await db
      .select()
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.companyId, companyId)))
      .limit(1);

    if (!brand) {
      return notFound(reply, 'Brand not found');
    }

    const assigned = await db
      .select()
      .from(brandProducts)
      .where(eq(brandProducts.brandId, brandId));

    return success(reply, {
      ...brand,
      qr_slug: brand.slug,
      menu_layout: 'list',
      language: 'pl',
      currency: 'PLN',
      style: null,
      product_ids: assigned.map((p) => p.productId),
      images: {
        header: brand.bannerUrl ?? null,
        logo: brand.logoUrl ?? null,
        footer: (brand as any).footerUrl ?? null,
      },
    });
  });

  // POST /v1/admin/brands/:id/image - Upload brand image (logo, header/banner, footer)
  fastify.post('/v1/admin/brands/:id/image', async (req, reply) => {
    const { id } = req.params as { id: string };
    const brandId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const query = (req.query ?? {}) as { type?: string };
    const rawType = (query.type || 'logo').toLowerCase();
    const type = rawType === 'header' || rawType === 'banner' ? 'header' : rawType === 'footer' ? 'footer' : 'logo';

    const db = getDatabase();

    const file = await req.file();
    if (!file) {
      return validationError(reply, { image: 'No image file uploaded' });
    }

    try {
      const buffer = await file.toBuffer();
      const imageUrl = await uploadImageToSupabase(buffer, file.mimetype, file.filename);

      const [existing] = await db
        .select()
        .from(brands)
        .where(and(eq(brands.id, brandId), eq(brands.companyId, companyId)))
        .limit(1);

      if (!existing) {
        return notFound(reply, 'Brand not found');
      }

      const updateData: Record<string, any> = {};
      if (type === 'logo') updateData.logoUrl = imageUrl;
      else if (type === 'header') updateData.bannerUrl = imageUrl;
      else if (type === 'footer') (updateData as any).footerUrl = imageUrl;

      const [updated] = await db
        .update(brands)
        .set(updateData)
        .where(and(eq(brands.id, brandId), eq(brands.companyId, companyId)))
        .returning();

      return success(reply, {
        id: updated.id,
        type,
        imageUrl,
        images: {
          header: updated.bannerUrl ?? null,
          logo: updated.logoUrl ?? null,
          footer: (updated as any).footerUrl ?? null,
        },
      }, `${type.charAt(0).toUpperCase() + type.slice(1)} uploaded successfully`);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to upload brand image');
    }
  });

  // DELETE /v1/admin/brands/:id/image - Remove brand image
  fastify.delete('/v1/admin/brands/:id/image', async (req, reply) => {
    const { id } = req.params as { id: string };
    const brandId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const query = (req.query ?? {}) as { type?: string };
    const rawType = (query.type || 'logo').toLowerCase();
    const type = rawType === 'header' || rawType === 'banner' ? 'header' : rawType === 'footer' ? 'footer' : 'logo';

    const db = getDatabase();

    try {
      const [existing] = await db
        .select()
        .from(brands)
        .where(and(eq(brands.id, brandId), eq(brands.companyId, companyId)))
        .limit(1);

      if (!existing) {
        return notFound(reply, 'Brand not found');
      }

      let oldUrl: string | null = null;
      const updateData: Record<string, any> = {};
      if (type === 'logo') {
        oldUrl = existing.logoUrl;
        updateData.logoUrl = null;
      } else if (type === 'header') {
        oldUrl = existing.bannerUrl;
        updateData.bannerUrl = null;
      } else if (type === 'footer') {
        oldUrl = (existing as any).footerUrl;
        (updateData as any).footerUrl = null;
      }

      if (oldUrl) {
        await deleteImageFromSupabase(oldUrl).catch(() => {});
      }

      const [updated] = await db
        .update(brands)
        .set(updateData)
        .where(and(eq(brands.id, brandId), eq(brands.companyId, companyId)))
        .returning();

      return success(reply, {
        id: updated.id,
        type,
        images: {
          header: updated.bannerUrl ?? null,
          logo: updated.logoUrl ?? null,
          footer: (updated as any).footerUrl ?? null,
        },
      }, `${type} image removed`);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to remove brand image');
    }
  });

  // PUT /v1/admin/brands/:id - Update brand
  fastify.put('/v1/admin/brands/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const brandId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const db = getDatabase();

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();

    const [updated] = await db
      .update(brands)
      .set(updateData)
      .where(and(eq(brands.id, brandId), eq(brands.companyId, companyId)))
      .returning();

    if (!updated) {
      return notFound(reply, 'Brand not found');
    }

    return success(reply, {
      ...updated,
      qr_slug: updated.slug,
    }, 'Brand updated');
  });

  // PUT /v1/admin/brands/:id/products - Assign products to brand
  fastify.put('/v1/admin/brands/:id/products', async (req, reply) => {
    const { id } = req.params as { id: string };
    const brandId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const db = getDatabase();

    const rawList = Array.isArray(body.product_ids)
      ? body.product_ids
      : Array.isArray(body.productIds)
      ? body.productIds
      : [];
    const targetIds: number[] = rawList.map((x: any) => parseInt(String(x), 10)).filter(Number.isFinite);

    const [brand] = await db
      .select()
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.companyId, companyId)))
      .limit(1);

    if (!brand) {
      return notFound(reply, 'Brand not found');
    }

    await db.delete(brandProducts).where(eq(brandProducts.brandId, brandId));

    if (targetIds.length > 0) {
      await db
        .insert(brandProducts)
        .values(targetIds.map((pid: number) => ({ brandId, productId: pid })))
        .onConflictDoNothing();
    }

    return success(reply, { assigned: targetIds.length }, 'Menu products assigned');
  });

  // DELETE /v1/admin/brands/:id - Delete brand
  fastify.delete('/v1/admin/brands/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const brandId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [deleted] = await db
      .delete(brands)
      .where(and(eq(brands.id, brandId), eq(brands.companyId, companyId)))
      .returning();

    if (!deleted) {
      return notFound(reply, 'Brand not found');
    }

    return success(reply, { id: brandId }, 'Brand deleted');
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
