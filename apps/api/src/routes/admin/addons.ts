import type { FastifyInstance } from 'fastify';
import {
  getDatabase,
  addonGroups,
  addonOptions,
  productAddonGroups,
  productAddonOptionPrices,
  products,
  brands,
  contentTranslations,
  eq,
  and,
  asc,
  inArray,
} from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import { invalidateBrandMenuCache } from '../../services/catalogService.js';

/** 'multi' (older admin panel) and 'multiple' mean the same thing; 'multiple' is canonical. */
function normalizeSelectionMode(value: unknown): 'single' | 'multiple' {
  return String(value ?? 'single').toLowerCase().startsWith('multi') ? 'multiple' : 'single';
}

/** 0 / empty / null = no upper limit. */
function parseMaxSelect(value: unknown): number {
  if (value === undefined || value === null || String(value).trim() === '') return 0;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseStock(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The admin panel reads snake_case; camelCase keys stay for older callers. */
function mapOption(o: typeof addonOptions.$inferSelect) {
  return {
    ...o,
    group_id: o.groupId,
    price_delta: o.priceDelta,
    is_available: o.isAvailable,
    stock_quantity: o.stockQuantity ?? null,
  };
}

function mapGroup(g: typeof addonGroups.$inferSelect, options: (typeof addonOptions.$inferSelect)[]) {
  return {
    ...g,
    company_id: g.companyId,
    selection_mode: normalizeSelectionMode(g.selectionMode),
    selectionMode: normalizeSelectionMode(g.selectionMode),
    min_select: g.minSelect,
    max_select: g.maxSelect > 0 ? g.maxSelect : null,
    options: options.map(mapOption),
  };
}

/** Options may only be touched through a group owned by the caller's company. */
async function optionOfCompany(db: any, optionId: number, companyId: number) {
  const [row] = await db
    .select({ option: addonOptions })
    .from(addonOptions)
    .innerJoin(addonGroups, eq(addonOptions.groupId, addonGroups.id))
    .where(and(eq(addonOptions.id, optionId), eq(addonGroups.companyId, companyId)))
    .limit(1);
  return row?.option ?? null;
}

async function groupOfCompany(db: any, groupId: number, companyId: number) {
  const [row] = await db
    .select()
    .from(addonGroups)
    .where(and(eq(addonGroups.id, groupId), eq(addonGroups.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

async function invalidateCompanyBrands(db: any, companyId: number) {
  try {
    const companyBrands = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.companyId, companyId));
    for (const b of companyBrands) {
      await invalidateBrandMenuCache(b.id);
    }
  } catch (err: any) {
    console.warn('[Admin:Addons] Cache invalidation warning:', err.message);
  }
}

export async function adminAddonsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/addon-groups - List all addon groups with their options
  fastify.get('/v1/admin/addon-groups', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const groups = await db
      .select()
      .from(addonGroups)
      .where(eq(addonGroups.companyId, companyId))
      .orderBy(asc(addonGroups.position));

    if (groups.length === 0) {
      return success(reply, [], 'No addon groups found');
    }

    const groupIds = groups.map((g) => g.id);
    const options = await db
      .select()
      .from(addonOptions)
      .where(inArray(addonOptions.groupId, groupIds))
      .orderBy(asc(addonOptions.position));

    const result = groups.map((g) => mapGroup(g, options.filter((o) => o.groupId === g.id)));

    return success(reply, result);
  });

  // POST /v1/admin/addon-groups - Create addon group
  fastify.post('/v1/admin/addon-groups', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    if (!body.name) {
      return validationError(reply, { name: 'Name is required' });
    }

    try {
      const [inserted] = await db
        .insert(addonGroups)
        .values({
          companyId,
          name: String(body.name).trim(),
          selectionMode: normalizeSelectionMode(body.selection_mode ?? body.selectionMode),
          required: Boolean(body.required),
          minSelect: Math.max(0, parseInt(String(body.min_select ?? body.minSelect ?? 0), 10) || 0),
          maxSelect: parseMaxSelect(body.max_select ?? body.maxSelect),
          position: body.position !== undefined ? parseInt(String(body.position), 10) || 0 : 0,
        })
        .returning();

      await invalidateCompanyBrands(db, companyId);
      return success(reply, mapGroup(inserted, []), 'Addon group created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create addon group');
    }
  });

  // PUT /v1/admin/addon-groups/:id - Update addon group
  fastify.put('/v1/admin/addon-groups/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const groupId = parseInt(id, 10);
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.selection_mode !== undefined || body.selectionMode !== undefined) {
      updateData.selectionMode = normalizeSelectionMode(body.selection_mode ?? body.selectionMode);
    }
    if (body.required !== undefined) updateData.required = Boolean(body.required);
    if (body.min_select !== undefined || body.minSelect !== undefined) {
      const val = body.min_select ?? body.minSelect;
      updateData.minSelect = Math.max(0, parseInt(String(val), 10) || 0);
    }
    if (body.max_select !== undefined || body.maxSelect !== undefined) {
      updateData.maxSelect = parseMaxSelect(body.max_select ?? body.maxSelect);
    }
    if (body.position !== undefined) updateData.position = parseInt(String(body.position), 10) || 0;

    try {
      const [updated] = await db
        .update(addonGroups)
        .set(updateData)
        .where(and(eq(addonGroups.id, groupId), eq(addonGroups.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'Addon group not found');
      }

      await invalidateCompanyBrands(db, companyId);
      return success(reply, mapGroup(updated, []), 'Addon group updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update addon group');
    }
  });

  // DELETE /v1/admin/addon-groups/:id - Delete addon group
  fastify.delete('/v1/admin/addon-groups/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const groupId = parseInt(id, 10);
    const db = getDatabase();
    const companyId = getCompanyId(req);

    // Get option IDs to clean up translations
    const options = await db
      .select({ id: addonOptions.id })
      .from(addonOptions)
      .where(eq(addonOptions.groupId, groupId));
    const optionIds = options.map((o) => o.id);

    const [deleted] = await db
      .delete(addonGroups)
      .where(and(eq(addonGroups.id, groupId), eq(addonGroups.companyId, companyId)))
      .returning();

    if (!deleted) {
      return notFound(reply, 'Addon group not found');
    }

    // Clean up translations
    await db
      .delete(contentTranslations)
      .where(and(eq(contentTranslations.entityType, 'addon_groups'), eq(contentTranslations.entityId, groupId)));

    if (optionIds.length > 0) {
      await db
        .delete(contentTranslations)
        .where(and(eq(contentTranslations.entityType, 'addon_options'), inArray(contentTranslations.entityId, optionIds)));
    }

    await invalidateCompanyBrands(db, companyId);
    return success(reply, { id: groupId }, 'Addon group deleted');
  });

  // POST /v1/admin/addon-groups/:groupId/options - Create option in group
  fastify.post('/v1/admin/addon-groups/:groupId/options', async (req, reply) => {
    const { groupId } = req.params as { groupId: string };
    const parsedGroupId = parseInt(groupId, 10);
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    if (!body.name) {
      return validationError(reply, { name: 'Name is required' });
    }

    const priceDelta =
      body.price_delta !== undefined
        ? String(body.price_delta)
        : body.priceDelta !== undefined
        ? typeof body.priceDelta === 'number'
          ? body.priceDelta.toFixed(2)
          : String(body.priceDelta)
        : '0.00';

    if (!(await groupOfCompany(db, parsedGroupId, companyId))) {
      return notFound(reply, 'Addon group not found');
    }

    try {
      const [inserted] = await db
        .insert(addonOptions)
        .values({
          groupId: parsedGroupId,
          name: String(body.name).trim(),
          priceDelta,
          isAvailable: body.is_available !== undefined ? Boolean(body.is_available) : body.isAvailable !== false,
          stockQuantity: parseStock(body.stock_quantity ?? body.stockQuantity),
          position: body.position ? parseInt(String(body.position), 10) : 0,
        })
        .returning();

      await invalidateCompanyBrands(db, companyId);
      return success(reply, mapOption(inserted), 'Addon option created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create addon option');
    }
  });

  // POST /v1/admin/addons - Add an option to an addon group (legacy route)
  fastify.post('/v1/admin/addons', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    if (!body.groupId || !body.name) {
      return validationError(reply, {
        groupId: !body.groupId ? 'groupId is required' : '',
        name: !body.name ? 'name is required' : '',
      });
    }

    const priceDelta =
      body.priceDelta !== undefined
        ? typeof body.priceDelta === 'number'
          ? body.priceDelta.toFixed(2)
          : String(body.priceDelta)
        : '0.00';

    const legacyGroupId = parseInt(String(body.groupId), 10);
    if (!(await groupOfCompany(db, legacyGroupId, companyId))) {
      return notFound(reply, 'Addon group not found');
    }

    try {
      const [inserted] = await db
        .insert(addonOptions)
        .values({
          groupId: legacyGroupId,
          name: String(body.name).trim(),
          priceDelta,
          isAvailable: body.isAvailable !== false,
          stockQuantity: parseStock(body.stock_quantity ?? body.stockQuantity),
          position: body.position ? parseInt(String(body.position), 10) : 0,
        })
        .returning();

      await invalidateCompanyBrands(db, companyId);
      return success(reply, mapOption(inserted), 'Addon option created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create addon option');
    }
  });

  // PUT /v1/admin/addon-options/:id - Update addon option
  fastify.put('/v1/admin/addon-options/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const optionId = parseInt(id, 10);
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.price_delta !== undefined || body.priceDelta !== undefined) {
      const rawPrice = body.price_delta ?? body.priceDelta;
      updateData.priceDelta = typeof rawPrice === 'number' ? rawPrice.toFixed(2) : String(rawPrice);
    }
    if (body.is_available !== undefined || body.isAvailable !== undefined) {
      updateData.isAvailable = Boolean(body.is_available ?? body.isAvailable);
    }
    if (body.stock_quantity !== undefined || body.stockQuantity !== undefined) {
      updateData.stockQuantity = parseStock(body.stock_quantity ?? body.stockQuantity);
    }
    if (body.position !== undefined) updateData.position = parseInt(String(body.position), 10) || 0;

    if (!(await optionOfCompany(db, optionId, companyId))) {
      return notFound(reply, 'Addon option not found');
    }

    try {
      const [updated] = await db
        .update(addonOptions)
        .set(updateData)
        .where(eq(addonOptions.id, optionId))
        .returning();

      if (!updated) {
        return notFound(reply, 'Addon option not found');
      }

      await invalidateCompanyBrands(db, companyId);
      return success(reply, mapOption(updated), 'Addon option updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update addon option');
    }
  });

  // DELETE /v1/admin/addon-options/:id - Delete addon option
  fastify.delete('/v1/admin/addon-options/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const optionId = parseInt(id, 10);
    const db = getDatabase();
    const companyId = getCompanyId(req);

    if (!(await optionOfCompany(db, optionId, companyId))) {
      return notFound(reply, 'Addon option not found');
    }

    const [deleted] = await db
      .delete(addonOptions)
      .where(eq(addonOptions.id, optionId))
      .returning();

    if (!deleted) {
      return notFound(reply, 'Addon option not found');
    }

    await db
      .delete(contentTranslations)
      .where(and(eq(contentTranslations.entityType, 'addon_options'), eq(contentTranslations.entityId, optionId)));

    await invalidateCompanyBrands(db, companyId);
    return success(reply, { id: optionId }, 'Addon option deleted');
  });

  // GET /v1/admin/addon-groups/:id/translations - Get translations for group and its options
  fastify.get('/v1/admin/addon-groups/:id/translations', async (req, reply) => {
    const { id } = req.params as { id: string };
    const groupId = parseInt(id, 10);
    const db = getDatabase();
    if (!(await groupOfCompany(db, groupId, getCompanyId(req)))) {
      return notFound(reply, 'Addon group not found');
    }

    const options = await db
      .select({ id: addonOptions.id })
      .from(addonOptions)
      .where(eq(addonOptions.groupId, groupId));
    const optionIds = options.map((o) => o.id);

    const groupTranslations = await db
      .select()
      .from(contentTranslations)
      .where(
        and(
          eq(contentTranslations.entityType, 'addon_groups'),
          eq(contentTranslations.entityId, groupId)
        )
      );

    let optionTranslations: any[] = [];
    if (optionIds.length > 0) {
      optionTranslations = await db
        .select()
        .from(contentTranslations)
        .where(
          and(
            eq(contentTranslations.entityType, 'addon_options'),
            inArray(contentTranslations.entityId, optionIds)
          )
        );
    }

    const translations: Record<string, { group_name?: string; options: Record<string, string> }> = {};

    for (const r of groupTranslations) {
      if (!translations[r.language]) {
        translations[r.language] = { options: {} };
      }
      if (r.attributeName === 'name') {
        translations[r.language].group_name = r.value;
      }
    }

    for (const r of optionTranslations) {
      if (!translations[r.language]) {
        translations[r.language] = { options: {} };
      }
      if (r.attributeName === 'name') {
        translations[r.language].options[String(r.entityId)] = r.value;
      }
    }

    return success(reply, { translations });
  });

  // PUT /v1/admin/addon-groups/:id/translations - Save translations for group and options
  fastify.put('/v1/admin/addon-groups/:id/translations', async (req, reply) => {
    const { id } = req.params as { id: string };
    const groupId = parseInt(id, 10);
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const translations = body.translations as Record<string, { group_name?: string; options?: Record<string, string> }> | undefined;

    if (translations && typeof translations === 'object') {
      for (const [lang, data] of Object.entries(translations)) {
        if (!data || typeof data !== 'object') continue;

        // Group name translation
        if (data.group_name !== undefined) {
          const val = String(data.group_name).trim();
          if (val) {
            await db
              .insert(contentTranslations)
              .values({
                entityType: 'addon_groups',
                entityId: groupId,
                language: lang,
                attributeName: 'name',
                value: val,
              })
              .onConflictDoUpdate({
                target: [
                  contentTranslations.entityType,
                  contentTranslations.entityId,
                  contentTranslations.language,
                  contentTranslations.attributeName,
                ],
                set: { value: val },
              });
          } else {
            await db
              .delete(contentTranslations)
              .where(
                and(
                  eq(contentTranslations.entityType, 'addon_groups'),
                  eq(contentTranslations.entityId, groupId),
                  eq(contentTranslations.language, lang),
                  eq(contentTranslations.attributeName, 'name')
                )
              );
          }
        }

        // Option translations
        if (data.options && typeof data.options === 'object') {
          for (const [optionIdStr, optVal] of Object.entries(data.options)) {
            const optId = parseInt(optionIdStr, 10);
            if (isNaN(optId)) continue;
            const val = String(optVal ?? '').trim();
            if (val) {
              await db
                .insert(contentTranslations)
                .values({
                  entityType: 'addon_options',
                  entityId: optId,
                  language: lang,
                  attributeName: 'name',
                  value: val,
                })
                .onConflictDoUpdate({
                  target: [
                    contentTranslations.entityType,
                    contentTranslations.entityId,
                    contentTranslations.language,
                    contentTranslations.attributeName,
                  ],
                  set: { value: val },
                });
            } else {
              await db
                .delete(contentTranslations)
                .where(
                  and(
                    eq(contentTranslations.entityType, 'addon_options'),
                    eq(contentTranslations.entityId, optId),
                    eq(contentTranslations.language, lang),
                    eq(contentTranslations.attributeName, 'name')
                  )
                );
            }
          }
        }
      }
    }

    await invalidateCompanyBrands(db, companyId);
    return success(reply, { translations }, 'Translations saved');
  });

  // -------------------------------------------------------------------------
  // Product <-> add-on group assignment (admin panel: "Add-ons for <product>")
  // -------------------------------------------------------------------------

  async function productOfCompany(db: any, productId: number, companyId: number) {
    const [row] = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
      .limit(1);
    return row ?? null;
  }

  // GET /v1/admin/products/:id/addons - every company group + what this product uses
  fastify.get('/v1/admin/products/:id/addons', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const db = getDatabase();
    const companyId = getCompanyId(req);

    if (!Number.isFinite(productId)) return validationError(reply, { id: 'Invalid product id' });
    if (!(await productOfCompany(db, productId, companyId))) return notFound(reply, 'Product not found');

    const groups = await db
      .select()
      .from(addonGroups)
      .where(eq(addonGroups.companyId, companyId))
      .orderBy(asc(addonGroups.position), asc(addonGroups.id));

    const groupIds = groups.map((g) => g.id);
    const options = groupIds.length
      ? await db.select().from(addonOptions).where(inArray(addonOptions.groupId, groupIds)).orderBy(asc(addonOptions.position), asc(addonOptions.id))
      : [];

    const assignments = await db
      .select()
      .from(productAddonGroups)
      .where(eq(productAddonGroups.productId, productId));
    const assignedPosition = new Map(assignments.map((a) => [a.groupId, a.position]));

    const overrideRows = await db
      .select()
      .from(productAddonOptionPrices)
      .where(eq(productAddonOptionPrices.productId, productId));
    const price_overrides: Record<string, string> = {};
    for (const o of overrideRows) price_overrides[String(o.optionId)] = o.priceDelta;

    const payload = groups.map((g) => ({
      ...mapGroup(g, options.filter((o) => o.groupId === g.id)),
      assigned: assignedPosition.has(g.id),
      assignment_position: assignedPosition.get(g.id) ?? null,
    }));

    return success(reply, { product_id: productId, groups: payload, price_overrides });
  });

  // PUT /v1/admin/products/:id/addons - replace the product's groups and price overrides
  fastify.put('/v1/admin/products/:id/addons', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as { group_ids?: unknown; price_overrides?: Record<string, unknown> };

    if (!Number.isFinite(productId)) return validationError(reply, { id: 'Invalid product id' });
    if (!(await productOfCompany(db, productId, companyId))) return notFound(reply, 'Product not found');

    const requested = Array.isArray(body.group_ids)
      ? Array.from(new Set(body.group_ids.map((g) => parseInt(String(g), 10)).filter((n) => Number.isFinite(n))))
      : [];

    // Only this company's groups may be attached
    const ownGroups = requested.length
      ? await db
          .select({ id: addonGroups.id })
          .from(addonGroups)
          .where(and(eq(addonGroups.companyId, companyId), inArray(addonGroups.id, requested)))
      : [];
    const ownGroupIds = new Set(ownGroups.map((g) => g.id));
    const finalGroupIds = requested.filter((g) => ownGroupIds.has(g));

    // Overrides are only kept for options that actually belong to the attached groups
    const optionRows = finalGroupIds.length
      ? await db.select({ id: addonOptions.id }).from(addonOptions).where(inArray(addonOptions.groupId, finalGroupIds))
      : [];
    const allowedOptionIds = new Set(optionRows.map((o) => o.id));

    const overrides: { optionId: number; priceDelta: string }[] = [];
    for (const [key, raw] of Object.entries(body.price_overrides ?? {})) {
      const optionId = parseInt(key, 10);
      if (!Number.isFinite(optionId) || !allowedOptionIds.has(optionId)) continue;
      if (raw === null || raw === undefined || String(raw).trim() === '') continue;
      const value = parseFloat(String(raw).replace(',', '.'));
      if (!Number.isFinite(value)) continue;
      overrides.push({ optionId, priceDelta: value.toFixed(2) });
    }

    try {
      await db.transaction(async (tx) => {
        await tx.delete(productAddonGroups).where(eq(productAddonGroups.productId, productId));
        if (finalGroupIds.length) {
          await tx.insert(productAddonGroups).values(
            finalGroupIds.map((groupId, index) => ({ productId, groupId, position: index }))
          );
        }

        await tx.delete(productAddonOptionPrices).where(eq(productAddonOptionPrices.productId, productId));
        if (overrides.length) {
          await tx.insert(productAddonOptionPrices).values(
            overrides.map((o) => ({ productId, optionId: o.optionId, priceDelta: o.priceDelta }))
          );
        }
      });
    } catch (err: any) {
      return error(reply, err.message || 'Failed to save product add-ons');
    }

    await invalidateCompanyBrands(db, companyId);
    return success(
      reply,
      { product_id: productId, group_ids: finalGroupIds, price_overrides: Object.fromEntries(overrides.map((o) => [String(o.optionId), o.priceDelta])) },
      'Add-ons saved'
    );
  });

  // POST /v1/admin/products/:productId/addons/:groupId - Bind addon group to product
  fastify.post('/v1/admin/products/:productId/addons/:groupId', async (req, reply) => {
    const { productId, groupId } = req.params as { productId: string; groupId: string };
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const boundProductId = parseInt(productId, 10);
    const boundGroupId = parseInt(groupId, 10);
    if (!(await productOfCompany(db, boundProductId, companyId))) return notFound(reply, 'Product not found');
    if (!(await groupOfCompany(db, boundGroupId, companyId))) return notFound(reply, 'Addon group not found');

    try {
      const [bound] = await db
        .insert(productAddonGroups)
        .values({
          productId: boundProductId,
          groupId: boundGroupId,
        })
        .onConflictDoNothing()
        .returning();

      await invalidateCompanyBrands(db, companyId);
      return success(reply, bound || { status: 'already_bound' }, 'Addon group bound to product');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to bind addon group');
    }
  });
}
