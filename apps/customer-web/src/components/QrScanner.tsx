'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, CameraOff, RefreshCw, Zap, ZapOff } from 'lucide-react';

interface QrScannerProps {
  open: boolean;
  onResult: (text: string) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
}

/**
 * Full-screen camera QR scanner (used for pairing a station and anywhere a code is scanned).
 * Uses the native BarcodeDetector when the browser has it, otherwise falls back to jsQR.
 * The camera needs HTTPS (or localhost) — on plain http the browser hides it entirely.
 */
export function QrScanner({ open, onResult, onClose, title = 'Zeskanuj kod QR', hint }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const stop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const finish = useCallback((text: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    stop();
    onResult(text);
  }, [onResult, stop]);

  const start = useCallback(async () => {
    setError(null);
    doneRef.current = false;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(
        typeof window !== 'undefined' && !window.isSecureContext
          ? 'Kamera wymaga połączenia HTTPS. Otwórz stronę przez https:// albo wpisz kod ręcznie.'
          : 'Ta przeglądarka nie udostępnia kamery. Wpisz kod ręcznie.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const caps: any = track?.getCapabilities?.() ?? {};
      setTorchAvailable(!!caps.torch);

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      await video.play();

      const Detector = (window as any).BarcodeDetector;
      const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;

      const tick = async () => {
        if (doneRef.current || !videoRef.current) return;
        const v = videoRef.current;
        if (v.readyState === v.HAVE_ENOUGH_DATA) {
          try {
            if (detector) {
              const codes = await detector.detect(v);
              if (codes?.length && codes[0].rawValue) return finish(String(codes[0].rawValue));
            } else {
              const canvas = canvasRef.current;
              const ctx = canvas?.getContext('2d', { willReadFrequently: true });
              if (canvas && ctx) {
                canvas.width = v.videoWidth;
                canvas.height = v.videoHeight;
                ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' });
                if (code?.data) return finish(code.data);
              }
            }
          } catch {
            // a single failed frame is not fatal — keep scanning
          }
        }
        rafRef.current = requestAnimationFrame(() => { void tick(); });
      };
      rafRef.current = requestAnimationFrame(() => { void tick(); });
    } catch (err: any) {
      console.error('[QrScanner]', err);
      const name = err?.name || '';
      setError(
        name === 'NotAllowedError'
          ? 'Brak zgody na kamerę. Zezwól na dostęp w ustawieniach przeglądarki i spróbuj ponownie.'
          : name === 'NotFoundError'
          ? 'Nie znaleziono kamery w tym urządzeniu. Wpisz kod ręcznie.'
          : 'Nie udało się uruchomić kamery. Wpisz kod ręcznie.'
      );
    }
  }, [finish]);

  useEffect(() => {
    if (open) void start();
    return () => stop();
  }, [open, start, stop]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] } as any);
      setTorchOn((v) => !v);
    } catch {
      setTorchAvailable(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-slate-100 shrink-0">
        <span className="font-black text-sm">{title}</span>
        <div className="flex items-center gap-2">
          {torchAvailable && (
            <button onClick={toggleTorch} aria-label="Latarka" className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-300">
              {torchOn ? <ZapOff size={18} /> : <Zap size={18} />}
            </button>
          )}
          <button onClick={() => { stop(); onClose(); }} aria-label="Zamknij skaner" className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />
        {!error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 max-w-[70vw] max-h-[70vw] rounded-3xl border-4 border-amber-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.55)]" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <CameraOff size={40} className="text-red-400" />
            <p className="text-slate-200 text-sm font-semibold max-w-xs leading-relaxed">{error}</p>
            <div className="flex gap-2">
              <button onClick={() => void start()} className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-100 text-sm font-bold flex items-center gap-2">
                <RefreshCw size={16} /> Spróbuj ponownie
              </button>
              <button onClick={() => { stop(); onClose(); }} className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-sm font-black">
                Wpisz kod ręcznie
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="px-6 py-4 text-center text-xs text-slate-400 shrink-0">
        {hint || 'Skieruj aparat na kod QR stanowiska z panelu administracyjnego.'}
      </p>
    </div>
  );
}

/** Pairing QR may contain the raw code or a full /pair?code=XXXX link. */
export function extractPairingCode(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    const param = url.searchParams.get('code') || url.searchParams.get('pair');
    if (param) return param.trim().toUpperCase();
    const last = url.pathname.split('/').filter(Boolean).pop() || '';
    return last.trim().toUpperCase();
  } catch {
    return text.replace(/\s+/g, '').toUpperCase();
  }
}
