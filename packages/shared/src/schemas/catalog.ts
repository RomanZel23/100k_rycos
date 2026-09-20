import { z } from 'zod';

export const TranslationMapSchema = z.record(z.string(), z.record(z.string(), z.string()));
export type TranslationMap = z.infer<typeof TranslationMapSchema>;

export const AddonOptionSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  priceDelta: z.number().default(0), // in grosze/cents or decimal
  isAvailable: z.boolean().default(true),
  position: z.number().default(0),
  translations: TranslationMapSchema.optional().default({}),
});
export type AddonOption = z.infer<typeof AddonOptionSchema>;

export const AddonGroupSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  selectionMode: z.enum(['single', 'multiple']).default('single'),
  required: z.boolean().default(false),
  minSelect: z.number().default(0),
  maxSelect: z.number().default(1),
  position: z.number().default(0),
  options: z.array(AddonOptionSchema).default([]),
  translations: TranslationMapSchema.optional().default({}),
});
export type AddonGroup = z.infer<typeof AddonGroupSchema>;

export const ProductSchema = z.object({
  id: z.number(),
  companyId: z.number(),
  categoryId: z.number().nullable(),
  name: z.string().min(1),
  description: z.string().nullable().default(''),
  price: z.number().positive(), // in PLN or currency base unit
  taxRate: z.number().default(23), // VAT % (23, 8, 5, 0)
  ptuCode: z.enum(['a', 'b', 'c', 'd', 'e', 'f', 'g']).default('a'), // Polish fiscal PTU
  imageUrl: z.string().url().nullable().optional(),
  isAvailable: z.boolean().default(true),
  isAgeRestricted: z.boolean().default(false),
  prepTimeMinutes: z.number().nullable().default(null),
  barcode: z.string().nullable().default(null),
  productOrder: z.number().default(0),
  addonGroups: z.array(AddonGroupSchema).default([]),
  translations: TranslationMapSchema.optional().default({}),
});
export type Product = z.infer<typeof ProductSchema>;

export const CategorySchema = z.object({
  id: z.number(),
  companyId: z.number(),
  name: z.string().min(1),
  position: z.number().default(0),
  translations: TranslationMapSchema.optional().default({}),
});
export type Category = z.infer<typeof CategorySchema>;

export const BrandInfoSchema = z.object({
  id: z.number(),
  companyId: z.number(),
  name: z.string().min(1),
  slug: z.string().min(1),
  logoUrl: z.string().nullable().default(null),
  bannerUrl: z.string().nullable().default(null),
  footerUrl: z.string().nullable().optional().default(null),
  allowPayAtCounter: z.boolean().default(false),
  currency: z.string().default('PLN'),
  isAcceptingOrders: z.boolean().default(true),
  locationId: z.number().nullable().default(null),
  locationName: z.string().nullable().default(null),
  tables: z.array(z.string()).optional(),
  style: z.string().nullable().optional(),
  /** Customer menu arrangement: list = rows, boxed = image tiles grid, circled = round category chips */
  menuLayout: z.enum(['list', 'boxed', 'circled']).optional(),
  buttonColor: z.string().nullable().optional(),
  buttonTextColor: z.string().nullable().optional(),
  backgroundColor: z.string().nullable().optional(),
  termsAndConditions: z.string().nullable().optional(),
  privacyPolicy: z.string().nullable().optional(),
  settings: z.record(z.string(), z.boolean()).optional(),
});
export type BrandInfo = z.infer<typeof BrandInfoSchema>;

export const MenuResponseSchema = z.object({
  brand: BrandInfoSchema,
  categories: z.array(CategorySchema),
  products: z.array(ProductSchema),
});
export type MenuResponse = z.infer<typeof MenuResponseSchema>;
