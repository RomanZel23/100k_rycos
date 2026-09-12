'use client';

import React, { useEffect, useState } from 'react';
import { 
  Utensils, 
  Search, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Banknote, 
  Send, 
  Printer, 
  CheckCircle2, 
  Clock, 
  X, 
  Receipt,
  RotateCcw,
  Camera,
  KeyRound
} from 'lucide-react';
import { Product, MenuResponse, AddonOption } from '@rycos/shared';
import { fetchMenu, submitOrder, getApiBaseUrl } from '../../lib/api';
import { PinVerificationModal } from '../../components/PinVerificationModal';

interface PosCartItem {
  id: string; // unique key
  product: Product;
  quantity: number;
  selectedAddons: AddonOption[];
  specialInstructions?: string;
}

const QUICK_TABLES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Bar', 'Ogródek 1', 'Ogródek 2'];

export default function PosPage() {
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Cart & Order State
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('1');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [customerNip, setCustomerNip] = useState('');
  const [showNip, setShowNip] = useState(false);
  const [customerNote, setCustomerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Addon Modal for POS
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<AddonOption[]>([]);
  const [modalInstructions, setModalInstructions] = useState('');

  // Confirmation / Success Overlay
  const [lastOrderSuccess, setLastOrderSuccess] = useState<{
    orderNumber: number;
    pin: string;
    action: string;
    total: number;
  } | null>(null);

  // Verification modal state
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Time display
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load Menu
  useEffect(() => {
    fetchMenu('default', 'pl')
      .then((data) => {
        setMenu(data);
        if (data.categories.length > 0) {
          setActiveCategory(data.categories[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Failed to load menu, fallback to demo', err);
        setMenu({
          brand: {
            id: 1,
            companyId: 1,
            name: '100k-RYCOS POS · Waiter Terminal',
            slug: 'default',
            logoUrl: null,
            bannerUrl: null,
            footerUrl: null,
            currency: 'PLN',
            isAcceptingOrders: true,
            locationId: 1,
            locationName: 'Sala Główna',
          },
          categories: [
            { id: 1, companyId: 1, name: 'Burgery', position: 0, translations: {} },
            { id: 2, companyId: 1, name: 'Pizza', position: 1, translations: {} },
            { id: 3, companyId: 1, name: 'Napoje', position: 2, translations: {} },
          ],
          products: [
            {
              id: 1,
              companyId: 1,
              categoryId: 1,
              name: 'Classic Smash Burger',
              description: 'Wołowina 100%, ser cheddar, pikle.',
              price: 32.0,
              taxRate: 8,
              ptuCode: 'b',
              imageUrl: null,
              isAvailable: true,
              isAgeRestricted: false,
              prepTimeMinutes: 10,
              barcode: null,
              productOrder: 1,
              addonGroups: [],
              translations: {},
            },
            {
              id: 2,
              companyId: 1,
              categoryId: 1,
              name: 'Bacon & Cheese Smash',
              description: 'Podwójny bekon, cheddar, prażona cebulka.',
              price: 38.0,
              taxRate: 8,
              ptuCode: 'b',
              imageUrl: null,
              isAvailable: true,
              isAgeRestricted: false,
              prepTimeMinutes: 10,
              barcode: null,
              productOrder: 2,
              addonGroups: [],
              translations: {},
            },
            {
              id: 201,
              companyId: 1,
              categoryId: 2,
              name: 'Pizza Margherita 32cm',
              description: 'Sos San Marzano, mozzarella fior di latte, bazylia.',
              price: 34.0,
              taxRate: 8,
              ptuCode: 'b',
              imageUrl: null,
              isAvailable: true,
              isAgeRestricted: false,
              prepTimeMinutes: 12,
              barcode: null,
              productOrder: 3,
              addonGroups: [],
              translations: {},
            },
            {
              id: 301,
              companyId: 1,
              categoryId: 3,
              name: 'Fritz-Kola 330ml',
              description: 'Klasyczna kola z dużą zawartością kofeiny.',
              price: 12.0,
              taxRate: 23,
              ptuCode: 'a',
              imageUrl: null,
              isAvailable: true,
              isAgeRestricted: false,
              prepTimeMinutes: 1,
              barcode: null,
              productOrder: 4,
              addonGroups: [],
              translations: {},
            },
          ],
        });
        setActiveCategory(1);
        setLoading(false);
      });
  }, []);

  const handleProductClick = (product: Product) => {
    if (product.addonGroups && product.addonGroups.length > 0) {
      setCustomizingProduct(product);
      setSelectedAddons([]);
      setModalInstructions('');
    } else {
      addToCartDirect(product, [], '');
    }
  };

  const addToCartDirect = (product: Product, addons: AddonOption[] = [], instructions: string = '') => {
    const key = `${product.id}-${addons.map((a) => a.id).sort().join('-')}-${instructions}`;
    setCart((prev) => {
      const existing = prev.find((item) => item.id === key);
      if (existing) {
        return prev.map((item) => (item.id === key ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...prev, { id: key, product, quantity: 1, selectedAddons: addons, specialInstructions: instructions }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const next = item.quantity + delta;
            return next > 0 ? { ...item, quantity: next } : null;
          }
          return item;
        })
        .filter(Boolean) as PosCartItem[]
    );
  };

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerNote('');
    setCustomerNip('');
  };

  // Calculations
  const calculateItemTotal = (item: PosCartItem) => {
    const addonsDelta = item.selectedAddons.reduce((sum, a) => sum + (a.priceDelta || 0), 0);
    return (item.product.price + addonsDelta) * item.quantity;
  };

  const totalAmount = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Submit Order (Action Handler)
  const handleProcessOrder = async (action: 'cash' | 'card' | 'kitchen') => {
    if (cart.length === 0 || !menu) return;
    setSubmitting(true);

    try {
      const payload = {
        brandId: menu.brand.id,
        orderType: orderType,
        tableLabel: orderType === 'dine_in' ? selectedTable : null,
        parkingSpot: null,
        customerNip: showNip && customerNip ? customerNip : null,
        customerNote: customerNote || null,
        ageConsentAccepted: true,
        items: cart.map((item) => ({
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
        tipAmount: 0,
        paymentMethod: action === 'cash' ? ('cash' as const) : action === 'card' ? ('card' as const) : ('cash' as const),
        currency: menu.brand.currency || 'PLN',
      };

      const placed = await submitOrder(payload);

      // If action is Cash or Card, immediately set status to paid to trigger fiscal printing
      if (action === 'cash' || action === 'card') {
        try {
          await fetch(`${getApiBaseUrl()}/v1/admin/orders/${placed.id}/status`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-company-id': String(menu.brand.companyId || 1),
            },
            body: JSON.stringify({ status: 'paid' }),
          });
        } catch (e) {
          console.warn('Status update for fiscal print:', e);
        }
      }

      setLastOrderSuccess({
        orderNumber: placed.orderNumber,
        pin: placed.collectionPin,
        action: action === 'cash' ? 'Gotówka (Fiskalizacja)' : action === 'card' ? 'Terminal (Fiskalizacja)' : 'Wysłano do kuchni',
        total: totalAmount,
      });

      clearCart();
    } catch (err: any) {
      alert(`Błąd składania zamówienia POS: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = menu?.products.filter((p) => {
    const matchesCat = activeCategory ? p.categoryId === activeCategory : true;
    const matchesSearch = searchQuery
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;
    return matchesCat && matchesSearch;
  }) || [];

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
            <Utensils size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-base tracking-tight">
                {menu?.brand.name || 'RYCOS POS'}
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Live POS
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Terminal Kelnerski · Szybka sprzedaż i fiskalizacja
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative w-72 hidden md:block">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Szukaj dania lub napoju..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Workstation Quick Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-700 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-black shadow-xs">
            💳 POS
          </span>
          <a
            href="/kds"
            className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold transition-colors"
          >
            🍳 KDS
          </a>
          <a
            href="/pickup"
            className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold transition-colors"
          >
            📦 Wydawka
          </a>
        </div>

        {/* Right Info */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsPinModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-black text-slate-950 bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 rounded-xl transition-all shadow-md shadow-emerald-500/20 active:scale-95"
            title="Weryfikacja odbioru zamówienia kodem QR lub PIN"
          >
            <Camera size={14} />
            <span>Skanuj QR / Wydaj</span>
          </button>

          <div className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl font-mono font-bold text-amber-400 text-sm">
            {currentTime}
          </div>
        </div>
      </header>

      {/* Main Content: Left 65% Products Grid, Right 35% Ticket */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Category Tabs + Products */}
        <div className="flex-[65] flex flex-col border-r border-slate-800 bg-slate-900/40 overflow-hidden">
          {/* Categories Bar */}
          <div className="bg-slate-900/80 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                activeCategory === null
                  ? 'bg-amber-500 text-slate-950 shadow-md scale-[1.02]'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              Wszystkie
            </button>
            {menu?.categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  activeCategory === cat.id
                    ? 'bg-amber-500 text-slate-950 shadow-md scale-[1.02]'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Products Grid */}
          <div className="flex-1 p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
            {filteredProducts.map((prod) => (
              <button
                key={prod.id}
                onClick={() => handleProductClick(prod)}
                className="bg-slate-800/80 hover:bg-slate-800 active:scale-[0.98] border border-slate-700/80 hover:border-amber-500/50 rounded-2xl p-3.5 flex flex-col justify-between text-left transition-all group shadow-md hover:shadow-amber-500/5"
              >
                <div>
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <h3 className="font-bold text-sm text-white group-hover:text-amber-300 transition-colors line-clamp-2 leading-tight">
                      {prod.name}
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded shrink-0">
                      PTU {prod.ptuCode?.toUpperCase() || 'B'}
                    </span>
                  </div>
                  {prod.description && (
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                      {prod.description}
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-slate-700/60 flex items-center justify-between">
                  <span className="font-black text-amber-400 text-base">
                    {Number(prod.price).toFixed(2)} zł
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950 flex items-center justify-center transition-all">
                    <Plus size={16} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Side: Table Ticket & Payment Panel */}
        <div className="flex-[35] flex flex-col bg-slate-900 border-l border-slate-800 overflow-hidden">
          {/* Table / Order Type Header */}
          <div className="p-3 bg-slate-800/60 border-b border-slate-800 space-y-2 shrink-0">
            {/* Dine In vs Takeaway */}
            <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700/60 text-xs font-bold">
              <button
                onClick={() => setOrderType('dine_in')}
                className={`py-1.5 rounded-lg transition-all ${
                  orderType === 'dine_in' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Na Miejscu (Stolik)
              </button>
              <button
                onClick={() => setOrderType('takeaway')}
                className={`py-1.5 rounded-lg transition-all ${
                  orderType === 'takeaway' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Na Wynos (Takeaway)
              </button>
            </div>

            {/* Quick Table Buttons (if dine_in) */}
            {orderType === 'dine_in' && (
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                  <span>Wybierz stolik:</span>
                  <span className="text-amber-400 font-bold">Wybrano: {selectedTable}</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {QUICK_TABLES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedTable(t)}
                      className={`px-3 py-1 rounded-lg text-xs font-extrabold whitespace-nowrap transition-all ${
                        selectedTable === t
                          ? 'bg-amber-400 text-slate-950 shadow-xs'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {t.startsWith('Ogr') ? t : `Stół ${t}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs text-center p-6 space-y-2">
                <Receipt size={36} className="text-slate-600" />
                <span className="font-bold text-slate-400">Rachunek jest pusty</span>
                <span>Wybierz dania z lewego panelu, aby dodać je do zamówienia kelnerskiego.</span>
              </div>
            ) : (
              cart.map((item) => {
                const itemTotal = calculateItemTotal(item);
                return (
                  <div
                    key={item.id}
                    className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-2.5 flex flex-col gap-1.5 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-white leading-tight">
                          {item.product.name}
                        </div>
                        {item.selectedAddons.length > 0 && (
                          <div className="text-[11px] text-amber-400/90 mt-0.5">
                            + {item.selectedAddons.map((a) => a.name).join(', ')}
                          </div>
                        )}
                        {item.specialInstructions && (
                          <div className="text-[10px] text-slate-400 italic">
                            &ldquo;{item.specialInstructions}&rdquo;
                          </div>
                        )}
                      </div>
                      <span className="font-bold text-sm text-white font-mono shrink-0">
                        {itemTotal.toFixed(2)} zł
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-700/40">
                      <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-6 text-center font-bold text-xs text-amber-400">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                        title="Usuń pozycję"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Ticket Footer / Checkout Actions */}
          <div className="p-3 bg-slate-900 border-t border-slate-800 space-y-2.5 shrink-0">
            {/* Note & NIP Toggles */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Uwagi do kuchni (np. bez soli, na wynos)..."
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
                />
                <button
                  onClick={() => setShowNip(!showNip)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                    showNip
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                  title="Faktura na NIP"
                >
                  NIP
                </button>
              </div>

              {showNip && (
                <input
                  type="text"
                  placeholder="Wpisz NIP firmy do faktury..."
                  value={customerNip}
                  onChange={(e) => setCustomerNip(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400 animate-in slide-in-from-top-1 duration-150"
                />
              )}
            </div>

            {/* Total Summary */}
            <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400">Pozycji: {totalItemsCount}</span>
                <div className="text-xs font-bold text-slate-300">Do zapłaty brutto:</div>
              </div>
              <div className="text-right">
                <span className="font-black text-2xl text-amber-400 tracking-tight">
                  {totalAmount.toFixed(2)} zł
                </span>
              </div>
            </div>

            {/* Action Buttons Grid */}
            <div className="grid grid-cols-3 gap-2">
              {/* Cash Button */}
              <button
                onClick={() => handleProcessOrder('cash')}
                disabled={submitting || cart.length === 0}
                className="py-3 px-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] rounded-xl text-white font-extrabold text-xs flex flex-col items-center justify-center gap-1 shadow-lg shadow-emerald-900/20 transition-all cursor-pointer"
              >
                <Banknote size={18} />
                <span>Gotówka</span>
                <span className="text-[10px] font-normal text-emerald-100 flex items-center gap-0.5">
                  <Printer size={10} /> Drukuj
                </span>
              </button>

              {/* Card Button */}
              <button
                onClick={() => handleProcessOrder('card')}
                disabled={submitting || cart.length === 0}
                className="py-3 px-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] rounded-xl text-white font-extrabold text-xs flex flex-col items-center justify-center gap-1 shadow-lg shadow-blue-900/20 transition-all cursor-pointer"
              >
                <CreditCard size={18} />
                <span>Karta</span>
                <span className="text-[10px] font-normal text-blue-100 flex items-center gap-0.5">
                  <Printer size={10} /> Drukuj
                </span>
              </button>

              {/* Send to Kitchen Open Ticket */}
              <button
                onClick={() => handleProcessOrder('kitchen')}
                disabled={submitting || cart.length === 0}
                className="py-3 px-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] rounded-xl text-white font-extrabold text-xs flex flex-col items-center justify-center gap-1 shadow-lg shadow-amber-900/20 transition-all cursor-pointer"
              >
                <Send size={18} />
                <span>Do kuchni</span>
                <span className="text-[10px] font-normal text-amber-100">Otwarty</span>
              </button>
            </div>

            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="w-full py-1.5 text-xs text-slate-500 hover:text-red-400 font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <RotateCcw size={12} />
                <span>Wyczyść bieżący rachunek</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Addons Customization Modal */}
      {customizingProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-extrabold text-lg text-white">{customizingProduct.name}</h3>
                <p className="text-xs text-slate-400">Wybierz dodatki dla klienta</p>
              </div>
              <button
                onClick={() => setCustomizingProduct(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {customizingProduct.addonGroups?.map((group) => (
                <div key={group.id} className="space-y-1.5">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    {group.name}
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {group.options.map((opt) => {
                      const isSelected = selectedAddons.some((a) => a.id === opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedAddons((prev) => prev.filter((a) => a.id !== opt.id));
                            } else {
                              setSelectedAddons((prev) => [...prev, opt]);
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-400 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                          }`}
                        >
                          <span>{opt.name}</span>
                          <span className="font-mono text-amber-400">
                            {opt.priceDelta > 0 ? `+${opt.priceDelta.toFixed(2)} zł` : 'W cenie'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <input
              type="text"
              placeholder="Uwagi do pozycji (np. bez pomidora)..."
              value={modalInstructions}
              onChange={(e) => setModalInstructions(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
            />

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setCustomizingProduct(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
              >
                Anuluj
              </button>
              <button
                onClick={() => {
                  addToCartDirect(customizingProduct, selectedAddons, modalInstructions);
                  setCustomizingProduct(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-md cursor-pointer"
              >
                Dodaj do rachunku
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification Modal */}
      {lastOrderSuccess && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-400">
                {lastOrderSuccess.action}
              </span>
              <h2 className="text-2xl font-black text-white mt-1">
                Zamówienie #{lastOrderSuccess.orderNumber}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Wysłano do kuchni Live KDS oraz do kolejki fiskalnej MQTT.
              </p>
            </div>

            <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700/60 flex items-center justify-between text-left">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Kod PIN</span>
                <span className="font-mono text-xl font-black text-amber-400">
                  {lastOrderSuccess.pin}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Wartość</span>
                <span className="font-mono text-xl font-black text-white">
                  {lastOrderSuccess.total.toFixed(2)} zł
                </span>
              </div>
            </div>

            <button
              onClick={() => setLastOrderSuccess(null)}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-sm shadow-lg shadow-emerald-900/40 active:scale-[0.98] transition-all cursor-pointer"
            >
              Kolejne zamówienie (Enter)
            </button>
          </div>
        </div>
      )}

      {/* Verification Modal (Keypad & Camera Scanner) */}
      <PinVerificationModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={(updatedOrder) => {
          // Handled
        }}
      />
    </div>
  );
}
