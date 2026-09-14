'use client';

import React, { useEffect, useState, useRef } from 'react';
import { ChefHat, Volume2, VolumeX, Clock, CheckCircle2, AlertCircle, RefreshCw, MapPin, Bell, Camera, KeyRound, QrCode, Download } from 'lucide-react';
import { getApiBaseUrl } from '../../lib/api';
import { PinVerificationModal } from '../../components/PinVerificationModal';

interface ServiceCallNotification {
  id: string;
  tableLabel?: string | null;
  parkingSpot?: string | null;
  callType: string;
  notes?: string | null;
  timestamp: string;
}

interface KdsOrderItem {
  id: string;
  name: string;
  quantity: number;
  addons?: { name: string; priceDelta?: number }[];
  specialInstructions?: string | null;
}

interface KdsOrder {
  id: string;
  orderNumber: number;
  collectionPin: string;
  status: 'paid' | 'in_progress' | 'ready_to_collect' | 'completed' | 'preparing' | 'ready_for_pickup';
  orderType: string;
  tableLabel?: string | null;
  parkingSpot?: string | null;
  totalAmount: number | string;
  createdAt: string;
  items: KdsOrderItem[];
}

const getWsBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const apiBase = getApiBaseUrl();
  return apiBase.replace(/^http/, 'ws') + '/v1/ws';
};

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [serviceCalls, setServiceCalls] = useState<ServiceCallNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState('');
  const [terminal, setTerminal] = useState<{ id: number; terminal_id: string; name: string; role?: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Mobile tab state
  const [activeMobileTab, setActiveMobileTab] = useState<'new' | 'preparing' | 'ready'>('preparing');

  // Verification modal state
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinModalTargetOrder, setPinModalTargetOrder] = useState<any | null>(null);

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

  // Load terminal from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('rycos_terminal');
      if (stored) {
        setTerminal(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to parse rycos_terminal in KDS', e);
    }
  }, []);

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Web Audio Chime on new order
  const playNewOrderChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.0, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {}
  };

  // Web Audio Chime on service call
  const playServiceCallChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const playBeep = (freq: number, delay: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.35, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.25);
      };

      playBeep(784, 0);
      playBeep(1046.5, 0.2);
    } catch {}
  };

  // Fetch initial orders
  const loadOrders = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/v1/admin/orders`, {
        headers: { 'x-company-id': '1' },
      });
      if (res.ok) {
        const json = await res.json();
        const data = json.data || [];
        const active = data.filter((o: any) =>
          ['paid', 'in_progress', 'ready_to_collect', 'preparing', 'ready_for_pickup'].includes(o.status)
        );
        setOrders(active);
      }
    } catch (e) {
      console.warn('Failed to load KDS orders:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    const pollInterval = setInterval(loadOrders, 10000); // Poll backup every 10s
    return () => clearInterval(pollInterval);
  }, []);

  // Connect WebSocket
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: any;

    const connect = () => {
      try {
        ws = new WebSocket(getWsBaseUrl());
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'order.paid' || data.type === 'order.created') {
              playNewOrderChime();
              loadOrders();
            } else if (data.type === 'order.status_changed' || data.type === 'order.status_updated') {
              loadOrders();
            } else if (data.type === 'service_call') {
              playServiceCallChime();
              setServiceCalls((prev) => [
                {
                  id: Math.random().toString(),
                  tableLabel: data.tableLabel,
                  parkingSpot: data.parkingSpot,
                  callType: data.callType,
                  notes: data.notes,
                  timestamp: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
                },
                ...prev,
              ]);
            }
          } catch {}
        };

        ws.onclose = () => {
          setIsConnected(false);
          reconnectTimeout = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [soundEnabled]);

  // Status Change
  const updateStatus = async (orderId: string, nextStatus: string) => {
    // Canonical backend status
    const canonicalStatus =
      nextStatus === 'preparing' ? 'in_progress' :
      nextStatus === 'ready_for_pickup' ? 'ready_to_collect' :
      nextStatus;

    if (canonicalStatus === 'in_progress') {
      setActiveMobileTab('preparing');
    } else if (canonicalStatus === 'ready_to_collect') {
      setActiveMobileTab('ready');
    }

    // Optimistic update
    setOrders((prev) =>
      prev
        .map((o) => (o.id === orderId ? { ...o, status: canonicalStatus as any } : o))
        .filter((o) => o.status !== 'completed')
    );

    try {
      const res = await fetch(`${getApiBaseUrl()}/v1/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-company-id': '1',
        },
        body: JSON.stringify({ status: canonicalStatus }),
      });

      if (!res.ok) {
        console.error('Failed to update status on server:', res.status, res.statusText);
        loadOrders();
      }
    } catch (e) {
      console.error('Failed to update status:', e);
      loadOrders();
    }
  };

  const getMinutesAgo = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff <= 0) return 'przed chwilą';
    return `${diff} min temu`;
  };

  const newOrders = orders.filter((o) => o.status === 'paid');
  const preparingOrders = orders.filter((o) => o.status === 'in_progress' || o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready_to_collect' || o.status === 'ready_for_pickup');

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between shadow-md shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0">
            <ChefHat size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-sm sm:text-lg text-white tracking-tight flex items-center gap-1.5 sm:gap-2 truncate">
              <span>KDS · Kuchnia Live</span>
              <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            </h1>
            <p className="hidden sm:block text-xs text-slate-400 truncate">
              {isConnected ? 'Połączono live z systemem' : 'Łączenie z WebSocket...'}
            </p>
          </div>
        </div>

        {/* Workstation Quick Switcher */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700 text-xs shrink-0">
          <a
            href="/pos"
            className="px-2 sm:px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold transition-colors flex items-center gap-1"
          >
            <span>💳</span>
            <span className="hidden sm:inline">POS</span>
          </a>
          <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-black shadow-xs flex items-center gap-1">
            <span>🍳</span>
            <span className="hidden sm:inline">KDS</span>
          </span>
          <a
            href="/pickup"
            className="px-2 sm:px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold transition-colors flex items-center gap-1"
          >
            <span>📦</span>
            <span className="hidden sm:inline">Wydawka</span>
          </a>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {terminal ? (
            <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-bold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></span>
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

          {/* PWA Install Button */}
          {isInstallable && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black transition-all shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer shrink-0"
              title="Zainstaluj aplikację na telefonie"
            >
              <Download size={14} />
              <span className="hidden xs:inline">Instaluj PWA</span>
            </button>
          )}

          {/* Quick QR & PIN pickup buttons */}
          <button
            onClick={() => {
              setPinModalTargetOrder(null);
              setIsPinModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer"
            title="Weryfikuj odbiór (Skaner QR / PIN)"
          >
            <Camera size={15} />
            <span className="hidden sm:inline">Weryfikuj Odbiór</span>
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-slate-800 border-slate-700 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
            title={soundEnabled ? 'Dźwięk włączony' : 'Wyciszony'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span className="hidden md:inline ml-1.5">{soundEnabled ? 'Dźwięk' : 'Wyciszony'}</span>
          </button>

          <button
            onClick={loadOrders}
            className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Odśwież"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          <div className="hidden sm:block px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 font-mono text-sm font-bold text-amber-400">
            {currentTime}
          </div>
        </div>
      </header>

      {/* Service Calls Bar */}
      {serviceCalls.length > 0 && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 sm:px-6 py-2 flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-amber-400 font-black text-xs uppercase tracking-wider">
            <Bell size={15} className="animate-bounce text-amber-400" />
            <span>Wezwania ({serviceCalls.length}):</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {serviceCalls.map((call) => (
              <div
                key={call.id}
                className="flex items-center gap-1.5 bg-slate-900 border border-amber-500/50 text-white px-2.5 py-1 rounded-xl shadow-md text-xs"
              >
                <span className="font-black text-amber-400">
                  {call.tableLabel ? `Stolik ${call.tableLabel}` : call.parkingSpot ? `Parking ${call.parkingSpot}` : 'Stolik'}
                </span>
                <span className="text-slate-200 font-medium truncate max-w-[130px] sm:max-w-none">
                  {call.callType === 'bill'
                    ? '🧾 Rachunek'
                    : call.callType === 'waiter'
                    ? '🙋 Podejdź'
                    : call.callType === 'cutlery'
                    ? '🍴 Sztućce'
                    : call.notes || 'Wezwanie'}
                </span>
                <button
                  onClick={() => setServiceCalls((prev) => prev.filter((c) => c.id !== call.id))}
                  className="ml-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-bold bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                >
                  ✓
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Column Tabs */}
      <div className="md:hidden flex items-center gap-2 p-2.5 sm:p-3 bg-slate-900/95 border-b border-slate-800 shrink-0">
        <button
          onClick={() => setActiveMobileTab('new')}
          className={`flex-1 py-3 px-2 rounded-2xl text-sm sm:text-base font-black flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[50px] ${
            activeMobileTab === 'new'
              ? 'bg-amber-500 text-slate-950 shadow-lg font-black scale-[1.02]'
              : 'bg-slate-800/90 text-slate-300 hover:bg-slate-750'
          }`}
        >
          <span>Nowe</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
            activeMobileTab === 'new' ? 'bg-slate-950 text-amber-400' : 'bg-slate-700 text-amber-300'
          }`}>
            {newOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveMobileTab('preparing')}
          className={`flex-1 py-3 px-2 rounded-2xl text-sm sm:text-base font-black flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[50px] ${
            activeMobileTab === 'preparing'
              ? 'bg-blue-600 text-white shadow-lg font-black scale-[1.02]'
              : 'bg-slate-800/90 text-slate-300 hover:bg-slate-750'
          }`}
        >
          <span>W kuchni</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
            activeMobileTab === 'preparing' ? 'bg-slate-950 text-blue-300' : 'bg-slate-700 text-blue-300'
          }`}>
            {preparingOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveMobileTab('ready')}
          className={`flex-1 py-3 px-2 rounded-2xl text-sm sm:text-base font-black flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[50px] ${
            activeMobileTab === 'ready'
              ? 'bg-emerald-600 text-white shadow-lg font-black scale-[1.02]'
              : 'bg-slate-800/90 text-slate-300 hover:bg-slate-750'
          }`}
        >
          <span>Gotowe</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
            activeMobileTab === 'ready' ? 'bg-slate-950 text-emerald-300' : 'bg-slate-700 text-emerald-300'
          }`}>
            {readyOrders.length}
          </span>
        </button>
      </div>

      {/* Kanban Board */}
      <main className="flex-1 p-2.5 sm:p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6 overflow-hidden">
        {/* Kolumna 1: Nowe / Opłacone */}
        <section className={`bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 sm:p-4 flex-col overflow-hidden ${
          activeMobileTab === 'new' ? 'flex flex-1' : 'hidden md:flex'
        }`}>
          <div className="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-slate-800 mb-2.5 sm:mb-3 shrink-0">
            <h2 className="font-bold text-xs sm:text-sm uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              Nowe do przygotowania
            </h2>
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs sm:text-sm font-black">
              {newOrders.length}
            </span>
          </div>

          <div className="flex-1 space-y-3.5 overflow-y-auto pr-1">
            {newOrders.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm font-bold">
                Brak oczekujących zamówień
              </div>
            ) : (
              newOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-slate-850 border-2 border-amber-500/60 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between animate-in fade-in zoom-in duration-200"
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-750 pb-2.5 mb-2.5">
                      <span className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight">#{order.orderNumber}</span>
                      <span className="font-mono text-base sm:text-sm px-3 py-1 rounded-xl bg-slate-800 text-amber-300 font-black">
                        PIN: {order.collectionPin}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm text-slate-300 mb-3.5 font-bold">
                      <span className="flex items-center gap-1.5 text-base sm:text-sm font-black text-white">
                        <MapPin size={16} className="text-amber-400 shrink-0" />
                        {order.tableLabel ? `Stolik ${order.tableLabel}` : order.parkingSpot ? `Parking: ${order.parkingSpot}` : 'Na wynos / Bar'}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock size={14} />
                        {getMinutesAgo(order.createdAt)}
                      </span>
                    </div>

                    {/* Pozycje menu */}
                    <div className="space-y-2.5 py-1">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="text-base sm:text-sm">
                          <div className="flex items-start gap-2.5 font-black text-slate-100 leading-snug">
                            <span className="text-amber-400 font-mono text-lg sm:text-base">{item.quantity}x</span>
                            <span>{item.name}</span>
                          </div>
                          {item.addons && item.addons.length > 0 && (
                            <div className="text-sm sm:text-xs text-slate-300 pl-7 font-medium mt-0.5">
                              + {item.addons.map((a) => a.name).join(', ')}
                            </div>
                          )}
                          {item.specialInstructions && (
                            <div className="text-sm sm:text-xs text-amber-200 bg-amber-500/10 p-2 rounded-xl mt-1.5 italic font-semibold pl-7">
                              „{item.specialInstructions}”
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => updateStatus(order.id, 'in_progress')}
                    className="mt-4 w-full py-4 sm:py-3.5 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-black rounded-2xl text-base sm:text-sm uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-amber-500/20 min-h-[56px] flex items-center justify-center gap-2"
                  >
                    <span>Rozpocznij przygotowanie</span>
                    <span className="text-lg">→</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Kolumna 2: W przygotowaniu */}
        <section className={`bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 sm:p-4 flex-col overflow-hidden ${
          activeMobileTab === 'preparing' ? 'flex flex-1' : 'hidden md:flex'
        }`}>
          <div className="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-slate-800 mb-2.5 sm:mb-3 shrink-0">
            <h2 className="font-bold text-xs sm:text-sm uppercase tracking-wider text-blue-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
              W przygotowaniu
            </h2>
            <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs sm:text-sm font-black">
              {preparingOrders.length}
            </span>
          </div>

          <div className="flex-1 space-y-3.5 overflow-y-auto pr-1">
            {preparingOrders.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm font-bold">
                Kuchnia wolna
              </div>
            ) : (
              preparingOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-slate-850 border-2 border-blue-500/50 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between animate-in fade-in duration-150"
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-750 pb-2.5 mb-2.5">
                      <span className="text-2xl sm:text-3xl font-black text-blue-400 tracking-tight">#{order.orderNumber}</span>
                      <span className="font-mono text-base sm:text-sm px-3 py-1 rounded-xl bg-slate-800 text-blue-300 font-black">
                        PIN: {order.collectionPin}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm text-slate-300 mb-3.5 font-bold">
                      <span className="flex items-center gap-1.5 text-base sm:text-sm font-black text-white">
                        <MapPin size={16} className="text-blue-400 shrink-0" />
                        {order.tableLabel ? `Stolik ${order.tableLabel}` : order.parkingSpot ? `Parking: ${order.parkingSpot}` : 'Na wynos'}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock size={14} />
                        {getMinutesAgo(order.createdAt)}
                      </span>
                    </div>

                    <div className="space-y-2.5 py-1">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="text-base sm:text-sm">
                          <div className="flex items-start gap-2.5 font-black text-slate-100 leading-snug">
                            <span className="text-blue-400 font-mono text-lg sm:text-base">{item.quantity}x</span>
                            <span>{item.name}</span>
                          </div>
                          {item.addons && item.addons.length > 0 && (
                            <div className="text-sm sm:text-xs text-slate-300 pl-7 font-medium mt-0.5">
                              + {item.addons.map((a) => a.name).join(', ')}
                            </div>
                          )}
                          {item.specialInstructions && (
                            <div className="text-sm sm:text-xs text-amber-200 bg-amber-500/10 p-2 rounded-xl mt-1.5 italic font-semibold pl-7">
                              „{item.specialInstructions}”
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => updateStatus(order.id, 'ready_to_collect')}
                    className="mt-4 w-full py-4 sm:py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-black rounded-2xl text-base sm:text-sm uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-blue-600/20 min-h-[56px] flex items-center justify-center gap-2"
                  >
                    <span>Oznacz jako Gotowe</span>
                    <span className="text-lg">✓</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Kolumna 3: Gotowe do odbioru */}
        <section className={`bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 sm:p-4 flex-col overflow-hidden ${
          activeMobileTab === 'ready' ? 'flex flex-1' : 'hidden md:flex'
        }`}>
          <div className="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-slate-800 mb-2.5 sm:mb-3 shrink-0">
            <h2 className="font-bold text-xs sm:text-sm uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              Gotowe do odbioru
            </h2>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs sm:text-sm font-black">
              {readyOrders.length}
            </span>
          </div>

          <div className="flex-1 space-y-3.5 overflow-y-auto pr-1">
            {readyOrders.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm font-bold">
                Brak gotowych dań do wydania
              </div>
            ) : (
              readyOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-slate-850 border-2 border-emerald-500/50 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between animate-in fade-in duration-150"
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-750 pb-2.5 mb-2.5">
                      <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight">#{order.orderNumber}</span>
                      <span className="font-mono text-base sm:text-sm px-3 py-1 rounded-xl bg-emerald-950 text-emerald-300 font-black border border-emerald-500/40">
                        PIN: {order.collectionPin}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm text-slate-300 mb-3.5 font-bold">
                      <span className="flex items-center gap-1.5 text-base sm:text-sm font-black text-white">
                        <MapPin size={16} className="text-emerald-400 shrink-0" />
                        {order.tableLabel ? `Stolik ${order.tableLabel}` : order.parkingSpot ? `Parking: ${order.parkingSpot}` : 'Na wynos'}
                      </span>
                      <span className="text-emerald-400 font-black bg-emerald-500/15 px-2 py-0.5 rounded-lg text-xs">
                        Czeka na klienta
                      </span>
                    </div>

                    <div className="space-y-2 py-1">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="text-base sm:text-sm font-black text-slate-100 flex items-center gap-2.5">
                          <span className="text-emerald-400 font-mono text-lg sm:text-base">{item.quantity}x</span>
                          <span>{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => {
                        setPinModalTargetOrder(order);
                        setIsPinModalOpen(true);
                      }}
                      className="py-4 sm:py-3.5 bg-slate-800 hover:bg-slate-750 active:scale-[0.98] border border-emerald-500/40 text-emerald-300 font-black rounded-2xl text-base sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[56px] shadow-md"
                      title="Weryfikuj kod PIN lub QR"
                    >
                      <KeyRound size={18} />
                      <span>PIN / QR</span>
                    </button>
                    <button
                      onClick={() => updateStatus(order.id, 'completed')}
                      className="py-4 sm:py-3.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black rounded-2xl text-base sm:text-sm uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-emerald-600/20 min-h-[56px] flex items-center justify-center gap-2"
                    >
                      <span>Wydano ✓</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Verification Modal (Keypad & Camera Scanner) */}
      <PinVerificationModal
        isOpen={isPinModalOpen}
        targetOrder={pinModalTargetOrder}
        onClose={() => {
          setIsPinModalOpen(false);
          setPinModalTargetOrder(null);
        }}
        onSuccess={(updatedOrder) => {
          loadOrders();
        }}
      />
    </div>
  );
}
