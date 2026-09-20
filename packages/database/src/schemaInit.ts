import { getDatabase, getRawClient } from './client.js';
import { sql } from 'drizzle-orm';
import { seedDatabase } from './seed.js';

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"nip" varchar(32),
	"email" varchar(255),
	"country" varchar(4) DEFAULT 'PL',
	"currency" varchar(4) DEFAULT 'PLN',
	"is_accepting_orders" boolean DEFAULT true NOT NULL,
	"license_token" varchar(128),
	"license_status" varchar(32) DEFAULT 'unconfigured',
	"license_valid_until" timestamp,
	"license_last_check_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"name" varchar(255) NOT NULL,
	"address" text,
	"tables" jsonb DEFAULT '["1","2","3","4","5","6","7","8","9","10","Bar","Ogródek 1","Ogródek 2"]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"location_id" integer REFERENCES "locations"("id") ON DELETE set null,
	"name" varchar(255) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"menu_layout" varchar(32) DEFAULT 'list' NOT NULL,
	"language" varchar(8) DEFAULT 'pl' NOT NULL,
	"currency" varchar(8) DEFAULT 'PLN' NOT NULL,
	"style" text,
	"logo_url" text,
	"banner_url" text,
	"footer_url" text,
	"allow_pay_at_counter" boolean DEFAULT false NOT NULL,
	"tables" jsonb,
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
	"role" varchar(32) DEFAULT 'all_in_one' NOT NULL,
	"assigned_brand_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"printer_device_id" varchar(64),
	"tap_device_id" varchar(64),
	"fiscal_device_id" varchar(64),
	"capabilities" jsonb DEFAULT '{"can_sell":true,"can_kds":true,"can_pickup":true}'::jsonb NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
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
	"fiscal_job_id" varchar(64),
	"fiscal_qr_code" text,
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
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"kind" varchar(8) DEFAULT 'device' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_online" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "terminal_fiscal_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"terminal_id" integer NOT NULL REFERENCES "terminals"("id") ON DELETE cascade,
	"fiscal_device_id" integer NOT NULL REFERENCES "fiscal_devices"("id") ON DELETE cascade,
	"position" integer DEFAULT 0 NOT NULL,
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
	"password_hash" text,
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

CREATE TABLE IF NOT EXISTS "storage_files" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"bucket" varchar(64) DEFAULT 'products' NOT NULL,
	"name" varchar(255) NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"size" integer NOT NULL,
	"data" bytea NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_storage_files_bucket_name" ON "storage_files" ("bucket", "name");

CREATE TABLE IF NOT EXISTS "company_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"feature_key" varchar(64) NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_settings_company_feature_unique" UNIQUE("company_id", "feature_key")
);

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "nip" varchar(32);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "phone" varchar(64);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "business_type" varchar(64) DEFAULT 'product';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_language" varchar(8) DEFAULT 'pl';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "terms_and_conditions" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "privacy_policy" text;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_quantity" integer;
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "footer_url" text;
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "menu_layout" varchar(32) DEFAULT 'list';
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "language" varchar(8) DEFAULT 'pl';
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "currency" varchar(8) DEFAULT 'PLN';
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "style" text;

ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "role" varchar(32) DEFAULT 'all_in_one' NOT NULL;
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "assigned_brand_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "printer_device_id" varchar(64);
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "tap_device_id" varchar(64);
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "fiscal_device_id" varchar(64);
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "capabilities" jsonb DEFAULT '{"can_sell":true,"can_kds":true,"can_pickup":true}'::jsonb NOT NULL;
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "config_json" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fiscal_job_id" varchar(64);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fiscal_qr_code" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "tables" jsonb DEFAULT '["1","2","3","4","5","6","7","8","9","10","Bar","Ogródek 1","Ogródek 2"]'::jsonb NOT NULL;
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "tables" jsonb;
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "location_id" integer;

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

CREATE UNIQUE INDEX IF NOT EXISTS "uq_brand_product" ON "brand_products" ("brand_id", "product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_entity_translation" ON "content_translations" ("entity_type", "entity_id", "language", "attribute_name");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_addon_group" ON "product_addon_groups" ("product_id", "group_id");
CREATE INDEX IF NOT EXISTS "idx_order_events_order" ON "order_events" ("order_id");
CREATE INDEX IF NOT EXISTS "idx_order_items_order" ON "order_items" ("order_id");
CREATE INDEX IF NOT EXISTS "idx_orders_company_status" ON "orders" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "idx_orders_brand" ON "orders" ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_orders_created" ON "orders" ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_company_fiscal_device" ON "fiscal_devices" ("company_id", "device_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_terminal_fiscal_device" ON "terminal_fiscal_devices" ("terminal_id", "fiscal_device_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_order_fiscal_receipt" ON "fiscal_receipts" ("order_id");
CREATE INDEX IF NOT EXISTS "idx_outbox_status_created" ON "outbox_events" ("status", "created_at");
`;


/**
 * Flow hardening migration (idempotent). Runs on every boot, for both fresh and existing databases.
 * - persisted payment tracking, fiscal claim bookkeeping, stock release flag on orders
 * - atomic order counters (+ unique order numbers per company)
 * - inventory ledger
 * - outbox retry scheduling
 * - terminal session versioning (token revocation)
 */
export const FLOW_HARDENING_DDL = `
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_token" varchar(128);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_reference" varchar(128);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paid_amount_grosze" integer;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paid_at" timestamp;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fiscal_attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fiscal_error" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fiscal_claimed_at" timestamp;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stock_released" boolean DEFAULT false NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;
CREATE INDEX IF NOT EXISTS "idx_orders_pending_payment" ON "orders" ("status", "created_at") WHERE "status" = 'pending_payment';
CREATE INDEX IF NOT EXISTS "idx_orders_company_pin" ON "orders" ("company_id", "collection_pin");

CREATE TABLE IF NOT EXISTS "order_counters" (
  "company_id" integer PRIMARY KEY NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "last_number" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
INSERT INTO "order_counters" ("company_id", "last_number")
SELECT o.company_id, MAX(o.order_number) FROM "orders" o WHERE o.order_type <> 'test' GROUP BY o.company_id
ON CONFLICT ("company_id") DO UPDATE SET "last_number" = GREATEST("order_counters"."last_number", EXCLUDED."last_number");

DO $uq$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "uq_orders_company_number" ON "orders" ("company_id", "order_number") WHERE "order_type" <> 'test';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'uq_orders_company_number not created: historical duplicate order numbers exist';
END $uq$;

CREATE TABLE IF NOT EXISTS "inventory_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE cascade,
  "quantity_change" integer NOT NULL,
  "quantity_after" integer,
  "is_available_after" boolean,
  "source" varchar(16) NOT NULL,
  "reference" varchar(128),
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_inventory_history_company_created" ON "inventory_history" ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_inventory_history_product" ON "inventory_history" ("product_id");

ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp DEFAULT now() NOT NULL;
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "locked_at" timestamp;
CREATE INDEX IF NOT EXISTS "idx_outbox_pending_next" ON "outbox_events" ("status", "next_attempt_at");

ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 0 NOT NULL;

DO $ob$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'onboarding_orders') THEN
    ALTER TABLE "onboarding_orders" ADD COLUMN IF NOT EXISTS "provisioning_state" jsonb DEFAULT '{}'::jsonb NOT NULL;
  END IF;
END $ob$;

DELETE FROM "idempotency_keys" WHERE "expires_at" < now();
`;

export async function ensureDatabaseSchema() {
  const raw = getRawClient();
  if (!raw) return;

  try {
    // Acquire PostgreSQL non-blocking advisory lock so API and Worker never run DDL concurrently
    const lockCheck: any = await raw.unsafe(`SELECT pg_try_advisory_lock(100100) AS acquired;`);
    const acquired = lockCheck?.[0]?.acquired === true || lockCheck?.rows?.[0]?.acquired === true;
    if (!acquired) {
      console.log('ℹ️ [DB Auto-Init] Migration lock held by sibling process, skipping concurrent DDL');
      return;
    }

    try {
      const check: any = await raw.unsafe(`
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'outbox_events' LIMIT 1;
      `);

      if (check.length === 0) {
        console.log('⚡ [DB Auto-Init] Core tables not found. Provisioning 100k_rycos schema...');
        await raw.unsafe(SCHEMA_DDL);
        console.log('✓ [DB Auto-Init] PostgreSQL schema provisioned (22 tables, indexes & foreign keys)');
      } else {
        // Idempotent migration for existing installations
        await raw.unsafe(`
          CREATE TABLE IF NOT EXISTS "users" (
            "id" varchar(64) PRIMARY KEY NOT NULL,
            "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
            "email" varchar(255) NOT NULL,
            "name" varchar(128),
            "role" varchar(32) DEFAULT 'staff' NOT NULL,
            "password_hash" text,
            "is_active" boolean DEFAULT true NOT NULL,
            "created_at" timestamp DEFAULT now() NOT NULL,
            "updated_at" timestamp DEFAULT now() NOT NULL
          );
          ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
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
          ALTER TABLE "fiscal_devices" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'active' NOT NULL;
          ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "menu_layout" varchar(32) DEFAULT 'list';
          ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "language" varchar(8) DEFAULT 'pl';
          ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "currency" varchar(8) DEFAULT 'PLN';
          ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "style" text;
          ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "footer_url" text;
          ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "role" varchar(32) DEFAULT 'all_in_one' NOT NULL;
          ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "assigned_brand_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
          ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "printer_device_id" varchar(64);
          ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "tap_device_id" varchar(64);
          ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "fiscal_device_id" varchar(64);
          ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "capabilities" jsonb DEFAULT '{"can_sell":true,"can_kds":true,"can_pickup":true}'::jsonb NOT NULL;
          ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "config_json" jsonb DEFAULT '{}'::jsonb NOT NULL;
          CREATE TABLE IF NOT EXISTS "storage_files" (
            "id" varchar(128) PRIMARY KEY NOT NULL,
            "bucket" varchar(64) DEFAULT 'products' NOT NULL,
            "name" varchar(255) NOT NULL,
            "mime_type" varchar(128) NOT NULL,
            "size" integer NOT NULL,
            "data" bytea NOT NULL,
            "created_at" timestamp DEFAULT now() NOT NULL,
            "updated_at" timestamp DEFAULT now() NOT NULL
          );
          CREATE INDEX IF NOT EXISTS "idx_storage_files_bucket_name" ON "storage_files" ("bucket", "name");
          CREATE TABLE IF NOT EXISTS "terminal_fiscal_devices" (
            "id" serial PRIMARY KEY NOT NULL,
            "terminal_id" integer NOT NULL REFERENCES "terminals"("id") ON DELETE cascade,
            "fiscal_device_id" integer NOT NULL REFERENCES "fiscal_devices"("id") ON DELETE cascade,
            "position" integer DEFAULT 0 NOT NULL,
            "created_at" timestamp DEFAULT now() NOT NULL
          );
          CREATE UNIQUE INDEX IF NOT EXISTS "uq_terminal_fiscal_device" ON "terminal_fiscal_devices" ("terminal_id", "fiscal_device_id");

          CREATE TABLE IF NOT EXISTS "company_settings" (
            "id" serial PRIMARY KEY NOT NULL,
            "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
            "feature_key" varchar(64) NOT NULL,
            "is_enabled" boolean DEFAULT false NOT NULL,
            "config" jsonb,
            "created_at" timestamp DEFAULT now() NOT NULL,
            "updated_at" timestamp DEFAULT now() NOT NULL,
            CONSTRAINT "company_settings_company_feature_unique" UNIQUE("company_id", "feature_key")
          );

          ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "nip" varchar(32);
          ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "address" text;
          ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "phone" varchar(64);
          ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "business_type" varchar(64) DEFAULT 'product';
          ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_language" varchar(8) DEFAULT 'pl';
          ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "terms_and_conditions" text;
          ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "privacy_policy" text;
          ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "license_token" varchar(128);
          ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "license_status" varchar(32) DEFAULT 'unconfigured';
          ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "license_valid_until" timestamp;
          ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "license_last_check_at" timestamp;

          ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "allow_pay_at_counter" boolean DEFAULT false NOT NULL;
          ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "tables" jsonb DEFAULT '["1","2","3","4","5","6","7","8","9","10","Bar","Ogródek 1","Ogródek 2"]'::jsonb NOT NULL;
          ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "tables" jsonb;
          ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "location_id" integer;

          ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fiscal_job_id" varchar(128);
          ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fiscal_qr_code" text;
          ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fiscal_status" varchar(32) DEFAULT 'none' NOT NULL;
          ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fiscal_device_id" varchar(64);
          ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fiscal_receipt_number" varchar(64);
          ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fiscal_pdf_url" text;
          ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "terminal_id" varchar(64);

          CREATE TABLE IF NOT EXISTS "fiscal_receipts" (
            "id" serial PRIMARY KEY NOT NULL,
            "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE cascade,
            "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
            "display_id" varchar(64) NOT NULL,
            "request_id" varchar(128) NOT NULL,
            "receipt_number" varchar(64) NOT NULL,
            "jpk_id" varchar(128),
            "job_id" varchar(128),
            "gross_amount_grosze" integer NOT NULL,
            "currency" varchar(4) DEFAULT 'PLN' NOT NULL,
            "customer_nip" varchar(16),
            "pdf_receipt_url" text,
            "raw_result" jsonb,
            "printed_at" timestamp,
            "created_at" timestamp DEFAULT now() NOT NULL,
            CONSTRAINT "fiscal_receipts_order_id_unique" UNIQUE("order_id")
          );

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

          INSERT INTO "platform_pricing" ("item_key", "title", "description", "monthly_price_pln", "discount_6m_percent", "discount_12m_percent")
          VALUES
            ('platform_100k', 'Platforma 100k-RYCOS', 'Wysokowydajny silnik zamówień (100k/min), KDS, POS, Master SaaS', 199, 10, 20),
            ('rycos_pf', 'SBR Pełna (POS + Kasa fiskalna + SoftPOS)', 'Wszystko w jednym na terminalu SBR: sprzedaż, e-paragony i płatności zbliżeniowe', 89, 10, 20),
            ('rycos_f', 'SBR Fiskalna (Aplikasa)', 'Wirtualna kasa fiskalna zintegrowana z Centralnym Repozytorium Kas (MF)', 49, 10, 20),
            ('rycos_p', 'SBR Płatnicza (SoftPOS)', 'Akceptacja płatności kartami VISA / MasterCard / Apple Pay / Google Pay (PIN-on-Glass)', 39, 10, 20),
            ('rycos_0', 'SBR Podstawowa (POS)', 'Stanowisko kelnerskie / mobilny terminal zamówień POS', 19, 10, 20)
          ON CONFLICT ("item_key") DO NOTHING;
        `);
      }

      // Always apply idempotent flow-hardening migration
      await raw.unsafe(FLOW_HARDENING_DDL);

      // Check if brands table exists before querying count
      const brandsTableCheck: any = await raw.unsafe(`
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brands' LIMIT 1;
      `);

      if (brandsTableCheck.length > 0) {
        const brandsCount: any = await raw.unsafe(`SELECT count(*)::int as cnt FROM brands LIMIT 1;`);
        const freshDatabase = brandsCount[0]?.cnt === 0;
        if (freshDatabase) {
          console.log('🌱 [DB Auto-Init] Database is empty. Seeding demo menu (100k-RYCOS Burger & Pizza)...');
          await seedDatabase();
          console.log('✓ [DB Auto-Init] Demo menu seeded successfully');
        }

        // One-time demo bootstrap — ONLY right after seeding an empty database.
        // Previously this ran on EVERY boot and:
        //  - re-assigned every company product to every brand (brand menu edits reset after each deploy),
        //  - created en/de translations equal to the Polish name for every new product
        //    (later name edits in the panel never reached EN/DE customers).
        if (freshDatabase) await raw.unsafe(`
          UPDATE companies SET name = '100k-RYCOS Food Group' WHERE name ILIKE '%yalla%';
          UPDATE brands SET name = '100k-RYCOS Burger & Pizza' WHERE name ILIKE '%yalla%';

          INSERT INTO brands (company_id, location_id, name, slug, is_active)
          SELECT b.company_id, b.location_id, b.name, 'default', true
          FROM brands b
          WHERE b.id = 1 AND NOT EXISTS (SELECT 1 FROM brands WHERE slug = 'default')
          ON CONFLICT DO NOTHING;

          INSERT INTO brands (company_id, location_id, name, slug, is_active)
          SELECT b.company_id, b.location_id, b.name, '100k-rycos', true
          FROM brands b
          WHERE b.id = 1 AND NOT EXISTS (SELECT 1 FROM brands WHERE slug = '100k-rycos')
          ON CONFLICT DO NOTHING;

          INSERT INTO brand_products (brand_id, product_id)
          SELECT b.id, p.id
          FROM brands b
          JOIN products p ON p.company_id = b.company_id
          ON CONFLICT DO NOTHING;

          -- Seed multilingual translations for categories (EN & DE)
          INSERT INTO "content_translations" ("entity_type", "entity_id", "language", "attribute_name", "value")
          SELECT 'categories', c.id, 'en', 'name', 
            CASE 
              WHEN c.name ILIKE '%dania%' THEN 'Dishes'
              WHEN c.name ILIKE '%kanapki%' THEN 'Sandwiches'
              WHEN c.name ILIKE '%burgery%' THEN 'Burgers'
              WHEN c.name ILIKE '%pizza%' THEN 'Pizza'
              WHEN c.name ILIKE '%napoje%' THEN 'Drinks'
              ELSE c.name 
            END
          FROM categories c
          WHERE NOT EXISTS (
            SELECT 1 FROM content_translations 
            WHERE entity_type = 'categories' AND entity_id = c.id AND language = 'en' AND attribute_name = 'name'
          );

          INSERT INTO "content_translations" ("entity_type", "entity_id", "language", "attribute_name", "value")
          SELECT 'categories', c.id, 'de', 'name', 
            CASE 
              WHEN c.name ILIKE '%dania%' THEN 'Gerichte'
              WHEN c.name ILIKE '%kanapki%' THEN 'Sandwiches'
              WHEN c.name ILIKE '%burgery%' THEN 'Burger'
              WHEN c.name ILIKE '%pizza%' THEN 'Pizza'
              WHEN c.name ILIKE '%napoje%' THEN 'Getränke'
              ELSE c.name 
            END
          FROM categories c
          WHERE NOT EXISTS (
            SELECT 1 FROM content_translations 
            WHERE entity_type = 'categories' AND entity_id = c.id AND language = 'de' AND attribute_name = 'name'
          );

          -- Seed multilingual translations for products (EN & DE)
          INSERT INTO "content_translations" ("entity_type", "entity_id", "language", "attribute_name", "value")
          SELECT 'products', p.id, 'en', 'name',
            CASE
              WHEN p.name ILIKE '%hotdog%' THEN 'Super Hot Dog'
              WHEN p.name ILIKE '%kurczak%' THEN 'Crispy Chicken'
              WHEN p.name ILIKE '%chees%' THEN 'Cheeseburger'
              WHEN p.name ILIKE '%sandwich%' THEN 'Sandwich'
              WHEN p.name ILIKE '%lemoniada%' THEN 'Artisan Lemonade'
              WHEN p.name ILIKE '%warka%' THEN 'Warka Jasne Full'
              ELSE p.name
            END
          FROM products p
          WHERE NOT EXISTS (
            SELECT 1 FROM content_translations 
            WHERE entity_type = 'products' AND entity_id = p.id AND language = 'en' AND attribute_name = 'name'
          );

          INSERT INTO "content_translations" ("entity_type", "entity_id", "language", "attribute_name", "value")
          SELECT 'products', p.id, 'de', 'name',
            CASE
              WHEN p.name ILIKE '%hotdog%' THEN 'Super Hotdog'
              WHEN p.name ILIKE '%kurczak%' THEN 'Knuspriges Hähnchen'
              WHEN p.name ILIKE '%chees%' THEN 'Cheeseburger'
              WHEN p.name ILIKE '%sandwich%' THEN 'Sandwich'
              WHEN p.name ILIKE '%lemoniada%' THEN 'Hausgemachte Limonade'
              WHEN p.name ILIKE '%warka%' THEN 'Warka Jasne Vollbier'
              ELSE p.name
            END
          FROM products p
          WHERE NOT EXISTS (
            SELECT 1 FROM content_translations 
            WHERE entity_type = 'products' AND entity_id = p.id AND language = 'de' AND attribute_name = 'name'
          );

          INSERT INTO "content_translations" ("entity_type", "entity_id", "language", "attribute_name", "value")
          SELECT 'products', p.id, 'en', 'description',
            CASE
              WHEN p.name ILIKE '%kurczak%' THEN 'Crispy chicken strips in golden coating, truffle mayonnaise, fresh arugula, parmesan, lime.'
              WHEN p.name ILIKE '%hotdog%' THEN 'Hot dog with smoked bacon, melted cheese, avocado and jalapeno.'
              WHEN p.name ILIKE '%lemoniada%' THEN 'Lemon, fresh mint, a touch of agave.'
              WHEN p.name ILIKE '%warka%' THEN 'Warka Jasne Full is a classically brewed and lagered beer that owes its taste and aroma to the use of frozen hop cones.'
              ELSE p.description
            END
          FROM products p
          WHERE p.description IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM content_translations 
            WHERE entity_type = 'products' AND entity_id = p.id AND language = 'en' AND attribute_name = 'description'
          );

          INSERT INTO "content_translations" ("entity_type", "entity_id", "language", "attribute_name", "value")
          SELECT 'products', p.id, 'de', 'description',
            CASE
              WHEN p.name ILIKE '%kurczak%' THEN 'Knusprige Hähnchenstreifen in goldener Panade, Trüffel-Mayonnaise, Rucola, Parmesan, Limette.'
              WHEN p.name ILIKE '%hotdog%' THEN 'Hotdog mit geräuchertem Speck, geschmolzenem Käse, Avocado und Jalapeno.'
              WHEN p.name ILIKE '%lemoniada%' THEN 'Frische Zitrone, Minze, ein Hauch von Agavendicksaft.'
              WHEN p.name ILIKE '%warka%' THEN 'Warka Jasne Vollbier ist ein traditionell gebrautes und gelagertes Bier, das seinen Geschmack gefrorenen Hopfenzapfen verdankt.'
              ELSE p.description
            END
          FROM products p
          WHERE p.description IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM content_translations 
            WHERE entity_type = 'products' AND entity_id = p.id AND language = 'de' AND attribute_name = 'description'
          );
        `);
      }

      // Ensure roman.zeleznik@solutionsbay.pl is seeded as platform_admin
      await raw.unsafe(`
        INSERT INTO "users" ("id", "company_id", "email", "name", "role", "password_hash", "is_active", "created_at", "updated_at")
        VALUES ('usr-roman-zeleznik', 1, 'roman.zeleznik@solutionsbay.pl', 'Roman Żeleźnik', 'platform_admin', 'scrypt:33f5fca0a34d2c8096353d230aba1fea:8f08cd31b01ef0d0e63da8a205c3c56fcd70e58af87de12a885cf850429661623d287b3cba98ff4377e3c884ab47ba9cf6f0455791045b2cfd06ed24c5344e87', true, NOW(), NOW())
        ON CONFLICT ("id") DO UPDATE SET
          "company_id" = 1,
          "role" = 'platform_admin',
          "name" = 'Roman Żeleźnik',
          "password_hash" = COALESCE("users"."password_hash", 'scrypt:33f5fca0a34d2c8096353d230aba1fea:8f08cd31b01ef0d0e63da8a205c3c56fcd70e58af87de12a885cf850429661623d287b3cba98ff4377e3c884ab47ba9cf6f0455791045b2cfd06ed24c5344e87'),
          "is_active" = true,
          "updated_at" = NOW();

        DO $auth$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
            INSERT INTO auth.users (
              instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
              raw_app_meta_data, raw_user_meta_data, created_at, updated_at
            )
            VALUES (
              '00000000-0000-0000-0000-000000000000',
              'a0000000-0000-0000-0000-000000000001'::uuid,
              'authenticated',
              'authenticated',
              'roman.zeleznik@solutionsbay.pl',
              crypt('Abc@123456', gen_salt('bf')),
              NOW(),
              '{"provider":"email","providers":["email"]}'::jsonb,
              '{"company_id":1,"role":"platform_admin","name":"Roman Żeleźnik"}'::jsonb,
              NOW(),
              NOW()
            )
            ON CONFLICT (email) DO UPDATE SET
              -- never reset an existing password on boot
              raw_user_meta_data = '{"company_id":1,"role":"platform_admin","name":"Roman Żeleźnik"}'::jsonb,
              updated_at = NOW();

            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
              INSERT INTO auth.identities (
                id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
              )
              VALUES (
                'a0000000-0000-0000-0000-000000000001',
                'a0000000-0000-0000-0000-000000000001'::uuid,
                '{"sub":"a0000000-0000-0000-0000-000000000001","email":"roman.zeleznik@solutionsbay.pl"}'::jsonb,
                'email',
                'roman.zeleznik@solutionsbay.pl',
                NOW(),
                NOW(),
                NOW()
              )
              ON CONFLICT (provider, provider_id) DO NOTHING;
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END $auth$;

        DO $storage$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
            INSERT INTO storage.buckets (id, name, public)
            VALUES ('products', 'products', true)
            ON CONFLICT (id) DO UPDATE SET public = true;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END $storage$;
      `);
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
