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
  capabilities?: {
    can_sell?: boolean;
    can_kds?: boolean;
    can_pickup?: boolean;
    has_softpos?: boolean;
    has_printer?: boolean;
  };
  status: string;
}

export const ROLE_INFO: Record<string, { label: string; icon: string; defaultPath: string }> = {
  all_in_one: { label: 'All-in-One Foodtruck Master', icon: '⚡', defaultPath: '/pos' },
  pos: { label: 'Kasa na Ladzie (POS)', icon: '🖥️', defaultPath: '/pos' },
  kds: { label: 'Kuchnia (KDS)', icon: '🍳', defaultPath: '/kds' },
  pickup: { label: 'Skaner Wydań (BYOD)', icon: '📱', defaultPath: '/pickup' },
  kiosk: { label: 'Kiosk Samoobsługowy', icon: '🛎️', defaultPath: '/pos' },
  fiscal_hub: { label: 'Hub Fiskalny', icon: '🏢', defaultPath: '/pos' },
};

export function canTerminalAccessRole(
  terminal: PairedTerminal,
  requiredRole?: 'pos' | 'kds' | 'pickup' | 'all_in_one'
): boolean {
  if (!requiredRole || requiredRole === 'all_in_one') return true;

  const role = terminal.role || 'all_in_one';
  const caps = terminal.capabilities;

  // Master All-in-One role has full access to all views
  if (role === 'all_in_one') return true;

  if (requiredRole === 'pos') {
    if (role === 'pos' || role === 'kiosk') return true;
    if (role === 'pickup' || role === 'kds' || role === 'fiscal_hub') return false;
    return Boolean(caps?.can_sell);
  }

  if (requiredRole === 'kds') {
    if (role === 'kds') return true;
    if (role === 'pickup' || role === 'kiosk' || role === 'fiscal_hub' || role === 'pos') return false;
    return Boolean(caps?.can_kds);
  }

  if (requiredRole === 'pickup') {
    // Pickup scanner, POS, and KDS can access pickup verification
    if (role === 'pickup' || role === 'pos' || role === 'kds') return true;
    return Boolean(caps?.can_pickup);
  }

  return false;
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

  const handleUnpair = () => {
    if (confirm('Czy na pewno chcesz rozłączyć to urządzenie?')) {
      localStorage.removeItem('rycos_terminal');
      setTerminal(null);
      setCode('');
      setError(null);
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

  // 1. Not paired -> Show security lock screen
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

  // 2. Paired, but role does NOT permit accessing this screen -> Show Role Mismatch Screen
  const hasAccess = canTerminalAccessRole(terminal, requiredRole);
  if (!hasAccess) {
    const currentMeta = ROLE_INFO[terminal.role] || { label: terminal.role, icon: '📱', defaultPath: '/pickup' };
    const targetUrl = currentMeta.defaultPath;

    return (
      <div className="min-h-[100dvh] w-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans select-none overflow-y-auto">
        <div className="w-full max-w-md bg-slate-900 border-2 border-red-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header & Lock Icon */}
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/10 border-2 border-red-500/30 text-red-400 flex items-center justify-center shadow-lg shadow-red-500/10">
              <ShieldAlert size={32} />
            </div>
            
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-black uppercase tracking-wider">
                <span>Brak uprawnień</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Moduł niedostępny
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                To urządzenie jest skonfigurowane jako <strong className="text-slate-200">{currentMeta.icon} {currentMeta.label}</strong> i nie ma uprawnień do modułu <strong className="text-amber-400">{roleName}</strong>.
              </p>
            </div>
          </div>

          {/* Device Profile Details Box */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Nazwa stanowiska:</span>
              <span className="font-bold text-white">{terminal.name}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Kod / ID urządzenia:</span>
              <span className="font-mono font-bold text-amber-400">{terminal.terminal_id}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Profil operacyjny:</span>
              <span className="font-semibold text-emerald-400">{currentMeta.icon} {currentMeta.label}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-1">
            <button
              onClick={() => router.push(targetUrl)}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black rounded-2xl text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/25 transition-all cursor-pointer min-h-[52px]"
            >
              <span>Przejdź do: {currentMeta.label}</span>
              <span>→</span>
            </button>

            <button
              onClick={handleUnpair}
              className="w-full py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors border border-slate-700 cursor-pointer"
            >
              <span>Rozłącz to urządzenie i sparuj z innym kodem</span>
            </button>
          </div>

          {/* Manager link */}
          <div className="pt-2 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-500">
              Aby zmienić rolę lub włączyć dodatkowe uprawnienia, przejdź do <a href="https://admin.100k.rycos.eu/login" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">Panelu Menadżera</a>.
            </p>
          </div>

        </div>
      </div>
    );
  }

  // 3. Paired and authorized -> Render application view
  return <>{children(terminal)}</>;
}
