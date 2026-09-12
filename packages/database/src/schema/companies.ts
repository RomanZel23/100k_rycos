import { pgTable, serial, varchar, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  email: varchar('email', { length: 255 }),
  country: varchar('country', { length: 4 }).default('PL'),
  currency: varchar('currency', { length: 4 }).default('PLN'),
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
  logoUrl: text('logo_url'),
  bannerUrl: text('banner_url'),
  footerUrl: text('footer_url'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const terminals = pgTable('terminals', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  locationId: integer('location_id').references(() => locations.id, { onDelete: 'set null' }),
  terminalId: varchar('terminal_id', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
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
