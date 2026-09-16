import type { FastifyInstance } from 'fastify';
import { getDatabase, getRawClient, platformPricing, onboardingOrders, companies, brands, locations, users, eq } from '@rycos/database';
import { env } from '../config/env.js';
import { success, error, validationError } from '../lib/response.js';
import { hashPassword } from '../lib/password.js';
import { initializePaymentPage, assertPaymentPage, captureTransaction } from '../services/saferpayClient.js';
import { rycosIntegratorService } from '../services/rycosIntegratorService.js';
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
    if (!password || password.length < 6) {
      return validationError(reply, { password: 'Hasło administratora musi mieć minimum 6 znaków' });
    }

    const plan = {
      platform_100k: body.plan?.platform_100k !== false ? 1 : 0,
      seats_pf: Math.max(0, parseInt(String(body.plan?.seats_pf || 0), 10) || 0),
      seats_f: Math.max(0, parseInt(String(body.plan?.seats_f || 0), 10) || 0),
      seats_p: Math.max(0, parseInt(String(body.plan?.seats_p || 0), 10) || 0),
      seats_0: Math.max(0, parseInt(String(body.plan?.seats_0 || 0), 10) || 0),
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

    const orderToken = `ob_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const adminPasswordHash = await hashPassword(password);

    // Initialize Saferpay payment
    const returnUrl = `${env.PUBLIC_CUSTOMER_URL}/go/success?order_token=${orderToken}`;
    const creds = getSolutionsBayCredentials();

    let redirectUrl: string | undefined;
    let saferpayToken: string | undefined;

    // In test mode or if no Saferpay key yet, provide direct flow
    if (!creds.password || creds.password === '') {
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

  // POST /v1/onboarding/finalize - Assert payment, provision RYCOS Portal seats, create company & auto-login
  fastify.post('/v1/onboarding/finalize', async (req, reply) => {
    await ensureOnboardingTables();
    const db = getDatabase();
    const body = (req.body ?? {}) as any;
    const orderToken = String(body.order_token || body.orderToken || '').trim();

    if (!orderToken) {
      return validationError(reply, { order_token: 'order_token is required' });
    }

    const [order] = await db
      .select()
      .from(onboardingOrders)
      .where(eq(onboardingOrders.orderToken, orderToken))
      .limit(1);

    if (!order) {
      return error(reply, 'Nie znaleziono zamówienia onboardingowego', 404);
    }

    // If already completed, generate new login token and redirect
    if (order.status === 'completed' && order.createdCompanyId) {
      const [existingCompany] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, order.createdCompanyId))
        .limit(1);

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, order.email))
        .limit(1);

      const secret = env.SUPABASE_JWT_SECRET || '100k_secret_jwt_key_development';
      const authToken = jwt.sign(
        {
          sub: existingUser?.id || order.createdUserId || 'admin',
          email: order.email,
          company_id: order.createdCompanyId,
          role: existingUser?.role || 'admin',
        },
        secret,
        { expiresIn: '30d' }
      );

      return success(reply, {
        completed: true,
        company_id: order.createdCompanyId,
        company_name: existingCompany?.name || order.companyName,
        nip: order.nip,
        token: authToken,
        redirect_to: `${env.PUBLIC_ADMIN_URL}/dashboard/licenses`,
      }, 'Onboarding already completed');
    }

    const creds = getSolutionsBayCredentials();

    // Verify payment with Saferpay (if token present and not mock)
    if (order.saferpayToken && !order.saferpayToken.startsWith('test_token_') && creds.password) {
      const assertRes = await assertPaymentPage(order.saferpayToken, creds);
      if (!assertRes.success || !assertRes.transactionId) {
        return error(reply, `Płatność nie została potwierdzona: ${assertRes.error || 'Nieautoryzowana'}`, 402);
      }

      if (assertRes.status === 'AUTHORIZED') {
        await captureTransaction(assertRes.transactionId, creds);
      }

      await db
        .update(onboardingOrders)
        .set({
          status: 'paid',
          saferpayTransactionId: assertRes.transactionId,
        })
        .where(eq(onboardingOrders.id, order.id));
    }

    // Step A: Register / find client in RYCOS Portal API by NIP
    let rycosClient = null;
    try {
      if (rycosIntegratorService.isConfigured()) {
        rycosClient = await rycosIntegratorService.createClient({
          nip: order.nip,
          name: order.companyName,
          email: order.email,
          phone: order.phone || undefined,
          address_street: order.address || undefined,
        });

        // Step B: Provision purchased seats in RYCOS Portal
        const plan = order.planDetails as any;
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + (order.months || 1));

        if (rycosClient && (plan.seats_pf > 0 || plan.seats_f > 0 || plan.seats_p > 0 || plan.seats_0 > 0)) {
          await rycosIntegratorService.createPurchase(rycosClient.id, {
            bundle_type: 'flex',
            seats_pf: plan.seats_pf || 0,
            seats_f: plan.seats_f || 0,
            seats_p: plan.seats_p || 0,
            seats_0: plan.seats_0 || 0,
            expires_at: expiryDate.toISOString(),
            notes: `Self-Service Onboarding Order #${order.id} (${order.months}m)`,
          });
        }
      }
    } catch (portalErr: any) {
      console.error('[Onboarding] RYCOS Portal provisioning warning:', portalErr.message);
    }

    // Step C: Create company in 100k database
    const companySlug = order.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `cmp-${Date.now()}`;
    const [newCompany] = await db
      .insert(companies)
      .values({
        name: order.companyName,
        slug: companySlug,
        nip: order.nip,
        email: order.email,
        phone: order.phone || null,
        address: order.address || null,
        currency: 'PLN',
        isAcceptingOrders: true,
      })
      .returning();

    // Step D: Create default location and brand
    const [newLoc] = await db
      .insert(locations)
      .values({
        companyId: newCompany.id,
        name: 'Lokal Główny',
        address: order.address || null,
        isActive: true,
      })
      .returning();

    await db
      .insert(brands)
      .values({
        companyId: newCompany.id,
        locationId: newLoc.id,
        name: order.companyName,
        slug: order.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `brand-${newCompany.id}`,
        isActive: true,
        allowPayAtCounter: true,
      });

    // Step E: Create Company Admin user account
    const userId = `usr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await db
      .insert(users)
      .values({
        id: userId,
        companyId: newCompany.id,
        email: order.email,
        passwordHash: order.adminPasswordHash,
        name: order.companyName,
        role: 'admin',
        isActive: true,
      });

    // Step F: Mark order as completed
    await db
      .update(onboardingOrders)
      .set({
        status: 'completed',
        createdCompanyId: newCompany.id,
        createdUserId: userId,
        rycosClientId: rycosClient?.id || null,
        completedAt: new Date(),
      })
      .where(eq(onboardingOrders.id, order.id));

    // Generate JWT token
    const secret = env.SUPABASE_JWT_SECRET || '100k_secret_jwt_key_development';
    const authToken = jwt.sign(
      {
        sub: userId,
        email: order.email,
        company_id: newCompany.id,
        role: 'admin',
      },
      secret,
      { expiresIn: '30d' }
    );

    return success(reply, {
      completed: true,
      company_id: newCompany.id,
      company_name: newCompany.name,
      nip: newCompany.nip,
      token: authToken,
      redirect_to: `${env.PUBLIC_ADMIN_URL}/dashboard/licenses`,
    }, 'Firma została pomyślnie utworzona i skonfigurowana');
  });
}
