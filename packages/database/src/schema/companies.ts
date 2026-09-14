import { pgTable, serial, varchar, text, boolean, timestamp, integer, jsonb, unique } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  email: varchar('email', { length: 255 }),
  country: varchar('country', { length: 4 }).default('PL'),
  currency: varchar('currency', { length: 4 }).default('PLN'),
  address: text('address'),
  phone: varchar('phone', { length: 64 }),
  businessType: varchar('business_type', { length: 64 }).default('product'),
  defaultLanguage: varchar('default_language', { length: 8 }).default('pl'),
  termsAndConditions: text('terms_and_conditions'),
  privacyPolicy: text('privacy_policy'),
  isAcceptingOrders: boolean('is_accepting_orders').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const brands = pgTable('brands', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  locationId: integer('location_id').references(() => locations.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  menuLayout: varchar('menu_layout', { length: 32 }).default('list').notNull(),
  language: varchar('language', { length: 8 }).default('pl').notNull(),
  currency: varchar('currency', { length: 8 }).default('PLN').notNull(),
  style: text('style'),
  logoUrl: text('logo_url'),
  bannerUrl: text('banner_url'),
  footerUrl: text('footer_url'),
  allowPayAtCounter: boolean('allow_pay_at_counter').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const terminals = pgTable('terminals', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  locationId: integer('location_id').references(() => locations.id, { onDelete: 'set null' }),
  terminalId: varchar('terminal_id', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  role: varchar('role', { length: 32 }).default('all_in_one').notNull(), // 'all_in_one' | 'pos' | 'pickup' | 'kds' | 'kiosk' | 'fiscal_hub'
  assignedBrandIds: jsonb('assigned_brand_ids').$type<number[]>().default([]).notNull(), // empty = all brands at location
  printerDeviceId: varchar('printer_device_id', { length: 64 }), // e.g. SBR-* or 'self'
  tapDeviceId: varchar('tap_device_id', { length: 64 }), // e.g. SBR-* with SoftPOS license or 'self'
  fiscalDeviceId: varchar('fiscal_device_id', { length: 64 }), // SBF-* or SBR-*
  capabilities: jsonb('capabilities').$type<{
    can_sell?: boolean;
    can_kds?: boolean;
    can_pickup?: boolean;
    has_softpos?: boolean;
    has_printer?: boolean;
  }>().default({ can_sell: true, can_kds: true, can_pickup: true }).notNull(),
  configJson: jsonb('config_json').$type<Record<string, any>>().default({}).notNull(),
  isPrimary: boolean('is_primary').default(false).notNull(),
  status: varchar('status', { length: 32 }).default('active').notNull(),
  lastActiveAt: timestamp('last_active_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: varchar('id', { length: 64 }).primaryKey(), // Supabase auth user UUID or string ID
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 128 }),
  role: varchar('role', { length: 32 }).default('staff').notNull(), // 'super_admin' | 'admin' | 'manager' | 'staff' | 'kitchen'
  passwordHash: text('password_hash'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const companyPaymentGateways = pgTable('company_payment_gateways', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  gatewayName: varchar('gateway_name', { length: 64 }).default('SaferPay').notNull(),
  type: varchar('type', { length: 32 }).default('card_blik').notNull(),
  publicKey: varchar('public_key', { length: 255 }), // Saferpay API Username
  privateKey: text('private_key'), // Saferpay API Password
  customerId: varchar('customer_id', { length: 64 }),
  terminalId: varchar('terminal_id', { length: 64 }),
  isTest: boolean('is_test').default(true).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const companySettings = pgTable('company_settings', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  featureKey: varchar('feature_key', { length: 64 }).notNull(),
  isEnabled: boolean('is_enabled').default(false).notNull(),
  config: jsonb('config').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  unique('company_settings_company_feature_unique').on(t.companyId, t.featureKey),
]);
