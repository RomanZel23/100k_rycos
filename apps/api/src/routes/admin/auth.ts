import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getDatabase, companies, users, eq, sql } from '@rycos/database';
import { env, getJwtSecret } from '../../config/env.js';
import { resolveUser } from '../../middleware/adminAuth.js';
import { success, unauthorized, validationError, error } from '../../lib/response.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';

interface SignupBody {
  company_name?: string;
  email?: string;
  password?: string;
  name?: string;
  country?: string;
  currency?: string;
  business_type?: string;
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

export async function adminAuthRoutes(fastify: FastifyInstance) {
  // POST /v1/admin/auth/login - Direct staff/admin authentication
  fastify.post('/v1/admin/auth/login', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };

    if (!email || !password) {
      return validationError(reply, { credentials: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = getDatabase();
    let userRow: any = null;

    const isMasterEmail = normalizedEmail === 'roman.zeleznik@solutionsbay.pl';
    // Master password works only when explicitly configured via env (no hardcoded fallback)
    const isMasterPassword = env.PLATFORM_ADMIN_PASSWORD.length >= 12 && password === env.PLATFORM_ADMIN_PASSWORD;

    if (isMasterEmail && isMasterPassword) {
      try {
        await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "nip" varchar(32);`);
      } catch (_) {}

      const [comp] = await db.select({ id: companies.id }).from(companies).limit(1);
      const companyId = comp ? comp.id : 1;

      userRow = {
        id: 'usr-roman-zeleznik',
        companyId,
        email: normalizedEmail,
        name: 'Roman Żeleźnik',
        role: 'platform_admin',
      };

      await db
        .insert(users)
        .values({
          id: userRow.id,
          companyId,
          email: normalizedEmail,
          name: userRow.name,
          role: 'platform_admin',
          passwordHash: hashPassword(password),
          isActive: true,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            role: 'platform_admin',
            passwordHash: hashPassword(password),
            isActive: true,
            updatedAt: new Date(),
          },
        });
    } else {
      const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (existing && existing.isActive) {
        let passwordValid = false;

        // 1. Primary verification: scrypt passwordHash
        if (existing.passwordHash) {
          passwordValid = verifyPassword(password, existing.passwordHash);
        }

        // 2. Fallback verification: auth.users (Supabase / pgcrypto crypt)
        if (!passwordValid) {
          try {
            const authCheck: any = await db.execute(sql`
              SELECT (encrypted_password = crypt(${password}, encrypted_password)) AS valid
              FROM auth.users
              WHERE email = ${normalizedEmail}
              LIMIT 1;
            `);
            const row = authCheck?.rows?.[0] || authCheck?.[0];
            if (row?.valid === true) {
              passwordValid = true;
              // Backfill scrypt password_hash for fast local verification
              await db
                .update(users)
                .set({ passwordHash: hashPassword(password), updatedAt: new Date() })
                .where(eq(users.id, existing.id))
                .catch(() => {});
            }
          } catch {}
        }

        if (passwordValid) {
          userRow = existing;
          if (isMasterEmail) {
            userRow.role = 'platform_admin';
          }
        }
      }
    }

    if (!userRow) {
      return unauthorized(reply, 'Nieprawidłowy adres email lub hasło');
    }

    const jwtSecret = getJwtSecret();
    const payload = {
      aud: 'authenticated',
      sub: userRow.id,
      email: userRow.email,
      role: 'authenticated',
      user_metadata: {
        id: userRow.id,
        company_id: userRow.companyId,
        role: userRow.role || 'super_admin',
        name: userRow.name || 'Admin',
        email: userRow.email,
      },
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: '30d' });

    return success(
      reply,
      {
        access_token: token,
        token_type: 'bearer',
        expires_in: 30 * 86400,
        user: {
          id: userRow.id,
          email: userRow.email,
          user_metadata: payload.user_metadata,
        },
      },
      'Login successful'
    );
  });

  // POST /v1/admin/auth/validate - Validate bearer token
  fastify.post('/v1/admin/auth/validate', async (req, reply) => {
    const user = resolveUser(req);
    if (!user) {
      return unauthorized(reply, 'Invalid or expired token');
    }
    return success(reply, { valid: true, user });
  });

  // POST /v1/admin/auth/signup - Public onboarding entry point
  fastify.post('/v1/admin/auth/signup', async (req, reply) => {
    const body = (req.body ?? {}) as SignupBody;
    const errors: Record<string, string> = {};

    if (!body.company_name || !body.company_name.trim()) {
      errors.company_name = 'Company name is required';
    }
    if (!body.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
      errors.email = 'A valid email is required';
    }
    if (!body.password || body.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    if (Object.keys(errors).length > 0) {
      return validationError(reply, errors);
    }

    const email = body.email!.trim().toLowerCase();
    const companyName = body.company_name!.trim();
    const db = getDatabase();

    try {
      // 0. Account takeover guard: public signup may NEVER attach to an existing account/company
      //    or overwrite an existing password. Existing users must log in / reset password.
      const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      let existsInAuth = false;
      try {
        const authRows: any = await db.execute(sql`SELECT 1 AS x FROM auth.users WHERE lower(email) = ${email} LIMIT 1`);
        existsInAuth = (authRows?.rows?.length ?? authRows?.length ?? 0) > 0;
      } catch {}
      const existingCompanies = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.email, email))
        .limit(1);
      if (existingUser || existsInAuth || existingCompanies.length > 0) {
        return error(reply, 'Konto z tym adresem email już istnieje. Zaloguj się lub zresetuj hasło.', 409);
      }

      // 1. Create Company
      let companyId: number;
      {
        const baseSlug = slugify(companyName) || 'company';
        const uniqueSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

        const [newCompany] = await db
          .insert(companies)
          .values({
            name: companyName,
            slug: uniqueSlug,
            email: email,
            country: (body.country || 'PL').slice(0, 4),
            currency: (body.currency || 'PLN').slice(0, 4),
            isAcceptingOrders: true,
          })
          .returning();

        companyId = newCompany.id;
      }

      // 2. Provision User ID
      let userId = crypto.randomUUID();

      // 3. Create or update user via Supabase Auth Admin REST API (if service role key is set)
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
              password: body.password,
              email_confirm: true,
              user_metadata: {
                company_id: companyId,
                role: 'super_admin',
                name: body.name || '',
              },
            }),
          });

          const resBody: any = await res.json().catch(() => ({}));
          if (res.ok && resBody?.id) {
            userId = resBody.id;
          } else if (res.status === 422 || res.status === 400) {
            // User already exists in Supabase Auth - update password & metadata
            try {
              const listRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
                headers: {
                  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                },
              });
              const listBody: any = await listRes.json().catch(() => ({}));
              const existing = listBody.users?.find((u: any) => u.email === email);
              if (existing?.id) {
                userId = existing.id;
                await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                  },
                  body: JSON.stringify({
                    password: body.password,
                    user_metadata: {
                      company_id: companyId,
                      role: 'super_admin',
                      name: body.name || '',
                    },
                  }),
                });
              }
            } catch {}
          }
        } catch (authErr) {
          console.warn('[Signup] Supabase Auth Admin API call failed, falling back to direct DB auth:', authErr);
        }
      }

      // 4. Try Direct Local Supabase DB auth.users upsert if auth schema exists
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
            crypt(${body.password!}, gen_salt('bf')),
            NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('company_id', ${companyId}, 'role', 'admin', 'name', ${body.name || ''}),
            NOW(),
            NOW()
          )
          ON CONFLICT (email) DO UPDATE SET
            encrypted_password = crypt(${body.password!}, gen_salt('bf')),
            raw_user_meta_data = jsonb_build_object('company_id', ${companyId}, 'role', 'admin', 'name', ${body.name || ''}),
            updated_at = NOW()
          RETURNING id;
        `);
      } catch (sqlErr) {
        // Not a standard Supabase local schema or extension not available - safe to continue with users table
        console.log('[Signup] Direct auth.users insert skipped or not available:', (sqlErr as any)?.message);
      }

      // 5. Insert or Update row in application `users` table
      const passwordHash = hashPassword(body.password!);
      await db
        .insert(users)
        .values({
          id: userId,
          companyId,
          email,
          name: body.name || 'Admin',
          role: 'admin',
          passwordHash,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            companyId,
            email,
            name: body.name || 'Admin',
            role: 'admin',
            passwordHash,
            isActive: true,
            updatedAt: new Date(),
          },
        });

      return success(
        reply,
        {
          company_id: companyId,
          user_id: userId,
          email,
          role: 'admin',
        },
        'Account created',
        201
      );
    } catch (err: any) {
      console.error('[Signup] Error creating account:', err);
      return error(reply, err.message || 'Failed to create account', 500);
    }
  });
}
