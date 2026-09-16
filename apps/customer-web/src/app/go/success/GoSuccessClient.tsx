'use client'

import React, { useEffect, useState } from 'react';
import { finalizeOnboarding } from '@/lib/api';

export function GoSuccessClient({ orderToken }: { orderToken: string }) {
  const [statusStep, setStatusStep] = useState<number>(1);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!orderToken) {
      setErrorMsg('Brak identyfikatora zamówienia (order_token).');
      return;
    }

    let isMounted = true;

    async function runFinalize() {
      try {
        if (isMounted) setStatusStep(1); // Weryfikacja płatności
        await new Promise((r) => setTimeout(r, 1000));

        if (isMounted) setStatusStep(2); // Tworzenie firmy i licencji w portalu RYCOS

        const data = await finalizeOnboarding(orderToken);

        if (isMounted) {
          setStatusStep(3); // Gotowe!
          setResult(data);

          // Save auth token in cookie for admin-web or redirect
          const domain = window.location.hostname.includes('rycos.eu') ? '.rycos.eu' : undefined;
          const cookieDomain = domain ? `; domain=${domain}` : '';
          document.cookie = `rycos_token=${data.token}; path=/${cookieDomain}; max-age=2592000; SameSite=Lax`;

          // Automatic redirect after 3 seconds
          setTimeout(() => {
            const adminUrl = data.redirect_to || 'https://100k-admin.rycos.eu/dashboard/licenses';
            window.location.href = adminUrl;
          }, 3000);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err.message || 'Wystąpił błąd podczas finalizacji zamówienia.');
        }
      }
    }

    runFinalize();

    return () => {
      isMounted = false;
    };
  }, [orderToken]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-neutral-900/90 p-8 text-center backdrop-blur-md shadow-2xl space-y-6">
        {/* Header Icon */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand/10 border border-brand/30 text-4xl">
          {errorMsg ? '⚠️' : statusStep === 3 ? '🎉' : '⚡'}
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            {errorMsg ? 'Wymaga uwagi' : statusStep === 3 ? 'Pomyślnie aktywowano!' : 'Finalizacja Twojego konta'}
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            {errorMsg ? 'Nie udało się zakończyć automatycznego procesu' : 'Przygotowujemy Twoją instancję 100k-RYCOS i licencje SBR'}
          </p>
        </div>

        {/* Progress Steps */}
        {!errorMsg && (
          <div className="space-y-3 text-left border-y border-white/10 py-5">
            <div className="flex items-center gap-3">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                statusStep >= 1 ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-400'
              }`}>
                {statusStep > 1 ? '✓' : '1'}
              </span>
              <span className={`text-sm ${statusStep === 1 ? 'font-bold text-white' : 'text-neutral-400'}`}>
                Weryfikacja płatności Saferpay
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                statusStep >= 2 ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-400'
              }`}>
                {statusStep > 2 ? '✓' : '2'}
              </span>
              <span className={`text-sm ${statusStep === 2 ? 'font-bold text-white' : 'text-neutral-400'}`}>
                Rejestracja NIP i slotów w Portalu Licencyjnym RYCOS
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                statusStep === 3 ? 'bg-brand text-black' : 'bg-neutral-800 text-neutral-400'
              }`}>
                {statusStep === 3 ? '✓' : '3'}
              </span>
              <span className={`text-sm ${statusStep === 3 ? 'font-bold text-white' : 'text-neutral-400'}`}>
                Utworzenie instancji firmy i konta administratora
              </span>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400 text-left space-y-1">
            <p className="font-bold">Komunikat błędu:</p>
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Success Card */}
        {result && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300 space-y-2">
            <p className="font-bold text-sm text-emerald-200">
              Witaj w 100k-RYCOS, {result.company_name}!
            </p>
            <p className="text-[11px] text-neutral-300">
              Firma o NIP <strong className="font-mono">{result.nip}</strong> została zarejestrowana i połączona z portalem licencji.
            </p>
            <p className="text-[11px] text-neutral-400 pt-1">
              Za chwilę nastąpi automatyczne przekierowanie do panelu administracyjnego...
            </p>
          </div>
        )}

        {/* CTA Button */}
        <div>
          {result ? (
            <a
              href={result.redirect_to || 'https://100k-admin.rycos.eu/dashboard/licenses'}
              className="w-full inline-block rounded-xl bg-brand py-3 text-sm font-black text-black hover:bg-brand-light transition shadow-lg shadow-brand/20"
            >
              Przejdź do panelu 100k-admin →
            </a>
          ) : errorMsg ? (
            <a
              href="/go"
              className="w-full inline-block rounded-xl border border-white/20 bg-neutral-800 py-3 text-sm font-bold text-white hover:bg-neutral-700 transition"
            >
              Wróć do sklepu
            </a>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-neutral-400">
              <span className="h-2 w-2 rounded-full bg-brand animate-ping" />
              <span>Przetwarzanie zamówienia... Proszę nie zamykać okna</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
