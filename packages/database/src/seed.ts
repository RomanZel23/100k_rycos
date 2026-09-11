import { getDatabase, companies, locations, brands, categories, products, addonGroups, addonOptions, productAddonGroups, brandProducts, fiscalDevices, closeDatabase } from './index.js';

export async function seedDatabase(shouldClose = false) {
  console.log('🌱 Starting database seed for 100k_rycos...');
  const db = getDatabase();

  // 1. Create Company
  const [company] = await db
    .insert(companies)
    .values({
      name: 'Yalla Food Group',
      slug: 'yalla-food-group',
      email: 'kontakt@yallaorder.ai',
      country: 'PL',
      currency: 'PLN',
      isAcceptingOrders: true,
    })
    .returning();
  console.log(`✓ Created Company: ${company.name} (ID: ${company.id})`);

  // 2. Create Location
  const [location] = await db
    .insert(locations)
    .values({
      companyId: company.id,
      name: 'Restauracja Centrum',
      address: 'ul. Marszałkowska 10, Warszawa',
      isActive: true,
    })
    .returning();
  console.log(`✓ Created Location: ${location.name}`);

  // 3. Create Brand
  const [brand] = await db
    .insert(brands)
    .values({
      companyId: company.id,
      locationId: location.id,
      name: 'Yalla Burger & Pizza',
      slug: 'yalla-burger',
      isActive: true,
    })
    .returning();
  console.log(`✓ Created Brand: ${brand.name} (Slug: ${brand.slug})`);

  // 4. Create Fiscal Device
  await db.insert(fiscalDevices).values({
    companyId: company.id,
    deviceId: 'SBT-NMLL2M',
    name: 'Główna Drukarka Fiskalna (RYCOS)',
    source: 'manual',
    kind: 'device',
    isPrimary: true,
    isOnline: true,
  });
  console.log(`✓ Created Fiscal Device: SBT-NMLL2M`);

  // 5. Create Categories
  const [catBurgers] = await db
    .insert(categories)
    .values({ companyId: company.id, name: 'Burgery', position: 1 })
    .returning();

  const [catPizza] = await db
    .insert(categories)
    .values({ companyId: company.id, name: 'Pizza', position: 2 })
    .returning();

  const [catDrinks] = await db
    .insert(categories)
    .values({ companyId: company.id, name: 'Napoje', position: 3 })
    .returning();

  // 6. Create Addon Groups & Options
  const [groupSauce] = await db
    .insert(addonGroups)
    .values({
      companyId: company.id,
      name: 'Wybierz sos',
      selectionMode: 'single',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      position: 1,
    })
    .returning();

  const [optGarlic] = await db
    .insert(addonOptions)
    .values({ groupId: groupSauce.id, name: 'Sos czosnkowy', priceDelta: '0.00', position: 1 })
    .returning();

  const [optSpicy] = await db
    .insert(addonOptions)
    .values({ groupId: groupSauce.id, name: 'Ostry sos chipotle', priceDelta: '0.00', position: 2 })
    .returning();

  const [groupExtras] = await db
    .insert(addonGroups)
    .values({
      companyId: company.id,
      name: 'Dodatki do burgera',
      selectionMode: 'multiple',
      required: false,
      minSelect: 0,
      maxSelect: 3,
      position: 2,
    })
    .returning();

  const [optBacon] = await db
    .insert(addonOptions)
    .values({ groupId: groupExtras.id, name: 'Chrupiący bekon', priceDelta: '4.50', position: 1 })
    .returning();

  const [optCheddar] = await db
    .insert(addonOptions)
    .values({ groupId: groupExtras.id, name: 'Podwójny cheddar', priceDelta: '3.50', position: 2 })
    .returning();

  // 7. Create Products
  const [p1] = await db
    .insert(products)
    .values({
      companyId: company.id,
      categoryId: catBurgers.id,
      name: 'Classic Smash Burger',
      description: 'Podwójna wołowina 100%, ser cheddar, pikle, sos autorski, maślana bułka brioche.',
      price: '32.00',
      taxRate: 8,
      ptuCode: 'b',
      isAvailable: true,
      productOrder: 1,
    })
    .returning();

  const [p2] = await db
    .insert(products)
    .values({
      companyId: company.id,
      categoryId: catBurgers.id,
      name: 'Crispy Truffle Burger',
      description: 'Chrupiący kurczak w złocistej panierce, majonez truflowy, rukola, parmezan.',
      price: '34.50',
      taxRate: 8,
      ptuCode: 'b',
      isAvailable: true,
      productOrder: 2,
    })
    .returning();

  const [p3] = await db
    .insert(products)
    .values({
      companyId: company.id,
      categoryId: catPizza.id,
      name: 'Pizza Margherita DOC',
      description: 'Sos z pomidorów San Marzano, mozzarella fior di latte, świeża bazylia, oliwa.',
      price: '29.00',
      taxRate: 8,
      ptuCode: 'b',
      isAvailable: true,
      productOrder: 1,
    })
    .returning();

  const [p4] = await db
    .insert(products)
    .values({
      companyId: company.id,
      categoryId: catDrinks.id,
      name: 'Rzemieślnicza Lemoniada',
      description: 'Cytryna, świeża mięta, odrobina agawy.',
      price: '14.00',
      taxRate: 23,
      ptuCode: 'a',
      isAvailable: true,
      productOrder: 1,
    })
    .returning();

  // Assign Addons to Products
  await db.insert(productAddonGroups).values([
    { productId: p1.id, groupId: groupSauce.id, position: 1 },
    { productId: p1.id, groupId: groupExtras.id, position: 2 },
    { productId: p2.id, groupId: groupSauce.id, position: 1 },
  ]);

  // Assign Products to Brand
  await db.insert(brandProducts).values([
    { brandId: brand.id, productId: p1.id },
    { brandId: brand.id, productId: p2.id },
    { brandId: brand.id, productId: p3.id },
    { brandId: brand.id, productId: p4.id },
  ]);

  console.log('🎉 Seed completed successfully!');
  if (shouldClose) {
    await closeDatabase();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase(true).catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
