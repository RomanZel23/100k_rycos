'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Product, MenuResponse, AddonOption } from '@rycos/shared';
import { fetchMenu, submitOrder } from '../lib/api';
import { ProductCard } from './ProductCard';
import { AddonModal } from './AddonModal';
import { CartDrawer } from './CartDrawer';
import { PaymentModal } from './PaymentModal';
import { CartItem, calculateSubtotal } from '../store/cartStore';
import { ShoppingBag, MapPin, Loader2, Globe, Bell, Clock, Share2 } from 'lucide-react';
import { i18n, Language, getStoredLanguage, saveStoredLanguage } from '../lib/i18n';
import { ServiceCallModal } from './ServiceCallModal';
import { OrderHistoryModal } from './OrderHistoryModal';
import { ShareModal } from './ShareModal';
import { PolicyModal } from './PolicyModal';
import { getStoredOrders, saveStoredOrder, StoredOrder } from '../store/orderStorage';

interface MenuAppProps {
  initialBrandSlug?: string;
}

export function MenuApp({ initialBrandSlug }: MenuAppProps) {
  const searchParams = useSearchParams();
  const queryBrand = searchParams.get('brand');
  const brandSlug = initialBrandSlug || queryBrand || 'default';
  const tableLabel = searchParams.get('table') || undefined;
  const parkingSpot = searchParams.get('parking') || undefined;

  // Language state (pl, en, de) with localStorage persistence
  const [lang, setLang] = useState<Language>('pl');
  useEffect(() => {
    setLang(getStoredLanguage());
  }, []);

  const handleSelectLanguage = (newLang: Language) => {
    setLang(newLang);
    saveStoredLanguage(newLang);
  };

  const t = i18n[lang] || i18n.pl;

  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cart State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [tipAmount, setTipAmount] = useState(0);
  const [customerNip, setCustomerNip] = useState<string | undefined>(undefined);
  const [ageConsentAccepted, setAgeConsentAccepted] = useState(false);

  // Modals
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isServiceCallOpen, setIsServiceCallOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [hasActiveOrders, setHasActiveOrders] = useState(false);
  const [activeBannerOrder, setActiveBannerOrder] = useState<StoredOrder | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isTncOpen, setIsTncOpen] = useState(false);
  const [isPpOpen, setIsPpOpen] = useState(false);

  // Monitor stored orders for active status badge & banner
  useEffect(() => {
    const checkActiveOrders = () => {
      const stored = getStoredOrders();
      const active = stored.find((o) =>
        ['in_progress', 'ready_to_collect', 'paid'].includes(o.status)
      );
      setHasActiveOrders(!!active);
      setActiveBannerOrder(active || null);
    };

    checkActiveOrders();
    window.addEventListener('rycos_order_history_updated', checkActiveOrders);
    return () => window.removeEventListener('rycos_order_history_updated', checkActiveOrders);
  }, []);

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
            footerUrl: null,
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

  // Apply Brand Theme Colors
  useEffect(() => {
    if (!menu?.brand) return;

    let buttonColor = (menu.brand as any).buttonColor;
    let buttonTextColor = (menu.brand as any).buttonTextColor;

    // Fallback if buttonColor is not directly present (e.g. older response or style string)
    if (!buttonColor && menu.brand.style) {
      try {
        const parsed = typeof menu.brand.style === 'string' ? JSON.parse(menu.brand.style) : menu.brand.style;
        const s = Array.isArray(parsed) ? parsed[0] : parsed;
        const raw = s?.active_button_color;
        if (raw) {
          if (raw.startsWith('0x') || raw.startsWith('0X')) {
            const hex = raw.slice(2);
            buttonColor = hex.length === 8 ? `#${hex.slice(2)}` : `#${hex}`;
          } else if (raw.startsWith('#')) {
            buttonColor = raw;
          }
        }
      } catch {}
    }

    const brandColor = buttonColor || '#f97316';

    // Compute contrast text if buttonTextColor not set
    let brandTextColor = buttonTextColor;
    if (!brandTextColor) {
      const hex = brandColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      const yiq = (r * 299 + g * 587 + b * 114) / 1000;
      brandTextColor = yiq >= 140 ? '#0F172A' : '#FFFFFF';
    }

    document.documentElement.style.setProperty('--brand-color', brandColor);
    document.documentElement.style.setProperty('--brand-text', brandTextColor);

    return () => {
      document.documentElement.style.removeProperty('--brand-color');
      document.documentElement.style.removeProperty('--brand-text');
    };
  }, [menu?.brand]);

  const handleUpdateQuantity = (id: string, qty: number) => {
    setCartItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: qty } : i)));
  };

  const handleRemoveItem = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleCheckout = async () => {
    if (!menu || cartItems.length === 0) return;

    const hasAgeRestricted = cartItems.some((i) => i.product.isAgeRestricted);
    if (hasAgeRestricted && !ageConsentAccepted) {
      setIsCartOpen(true);
      return;
    }

    try {
      const orderPayload = {
        brandId: menu.brand.id,
        orderType: parkingSpot ? ('parking' as const) : ('dine_in' as const),
        tableLabel: tableLabel || null,
        parkingSpot: parkingSpot || null,
        customerNip: customerNip || null,
        ageConsentAccepted: hasAgeRestricted ? ageConsentAccepted : true,
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

      // Save order to customer local history
      saveStoredOrder({
        id: placedOrder.id,
        brandId: menu.brand.id,
        brandName: menu.brand.name,
        orderNumber: String(placedOrder.orderNumber ? `#${placedOrder.orderNumber}` : `#${placedOrder.id.slice(0, 6)}`),
        orderDate: new Date().toISOString(),
        status: placedOrder.status || 'pending_payment',
        totalAmount: placedOrder.totalAmount,
        currency: placedOrder.currency || menu.brand.currency || 'PLN',
        itemsSummary: cartItems.map((i) => `${i.quantity}x ${i.product.name}`).join(', '),
        itemsCount: cartItems.reduce((sum, i) => sum + i.quantity, 0),
        collectionPin: placedOrder.collectionPin,
        tableLabel: tableLabel || null,
        parkingSpot: parkingSpot || null,
      });

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
    <div className="w-full max-w-lg mx-auto min-h-screen bg-slate-50 flex flex-col overflow-x-hidden">
      {/* Brand Hero Banner */}
      {menu?.brand.bannerUrl && (
        <div className="relative w-full h-44 sm:h-56 bg-white overflow-hidden shrink-0 flex items-center justify-center pb-8 sm:pb-10 pt-3 px-3 sm:px-4 border-b border-slate-100">
          {/* Main banner image: clean object-contain without ghost blur, padded from bottom so card does not clip text */}
          <img
            src={menu.brand.bannerUrl}
            alt={menu.brand.name}
            crossOrigin="anonymous"
            className="w-full h-full object-contain object-center"
          />
        </div>
      )}

      {/* Brand Info Card */}
      <div
        className={`${
          menu?.brand.bannerUrl
            ? 'relative z-20 -mt-7 sm:-mt-9 mx-2.5 sm:mx-4 rounded-2xl sm:rounded-3xl bg-white p-3 sm:p-5 shadow-lg shadow-slate-200/50 border border-slate-100'
            : 'bg-white px-3 sm:px-5 pt-3.5 sm:pt-5 pb-3 sm:pb-4 border-b border-slate-100 shadow-2xs'
        }`}
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {menu?.brand.logoUrl ? (
              <div
                className={`${
                  menu?.brand.bannerUrl
                    ? 'w-14 h-14 sm:w-20 sm:h-20 -mt-10 sm:-mt-14 rounded-xl sm:rounded-2xl border-2 sm:border-4 border-white shadow-md bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden'
                    : 'w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden'
                }`}
              >
                <img
                  src={menu.brand.logoUrl}
                  alt={menu.brand.name}
                  crossOrigin="anonymous"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : menu?.brand.bannerUrl ? (
              <div className="w-14 h-14 sm:w-16 sm:h-16 -mt-10 sm:-mt-12 rounded-xl sm:rounded-2xl border-2 sm:border-4 border-white shadow-md bg-slate-900 text-white font-black text-base sm:text-xl flex items-center justify-center shrink-0">
                {menu?.brand.name?.charAt(0) || '🍽️'}
              </div>
            ) : null}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="font-extrabold text-base sm:text-2xl text-slate-900 tracking-tight truncate">
                  {menu?.brand.name}
                </h1>
                <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Otwarte" />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 sm:mt-1">
                <div className="flex items-center gap-1 min-w-0">
                  <MapPin size={12} className="text-brand-500 shrink-0" />
                  <span className="truncate">
                    {tableLabel
                      ? `${t.table}: ${tableLabel}`
                      : parkingSpot
                      ? `${t.parking}: ${parkingSpot}`
                      : menu?.brand.locationName || 'Obsługa przy barze'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right actions: Share, History Button & Language Switcher */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {menu?.brand.settings?.show_sharing !== false && (
              <button
                onClick={() => setIsShareOpen(true)}
                className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-slate-900 transition-all flex items-center justify-center active:scale-95 shadow-2xs"
                title={lang === 'de' ? 'Menü teilen' : lang === 'en' ? 'Share menu' : 'Udostępnij menu'}
              >
                <Share2 size={14} className="sm:w-4 sm:h-4" />
              </button>
            )}

            <button
              onClick={() => setIsHistoryOpen(true)}
              className="relative p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-slate-900 transition-all flex items-center justify-center active:scale-95 shadow-2xs"
              title={t.orderHistory}
            >
              <Clock size={14} className="sm:w-4 sm:h-4" />
              {hasActiveOrders && (
                <span className="absolute -top-1 -right-1 w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
              )}
            </button>

            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 sm:p-1 rounded-xl border border-slate-200 text-[10px] sm:text-xs font-bold shrink-0">
              <button
                onClick={() => handleSelectLanguage('pl')}
                className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg transition-all ${
                  lang === 'pl' ? 'bg-white text-slate-900 shadow-xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Polski"
              >
                PL
              </button>
              <button
                onClick={() => handleSelectLanguage('en')}
                className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg transition-all ${
                  lang === 'en' ? 'bg-white text-slate-900 shadow-xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="English"
              >
                EN
              </button>
              <button
                onClick={() => handleSelectLanguage('de')}
                className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg transition-all ${
                  lang === 'de' ? 'bg-white text-slate-900 shadow-xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Deutsch"
              >
                DE
              </button>
            </div>
          </div>
        </div>

        {/* Service Call / Status row */}
        {(tableLabel || parkingSpot) && (
          <div className="mt-2.5 sm:mt-3 pt-2.5 sm:pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] sm:text-xs text-slate-400 font-medium">Potrzebujesz pomocy obsługi?</span>
            <button
              onClick={() => setIsServiceCallOpen(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 sm:px-3 py-1 rounded-full transition-colors shadow-2xs"
              title={t.callWaiter}
            >
              <Bell size={12} className="animate-pulse text-amber-600" />
              <span>{t.callWaiter}</span>
            </button>
          </div>
        )}
      </div>

      {/* Active Order Live Banner */}
      {activeBannerOrder && (
        <div className="mx-3 sm:mx-4 mt-2.5 p-3 rounded-2xl bg-slate-900 text-white shadow-md flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div className="text-xs truncate">
              <span className="font-extrabold">{activeBannerOrder.orderNumber}: </span>
              <span className="text-slate-300">
                {activeBannerOrder.status === 'ready_to_collect'
                  ? `${t.orderStatusReady} PIN: ${activeBannerOrder.collectionPin || ''}`
                  : activeBannerOrder.status === 'paid'
                  ? `${t.orderStatusPaid} · ${t.orderStatusPaidSub}`
                  : t.orderStatusInProgress}
              </span>
            </div>
          </div>
          <Link
            href={`/order/${activeBannerOrder.id}`}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-brand-text text-xs font-black transition-all active:scale-95 shadow-xs"
          >
            {lang === 'de' ? 'Details' : lang === 'en' ? 'Track' : 'Śledź'} &rarr;
          </Link>
        </div>
      )}

      {/* Sticky Category Tabs Navigation */}
      {menu && menu.categories.length > 0 && (
        <nav className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md px-4 py-2.5 border-b border-slate-200/70 shadow-2xs mt-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5">
            {menu.categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  activeCategory === cat.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60 shadow-2xs'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </nav>
      )}

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

        {/* Brand Footer Graphic / Sponsor Banner */}
        {menu?.brand.footerUrl && (
          <div className="mt-8 mb-4">
            <div className="w-full rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-2xs p-3 flex items-center justify-center">
              <img
                src={menu.brand.footerUrl}
                alt={`${menu.brand.name} stopka`}
                crossOrigin="anonymous"
                className="w-full h-auto max-h-48 object-contain"
              />
            </div>
          </div>
        )}

        {/* Footer Brand Credit & Policy Links */}
        <footer className="text-center pt-8 pb-16 text-xs text-slate-400 space-y-2">
          {((menu?.brand.settings?.show_tnc !== false && !!menu?.brand.termsAndConditions) ||
            (menu?.brand.settings?.show_pp !== false && !!menu?.brand.privacyPolicy)) && (
            <div className="flex items-center justify-center gap-3 text-[11px] font-semibold text-slate-500">
              {menu?.brand.settings?.show_tnc !== false && !!menu?.brand.termsAndConditions && (
                <button
                  type="button"
                  onClick={() => setIsTncOpen(true)}
                  className="hover:text-slate-900 underline underline-offset-4 decoration-slate-300 transition-colors"
                >
                  {lang === 'de' ? 'AGB' : lang === 'en' ? 'Terms & conditions' : 'Regulamin'}
                </button>
              )}
              {menu?.brand.settings?.show_tnc !== false &&
                !!menu?.brand.termsAndConditions &&
                menu?.brand.settings?.show_pp !== false &&
                !!menu?.brand.privacyPolicy && <span className="text-slate-300">•</span>}
              {menu?.brand.settings?.show_pp !== false && !!menu?.brand.privacyPolicy && (
                <button
                  type="button"
                  onClick={() => setIsPpOpen(true)}
                  className="hover:text-slate-900 underline underline-offset-4 decoration-slate-300 transition-colors"
                >
                  {lang === 'de' ? 'Datenschutz' : lang === 'en' ? 'Privacy policy' : 'Polityka prywatności'}
                </button>
              )}
            </div>
          )}
          <p className="font-semibold text-slate-500">100k-RYCOS Ordering</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Szybkie i bezpieczne zamawianie przy stoliku i barze</p>
        </footer>
      </main>

      {/* Floating Cart Button (Sticky Bottom) */}
      {totalCount > 0 && (
        <div className="fixed bottom-4 inset-x-4 max-w-lg mx-auto z-30">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full py-4 px-6 bg-slate-900 hover:bg-black active:scale-[0.98] transition-all text-white font-extrabold rounded-2xl shadow-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-500 text-brand-text font-extrabold text-xs flex items-center justify-center">
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
        lang={lang}
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
        ageConsentAccepted={ageConsentAccepted}
        lang={lang}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onSetTip={setTipAmount}
        onSetCustomerNip={setCustomerNip}
        onSetAgeConsentAccepted={setAgeConsentAccepted}
        onCheckout={handleCheckout}
      />

      {/* Payment Modal */}
      {placedOrderId && (
        <PaymentModal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          orderId={placedOrderId}
          totalAmount={subtotal + tipAmount}
          lang={lang}
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

      {/* Order History Modal */}
      <OrderHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        lang={lang}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        brandName={menu?.brand.name}
        lang={lang}
      />

      {/* Terms & Conditions Modal */}
      <PolicyModal
        isOpen={isTncOpen}
        onClose={() => setIsTncOpen(false)}
        type="terms"
        content={menu?.brand.termsAndConditions || ''}
        lang={lang}
      />

      {/* Privacy Policy Modal */}
      <PolicyModal
        isOpen={isPpOpen}
        onClose={() => setIsPpOpen(false)}
        type="privacy"
        content={menu?.brand.privacyPolicy || ''}
        lang={lang}
      />
    </div>
  );
}
