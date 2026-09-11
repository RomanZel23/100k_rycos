import { pgTable, serial, varchar, text, numeric, integer, boolean, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies, brands } from './companies';

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  position: integer('position').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').default(''),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(), // e.g. 25.50
  taxRate: integer('tax_rate').default(23).notNull(), // 23, 8, 5, 0
  ptuCode: varchar('ptu_code', { length: 2 }).default('a').notNull(),
  imageUrl: text('image_url'),
  isAvailable: boolean('is_available').default(true).notNull(),
  isAgeRestricted: boolean('is_age_restricted').default(false).notNull(),
  stockQuantity: integer('stock_quantity'),
  prepTimeMinutes: integer('prep_time_minutes'),
  barcode: varchar('barcode', { length: 64 }),
  productOrder: integer('product_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const brandProducts = pgTable('brand_products', {
  id: serial('id').primaryKey(),
  brandId: integer('brand_id').references(() => brands.id, { onDelete: 'cascade' }).notNull(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
}, (t) => [
  uniqueIndex('uq_brand_product').on(t.brandId, t.productId),
]);

export const addonGroups = pgTable('addon_groups', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  selectionMode: varchar('selection_mode', { length: 16 }).default('single').notNull(), // 'single' | 'multiple'
  required: boolean('required').default(false).notNull(),
  minSelect: integer('min_select').default(0).notNull(),
  maxSelect: integer('max_select').default(1).notNull(),
  position: integer('position').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const addonOptions = pgTable('addon_options', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').references(() => addonGroups.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  priceDelta: numeric('price_delta', { precision: 10, scale: 2 }).default('0.00').notNull(),
  isAvailable: boolean('is_available').default(true).notNull(),
  position: integer('position').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productAddonGroups = pgTable('product_addon_groups', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  groupId: integer('group_id').references(() => addonGroups.id, { onDelete: 'cascade' }).notNull(),
  position: integer('position').default(0).notNull(),
}, (t) => [
  uniqueIndex('uq_product_addon_group').on(t.productId, t.groupId),
]);

export const contentTranslations = pgTable('content_translations', {
  id: serial('id').primaryKey(),
  entityType: varchar('entity_type', { length: 32 }).notNull(), // 'products', 'categories', 'addon_groups', 'addon_options'
  entityId: integer('entity_id').notNull(),
  language: varchar('language', { length: 8 }).notNull(), // 'pl', 'en', 'fr', 'de'
  attributeName: varchar('attribute_name', { length: 32 }).notNull(), // 'name', 'description'
  value: text('value').notNull(),
}, (t) => [
  uniqueIndex('uq_entity_translation').on(t.entityType, t.entityId, t.language, t.attributeName),
]);
