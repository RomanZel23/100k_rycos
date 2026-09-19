import type { FastifyInstance } from 'fastify';
import { getDatabase, users, eq, and, desc, sql } from '@rycos/database';
import { requireAdminAuth, getCompanyId, getAuthUser, canAssignRole } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import { hashPassword } from '../../lib/password.js';
import { env } from '../../config/env.js';
import crypto from 'crypto';

async function syncSupabaseAuthUser(opts: {
  userId: string;
  email: string;
  password?: string;
  name?: string | null;
  role: string;
  companyId: number;
  db: any;
}) {
  const { userId, email, password, name, role, companyId, db } = opts;
  if (!password) return;

  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { company_id: companyId, role, name: name || '' },
        }),
      });

      if (!res.ok && (res.status === 422 || res.status === 400)) {
        await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            password,
            user_metadata: { company_id: companyId, role, name: name || '' },
          }),
        }).catch(() => {});
      }
    } catch {}
  }

  try {
    await db.execute(sql`
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      VALUES (
        '00000000-0000-0000-0000-000000000000',
        ${userId}::uuid,
        'authenticated',
        'authenticated',
        ${email},
        crypt(${password}, gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('company_id', ${companyId}, 'role', ${role}, 'name', ${name || ''}),
        NOW(),
        NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        encrypted_password = crypt(${password}, gen_salt('bf')),
        raw_user_meta_data = jsonb_build_object('company_id', ${companyId}, 'role', ${role}, 'name', ${name || ''}),
        updated_at = NOW();
    `);
  } catch {}
}

function sanitizeUser(userRow: any) {
  if (!userRow) return userRow;
  const { passwordHash, ...safeUser } = userRow;
  return {
    ...safeUser,
    company_id: userRow.companyId ?? userRow.company_id,
    is_active: userRow.isActive ?? userRow.is_active ?? true,
    created_at: userRow.createdAt ? new Date(userRow.createdAt).toISOString() : (userRow.created_at || new Date().toISOString()),
    updated_at: userRow.updatedAt ? new Date(userRow.updatedAt).toISOString() : (userRow.updated_at || new Date().toISOString()),
    last_sign_in_at: userRow.lastSignInAt || userRow.last_sign_in_at || userRow.updatedAt || userRow.createdAt || null,
  };
}

async function ensureAuthenticatedUserInCompany(db: any, authUser: any, companyId: number) {
  if (!authUser?.email) return null;
  const userId = authUser.id || 'usr-admin';
  try {
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.email, authUser.email.toLowerCase())))
      .limit(1);

    if (existing) return existing;

    const [created] = await db
      .insert(users)
      .values({
        id: userId,
        companyId,
        email: authUser.email.toLowerCase(),
        name: authUser.name || (authUser.user_metadata as any)?.name || 'Administrator',
        role: authUser.role || (authUser.user_metadata as any)?.role || 'super_admin',
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { companyId, isActive: true, updatedAt: new Date() },
      })
      .returning();

    return created || null;
  } catch (err: any) {
    console.warn('[Users] Auto-sync current user failed:', err?.message);
    return null;
  }
}

export async function adminUsersRoutes(fastify: FastifyInstance) {
  try {
    const db = getDatabase();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar(64) PRIMARY KEY NOT NULL,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
        "email" varchar(255) NOT NULL,
        "name" varchar(128),
        "role" varchar(32) DEFAULT 'staff' NOT NULL,
        "password_hash" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
    `);
  } catch (err: any) {
    console.warn('[Users] Self-healing schema warning:', err?.message);
  }

  fastify.addHook('preHandler', requireAdminAuth);

  // Privilege escalation guard: only platform admins may grant platform_admin / super_admin
  fastify.addHook('preHandler', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    if (body && typeof body === 'object' && body.role !== undefined && !canAssignRole(getAuthUser(req), body.role)) {
      return reply.code(403).send({ success: false, message: 'Brak uprawnień do nadania tej roli' });
    }
  });

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
        return success(reply, sanitizeUser(existing));
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

    let rows = await db
      .select()
      .from(users)
      .where(eq(users.companyId, companyId))
      .orderBy(desc(users.createdAt));

    if (rows.length === 0) {
      const seeded = await ensureAuthenticatedUserInCompany(db, getAuthUser(req), companyId);
      if (seeded) rows = [seeded];
    }

    return success(reply, rows.map(sanitizeUser), 'Users retrieved');
  });

  // POST /v1/admin/users - Add user / staff member
  fastify.post('/v1/admin/users', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;

    if (!body.email) {
      return validationError(reply, { email: 'Email is required' });
    }

    const normalizedEmail = String(body.email).trim().toLowerCase();
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.email, normalizedEmail)))
      .limit(1);

    if (existing) {
      return validationError(reply, { email: 'Użytkownik o tym adresie email już istnieje w firmie' });
    }

    const rawPassword = body.password ? String(body.password).trim() : '';
    if (rawPassword && rawPassword.length < 6) {
      return validationError(reply, { password: 'Password must be at least 6 characters' });
    }

    const userId = body.id ? String(body.id) : crypto.randomUUID();
    const passwordHash = rawPassword ? hashPassword(rawPassword) : null;

    try {
      const [inserted] = await db
        .insert(users)
        .values({
          id: userId,
          companyId,
          email: String(body.email).trim().toLowerCase(),
          name: body.name ? String(body.name).trim() : null,
          role: body.role ? String(body.role).trim() : 'staff',
          passwordHash,
          isActive: body.isActive !== false,
        })
        .returning();

      if (rawPassword) {
        syncSupabaseAuthUser({
          userId,
          email: inserted.email,
          password: rawPassword,
          name: inserted.name,
          role: inserted.role,
          companyId,
          db,
        }).catch((err) => console.warn('[Users] Supabase sync skipped:', err?.message));
      }

      return success(reply, sanitizeUser(inserted), 'User created', 201);
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

    return success(reply, sanitizeUser(row));
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

    const rawPassword = body.password !== undefined ? String(body.password).trim() : '';
    if (rawPassword) {
      if (rawPassword.length < 6) {
        return validationError(reply, { password: 'Password must be at least 6 characters' });
      }
      updateData.passwordHash = hashPassword(rawPassword);
    }

    try {
      const [updated] = await db
        .update(users)
        .set(updateData)
        .where(and(eq(users.id, id), eq(users.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'User not found');
      }

      if (rawPassword) {
        syncSupabaseAuthUser({
          userId: updated.id,
          email: updated.email,
          password: rawPassword,
          name: updated.name,
          role: updated.role,
          companyId,
          db,
        }).catch((err) => console.warn('[Users] Supabase sync skipped:', err?.message));
      }

      return success(reply, sanitizeUser(updated), 'User updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update user');
    }
  });

  // DELETE /v1/admin/users/:id - Deactivate user
  fastify.delete('/v1/admin/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const companyId = getCompanyId(req);
    const authUser = getAuthUser(req);
    if (authUser?.id && authUser.id === id) {
      return error(reply, 'Nie możesz usunąć swojego własnego konta', 400);
    }

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
    let rows = await db
      .select()
      .from(users)
      .where(eq(users.companyId, companyId))
      .orderBy(desc(users.createdAt));

    if (rows.length === 0) {
      const seeded = await ensureAuthenticatedUserInCompany(db, getAuthUser(req), companyId);
      if (seeded) rows = [seeded];
    }

    return success(reply, rows.map(sanitizeUser), 'Team retrieved');
  });

  fastify.post('/v1/admin/team', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;

    if (!body.email) {
      return validationError(reply, { email: 'Email is required' });
    }

    const normalizedEmail = String(body.email).trim().toLowerCase();
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.email, normalizedEmail)))
      .limit(1);

    if (existing) {
      return validationError(reply, { email: 'Użytkownik o tym adresie email już istnieje w firmie' });
    }

    const rawPassword = body.password ? String(body.password).trim() : '';
    if (rawPassword && rawPassword.length < 6) {
      return validationError(reply, { password: 'Password must be at least 6 characters' });
    }

    const userId = body.id ? String(body.id) : crypto.randomUUID();
    const passwordHash = rawPassword ? hashPassword(rawPassword) : null;

    try {
      const [inserted] = await db
        .insert(users)
        .values({
          id: userId,
          companyId,
          email: normalizedEmail,
          name: body.name ? String(body.name).trim() : null,
          role: body.role ? String(body.role).trim() : 'staff',
          passwordHash,
          isActive: body.isActive !== false,
        })
        .returning();

      if (rawPassword) {
        syncSupabaseAuthUser({
          userId,
          email: inserted.email,
          password: rawPassword,
          name: inserted.name,
          role: inserted.role,
          companyId,
          db,
        }).catch((err) => console.warn('[Team] Supabase sync skipped:', err?.message));
      }

      return success(reply, sanitizeUser(inserted), 'User invited', 201);
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

    const rawPassword = body.password !== undefined ? String(body.password).trim() : '';
    if (rawPassword) {
      if (rawPassword.length < 6) {
        return validationError(reply, { password: 'Password must be at least 6 characters' });
      }
      updateData.passwordHash = hashPassword(rawPassword);
    }

    try {
      const [updated] = await db
        .update(users)
        .set(updateData)
        .where(and(eq(users.id, id), eq(users.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'User not found');
      }

      if (rawPassword) {
        syncSupabaseAuthUser({
          userId: updated.id,
          email: updated.email,
          password: rawPassword,
          name: updated.name,
          role: updated.role,
          companyId,
          db,
        }).catch((err) => console.warn('[Team] Supabase sync skipped:', err?.message));
      }

      return success(reply, sanitizeUser(updated), 'User updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update user');
    }
  };

  fastify.put('/v1/admin/team/:id', updateTeamUser);
  fastify.patch('/v1/admin/team/:id', updateTeamUser);

  fastify.delete('/v1/admin/team/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const companyId = getCompanyId(req);
    const authUser = getAuthUser(req);
    if (authUser?.id && authUser.id === id) {
      return error(reply, 'Nie możesz usunąć swojego własnego konta', 400);
    }

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
