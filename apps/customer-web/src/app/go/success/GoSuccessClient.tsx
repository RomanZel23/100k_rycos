'use client'

import React, { useEffect, useState } from 'react';
import { finalizeOnboarding, getOnboardingOrderInfo } from '@/lib/api';

export function GoSuccessClient({ orderToken }: { orderToken: string }) {
  // Step 1: Initializing / checking order
  // Step 2: Form to set password
  // Step 3: Activating & creating tenant / licenses
  // Step 4: Finished / Redirect ready
  const [stage, setStage] = useState<'loading' | 'set_password' | 'activating' | 'completed' | 'error'>('loading');
  const [orderInfo, setOrderInfo] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activatingStep, setActivatingStep] = useState<number>(1);

  // 1. Fetch order details on load
  useEffect(() => {
    if (!orderToken) {
      setErrorMsg('Brak identyfikatora zamówienia (order_token).');
      setStage('error');
      return;
    }

    let isMounted = true;

    async function loadInfo() {
      try {
        const info = await getOnboardingOrderInfo(orderToken);
        if (!isMounted) return;
        setOrderInfo(info);

        if (info.completed) {
          // Already completed previously, finalize to get token and redirect
          const finalized = await finalizeOnboarding(orderToken);
          setResult(finalized);
          setStage('completed');
          saveAuthCookie(finalized.token);
        } else {
          // Order is paid / pending, ask user for admin password
          setStage('set_password');
        }
      } catch (err: any) {
        if (!isMounted) return;
        // If orderInfo endpoint fails, allow setting password directly as fallback
        setStage('set_password');
      }
    }

    loadInfo();

    return () => {
      isMounted = false;
    };
  }, [orderToken]);

  const saveAuthCookie = (token: string) => {
    const domain = window.location.hostname.includes('rycos.eu') ? '.rycos.eu' : undefined;
    const cookieDomain = domain ? `; domain=${domain}` : '';
    document.cookie = `rycos_token=${token}; path=/${cookieDomain}; max-age=2592000; SameSite=Lax`;
  };

  // 2. Submit password and trigger finalization
  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg('Hasło administratora musi mieć minimum 6 znaków');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Hasła nie są identyczne');
      return;
    }

    setStage('activating');
    setActivatingStep(1); // Weryfikacja płatności Saferpay

    try {
      await new Promise((r) => setTimeout(r, 800));
      setActivatingStep(2); // Rejestracja w Portalu RYCOS i przydział licencji

      const data = await finalizeOnboarding(orderToken, password);

      setActivatingStep(3); // Utworzenie firmy i logowanie
      setResult(data);
      saveAuthCookie(data.token);
      setStage('completed');
    } catch (err: any) {
      setErrorMsg(err.message || 'Wystąpił błąd podczas aktywacji konta');
      setStage('set_password');
    }
  };

  const handleGoToAdmin = () => {
    const adminUrl = result?.redirect_to || 'https://100k-admin.rycos.eu/dashboard/licenses';
    window.location.href = adminUrl;
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-techbay-blue font-sans flex flex-col items-center justify-center p-4 selection:bg-brand selection:text-white">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200/90 bg-white p-8 text-center shadow-md space-y-6">
        {/* SolutionsBay Logo Header */}
        <div className="flex justify-center pb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/solutionsbay-logo.svg"
            alt="SolutionsBay"
            className="h-8 w-auto max-w-[180px] object-contain"
          />
        </div>

        {/* Step 3 Badge */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-600 border border-neutral-200 shadow-2xs">
          <span>Krok 3 z 3:</span>
          <span className="text-brand">Hasło dostępu & Aktywacja platformy</span>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* LOADING STAGE */}
        {/* ------------------------------------------------------------- */}
        {stage === 'loading' && (
          <div className="py-8 space-y-3">
            <div className="h-10 w-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin mx-auto" />
            <p className="text-sm text-neutral-500 font-medium">Sprawdzanie statusu płatności...</p>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* SET PASSWORD STAGE */}
        {/* ------------------------------------------------------------- */}
        {stage === 'set_password' && (
          <div className="space-y-5 text-left">
            <div className="text-center space-y-1">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 text-2xl">
                💳
              </div>
              <h1 className="text-2xl font-black tracking-tight text-techbay-blue">
                Płatność potwierdzona!
              </h1>
              <p className="text-xs text-neutral-500">
                Utwórz hasło administratora do panelu zarządczego <strong className="text-techbay-blue">100k-admin.rycos.eu</strong>
              </p>
            </div>

            {orderInfo && (
              <div className="bg-neutral-50 rounded-xl p-3.5 border border-neutral-200/80 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Firma:</span>
                  <strong className="text-techbay-blue font-bold">{orderInfo.company_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">NIP:</span>
                  <span className="font-mono font-bold text-techbay-blue">{orderInfo.nip}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Login (e-mail):</span>
                  <span className="font-medium text-techbay-blue">{orderInfo.email}</span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleActivate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-techbay-blue/80 mb-1.5">
                  Hasło administratora <span className="text-brand">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Minimum 6 znaków"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 pr-11 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition cursor-pointer"
                    title={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-techbay-blue/80 mb-1.5">
                  Powtórz hasło <span className="text-brand">*</span>
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Wpisz ponownie to samo hasło"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs font-medium"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-[#ED1C24] hover:bg-[#CC161D] active:bg-[#990E14] text-white py-3.5 text-sm font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <span>Aktywuj konto i przygotuj panel</span>
                <span>→</span>
              </button>
            </form>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* ACTIVATING STAGE (SPINNER & PROGRESS) */}
        {/* ------------------------------------------------------------- */}
        {stage === 'activating' && (
          <div className="space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 border border-brand-200 text-3xl animate-bounce">
              ⚡
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-tight text-techbay-blue">
                Tworzenie Twojej instancji...
              </h1>
              <p className="mt-1 text-xs text-neutral-500">
                Przydzielamy licencje serwerowe 100k-RYCOS oraz sloty terminali SBR
              </p>
            </div>

            <div className="space-y-3 text-left border-y border-neutral-100 py-5">
              <div className="flex items-center gap-3">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  activatingStep >= 1 ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-400'
                }`}>
                  {activatingStep > 1 ? '✓' : '1'}
                </span>
                <span className={`text-sm ${activatingStep === 1 ? 'font-bold text-techbay-blue' : 'text-neutral-500'}`}>
                  Weryfikacja płatności Saferpay
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  activatingStep >= 2 ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-400'
                }`}>
                  {activatingStep > 2 ? '✓' : '2'}
                </span>
                <span className={`text-sm ${activatingStep === 2 ? 'font-bold text-techbay-blue' : 'text-neutral-500'}`}>
                  Rejestracja NIP i slotów w Portalu Licencyjnym RYCOS
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  activatingStep === 3 ? 'bg-brand text-white' : 'bg-neutral-100 text-neutral-400'
                }`}>
                  {activatingStep === 3 ? '✓' : '3'}
                </span>
                <span className={`text-sm ${activatingStep === 3 ? 'font-bold text-techbay-blue' : 'text-neutral-500'}`}>
                  Utworzenie instancji firmy i konta administratora
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* COMPLETED STAGE (FINAL SUCCESS & REDIRECT CTA BUTTON) */}
        {/* ------------------------------------------------------------- */}
        {stage === 'completed' && (
          <div className="space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 text-3xl">
              🎉
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-techbay-blue">
                Pomyślnie aktywowano!
              </h1>
              <p className="mt-1 text-sm text-neutral-500">
                Twoje konto administratora i licencje są w pełni gotowe do pracy
              </p>
            </div>

            {result && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 space-y-1.5 text-left">
                <p className="font-bold text-sm text-emerald-900">
                  Witaj w 100k-RYCOS, {result.company_name}!
                </p>
                <p className="text-[12px] text-neutral-700">
                  Firma o NIP <strong className="font-mono text-techbay-blue">{result.nip}</strong> została zarejestrowana i połączona z portalem licencji.
                </p>
                <p className="text-[11px] text-neutral-500 pt-1">
                  Kliknij poniższy przycisk, aby przejść bezpośrednio do panelu zarządzania licencjami i stanowiskami.
                </p>
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={handleGoToAdmin}
                className="w-full rounded-xl bg-[#ED1C24] hover:bg-[#CC161D] active:bg-[#990E14] text-white py-4 text-base font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Przejdź do 100k-admin.rycos.eu</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* ERROR STAGE */}
        {/* ------------------------------------------------------------- */}
        {stage === 'error' && (
          <div className="space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 border border-red-200 text-2xl">
              ⚠️
            </div>
            <h2 className="text-lg font-bold text-techbay-blue">Wystąpił problem</h2>
            <p className="text-xs text-red-600">{errorMsg || 'Nieprawidłowe zamówienie'}</p>
            <a
              href="/go"
              className="inline-block px-5 py-2.5 rounded-xl border border-neutral-300 text-xs font-bold text-techbay-blue hover:bg-neutral-50 transition"
            >
              Wróć do sklepu
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
