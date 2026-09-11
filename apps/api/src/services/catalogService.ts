import { getDatabase, brands, categories, products, brandProducts, addonGroups, addonOptions, productAddonGroups, contentTranslations, locations } from '@rycos/database';
import { eq, inArray, and } from 'drizzle-orm';
import { BrandInfo, MenuResponse, Product, AddonGroup } from '@rycos/shared';
import Redis from 'ioredis';
import { env } from '../config/env.js';

let redis: Redis | null = null;
try {
  redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
} catch {}

const CACHE_TTL_SECONDS = 300; // 5 minutes

export async function getBrandBySlug(slug: string): Promise<BrandInfo | null> {
  const db = getDatabase();
  const rows = await db
    .select({
      id: brands.id,
      companyId: brands.companyId,
      name: brands.name,
      slug: brands.slug,
      logoUrl: brands.logoUrl,
      bannerUrl: brands.bannerUrl,
      isActive: brands.isActive,
      locationId: brands.locationId,
      locationName: locations.name,
    })
    .from(brands)
    .leftJoin(locations, eq(brands.locationId, locations.id))
    .where(and(eq(brands.slug, slug), eq(brands.isActive, true)))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logoUrl,
    bannerUrl: row.bannerUrl,
    currency: 'PLN',
    isAcceptingOrders: true,
    locationId: row.locationId,
    locationName: row.locationName,
  };
}

export async function getMenuByBrandId(brandId: number, companyId: number): Promise<MenuResponse | null> {
  const cacheKey = `menu:brand:${brandId}`;

  // 1. Try Redis Cache
  if (redis && redis.status === 'ready') {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}
  }

  const db = getDatabase();

  // 2. Fetch Brand Info
  const brandRows = await db
    .select()
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  if (brandRows.length === 0) return null;
  const b = brandRows[0];

  const brandInfo: BrandInfo = {
    id: b.id,
    companyId: b.companyId,
    name: b.name,
    slug: b.slug,
    logoUrl: b.logoUrl,
    bannerUrl: b.bannerUrl,
    currency: 'PLN',
    isAcceptingOrders: b.isActive,
    locationId: b.locationId,
    locationName: null,
  };

  // 3. Fetch Categories
  const categoryRows = await db
    .select()
    .from(categories)
    .where(eq(categories.companyId, companyId))
    .orderBy(categories.position);

  // 4. Fetch Products assigned to this brand
  const assignedProducts = await db
    .select({
      productId: brandProducts.productId,
    })
    .from(brandProducts)
    .where(eq(brandProducts.brandId, brandId));

  const productIds = assignedProducts.map((p) => p.productId);

  if (productIds.length === 0) {
    const emptyResponse: MenuResponse = {
      brand: brandInfo,
      categories: categoryRows.map((c) => ({
        id: c.id,
        companyId: c.companyId,
        name: c.name,
        position: c.position,
        translations: {},
      })),
      products: [],
    };
    return emptyResponse;
  }

  const productRows = await db
    .select()
    .from(products)
    .where(and(inArray(products.id, productIds), eq(products.isAvailable, true)))
    .orderBy(products.productOrder);

  // 5. Fetch Addon Groups & Options for these products
  const productAddonGroupRows = await db
    .select({
      productId: productAddonGroups.productId,
      groupId: addonGroups.id,
      groupName: addonGroups.name,
      selectionMode: addonGroups.selectionMode as 'single' | 'multiple',
      required: addonGroups.required,
      minSelect: addonGroups.minSelect,
      maxSelect: addonGroups.maxSelect,
      position: addonGroups.position,
    })
    .from(productAddonGroups)
    .innerJoin(addonGroups, eq(productAddonGroups.groupId, addonGroups.id))
    .where(inArray(productAddonGroups.productId, productIds))
    .orderBy(addonGroups.position);

  const groupIds = Array.from(new Set(productAddonGroupRows.map((g) => g.groupId)));

  let optionRows: {
    id: number;
    groupId: number;
    name: string;
    priceDelta: string;
    isAvailable: boolean;
    position: number;
  }[] = [];

  if (groupIds.length > 0) {
    optionRows = await db
      .select({
        id: addonOptions.id,
        groupId: addonOptions.groupId,
        name: addonOptions.name,
        priceDelta: addonOptions.priceDelta,
        isAvailable: addonOptions.isAvailable,
        position: addonOptions.position,
      })
      .from(addonOptions)
      .where(and(inArray(addonOptions.groupId, groupIds), eq(addonOptions.isAvailable, true)))
      .orderBy(addonOptions.position);
  }

  // 6. Build Nested Addons structure
  const optionsByGroup = new Map<number, any[]>();
  for (const opt of optionRows) {
    if (!optionsByGroup.has(opt.groupId)) optionsByGroup.set(opt.groupId, []);
    optionsByGroup.get(opt.groupId)!.push({
      id: opt.id,
      name: opt.name,
      priceDelta: parseFloat(opt.priceDelta),
      isAvailable: opt.isAvailable,
      position: opt.position,
      translations: {},
    });
  }

  const addonGroupsByProduct = new Map<number, AddonGroup[]>();
  for (const grp of productAddonGroupRows) {
    if (!addonGroupsByProduct.has(grp.productId)) addonGroupsByProduct.set(grp.productId, []);
    addonGroupsByProduct.get(grp.productId)!.push({
      id: grp.groupId,
      name: grp.groupName,
      selectionMode: grp.selectionMode,
      required: grp.required,
      minSelect: grp.minSelect,
      maxSelect: grp.maxSelect,
      position: grp.position,
      options: optionsByGroup.get(grp.groupId) || [],
      translations: {},
    });
  }

  // 7. Assemble Products
  const mappedProducts: Product[] = productRows.map((p) => ({
    id: p.id,
    companyId: p.companyId,
    categoryId: p.categoryId,
    name: p.name,
    description: p.description,
    price: parseFloat(p.price),
    taxRate: p.taxRate,
    ptuCode: p.ptuCode as any,
    imageUrl: p.imageUrl,
    isAvailable: p.isAvailable,
    isAgeRestricted: p.isAgeRestricted,
    prepTimeMinutes: p.prepTimeMinutes,
    barcode: p.barcode,
    productOrder: p.productOrder,
    addonGroups: addonGroupsByProduct.get(p.id) || [],
    translations: {},
  }));

  const response: MenuResponse = {
    brand: brandInfo,
    categories: categoryRows.map((c) => ({
      id: c.id,
      companyId: c.companyId,
      name: c.name,
      position: c.position,
      translations: {},
    })),
    products: mappedProducts,
  };

  // Cache in Redis
  if (redis && redis.status === 'ready') {
    redis.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL_SECONDS).catch(() => {});
  }

  return response;
}
