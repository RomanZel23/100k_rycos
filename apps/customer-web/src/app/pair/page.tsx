'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Smartphone, CheckCircle2, AlertCircle, ArrowRight, RefreshCw, QrCode, Monitor, ChefHat, PackageCheck } from 'lucide-react';
import { getApiBaseUrl } from '../../lib/api';

interface PairedTerminal {
  id: number;
  terminal_id: string;
  name: string;
  role: string;
  location_id?: number | null;
  location_name?: string | null;
  tap_device_id?: string | null;
  printer_device_id?: string | null;
  fiscal_device_id?: string | null;
  status: string;
}

function PairContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const codeParam = searchParams.get('code') || searchParams.get('pair') || '';
  const [code, setCode] = useState(codeParam.toUpperCase());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairedTerminal, setPairedTerminal] = useState<PairedTerminal | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const roleRedirectMap: Record<string, { path: string; label: string; icon: React.ReactNode }> = {
    all_in_one: { path: '/pos', label: 'All-in-One Kasa & Wydawka', icon: <Monitor size={20} className="text-amber-400" /> },
    pos: { path: '/pos', label: 'Kasa Kelnerska (POS)', icon: <Monitor size={20} className="text-blue-400" /> },
    kds: { path: '/kds', label: 'Kuchnia (KDS)', icon: <ChefHat size={20} className="text-orange-400" /> },
    pickup: { path: '/pickup', label: 'Skaner Wydań (Pickup)', icon: <PackageCheck size={20} className="text-emerald-400" /> },
  };

  const handleClaim = async (claimCode: string) => {
    const cleanCode = claimCode.trim().toUpperCase();
    if (!cleanCode) {
      setError('Podaj 8-znakowy kod stanowiska');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/v1/terminals/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || json.message || 'Nie udało się sparować stanowiska. Sprawdź poprawność kodu.');
      }

      const terminalData: PairedTerminal = json.data;

      // Persist in localStorage
      localStorage.setItem('rycos_terminal', JSON.stringify(terminalData));
      setPairedTerminal(terminalData);

      // Start redirect countdown
      setCountdown(2);
    } catch (err: any) {
      setError(err.message || 'Wystąpił błąd podczas parowania');
    } finally {
      setLoading(false);
    }
  };

  // Auto-claim if code is in query parameter on initial load
  useEffect(() => {
    if (codeParam) {
      handleClaim(codeParam);
    }
  }, [codeParam]);

  // Countdown timer effect
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0 && pairedTerminal) {
      const target = roleRedirectMap[pairedTerminal.role]?.path || '/pos';
      router.push(target);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, pairedTerminal, router]);

  const targetMeta = pairedTerminal ? (roleRedirectMap[pairedTerminal.role] || roleRedirectMap.pos) : null;

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shadow-inner">
            <Smartphone size={28} />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Parowanie Stanowiska
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Połącz ten telefon lub tablet z systemem lokalu
          </p>
        </div>

        {/* Success State */}
        {pairedTerminal && targetMeta ? (
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-5 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 size={28} />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                Połączono pomyślnie!
              </span>
              <h2 className="text-lg font-black text-white">{pairedTerminal.name}</h2>
              <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-slate-300">
                {targetMeta.icon}
                <span className="font-semibold">{targetMeta.label}</span>
              </div>
              <div className="pt-2 text-xs font-mono text-slate-400">
                ID: <span className="text-amber-400 font-bold">{pairedTerminal.terminal_id}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => router.push(targetMeta.path)}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <span>Otwórz stanowisko pracy</span>
                {countdown !== null && <span>({countdown}s)</span>}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ) : (
          /* Form State */
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleClaim(code);
            }}
            className="space-y-4"
          >
            {error && (
              <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-300 flex items-start gap-2.5">
                <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="code" className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Wpisz 8-znakowy kod z ekranu
              </label>
              <div className="relative">
                <input
                  id="code"
                  type="text"
                  maxLength={12}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="np. DFN8X499"
                  disabled={loading}
                  className="w-full text-center tracking-widest font-mono text-xl sm:text-2xl font-black py-3.5 px-4 bg-slate-950 border border-slate-700 rounded-2xl text-amber-400 placeholder:text-slate-600 focus:outline-hidden focus:border-amber-400 transition-colors uppercase disabled:opacity-50"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-500 text-center">
                Kod znajdziesz w panelu kierownika w zakładce <em>Stanowiska robocze</em>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black rounded-2xl text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Łączenie stanowiska...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>Zatwierdź i połącz</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Info & Footer */}
        <div className="pt-4 border-t border-slate-800/80 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <QrCode size={14} />
            <span>Lub zeskanuj kod QR aparatem telefonu</span>
          </div>
          <p className="text-[11px] text-slate-600">
            100k-RYCOS Workstation Gateway · Bezpieczne połączenie BYOD
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PairPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-screen bg-slate-950 text-slate-400 flex items-center justify-center font-bold text-sm">
          Ładowanie konfiguracji parowania...
        </div>
      }
    >
      <PairContent />
    </Suspense>
  );
}
