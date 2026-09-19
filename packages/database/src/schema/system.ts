import { pgTable, bigserial, varchar, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const outboxEvents = pgTable('outbox_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  aggregateType: varchar('aggregate_type', { length: 64 }).notNull(), // 'order', 'payment', 'fiscal'
  aggregateId: varchar('aggregate_id', { length: 64 }).notNull(),
  eventType: varchar('event_type', { length: 64 }).notNull(), // 'order.created', 'order.paid', etc.
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 16 }).default('pending').notNull(), // 'pending', 'processing', 'completed', 'failed'
  retryCount: integer('retry_count').default(0).notNull(),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  nextAttemptAt: timestamp('next_attempt_at').defaultNow().notNull(),
  lockedAt: timestamp('locked_at'),
}, (t) => [
  index('idx_outbox_status_created').on(t.status, t.createdAt),
]);

export const idempotencyKeys = pgTable('idempotency_keys', {
  key: varchar('key', { length: 128 }).primaryKey(),
  statusCode: integer('status_code').notNull(),
  responseBody: jsonb('response_body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

export const platformPricing = pgTable('platform_pricing', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  itemKey: varchar('item_key', { length: 64 }).notNull().unique(), // 'platform_100k', 'rycos_pf', 'rycos_f', 'rycos_p', 'rycos_0'
  title: varchar('title', { length: 128 }).notNull(),
  description: text('description'),
  monthlyPricePln: integer('monthly_price_pln').notNull(), // net amount in PLN e.g. 199
  discount6mPercent: integer('discount_6m_percent').default(10).notNull(), // 10%
  discount12mPercent: integer('discount_12m_percent').default(20).notNull(), // 20%
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const onboardingOrders = pgTable('onboarding_orders', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderToken: varchar('order_token', { length: 64 }).notNull().unique(),
  nip: varchar('nip', { length: 32 }).notNull(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 64 }),
  address: text('address'),
  adminPasswordHash: text('admin_password_hash').notNull(),
  months: integer('months').default(1).notNull(), // 1, 6, 12
  planDetails: jsonb('plan_details').notNull(), // { platform_100k: 1, seats_pf: 2, seats_f: 0, seats_p: 0, seats_0: 1 }
  netAmountGrosze: integer('net_amount_grosze').notNull(),
  grossAmountGrosze: integer('gross_amount_grosze').notNull(),
  saferpayToken: varchar('saferpay_token', { length: 128 }),
  saferpayTransactionId: varchar('saferpay_transaction_id', { length: 128 }),
  status: varchar('status', { length: 32 }).default('pending').notNull(), // 'pending', 'paid', 'completed', 'failed'
  createdCompanyId: integer('created_company_id'),
  createdUserId: varchar('created_user_id', { length: 64 }),
  rycosClientId: varchar('rycos_client_id', { length: 64 }),
  errorDetails: text('error_details'),
  // Idempotent provisioning progress: { licenseToken?, purchaseDone?, rycosClientId? }
  provisioningState: jsonb('provisioning_state').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});
