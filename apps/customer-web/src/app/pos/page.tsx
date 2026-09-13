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
  KeyRound,
  QrCode,
  Smartphone
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

interface PosTicketContentProps {
  orderType: 'dine_in' | 'takeaway';
  setOrderType: (t: 'dine_in' | 'takeaway') => void;
  selectedTable: string;
  setSelectedTable: (t: string) => void;
  cart: PosCartItem[];
  updateQuantity: (id: string, delta: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  customerNote: string;
  setCustomerNote: (n: string) => void;
  showNip: boolean;
  setShowNip: (s: boolean) => void;
  customerNip: string;
  setCustomerNip: (n: string) => void;
  totalAmount: number;
  totalItemsCount: number;
  submitting: boolean;
  handleProcessOrder: (action: 'cash' | 'card' | 'kitchen') => void;
  calculateItemTotal: (item: PosCartItem) => number;
  isMobileDrawer?: boolean;
  onCloseMobileDrawer?: () => void;
}

function PosTicketContent({
  orderType,
  setOrderType,
  selectedTable,
  setSelectedTable,
  cart,
  updateQuantity,
  removeItem,
  clearCart,
  customerNote,
  setCustomerNote,
  showNip,
  setShowNip,
  customerNip,
  setCustomerNip,
  totalAmount,
  totalItemsCount,
  submitting,
  handleProcessOrder,
  calculateItemTotal,
  isMobileDrawer = false,
  onCloseMobileDrawer,
}: PosTicketContentProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Table / Order Type Header */}
      <div className="p-3 bg-slate-800/60 border-b border-slate-800 space-y-2.5 shrink-0">
        {/* Dine In vs Takeaway */}
        <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700/60 text-xs font-bold">
          <button
            onClick={() => setOrderType('dine_in')}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              orderType === 'dine_in' ? 'bg-amber-500 text-slate-950 shadow-sm font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            Na Miejscu (Stolik)
          </button>
          <button
            onClick={() => setOrderType('takeaway')}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              orderType === 'takeaway' ? 'bg-amber-500 text-slate-950 shadow-sm font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            Na Wynos (Takeaway)
          </button>
        </div>

        {/* Quick Table Buttons (if dine_in) */}
        {orderType === 'dine_in' && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
              <span>Wybierz stolik:</span>
              <span className="text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded">
                Wybrano: {selectedTable}
              </span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {QUICK_TABLES.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTable(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
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
          <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-slate-500 text-xs text-center p-6 space-y-2">
            <Receipt size={36} className="text-slate-600" />
            <span className="font-bold text-slate-400">Rachunek jest pusty</span>
            <span>Wybierz dania z katalogu menu, aby dodać je do zamówienia kelnerskiego.</span>
            {isMobileDrawer && onCloseMobileDrawer && (
              <button
                onClick={onCloseMobileDrawer}
                className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                ← Przejdź do wyboru dań
              </button>
            )}
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
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-white leading-tight">
                      {item.product.name}
                    </div>
                    {item.selectedAddons.length > 0 && (
                      <div className="text-[11px] text-amber-400/90 mt-0.5">
                        + {item.selectedAddons.map((a) => a.name).join(', ')}
                      </div>
                    )}
                    {item.specialInstructions && (
                      <div className="text-[10px] text-slate-400 italic mt-0.5">
                        &ldquo;{item.specialInstructions}&rdquo;
                      </div>
                    )}
                  </div>
                  <span className="font-bold text-sm text-white font-mono shrink-0 ml-2">
                    {itemTotal.toFixed(2)} zł
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-700/40">
                  <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-7 text-center font-bold text-xs text-amber-400 font-mono">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-slate-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                    title="Usuń pozycję"
                  >
                    <Trash2 size={15} />
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
              placeholder="Uwagi do kuchni (np. bez soli)..."
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
            />
            <button
              onClick={() => setShowNip(!showNip)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
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
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400 animate-in slide-in-from-top-1 duration-150"
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
            <span className="font-black text-2xl text-amber-400 tracking-tight font-mono">
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
            className="py-3 px-1.5 sm:px-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] rounded-xl text-white font-extrabold text-xs flex flex-col items-center justify-center gap-1 shadow-lg shadow-emerald-900/20 transition-all cursor-pointer"
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
            className="py-3 px-1.5 sm:px-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] rounded-xl text-white font-extrabold text-xs flex flex-col items-center justify-center gap-1 shadow-lg shadow-blue-900/20 transition-all cursor-pointer"
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
            className="py-3 px-1.5 sm:px-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] rounded-xl text-white font-extrabold text-xs flex flex-col items-center justify-center gap-1 shadow-lg shadow-amber-900/20 transition-all cursor-pointer"
          >
            <Send size={18} />
            <span>Do kuchni</span>
            <span className="text-[10px] font-normal text-amber-100">Otwarty</span>
          </button>
        </div>

        {!isMobileDrawer && cart.length > 0 && (
          <button
            onClick={clearCart}
            className="w-full py-1.5 text-xs text-slate-500 hover:text-red-400 font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Wyczyść bieżący rachunek</span>
          </button>
        )}

        {isMobileDrawer && onCloseMobileDrawer && (
          <button
            onClick={onCloseMobileDrawer}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>← Kontynuuj dodawanie dań</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function PosPage() {
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Mobile drawer & search state
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

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

  // Paired Workstation Terminal
  const [terminal, setTerminal] = useState<{ id: number; terminal_id: string; name: string; role?: string } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('rycos_terminal');
      if (stored) {
        setTerminal(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to parse rycos_terminal', e);
    }
  }, []);

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
      setIsMobileCartOpen(false);
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
      <header className="bg-slate-900 border-b border-slate-800 px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between z-10 shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0">
            <Utensils size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-extrabold text-white text-sm sm:text-base tracking-tight truncate max-w-[110px] xs:max-w-[150px] sm:max-w-none">
                {menu?.brand.name || 'RYCOS POS'}
              </span>
              <span className="hidden sm:inline text-[10px] uppercase font-bold tracking-widest bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 shrink-0">
                Live POS
              </span>
            </div>
            <div className="hidden md:block text-[11px] text-slate-400 truncate">
              Terminal Kelnerski · Szybka sprzedaż i fiskalizacja
            </div>
          </div>
        </div>

        {/* Search Bar (Desktop) */}
        <div className="relative w-64 lg:w-72 hidden md:block">
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
              className="absolute right-2.5 top-2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Workstation Quick Switcher */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700 text-xs shrink-0">
          <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-black shadow-xs flex items-center gap-1">
            <span>💳</span>
            <span className="hidden sm:inline">POS</span>
          </span>
          <a
            href="/kds"
            className="px-2 sm:px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold transition-colors flex items-center gap-1"
          >
            <span>🍳</span>
            <span className="hidden sm:inline">KDS</span>
          </a>
          <a
            href="/pickup"
            className="px-2 sm:px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold transition-colors flex items-center gap-1"
          >
            <span>📦</span>
            <span className="hidden sm:inline">Wydawka</span>
          </a>
        </div>

        {/* Right Info & Action */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {terminal ? (
            <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="truncate max-w-[80px] xs:max-w-[120px]">{terminal.name}</span>
              <button
                onClick={() => {
                  if (confirm(`Czy chcesz odłączyć to urządzenie od stanowiska "${terminal.name}"?`)) {
                    localStorage.removeItem('rycos_terminal');
                    setTerminal(null);
                  }
                }}
                className="text-slate-500 hover:text-red-400 ml-0.5 text-sm leading-none cursor-pointer"
                title="Odłącz stanowisko"
              >
                ×
              </button>
            </div>
          ) : (
            <a
              href="/pair"
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors shrink-0"
              title="Sparuj to urządzenie ze stanowiskiem w lokalu"
            >
              <QrCode size={13} className="text-amber-400" />
              <span className="hidden xs:inline">Paruj</span>
            </a>
          )}

          <button
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            className="md:hidden p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Szukaj dania"
          >
            <Search size={15} />
          </button>
          <button
            onClick={() => setIsPinModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-black text-slate-950 bg-emerald-500 hover:bg-emerald-400 px-2.5 sm:px-3 py-1.5 rounded-xl transition-all shadow-md shadow-emerald-500/20 active:scale-95 cursor-pointer"
            title="Weryfikacja odbioru zamówienia kodem QR lub PIN"
          >
            <Camera size={14} />
            <span className="hidden sm:inline">Skanuj QR / Wydaj</span>
          </button>

          <div className="hidden sm:block bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl font-mono font-bold text-amber-400 text-sm">
            {currentTime}
          </div>
        </div>
      </header>

      {/* Mobile Search Row (Dropdown on small screens) */}
      {mobileSearchOpen && (
        <div className="md:hidden bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center gap-2 animate-in slide-in-from-top-1 duration-150 shrink-0">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Szukaj dania lub napoju..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full pl-8 pr-7 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button
            onClick={() => {
              setMobileSearchOpen(false);
              setSearchQuery('');
            }}
            className="text-xs text-slate-400 font-semibold px-2 py-1 hover:text-white cursor-pointer"
          >
            Zamknij
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Product Catalog: Full width on mobile (< lg), 65% on desktop (lg:) */}
        <div className="flex-1 lg:flex-[65] flex flex-col bg-slate-900/40 overflow-hidden">
          {/* Categories Bar */}
          <div className="bg-slate-900/80 border-b border-slate-800 px-3 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
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
                className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
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
          <div className="flex-1 p-2.5 sm:p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 content-start pb-28 lg:pb-4">
            {filteredProducts.map((prod) => {
              const countInCart = cart
                .filter((i) => i.product.id === prod.id)
                .reduce((sum, i) => sum + i.quantity, 0);

              return (
                <button
                  key={prod.id}
                  onClick={() => handleProductClick(prod)}
                  className={`relative bg-slate-800/80 hover:bg-slate-800 active:scale-[0.98] border rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between text-left transition-all group shadow-md hover:shadow-amber-500/5 cursor-pointer ${
                    countInCart > 0 ? 'border-amber-500/60 bg-slate-800/95 ring-1 ring-amber-500/30' : 'border-slate-700/80 hover:border-amber-500/50'
                  }`}
                >
                  {countInCart > 0 && (
                    <span className="absolute -top-2 -right-1.5 bg-amber-500 text-slate-950 font-black text-[11px] px-2 py-0.5 rounded-full shadow-md z-10 border border-slate-950 flex items-center gap-0.5">
                      {countInCart}×
                    </span>
                  )}
                  <div className="w-full">
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <h3 className="font-bold text-xs sm:text-sm text-white group-hover:text-amber-300 transition-colors line-clamp-2 leading-tight">
                        {prod.name}
                      </h3>
                      <span className="text-[9px] sm:text-[10px] font-mono text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded shrink-0">
                        PTU {prod.ptuCode?.toUpperCase() || 'B'}
                      </span>
                    </div>
                    {prod.description && (
                      <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                        {prod.description}
                      </p>
                    )}
                  </div>

                  <div className="w-full mt-2.5 sm:mt-3 pt-2 border-t border-slate-700/60 flex items-center justify-between">
                    <span className="font-black text-amber-400 text-sm sm:text-base whitespace-nowrap font-mono">
                      {Number(prod.price).toFixed(2)} zł
                    </span>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950 flex items-center justify-center transition-all shrink-0">
                      <Plus size={15} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop Right Side: Table Ticket & Payment Panel */}
        <div className="hidden lg:flex lg:flex-[35] flex-col bg-slate-900 border-l border-slate-800 overflow-hidden">
          <PosTicketContent
            orderType={orderType}
            setOrderType={setOrderType}
            selectedTable={selectedTable}
            setSelectedTable={setSelectedTable}
            cart={cart}
            updateQuantity={updateQuantity}
            removeItem={removeItem}
            clearCart={clearCart}
            customerNote={customerNote}
            setCustomerNote={setCustomerNote}
            showNip={showNip}
            setShowNip={setShowNip}
            customerNip={customerNip}
            setCustomerNip={setCustomerNip}
            totalAmount={totalAmount}
            totalItemsCount={totalItemsCount}
            submitting={submitting}
            handleProcessOrder={handleProcessOrder}
            calculateItemTotal={calculateItemTotal}
            isMobileDrawer={false}
          />
        </div>
      </div>

      {/* Mobile Floating Sticky Bottom Bar */}
      <div className="lg:hidden shrink-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-3.5 py-2.5 flex items-center justify-between z-20 shadow-2xl safe-area-pb">
        <div 
          onClick={() => setIsMobileCartOpen(true)}
          className="flex items-center gap-2.5 cursor-pointer select-none"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            <Receipt size={18} />
          </div>
          <div className="flex flex-col">
            <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <span className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-400 font-extrabold">
                {orderType === 'dine_in' ? `Stół ${selectedTable}` : 'Na wynos'}
              </span>
              <span className="text-slate-400">· {totalItemsCount} poz.</span>
            </div>
            <div className="font-black text-base text-white font-mono leading-tight">
              {totalAmount.toFixed(2)} zł
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsMobileCartOpen(true)}
          className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
        >
          <Receipt size={16} />
          <span>Rachunek</span>
          {totalItemsCount > 0 && (
            <span className="bg-slate-950 text-amber-400 px-1.5 py-0.5 rounded-full text-[10px] font-black min-w-[18px] text-center">
              {totalItemsCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile Slide-up Drawer / Modal */}
      {isMobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-150">
          <div className="bg-slate-900 border-t border-slate-700 rounded-t-3xl max-h-[94vh] h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Drawer Top Handle & Header */}
            <div className="px-4 py-3 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Receipt size={16} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Rachunek kelnerski</h3>
                  <span className="text-[11px] text-slate-400">
                    {orderType === 'dine_in' ? `Stolik: ${selectedTable}` : 'Zamówienie na wynos'} · {totalItemsCount} poz.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-xs text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Wyczyść"
                  >
                    <RotateCcw size={14} />
                    <span className="text-[11px]">Wyczyść</span>
                  </button>
                )}
                <button
                  onClick={() => setIsMobileCartOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Drawer Content */}
            <PosTicketContent
              orderType={orderType}
              setOrderType={setOrderType}
              selectedTable={selectedTable}
              setSelectedTable={setSelectedTable}
              cart={cart}
              updateQuantity={updateQuantity}
              removeItem={removeItem}
              clearCart={clearCart}
              customerNote={customerNote}
              setCustomerNote={setCustomerNote}
              showNip={showNip}
              setShowNip={setShowNip}
              customerNip={customerNip}
              setCustomerNip={setCustomerNip}
              totalAmount={totalAmount}
              totalItemsCount={totalItemsCount}
              submitting={submitting}
              handleProcessOrder={handleProcessOrder}
              calculateItemTotal={calculateItemTotal}
              isMobileDrawer={true}
              onCloseMobileDrawer={() => setIsMobileCartOpen(false)}
            />
          </div>
        </div>
      )}

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
