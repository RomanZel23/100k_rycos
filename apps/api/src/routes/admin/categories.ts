import type { FastifyInstance } from 'fastify';
import { getDatabase, categories, eq, and, asc } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';

export async function adminCategoriesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/categories - List all categories
  fastify.get('/v1/admin/categories', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.companyId, companyId))
      .orderBy(asc(categories.position), asc(categories.name));

    return success(reply, rows, 'Categories retrieved');
  });

  // POST /v1/admin/categories - Create category
  fastify.post('/v1/admin/categories', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    if (!body.name) {
      return validationError(reply, { name: 'Name is required' });
    }

    try {
      const [inserted] = await db
        .insert(categories)
        .values({
          companyId,
          name: String(body.name).trim(),
          position: body.position ? parseInt(String(body.position), 10) : 0,
        })
        .returning();

      return success(reply, inserted, 'Category created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create category');
    }
  });

  // PUT /v1/admin/categories/:id - Update category
  fastify.put('/v1/admin/categories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const categoryId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();
    const body = req.body as any;

    const updateData: any = {};

    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.position !== undefined) updateData.position = parseInt(String(body.position), 10);

    try {
      const [updated] = await db
        .update(categories)
        .set(updateData)
        .where(and(eq(categories.id, categoryId), eq(categories.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'Category not found');
      }

      return success(reply, updated, 'Category updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update category');
    }
  });

  // DELETE /v1/admin/categories/:id - Delete category
  fastify.delete('/v1/admin/categories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const categoryId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [deleted] = await db
      .delete(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.companyId, companyId)))
      .returning();

    if (!deleted) {
      return notFound(reply, 'Category not found');
    }

    return success(reply, { id: categoryId }, 'Category deleted');
  });
}
