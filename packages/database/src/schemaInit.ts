import { getDatabase, getRawClient } from './client.js';
import { sql } from 'drizzle-orm';
import { seedDatabase } from './seed.js';

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"email" varchar(255),
	"country" varchar(4) DEFAULT 'PL',
	"currency" varchar(4) DEFAULT 'PLN',
	"is_accepting_orders" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"name" varchar(255) NOT NULL,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"location_id" integer REFERENCES "locations"("id") ON DELETE set null,
	"name" varchar(255) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"logo_url" text,
	"banner_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "terminals" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"location_id" integer REFERENCES "locations"("id") ON DELETE set null,
	"terminal_id" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "terminals_terminal_id_unique" UNIQUE("terminal_id")
);

CREATE TABLE IF NOT EXISTS "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"name" varchar(128) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"category_id" integer REFERENCES "categories"("id") ON DELETE set null,
	"name" varchar(255) NOT NULL,
	"description" text DEFAULT '',
	"price" numeric(10, 2) NOT NULL,
	"tax_rate" integer DEFAULT 23 NOT NULL,
	"ptu_code" varchar(2) DEFAULT 'a' NOT NULL,
	"image_url" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"is_age_restricted" boolean DEFAULT false NOT NULL,
	"prep_time_minutes" integer,
	"barcode" varchar(64),
	"product_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "addon_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"name" varchar(128) NOT NULL,
	"selection_mode" varchar(16) DEFAULT 'single' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "addon_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL REFERENCES "addon_groups"("id") ON DELETE cascade,
	"name" varchar(128) NOT NULL,
	"price_delta" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "brand_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
	"product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "product_addon_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE cascade,
	"group_id" integer NOT NULL REFERENCES "addon_groups"("id") ON DELETE cascade,
	"position" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "content_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"language" varchar(8) NOT NULL,
	"attribute_name" varchar(32) NOT NULL,
	"value" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"brand_id" integer NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
	"order_number" integer NOT NULL,
	"collection_pin" varchar(8) NOT NULL,
	"status" varchar(32) DEFAULT 'pending_payment' NOT NULL,
	"order_type" varchar(32) DEFAULT 'dine_in' NOT NULL,
	"table_label" varchar(64),
	"parking_spot" varchar(64),
	"customer_nip" varchar(16),
	"customer_note" text,
	"subtotal_amount" numeric(10, 2) NOT NULL,
	"tip_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"currency" varchar(4) DEFAULT 'PLN' NOT NULL,
	"payment_method" varchar(32),
	"payment_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"fiscal_status" varchar(32) DEFAULT 'none' NOT NULL,
	"fiscal_device_id" varchar(64),
	"fiscal_receipt_number" varchar(64),
	"fiscal_pdf_url" text,
	"terminal_id" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE cascade,
	"product_id" integer REFERENCES "products"("id") ON DELETE set null,
	"name" varchar(255) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"tax_rate" integer DEFAULT 23 NOT NULL,
	"ptu_code" varchar(2) DEFAULT 'a' NOT NULL,
	"line_total" numeric(10, 2) NOT NULL,
	"addons_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"special_instructions" text
);

CREATE TABLE IF NOT EXISTS "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE cascade,
	"event_type" varchar(64) NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fiscal_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"device_id" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"kind" varchar(8) DEFAULT 'device' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_online" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fiscal_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE cascade,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"display_id" varchar(64) NOT NULL,
	"request_id" varchar(64) NOT NULL,
	"receipt_number" varchar(64),
	"jpk_id" varchar(64),
	"job_id" varchar(64),
	"cash_register_id" varchar(64),
	"issuer_nip" varchar(20),
	"customer_nip" varchar(20),
	"gross_amount_grosze" integer NOT NULL,
	"currency" varchar(4) DEFAULT 'PLN' NOT NULL,
	"pdf_receipt_url" text,
	"raw_result" jsonb,
	"printed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rycos_clients" (
	"company_id" integer PRIMARY KEY NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"rycos_client_id" uuid NOT NULL UNIQUE,
	"nip" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"hub_id" varchar(32),
	"fiscal_topic" varchar(96),
	"linked_by" varchar(255),
	"synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"status_code" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "outbox_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"aggregate_type" varchar(64) NOT NULL,
	"aggregate_id" varchar(64) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);

CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"email" varchar(255) NOT NULL,
	"name" varchar(128),
	"role" varchar(32) DEFAULT 'staff' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "company_payment_gateways" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"gateway_name" varchar(64) DEFAULT 'SaferPay' NOT NULL,
	"type" varchar(32) DEFAULT 'card_blik' NOT NULL,
	"public_key" varchar(255),
	"private_key" text,
	"customer_id" varchar(64),
	"terminal_id" varchar(64),
	"is_test" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_quantity" integer;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_brand_product" ON "brand_products" ("brand_id", "product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_entity_translation" ON "content_translations" ("entity_type", "entity_id", "language", "attribute_name");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_addon_group" ON "product_addon_groups" ("product_id", "group_id");
CREATE INDEX IF NOT EXISTS "idx_order_events_order" ON "order_events" ("order_id");
CREATE INDEX IF NOT EXISTS "idx_order_items_order" ON "order_items" ("order_id");
CREATE INDEX IF NOT EXISTS "idx_orders_company_status" ON "orders" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "idx_orders_brand" ON "orders" ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_orders_created" ON "orders" ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_company_fiscal_device" ON "fiscal_devices" ("company_id", "device_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_order_fiscal_receipt" ON "fiscal_receipts" ("order_id");
CREATE INDEX IF NOT EXISTS "idx_outbox_status_created" ON "outbox_events" ("status", "created_at");
`;

export async function ensureDatabaseSchema() {
  const raw = getRawClient();
  if (!raw) return;

  try {
    // Acquire PostgreSQL session-level advisory lock so API and Worker never run DDL concurrently
    await raw.unsafe(`SELECT pg_advisory_lock(100100);`);

    try {
      const check: any = await raw.unsafe(`
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'outbox_events' LIMIT 1;
      `);

      if (check.length === 0) {
        console.log('⚡ [DB Auto-Init] Core tables not found. Provisioning 100k_rycos schema...');
        await raw.unsafe(SCHEMA_DDL);
        console.log('✓ [DB Auto-Init] PostgreSQL schema provisioned (21 tables, indexes & foreign keys)');
      } else {
        // Idempotent migration for existing installations
        await raw.unsafe(`
          CREATE TABLE IF NOT EXISTS "users" (
            "id" varchar(64) PRIMARY KEY NOT NULL,
            "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
            "email" varchar(255) NOT NULL,
            "name" varchar(128),
            "role" varchar(32) DEFAULT 'staff' NOT NULL,
            "is_active" boolean DEFAULT true NOT NULL,
            "created_at" timestamp DEFAULT now() NOT NULL,
            "updated_at" timestamp DEFAULT now() NOT NULL
          );
          CREATE TABLE IF NOT EXISTS "company_payment_gateways" (
            "id" serial PRIMARY KEY NOT NULL,
            "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
            "gateway_name" varchar(64) DEFAULT 'SaferPay' NOT NULL,
            "type" varchar(32) DEFAULT 'card_blik' NOT NULL,
            "public_key" varchar(255),
            "private_key" text,
            "customer_id" varchar(64),
            "terminal_id" varchar(64),
            "is_test" boolean DEFAULT true NOT NULL,
            "is_active" boolean DEFAULT true NOT NULL,
            "created_at" timestamp DEFAULT now() NOT NULL,
            "updated_at" timestamp DEFAULT now() NOT NULL
          );
          ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_quantity" integer;
        `);
      }

      // Check if brands table exists before querying count
      const brandsTableCheck: any = await raw.unsafe(`
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brands' LIMIT 1;
      `);

      if (brandsTableCheck.length > 0) {
        const brandsCount: any = await raw.unsafe(`SELECT count(*)::int as cnt FROM brands LIMIT 1;`);
        if (brandsCount[0]?.cnt === 0) {
          console.log('🌱 [DB Auto-Init] Database is empty. Seeding demo menu (Yalla Burger & Pizza)...');
          await seedDatabase();
          console.log('✓ [DB Auto-Init] Demo menu seeded successfully');
        }
      }
    } finally {
      await raw.unsafe(`SELECT pg_advisory_unlock(100100);`);
    }
  } catch (err: any) {
    if (err?.code === '23505' || err?.message?.includes('already exists')) {
      console.log('ℹ️ [DB Auto-Init] Tables already provisioned by sibling process');
    } else {
      console.error('[DB Auto-Init] Failed to ensure database schema:', err);
    }
  }
}
