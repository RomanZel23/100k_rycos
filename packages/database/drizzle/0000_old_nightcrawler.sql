CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"location_id" integer,
	"name" varchar(255) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"logo_url" text,
	"banner_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "companies" (
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
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminals" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"location_id" integer,
	"terminal_id" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "terminals_terminal_id_unique" UNIQUE("terminal_id")
);
--> statement-breakpoint
CREATE TABLE "addon_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"selection_mode" varchar(16) DEFAULT 'single' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "addon_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"price_delta" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"product_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"language" varchar(8) NOT NULL,
	"attribute_name" varchar(32) NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_addon_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"category_id" integer,
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
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" integer,
	"name" varchar(255) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"tax_rate" integer DEFAULT 23 NOT NULL,
	"ptu_code" varchar(2) DEFAULT 'a' NOT NULL,
	"line_total" numeric(10, 2) NOT NULL,
	"addons_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"special_instructions" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" integer NOT NULL,
	"brand_id" integer NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "fiscal_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"device_id" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"kind" varchar(8) DEFAULT 'device' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_online" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"company_id" integer NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "rycos_clients" (
	"company_id" integer PRIMARY KEY NOT NULL,
	"rycos_client_id" uuid NOT NULL,
	"nip" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"hub_id" varchar(32),
	"fiscal_topic" varchar(96),
	"linked_by" varchar(255),
	"synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rycos_clients_rycos_client_id_unique" UNIQUE("rycos_client_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"status_code" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
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
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addon_groups" ADD CONSTRAINT "addon_groups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addon_options" ADD CONSTRAINT "addon_options_group_id_addon_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."addon_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_products" ADD CONSTRAINT "brand_products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_products" ADD CONSTRAINT "brand_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_addon_groups" ADD CONSTRAINT "product_addon_groups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_addon_groups" ADD CONSTRAINT "product_addon_groups_group_id_addon_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."addon_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_devices" ADD CONSTRAINT "fiscal_devices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rycos_clients" ADD CONSTRAINT "rycos_clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brand_product" ON "brand_products" USING btree ("brand_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_entity_translation" ON "content_translations" USING btree ("entity_type","entity_id","language","attribute_name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_product_addon_group" ON "product_addon_groups" USING btree ("product_id","group_id");--> statement-breakpoint
CREATE INDEX "idx_order_events_order" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_order" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_orders_company_status" ON "orders" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_orders_brand" ON "orders" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_orders_created" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_company_fiscal_device" ON "fiscal_devices" USING btree ("company_id","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_order_fiscal_receipt" ON "fiscal_receipts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_outbox_status_created" ON "outbox_events" USING btree ("status","created_at");