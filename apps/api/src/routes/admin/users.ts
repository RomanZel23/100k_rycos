import type { FastifyInstance } from 'fastify';
import { getDatabase, users, eq, and, desc } from '@rycos/database';
import { requireAdminAuth, getCompanyId, getAuthUser } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import crypto from 'crypto';

export async function adminUsersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/users/me - Current user profile
  fastify.get('/v1/admin/users/me', async (req, reply) => {
    const authUser = getAuthUser(req);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    if (authUser?.id) {
      const [existing] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, authUser.id), eq(users.companyId, companyId)))
        .limit(1);

      if (existing) {
        return success(reply, existing);
      }
    }

    return success(reply, {
      id: authUser?.id || 'admin-user',
      email: authUser?.email || 'admin@100k.rycos.eu',
      name: (authUser?.user_metadata as any)?.name || 'Administrator',
      role: (authUser?.user_metadata as any)?.role || 'admin',
      company_id: companyId,
    });
  });

  // GET /v1/admin/users - List personnel for company
  fastify.get('/v1/admin/users', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.companyId, companyId))
      .orderBy(desc(users.createdAt));

    return success(reply, rows, 'Users retrieved');
  });

  // POST /v1/admin/users - Add user / staff member
  fastify.post('/v1/admin/users', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;

    if (!body.email) {
      return validationError(reply, { email: 'Email is required' });
    }

    const userId = body.id ? String(body.id) : crypto.randomUUID();

    try {
      const [inserted] = await db
        .insert(users)
        .values({
          id: userId,
          companyId,
          email: String(body.email).trim().toLowerCase(),
          name: body.name ? String(body.name).trim() : null,
          role: body.role ? String(body.role).trim() : 'staff',
          isActive: body.isActive !== false,
        })
        .returning();

      return success(reply, inserted, 'User created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create user');
    }
  });

  // GET /v1/admin/users/:id - Single user details
  fastify.get('/v1/admin/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.companyId, companyId)))
      .limit(1);

    if (!row) {
      return notFound(reply, 'User not found');
    }

    return success(reply, row);
  });

  // PUT /v1/admin/users/:id - Update user / role
  fastify.put('/v1/admin/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const companyId = getCompanyId(req);
    const db = getDatabase();
    const body = (req.body ?? {}) as any;

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (body.name !== undefined) updateData.name = body.name ? String(body.name).trim() : null;
    if (body.role !== undefined) updateData.role = String(body.role).trim();
    if (body.email !== undefined) updateData.email = String(body.email).trim().toLowerCase();
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);
    if (body.is_active !== undefined) updateData.isActive = Boolean(body.is_active);

    try {
      const [updated] = await db
        .update(users)
        .set(updateData)
        .where(and(eq(users.id, id), eq(users.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'User not found');
      }

      return success(reply, updated, 'User updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update user');
    }
  });

  // DELETE /v1/admin/users/:id - Deactivate user
  fastify.delete('/v1/admin/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const companyId = getCompanyId(req);
    const db = getDatabase();

    try {
      const [deleted] = await db
        .delete(users)
        .where(and(eq(users.id, id), eq(users.companyId, companyId)))
        .returning();

      if (!deleted) {
        return notFound(reply, 'User not found');
      }

      return success(reply, { id }, 'User removed');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to delete user');
    }
  });

  // Team aliases used by company-admin frontend (/team)
  fastify.get('/v1/admin/team', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.companyId, companyId))
      .orderBy(desc(users.createdAt));
    return success(reply, rows, 'Team retrieved');
  });

  fastify.post('/v1/admin/team', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;

    if (!body.email) {
      return validationError(reply, { email: 'Email is required' });
    }

    const userId = body.id ? String(body.id) : crypto.randomUUID();

    try {
      const [inserted] = await db
        .insert(users)
        .values({
          id: userId,
          companyId,
          email: String(body.email).trim().toLowerCase(),
          name: body.name ? String(body.name).trim() : null,
          role: body.role ? String(body.role).trim() : 'staff',
          isActive: body.isActive !== false,
        })
        .returning();

      return success(reply, inserted, 'User invited', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to invite user');
    }
  });

  const updateTeamUser = async (req: any, reply: any) => {
    const { id } = req.params as { id: string };
    const companyId = getCompanyId(req);
    const db = getDatabase();
    const body = (req.body ?? {}) as any;

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (body.name !== undefined) updateData.name = body.name ? String(body.name).trim() : null;
    if (body.role !== undefined) updateData.role = String(body.role).trim();
    if (body.email !== undefined) updateData.email = String(body.email).trim().toLowerCase();
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);
    if (body.is_active !== undefined) updateData.isActive = Boolean(body.is_active);

    try {
      const [updated] = await db
        .update(users)
        .set(updateData)
        .where(and(eq(users.id, id), eq(users.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'User not found');
      }

      return success(reply, updated, 'User updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update user');
    }
  };

  fastify.put('/v1/admin/team/:id', updateTeamUser);
  fastify.patch('/v1/admin/team/:id', updateTeamUser);

  fastify.delete('/v1/admin/team/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const companyId = getCompanyId(req);
    const db = getDatabase();

    try {
      const [deleted] = await db
        .delete(users)
        .where(and(eq(users.id, id), eq(users.companyId, companyId)))
        .returning();

      if (!deleted) {
        return notFound(reply, 'User not found');
      }

      return success(reply, { id }, 'User removed');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to delete user');
    }
  });
}
