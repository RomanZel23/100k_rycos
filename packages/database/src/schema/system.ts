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
