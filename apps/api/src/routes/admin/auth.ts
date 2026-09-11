import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { getDatabase, companies, users, eq, sql } from '@rycos/database';
import { env } from '../../config/env.js';
import { resolveUser } from '../../middleware/adminAuth.js';
import { success, unauthorized, validationError, error } from '../../lib/response.js';

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
      // 1. Check or Create Company
      let companyId: number;
      const existingCompanies = await db
        .select()
        .from(companies)
        .where(eq(companies.email, email))
        .limit(1);

      if (existingCompanies.length > 0) {
        companyId = existingCompanies[0].id;
      } else {
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
            jsonb_build_object('company_id', ${companyId}, 'role', 'super_admin', 'name', ${body.name || ''}),
            NOW(),
            NOW()
          )
          ON CONFLICT (email) DO UPDATE SET
            encrypted_password = crypt(${body.password!}, gen_salt('bf')),
            raw_user_meta_data = jsonb_build_object('company_id', ${companyId}, 'role', 'super_admin', 'name', ${body.name || ''}),
            updated_at = NOW()
          RETURNING id;
        `);
      } catch (sqlErr) {
        // Not a standard Supabase local schema or extension not available - safe to continue with users table
        console.log('[Signup] Direct auth.users insert skipped or not available:', (sqlErr as any)?.message);
      }

      // 5. Insert or Update row in application `users` table
      await db
        .insert(users)
        .values({
          id: userId,
          companyId,
          email,
          name: body.name || 'Admin',
          role: 'super_admin',
          isActive: true,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            companyId,
            email,
            name: body.name || 'Admin',
            role: 'super_admin',
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
          role: 'super_admin',
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
