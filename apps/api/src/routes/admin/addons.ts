import type { FastifyInstance } from 'fastify';
import { getDatabase, addonGroups, addonOptions, productAddonGroups, eq, and, asc, inArray } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';

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
          selectionMode: body.selectionMode || 'single',
          required: Boolean(body.required),
          minSelect: body.minSelect !== undefined ? parseInt(String(body.minSelect), 10) : 0,
          maxSelect: body.maxSelect !== undefined ? parseInt(String(body.maxSelect), 10) : 1,
          position: body.position !== undefined ? parseInt(String(body.position), 10) : 0,
        })
        .returning();

      return success(reply, inserted, 'Addon group created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create addon group');
    }
  });

  // POST /v1/admin/addons - Add an option to an addon group
  fastify.post('/v1/admin/addons', async (req, reply) => {
    const db = getDatabase();
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

      return success(reply, inserted, 'Addon option created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create addon option');
    }
  });

  // POST /v1/admin/products/:productId/addons/:groupId - Bind addon group to product
  fastify.post('/v1/admin/products/:productId/addons/:groupId', async (req, reply) => {
    const { productId, groupId } = req.params as { productId: string; groupId: string };
    const db = getDatabase();

    try {
      const [bound] = await db
        .insert(productAddonGroups)
        .values({
          productId: parseInt(productId, 10),
          groupId: parseInt(groupId, 10),
        })
        .onConflictDoNothing()
        .returning();

      return success(reply, bound || { status: 'already_bound' }, 'Addon group bound to product');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to bind addon group');
    }
  });
}
