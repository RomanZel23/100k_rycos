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
    <div className="min-h-screen bg-neutral-50 text-techbay-blue font-sans flex flex-col items-center justify-center p-4 selection:bg-brand selection:text-white">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200/90 bg-white p-8 text-center shadow-md space-y-6">
        {/* SolutionsBay Logo Header */}
        <div className="flex justify-center pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/solutionsbay-logo.svg"
            alt="SolutionsBay"
            className="h-8 w-auto max-w-[180px] object-contain"
          />
        </div>

        {/* Status Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 border border-brand-200 text-3xl">
          {errorMsg ? '⚠️' : statusStep === 3 ? '🎉' : '⚡'}
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-techbay-blue">
            {errorMsg ? 'Wymaga uwagi' : statusStep === 3 ? 'Pomyślnie aktywowano!' : 'Finalizacja Twojego konta'}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {errorMsg ? 'Nie udało się zakończyć automatycznego procesu' : 'Przygotowujemy Twoją instancję 100k-RYCOS i licencje SBR'}
          </p>
        </div>

        {/* Progress Steps */}
        {!errorMsg && (
          <div className="space-y-3 text-left border-y border-neutral-100 py-5">
            <div className="flex items-center gap-3">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                statusStep >= 1 ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-400'
              }`}>
                {statusStep > 1 ? '✓' : '1'}
              </span>
              <span className={`text-sm ${statusStep === 1 ? 'font-bold text-techbay-blue' : 'text-neutral-500'}`}>
                Weryfikacja płatności Saferpay
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                statusStep >= 2 ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-400'
              }`}>
                {statusStep > 2 ? '✓' : '2'}
              </span>
              <span className={`text-sm ${statusStep === 2 ? 'font-bold text-techbay-blue' : 'text-neutral-500'}`}>
                Rejestracja NIP i slotów w Portalu Licencyjnym RYCOS
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                statusStep === 3 ? 'bg-brand text-white' : 'bg-neutral-100 text-neutral-400'
              }`}>
                {statusStep === 3 ? '✓' : '3'}
              </span>
              <span className={`text-sm ${statusStep === 3 ? 'font-bold text-techbay-blue' : 'text-neutral-500'}`}>
                Utworzenie instancji firmy i konta administratora
              </span>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 text-left space-y-1">
            <p className="font-bold">Komunikat błędu:</p>
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Success Card */}
        {result && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 space-y-1.5 text-left">
            <p className="font-bold text-sm text-emerald-900">
              Witaj w 100k-RYCOS, {result.company_name}!
            </p>
            <p className="text-[12px] text-neutral-700">
              Firma o NIP <strong className="font-mono text-techbay-blue">{result.nip}</strong> została zarejestrowana i połączona z portalem licencji.
            </p>
            <p className="text-[11px] text-neutral-500 pt-1">
              Za chwilę nastąpi automatyczne przekierowanie do panelu administracyjnego...
            </p>
          </div>
        )}

        {/* CTA Button */}
        <div>
          {result ? (
            <a
              href={result.redirect_to || 'https://100k-admin.rycos.eu/dashboard/licenses'}
              className="w-full inline-block rounded-xl bg-[#ED1C24] hover:bg-[#CC161D] py-3.5 text-sm font-bold text-white transition shadow-md hover:shadow-lg"
            >
              Przejdź do panelu 100k-admin →
            </a>
          ) : errorMsg ? (
            <a
              href="/go"
              className="w-full inline-block rounded-xl border border-neutral-300 bg-white py-3 text-sm font-bold text-techbay-blue hover:bg-neutral-50 transition shadow-xs"
            >
              Wróć do sklepu
            </a>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
              <span className="h-2 w-2 rounded-full bg-brand animate-ping" />
              <span>Przetwarzanie zamówienia... Proszę nie zamykać okna</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
