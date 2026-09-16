import type { FastifyInstance } from 'fastify';
import { getDatabase, getRawClient, companies, companySettings, brands, brandProducts, eq, and, desc, inArray } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import { uploadImageToSupabase, deleteImageFromSupabase } from '../../lib/storage.js';
import { invalidateBrandMenuCache } from '../../services/catalogService.js';

let brandsColumnsChecked = false;
async function ensureBrandColumns() {
  if (brandsColumnsChecked) return;
  const raw = getRawClient();
  if (!raw) return;
  try {
    await raw.unsafe(`
      CREATE TABLE IF NOT EXISTS "company_settings" (
        "id" serial PRIMARY KEY NOT NULL,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
        "feature_key" varchar(64) NOT NULL,
        "is_enabled" boolean DEFAULT false NOT NULL,
        "config" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "company_settings_company_feature_unique" UNIQUE("company_id", "feature_key")
      );
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "nip" varchar(32);
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "address" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "phone" varchar(64);
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "business_type" varchar(64) DEFAULT 'product';
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_language" varchar(8) DEFAULT 'pl';
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "terms_and_conditions" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "privacy_policy" text;
      ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "menu_layout" varchar(32) DEFAULT 'list';
      ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "language" varchar(8) DEFAULT 'pl';
      ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "currency" varchar(8) DEFAULT 'PLN';
      ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "style" text;
      ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "footer_url" text;
      ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "allow_pay_at_counter" boolean DEFAULT false;
    `);
    brandsColumnsChecked = true;
  } catch (err) {
    console.warn('[Brands] Notice during column check:', err);
  }
}

export async function adminCompaniesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  const getCompanyHandler = async (req: any, reply: any) => {
    await ensureBrandColumns();
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
      nip: company.nip || '',
      is_accepting_orders: company.isAcceptingOrders,
      business_type: company.businessType || 'product',
      address: company.address || '',
      phone: company.phone || '',
      default_language: company.defaultLanguage || 'pl',
      terms_and_conditions: company.termsAndConditions || null,
      privacy_policy: company.privacyPolicy || null,
    });
  };

  // GET /v1/admin/companies - Current company details
  fastify.get('/v1/admin/companies', getCompanyHandler);
  fastify.get('/v1/admin/companies/me', getCompanyHandler);
  fastify.get('/v1/admin/companies/details', getCompanyHandler);

  const updateCompanyHandler = async (req: any, reply: any) => {
    await ensureBrandColumns();
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.nip !== undefined) updateData.nip = String(body.nip).trim().replace(/\D/g, '');
    if (body.email !== undefined) updateData.email = body.email;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.country !== undefined) updateData.country = body.country;
    if (body.address !== undefined) updateData.address = String(body.address).trim();
    if (body.phone !== undefined) updateData.phone = String(body.phone).trim();
    if (body.business_type !== undefined) updateData.businessType = String(body.business_type).trim();
    if (body.default_language !== undefined) updateData.defaultLanguage = String(body.default_language).trim().toLowerCase();
    if (body.terms_and_conditions !== undefined) updateData.termsAndConditions = String(body.terms_and_conditions);
    if (body.privacy_policy !== undefined) updateData.privacyPolicy = String(body.privacy_policy);
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
        nip: updated.nip || '',
        is_accepting_orders: updated.isAcceptingOrders,
        business_type: updated.businessType || 'product',
        address: updated.address || '',
        phone: updated.phone || '',
        default_language: updated.defaultLanguage || 'pl',
        terms_and_conditions: updated.termsAndConditions || null,
        privacy_policy: updated.privacyPolicy || null,
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

  // GET /v1/admin/companies/settings - List company feature settings
  fastify.get('/v1/admin/companies/settings', async (req, reply) => {
    await ensureBrandColumns();
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const rows = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, companyId));

    const existingMap = new Map(rows.map((r) => [r.featureKey, r.isEnabled]));

    // Core feature keys default to true if not yet explicitly saved
    const CORE_KEYS = ['show_sharing', 'show_tnc', 'show_pp', 'show_receipt_qr'];
    for (const k of CORE_KEYS) {
      if (!existingMap.has(k)) {
        existingMap.set(k, true);
      }
    }

    const list = Array.from(existingMap.entries()).map(([k, v]) => ({
      feature_key: k,
      is_enabled: v,
    }));
    return success(reply, list);
  });

  // GET /v1/admin/companies/settings/:featureKey
  fastify.get('/v1/admin/companies/settings/:featureKey', async (req, reply) => {
    await ensureBrandColumns();
    const db = getDatabase();
    const { featureKey } = req.params as { featureKey: string };
    const companyId = getCompanyId(req);
    const [row] = await db
      .select()
      .from(companySettings)
      .where(and(eq(companySettings.companyId, companyId), eq(companySettings.featureKey, featureKey)))
      .limit(1);

    return success(reply, {
      feature_key: featureKey,
      is_enabled: row ? row.isEnabled : true,
    });
  });

  // PUT /v1/admin/companies/settings/:featureKey
  fastify.put('/v1/admin/companies/settings/:featureKey', async (req, reply) => {
    await ensureBrandColumns();
    const db = getDatabase();
    const { featureKey } = req.params as { featureKey: string };
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const isEnabled = Boolean(body.is_enabled ?? body.isEnabled);

    const raw = getRawClient();
    if (raw) {
      await raw.unsafe(`
        INSERT INTO company_settings (company_id, feature_key, is_enabled, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (company_id, feature_key) DO UPDATE SET
          is_enabled = EXCLUDED.is_enabled,
          updated_at = NOW()
      `, [companyId, featureKey, isEnabled]);
    }

    // Invalidate brand menus cache
    try {
      const companyBrands = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.companyId, companyId));
      for (const b of companyBrands) {
        await invalidateBrandMenuCache(b.id);
      }
    } catch {}

    return success(reply, {
      feature_key: featureKey,
      is_enabled: isEnabled,
    }, 'Setting updated');
  });

  const inMemoryCompanyLanguages: Record<number, string[]> = {};

  const ALL_SUPPORTED_LANGUAGES = [
    { code: 'pl', name: 'Polish', native_name: 'Polski' },
    { code: 'en', name: 'English', native_name: 'English' },
    { code: 'de', name: 'German', native_name: 'Deutsch' },
  ];

  // GET /v1/admin/languages - All available languages
  fastify.get('/v1/admin/languages', async (_req, reply) => {
    return success(reply, ALL_SUPPORTED_LANGUAGES);
  });

  // GET /v1/admin/companies/languages
  fastify.get('/v1/admin/companies/languages', async (req, reply) => {
    const companyId = getCompanyId(req);
    const active = inMemoryCompanyLanguages[companyId] || ['pl', 'en', 'de'];
    return success(reply, active.map((code: string) => ({ language_code: code })));
  });

  // PUT /v1/admin/companies/languages
  fastify.put('/v1/admin/companies/languages', async (req, reply) => {
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const codes: string[] = Array.isArray(body.codes) ? body.codes : ['pl', 'en', 'de'];
    inMemoryCompanyLanguages[companyId] = codes;
    return success(reply, codes.map((code: string) => ({ language_code: code })), 'Languages saved');
  });

  // GET /v1/admin/brands - List brands for company
  fastify.get('/v1/admin/brands', async (req, reply) => {
    await ensureBrandColumns();
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
      is_active: r.isActive !== false,
      isActive: r.isActive !== false,
      qr_slug: r.slug,
      menu_layout: (r as any).menuLayout || 'list',
      language: (r as any).language || 'pl',
      currency: (r as any).currency || 'PLN',
      allow_pay_at_counter: (r as any).allowPayAtCounter ?? false,
      product_count: productsCountMap[r.id] || 0,
    }));

    return success(reply, mapped, 'Brands retrieved');
  });

  // GET /v1/admin/brands/:id - Brand details
  fastify.get('/v1/admin/brands/:id', async (req, reply) => {
    await ensureBrandColumns();
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
      is_active: brand.isActive !== false,
      isActive: brand.isActive !== false,
      allow_pay_at_counter: (brand as any).allowPayAtCounter ?? false,
      allowPayAtCounter: (brand as any).allowPayAtCounter ?? false,
      qr_slug: brand.slug,
      menu_layout: (brand as any).menuLayout || 'list',
      language: (brand as any).language || 'pl',
      currency: (brand as any).currency || 'PLN',
      style: (brand as any).style || null,
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

      invalidateBrandMenuCache(brandId).catch(() => {});

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

      invalidateBrandMenuCache(brandId).catch(() => {});

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

function generateShortSlug(length = 5): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let slug = '';
  for (let i = 0; i < length; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

  // PUT /v1/admin/brands/:id - Update brand
  fastify.put('/v1/admin/brands/:id', async (req, reply) => {
    await ensureBrandColumns();
    const { id } = req.params as { id: string };
    const brandId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const db = getDatabase();

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.slug !== undefined || body.qr_slug !== undefined) {
      const raw = String(body.slug ?? body.qr_slug).trim().toLowerCase();
      if (raw) {
        updateData.slug = raw.replace(/[^a-z0-9_-]/g, '');
      }
    }
    if (body.menu_layout !== undefined || body.menuLayout !== undefined) {
      updateData.menuLayout = String(body.menu_layout ?? body.menuLayout).trim();
    }
    if (body.language !== undefined) {
      updateData.language = String(body.language).trim().toLowerCase();
    }
    if (body.currency !== undefined) {
      updateData.currency = String(body.currency).trim().toUpperCase();
    }
    if (body.active_button_color !== undefined || body.background_button_color !== undefined) {
      updateData.style = JSON.stringify({
        active_button_color: body.active_button_color || '0xFFFF8800',
        background_button_color: body.background_button_color || 'black',
      });
    } else if (body.style !== undefined) {
      updateData.style = typeof body.style === 'string' ? body.style : JSON.stringify(body.style);
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      updateData.isActive = Boolean(body.is_active ?? body.isActive);
    }
    if (body.allow_pay_at_counter !== undefined || body.allowPayAtCounter !== undefined) {
      updateData.allowPayAtCounter = Boolean(body.allow_pay_at_counter ?? body.allowPayAtCounter);
    }

    const [updated] = await db
      .update(brands)
      .set(updateData)
      .where(and(eq(brands.id, brandId), eq(brands.companyId, companyId)))
      .returning();

    if (!updated) {
      return notFound(reply, 'Brand not found');
    }

    invalidateBrandMenuCache(brandId).catch(() => {});

    return success(reply, {
      ...updated,
      is_active: updated.isActive !== false,
      isActive: updated.isActive !== false,
      allow_pay_at_counter: (updated as any).allowPayAtCounter ?? false,
      allowPayAtCounter: (updated as any).allowPayAtCounter ?? false,
      qr_slug: updated.slug,
      menu_layout: updated.menuLayout,
      language: updated.language,
      currency: updated.currency,
      style: updated.style,
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

    invalidateBrandMenuCache(brandId).catch(() => {});

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

    invalidateBrandMenuCache(brandId).catch(() => {});

    return success(reply, { id: brandId }, 'Brand deleted');
  });

  // POST /v1/admin/brands - Create brand
  fastify.post('/v1/admin/brands', async (req, reply) => {
    await ensureBrandColumns();
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    const brandName = body.name ? String(body.name).trim() : '';
    let brandSlug = body.slug ? String(body.slug).trim().toLowerCase() : '';
    // Short non-meaningful random slug like 'g2d6a' by default
    if (!brandSlug) {
      brandSlug = generateShortSlug(5);
    }

    if (!brandName) {
      return validationError(reply, {
        name: 'name is required',
      });
    }

    try {
      const [inserted] = await db
        .insert(brands)
        .values({
          companyId,
          name: brandName,
          slug: brandSlug,
          menuLayout: body.menu_layout || body.menuLayout || 'list',
          language: body.language || 'pl',
          currency: body.currency || 'PLN',
          style: body.style ? (typeof body.style === 'string' ? body.style : JSON.stringify(body.style)) : null,
          logoUrl: body.logoUrl || null,
          bannerUrl: body.bannerUrl || null,
          footerUrl: body.footerUrl || null,
          locationId: body.locationId ? parseInt(String(body.locationId), 10) : null,
          isActive: body.isActive !== false,
        })
        .returning();

      return success(reply, {
        ...inserted,
        qr_slug: inserted.slug,
        menu_layout: inserted.menuLayout,
        language: inserted.language,
        currency: inserted.currency,
        style: inserted.style,
      }, 'Brand created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create brand');
    }
  });
}
