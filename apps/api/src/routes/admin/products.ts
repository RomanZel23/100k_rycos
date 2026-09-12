import type { FastifyInstance } from 'fastify';
import { getDatabase, products, categories, brands, contentTranslations, eq, and, desc, sql } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import { uploadImageToSupabase, deleteImageFromSupabase } from '../../lib/storage.js';
import { invalidateBrandMenuCache } from '../../services/catalogService.js';

async function getProductTranslations(db: any, productId: number): Promise<Record<string, Record<string, string>>> {
  const rows = await db
    .select()
    .from(contentTranslations)
    .where(
      and(
        eq(contentTranslations.entityType, 'products'),
        eq(contentTranslations.entityId, productId)
      )
    );
  const result: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    if (!result[r.language]) {
      result[r.language] = {};
    }
    result[r.language][r.attributeName] = r.value;
  }
  return result;
}

async function saveProductTranslations(
  db: any,
  productId: number,
  translations: Record<string, Record<string, string>> | undefined
) {
  if (!translations || typeof translations !== 'object') return;
  for (const [lang, attrs] of Object.entries(translations)) {
    if (!attrs || typeof attrs !== 'object') continue;
    for (const [attr, val] of Object.entries(attrs)) {
      const strVal = String(val ?? '').trim();
      if (strVal) {
        await db
          .insert(contentTranslations)
          .values({
            entityType: 'products',
            entityId: productId,
            language: lang,
            attributeName: attr,
            value: strVal,
          })
          .onConflictDoUpdate({
            target: [
              contentTranslations.entityType,
              contentTranslations.entityId,
              contentTranslations.language,
              contentTranslations.attributeName,
            ],
            set: { value: strVal },
          });
      } else {
        await db
          .delete(contentTranslations)
          .where(
            and(
              eq(contentTranslations.entityType, 'products'),
              eq(contentTranslations.entityId, productId),
              eq(contentTranslations.language, lang),
              eq(contentTranslations.attributeName, attr)
            )
          );
      }
    }
  }
}

async function resolveCategoryId(
  db: any,
  companyId: number,
  categoryNames: unknown
): Promise<number | null | undefined> {
  if (categoryNames === undefined) return undefined;

  const names = Array.isArray(categoryNames)
    ? categoryNames.map((s) => String(s).trim()).filter(Boolean)
    : [String(categoryNames).trim()].filter(Boolean);

  if (names.length === 0) {
    return null;
  }

  const primaryName = names[0];

  // Check existing category for company (case-insensitive)
  const existing = await db
    .select()
    .from(categories)
    .where(and(eq(categories.companyId, companyId), sql`lower(${categories.name}) = lower(${primaryName})`))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Create new category if not found
  const [created] = await db
    .insert(categories)
    .values({
      companyId,
      name: primaryName,
      position: 0,
    })
    .returning();

  return created.id;
}

export async function adminProductsRoutes(fastify: FastifyInstance) {
  // Pre-handler for all admin product routes
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/products - List all products for the company
  fastify.get('/v1/admin/products', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const rows = await db
      .select({
        id: products.id,
        companyId: products.companyId,
        categoryId: products.categoryId,
        categoryName: categories.name,
        name: products.name,
        description: products.description,
        price: products.price,
        taxRate: products.taxRate,
        ptuCode: products.ptuCode,
        imageUrl: products.imageUrl,
        isAvailable: products.isAvailable,
        isAgeRestricted: products.isAgeRestricted,
        stockQuantity: products.stockQuantity,
        prepTimeMinutes: products.prepTimeMinutes,
        barcode: products.barcode,
        productOrder: products.productOrder,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.companyId, companyId))
      .orderBy(desc(products.id));

    const mapped = rows.map((r) => {
      const categoryList = r.categoryId && r.categoryName
        ? [{ id: r.categoryId, name: r.categoryName }]
        : [];
      return {
        ...r,
        is_available: r.isAvailable,
        is_age_restricted: r.isAgeRestricted,
        stock_quantity: r.stockQuantity,
        image_url: r.imageUrl,
        category_name: r.categoryName,
        categoryName: r.categoryName,
        categories: categoryList,
        tax: r.taxRate,
        tax_rate: r.taxRate,
        prep_time: r.prepTimeMinutes,
      };
    });

    return success(reply, mapped, 'Products retrieved');
  });

  // GET /v1/admin/products/:id - Single product details
  fastify.get('/v1/admin/products/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [row] = await db
      .select({
        id: products.id,
        companyId: products.companyId,
        categoryId: products.categoryId,
        categoryName: categories.name,
        name: products.name,
        description: products.description,
        price: products.price,
        taxRate: products.taxRate,
        ptuCode: products.ptuCode,
        imageUrl: products.imageUrl,
        isAvailable: products.isAvailable,
        isAgeRestricted: products.isAgeRestricted,
        stockQuantity: products.stockQuantity,
        prepTimeMinutes: products.prepTimeMinutes,
        barcode: products.barcode,
        productOrder: products.productOrder,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
      .limit(1);

    if (!row) {
      return notFound(reply, 'Product not found');
    }

    const categoryList = row.categoryId && row.categoryName
      ? [{ id: row.categoryId, name: row.categoryName }]
      : [];

    const translations = await getProductTranslations(db, productId);

    return success(reply, {
      ...row,
      translations,
      image_url: row.imageUrl,
      is_available: row.isAvailable,
      is_age_restricted: row.isAgeRestricted,
      isAgeRestricted: row.isAgeRestricted,
      stock_quantity: row.stockQuantity,
      category_id: row.categoryId,
      category_name: row.categoryName,
      categoryName: row.categoryName,
      categories: categoryList,
      prep_time: row.prepTimeMinutes,
      prepTimeMinutes: row.prepTimeMinutes,
      tax: row.taxRate,
      tax_rate: row.taxRate,
      taxRate: row.taxRate,
      sku: row.barcode,
    });
  });

  // POST /v1/admin/products - Create a new product
  fastify.post('/v1/admin/products', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    if (!body.name || body.price === undefined) {
      return validationError(reply, {
        name: !body.name ? 'Name is required' : '',
        price: body.price === undefined ? 'Price is required' : '',
      });
    }

    const price = typeof body.price === 'number' ? body.price.toFixed(2) : String(body.price);
    const rawTax = body.taxRate ?? body.tax ?? body.tax_rate;
    const taxRate = rawTax !== undefined && rawTax !== null && rawTax !== '' ? parseInt(String(rawTax), 10) : 23;
    const ptuCode = taxRate === 8 ? 'b' : taxRate === 5 ? 'c' : taxRate === 0 ? 'd' : 'a';
    const isAvailable = body.isAvailable !== undefined ? Boolean(body.isAvailable) : body.is_available !== undefined ? Boolean(body.is_available) : true;
    const isAgeRestricted = body.isAgeRestricted !== undefined ? Boolean(body.isAgeRestricted) : body.is_age_restricted !== undefined ? Boolean(body.is_age_restricted) : false;
    const rawPrep = body.prepTimeMinutes ?? body.prep_time ?? body.prepTime;
    const prepTimeMinutes = rawPrep !== undefined && rawPrep !== null && rawPrep !== '' ? parseInt(String(rawPrep), 10) : 10;
    
    let categoryId: number | null = null;
    const catInput = body.category_names ?? body.category_name ?? body.categoryNames;
    if (catInput !== undefined) {
      const resolved = await resolveCategoryId(db, companyId, catInput);
      if (resolved !== undefined) categoryId = resolved;
    } else if (body.categoryId !== undefined || body.category_id !== undefined) {
      const cid = body.categoryId ?? body.category_id;
      categoryId = cid ? parseInt(String(cid), 10) : null;
    }

    const barcode = body.barcode ?? body.sku ?? null;

    try {
      const [inserted] = await db
        .insert(products)
        .values({
          companyId,
          categoryId,
          name: String(body.name).trim(),
          description: body.description ? String(body.description).trim() : null,
          price,
          taxRate,
          ptuCode,
          imageUrl: body.imageUrl || body.image_url || null,
          isAvailable,
          isAgeRestricted,
          prepTimeMinutes,
          barcode,
          productOrder: body.productOrder ? parseInt(String(body.productOrder), 10) : 0,
        })
        .returning();

      let categoryName: string | null = null;
      if (inserted.categoryId) {
        const [cat] = await db
          .select()
          .from(categories)
          .where(eq(categories.id, inserted.categoryId))
          .limit(1);
        if (cat) categoryName = cat.name;
      }

      const categoryList = inserted.categoryId && categoryName
        ? [{ id: inserted.categoryId, name: categoryName }]
        : [];

      if (body.translations) {
        await saveProductTranslations(db, inserted.id, body.translations);
      }

      const companyBrands = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.companyId, companyId));
      for (const b of companyBrands) {
        await invalidateBrandMenuCache(b.id);
      }

      const savedTranslations = await getProductTranslations(db, inserted.id);

      return success(reply, {
        ...inserted,
        translations: savedTranslations,
        image_url: inserted.imageUrl,
        is_available: inserted.isAvailable,
        is_age_restricted: inserted.isAgeRestricted,
        tax: inserted.taxRate,
        prep_time: inserted.prepTimeMinutes,
        category_id: inserted.categoryId,
        category_name: categoryName,
        categoryName: categoryName,
        categories: categoryList,
      }, 'Product created', 201);
    } catch (err: any) {
      console.error('[Admin:Products] Insert failed:', err);
      return error(reply, err.message || 'Failed to create product');
    }
  });

  // PUT /v1/admin/products/:id - Update product
  fastify.put('/v1/admin/products/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();
    const body = req.body as any;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.description !== undefined) updateData.description = body.description ? String(body.description).trim() : null;
    if (body.price !== undefined) updateData.price = typeof body.price === 'number' ? body.price.toFixed(2) : String(body.price);

    const catInput = body.category_names ?? body.category_name ?? body.categoryNames;
    if (catInput !== undefined) {
      const resolved = await resolveCategoryId(db, companyId, catInput);
      if (resolved !== undefined) {
        updateData.categoryId = resolved;
      }
    } else if (body.categoryId !== undefined || body.category_id !== undefined) {
      const cid = body.categoryId ?? body.category_id;
      updateData.categoryId = cid ? parseInt(String(cid), 10) : null;
    }
    if (body.imageUrl !== undefined || body.image_url !== undefined) {
      updateData.imageUrl = body.imageUrl ?? body.image_url;
    }
    if (body.isAvailable !== undefined || body.is_available !== undefined) {
      updateData.isAvailable = Boolean(body.isAvailable ?? body.is_available);
    }
    if (body.isAgeRestricted !== undefined || body.is_age_restricted !== undefined) {
      updateData.isAgeRestricted = Boolean(body.isAgeRestricted ?? body.is_age_restricted);
    }
    const rawTax = body.taxRate ?? body.tax ?? body.tax_rate;
    if (rawTax !== undefined && rawTax !== null && rawTax !== '') {
      const tr = parseInt(String(rawTax), 10);
      updateData.taxRate = tr;
      updateData.ptuCode = tr === 8 ? 'b' : tr === 5 ? 'c' : tr === 0 ? 'd' : 'a';
    }
    const rawPrep = body.prepTimeMinutes ?? body.prep_time ?? body.prepTime;
    if (rawPrep !== undefined && rawPrep !== null && rawPrep !== '') {
      updateData.prepTimeMinutes = parseInt(String(rawPrep), 10);
    }
    if (body.barcode !== undefined || body.sku !== undefined) {
      updateData.barcode = body.barcode ?? body.sku;
    }
    if (body.productOrder !== undefined || body.product_order !== undefined) {
      updateData.productOrder = parseInt(String(body.productOrder ?? body.product_order), 10);
    }

    try {
      const [updated] = await db
        .update(products)
        .set(updateData)
        .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'Product not found');
      }

      if (body.translations !== undefined) {
        await saveProductTranslations(db, productId, body.translations);
      }

      const companyBrands = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.companyId, companyId));
      for (const b of companyBrands) {
        await invalidateBrandMenuCache(b.id);
      }

      let categoryName: string | null = null;
      if (updated.categoryId) {
        const [cat] = await db
          .select()
          .from(categories)
          .where(eq(categories.id, updated.categoryId))
          .limit(1);
        if (cat) categoryName = cat.name;
      }

      const categoryList = updated.categoryId && categoryName
        ? [{ id: updated.categoryId, name: categoryName }]
        : [];

      const currentTranslations = await getProductTranslations(db, productId);

      return success(reply, {
        ...updated,
        translations: currentTranslations,
        image_url: updated.imageUrl,
        is_available: updated.isAvailable,
        is_age_restricted: updated.isAgeRestricted,
        tax: updated.taxRate,
        prep_time: updated.prepTimeMinutes,
        category_id: updated.categoryId,
        category_name: categoryName,
        categoryName: categoryName,
        categories: categoryList,
      }, 'Product updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update product');
    }
  });

  // DELETE /v1/admin/products/:id - Delete product
  fastify.delete('/v1/admin/products/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [deleted] = await db
      .delete(products)
      .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
      .returning();

    if (!deleted) {
      return notFound(reply, 'Product not found');
    }

    await db
      .delete(contentTranslations)
      .where(
        and(
          eq(contentTranslations.entityType, 'products'),
          eq(contentTranslations.entityId, productId)
        )
      );

    const companyBrands = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.companyId, companyId));
    for (const b of companyBrands) {
      await invalidateBrandMenuCache(b.id);
    }

    return success(reply, { id: productId }, 'Product deleted');
  });

  // PUT /v1/admin/products/:id/stock - Quick stock + availability update
  fastify.put('/v1/admin/products/:id/stock', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();
    const body = (req.body ?? {}) as any;

    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (body.is_available !== undefined) updateData.isAvailable = Boolean(body.is_available);
    if (body.isAvailable !== undefined) updateData.isAvailable = Boolean(body.isAvailable);

    const rawStock = body.stock_quantity !== undefined ? body.stock_quantity : body.stockQuantity;
    if (rawStock !== undefined) {
      updateData.stockQuantity = rawStock === null || rawStock === '' ? null : parseInt(String(rawStock), 10);
    }

    try {
      const [updated] = await db
        .update(products)
        .set(updateData)
        .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'Product not found');
      }

      return success(reply, {
        ...updated,
        is_available: updated.isAvailable,
        stock_quantity: updated.stockQuantity,
      }, 'Stock updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update stock');
    }
  });

  // POST /v1/admin/products/:id/image - Upload product image to Supabase Storage
  fastify.post('/v1/admin/products/:id/image', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const file = await req.file();
    if (!file) {
      return validationError(reply, { image: 'No image file uploaded' });
    }

    try {
      const buffer = await file.toBuffer();
      const imageUrl = await uploadImageToSupabase(buffer, file.mimetype, file.filename);

      const [updated] = await db
        .update(products)
        .set({ imageUrl, updatedAt: new Date() })
        .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'Product not found');
      }

      return success(reply, {
        id: updated.id,
        imageUrl: updated.imageUrl,
        image_url: updated.imageUrl,
      }, 'Image uploaded successfully');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to upload image to Supabase Storage');
    }
  });

  // DELETE /v1/admin/products/:id/image - Remove product image
  fastify.delete('/v1/admin/products/:id/image', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    try {
      const [existing] = await db
        .select({ imageUrl: products.imageUrl })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
        .limit(1);

      if (!existing) {
        return notFound(reply, 'Product not found');
      }

      if (existing.imageUrl) {
        await deleteImageFromSupabase(existing.imageUrl).catch(() => {});
      }

      const [updated] = await db
        .update(products)
        .set({ imageUrl: null, updatedAt: new Date() })
        .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
        .returning();

      return success(reply, { id: updated.id, imageUrl: null }, 'Image removed');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to remove image');
    }
  });
}
