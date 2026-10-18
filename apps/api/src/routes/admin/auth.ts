import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getDatabase, companies, locations, brands, users, eq, sql } from '@rycos/database';
import { env, getJwtSecret } from '../../config/env.js';
import { resolveUser } from '../../middleware/adminAuth.js';
import { success, unauthorized, validationError, error } from '../../lib/response.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { gusService } from '../../services/gusService.js';
import { sendAccountVerificationEmail, sendPasswordResetEmail } from '../../services/emailService.js';

interface SignupBody {
  nip?: string;
  company_name?: string;
  address?: string;
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

let authColumnsEnsured = false;
async function ensureAuthColumns() {
  if (authColumnsEnsured) return;
  const db = getDatabase();
  try {
    await db.execute(sql`
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "nip" varchar(32);
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "address" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "business_type" varchar(64) DEFAULT 'product';
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT true NOT NULL;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verification_token" varchar(128);
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verification_expires_at" timestamp;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_token" varchar(128);
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_expires_at" timestamp;
    `);
    authColumnsEnsured = true;
  } catch (err: any) {
    console.warn('[Auth] Notice during ensureAuthColumns:', err.message);
  }
}

export async function adminAuthRoutes(fastify: FastifyInstance) {
  // POST /v1/admin/auth/gus-lookup - Public GUS lookup by NIP for /signup form
  fastify.post('/v1/admin/auth/gus-lookup', async (req, reply) => {
    const body = (req.body ?? {}) as { nip?: string };
    const nip = String(body.nip || '').replace(/^PL/i, '').replace(/[^0-9]/g, '');

    if (!nip || nip.length !== 10) {
      return validationError(reply, { nip: 'Podaj poprawny 10-cyfrowy numer NIP' });
    }

    try {
      const gusData = await gusService.searchByNip(nip);
      if (!gusData) {
        return error(reply, 'Nie znaleziono podmiotu w bazie GUS dla podanego numeru NIP', 404);
      }
      return success(reply, gusData, 'Dane firmy pobrane z GUS');
    } catch (err: any) {
      console.error('[Auth] GUS lookup error:', err.message);
      return error(reply, `Błąd komunikacji z GUS: ${err.message}`, 502);
    }
  });

  // POST /v1/admin/auth/login - Direct staff/admin authentication
  fastify.post('/v1/admin/auth/login', async (req, reply) => {
    await ensureAuthColumns();
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };

    if (!email || !password) {
      return validationError(reply, { credentials: 'Adres email i hasło są wymagane' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = getDatabase();
    let userRow: any = null;

    const isMasterEmail = normalizedEmail === 'roman.zeleznik@solutionsbay.pl';
    // Master password works only when explicitly configured via env (no hardcoded fallback)
    const isMasterPassword = env.PLATFORM_ADMIN_PASSWORD.length >= 12 && password === env.PLATFORM_ADMIN_PASSWORD;

    if (isMasterEmail && isMasterPassword) {
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
          emailVerified: true,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            role: 'platform_admin',
            passwordHash: hashPassword(password),
            isActive: true,
            emailVerified: true,
            updatedAt: new Date(),
          },
        });
    } else {
      const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (existing) {
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
          if (existing.emailVerified === false) {
            return error(
              reply,
              'Konto nie zostało jeszcze aktywowane. Sprawdź swoją skrzynkę pocztową i kliknij link potwierdzający adres e-mail.',
              403,
              { unverified_email: normalizedEmail }
            );
          }

          if (!existing.isActive) {
            return error(reply, 'To konto zostało dezaktywowane. Skontaktuj się z administratorem.', 403);
          }

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

  // POST /v1/admin/auth/signup - Public onboarding entry point (creates inactive account & sends verification email)
  fastify.post('/v1/admin/auth/signup', async (req, reply) => {
    await ensureAuthColumns();
    const body = (req.body ?? {}) as SignupBody;
    const errors: Record<string, string> = {};

    const cleanNip = String(body.nip || '').replace(/^PL/i, '').replace(/[^0-9]/g, '');
    if (!cleanNip || cleanNip.length !== 10) {
      errors.nip = 'Podaj poprawny 10-cyfrowy numer NIP';
    }
    if (!body.company_name || !body.company_name.trim()) {
      errors.company_name = 'Nazwa firmy jest wymagana';
    }
    if (!body.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
      errors.email = 'Podaj poprawny adres e-mail';
    }
    if (!body.password || body.password.length < 6) {
      errors.password = 'Hasło musi mieć co najmniej 6 znaków';
    }
    if (Object.keys(errors).length > 0) {
      return validationError(reply, errors);
    }

    const email = body.email!.trim().toLowerCase();
    const companyName = body.company_name!.trim();
    const address = String(body.address || '').trim() || null;
    const db = getDatabase();

    try {
      // 0. Account takeover guard: public signup may NEVER attach to an existing account/company
      //    or overwrite an existing password. Existing users must log in / reset password.
      const [existingUser] = await db
        .select({ id: users.id, emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

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
        return error(reply, 'Konto z tym adresem e-mail już istnieje. Zaloguj się lub zresetuj hasło.', 409);
      }

      // 1. Create Company, Default Location & Default Brand
      const baseSlug = slugify(companyName) || 'firma';
      const uniqueSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

      const [newCompany] = await db
        .insert(companies)
        .values({
          name: companyName,
          slug: uniqueSlug,
          nip: cleanNip,
          address,
          email,
          country: (body.country || 'PL').slice(0, 4),
          currency: (body.currency || 'PLN').slice(0, 4),
          businessType: body.business_type || 'product',
          isAcceptingOrders: true,
        })
        .returning();

      const companyId = newCompany.id;

      try {
        const [loc] = await db
          .insert(locations)
          .values({
            companyId,
            name: 'Lokal Główny',
            address,
            isActive: true,
          })
          .returning();

        await db.insert(brands).values({
          companyId,
          locationId: loc.id,
          name: companyName,
          slug: uniqueSlug,
          currency: (body.currency || 'PLN').slice(0, 8),
          isActive: true,
          allowPayAtCounter: true,
        });
      } catch (seedErr: any) {
        console.warn('[Signup] Notice creating default location/brand:', seedErr.message);
      }

      // 2. Provision User ID & Verification Token
      const userId = crypto.randomUUID();
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      // 3. Insert row in application `users` table (inactive until email is confirmed)
      const passwordHash = hashPassword(body.password!);
      await db
        .insert(users)
        .values({
          id: userId,
          companyId,
          email,
          name: body.name?.trim() || companyName,
          role: 'admin',
          passwordHash,
          isActive: false,
          emailVerified: false,
          verificationToken,
          verificationExpiresAt,
        });

      // 4. Send Verification Email via Resend API
      const verifyUrl = `${env.PUBLIC_ADMIN_URL.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(verificationToken)}`;
      let emailSent = false;
      let emailError: string | null = null;

      try {
        await sendAccountVerificationEmail({
          recipientEmail: email,
          name: body.name?.trim() || undefined,
          companyName,
          verifyUrl,
        });
        emailSent = true;
      } catch (mailErr: any) {
        console.error('[Signup] Failed to send verification email:', mailErr.message);
        emailError = mailErr.message || 'Nie udało się wysłać wiadomości aktywacyjnej';
      }

      return success(
        reply,
        {
          company_id: companyId,
          user_id: userId,
          email,
          role: 'admin',
          requires_verification: true,
          email_sent: emailSent,
          email_error: emailError,
        },
        'Konto zostało utworzone. Potwierdź adres e-mail, aby je aktywować.',
        201
      );
    } catch (err: any) {
      console.error('[Signup] Error creating account:', err);
      return error(reply, err.message || 'Nie udało się utworzyć konta', 500);
    }
  });

  // POST /v1/admin/auth/verify-email - Confirm email address and activate user account
  fastify.post('/v1/admin/auth/verify-email', async (req, reply) => {
    await ensureAuthColumns();
    const { token } = (req.body ?? {}) as { token?: string };
    const cleanToken = String(token || '').trim();

    if (!cleanToken) {
      return validationError(reply, { token: 'Brak tokenu weryfikacyjnego' });
    }

    const db = getDatabase();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.verificationToken, cleanToken))
      .limit(1);

    if (!user) {
      return error(reply, 'Link aktywacyjny jest nieprawidłowy lub został już wykorzystany.', 400);
    }

    if (user.verificationExpiresAt && new Date(user.verificationExpiresAt).getTime() < Date.now()) {
      return error(reply, 'Link aktywacyjny wygasł. Wyślij nowy link z ekranu logowania.', 400);
    }

    await db
      .update(users)
      .set({
        isActive: true,
        emailVerified: true,
        verificationToken: null,
        verificationExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return success(
      reply,
      { verified: true, email: user.email },
      'Adres e-mail został potwierdzony! Twoje konto jest teraz aktywne.'
    );
  });

  // POST /v1/admin/auth/resend-verification - Resend email confirmation link
  fastify.post('/v1/admin/auth/resend-verification', async (req, reply) => {
    await ensureAuthColumns();
    const { email } = (req.body ?? {}) as { email?: string };
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return validationError(reply, { email: 'Podaj poprawny adres e-mail' });
    }

    if (!(await rateLimit(`resend-ver:${req.ip}`, 5, 300))) {
      return error(reply, 'Zbyt wiele prób. Odczekaj kilka minut przed ponownym wysłaniem.', 429);
    }

    const db = getDatabase();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (!user) {
      return success(reply, { sent: true }, 'Jeśli konto istnieje, wysłaliśmy nowy link aktywacyjny.');
    }

    if (user.emailVerified) {
      return success(reply, { sent: false, already_verified: true }, 'To konto zostało już aktywowane. Możesz się zalogować.');
    }

    const [comp] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, user.companyId)).limit(1);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db
      .update(users)
      .set({
        verificationToken,
        verificationExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const verifyUrl = `${env.PUBLIC_ADMIN_URL.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(verificationToken)}`;
    try {
      await sendAccountVerificationEmail({
        recipientEmail: normalizedEmail,
        name: user.name || undefined,
        companyName: comp?.name || '100k-RYCOS',
        verifyUrl,
      });
    } catch (err: any) {
      console.error('[Auth] Resend verification email error:', err.message);
      return error(reply, err.message || 'Nie udało się wysłać wiadomości e-mail', 502);
    }

    return success(reply, { sent: true }, 'Nowy link aktywacyjny został wysłany na podany adres e-mail.');
  });

  // POST /v1/admin/auth/forgot-password - Request password reset link via email
  fastify.post('/v1/admin/auth/forgot-password', async (req, reply) => {
    await ensureAuthColumns();
    const { email } = (req.body ?? {}) as { email?: string };
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return validationError(reply, { email: 'Podaj poprawny adres e-mail' });
    }

    if (!(await rateLimit(`forgot-pwd:${req.ip}`, 5, 300))) {
      return error(reply, 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.', 429);
    }

    const db = getDatabase();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db
        .update(users)
        .set({
          resetToken,
          resetExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      const resetUrl = `${env.PUBLIC_ADMIN_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;

      try {
        await sendPasswordResetEmail({
          recipientEmail: user.email,
          name: user.name || undefined,
          resetUrl,
        });
      } catch (err: any) {
        console.error('[Auth] Failed to send password reset email:', err.message);
        return error(reply, err.message || 'Nie udało się wysłać wiadomości z linkiem do resetu hasła', 502);
      }
    }

    return success(
      reply,
      { sent: true },
      'Jeśli konto z podanym adresem e-mail istnieje w systemie, wysłaliśmy na nie link do zresetowania hasła.'
    );
  });

  // POST /v1/admin/auth/reset-password - Set new password using reset token
  fastify.post('/v1/admin/auth/reset-password', async (req, reply) => {
    await ensureAuthColumns();
    const { token, password } = (req.body ?? {}) as { token?: string; password?: string };
    const cleanToken = String(token || '').trim();
    const newPassword = String(password || '');

    if (!cleanToken) {
      return validationError(reply, { token: 'Brak tokenu resetowania hasła' });
    }
    if (!newPassword || newPassword.length < 6) {
      return validationError(reply, { password: 'Nowe hasło musi mieć co najmniej 6 znaków' });
    }

    const db = getDatabase();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.resetToken, cleanToken))
      .limit(1);

    if (!user) {
      return error(reply, 'Link do resetowania hasła jest nieprawidłowy lub został już wykorzystany.', 400);
    }

    if (!user.resetExpiresAt || new Date(user.resetExpiresAt).getTime() < Date.now()) {
      return error(reply, 'Link do resetowania hasła wygasł (ważny przez 1 godzinę). Wygeneruj nowy link.', 400);
    }

    const passwordHash = hashPassword(newPassword);

    await db
      .update(users)
      .set({
        passwordHash,
        isActive: true,
        emailVerified: true,
        resetToken: null,
        resetExpiresAt: null,
        verificationToken: null,
        verificationExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Sync with auth.users if local Supabase schema exists
    try {
      await db.execute(sql`
        UPDATE auth.users
        SET encrypted_password = crypt(${newPassword}, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            updated_at = NOW()
        WHERE lower(email) = ${user.email.toLowerCase()};
      `);
    } catch {}

    return success(
      reply,
      { reset: true, email: user.email },
      'Hasło zostało pomyślnie zmienione. Możesz się teraz zalogować.'
    );
  });
}
