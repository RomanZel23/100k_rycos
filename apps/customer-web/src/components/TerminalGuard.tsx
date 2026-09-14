'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldAlert, 
  KeyRound, 
  QrCode, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink,
  Monitor,
  ChefHat,
  PackageCheck,
  Lock
} from 'lucide-react';
import { getApiBaseUrl } from '../lib/api';

export interface PairedTerminal {
  id: number;
  terminal_id: string;
  name: string;
  role: string;
  company_id: number;
  location_id?: number | null;
  location_name?: string | null;
  assigned_brand_ids?: number[];
  status: string;
}

interface TerminalGuardProps {
  requiredRole?: 'pos' | 'kds' | 'pickup' | 'all_in_one';
  roleName: string;
  roleIcon?: React.ReactNode;
  children: (terminal: PairedTerminal) => React.ReactNode;
}

export function TerminalGuard({
  requiredRole = 'pos',
  roleName,
  roleIcon,
  children,
}: TerminalGuardProps) {
  const router = useRouter();
  const [terminal, setTerminal] = useState<PairedTerminal | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Quick pairing form state
  const [code, setCode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('rycos_terminal');
      if (stored) {
        const parsed: PairedTerminal = JSON.parse(stored);
        if (parsed && (parsed.terminal_id || parsed.id)) {
          setTerminal(parsed);
        }
      }
    } catch (err) {
      console.warn('Failed to parse rycos_terminal in TerminalGuard:', err);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError('Wpisz 8-znakowy kod stanowiska');
      return;
    }

    setClaiming(true);
    setError(null);

    try {
      const res = await fetch(`${getApiBaseUrl()}/v1/terminals/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || json.message || 'Nieprawidłowy kod stanowiska lub terminal wygasł');
      }

      const terminalData: PairedTerminal = json.data;
      localStorage.setItem('rycos_terminal', JSON.stringify(terminalData));
      setTerminal(terminalData);
    } catch (err: any) {
      setError(err.message || 'Błąd parowania stanowiska');
    } finally {
      setClaiming(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="h-[100dvh] w-screen bg-slate-950 text-slate-400 flex flex-col items-center justify-center space-y-3 font-sans select-none">
        <RefreshCw size={28} className="animate-spin text-amber-400" />
        <span className="text-sm font-extrabold text-slate-300">Weryfikacja autoryzacji stanowiska...</span>
      </div>
    );
  }

  // Not paired -> Show security lock screen
  if (!terminal) {
    return (
      <div className="min-h-[100dvh] w-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans select-none overflow-y-auto">
        <div className="w-full max-w-md bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header & Lock Icon */}
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <Lock size={32} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-wider mb-2">
                {roleIcon || <ShieldAlert size={14} />}
                <span>{roleName}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Wymagane sparowanie stanowiska
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                To urządzenie nie jest powiązane z żadnym stanowiskiem pracy w lokalu. Dostęp do tego modułu jest zastrzeżony dla pracowników.
              </p>
            </div>
          </div>

          {/* Quick Pair Form */}
          <form onSubmit={handleClaim} className="space-y-4 pt-1">
            {error && (
              <div className="bg-red-950/60 border border-red-500/40 rounded-2xl p-3.5 text-xs text-red-200 flex items-start gap-2.5 animate-in fade-in duration-150">
                <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                <span className="font-semibold">{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="guard-code" className="block text-xs font-black text-slate-300 uppercase tracking-wider">
                Wpisz 8-znakowy kod stanowiska
              </label>
              <div className="relative">
                <input
                  id="guard-code"
                  type="text"
                  maxLength={12}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="np. DFN8X499"
                  disabled={claiming}
                  autoFocus
                  className="w-full text-center tracking-widest font-mono text-xl sm:text-2xl font-black py-3.5 px-4 bg-slate-950 border-2 border-slate-700 rounded-2xl text-amber-400 placeholder:text-slate-700 focus:outline-hidden focus:border-amber-400 transition-colors uppercase disabled:opacity-50"
                />
              </div>
              <p className="text-[11px] text-slate-500 text-center">
                Kod wygenerujesz w panelu menadżera w zakładce <strong>Terminale & Stanowiska</strong>
              </p>
            </div>

            <button
              type="submit"
              disabled={claiming || !code.trim()}
              className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black rounded-2xl text-base flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 transition-all cursor-pointer min-h-[56px]"
            >
              {claiming ? (
                <>
                  <RefreshCw size={20} className="animate-spin" />
                  <span>Autoryzacja stanowiska...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={20} />
                  <span>Połącz i odblokuj dostęp</span>
                </>
              )}
            </button>
          </form>

          {/* Alternative: QR Code & Admin Panel */}
          <div className="pt-4 border-t border-slate-800/80 space-y-3">
            <button
              onClick={() => router.push(`/pair?target=${requiredRole}`)}
              className="w-full py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors border border-slate-700 cursor-pointer"
            >
              <QrCode size={16} className="text-amber-400" />
              <span>Zeskanuj kod QR aparatem (Ekran Parowania)</span>
            </button>

            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 pt-1">
              <span>Jesteś menadżerem?</span>
              <a
                href="https://admin.100k.rycos.eu/login"
                target="_blank"
                rel="noreferrer"
                className="text-amber-400 hover:text-amber-300 font-bold inline-flex items-center gap-1 hover:underline"
              >
                <span>Panel Admina</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Paired and authorized -> Render application view
  return <>{children(terminal)}</>;
}
