import { pgTable, serial, uuid, varchar, text, boolean, timestamp, jsonb, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies, terminals } from './companies.js';
import { orders } from './orders.js';

export const rycosClients = pgTable('rycos_clients', {
  companyId: integer('company_id').primaryKey().references(() => companies.id, { onDelete: 'cascade' }),
  rycosClientId: uuid('rycos_client_id').notNull().unique(),
  nip: varchar('nip', { length: 20 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  hubId: varchar('hub_id', { length: 32 }),
  fiscalTopic: varchar('fiscal_topic', { length: 96 }),
  linkedBy: varchar('linked_by', { length: 255 }),
  syncedAt: timestamp('synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const fiscalDevices = pgTable('fiscal_devices', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  deviceId: varchar('device_id', { length: 64 }).notNull(), // e.g. SBT-NMLL2M or SBF-hub
  name: varchar('name', { length: 128 }).notNull(),
  status: varchar('status', { length: 32 }).default('active').notNull(),
  source: varchar('source', { length: 16 }).default('manual').notNull(), // 'manual' | 'rycos'
  kind: varchar('kind', { length: 8 }).default('device').notNull(), // 'device' | 'hub'
  isPrimary: boolean('is_primary').default(false).notNull(),
  isOnline: boolean('is_online').default(true).notNull(),
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_company_fiscal_device').on(t.companyId, t.deviceId),
]);

export const terminalFiscalDevices = pgTable('terminal_fiscal_devices', {
  id: serial('id').primaryKey(),
  terminalId: integer('terminal_id').references(() => terminals.id, { onDelete: 'cascade' }).notNull(),
  fiscalDeviceId: integer('fiscal_device_id').references(() => fiscalDevices.id, { onDelete: 'cascade' }).notNull(),
  position: integer('position').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_terminal_fiscal_device').on(t.terminalId, t.fiscalDeviceId),
]);

export const fiscalReceipts = pgTable('fiscal_receipts', {
  id: serial('id').primaryKey(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  displayId: varchar('display_id', { length: 64 }).notNull(),
  requestId: varchar('request_id', { length: 64 }).notNull(),
  receiptNumber: varchar('receipt_number', { length: 64 }),
  jpkId: varchar('jpk_id', { length: 64 }),
  jobId: varchar('job_id', { length: 64 }),
  cashRegisterId: varchar('cash_register_id', { length: 64 }),
  issuerNip: varchar('issuer_nip', { length: 20 }),
  customerNip: varchar('customer_nip', { length: 20 }),
  grossAmountGrosze: integer('gross_amount_grosze').notNull(),
  currency: varchar('currency', { length: 4 }).default('PLN').notNull(),
  pdfReceiptUrl: text('pdf_receipt_url'),
  rawResult: jsonb('raw_result'),
  printedAt: timestamp('printed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_order_fiscal_receipt').on(t.orderId),
]);
