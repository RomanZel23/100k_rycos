import { pgTable, uuid, serial, integer, varchar, text, numeric, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies, brands } from './companies.js';
import { products } from './catalog.js';

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  brandId: integer('brand_id').references(() => brands.id, { onDelete: 'cascade' }).notNull(),
  orderNumber: integer('order_number').notNull(),
  collectionPin: varchar('collection_pin', { length: 8 }).notNull(),
  status: varchar('status', { length: 32 }).default('pending_payment').notNull(),
  orderType: varchar('order_type', { length: 32 }).default('dine_in').notNull(),
  tableLabel: varchar('table_label', { length: 64 }),
  parkingSpot: varchar('parking_spot', { length: 64 }),
  customerNip: varchar('customer_nip', { length: 16 }),
  customerNote: text('customer_note'),
  subtotalAmount: numeric('subtotal_amount', { precision: 10, scale: 2 }).notNull(),
  tipAmount: numeric('tip_amount', { precision: 10, scale: 2 }).default('0.00').notNull(),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 4 }).default('PLN').notNull(),
  paymentMethod: varchar('payment_method', { length: 32 }),
  paymentStatus: varchar('payment_status', { length: 32 }).default('pending').notNull(),
  fiscalStatus: varchar('fiscal_status', { length: 32 }).default('none').notNull(), // 'none', 'pending', 'issued', 'failed'
  fiscalDeviceId: varchar('fiscal_device_id', { length: 64 }),
  fiscalReceiptNumber: varchar('fiscal_receipt_number', { length: 64 }),
  fiscalPdfUrl: text('fiscal_pdf_url'),
  terminalId: varchar('terminal_id', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_orders_company_status').on(t.companyId, t.status),
  index('idx_orders_brand').on(t.brandId),
  index('idx_orders_created').on(t.createdAt),
]);

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  taxRate: integer('tax_rate').default(23).notNull(),
  ptuCode: varchar('ptu_code', { length: 2 }).default('a').notNull(),
  lineTotal: numeric('line_total', { precision: 10, scale: 2 }).notNull(),
  addonsJson: jsonb('addons_json').default([]).notNull(),
  specialInstructions: text('special_instructions'),
}, (t) => [
  index('idx_order_items_order').on(t.orderId),
]);

export const orderEvents = pgTable('order_events', {
  id: serial('id').primaryKey(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_order_events_order').on(t.orderId),
]);
