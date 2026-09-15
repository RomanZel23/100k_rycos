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
  Smartphone,
  Download,
  LayoutGrid,
  List,
  Wifi,
  AlertCircle,
  Radio,
  Loader2
} from 'lucide-react';
import { Product, MenuResponse, AddonOption } from '@rycos/shared';
import { fetchMenu, submitOrder, getApiBaseUrl } from '../../lib/api';
import { PinVerificationModal } from '../../components/PinVerificationModal';
import { TerminalGuard, PairedTerminal } from '../../components/TerminalGuard';

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
        <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-700/60 text-sm font-black">
          <button
            onClick={() => setOrderType('dine_in')}
            className={`py-2.5 sm:py-2 rounded-xl transition-all cursor-pointer ${
              orderType === 'dine_in' ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            Na Miejscu (Stolik)
          </button>
          <button
            onClick={() => setOrderType('takeaway')}
            className={`py-2.5 sm:py-2 rounded-xl transition-all cursor-pointer ${
              orderType === 'takeaway' ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            Na Wynos (Takeaway)
          </button>
        </div>

        {/* Quick Table Buttons (if dine_in) */}
        {orderType === 'dine_in' && (
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>Wybierz stolik:</span>
              <span className="text-amber-400 font-black bg-amber-500/15 px-2.5 py-0.5 rounded-lg border border-amber-500/30">
                Wybrano: {selectedTable}
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {QUICK_TABLES.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTable(t)}
                  className={`px-4 py-2 sm:px-3 sm:py-1.5 rounded-xl text-sm sm:text-xs font-black whitespace-nowrap transition-all cursor-pointer min-w-[56px] text-center ${
                    selectedTable === t
                      ? 'bg-amber-400 text-slate-950 shadow-md scale-[1.03]'
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
      <div className="flex-1 p-3 overflow-y-auto space-y-2.5">
        {cart.length === 0 ? (
          <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-slate-400 text-sm text-center p-6 space-y-3">
            <Receipt size={44} className="text-slate-600" />
            <span className="font-extrabold text-slate-300 text-base">Rachunek jest pusty</span>
            <span className="text-xs text-slate-500 max-w-xs">Wybierz dania z menu, aby dodać je do rachunku kelnerskiego.</span>
            {isMobileDrawer && onCloseMobileDrawer && (
              <button
                onClick={onCloseMobileDrawer}
                className="mt-3 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-amber-400 font-black rounded-2xl text-sm transition-colors cursor-pointer shadow-md"
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
                className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3 sm:p-3 flex flex-col gap-2 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base sm:text-sm text-white leading-tight">
                      {item.product.name}
                    </div>
                    {item.selectedAddons.length > 0 && (
                      <div className="text-xs sm:text-[11px] text-amber-400 font-semibold mt-0.5">
                        + {item.selectedAddons.map((a) => a.name).join(', ')}
                      </div>
                    )}
                    {item.specialInstructions && (
                      <div className="text-xs sm:text-[10px] text-amber-200/90 bg-amber-500/10 p-1.5 rounded-lg mt-1 italic font-medium">
                        &ldquo;{item.specialInstructions}&rdquo;
                      </div>
                    )}
                  </div>
                  <span className="font-black text-base sm:text-sm text-amber-400 font-mono shrink-0 ml-2">
                    {itemTotal.toFixed(2)} zł
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-slate-700/50">
                  <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xl p-1">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Minus size={15} />
                    </button>
                    <span className="w-8 text-center font-mono font-black text-sm sm:text-xs text-amber-400">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Plus size={15} />
                    </button>
                  </div>

                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-2 text-slate-400 hover:text-red-400 rounded-xl hover:bg-slate-750 transition-colors cursor-pointer"
                    title="Usuń pozycję"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Ticket Footer / Checkout Actions */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 space-y-3 shrink-0">
        {/* Note & NIP Toggles */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Uwagi do zamówienia..."
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
            />
            <button
              onClick={() => setShowNip(!showNip)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                showNip ? 'bg-amber-500 text-slate-950 border-amber-400 font-black' : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              NIP
            </button>
          </div>

          {showNip && (
            <input
              type="text"
              placeholder="Wprowadź 10-cyfrowy NIP do faktury..."
              value={customerNip}
              onChange={(e) => setCustomerNip(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400 animate-in slide-in-from-top-1 duration-150 font-mono"
            />
          )}
        </div>

        {/* Total Summary */}
        <div className="bg-slate-800/90 rounded-2xl p-3 border border-slate-700/80 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs text-slate-400 font-bold">Pozycji: {totalItemsCount}</span>
            <div className="text-xs sm:text-sm font-black text-slate-200">Do zapłaty brutto:</div>
          </div>
          <div className="text-right">
            <span className="font-black text-3xl sm:text-2xl text-amber-400 tracking-tight font-mono">
              {totalAmount.toFixed(2)} zł
            </span>
          </div>
        </div>

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          {/* Cash Button */}
          <button
            onClick={() => handleProcessOrder('cash')}
            disabled={submitting || cart.length === 0}
            className="py-4 sm:py-3.5 px-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] rounded-2xl text-white font-black text-sm sm:text-xs flex flex-col items-center justify-center gap-1.5 shadow-xl shadow-emerald-900/30 transition-all cursor-pointer min-h-[64px]"
          >
            <Banknote size={22} />
            <span>Gotówka</span>
            <span className="text-xs sm:text-[10px] font-semibold text-emerald-100 flex items-center gap-0.5">
              <Printer size={12} /> Drukuj
            </span>
          </button>

          {/* Card Button */}
          <button
            onClick={() => handleProcessOrder('card')}
            disabled={submitting || cart.length === 0}
            className="py-4 sm:py-3.5 px-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] rounded-2xl text-white font-black text-sm sm:text-xs flex flex-col items-center justify-center gap-1.5 shadow-xl shadow-blue-900/30 transition-all cursor-pointer min-h-[64px]"
          >
            <CreditCard size={22} />
            <span>Karta</span>
            <span className="text-xs sm:text-[10px] font-semibold text-blue-100 flex items-center gap-0.5">
              <Printer size={12} /> Drukuj
            </span>
          </button>

          {/* Send to Kitchen Open Ticket */}
          <button
            onClick={() => handleProcessOrder('kitchen')}
            disabled={submitting || cart.length === 0}
            className="py-4 sm:py-3.5 px-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] rounded-2xl text-white font-black text-sm sm:text-xs flex flex-col items-center justify-center gap-1.5 shadow-xl shadow-amber-900/30 transition-all cursor-pointer min-h-[64px]"
          >
            <Send size={22} />
            <span>Do kuchni</span>
            <span className="text-xs sm:text-[10px] font-semibold text-amber-100">Otwarty</span>
          </button>
        </div>

        {!isMobileDrawer && cart.length > 0 && (
          <button
            onClick={clearCart}
            className="w-full py-2 text-xs text-slate-500 hover:text-red-400 font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Wyczyść bieżący rachunek</span>
          </button>
        )}

        {isMobileDrawer && onCloseMobileDrawer && (
          <button
            onClick={onCloseMobileDrawer}
            className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-black rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[48px]"
          >
            <span>← Kontynuuj dodawanie dań</span>
          </button>
        )}
      </div>
    </div>
  );
}

function PosPageContent({ initialTerminal }: { initialTerminal: PairedTerminal }) {
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Mobile drawer, search & layout state
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileLayout, setMobileLayout] = useState<'list' | 'grid'>('list');

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
    orderId?: string;
    orderNumber: number;
    pin: string;
    action: string;
    total: number;
    fiscalReceiptNumber?: string | null;
    fiscalPdfUrl?: string | null;
    fiscalQrCode?: string | null;
    fiscalJobId?: string | null;
    printerDeviceId?: string | null;
  } | null>(null);

  const [isPrintingPaper, setIsPrintingPaper] = useState(false);
  const [printStatusMessage, setPrintStatusMessage] = useState<string | null>(null);

  const handlePrintPaperReceipt = async (orderId?: string, jobId?: string | null) => {
    if (!orderId && !jobId) return;
    setIsPrintingPaper(true);
    setPrintStatusMessage('Wysyłanie do drukarki SBR...');
    try {
      const companyId = terminal?.company_id || menu?.brand?.companyId || 1;
      const res = await fetch(`${getApiBaseUrl()}/v1/pos/print-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-company-id': String(companyId),
          ...(terminal?.terminal_id ? { 'x-terminal-id': terminal.terminal_id } : {}),
        },
        body: JSON.stringify({
          order_id: orderId,
          company_id: companyId,
          terminal_id: terminal?.terminal_id,
          printer_device_id: terminal?.printer_device_id,
          job_id: jobId || undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setPrintStatusMessage(`Wydrukowano pomyślnie na ${json.displayId || 'drukarce SBR'}`);
      } else {
        setPrintStatusMessage(json.error || 'Błąd wydruku na drukarce termicznej');
      }
    } catch (err: any) {
      setPrintStatusMessage(err.message || 'Błąd połączenia z drukarką');
    } finally {
      setIsPrintingPaper(false);
    }
  };

  // Verification modal state
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Time display
  const [currentTime, setCurrentTime] = useState('');

  // Paired Workstation Terminal
  const [terminal, setTerminal] = useState<PairedTerminal>(initialTerminal);

  // Open tickets (Otwarte rachunki / stoliki) state
  const [isOpenTicketsModalOpen, setIsOpenTicketsModalOpen] = useState(false);
  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [openOrdersLoading, setOpenOrdersLoading] = useState(false);
  const [settlingOrderId, setSettlingOrderId] = useState<string | null>(null);

  // PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
  };

  const loadOpenOrders = async () => {
    try {
      setOpenOrdersLoading(true);
      const companyId = terminal?.company_id || menu?.brand?.companyId || 1;
      const res = await fetch(`${getApiBaseUrl()}/v1/admin/orders?limit=50`, {
        headers: {
          'x-company-id': String(companyId),
          ...(terminal?.terminal_id ? { 'x-terminal-id': terminal.terminal_id } : {}),
        },
      });
      if (res.ok) {
        const json = await res.json();
        const list = json.data || [];
        // Active orders that are NOT yet paid/confirmed
        const unpaid = list.filter(
          (o: any) =>
            o.paymentStatus === 'pending' &&
            !['cancelled', 'completed'].includes(o.status)
        );
        setOpenOrders(unpaid);
      }
    } catch (e) {
      console.warn('Failed to fetch open orders:', e);
    } finally {
      setOpenOrdersLoading(false);
    }
  };

  // Tap card payment modal state (SBR-* / SoftPOS)
  const [tapPaymentState, setTapPaymentState] = useState<{
    isOpen: boolean;
    orderId?: string;
    orderNumber?: number;
    pin?: string;
    amount: number;
    idPay?: string;
    status: 'waiting_for_card' | 'processing' | 'success' | 'declined' | 'error';
    errorRemark?: string;
    targetDevice?: string;
    isNewCheckout?: boolean;
  }>({
    isOpen: false,
    amount: 0,
    status: 'waiting_for_card',
  });

  const startCardTapPayment = async ({
    orderId,
    orderNumber,
    pin,
    amount,
    isNewCheckout,
  }: {
    orderId: string;
    orderNumber: number;
    pin?: string;
    amount: number;
    isNewCheckout: boolean;
  }) => {
    const idPay = crypto.randomUUID();
    const displayDevice =
      terminal?.tap_device_id && terminal.tap_device_id !== 'self'
        ? terminal.tap_device_id
        : terminal?.terminal_id?.startsWith('SBR-') || terminal?.terminal_id?.startsWith('SBT-')
        ? terminal.terminal_id
        : 'SBR-SoftPOS';

    setTapPaymentState({
      isOpen: true,
      orderId,
      orderNumber,
      pin,
      amount,
      idPay,
      status: 'waiting_for_card',
      targetDevice: displayDevice,
      errorRemark: undefined,
      isNewCheckout,
    });

    try {
      const companyId = terminal?.company_id || menu?.brand?.companyId || 1;
      const res = await fetch(`${getApiBaseUrl()}/v1/pos/tap-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-company-id': String(companyId),
          ...(terminal?.terminal_id ? { 'x-terminal-id': terminal.terminal_id } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          terminal_id: terminal?.terminal_id,
          tap_device_id: terminal?.tap_device_id,
          order_id: orderId,
          amount_grosz: Math.round(amount * 100),
          currency: menu?.brand?.currency || 'PLN',
          reference: `POS-${orderNumber}-${Date.now()}`,
          id_pay: idPay,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok && json.success) {
        setTapPaymentState((prev) => ({ ...prev, status: 'success' }));
        const fiscal = json.fiscal || {};
        setTimeout(() => {
          setTapPaymentState((prev) => ({ ...prev, isOpen: false }));
          setLastOrderSuccess({
            orderId,
            orderNumber,
            pin: pin || '0000',
            action: `Terminal ${json.displayId || displayDevice} (Fiskalizacja)`,
            total: amount,
            fiscalReceiptNumber: fiscal.receiptNumber,
            fiscalPdfUrl: fiscal.pdfReceiptUrl,
            fiscalQrCode: fiscal.qrCodeBase64,
            fiscalJobId: fiscal.jobId,
            printerDeviceId: terminal?.printer_device_id,
          });
          if (isNewCheckout) {
            clearCart();
            setIsMobileCartOpen(false);
          }
          loadOpenOrders();
        }, 1000);
      } else {
        const errorMsg = json.remark || json.error || 'Płatność kartą została odrzucona przez terminal.';
        setTapPaymentState((prev) => ({
          ...prev,
          status: 'declined',
          errorRemark: errorMsg,
        }));
      }
    } catch (err: any) {
      setTapPaymentState((prev) => ({
        ...prev,
        status: 'error',
        errorRemark: err.message || 'Błąd połączenia z terminalem płatniczym.',
      }));
    }
  };

  const handleCancelTapPayment = async () => {
    if (tapPaymentState.idPay) {
      const companyId = terminal?.company_id || menu?.brand?.companyId || 1;
      try {
        await fetch(`${getApiBaseUrl()}/v1/pos/tap-payment/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-company-id': String(companyId),
            ...(terminal?.terminal_id ? { 'x-terminal-id': terminal.terminal_id } : {}),
          },
          body: JSON.stringify({
            company_id: companyId,
            terminal_id: terminal?.terminal_id,
            tap_device_id: terminal?.tap_device_id,
            id_pay: tapPaymentState.idPay,
          }),
        });
      } catch (e) {
        console.warn('Failed to send cancel to terminal:', e);
      }
    }
    setTapPaymentState((prev) => ({ ...prev, isOpen: false }));
    loadOpenOrders();
  };

  const handleSettleOpenOrder = async (order: any, method: 'cash' | 'card') => {
    if (method === 'card') {
      // Trigger Tap payment flow on physical/virtual SBR-* card reader
      startCardTapPayment({
        orderId: order.id,
        orderNumber: order.orderNumber,
        pin: order.collectionPin,
        amount: parseFloat(order.totalAmount || '0'),
        isNewCheckout: false,
      });
      return;
    }

    setSettlingOrderId(order.id);
    try {
      const companyId = terminal?.company_id || menu?.brand.companyId || 1;
      const res = await fetch(`${getApiBaseUrl()}/v1/admin/orders/${order.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-company-id': String(companyId),
          ...(terminal?.terminal_id ? { 'x-terminal-id': terminal.terminal_id } : {}),
        },
        body: JSON.stringify({
          paymentMethod: method,
          terminalId: terminal?.terminal_id || (terminal?.id ? String(terminal.id) : undefined),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Błąd rozliczenia płatności');
      }

      const json = await res.json().catch(() => ({}));
      const fiscal = json.data?.fiscal || json.fiscal || {};

      setLastOrderSuccess({
        orderId: order.id,
        orderNumber: order.orderNumber,
        pin: order.collectionPin,
        action: 'Rozliczono: Gotówka (Fiskalizacja)',
        total: parseFloat(order.totalAmount || '0'),
        fiscalReceiptNumber: fiscal.receiptNumber,
        fiscalPdfUrl: fiscal.pdfReceiptUrl,
        fiscalQrCode: fiscal.qrCodeBase64,
        fiscalJobId: fiscal.jobId,
        printerDeviceId: terminal?.printer_device_id,
      });

      await loadOpenOrders();
    } catch (err: any) {
      alert(`Błąd rozliczenia rachunku: ${err.message}`);
    } finally {
      setSettlingOrderId(null);
    }
  };

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
    if (menu?.brand?.companyId) {
      loadOpenOrders();
      const interval = setInterval(loadOpenOrders, 15000);
      return () => clearInterval(interval);
    }
  }, [menu?.brand?.companyId]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lastOrderSuccess && (e.key === 'Enter' || e.key === 'Escape')) {
        setLastOrderSuccess(null);
        setPrintStatusMessage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lastOrderSuccess]);

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
            allowPayAtCounter: true,
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

      // Szybka sprzedaż kartą przy kasie: Uruchamia płatność zbliżeniową na terminalu SBR-* / SoftPOS
      if (action === 'card') {
        startCardTapPayment({
          orderId: placed.id,
          orderNumber: placed.orderNumber,
          pin: placed.collectionPin,
          amount: totalAmount,
          isNewCheckout: true,
        });
        return;
      }

      // Szybka sprzedaż gotówką przy kasie: Natychmiast rejestruje płatność gotówkową i fiskalizuje
      let fiscalData: any = null;
      if (action === 'cash') {
        try {
          const companyId = terminal?.company_id || menu.brand.companyId || 1;
          const res = await fetch(`${getApiBaseUrl()}/v1/admin/orders/${placed.id}/pay`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-company-id': String(companyId),
              ...(terminal?.terminal_id ? { 'x-terminal-id': terminal.terminal_id } : {}),
            },
            body: JSON.stringify({
              paymentMethod: 'cash',
              terminalId: terminal?.terminal_id || (terminal?.id ? String(terminal.id) : undefined),
            }),
          });
          const resJson = await res.json().catch(() => ({}));
          fiscalData = resJson.data?.fiscal || resJson.fiscal || null;
        } catch (e) {
          console.warn('Payment recording for direct POS checkout:', e);
        }
      }

      setLastOrderSuccess({
        orderId: placed.id,
        orderNumber: placed.orderNumber,
        pin: placed.collectionPin,
        action:
          action === 'cash'
            ? 'Gotówka (Fiskalizacja)'
            : 'Wysłano do kuchni (Rachunek otwarty)',
        total: totalAmount,
        fiscalReceiptNumber: fiscalData?.receiptNumber,
        fiscalPdfUrl: fiscalData?.pdfReceiptUrl,
        fiscalQrCode: fiscalData?.qrCodeBase64,
        fiscalJobId: fiscalData?.jobId,
        printerDeviceId: terminal?.printer_device_id,
      });

      clearCart();
      setIsMobileCartOpen(false);
      loadOpenOrders();
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
    <div className="h-[100dvh] max-h-[100dvh] w-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-2.5 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between z-10 shrink-0 gap-1.5 sm:gap-2 min-h-[52px]">
        {/* Left: Workstation Switcher & Brand */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <div className="hidden xs:flex w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 items-center justify-center font-black shadow-md shrink-0">
            <Utensils size={16} />
          </div>

          {/* Workstation Quick Switcher */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs shrink-0">
            <span className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-black shadow-xs flex items-center gap-1">
              <span>💳</span>
              <span className="text-xs font-black">POS</span>
            </span>
            {(terminal.role === 'all_in_one' || terminal.role === 'kds' || terminal.capabilities?.can_kds) && (
              <a
                href="/kds"
                className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold transition-colors flex items-center gap-1"
              >
                <span>🍳</span>
                <span className="hidden xs:inline">KDS</span>
              </a>
            )}
            {(terminal.role === 'all_in_one' || terminal.role === 'pickup' || terminal.capabilities?.can_pickup) && (
              <a
                href="/pickup"
                className="hidden sm:flex px-2 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold transition-colors items-center gap-1"
              >
                <span>📦</span>
                <span>Wydawka</span>
              </a>
            )}
          </div>

          {/* Terminal Badge (Desktop) */}
          {terminal && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="truncate max-w-[100px]">{terminal.name}</span>
            </div>
          )}
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

        {/* Right Info & Action */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {terminal ? (
            <div className="md:hidden flex items-center gap-1 px-2 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span className="truncate max-w-[70px]">{terminal.name}</span>
            </div>
          ) : (
            <a
              href="/pair"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white text-xs font-black transition-colors shrink-0"
              title="Sparuj to urządzenie ze stanowiskiem w lokalu"
            >
              <QrCode size={14} className="text-amber-400" />
              <span className="hidden xs:inline">Paruj</span>
            </a>
          )}

          <button
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            className="md:hidden w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Szukaj dania"
          >
            <Search size={18} />
          </button>

          <button
            onClick={() => {
              loadOpenOrders();
              setIsOpenTicketsModalOpen(true);
            }}
            className="flex items-center gap-1.5 text-xs font-black text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 px-3 py-2 rounded-xl transition-all active:scale-95 cursor-pointer shrink-0 min-h-[40px]"
            title="Otwarte rachunki stolikowe do rozliczenia"
          >
            <Clock size={16} className="text-amber-400" />
            <span>Otwarte</span>
            {openOrders.length > 0 && (
              <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-full text-xs font-black min-w-[18px] text-center">
                {openOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsPinModalOpen(true)}
            className="w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center font-black transition-all shadow-md shadow-emerald-500/20 active:scale-95 cursor-pointer shrink-0"
            title="Weryfikacja odbioru zamówienia kodem QR lub PIN"
          >
            <Camera size={18} />
          </button>

          {/* PWA Install Button */}
          {isInstallable && (
            <button
              onClick={handleInstallClick}
              className="w-10 h-10 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 text-slate-950 flex items-center justify-center font-black transition-all shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer shrink-0"
              title="Zainstaluj aplikację POS na ekranie głównym telefonu"
            >
              <Smartphone size={18} />
            </button>
          )}

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
          {/* Categories Bar & Mobile Layout Toggle */}
          <div className="bg-slate-900/90 border-b border-slate-800 px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
              <button
                onClick={() => setActiveCategory(null)}
                className={`px-4 sm:px-4 py-2.5 sm:py-2 rounded-2xl text-base sm:text-xs font-black whitespace-nowrap transition-all cursor-pointer min-h-[48px] sm:min-h-0 flex items-center ${
                  activeCategory === null
                    ? 'bg-amber-400 text-slate-950 shadow-lg scale-[1.02]'
                    : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 hover:bg-slate-700 hover:text-white'
                }`}
              >
                Wszystkie
              </button>
              {menu?.categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 sm:px-4 py-2.5 sm:py-2 rounded-2xl text-base sm:text-xs font-black whitespace-nowrap transition-all cursor-pointer min-h-[48px] sm:min-h-0 flex items-center ${
                    activeCategory === cat.id
                      ? 'bg-amber-400 text-slate-950 shadow-lg scale-[1.02]'
                      : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Mobile View Toggle (List vs 2-col Grid) */}
            <div className="sm:hidden flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 shrink-0">
              <button
                onClick={() => setMobileLayout('list')}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  mobileLayout === 'list'
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Widok listy (duży tekst i przyciski)"
              >
                <List size={18} />
              </button>
              <button
                onClick={() => setMobileLayout('grid')}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  mobileLayout === 'grid'
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Widok siatki kafelków"
              >
                <LayoutGrid size={18} />
              </button>
            </div>
          </div>

          {/* Products View: Mobile List View (Default on phone) */}
          {mobileLayout === 'list' && (
            <div className="sm:hidden flex-1 p-3 overflow-y-auto space-y-3 pb-32">
              {filteredProducts.map((prod) => {
                const cartItem = cart.find((i) => i.product.id === prod.id);
                const countInCart = cart
                  .filter((i) => i.product.id === prod.id)
                  .reduce((sum, i) => sum + i.quantity, 0);

                return (
                  <div
                    key={prod.id}
                    className={`bg-slate-900 border-2 rounded-3xl p-4 flex items-center justify-between gap-3 shadow-xl transition-all ${
                      countInCart > 0
                        ? 'border-amber-400 bg-slate-850 ring-2 ring-amber-400/40'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleProductClick(prod)}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-lg text-white leading-snug">
                          {prod.name}
                        </h3>
                        <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md shrink-0">
                          PTU {prod.ptuCode?.toUpperCase() || 'B'}
                        </span>
                      </div>
                      {prod.description && (
                        <p className="text-xs text-slate-300 font-medium line-clamp-2 mt-1 leading-relaxed">
                          {prod.description}
                        </p>
                      )}
                      <div className="font-black text-2xl text-amber-400 font-mono mt-2">
                        {Number(prod.price).toFixed(2)} zł
                      </div>
                    </div>

                    {/* Stepper or Add button on list row */}
                    {countInCart > 0 && cartItem ? (
                      <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-2xl border border-amber-400/60 shadow-md shrink-0">
                        <button
                          onClick={() => updateQuantity(cartItem.id, -1)}
                          className="w-11 h-11 rounded-xl bg-slate-700 active:bg-slate-600 text-white font-black text-xl flex items-center justify-center cursor-pointer active:scale-95"
                        >
                          -
                        </button>
                        <span className="font-black text-2xl text-amber-400 font-mono px-2.5 min-w-[32px] text-center">
                          {countInCart}
                        </span>
                        <button
                          onClick={() => handleProductClick(prod)}
                          className="w-11 h-11 rounded-xl bg-amber-400 active:bg-amber-300 text-slate-950 font-black text-xl flex items-center justify-center cursor-pointer active:scale-95"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleProductClick(prod)}
                        className="w-14 h-14 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-90 text-slate-950 flex items-center justify-center font-black shadow-xl shadow-amber-500/30 cursor-pointer shrink-0 transition-transform"
                      >
                        <Plus size={28} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Products View: Grid View (Desktop / Tablet or Mobile Grid mode) */}
          <div className={`${mobileLayout === 'list' ? 'hidden sm:grid' : 'grid'} flex-1 p-3 sm:p-4 overflow-y-auto grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5 content-start pb-32 lg:pb-4`}>
            {filteredProducts.map((prod) => {
              const countInCart = cart
                .filter((i) => i.product.id === prod.id)
                .reduce((sum, i) => sum + i.quantity, 0);

              return (
                <button
                  key={prod.id}
                  onClick={() => handleProductClick(prod)}
                  className={`relative bg-slate-900 border-2 rounded-3xl p-4 flex flex-col justify-between text-left transition-all group shadow-xl cursor-pointer min-h-[160px] sm:min-h-0 ${
                    countInCart > 0
                      ? 'border-amber-400 bg-slate-850 ring-2 ring-amber-400/40'
                      : 'border-slate-800 hover:border-amber-400/60'
                  }`}
                >
                  {countInCart > 0 && (
                    <span className="absolute -top-3 -right-2 bg-amber-400 text-slate-950 font-black text-sm px-3 py-0.5 rounded-full shadow-xl border-2 border-slate-950 flex items-center gap-0.5">
                      {countInCart}×
                    </span>
                  )}
                  <div className="w-full">
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <h3 className="font-black text-base sm:text-sm text-white group-hover:text-amber-300 transition-colors line-clamp-2 leading-tight">
                        {prod.name}
                      </h3>
                      <span className="text-[11px] sm:text-[10px] font-mono font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md shrink-0">
                        PTU {prod.ptuCode?.toUpperCase() || 'B'}
                      </span>
                    </div>
                    {prod.description && (
                      <p className="text-xs sm:text-[11px] text-slate-300 line-clamp-2 mt-0.5 leading-snug">
                        {prod.description}
                      </p>
                    )}
                  </div>

                  <div className="w-full mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between">
                    <span className="font-black text-amber-400 text-xl sm:text-base whitespace-nowrap font-mono">
                      {Number(prod.price).toFixed(2)} zł
                    </span>
                    <div className="w-11 h-11 sm:w-9 sm:h-9 rounded-2xl bg-amber-500 text-slate-950 group-hover:bg-amber-400 flex items-center justify-center transition-all shrink-0 font-black shadow-md shadow-amber-500/25">
                      <Plus size={22} />
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
      <div className="lg:hidden shrink-0 bg-slate-900/98 backdrop-blur-md border-t-2 border-slate-700 px-4 py-3 flex items-center justify-between z-30 shadow-2xl safe-area-pb min-h-[64px]">
        <div 
          onClick={() => setIsMobileCartOpen(true)}
          className="flex items-center gap-3.5 cursor-pointer select-none"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border-2 border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
            <Receipt size={24} />
          </div>
          <div className="flex flex-col">
            <div className="text-xs font-black text-slate-200 flex items-center gap-2">
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md font-black">
                {orderType === 'dine_in' ? `Stół ${selectedTable}` : 'Na wynos'}
              </span>
              <span className="text-slate-400 font-bold">· {totalItemsCount} poz.</span>
            </div>
            <div className="font-black text-2xl text-white font-mono leading-none mt-1">
              {totalAmount.toFixed(2)} zł
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsMobileCartOpen(true)}
          className="min-h-[54px] py-3.5 px-6 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-base rounded-2xl flex items-center gap-2.5 shadow-xl shadow-amber-500/30 transition-all cursor-pointer"
        >
          <Receipt size={20} />
          <span>Rachunek</span>
          {totalItemsCount > 0 && (
            <span className="bg-slate-950 text-amber-400 px-2.5 py-0.5 rounded-full text-sm font-black min-w-[24px] text-center">
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

      {/* Modal: Płatność Zbliżeniowa SoftPOS / SBR-* */}
      {tapPaymentState.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-blue-500/50 rounded-3xl max-w-md w-full p-6 text-center space-y-5 shadow-2xl relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Header info */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
                <span className="text-xs font-black uppercase tracking-wider text-blue-400">
                  Terminal Płatniczy SoftPOS / SBR
                </span>
              </div>
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                {tapPaymentState.targetDevice || 'SBR-Terminal'}
              </span>
            </div>

            {/* Center Animation Icon */}
            {tapPaymentState.status === 'waiting_for_card' && (
              <div className="relative py-4 flex flex-col items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-blue-500/15 border-2 border-blue-400/50 flex items-center justify-center relative shadow-lg shadow-blue-500/20 animate-pulse">
                  <CreditCard size={44} className="text-blue-400" />
                  <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-blue-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow">
                    <Wifi size={16} className="rotate-90" />
                  </div>
                </div>
                <div className="mt-4 space-y-1">
                  <h3 className="text-xl font-black text-white">Przyłóż kartę lub telefon</h3>
                  <p className="text-xs text-slate-400">
                    Oczekiwanie na zbliżenie do terminala <span className="text-blue-300 font-bold">{tapPaymentState.targetDevice}</span>...
                  </p>
                </div>
              </div>
            )}

            {tapPaymentState.status === 'success' && (
              <div className="relative py-4 flex flex-col items-center justify-center animate-in zoom-in-95 duration-200">
                <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <CheckCircle2 size={52} />
                </div>
                <div className="mt-4 space-y-1">
                  <h3 className="text-2xl font-black text-emerald-400">Płatność zatwierdzona!</h3>
                  <p className="text-xs text-slate-300">
                    Transakcja zaakceptowana. Rejestruję i przekazuję do fiskalizacji...
                  </p>
                </div>
              </div>
            )}

            {(tapPaymentState.status === 'declined' || tapPaymentState.status === 'error') && (
              <div className="relative py-4 flex flex-col items-center justify-center animate-in zoom-in-95 duration-200">
                <div className="w-24 h-24 rounded-full bg-rose-500/20 border-2 border-rose-400 text-rose-400 flex items-center justify-center shadow-lg shadow-rose-500/30">
                  <AlertCircle size={52} />
                </div>
                <div className="mt-4 space-y-1">
                  <h3 className="text-xl font-black text-rose-400">Transakcja nieudana</h3>
                  <p className="text-xs text-rose-200/90 font-medium max-w-xs mx-auto">
                    {tapPaymentState.errorRemark || 'Terminal odrzucił transakcję.'}
                  </p>
                </div>
              </div>
            )}

            {/* Order & Amount Badge */}
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/80 flex items-center justify-between text-left">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">
                  {tapPaymentState.orderNumber ? `Zamówienie #${tapPaymentState.orderNumber}` : 'Rachunek'}
                </span>
                <span className="text-xs font-bold text-slate-300">Płatność Zbliżeniowa</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Kwota do pobrania</span>
                <span className="font-mono text-2xl font-black text-amber-400">
                  {tapPaymentState.amount.toFixed(2)} zł
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2">
              {tapPaymentState.status === 'waiting_for_card' ? (
                <button
                  onClick={handleCancelTapPayment}
                  className="w-full py-3.5 bg-slate-800 hover:bg-slate-750 text-rose-400 hover:text-rose-300 font-bold rounded-xl text-sm border border-slate-700 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <X size={16} />
                  <span>Anuluj transakcję na terminalu</span>
                </button>
              ) : tapPaymentState.status === 'declined' || tapPaymentState.status === 'error' ? (
                <div className="flex gap-2.5">
                  <button
                    onClick={() => {
                      if (tapPaymentState.orderId && tapPaymentState.orderNumber) {
                        startCardTapPayment({
                          orderId: tapPaymentState.orderId,
                          orderNumber: tapPaymentState.orderNumber,
                          pin: tapPaymentState.pin,
                          amount: tapPaymentState.amount,
                          isNewCheckout: tapPaymentState.isNewCheckout ?? false,
                        });
                      }
                    }}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-blue-900/30 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw size={15} />
                    <span>Spróbuj ponownie</span>
                  </button>
                  <button
                    onClick={() => {
                      setTapPaymentState((prev) => ({ ...prev, isOpen: false }));
                      loadOpenOrders();
                    }}
                    className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs border border-slate-700 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    Zamknij
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Success Notification Modal with SB e-Paragon QR & Optional Paper Print */}
      {lastOrderSuccess && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-3xl max-w-md w-full p-5 sm:p-6 text-center space-y-4 shadow-2xl my-auto">
            {/* Header Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={22} />
                </div>
                <div className="text-left">
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-emerald-400 block">
                    {lastOrderSuccess.action}
                  </span>
                  <h2 className="text-lg font-black text-white leading-tight">
                    Zamówienie #{lastOrderSuccess.orderNumber}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLastOrderSuccess(null);
                  setPrintStatusMessage(null);
                }}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Summary details */}
            <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700/60 flex items-center justify-between text-left">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Kod Odbioru (PIN)</span>
                <span className="font-mono text-xl font-black text-amber-400">
                  {lastOrderSuccess.pin}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Kwota</span>
                <span className="font-mono text-xl font-black text-emerald-400">
                  {lastOrderSuccess.total.toFixed(2)} zł
                </span>
              </div>
            </div>

            {/* SB e-Paragon QR Code Card */}
            {(() => {
              const qrSrc = lastOrderSuccess.fiscalQrCode
                ? (lastOrderSuccess.fiscalQrCode.startsWith('data:') || lastOrderSuccess.fiscalQrCode.startsWith('http')
                    ? lastOrderSuccess.fiscalQrCode
                    : `data:image/png;base64,${lastOrderSuccess.fiscalQrCode}`)
                : lastOrderSuccess.fiscalPdfUrl
                ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastOrderSuccess.fiscalPdfUrl)}`
                : null;

              return (
                <div className="bg-slate-950/70 rounded-2xl p-4 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-black text-slate-200 flex items-center gap-1.5">
                      <QrCode size={16} className="text-emerald-400" />
                      SB e-Paragon Fiskalny
                    </span>
                    {lastOrderSuccess.fiscalReceiptNumber && (
                      <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold">
                        {lastOrderSuccess.fiscalReceiptNumber}
                      </span>
                    )}
                  </div>

                  {qrSrc ? (
                    <div className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl border-2 border-emerald-500/30 shadow-inner">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrSrc}
                        alt="SB e-Paragon QR Code"
                        className="w-44 h-44 sm:w-48 sm:h-48 object-contain"
                      />
                      <span className="text-[11px] font-bold text-slate-900 mt-2 flex items-center gap-1">
                        <Smartphone size={14} className="text-emerald-600" />
                        Zeskanuj smartfonem e-paragon
                      </span>
                    </div>
                  ) : (
                    <div className="py-6 px-4 bg-slate-900/60 rounded-xl border border-dashed border-slate-800 text-center">
                      <p className="text-xs text-slate-400">
                        Brak wygenerowanego kodu QR lub trwa fiskalizacja...
                      </p>
                    </div>
                  )}

                  {lastOrderSuccess.fiscalPdfUrl && (
                    <div className="text-center pt-0.5">
                      <a
                        href={lastOrderSuccess.fiscalPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-medium inline-flex items-center gap-1"
                      >
                        Otwórz cyfrowy e-paragon (PDF)
                      </a>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Optional Thermal Paper Print */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handlePrintPaperReceipt(lastOrderSuccess.orderId, lastOrderSuccess.fiscalJobId)}
                disabled={isPrintingPaper}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-amber-300 hover:text-amber-200 font-bold rounded-xl text-xs sm:text-sm border border-amber-500/30 flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {isPrintingPaper ? (
                  <>
                    <Loader2 className="animate-spin text-amber-400" size={16} />
                    <span>Drukowanie na drukarce SBR...</span>
                  </>
                ) : (
                  <>
                    <Printer size={16} className="text-amber-400" />
                    <span>🖨️ Drukuj paragon papierowy</span>
                  </>
                )}
              </button>

              {printStatusMessage && (
                <div
                  className={`text-xs p-2.5 rounded-xl border font-medium text-center ${
                    printStatusMessage.includes('Błąd') || printStatusMessage.includes('failed')
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  }`}
                >
                  {printStatusMessage}
                </div>
              )}
            </div>

            {/* Next Order Button */}
            <button
              type="button"
              onClick={() => {
                setLastOrderSuccess(null);
                setPrintStatusMessage(null);
              }}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-sm shadow-lg shadow-emerald-900/40 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Kolejne zamówienie</span>
              <span className="text-[11px] bg-slate-950/20 text-slate-950 px-2 py-0.5 rounded font-mono font-black">
                Enter ↵
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Modal: Otwarte rachunki (Open Tables & Tickets to Settle) */}
      {isOpenTicketsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                  <Clock size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <span>Otwarte rachunki stolikowe</span>
                    <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs px-2 py-0.5 rounded-full font-bold">
                      {openOrders.length}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Wybierz rachunek, aby go opłacić i wydrukować paragon fiskalny
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpenTicketsModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {openOrdersLoading && openOrders.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  Ładowanie otwartych rachunków...
                </div>
              ) : openOrders.length === 0 ? (
                <div className="py-12 text-center space-y-2 text-slate-400">
                  <Receipt size={40} className="mx-auto text-slate-600" />
                  <div className="font-bold text-white text-base">Brak otwartych rachunków</div>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Wszystkie rachunki stolikowe zostały rozliczone i zafiskalizowane.
                  </p>
                </div>
              ) : (
                openOrders.map((ord: any) => {
                  const isSettling = settlingOrderId === ord.id;
                  const minsAgo = Math.floor((Date.now() - new Date(ord.createdAt).getTime()) / 60000);
                  const timeLabel = minsAgo <= 0 ? 'przed chwilą' : `${minsAgo} min temu`;

                  return (
                    <div
                      key={ord.id}
                      className="bg-slate-800/80 border border-slate-700/80 hover:border-amber-500/50 rounded-2xl p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-black text-xs">
                            {ord.orderType === 'dine_in'
                              ? `Stół ${ord.tableLabel || '—'}`
                              : 'Na Wynos'}
                          </span>
                          <span className="font-mono font-bold text-slate-300 text-xs">
                            #{ord.orderNumber}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Clock size={11} /> {timeLabel}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                              ord.status === 'ready_to_collect'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            }`}
                          >
                            {ord.status === 'ready_to_collect'
                              ? 'Danie gotowe'
                              : 'W kuchni'}
                          </span>
                        </div>

                        {/* Items preview */}
                        <div className="text-xs text-slate-400 truncate">
                          {(ord.items || [])
                            .map((it: any) => `${it.quantity}x ${it.name}`)
                            .join(', ')}
                        </div>

                        {ord.customerNote && (
                          <div className="text-[11px] text-amber-300/90 italic">
                            Uwaga: {ord.customerNote}
                          </div>
                        )}
                      </div>

                      {/* Amount and Settle Buttons */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-700/60">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-bold uppercase">
                            Do zapłaty
                          </span>
                          <span className="font-mono text-xl font-black text-amber-400">
                            {parseFloat(ord.totalAmount || '0').toFixed(2)} zł
                          </span>
                        </div>

                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleSettleOpenOrder(ord, 'cash')}
                            disabled={isSettling}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-900/30 active:scale-95 transition-all cursor-pointer"
                            title="Rozlicz gotówką i wydrukuj paragon fiskalny"
                          >
                            <Banknote size={14} />
                            <span>Gotówka</span>
                          </button>
                          <button
                            onClick={() => handleSettleOpenOrder(ord, 'card')}
                            disabled={isSettling}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-900/30 active:scale-95 transition-all cursor-pointer"
                            title="Rozlicz kartą i wydrukuj paragon fiskalny"
                          >
                            <CreditCard size={14} />
                            <span>Karta</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500 shrink-0">
              <span>Kliknięcie przycisku opłaca rachunek i natychmiast zleca wydruk paragonu fiskalnego.</span>
              <button
                onClick={loadOpenOrders}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
              >
                Odśwież
              </button>
            </div>
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

export default function PosPage() {
  return (
    <TerminalGuard requiredRole="pos" roleName="Kasa Kelnerska (POS)" roleIcon={<CreditCard size={14} />}>
      {(terminal) => <PosPageContent initialTerminal={terminal} />}
    </TerminalGuard>
  );
}
