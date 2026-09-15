'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  Camera, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  RotateCcw, 
  Utensils, 
  CreditCard, 
  ChevronRight,
  Volume2,
  VolumeX,
  History,
  PackageCheck,
  ShoppingBag,
  MapPin,
  Car,
  Check
} from 'lucide-react';
import jsQR from 'jsqr';
import { getApiBaseUrl } from '../../lib/api';
import { TerminalGuard, PairedTerminal } from '../../components/TerminalGuard';

interface CompletedOrderLog {
  orderNumber: number;
  time: string;
  itemsCount?: number;
}

function PickupPageContent({ initialTerminal }: { initialTerminal: PairedTerminal }) {
  const [terminal, setTerminal] = useState<PairedTerminal>(initialTerminal);
  const [activeTab, setActiveTab] = useState<'camera' | 'pin'>('camera');
  const [pin, setPin] = useState('');
  const [orderNumberInput, setOrderNumberInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [recentPickups, setRecentPickups] = useState<CompletedOrderLog[]>([]);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const toggleItemCheck = (idx: number) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Camera references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Sound effects
  const playTone = (freq: number, type: OscillatorType, duration: number) => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  };

  const playSuccessChime = () => {
    playTone(587.33, 'sine', 0.15); // D5
    setTimeout(() => playTone(880, 'sine', 0.3), 120); // A5
  };

  const playErrorBuzz = () => {
    playTone(220, 'sawtooth', 0.25);
  };

  const playKeyBeep = () => {
    playTone(800, 'sine', 0.04);
  };

  // Start Camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setCameraActive(true);
        requestAnimationFrame(tick);
      }
    } catch (err: any) {
      console.error('[Pickup Camera Error]', err);
      setCameraError('Nie udało się uruchomić kamery. Włącz uprawnienia lub użyj klawiatury PIN.');
      setCameraActive(false);
    }
  };

  // Stop Camera
  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Frame processing for QR codes
  const tick = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      if (canvas) {
        const video = videoRef.current;
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data) {
            handleQrDetected(code.data);
            return; // pause ticking while submitting
          }
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab]);

  const handleQrDetected = (qrString: string) => {
    stopCamera();
    verifyAndComplete({ qrData: qrString });
  };

  // Verification & order completion call
  const verifyAndComplete = async (params: { pin?: string; orderNumber?: number; qrData?: string }) => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessOrder(null);

    try {
      const apiBase = getApiBaseUrl();
      const companyId = terminal?.company_id || 1;
      const payload = {
        pin: params.pin,
        orderNumber: params.orderNumber,
        qrData: params.qrData,
        companyId: companyId,
      };

      // Try public verify-pin endpoint first, fallback to admin endpoint
      let res = await fetch(`${apiBase}/v1/orders/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-company-id': String(companyId),
          ...(terminal?.terminal_id ? { 'x-terminal-id': terminal.terminal_id } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        res = await fetch(`${apiBase}/v1/admin/orders/verify-pin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-company-id': String(companyId),
            ...(terminal?.terminal_id ? { 'x-terminal-id': terminal.terminal_id } : {}),
          },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || 'Błędny kod lub zamówienie nie istnieje');
      }

      playSuccessChime();
      const order = json.data;
      setSuccessOrder(order);

      // Add to recent pickups
      setRecentPickups((prev) => [
        {
          orderNumber: order?.orderNumber || Number(params.orderNumber) || 0,
          time: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
          itemsCount: order?.items?.length || 0,
        },
        ...prev.slice(0, 4),
      ]);

      setPin('');
      setOrderNumberInput('');
    } catch (err: any) {
      playErrorBuzz();
      setErrorMessage(err.message || 'Błąd weryfikacji zamówienia');
      if (activeTab === 'camera') {
        setTimeout(() => {
          startCamera();
        }, 1500);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeypadPress = (digit: string) => {
    playKeyBeep();
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        verifyAndComplete({
          pin: next,
          orderNumber: orderNumberInput ? parseInt(orderNumberInput, 10) : undefined,
        });
      }
    }
  };

  const handleBackspace = () => {
    playKeyBeep();
    setPin((prev) => prev.slice(0, -1));
  };

  const handleNextScan = () => {
    setSuccessOrder(null);
    setErrorMessage(null);
    setPin('');
    setCheckedItems({});
    if (activeTab === 'camera') {
      startCamera();
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col font-sans select-none overflow-x-hidden">
      {/* Top Workstation Navigation Bar */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0">
            📦
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white leading-tight truncate">
              Wydawka Foodtruck
            </h1>
            <p className="hidden sm:block text-[11px] text-neutral-400 truncate">
              Skaner odbioru zamówień
            </p>
          </div>
        </div>

        {/* Quick Mode Switcher for Multi-Role / All-in-One Terminals */}
        <div className="flex items-center gap-1 bg-neutral-800/80 p-1 rounded-xl border border-neutral-700/60 text-xs shrink-0">
          {(terminal.role === 'all_in_one' || terminal.role === 'pos' || terminal.capabilities?.can_sell) && (
            <Link
              href="/pos"
              className="px-2 sm:px-2.5 py-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700/60 font-bold transition-colors flex items-center gap-1"
            >
              <span>💳</span>
              <span className="hidden sm:inline">POS</span>
            </Link>
          )}
          {(terminal.role === 'all_in_one' || terminal.role === 'kds' || terminal.capabilities?.can_kds) && (
            <Link
              href="/kds"
              className="px-2 sm:px-2.5 py-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700/60 font-bold transition-colors flex items-center gap-1"
            >
              <span>🍳</span>
              <span className="hidden sm:inline">KDS</span>
            </Link>
          )}
          <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold shadow-sm flex items-center gap-1">
            <span>📦</span>
            <span className="hidden sm:inline">Wydawka</span>
          </span>
        </div>

        {/* Audio Toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-2 rounded-xl bg-neutral-850 border border-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer shrink-0"
          title={soundEnabled ? 'Dźwięk włączony' : 'Dźwięk wyciszony'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-neutral-500" />}
        </button>
      </header>

      {/* Main Action Area */}
      <main className="flex-1 flex flex-col p-2.5 sm:p-4 max-w-md sm:max-w-lg mx-auto w-full min-h-0 overflow-hidden">
        {/* Success Confirmation Overlay Card */}
        {successOrder ? (
          <div className="flex-1 flex flex-col justify-between p-3.5 sm:p-5 bg-emerald-950/30 border-2 border-emerald-500/80 rounded-3xl animate-in zoom-in-95 duration-200 overflow-hidden min-h-0 shadow-2xl">
            {/* Top Order Header */}
            <div className="shrink-0 flex flex-col items-center text-center border-b border-emerald-500/25 pb-2 sm:pb-3">
              <div className="flex items-center gap-1.5 text-emerald-400 font-black text-xs uppercase tracking-widest">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Zamówienie Wydane!</span>
              </div>

              {/* Huge Order Number */}
              <div className="text-5xl sm:text-6xl font-black text-white font-mono tracking-tight my-0.5 sm:my-1">
                #{successOrder.orderNumber}
              </div>

              {/* Order Meta Badges */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-0.5">
                {successOrder.orderType === 'takeaway' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs sm:text-sm font-black uppercase tracking-wide">
                    <ShoppingBag className="w-3.5 h-3.5" /> NA WYNOS
                  </span>
                ) : successOrder.orderType === 'dine_in' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/40 text-xs sm:text-sm font-black uppercase tracking-wide">
                    <Utensils className="w-3.5 h-3.5" /> NA MIEJSCU
                  </span>
                ) : null}

                {successOrder.tableLabel && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs sm:text-sm font-black">
                    <MapPin className="w-3.5 h-3.5" /> Stolik {successOrder.tableLabel}
                  </span>
                )}

                {successOrder.parkingSpot && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs sm:text-sm font-black">
                    <Car className="w-3.5 h-3.5" /> Parking {successOrder.parkingSpot}
                  </span>
                )}

                {successOrder.brandName && (
                  <span className="text-[11px] sm:text-xs font-bold text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded-lg border border-neutral-800">
                    {successOrder.brandName}
                  </span>
                )}
              </div>

              {successOrder.customerNote && (
                <div className="mt-2 text-xs font-bold text-amber-200 bg-amber-950/60 border border-amber-500/40 px-3 py-1 rounded-xl max-w-full truncate">
                  💬 {successOrder.customerNote}
                </div>
              )}
            </div>

            {/* CO WYDAĆ - Prominent Large Items List */}
            <div className="flex-1 flex flex-col min-h-0 my-2 sm:my-3">
              <div className="flex items-center justify-between pb-1.5 px-1 shrink-0">
                <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
                  📦 Co wydać ({successOrder.items?.length || 0}):
                </span>
                <span className="text-[11px] font-medium text-neutral-400">
                  Dotknij, aby odhaczyć
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 sm:space-y-2.5 pr-0.5">
                {(!successOrder.items || successOrder.items.length === 0) && (
                  <div className="p-4 rounded-2xl bg-neutral-900 text-center text-neutral-400 text-sm">
                    Brak szczegółów pozycji
                  </div>
                )}
                {successOrder.items?.map((item: any, idx: number) => {
                  const isChecked = checkedItems[idx];
                  const addonsList = Array.isArray(item.addons)
                    ? item.addons
                    : typeof item.addons === 'string'
                    ? (() => {
                        try {
                          return JSON.parse(item.addons);
                        } catch {
                          return [];
                        }
                      })()
                    : [];

                  return (
                    <div
                      key={idx}
                      onClick={() => toggleItemCheck(idx)}
                      className={`p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                        isChecked
                          ? 'bg-neutral-900/50 border-neutral-800 opacity-40 line-through'
                          : 'bg-neutral-900 border-neutral-700/80 hover:border-emerald-500/60 shadow-lg'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 sm:gap-3">
                        <span
                          className={`text-2xl sm:text-3xl font-black font-mono px-2.5 sm:px-3 py-1 rounded-xl min-w-[50px] sm:min-w-[56px] text-center shrink-0 border-2 transition-colors ${
                            isChecked
                              ? 'bg-neutral-800 text-neutral-500 border-neutral-700'
                              : 'bg-emerald-950 text-emerald-400 border-emerald-500/60 shadow-sm'
                          }`}
                        >
                          {item.quantity}x
                        </span>

                        <div className="flex-1 min-w-0">
                          <span
                            className={`text-lg sm:text-2xl font-black text-white leading-snug block break-words ${
                              isChecked ? 'text-neutral-400 line-through' : ''
                            }`}
                          >
                            {item.name}
                          </span>

                          {addonsList.length > 0 && (
                            <div className="flex flex-wrap gap-1 sm:gap-1.5 mt-1.5">
                              {addonsList.map((a: any, aIdx: number) => (
                                <span
                                  key={aIdx}
                                  className="text-xs sm:text-sm font-bold bg-amber-400/15 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-lg"
                                >
                                  + {typeof a === 'string' ? a : a.name || a.label}
                                </span>
                              ))}
                            </div>
                          )}

                          {item.specialInstructions && (
                            <div className="text-xs sm:text-sm font-bold text-amber-100 bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 rounded-xl mt-1.5 italic flex items-start gap-1.5">
                              <span className="not-italic">⚠️</span>
                              <span>„{item.specialInstructions}”</span>
                            </div>
                          )}
                        </div>

                        <div className="shrink-0 pt-0.5">
                          <div
                            className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                              isChecked
                                ? 'bg-emerald-500 border-emerald-500 text-neutral-950'
                                : 'border-neutral-600 bg-neutral-850 text-transparent'
                            }`}
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Next Order Action Button */}
            <button
              onClick={handleNextScan}
              className="w-full py-4 sm:py-4.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-neutral-950 font-black text-base sm:text-lg uppercase tracking-wider transition-all shadow-xl shadow-emerald-500/25 shrink-0 flex items-center justify-center gap-2 cursor-pointer mt-1"
            >
              <span>Następne zamówienie ➔</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between">
            {/* Mode Tabs: Camera vs PIN */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 bg-neutral-900 p-1 rounded-2xl border border-neutral-800 mb-3 sm:mb-4 shrink-0">
              <button
                onClick={() => setActiveTab('camera')}
                className={`py-2 sm:py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
                  activeTab === 'camera'
                    ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>Skaner QR (Aparat)</span>
              </button>

              <button
                onClick={() => setActiveTab('pin')}
                className={`py-2 sm:py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
                  activeTab === 'pin'
                    ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Klawiatura PIN</span>
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-3 p-2.5 sm:p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* TAB 1: Camera Scanner View */}
            {activeTab === 'camera' && (
              <div className="flex-1 flex flex-col relative rounded-3xl overflow-hidden bg-neutral-900 border border-neutral-800 min-h-[300px]">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover min-h-[280px]"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Viewfinder Overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                  <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-3xl border-2 border-emerald-400/80 border-dashed relative flex items-center justify-center shadow-2xl">
                    <div className="absolute -top-3 px-3 py-0.5 rounded-full bg-emerald-500 text-neutral-950 text-[10px] font-bold uppercase tracking-wider">
                      Nakieruj na kod QR
                    </div>
                    {loading && (
                      <div className="bg-neutral-900/80 p-4 rounded-2xl flex items-center gap-2 text-white text-xs backdrop-blur-sm">
                        <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                        <span>Weryfikacja...</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-4 sm:mt-6 bg-neutral-950/70 px-3.5 py-1 rounded-full backdrop-blur-sm">
                    Klient pokazuje kod na telefonie lub paragonie
                  </p>
                </div>

                {cameraError && (
                  <div className="absolute inset-0 bg-neutral-950/90 flex flex-col items-center justify-center p-6 text-center">
                    <AlertCircle className="w-10 h-10 text-amber-400 mb-2" />
                    <p className="text-xs text-neutral-300 max-w-xs mb-4">{cameraError}</p>
                    <button
                      onClick={() => setActiveTab('pin')}
                      className="px-4 py-2 rounded-xl bg-amber-500 text-neutral-950 font-bold text-xs cursor-pointer"
                    >
                      Wpisz PIN z klawiatury
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PIN Keypad View */}
            {activeTab === 'pin' && (
              <div className="flex-1 flex flex-col justify-between py-1">
                <div className="space-y-2.5 shrink-0">
                  {/* Optional Order Number */}
                  <div className="flex items-center justify-center gap-2">
                    <label className="text-xs text-neutral-400">Nr zamówienia (opcjonalnie):</label>
                    <input
                      type="number"
                      placeholder="np. 42"
                      value={orderNumberInput}
                      onChange={(e) => setOrderNumberInput(e.target.value)}
                      className="bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1 text-xs text-white w-24 text-center font-mono"
                    />
                  </div>

                  {/* 4-Digit Display */}
                  <div className="flex justify-center gap-2.5 sm:gap-3 py-2 sm:py-3">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className={`w-12 h-14 sm:w-14 sm:h-16 rounded-xl sm:rounded-2xl border-2 flex items-center justify-center text-xl sm:text-2xl font-bold font-mono transition-all ${
                          pin[idx]
                            ? 'border-amber-400 bg-amber-400/10 text-white'
                            : 'border-neutral-800 bg-neutral-900 text-neutral-600'
                        }`}
                      >
                        {pin[idx] || '—'}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Numeric Keypad */}
                <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      onClick={() => handleKeypadPress(digit)}
                      className="py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-750 active:scale-95 border border-neutral-800 text-lg sm:text-xl font-bold font-mono text-white transition-all cursor-pointer"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    onClick={() => setPin('')}
                    className="py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-neutral-900 hover:bg-neutral-800 active:scale-95 border border-neutral-800 text-neutral-400 hover:text-white font-bold text-xs transition-all cursor-pointer"
                  >
                    Wyczyść
                  </button>
                  <button
                    onClick={() => handleKeypadPress('0')}
                    className="py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-750 active:scale-95 border border-neutral-800 text-lg sm:text-xl font-bold font-mono text-white transition-all cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    onClick={handleBackspace}
                    className="py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-neutral-900 hover:bg-neutral-800 active:scale-95 border border-neutral-800 text-neutral-400 hover:text-white font-bold text-lg flex items-center justify-center transition-all cursor-pointer"
                  >
                    ⌫
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Pickups History */}
        {recentPickups.length > 0 && !successOrder && (
          <div className="mt-4 pt-3 border-t border-neutral-900">
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-2">
              <History className="w-3.5 h-3.5" />
              <span>Ostatnio wydane:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentPickups.map((p, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-[11px] font-mono text-neutral-300 flex items-center gap-1.5"
                >
                  <span className="font-bold text-emerald-400">#{p.orderNumber}</span>
                  <span className="text-neutral-500">{p.time}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PickupPage() {
  return (
    <TerminalGuard requiredRole="pickup" roleName="Skaner Wydań (Pickup)" roleIcon={<PackageCheck size={14} />}>
      {(terminal) => <PickupPageContent initialTerminal={terminal} />}
    </TerminalGuard>
  );
}
