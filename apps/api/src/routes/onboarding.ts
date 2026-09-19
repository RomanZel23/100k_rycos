import type { FastifyInstance } from 'fastify';
import { getDatabase, getRawClient, platformPricing, onboardingOrders, companies, brands, locations, users, eq, and, sql } from '@rycos/database';
import { env, getJwtSecret } from '../config/env.js';
import { rateLimit } from '../lib/rateLimit.js';
import { success, error, validationError } from '../lib/response.js';
import { hashPassword } from '../lib/password.js';
import { initializePaymentPage, assertPaymentPage, captureTransaction } from '../services/saferpayClient.js';
import { rycosIntegratorService } from '../services/rycosIntegratorService.js';
import { rycosLicenseService } from '../services/rycosLicenseService.js';
import { gusService } from '../services/gusService.js';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const DEFAULT_PRICING = [
  { itemKey: 'platform_100k', title: 'Platforma 100k-RYCOS', description: 'Wysokowydajny silnik zamówień (100k/min), KDS, POS, Master SaaS', monthlyPricePln: 199, discount6mPercent: 10, discount12mPercent: 20 },
  { itemKey: 'rycos_pf', title: 'SBR Pełna (POS + Kasa fiskalna + SoftPOS)', description: 'Wszystko w jednym na terminalu SBR: sprzedaż, e-paragony i płatności zbliżeniowe', monthlyPricePln: 89, discount6mPercent: 10, discount12mPercent: 20 },
  { itemKey: 'rycos_f', title: 'SBR Fiskalna (Aplikasa)', description: 'Wirtualna kasa fiskalna zintegrowana z Centralnym Repozytorium Kas (MF)', monthlyPricePln: 49, discount6mPercent: 10, discount12mPercent: 20 },
  { itemKey: 'rycos_p', title: 'SBR Płatnicza (SoftPOS)', description: 'Akceptacja płatności kartami VISA / MasterCard / Apple Pay / Google Pay (PIN-on-Glass)', monthlyPricePln: 39, discount6mPercent: 10, discount12mPercent: 20 },
  { itemKey: 'rycos_0', title: 'SBR Podstawowa (POS)', description: 'Stanowisko kelnerskie / mobilny terminal zamówień POS', monthlyPricePln: 19, discount6mPercent: 10, discount12mPercent: 20 },
];

let tablesInitialized = false;
async function ensureOnboardingTables() {
  if (tablesInitialized) return;
  const raw = getRawClient();
  if (!raw) return;
  try {
    await raw.unsafe(`
      CREATE TABLE IF NOT EXISTS "platform_pricing" (
        "id" bigserial PRIMARY KEY NOT NULL,
        "item_key" varchar(64) NOT NULL UNIQUE,
        "title" varchar(128) NOT NULL,
        "description" text,
        "monthly_price_pln" integer NOT NULL,
        "discount_6m_percent" integer DEFAULT 10 NOT NULL,
        "discount_12m_percent" integer DEFAULT 20 NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "onboarding_orders" (
        "id" bigserial PRIMARY KEY NOT NULL,
        "order_token" varchar(64) NOT NULL UNIQUE,
        "nip" varchar(32) NOT NULL,
        "company_name" varchar(255) NOT NULL,
        "email" varchar(255) NOT NULL,
        "phone" varchar(64),
        "address" text,
        "admin_password_hash" text NOT NULL,
        "months" integer DEFAULT 1 NOT NULL,
        "plan_details" jsonb NOT NULL,
        "net_amount_grosze" integer NOT NULL,
        "gross_amount_grosze" integer NOT NULL,
        "saferpay_token" varchar(128),
        "saferpay_transaction_id" varchar(128),
        "status" varchar(32) DEFAULT 'pending' NOT NULL,
        "created_company_id" integer,
        "created_user_id" varchar(64),
        "rycos_client_id" varchar(64),
        "error_details" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "completed_at" timestamp
      );
      ALTER TABLE "onboarding_orders" ADD COLUMN IF NOT EXISTS "provisioning_state" jsonb DEFAULT '{}'::jsonb NOT NULL;
    `);

    // Seed default pricing if empty
    const db = getDatabase();
    for (const p of DEFAULT_PRICING) {
      await db
        .insert(platformPricing)
        .values(p)
        .onConflictDoNothing();
    }

    tablesInitialized = true;
  } catch (err: any) {
    console.warn('[Onboarding] Notice during table ensure:', err.message);
  }
}

function getSolutionsBayCredentials() {
  return {
    customerId: env.SOLUTIONSBAY_SAFERPAY_CUSTOMER_ID,
    terminalId: env.SOLUTIONSBAY_SAFERPAY_TERMINAL_ID,
    username: env.SOLUTIONSBAY_SAFERPAY_API_USERNAME,
    password: env.SOLUTIONSBAY_SAFERPAY_API_PASSWORD,
    testMode: env.SOLUTIONSBAY_SAFERPAY_TEST_MODE,
  };
}

export async function onboardingRoutes(fastify: FastifyInstance) {
  // POST /v1/onboarding/gus-lookup - Lookup company info from GUS REGON BIR API
  fastify.post('/v1/onboarding/gus-lookup', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const nip = String(body.nip || '').replace(/^PL/i, '').replace(/[^0-9]/g, '');

    if (!nip || nip.length !== 10) {
      return validationError(reply, { nip: 'Podaj poprawny 10-cyfrowy NIP firmy' });
    }

    try {
      const gusData = await gusService.searchByNip(nip);
      if (!gusData) {
        return error(reply, 'Nie znaleziono podmiotu w bazie GUS dla podanego NIP', 404);
      }
      return success(reply, gusData, 'Dane firmy pobrane z GUS');
    } catch (err: any) {
      console.error('[Onboarding] GUS lookup error:', err.message);
      return error(reply, `Błąd komunikacji z GUS BIR: ${err.message}`, 502);
    }
  });

  // GET /v1/onboarding/order-info - Public check of order details before setting password
  fastify.get('/v1/onboarding/order-info', async (req, reply) => {
    await ensureOnboardingTables();
    const db = getDatabase();
    const query = (req.query ?? {}) as any;
    const orderToken = String(query.order_token || query.orderToken || '').trim();

    if (!orderToken) {
      return validationError(reply, { order_token: 'order_token is required' });
    }

    const [order] = await db
      .select()
      .from(onboardingOrders)
      .where(eq(onboardingOrders.orderToken, orderToken))
      .limit(1);

    if (!order) {
      return error(reply, 'Nie znaleziono zamówienia', 404);
    }

    return success(reply, {
      order_token: order.orderToken,
      nip: order.nip,
      company_name: order.companyName,
      email: order.email,
      status: order.status,
      completed: order.status === 'completed',
    }, 'Informacje o zamówieniu');
  });

  // GET /v1/onboarding/pricing - Public pricing catalog for 100k.rycos.eu/go
  fastify.get('/v1/onboarding/pricing', async (_req, reply) => {
    await ensureOnboardingTables();
    const db = getDatabase();

    const rows = await db.select().from(platformPricing);
    const items = rows.length > 0 ? rows : DEFAULT_PRICING;

    return success(reply, {
      items,
      discounts: {
        '1m': 0,
        '6m': 10,
        '12m': 20,
      },
      vat_rate: 0.23,
      currency: 'PLN',
    }, 'Pricing retrieved');
  });

  // POST /v1/onboarding/checkout - Initialize order & Saferpay checkout
  fastify.post('/v1/onboarding/checkout', async (req, reply) => {
    await ensureOnboardingTables();
    const db = getDatabase();
    const body = (req.body ?? {}) as any;

    const nip = String(body.nip || '').replace(/^PL/i, '').replace(/[^0-9]/g, '');
    const companyName = String(body.company_name || body.companyName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const address = String(body.address || '').trim();
    const password = String(body.password || '').trim();
    const months = [1, 6, 12].includes(Number(body.months)) ? Number(body.months) : 1;

    if (!nip || nip.length !== 10) {
      return validationError(reply, { nip: 'Wymagany jest poprawny 10-cyfrowy NIP firmy' });
    }
    if (!companyName) {
      return validationError(reply, { company_name: 'Nazwa firmy jest wymagana' });
    }
    if (!email || !email.includes('@')) {
      return validationError(reply, { email: 'Poprawny adres e-mail jest wymagany' });
    }

    if (!(await rateLimit(`onboarding:${req.ip}`, 10, 600))) {
      return error(reply, 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.', 429);
    }

    // An existing account must not be duplicated / hijacked through a new onboarding order
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) {
      return error(reply, 'Konto z tym adresem e-mail już istnieje. Zaloguj się do panelu, aby dokupić licencje.', 409);
    }

    const seat = (v: any) => Math.min(50, Math.max(0, parseInt(String(v || 0), 10) || 0));
    const plan = {
      platform_100k: body.plan?.platform_100k !== false ? 1 : 0,
      seats_pf: seat(body.plan?.seats_pf),
      seats_f: seat(body.plan?.seats_f),
      seats_p: seat(body.plan?.seats_p),
      seats_0: seat(body.plan?.seats_0),
    };

    // Calculate prices
    const pricingRows = await db.select().from(platformPricing);
    const priceMap = new Map((pricingRows.length > 0 ? pricingRows : DEFAULT_PRICING).map(p => [p.itemKey, p.monthlyPricePln]));

    let baseMonthlyNet = 0;
    if (plan.platform_100k) baseMonthlyNet += priceMap.get('platform_100k') ?? 199;
    baseMonthlyNet += (plan.seats_pf * (priceMap.get('rycos_pf') ?? 89));
    baseMonthlyNet += (plan.seats_f * (priceMap.get('rycos_f') ?? 49));
    baseMonthlyNet += (plan.seats_p * (priceMap.get('rycos_p') ?? 39));
    baseMonthlyNet += (plan.seats_0 * (priceMap.get('rycos_0') ?? 19));

    const discountPercent = months === 12 ? 20 : months === 6 ? 10 : 0;
    const totalNetPln = Math.round((baseMonthlyNet * months) * (1 - discountPercent / 100));
    const totalGrossPln = Math.round(totalNetPln * 1.23);

    const netAmountGrosze = totalNetPln * 100;
    const grossAmountGrosze = totalGrossPln * 100;
    if (grossAmountGrosze <= 0) {
      return validationError(reply, { plan: 'Wybierz co najmniej jeden produkt' });
    }

    const orderToken = `ob_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    // Hash password if provided now, otherwise placeholder hash until step 3
    const adminPasswordHash = password && password.length >= 6
      ? await hashPassword(password)
      : 'pending_set_password';

    // Initialize Saferpay payment
    const returnUrl = `${env.PUBLIC_CUSTOMER_URL}/go/success?order_token=${orderToken}`;
    const creds = getSolutionsBayCredentials();

    let redirectUrl: string | undefined;
    let saferpayToken: string | undefined;

    // Without Saferpay credentials a test checkout is allowed ONLY outside production
    if (!creds.password || creds.password === '') {
      if (env.NODE_ENV === 'production') {
        return error(reply, 'Płatności online są chwilowo niedostępne (brak konfiguracji bramki).', 503);
      }
      console.warn('[Onboarding] SolutionsBay Saferpay password not configured, fallback to direct test checkout');
      redirectUrl = `${returnUrl}&test_auto_pay=1`;
      saferpayToken = `test_token_${orderToken}`;
    } else {
      const initResult = await initializePaymentPage({
        orderId: orderToken,
        orderNumber: Math.floor(100000 + Math.random() * 900000),
        amount: grossAmountGrosze,
        currency: 'PLN',
        returnUrl,
        credentials: creds,
      });

      if (!initResult.success || !initResult.redirectUrl) {
        return error(reply, initResult.error || 'Nie udało się zainicjować płatności Saferpay', 500);
      }

      redirectUrl = initResult.redirectUrl;
      saferpayToken = initResult.token;
    }

    await db.insert(onboardingOrders).values({
      orderToken,
      nip,
      companyName,
      email,
      phone: phone || null,
      address: address || null,
      adminPasswordHash,
      months,
      planDetails: plan,
      netAmountGrosze,
      grossAmountGrosze,
      saferpayToken,
      status: 'pending',
    });

    return success(reply, {
      order_token: orderToken,
      redirect_url: redirectUrl,
      amount_gross_pln: totalGrossPln,
      amount_net_pln: totalNetPln,
      months,
      discount_percent: discountPercent,
    }, 'Checkout initialized');
  });

  // POST /v1/onboarding/finalize - Verify payment, provision RYCOS Portal seats, create company & auto-login.
  // Idempotent and serialized: an atomic status claim guarantees a single provisioning run per order.
  fastify.post('/v1/onboarding/finalize', async (req, reply) => {
    await ensureOnboardingTables();
    const db = getDatabase();
    const body = (req.body ?? {}) as any;
    const orderToken = String(body.order_token || body.orderToken || '').trim();
    const newPassword = String(body.password || '').trim();

    if (!orderToken) {
      return validationError(reply, { order_token: 'order_token is required' });
    }
    if (!(await rateLimit(`onboarding-fin:${req.ip}`, 20, 600))) {
      return error(reply, 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.', 429);
    }

    const [order] = await db.select().from(onboardingOrders).where(eq(onboardingOrders.orderToken, orderToken)).limit(1);
    if (!order) {
      return error(reply, 'Nie znaleziono zamówienia onboardingowego', 404);
    }

    const signToken = (userId: string, companyId: number, role: string) =>
      jwt.sign(
        { sub: userId, email: order.email, company_id: companyId, role: 'authenticated', user_metadata: { id: userId, company_id: companyId, role, email: order.email } },
        getJwtSecret(),
        { expiresIn: '30d' }
      );

    // Already completed: auto-login only shortly after completion (the token in the URL must not be a permanent key)
    if (order.status === 'completed' && order.createdCompanyId) {
      const completedAgoMs = order.completedAt ? Date.now() - new Date(order.completedAt).getTime() : Infinity;
      if (completedAgoMs > 30 * 60 * 1000) {
        return error(reply, 'Konto zostało już utworzone. Zaloguj się do panelu administracyjnego.', 409, {
          redirect_to: `${env.PUBLIC_ADMIN_URL}/login`,
        });
      }
      const [existingCompany] = await db.select().from(companies).where(eq(companies.id, order.createdCompanyId)).limit(1);
      return success(reply, {
        completed: true,
        company_id: order.createdCompanyId,
        company_name: existingCompany?.name || order.companyName,
        nip: order.nip,
        token: signToken(order.createdUserId || 'admin', order.createdCompanyId, 'admin'),
        redirect_to: `${env.PUBLIC_ADMIN_URL}/dashboard/licenses`,
      }, 'Onboarding already completed');
    }

    // Password can be (re)set only before the account exists
    let finalPasswordHash = order.adminPasswordHash;
    if (newPassword) {
      if (newPassword.length < 6) {
        return validationError(reply, { password: 'Hasło administratora musi mieć minimum 6 znaków' });
      }
      finalPasswordHash = await hashPassword(newPassword);
      await db.update(onboardingOrders).set({ adminPasswordHash: finalPasswordHash }).where(eq(onboardingOrders.id, order.id));
    } else if (order.adminPasswordHash === 'pending_set_password') {
      return validationError(reply, { password: 'Hasło administratora musi mieć minimum 6 znaków' });
    }

    // Atomic claim — concurrent finalize calls (double click, refresh) cannot provision twice
    const claimed = await db
      .update(onboardingOrders)
      .set({ status: 'provisioning', errorDetails: null })
      .where(and(
        eq(onboardingOrders.id, order.id),
        sql`(${onboardingOrders.status} IN ('pending', 'paid', 'failed') OR (${onboardingOrders.status} = 'provisioning' AND ${onboardingOrders.createdAt} < now() - interval '1 day'))`
      ))
      .returning();
    if (claimed.length === 0) {
      return error(reply, 'Zamówienie jest właśnie przetwarzane — odśwież stronę za chwilę.', 409);
    }

    const state: Record<string, any> = { ...((order.provisioningState as any) || {}) };
    const saveState = async (patch: Record<string, any>) => {
      Object.assign(state, patch);
      await db.update(onboardingOrders).set({ provisioningState: state }).where(eq(onboardingOrders.id, order.id));
    };
    const fail = async (message: string, httpStatus = 502) => {
      await db.update(onboardingOrders).set({ status: 'failed', errorDetails: message.slice(0, 2000) }).where(eq(onboardingOrders.id, order.id));
      return error(reply, message, httpStatus);
    };

    try {
      // Step 1: Payment verification (mandatory; test tokens only outside production)
      if (!order.saferpayTransactionId) {
        const creds = getSolutionsBayCredentials();
        if (!order.saferpayToken) return await fail('Brak płatności dla zamówienia', 402);

        if (order.saferpayToken.startsWith('test_token_')) {
          if (env.NODE_ENV === 'production') return await fail('Testowa płatność nie jest akceptowana', 402);
        } else {
          const assertRes = await assertPaymentPage(order.saferpayToken, creds);
          if (!assertRes.success || !assertRes.transactionId) {
            await db.update(onboardingOrders).set({ status: 'pending' }).where(eq(onboardingOrders.id, order.id));
            return error(reply, `Płatność nie została potwierdzona: ${assertRes.error || 'Nieautoryzowana'}`, 402);
          }
          if (assertRes.amount !== undefined && assertRes.amount !== order.grossAmountGrosze) {
            return await fail(`Kwota płatności (${assertRes.amount}) nie zgadza się z zamówieniem (${order.grossAmountGrosze})`, 402);
          }
          let payStatus = assertRes.status;
          if (assertRes.status === 'AUTHORIZED') {
            const cap = await captureTransaction(assertRes.transactionId, creds);
            if (!cap.success) {
              await db.update(onboardingOrders).set({ status: 'pending' }).where(eq(onboardingOrders.id, order.id));
              return error(reply, `Nie udało się rozliczyć płatności: ${cap.error || 'błąd bramki'}`, 402);
            }
            payStatus = cap.status || 'CAPTURED';
          }
          if (payStatus !== 'CAPTURED') {
            await db.update(onboardingOrders).set({ status: 'pending' }).where(eq(onboardingOrders.id, order.id));
            return error(reply, `Płatność w trakcie potwierdzania (${payStatus}). Spróbuj za chwilę.`, 402);
          }
          await db.update(onboardingOrders).set({ saferpayTransactionId: assertRes.transactionId }).where(eq(onboardingOrders.id, order.id));
        }
      }

      // Step 2: RYCOS Portal provisioning — each sub-step recorded, so a retry never duplicates licenses
      const plan = order.planDetails as any;
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + (order.months || 1));

      if (rycosIntegratorService.isConfigured()) {
        if (!state.rycosClientId) {
          const rycosClient = await rycosIntegratorService.createClient({
            nip: order.nip,
            name: order.companyName,
            email: order.email,
            phone: order.phone || undefined,
            address_street: order.address || undefined,
          });
          if (!rycosClient?.id) return await fail('Nie udało się zarejestrować klienta w RYCOS Portal');
          await saveState({ rycosClientId: rycosClient.id });
        }

        if (plan.platform_100k > 0 && !state.licenseDone) {
          const solRes = await rycosIntegratorService.createSolutionLicense(state.rycosClientId, {
            solution: 'p_immo',
            instance_name: `${order.companyName} (100k)`,
            valid_until: expiryDate.toISOString(),
            notes: `Self-Service Onboarding Order #${order.id} (${order.months}m)`,
          });
          await saveState({ licenseDone: true, licenseToken: solRes?.token || null });
        }

        const hasSeats = plan.seats_pf > 0 || plan.seats_f > 0 || plan.seats_p > 0 || plan.seats_0 > 0;
        if (hasSeats && !state.purchaseDone) {
          await rycosIntegratorService.createPurchase(state.rycosClientId, {
            bundle_type: 'flex',
            seats_pf: plan.seats_pf || 0,
            seats_f: plan.seats_f || 0,
            seats_p: plan.seats_p || 0,
            seats_0: plan.seats_0 || 0,
            expires_at: expiryDate.toISOString(),
            notes: `Self-Service Onboarding Order #${order.id} (${order.months}m)`,
          });
          await saveState({ purchaseDone: true });
        }
      }

      // Step 3: Company, location, brand and admin user — one transaction
      const baseSlug = order.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'firma';
      const uniqueSuffix = randomUUID().slice(0, 6);
      const generatedLicenseToken: string | null = state.licenseToken || null;
      const userId = `usr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

      const newCompany = await db.transaction(async (tx) => {
        const [company] = await tx
          .insert(companies)
          .values({
            name: order.companyName,
            slug: `${baseSlug}-${uniqueSuffix}`,
            nip: order.nip,
            email: order.email,
            phone: order.phone || null,
            address: order.address || null,
            currency: 'PLN',
            licenseToken: generatedLicenseToken,
            licenseStatus: generatedLicenseToken ? 'active' : 'unconfigured',
            isAcceptingOrders: true,
          })
          .returning();

        const [loc] = await tx
          .insert(locations)
          .values({ companyId: company.id, name: 'Lokal Główny', address: order.address || null, isActive: true })
          .returning();

        await tx.insert(brands).values({
          companyId: company.id,
          locationId: loc.id,
          name: order.companyName,
          slug: `${baseSlug}-${uniqueSuffix}`,
          isActive: true,
          allowPayAtCounter: true,
        });

        await tx.insert(users).values({
          id: userId,
          companyId: company.id,
          email: order.email,
          passwordHash: finalPasswordHash,
          name: order.companyName,
          role: 'admin',
          isActive: true,
        });

        await tx
          .update(onboardingOrders)
          .set({
            status: 'completed',
            createdCompanyId: company.id,
            createdUserId: userId,
            rycosClientId: state.rycosClientId || null,
            completedAt: new Date(),
          })
          .where(eq(onboardingOrders.id, order.id));

        return company;
      });

      if (generatedLicenseToken) {
        rycosLicenseService
          .checkHeartbeat({ companyId: newCompany.id, token: generatedLicenseToken, instanceName: `${newCompany.name} (100k)` })
          .catch(() => {});
      }

      return success(reply, {
        completed: true,
        company_id: newCompany.id,
        company_name: newCompany.name,
        nip: newCompany.nip,
        token: signToken(userId, newCompany.id, 'admin'),
        redirect_to: `${env.PUBLIC_ADMIN_URL}/dashboard/licenses`,
      }, 'Firma została pomyślnie utworzona i skonfigurowana');
    } catch (err: any) {
      console.error('[Onboarding] Provisioning failed:', err);
      return await fail(`Błąd konfiguracji konta: ${err.message}. Płatność została zapisana — spróbuj ponownie lub skontaktuj się z nami.`, 500);
    }
  });
}
