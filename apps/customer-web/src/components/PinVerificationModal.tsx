'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, KeyRound, CheckCircle2, AlertCircle, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import jsQR from 'jsqr';
import { getApiBaseUrl } from '../lib/api';

interface PinVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (order: any) => void;
  targetOrder?: { id: string; orderNumber: number; collectionPin?: string } | null;
}

export function PinVerificationModal({
  isOpen,
  onClose,
  onSuccess,
  targetOrder,
}: PinVerificationModalProps) {
  const [activeTab, setActiveTab] = useState<'pin' | 'camera'>('pin');
  const [pin, setPin] = useState('');
  const [orderNumberInput, setOrderNumberInput] = useState(
    targetOrder ? String(targetOrder.orderNumber) : ''
  );
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setOrderNumberInput(targetOrder ? String(targetOrder.orderNumber) : '');
      setErrorMessage(null);
      setSuccessMessage(null);
      setLoading(false);
    } else {
      stopCamera();
    }
  }, [isOpen, targetOrder]);

  // Handle switching tabs
  useEffect(() => {
    if (isOpen && activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  // Sound effects via Web Audio API
  const playSound = (freq: number, type: OscillatorType, duration: number) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  };

  const playSuccessChime = () => {
    playSound(587.33, 'sine', 0.15); // D5
    setTimeout(() => playSound(880, 'sine', 0.3), 120); // A5
  };

  const playErrorBuzz = () => {
    playSound(220, 'sawtooth', 0.25);
  };

  const playKeyBeep = () => {
    playSound(800, 'sine', 0.05);
  };

  // Keyboard input listener
  useEffect(() => {
    if (!isOpen || activeTab !== 'pin') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading || successMessage) return;
      if (/^[0-9]$/.test(e.key)) {
        if (pin.length < 4) {
          playKeyBeep();
          setPin((prev) => prev + e.key);
          setErrorMessage(null);
        }
      } else if (e.key === 'Backspace') {
        playKeyBeep();
        setPin((prev) => prev.slice(0, -1));
        setErrorMessage(null);
      } else if (e.key === 'Enter') {
        if (pin.length === 4) {
          handleVerify(pin);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTab, pin, loading, successMessage]);

  // Stop Camera
  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Start Camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Twoja przeglądarka nie obsługuje dostępu do kamery.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // needed for iOS
        await videoRef.current.play();
        setCameraActive(true);
        scanQrLoop();
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(err.message || 'Brak uprawnień do kamery lub aparat niedostępny.');
      setCameraActive(false);
    }
  };

  // Scan QR Loop
  const scanQrLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanQrLoop);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code && code.data) {
      console.log('QR Code detected:', code.data);
      stopCamera();
      handleVerify(undefined, code.data);
      return;
    }

    animationFrameRef.current = requestAnimationFrame(scanQrLoop);
  };

  // Verify PIN / QR with Backend
  const handleVerify = async (enteredPin?: string, scannedQr?: string) => {
    const pinToSubmit = (enteredPin ?? pin).trim();
    if (!pinToSubmit && !scannedQr) {
      setErrorMessage('Wprowadź 4-cyfrowy PIN');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const payload: any = {
        pin: pinToSubmit,
        orderId: targetOrder?.id,
        orderNumber: targetOrder ? targetOrder.orderNumber : orderNumberInput ? Number(orderNumberInput) : undefined,
        qrData: scannedQr,
      };

      const res = await fetch(`${getApiBaseUrl()}/v1/admin/orders/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-company-id': '1',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || json.error || 'Nieprawidłowy PIN');
      }

      playSuccessChime();
      setSuccessMessage(json.message || 'Zamówienie wydane pomyślnie!');
      onSuccess(json.data);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      playErrorBuzz();
      setErrorMessage(err.message || 'Błąd weryfikacji PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleKeypadPress = (key: string) => {
    if (loading || successMessage) return;
    playKeyBeep();
    setErrorMessage(null);

    if (key === 'C') {
      setPin('');
    } else if (key === '⌫') {
      setPin((prev) => prev.slice(0, -1));
    } else if (key === '✓') {
      if (pin.length === 4) {
        handleVerify(pin);
      }
    } else {
      if (pin.length < 4) {
        const next = pin + key;
        setPin(next);
        if (next.length === 4) {
          // Auto submit on 4th digit
          setTimeout(() => handleVerify(next), 150);
        }
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 flex flex-col relative overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="text-center pb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-2 border border-amber-500/30">
            {activeTab === 'pin' ? <KeyRound size={24} /> : <Camera size={24} />}
          </div>
          <h2 className="text-lg font-black text-white tracking-tight">
            {targetOrder ? `Wydanie zamówienia #${targetOrder.orderNumber}` : 'Weryfikacja Odbioru'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {targetOrder
              ? 'Wpisz PIN klienta lub zeskanuj kod QR'
              : 'Wpisz PIN lub zeskanuj kod QR z telefonu klienta'}
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex bg-slate-800 p-1 rounded-xl mb-4 border border-slate-700/60">
          <button
            onClick={() => setActiveTab('pin')}
            className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'pin'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound size={14} />
            <span>Klawiatura PIN</span>
          </button>
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'camera'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera size={14} />
            <span>Skaner QR</span>
          </button>
        </div>

        {/* Success Overlay */}
        {successMessage && (
          <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-2xl p-6 text-center space-y-3 my-4 animate-in zoom-in-95 duration-200">
            <CheckCircle2 size={48} className="text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-base font-black text-white">{successMessage}</h3>
            <p className="text-xs text-emerald-300 font-medium">Status zamówienia: Wydano ✓</p>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && !successMessage && (
          <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 mb-3 animate-shake">
            <AlertCircle size={16} className="shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* TAB 1: PIN KEYPAD */}
        {activeTab === 'pin' && !successMessage && (
          <div className="space-y-4">
            {/* Optional order number if not pre-selected */}
            {!targetOrder && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">Nr zamówienia (opcjonalnie):</span>
                <input
                  type="number"
                  placeholder="np. 4"
                  value={orderNumberInput}
                  onChange={(e) => setOrderNumberInput(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white w-24 text-center font-bold"
                />
              </div>
            )}

            {/* PIN Dots / Display */}
            <div className="bg-slate-950 border-2 border-slate-800 rounded-2xl p-3 flex items-center justify-center gap-4">
              {[0, 1, 2, 3].map((idx) => {
                const digit = pin[idx];
                return (
                  <div
                    key={idx}
                    className={`w-12 h-14 rounded-xl flex items-center justify-center text-2xl font-mono font-black transition-all ${
                      digit
                        ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-300 scale-105'
                        : 'bg-slate-900 border border-slate-800 text-slate-600'
                    }`}
                  >
                    {digit || '•'}
                  </div>
                );
              })}
            </div>

            {/* Numeric Keypad (3x4) */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => {
                const isAction = key === 'C' || key === '⌫';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKeypadPress(key)}
                    disabled={loading}
                    className={`py-3.5 rounded-xl font-mono font-black text-lg transition-all active:scale-95 flex items-center justify-center ${
                      isAction
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-white shadow-sm border border-slate-700/50'
                    }`}
                  >
                    {key}
                  </button>
                );
              })}
            </div>

            {/* Submit Button */}
            <button
              onClick={() => handleVerify(pin)}
              disabled={pin.length !== 4 || loading}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black rounded-xl text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Weryfikacja...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>Zatwierdź PIN & Wydaj</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* TAB 2: CAMERA QR SCANNER */}
        {activeTab === 'camera' && !successMessage && (
          <div className="space-y-4">
            <div className="relative aspect-square w-full rounded-2xl bg-black overflow-hidden border-2 border-amber-500/50 flex items-center justify-center shadow-inner">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Viewfinder Target */}
              {cameraActive && (
                <div className="absolute inset-8 border-2 border-amber-400/80 rounded-2xl pointer-events-none flex flex-col justify-between p-2">
                  <div className="flex justify-between">
                    <span className="w-4 h-4 border-t-4 border-l-4 border-amber-400" />
                    <span className="w-4 h-4 border-t-4 border-r-4 border-amber-400" />
                  </div>
                  <div className="text-center text-[10px] font-bold text-amber-300/90 bg-slate-950/70 px-2 py-1 rounded-full mx-auto backdrop-blur-sm animate-pulse">
                    Skieruj aparat na kod QR klienta
                  </div>
                  <div className="flex justify-between">
                    <span className="w-4 h-4 border-b-4 border-l-4 border-amber-400" />
                    <span className="w-4 h-4 border-b-4 border-r-4 border-amber-400" />
                  </div>
                </div>
              )}

              {/* Camera Error or Not Active */}
              {!cameraActive && (
                <div className="p-6 text-center space-y-3">
                  {cameraError ? (
                    <>
                      <AlertCircle size={32} className="text-red-400 mx-auto" />
                      <p className="text-xs text-red-300">{cameraError}</p>
                      <button
                        onClick={startCamera}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg text-white inline-flex items-center gap-1.5"
                      >
                        <RefreshCw size={12} />
                        <span>Spróbuj ponownie</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <Loader2 size={32} className="text-amber-400 animate-spin mx-auto" />
                      <p className="text-xs text-slate-400">Uruchamianie aparatu...</p>
                    </>
                  )}
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Aparat automatycznie rozpozna kod QR i wyda zamówienie.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
