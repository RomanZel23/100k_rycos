import type { FastifyInstance } from 'fastify';
import { getDatabase, addonGroups, addonOptions, productAddonGroups, brands, contentTranslations, eq, and, asc, inArray } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import { invalidateBrandMenuCache } from '../../services/catalogService.js';

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

    const result = groups.map((g) => ({
      ...g,
      options: options.filter((o) => o.groupId === g.id),
    }));

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
          selectionMode: body.selection_mode || body.selectionMode || 'single',
          required: Boolean(body.required),
          minSelect: body.min_select !== undefined ? parseInt(String(body.min_select), 10) : body.minSelect !== undefined ? parseInt(String(body.minSelect), 10) : 0,
          maxSelect: body.max_select ? parseInt(String(body.max_select), 10) : body.maxSelect ? parseInt(String(body.maxSelect), 10) : 1,
          position: body.position !== undefined ? parseInt(String(body.position), 10) : 0,
        })
        .returning();

      await invalidateCompanyBrands(db, companyId);
      return success(reply, inserted, 'Addon group created', 201);
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
      updateData.selectionMode = body.selection_mode || body.selectionMode;
    }
    if (body.required !== undefined) updateData.required = Boolean(body.required);
    if (body.min_select !== undefined || body.minSelect !== undefined) {
      const val = body.min_select ?? body.minSelect;
      updateData.minSelect = parseInt(String(val), 10);
    }
    if (body.max_select !== undefined || body.maxSelect !== undefined) {
      const val = body.max_select ?? body.maxSelect;
      updateData.maxSelect = val ? parseInt(String(val), 10) : 1;
    }
    if (body.position !== undefined) updateData.position = parseInt(String(body.position), 10);

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
      return success(reply, updated, 'Addon group updated');
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

    try {
      const [inserted] = await db
        .insert(addonOptions)
        .values({
          groupId: parsedGroupId,
          name: String(body.name).trim(),
          priceDelta,
          isAvailable: body.is_available !== undefined ? Boolean(body.is_available) : body.isAvailable !== false,
          position: body.position ? parseInt(String(body.position), 10) : 0,
        })
        .returning();

      await invalidateCompanyBrands(db, companyId);
      return success(reply, inserted, 'Addon option created', 201);
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

    try {
      const [inserted] = await db
        .insert(addonOptions)
        .values({
          groupId: parseInt(String(body.groupId), 10),
          name: String(body.name).trim(),
          priceDelta,
          isAvailable: body.isAvailable !== false,
          position: body.position ? parseInt(String(body.position), 10) : 0,
        })
        .returning();

      await invalidateCompanyBrands(db, companyId);
      return success(reply, inserted, 'Addon option created', 201);
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
    if (body.position !== undefined) updateData.position = parseInt(String(body.position), 10);

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
      return success(reply, updated, 'Addon option updated');
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

  // POST /v1/admin/products/:productId/addons/:groupId - Bind addon group to product
  fastify.post('/v1/admin/products/:productId/addons/:groupId', async (req, reply) => {
    const { productId, groupId } = req.params as { productId: string; groupId: string };
    const db = getDatabase();
    const companyId = getCompanyId(req);

    try {
      const [bound] = await db
        .insert(productAddonGroups)
        .values({
          productId: parseInt(productId, 10),
          groupId: parseInt(groupId, 10),
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
