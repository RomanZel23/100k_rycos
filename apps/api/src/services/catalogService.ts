import { getDatabase, companies, companySettings, brands, categories, products, brandProducts, addonGroups, addonOptions, productAddonGroups, contentTranslations, locations, eq, inArray, and } from '@rycos/database';
import { BrandInfo, MenuResponse, Product, AddonGroup } from '@rycos/shared';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let redis: Redis | null = null;
try {
  redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  redis.on('error', (err) => {
    console.warn('[Catalog:Redis]', err.message);
  });
} catch {}

const CACHE_TTL_SECONDS = 300; // 5 minutes

function parseBrandColors(style: string | null | undefined): { buttonColor: string; buttonTextColor: string; backgroundColor: string } {
  let active = '#f97316';
  let bg = '#FFFFFF';
  if (style) {
    try {
      const parsed = typeof style === 'string' ? JSON.parse(style) : style;
      const s = Array.isArray(parsed) ? parsed[0] : parsed;
      const rawActive = s?.active_button_color;
      if (rawActive) {
        if (rawActive.startsWith('0x') || rawActive.startsWith('0X')) {
          active = '#' + rawActive.slice(rawActive.length === 10 ? 4 : 2);
        } else if (rawActive.startsWith('#')) {
          active = rawActive;
        }
      }
      const rawBg = s?.background_button_color;
      if (rawBg) {
        if (rawBg === 'black') bg = '#0F172A';
        else if (rawBg === 'white') bg = '#FFFFFF';
        else if (rawBg.startsWith('#')) bg = rawBg;
      }
    } catch {}
  }

  const clean = active.replace('#', '');
  let text = '#FFFFFF';
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    text = yiq >= 150 ? '#0F172A' : '#FFFFFF';
  }

  return { buttonColor: active, buttonTextColor: text, backgroundColor: bg };
}

const DEFAULT_TABLES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Bar', 'Ogródek 1', 'Ogródek 2'];

export async function getBrandBySlug(slug: string): Promise<BrandInfo | null> {
  const db = getDatabase();
  let rows = await db
    .select({
      id: brands.id,
      companyId: brands.companyId,
      name: brands.name,
      slug: brands.slug,
      logoUrl: brands.logoUrl,
      bannerUrl: brands.bannerUrl,
      footerUrl: brands.footerUrl,
      allowPayAtCounter: brands.allowPayAtCounter,
      isActive: brands.isActive,
      locationId: brands.locationId,
      locationName: locations.name,
      currency: brands.currency,
      style: brands.style,
      brandTables: brands.tables,
      locationTables: locations.tables,
    })
    .from(brands)
    .leftJoin(locations, eq(brands.locationId, locations.id))
    .where(and(eq(brands.slug, slug), eq(brands.isActive, true)))
    .limit(1);

  // If not found by exact slug (e.g. 'default', empty or unmatched), fallback to the first active brand
  if (rows.length === 0) {
    rows = await db
      .select({
        id: brands.id,
        companyId: brands.companyId,
        name: brands.name,
        slug: brands.slug,
        logoUrl: brands.logoUrl,
        bannerUrl: brands.bannerUrl,
        footerUrl: brands.footerUrl,
        allowPayAtCounter: brands.allowPayAtCounter,
        isActive: brands.isActive,
        locationId: brands.locationId,
        locationName: locations.name,
        currency: brands.currency,
        style: brands.style,
        brandTables: brands.tables,
        locationTables: locations.tables,
      })
      .from(brands)
      .leftJoin(locations, eq(brands.locationId, locations.id))
      .where(eq(brands.isActive, true))
      .orderBy(brands.id)
      .limit(1);
  }

  if (rows.length === 0) return null;
  const row = rows[0];
  const brandColors = parseBrandColors(row.style);

  let comp: any = null;
  let settingRows: any[] = [];
  try {
    const comps = await db
      .select({
        isAcceptingOrders: companies.isAcceptingOrders,
        termsAndConditions: companies.termsAndConditions,
        privacyPolicy: companies.privacyPolicy,
      })
      .from(companies)
      .where(eq(companies.id, row.companyId))
      .limit(1);
    comp = comps[0] || null;

    settingRows = await db
      .select({
        featureKey: companySettings.featureKey,
        isEnabled: companySettings.isEnabled,
      })
      .from(companySettings)
      .where(eq(companySettings.companyId, row.companyId));
  } catch (err) {
    console.warn('[Catalog] Error querying company settings:', err);
  }

  const settingsMap: Record<string, boolean> = {
    show_sharing: true,
    show_tnc: true,
    show_pp: true,
    show_receipt_qr: true,
  };
  for (const s of settingRows) {
    settingsMap[s.featureKey] = s.isEnabled;
  }

  const resolvedTables = (row.brandTables && Array.isArray(row.brandTables) && row.brandTables.length > 0)
    ? row.brandTables
    : (row.locationTables && Array.isArray(row.locationTables) && row.locationTables.length > 0)
      ? row.locationTables
      : DEFAULT_TABLES;

  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logoUrl,
    bannerUrl: row.bannerUrl,
    footerUrl: row.footerUrl,
    allowPayAtCounter: Boolean((row as any).allowPayAtCounter ?? (row as any).allow_pay_at_counter ?? false),
    currency: row.currency || 'PLN',
    isAcceptingOrders: comp ? comp.isAcceptingOrders : true,
    locationId: row.locationId,
    locationName: row.locationName,
    tables: resolvedTables,
    style: row.style,
    buttonColor: brandColors.buttonColor,
    buttonTextColor: brandColors.buttonTextColor,
    backgroundColor: brandColors.backgroundColor,
    termsAndConditions: comp?.termsAndConditions || null,
    privacyPolicy: comp?.privacyPolicy || null,
    settings: settingsMap,
  };
}

export async function getMenuByBrandId(brandId: number, companyId: number, lang: string = 'pl'): Promise<MenuResponse | null> {
  const normalizedLang = (lang || 'pl').toLowerCase();
  const cacheKey = `menu:brand:${brandId}:${normalizedLang}`;

  // 1. Try Redis Cache
  if (redis && redis.status === 'ready') {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}
  }

  const db = getDatabase();

const DICTIONARY_FALLBACKS: Record<string, Record<string, string>> = {
  en: {
    // Categories
    dania: 'Dishes',
    'dania główne': 'Main Dishes',
    kanapki: 'Sandwiches',
    burgery: 'Burgers',
    pizza: 'Pizza',
    napoje: 'Drinks',
    desery: 'Desserts',
    przekąski: 'Snacks',
    dodatki: 'Addons',
    sałatki: 'Salads',
    zupy: 'Soups',
    alkohole: 'Alcohol',
    piwo: 'Beers',
    kawa: 'Coffee',
    herbata: 'Tea',

    // Addons
    'wybierz sos': 'Choose sauce',
    'sos czosnkowy': 'Garlic sauce',
    'ostry sos chipotle': 'Spicy chipotle sauce',
    'dodatki do burgera': 'Burger toppings',
    'chrupiący bekon': 'Crispy bacon',
    'podwójny cheddar': 'Double cheddar',
    'dodatkowy ser': 'Extra cheese',
    'sos pomidorowy': 'Tomato sauce',
    'sos bbq': 'BBQ sauce',

    // Dishes & Products
    'chrupiący kurczak': 'Crispy Chicken',
    'chrupiący kurczak w złocistej panierce, majonez truflowy, rukola, parmezan, limonka.':
      'Crispy chicken strips in golden coating, truffle mayonnaise, fresh arugula, parmesan, lime.',
    cheesbuger: 'Cheeseburger',
    cheeseburger: 'Cheeseburger',
    'super hotdog': 'Super Hot Dog',
    'hotdog z bekonem i serem oraz awokado i japaleno':
      'Hot dog with smoked bacon, melted cheese, avocado and jalapeno.',
    hotdog: 'Hot Dog',
    sandwich: 'Sandwich',
    'rzemieślnicza lemoniada': 'Artisan Lemonade',
    'cytryna, świeża mięta, odrobina agawy.': 'Lemon, fresh mint, a touch of agave.',
    'warka jasne pełne': 'Warka Jasne Full',
    'warka jasne pełne to klasycznie warzone i leżakowane piwo, które swój smak i aromat zawdzięcza użyciu mrożonych szyszek chmielu':
      'Warka Jasne Full is a classically brewed and lagered beer that owes its taste and aroma to the use of frozen hop cones.',
  },
  de: {
    // Categories
    dania: 'Gerichte',
    'dania główne': 'Hauptgerichte',
    kanapki: 'Sandwiches',
    burgery: 'Burger',
    pizza: 'Pizza',
    napoje: 'Getränke',
    desery: 'Desserts',
    przekąski: 'Snacks',
    dodatki: 'Extras',
    sałatki: 'Salate',
    zupy: 'Suppen',
    alkohole: 'Alkohol',
    piwo: 'Bier',
    kawa: 'Kaffee',
    herbata: 'Tee',

    // Addons
    'wybierz sos': 'Sauce wählen',
    'sos czosnkowy': 'Knoblauchsauce',
    'ostry sos chipotle': 'Scharfe Chipotle-Sauce',
    'dodatki do burgera': 'Burger-Extras',
    'chrupiący bekon': 'Knuspriger Speck',
    'podwójny cheddar': 'Doppelter Cheddar',
    'dodatkowy ser': 'Zusätzlicher Käse',
    'sos pomidorowy': 'Tomatensauce',
    'sos bbq': 'BBQ-Sauce',

    // Dishes & Products
    'chrupiący kurczak': 'Knuspriges Hähnchen',
    'chrupiący kurczak w złocistej panierce, majonez truflowy, rukola, parmezan, limonka.':
      'Knusprige Hähnchenstreifen in goldener Panade, Trüffel-Mayonnaise, Rucola, Parmesan, Limette.',
    cheesbuger: 'Cheeseburger',
    cheeseburger: 'Cheeseburger',
    'super hotdog': 'Super Hotdog',
    'hotdog z bekonem i serem oraz awokado i japaleno':
      'Hotdog mit geräuchertem Speck, geschmolzenem Käse, Avocado und Jalapeno.',
    hotdog: 'Hotdog',
    sandwich: 'Sandwich',
    'rzemieślnicza lemoniada': 'Hausgemachte Limonade',
    'cytryna, świeża mięta, odrobina agawy.': 'Frische Zitrone, Minze, ein Hauch von Agavendicksaft.',
    'warka jasne pełne': 'Warka Jasne Vollbier',
    'warka jasne pełne to klasycznie warzone i leżakowane piwo, które swój smak i aromat zawdzięcza użyciu mrożonych szyszek chmielu':
      'Warka Jasne Vollbier ist ein traditionell gebrautes und gelagertes Bier, das seinen Geschmack gefrorenen Hopfenzapfen verdankt.',
  },
};

function getTranslated(
  entityType: string,
  entityId: number,
  attr: string,
  raw: string | null | undefined,
  lang: string,
  translationsMap: Map<string, string>
): string {
  if (!raw) return '';
  if (lang === 'pl') return raw;

  const dbVal = translationsMap.get(`${entityType}:${entityId}:${attr}`);
  if (dbVal) return dbVal;

  const key = raw.toLowerCase().trim();
  const fallback = DICTIONARY_FALLBACKS[lang]?.[key];
  if (fallback) return fallback;

  return raw;
}

  // Load translations if non-Polish
  const translationsMap = new Map<string, string>();
  if (normalizedLang !== 'pl') {
    try {
      const translationRows = await db
        .select()
        .from(contentTranslations)
        .where(eq(contentTranslations.language, normalizedLang));

      for (const t of translationRows) {
        translationsMap.set(`${t.entityType}:${t.entityId}:${t.attributeName}`, t.value);
      }
    } catch (err: any) {
      console.warn('[Translations] Error querying translations:', err.message);
    }
  }

  // 2. Fetch Brand Info
  const brandRows = await db
    .select()
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  if (brandRows.length === 0) return null;
  const b = brandRows[0];

  let comp: any = null;
  let settingRows: any[] = [];
  try {
    const comps = await db
      .select({
        isAcceptingOrders: companies.isAcceptingOrders,
        termsAndConditions: companies.termsAndConditions,
        privacyPolicy: companies.privacyPolicy,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    comp = comps[0] || null;

    settingRows = await db
      .select({
        featureKey: companySettings.featureKey,
        isEnabled: companySettings.isEnabled,
      })
      .from(companySettings)
      .where(eq(companySettings.companyId, companyId));
  } catch (err) {
    console.warn('[Catalog] Error querying company settings in getMenuByBrandId:', err);
  }

  const settingsMap: Record<string, boolean> = {
    show_sharing: true,
    show_tnc: true,
    show_pp: true,
    show_receipt_qr: true,
  };
  for (const s of settingRows) {
    settingsMap[s.featureKey] = s.isEnabled;
  }

  const brandColors = parseBrandColors(b.style);

  let locationRow: any = null;
  if (b.locationId) {
    try {
      const locs = await db.select().from(locations).where(eq(locations.id, b.locationId)).limit(1);
      locationRow = locs[0] || null;
    } catch (e) {
      console.warn('[Catalog] Error querying location in getMenuByBrandId:', e);
    }
  }

  const resolvedTables = (b.tables && Array.isArray(b.tables) && b.tables.length > 0)
    ? b.tables
    : (locationRow?.tables && Array.isArray(locationRow.tables) && locationRow.tables.length > 0)
      ? locationRow.tables
      : DEFAULT_TABLES;

  const brandInfo: BrandInfo = {
    id: b.id,
    companyId: b.companyId,
    name: b.name,
    slug: b.slug,
    logoUrl: b.logoUrl,
    bannerUrl: b.bannerUrl,
    footerUrl: (b as any).footerUrl ?? null,
    allowPayAtCounter: Boolean((b as any).allowPayAtCounter ?? (b as any).allow_pay_at_counter ?? false),
    currency: (b as any).currency || 'PLN',
    isAcceptingOrders: comp ? comp.isAcceptingOrders : b.isActive,
    locationId: b.locationId,
    locationName: locationRow?.name || null,
    tables: resolvedTables,
    style: b.style ?? null,
    buttonColor: brandColors.buttonColor,
    buttonTextColor: brandColors.buttonTextColor,
    backgroundColor: brandColors.backgroundColor,
    termsAndConditions: comp?.termsAndConditions || null,
    privacyPolicy: comp?.privacyPolicy || null,
    settings: settingsMap,
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

  // Return only products explicitly assigned to this brand (empty if none assigned)
  const productRows = productIds.length > 0
    ? await db
        .select()
        .from(products)
        .where(and(eq(products.companyId, companyId), inArray(products.id, productIds), eq(products.isAvailable, true)))
        .orderBy(products.productOrder)
    : [];

  if (productRows.length === 0) {
    const emptyResponse: MenuResponse = {
      brand: brandInfo,
      categories: [],
      products: [],
    };
    return emptyResponse;
  }

  const effectiveProductIds = productRows.map((p) => p.id);

  // 5. Fetch Addon Groups & Options for these products
  const productAddonGroupRows = effectiveProductIds.length > 0
    ? await db
        .select({
          productId: productAddonGroups.productId,
          groupId: addonGroups.id,
          groupName: addonGroups.name,
          selectionMode: addonGroups.selectionMode,
          required: addonGroups.required,
          minSelect: addonGroups.minSelect,
          maxSelect: addonGroups.maxSelect,
          position: addonGroups.position,
        })
        .from(productAddonGroups)
        .innerJoin(addonGroups, eq(productAddonGroups.groupId, addonGroups.id))
        .where(inArray(productAddonGroups.productId, effectiveProductIds))
        .orderBy(addonGroups.position)
    : [];

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
    const translatedOptName = getTranslated('addon_options', opt.id, 'name', opt.name, normalizedLang, translationsMap);
    optionsByGroup.get(opt.groupId)!.push({
      id: opt.id,
      name: translatedOptName,
      priceDelta: parseFloat(opt.priceDelta),
      isAvailable: opt.isAvailable,
      position: opt.position,
      translations: {},
    });
  }

  const addonGroupsByProduct = new Map<number, AddonGroup[]>();
  for (const grp of productAddonGroupRows) {
    if (!addonGroupsByProduct.has(grp.productId)) addonGroupsByProduct.set(grp.productId, []);
    const translatedGrpName = getTranslated('addon_groups', grp.groupId, 'name', grp.groupName, normalizedLang, translationsMap);
    addonGroupsByProduct.get(grp.productId)!.push({
      id: grp.groupId,
      name: translatedGrpName,
      selectionMode: grp.selectionMode as 'single' | 'multiple',
      required: grp.required,
      minSelect: grp.minSelect,
      maxSelect: grp.maxSelect,
      position: grp.position,
      options: optionsByGroup.get(grp.groupId) || [],
      translations: {},
    });
  }

  // 7. Assemble Products
  const mappedProducts: Product[] = productRows.map((p) => {
    const translatedName = getTranslated('products', p.id, 'name', p.name, normalizedLang, translationsMap);
    const translatedDesc = getTranslated('products', p.id, 'description', p.description, normalizedLang, translationsMap);
    return {
      id: p.id,
      companyId: p.companyId,
      categoryId: p.categoryId,
      name: translatedName,
      description: translatedDesc,
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
    };
  });

  // Only include categories that actually contain products in this brand's menu
  const activeCategoryIds = new Set(mappedProducts.map((p) => p.categoryId).filter((id): id is number => typeof id === 'number'));
  const effectiveCategories = categoryRows.filter((c) => activeCategoryIds.has(c.id));

  const response: MenuResponse = {
    brand: brandInfo,
    categories: effectiveCategories.map((c) => ({
      id: c.id,
      companyId: c.companyId,
      name: getTranslated('categories', c.id, 'name', c.name, normalizedLang, translationsMap),
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

export async function invalidateBrandMenuCache(brandId?: number): Promise<void> {
  if (!redis || redis.status !== 'ready') return;
  try {
    const pattern = brandId ? `menu:brand:${brandId}:*` : `menu:brand:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err: any) {
    console.warn('[Catalog:Redis] Failed to invalidate cache:', err.message);
  }
}
