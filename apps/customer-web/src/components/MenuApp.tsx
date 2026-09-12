'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Product, MenuResponse, AddonOption } from '@rycos/shared';
import { fetchMenu, submitOrder } from '../lib/api';
import { ProductCard } from './ProductCard';
import { AddonModal } from './AddonModal';
import { CartDrawer } from './CartDrawer';
import { PaymentModal } from './PaymentModal';
import { CartItem, calculateSubtotal } from '../store/cartStore';
import { ShoppingBag, MapPin, Loader2, Globe, Bell } from 'lucide-react';
import { i18n, Language } from '../lib/i18n';
import { ServiceCallModal } from './ServiceCallModal';

interface MenuAppProps {
  initialBrandSlug?: string;
}

export function MenuApp({ initialBrandSlug }: MenuAppProps) {
  const searchParams = useSearchParams();
  const queryBrand = searchParams.get('brand');
  const brandSlug = initialBrandSlug || queryBrand || 'default';
  const tableLabel = searchParams.get('table') || undefined;
  const parkingSpot = searchParams.get('parking') || undefined;

  // Language state (pl, en, de)
  const [lang, setLang] = useState<Language>('pl');
  const t = i18n[lang];

  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cart State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [tipAmount, setTipAmount] = useState(0);
  const [customerNip, setCustomerNip] = useState<string | undefined>(undefined);

  // Modals
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isServiceCallOpen, setIsServiceCallOpen] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  // Fetch Menu on Load or when brand/lang changes
  useEffect(() => {
    fetchMenu(brandSlug, lang)
      .then((data) => {
        setMenu(data);
        if (data.categories.length > 0 && !activeCategory) {
          setActiveCategory(data.categories[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        // Fallback demo menu
        setMenu({
          brand: {
            id: 1,
            companyId: 1,
            name: '100k-RYCOS Burger & Pizza',
            slug: brandSlug,
            logoUrl: null,
            bannerUrl: null,
            currency: 'PLN',
            isAcceptingOrders: true,
            locationId: 1,
            locationName: 'Lokal Główny',
          },
          categories: [
            { id: 1, companyId: 1, name: lang === 'de' ? 'Craft Burger' : lang === 'en' ? 'Craft Burgers' : 'Burgery', position: 0, translations: {} },
            { id: 2, companyId: 1, name: lang === 'de' ? 'Steinofenpizza' : lang === 'en' ? 'Artisan Pizza' : 'Pizza', position: 1, translations: {} },
            { id: 3, companyId: 1, name: lang === 'de' ? 'Erfrischungsgetränke' : lang === 'en' ? 'Cold Drinks' : 'Napoje', position: 2, translations: {} },
          ],
          products: [
            {
              id: 1,
              companyId: 1,
              categoryId: 1,
              name: lang === 'de' ? 'Klassischer Smash Burger' : lang === 'en' ? 'Classic Smash Burger' : 'Classic Smash Burger',
              description: lang === 'de' ? '100% polnisches Rindfleisch, Cheddarkäse, Essiggurken, rote Zwiebeln.' : lang === 'en' ? '100% Polish beef, cheddar cheese, pickles, red onion.' : 'Podwójna wołowina 100%, ser cheddar, pikle, sos autorski.',
              price: 32.0,
              taxRate: 8,
              ptuCode: 'b',
              imageUrl: null,
              isAvailable: true,
              isAgeRestricted: false,
              prepTimeMinutes: 12,
              barcode: null,
              productOrder: 1,
              addonGroups: [],
              translations: {},
            },
          ],
        });
        if (!activeCategory) setActiveCategory(1);
        setLoading(false);
      });
  }, [brandSlug, lang]);

  const handleAddToCart = (product: Product, addons: AddonOption[] = [], instructions?: string) => {
    const itemUuid = `${product.id}-${addons.map((a) => a.id).sort().join('-')}-${instructions || ''}`;
    setCartItems((prev) => {
      const existing = prev.find((i) => i.id === itemUuid);
      if (existing) {
        return prev.map((i) => (i.id === itemUuid ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { id: itemUuid, product, quantity: 1, selectedAddons: addons, specialInstructions: instructions }];
    });
  };

  const handleUpdateQuantity = (id: string, qty: number) => {
    setCartItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: qty } : i)));
  };

  const handleRemoveItem = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleCheckout = async () => {
    if (!menu || cartItems.length === 0) return;

    try {
      const orderPayload = {
        brandId: menu.brand.id,
        orderType: parkingSpot ? ('parking' as const) : ('dine_in' as const),
        tableLabel: tableLabel || null,
        parkingSpot: parkingSpot || null,
        customerNip: customerNip || null,
        ageConsentAccepted: true,
        items: cartItems.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          unitPrice: item.product.price,
          taxRate: item.product.taxRate,
          ptuCode: item.product.ptuCode,
          addons: item.selectedAddons.map((a) => ({
            optionId: a.id,
            name: a.name,
            priceDelta: a.priceDelta,
          })),
          specialInstructions: item.specialInstructions,
        })),
        tipAmount,
        paymentMethod: 'blik' as const,
        currency: menu.brand.currency,
      };

      const placedOrder = await submitOrder(orderPayload);
      setPlacedOrderId(placedOrder.id);
      setIsCartOpen(false);
      setIsPaymentOpen(true);
    } catch (err: any) {
      alert(`Błąd składania zamówienia: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Loader2 size={36} className="animate-spin text-brand-500" />
        <span className="text-sm font-bold text-slate-600">Ładowanie menu...</span>
      </div>
    );
  }

  const subtotal = calculateSubtotal(cartItems);
  const totalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const filteredProducts = activeCategory
    ? menu?.products.filter((p) => p.categoryId === activeCategory) || []
    : menu?.products || [];

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-slate-50 flex flex-col">
      {/* Brand Banner */}
      {menu?.brand.bannerUrl && (
        <div className="w-full h-32 overflow-hidden bg-slate-900 shrink-0">
          <img
            src={menu.brand.bannerUrl}
            alt={menu.brand.name}
            crossOrigin="anonymous"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Brand Header */}
      <header className="bg-white px-5 pt-5 pb-4 border-b border-slate-100 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {menu?.brand.logoUrl && (
              <img
                src={menu.brand.logoUrl}
                alt={menu.brand.name}
                crossOrigin="anonymous"
                className="w-11 h-11 rounded-xl object-cover border border-slate-200 shadow-xs shrink-0"
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-xl text-slate-900 tracking-tight">
                  {menu?.brand.name}
                </h1>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <div className="flex items-center gap-1">
                <MapPin size={13} className="text-brand-500" />
                <span>
                  {tableLabel
                    ? `${t.table}: ${tableLabel}`
                    : parkingSpot
                    ? `${t.parking}: ${parkingSpot}`
                    : menu?.brand.locationName || 'Obsługa przy barze'}
                </span>
              </div>
              {(tableLabel || parkingSpot) && (
                <button
                  onClick={() => setIsServiceCallOpen(true)}
                  className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full transition-colors shadow-2xs"
                  title={t.callWaiter}
                >
                  <Bell size={11} className="animate-pulse text-amber-600" />
                  <span>{t.callWaiter}</span>
                </button>
              )}
            </div>
          </div>
        </div>

          {/* Language Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setLang('pl')}
              className={`px-2 py-1 rounded-lg transition-all ${
                lang === 'pl' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Polski"
            >
              PL
            </button>
            <button
              onClick={() => setLang('en')}
              className={`px-2 py-1 rounded-lg transition-all ${
                lang === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="English"
            >
              EN
            </button>
            <button
              onClick={() => setLang('de')}
              className={`px-2 py-1 rounded-lg transition-all ${
                lang === 'de' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Deutsch"
            >
              DE
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        {menu && menu.categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pt-4 no-scrollbar">
            {menu.categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  activeCategory === cat.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Products Feed */}
      <main className="p-4 flex-1 space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {lang === 'de' ? 'Keine Artikel in dieser Kategorie' : lang === 'en' ? 'No items in this category' : 'Brak dostępnych pozycji w tej kategorii'}
          </div>
        ) : (
          filteredProducts.map((prod) => (
            <ProductCard
              key={prod.id}
              product={prod}
              onSelect={(p) => setSelectedProduct(p)}
            />
          ))
        )}
      </main>

      {/* Floating Cart Button (Sticky Bottom) */}
      {totalCount > 0 && (
        <div className="fixed bottom-4 inset-x-4 max-w-lg mx-auto z-30">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full py-4 px-6 bg-slate-900 hover:bg-black active:scale-[0.98] transition-all text-white font-extrabold rounded-2xl shadow-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-500 text-white font-extrabold text-xs flex items-center justify-center">
                {totalCount}
              </div>
              <span className="text-sm">{t.cart}</span>
            </div>
            <span className="text-base font-extrabold">{subtotal.toFixed(2)} zł</span>
          </button>
        </div>
      )}

      {/* Addon Modal */}
      <AddonModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        tableLabel={tableLabel}
        parkingSpot={parkingSpot}
        tipAmount={tipAmount}
        customerNip={customerNip}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onSetTip={setTipAmount}
        onSetCustomerNip={setCustomerNip}
        onCheckout={handleCheckout}
      />

      {/* Payment Modal */}
      {placedOrderId && (
        <PaymentModal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          orderId={placedOrderId}
          totalAmount={subtotal + tipAmount}
        />
      )}

      {/* Service Call Modal */}
      <ServiceCallModal
        isOpen={isServiceCallOpen}
        onClose={() => setIsServiceCallOpen(false)}
        brandId={menu?.brand.id}
        tableLabel={tableLabel}
        parkingSpot={parkingSpot}
        lang={lang}
      />
    </div>
  );
}
