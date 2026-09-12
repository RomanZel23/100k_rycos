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
  History
} from 'lucide-react';
import jsQR from 'jsqr';
import { getApiBaseUrl } from '../../lib/api';

interface CompletedOrderLog {
  orderNumber: number;
  time: string;
  itemsCount?: number;
}

export default function PickupPage() {
  const [activeTab, setActiveTab] = useState<'camera' | 'pin'>('camera');
  const [pin, setPin] = useState('');
  const [orderNumberInput, setOrderNumberInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [recentPickups, setRecentPickups] = useState<CompletedOrderLog[]>([]);

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
      const payload = {
        pin: params.pin,
        orderNumber: params.orderNumber,
        qrData: params.qrData,
        companyId: 1,
      };

      // Try public verify-pin endpoint first, fallback to admin endpoint
      let res = await fetch(`${apiBase}/v1/orders/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        res = await fetch(`${apiBase}/v1/admin/orders/verify-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-company-id': '1' },
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
    if (activeTab === 'camera') {
      startCamera();
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col select-none">
      {/* Top Workstation Navigation Bar */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm">
            📦
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-tight">Wydawka Foodtruck</h1>
            <p className="text-[11px] text-neutral-400">Skaner odbioru zamówień</p>
          </div>
        </div>

        {/* Quick Mode Switcher for All-in-One Terminals */}
        <div className="flex items-center gap-1.5 bg-neutral-800/80 p-1 rounded-xl border border-neutral-700/60 text-xs">
          <Link
            href="/pos"
            className="px-2.5 py-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700/60 font-medium transition-colors"
          >
            💳 Kasa POS
          </Link>
          <Link
            href="/kds"
            className="px-2.5 py-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700/60 font-medium transition-colors"
          >
            🍳 KDS
          </Link>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold shadow-sm">
            📦 Wydawka
          </span>
        </div>

        {/* Audio Toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-2 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white"
          title={soundEnabled ? 'Dźwięk włączony' : 'Dźwięk wyciszony'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-neutral-500" />}
        </button>
      </header>

      {/* Main Action Area */}
      <main className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full">
        {/* Success Confirmation Overlay Card */}
        {successOrder ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center p-6 bg-emerald-950/40 border-2 border-emerald-500/80 rounded-3xl animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-12 h-12" />
            </div>

            <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
              Zamówienie Wydane!
            </span>
            <div className="text-5xl font-black text-white mt-1 mb-2 font-mono">
              #{successOrder.orderNumber}
            </div>

            {successOrder.items && successOrder.items.length > 0 && (
              <div className="w-full bg-neutral-900/90 rounded-2xl p-4 my-4 border border-neutral-800 text-left text-xs max-h-48 overflow-y-auto space-y-2">
                {successOrder.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-start border-b border-neutral-800 pb-1.5 last:border-0 last:pb-0">
                    <span className="font-semibold text-neutral-200">
                      {item.quantity}x {item.name}
                    </span>
                    {item.specialInstructions && (
                      <span className="text-[11px] text-amber-400 block">{item.specialInstructions}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleNextScan}
              className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-base transition-colors shadow-lg mt-2 flex items-center justify-center gap-2"
            >
              <span>Następne zamówienie ➔</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Mode Tabs: Camera vs PIN */}
            <div className="grid grid-cols-2 gap-2 bg-neutral-900 p-1 rounded-2xl border border-neutral-800 mb-4">
              <button
                onClick={() => setActiveTab('camera')}
                className={`py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
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
                className={`py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
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
              <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* TAB 1: Camera Scanner View */}
            {activeTab === 'camera' && (
              <div className="flex-1 flex flex-col relative rounded-3xl overflow-hidden bg-neutral-900 border border-neutral-800">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover min-h-[300px]"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Viewfinder Overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                  <div className="w-56 h-56 rounded-3xl border-2 border-emerald-400/80 border-dashed relative flex items-center justify-center shadow-2xl">
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
                  <p className="text-xs text-neutral-400 mt-6 bg-neutral-950/70 px-4 py-1.5 rounded-full backdrop-blur-sm">
                    Klient pokazuje kod na telefonie lub paragonie
                  </p>
                </div>

                {cameraError && (
                  <div className="absolute inset-0 bg-neutral-950/90 flex flex-col items-center justify-center p-6 text-center">
                    <AlertCircle className="w-10 h-10 text-amber-400 mb-2" />
                    <p className="text-xs text-neutral-300 max-w-xs mb-4">{cameraError}</p>
                    <button
                      onClick={() => setActiveTab('pin')}
                      className="px-4 py-2 rounded-xl bg-amber-500 text-neutral-950 font-bold text-xs"
                    >
                      Wpisz PIN z klawiatury
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PIN Keypad View */}
            {activeTab === 'pin' && (
              <div className="flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  {/* Optional Order Number */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-neutral-400">Nr zamówienia (opcjonalnie):</label>
                    <input
                      type="number"
                      placeholder="np. 42"
                      value={orderNumberInput}
                      onChange={(e) => setOrderNumberInput(e.target.value)}
                      className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white w-28 text-center font-mono"
                    />
                  </div>

                  {/* 4-Digit Display */}
                  <div className="flex justify-center gap-3 py-4">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className={`w-14 h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-bold font-mono transition-all ${
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
                <div className="grid grid-cols-3 gap-2.5 pt-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      onClick={() => handleKeypadPress(digit)}
                      className="py-4 rounded-2xl bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 border border-neutral-800 text-xl font-bold font-mono text-white transition-colors"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    onClick={() => setPin('')}
                    className="py-4 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-neutral-500 font-bold text-xs"
                  >
                    Wyczyść
                  </button>
                  <button
                    onClick={() => handleKeypadPress('0')}
                    className="py-4 rounded-2xl bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 border border-neutral-800 text-xl font-bold font-mono text-white transition-colors"
                  >
                    0
                  </button>
                  <button
                    onClick={handleBackspace}
                    className="py-4 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 font-bold text-lg flex items-center justify-center"
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
