'use client'

import React, { useState, useMemo } from 'react';
import { checkoutOnboarding, lookupGus } from '@/lib/api';

interface PricingItem {
  itemKey: string;
  title: string;
  description: string;
  monthlyPricePln: number;
  discount6mPercent: number;
  discount12mPercent: number;
}

interface GoStoreClientProps {
  initialPricing: {
    items: PricingItem[];
    discounts: Record<string, number>;
    vat_rate: number;
    currency: string;
  };
}

export function GoStoreClient({ initialPricing }: GoStoreClientProps) {
  // Navigation step: 1 = Configuration & GUS Registration, 2 = Payment Review & Saferpay
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Configuration
  const [months, setMonths] = useState<number>(1);
  const [platform100k, setPlatform100k] = useState<boolean>(true);
  const [seatsPf, setSeatsPf] = useState<number>(1);
  const [seatsF, setSeatsF] = useState<number>(0);
  const [seatsP, setSeatsP] = useState<number>(0);
  const [seats0, setSeats0] = useState<number>(0);

  // Buyer details
  const [nip, setNip] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // GUS lookup state
  const [gusLoading, setGusLoading] = useState(false);
  const [gusSuccess, setGusSuccess] = useState(false);
  const [gusNotice, setGusNotice] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const priceMap = useMemo(() => {
    return new Map((initialPricing.items || []).map((p) => [p.itemKey, p.monthlyPricePln]));
  }, [initialPricing]);

  const p100kPrice = priceMap.get('platform_100k') ?? 199;
  const pfPrice = priceMap.get('rycos_pf') ?? 89;
  const fPrice = priceMap.get('rycos_f') ?? 49;
  const pPrice = priceMap.get('rycos_p') ?? 39;
  const zeroPrice = priceMap.get('rycos_0') ?? 19;

  const discountPercent = months === 12 ? 20 : months === 6 ? 10 : 0;

  const baseMonthlyNet = useMemo(() => {
    let total = 0;
    if (platform100k) total += p100kPrice;
    total += seatsPf * pfPrice;
    total += seatsF * fPrice;
    total += seatsP * pPrice;
    total += seats0 * zeroPrice;
    return total;
  }, [platform100k, seatsPf, seatsF, seatsP, seats0, p100kPrice, pfPrice, fPrice, pPrice, zeroPrice]);

  const totalNetBeforeDiscount = baseMonthlyNet * months;
  const totalNetPln = Math.round(totalNetBeforeDiscount * (1 - discountPercent / 100));
  const savingsPln = totalNetBeforeDiscount - totalNetPln;
  const vatPln = Math.round(totalNetPln * 0.23);
  const totalGrossPln = totalNetPln + vatPln;

  // Handle GUS lookup
  const handleGusLookup = async (nipToSearch?: string) => {
    const rawNip = nipToSearch || nip;
    const cleanNip = rawNip.replace(/^PL/i, '').replace(/[^0-9]/g, '');
    if (cleanNip.length !== 10) {
      setGusNotice('Podaj poprawny 10-cyfrowy NIP, aby pobrać dane z GUS');
      return;
    }

    setGusLoading(true);
    setGusNotice(null);
    setGusSuccess(false);

    try {
      const data = await lookupGus(cleanNip);
      if (data && data.name) {
        setCompanyName(data.name);
        if (data.formattedAddress) {
          setAddress(data.formattedAddress);
        }
        setGusSuccess(true);
        setGusNotice(`Dane pobrane z bazy GUS (REGON: ${data.regon})`);
      }
    } catch (err: any) {
      setGusNotice(err.message || 'Nie udało się pobrać danych z GUS. Możesz wpisać je ręcznie.');
      setGusSuccess(false);
    } finally {
      setGusLoading(false);
    }
  };

  // Auto lookup when user finishes typing 10 digits
  const handleNipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNip(val);
    const digits = val.replace(/^PL/i, '').replace(/[^0-9]/g, '');
    if (digits.length === 10 && !companyName) {
      handleGusLookup(digits);
    }
  };

  // Validation before going to Step 2
  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanNip = nip.replace(/^PL/i, '').replace(/[^0-9]/g, '');
    if (cleanNip.length !== 10) {
      setErrorMsg('Wpisz poprawny 10-cyfrowy NIP firmy');
      return;
    }
    if (!companyName.trim()) {
      setErrorMsg('Podaj nazwę firmy (lub pobierz automatycznie z GUS)');
      return;
    }
    if (!email.includes('@')) {
      setErrorMsg('Podaj poprawny adres e-mail do faktury i kontaktu');
      return;
    }
    if (!platform100k && seatsPf === 0 && seatsF === 0 && seatsP === 0 && seats0 === 0) {
      setErrorMsg('Wybierz przynajmniej jeden pakiet lub stanowisko');
      return;
    }

    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Submit payment on Step 2
  const handleExecutePayment = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      const cleanNip = nip.replace(/^PL/i, '').replace(/[^0-9]/g, '');
      const res = await checkoutOnboarding({
        nip: cleanNip,
        company_name: companyName,
        email,
        phone,
        address,
        months,
        plan: {
          platform_100k: platform100k,
          seats_pf: seatsPf,
          seats_f: seatsF,
          seats_p: seatsP,
          seats_0: seats0,
        },
      });

      if (res.redirect_url) {
        window.location.href = res.redirect_url;
      } else {
        throw new Error('Brak adresu przekierowania do płatności');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Wystąpił błąd podczas składania zamówienia');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-techbay-blue font-sans selection:bg-brand selection:text-white">
      {/* Top Header */}
      <header className="border-b border-neutral-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className="mx-auto max-w-6xl px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/solutionsbay-logo.svg"
              alt="SolutionsBay"
              className="h-8 w-auto max-w-[180px] object-contain"
            />
            <div className="hidden sm:flex items-center gap-2 border-l border-neutral-200 pl-3">
              <span className="text-xs font-bold tracking-wider uppercase text-neutral-400">
                100k-<span className="text-brand">RYCOS</span>
              </span>
              <span className="rounded-full bg-brand-50 text-brand text-[10px] font-bold px-2 py-0.5 border border-brand-200">
                Sklep & Onboarding
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="hidden md:inline text-neutral-500">
              Dostarczane przez <strong className="text-techbay-blue font-semibold">SolutionsBay</strong>
            </span>
            <a
              href="https://100k-admin.rycos.eu/login"
              className="font-semibold text-brand hover:text-brand-600 transition flex items-center gap-1"
            >
              <span>Logowanie do panelu</span>
              <span>→</span>
            </a>
          </div>
        </div>
      </header>

      {/* Step Indicator Bar */}
      <div className="bg-white border-b border-neutral-200/80 shadow-2xs">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center justify-center gap-2 sm:gap-6 text-xs font-bold">
            <div
              onClick={() => setCurrentStep(1)}
              className={`flex items-center gap-2 cursor-pointer transition ${
                currentStep === 1 ? 'text-brand' : 'text-neutral-500 hover:text-techbay-blue'
              }`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                currentStep === 1 ? 'bg-brand text-white shadow-xs' : 'bg-neutral-100 text-neutral-600'
              }`}>
                1
              </span>
              <span>1. Konfiguracja & Dane z GUS</span>
            </div>

            <div className="w-8 sm:w-12 h-0.5 bg-neutral-200" />

            <div
              className={`flex items-center gap-2 transition ${
                currentStep === 2 ? 'text-brand font-black' : 'text-neutral-400'
              }`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                currentStep === 2 ? 'bg-brand text-white shadow-xs' : 'bg-neutral-100 text-neutral-400'
              }`}>
                2
              </span>
              <span>2. Płatność Saferpay</span>
            </div>

            <div className="w-8 sm:w-12 h-0.5 bg-neutral-200" />

            <div className="flex items-center gap-2 text-neutral-400">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 text-xs font-black">
                3
              </span>
              <span className="hidden sm:inline">3. Hasło & Panel Admina</span>
              <span className="sm:hidden">3. Aktywacja</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* EKRAN 1: OPIS SYSTEMU, KONFIGURACJA PAKIETU & DANE FIRMY Z GUS */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <>
          {/* Hero Section */}
          <section className="mx-auto max-w-6xl px-4 pt-8 pb-6 text-center space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-600 border border-neutral-200 shadow-xs mb-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Krok 1 z 3: Natychmiastowa aktywacja i licencjonowanie online
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-techbay-blue">
              Wybierz pakiet <span className="text-brand">100k-RYCOS</span> i terminale SBR
            </h1>
            <p className="mx-auto max-w-2xl text-sm sm:text-base text-neutral-600 leading-relaxed">
              Błyskawiczna aktywacja platformy obsługującej 100 000 zamówień/minutę, wirtualnych kas fiskalnych online oraz płatności zbliżeniowych SoftPOS.
            </p>
          </section>

          <main className="mx-auto max-w-6xl px-4 pb-20">
            <form onSubmit={handleProceedToPayment} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Configuration & Form (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                {/* 1. Period Selector */}
                <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                    <h2 className="text-lg font-bold text-techbay-blue flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-techbay-blue text-xs font-bold text-white">
                        1
                      </span>
                      Okres subskrypcji
                    </h2>
                    <span className="text-xs text-neutral-400 font-medium">Wybierz czas trwania</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setMonths(1)}
                      className={`rounded-xl border p-4 text-center transition cursor-pointer ${
                        months === 1
                          ? 'border-brand bg-brand-50/70 text-techbay-blue font-bold ring-2 ring-brand/30 shadow-xs'
                          : 'border-neutral-200 bg-neutral-50/40 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50'
                      }`}
                    >
                      <div className="text-sm font-bold text-techbay-blue">1 miesiąc</div>
                      <div className="text-xs text-neutral-500 mt-1">Standard</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMonths(6)}
                      className={`relative rounded-xl border p-4 text-center transition cursor-pointer ${
                        months === 6
                          ? 'border-brand bg-brand-50/70 text-techbay-blue font-bold ring-2 ring-brand/30 shadow-xs'
                          : 'border-neutral-200 bg-neutral-50/40 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50'
                      }`}
                    >
                      <span className="absolute -top-2.5 right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        -10%
                      </span>
                      <div className="text-sm font-bold text-techbay-blue">6 miesięcy</div>
                      <div className="text-xs text-emerald-600 font-medium mt-1">Oszczędzasz 10%</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMonths(12)}
                      className={`relative rounded-xl border p-4 text-center transition cursor-pointer ${
                        months === 12
                          ? 'border-brand bg-brand-50/70 text-techbay-blue font-bold ring-2 ring-brand/30 shadow-xs'
                          : 'border-neutral-200 bg-neutral-50/40 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50'
                      }`}
                    >
                      <span className="absolute -top-2.5 right-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        -20%
                      </span>
                      <div className="text-sm font-bold text-techbay-blue">12 miesięcy</div>
                      <div className="text-xs text-brand font-medium mt-1">2 m-ce gratis</div>
                    </button>
                  </div>
                </div>

                {/* 2. Platform & Devices Selector */}
                <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-sm space-y-5">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                    <h2 className="text-lg font-bold text-techbay-blue flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-techbay-blue text-xs font-bold text-white">
                        2
                      </span>
                      Pakiety i Urządzenia SBR
                    </h2>
                    <span className="text-xs text-neutral-400 font-medium">Ceny netto / mc</span>
                  </div>

                  {/* Platform 100k switch */}
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 flex items-center justify-between gap-4 transition hover:border-neutral-300">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-techbay-blue text-sm sm:text-base">Silnik Platformy 100k-RYCOS</span>
                        <span className="rounded-full bg-brand-50 text-brand text-[10px] font-bold px-2 py-0.5 border border-brand-200">
                          Rekomendowane
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500">
                        Nielimitowane zamówienia QR, Kuchnia KDS, Panel SuperAdmina, Pełna telemetria
                      </p>
                      <div className="text-xs text-brand font-mono font-bold pt-0.5">
                        {p100kPrice} PLN <span className="text-neutral-400 font-normal">/ mc</span>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={platform100k}
                        onChange={(e) => setPlatform100k(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ED1C24] transition-colors"></div>
                    </label>
                  </div>

                  {/* Terminal licenses */}
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                      Licencje na terminale SBR-* (kasy i softpos)
                    </div>

                    {/* SBR-PF */}
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-4 flex items-center justify-between gap-4 transition hover:border-neutral-300">
                      <div className="space-y-0.5 flex-1">
                        <div className="font-bold text-techbay-blue text-sm">SBR Pełna (POS + Kasa fiskalna + SoftPOS)</div>
                        <div className="text-xs text-neutral-500">Kasa fiskalna online + terminal płatniczy zbliżeniowy + POS</div>
                        <div className="text-xs text-brand font-mono font-bold pt-0.5">{pfPrice} PLN / mc</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSeatsPf(Math.max(0, seatsPf - 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-lg font-bold text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 transition shadow-2xs cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono font-bold text-base text-techbay-blue">{seatsPf}</span>
                        <button
                          type="button"
                          onClick={() => setSeatsPf(seatsPf + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-lg font-bold text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 transition shadow-2xs cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* SBR-F */}
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-4 flex items-center justify-between gap-4 transition hover:border-neutral-300">
                      <div className="space-y-0.5 flex-1">
                        <div className="font-bold text-techbay-blue text-sm">SBR Fiskalna (Aplikasa)</div>
                        <div className="text-xs text-neutral-500">Drukarka/kasa fiskalna wirtualna zintegrowana z MF</div>
                        <div className="text-xs text-brand font-mono font-bold pt-0.5">{fPrice} PLN / mc</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSeatsF(Math.max(0, seatsF - 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-lg font-bold text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 transition shadow-2xs cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono font-bold text-base text-techbay-blue">{seatsF}</span>
                        <button
                          type="button"
                          onClick={() => setSeatsF(seatsF + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-lg font-bold text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 transition shadow-2xs cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* SBR-P */}
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-4 flex items-center justify-between gap-4 transition hover:border-neutral-300">
                      <div className="space-y-0.5 flex-1">
                        <div className="font-bold text-techbay-blue text-sm">SBR Płatnicza (SoftPOS)</div>
                        <div className="text-xs text-neutral-500">Przyjmowanie płatności kartą i BLIK (PIN-on-Glass)</div>
                        <div className="text-xs text-brand font-mono font-bold pt-0.5">{pPrice} PLN / mc</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSeatsP(Math.max(0, seatsP - 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-lg font-bold text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 transition shadow-2xs cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono font-bold text-base text-techbay-blue">{seatsP}</span>
                        <button
                          type="button"
                          onClick={() => setSeatsP(seatsP + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-lg font-bold text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 transition shadow-2xs cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* SBR-0 */}
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-4 flex items-center justify-between gap-4 transition hover:border-neutral-300">
                      <div className="space-y-0.5 flex-1">
                        <div className="font-bold text-techbay-blue text-sm">SBR Podstawowa (POS)</div>
                        <div className="text-xs text-neutral-500">Terminal kelnerski / ekran obsługi zamówień</div>
                        <div className="text-xs text-brand font-mono font-bold pt-0.5">{zeroPrice} PLN / mc</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSeats0(Math.max(0, seats0 - 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-lg font-bold text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 transition shadow-2xs cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono font-bold text-base text-techbay-blue">{seats0}</span>
                        <button
                          type="button"
                          onClick={() => setSeats0(seats0 + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-lg font-bold text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 transition shadow-2xs cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Company Details with GUS API Verification */}
                <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                    <h2 className="text-lg font-bold text-techbay-blue flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-techbay-blue text-xs font-bold text-white">
                        3
                      </span>
                      Dane Firmy (Weryfikacja GUS BIR)
                    </h2>
                    <span className="text-xs text-neutral-400 font-medium">Pobierane z rejestru REGON</span>
                  </div>

                  <div className="space-y-4">
                    {/* NIP Field with GUS Lookup Button */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-techbay-blue/80 mb-1.5">
                        NIP firmy <span className="text-brand">*</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          placeholder="np. 5261040828 (10 cyfr)"
                          value={nip}
                          onChange={handleNipChange}
                          className="flex-1 rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs font-mono font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => handleGusLookup()}
                          disabled={gusLoading}
                          className="px-4 py-2.5 rounded-xl bg-techbay-blue hover:bg-techbay-blue-light text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          {gusLoading ? (
                            <span>Pobieranie z GUS...</span>
                          ) : (
                            <>
                              <span>🏛️</span>
                              <span>Pobierz z GUS</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Notice/Success banner */}
                      {gusNotice && (
                        <div className={`mt-2 p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                          gusSuccess
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}>
                          <span>{gusSuccess ? '✓' : 'ℹ️'}</span>
                          <span>{gusNotice}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-techbay-blue/80 mb-1.5">
                          Pełna nazwa firmy <span className="text-brand">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Nazwa pobrana z GUS lub ręczna"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-techbay-blue/80 mb-1.5">
                          E-mail kontaktowy i do faktury <span className="text-brand">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="twoj-email@restauracja.pl"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-techbay-blue/80 mb-1.5">
                          Telefon kontaktowy
                        </label>
                        <input
                          type="tel"
                          placeholder="+48 600 000 000"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-techbay-blue/80 mb-1.5">
                          Adres siedziby firmy
                        </label>
                        <input
                          type="text"
                          placeholder="Adres pobrany z GUS"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs"
                        />
                      </div>
                    </div>

                    <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200/80 text-xs text-neutral-500 flex items-center gap-2">
                      <span className="text-base">🔒</span>
                      <span>
                        Hasło dostępowe do panelu <strong>100k-admin.rycos.eu</strong> ustawisz wygodnie na 3. ekranie, zaraz po potwierdzeniu płatności.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Order Summary & Next Step (5 cols) */}
              <div className="lg:col-span-5">
                <div className="sticky top-20 rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-md space-y-5">
                  <h2 className="text-xl font-bold text-techbay-blue border-b border-neutral-100 pb-4 flex items-center justify-between">
                    <span>Podsumowanie</span>
                    <span className="text-xs text-neutral-500 font-medium">Okres: {months} mies.</span>
                  </h2>

                  <div className="space-y-3 text-sm">
                    {platform100k && (
                      <div className="flex justify-between text-neutral-700">
                        <span>Silnik 100k-RYCOS ({months}m)</span>
                        <span className="font-mono font-semibold text-techbay-blue">{p100kPrice * months} PLN</span>
                      </div>
                    )}
                    {seatsPf > 0 && (
                      <div className="flex justify-between text-neutral-700">
                        <span>{seatsPf}× SBR Pełna ({months}m)</span>
                        <span className="font-mono font-semibold text-techbay-blue">{seatsPf * pfPrice * months} PLN</span>
                      </div>
                    )}
                    {seatsF > 0 && (
                      <div className="flex justify-between text-neutral-700">
                        <span>{seatsF}× SBR Fiskalna ({months}m)</span>
                        <span className="font-mono font-semibold text-techbay-blue">{seatsF * fPrice * months} PLN</span>
                      </div>
                    )}
                    {seatsP > 0 && (
                      <div className="flex justify-between text-neutral-700">
                        <span>{seatsP}× SBR Płatnicza ({months}m)</span>
                        <span className="font-mono font-semibold text-techbay-blue">{seatsP * pPrice * months} PLN</span>
                      </div>
                    )}
                    {seats0 > 0 && (
                      <div className="flex justify-between text-neutral-700">
                        <span>{seats0}× SBR Podstawowa ({months}m)</span>
                        <span className="font-mono font-semibold text-techbay-blue">{seats0 * zeroPrice * months} PLN</span>
                      </div>
                    )}

                    {savingsPln > 0 && (
                      <div className="flex justify-between text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-bold">
                        <span>Rabat okresowy ({discountPercent}%)</span>
                        <span>-{savingsPln} PLN</span>
                      </div>
                    )}

                    <div className="border-t border-neutral-100 pt-3 space-y-1.5">
                      <div className="flex justify-between text-neutral-500 text-xs">
                        <span>Wartość netto:</span>
                        <span className="font-mono font-medium text-neutral-700">{totalNetPln} PLN</span>
                      </div>
                      <div className="flex justify-between text-neutral-500 text-xs">
                        <span>Podatek VAT (23%):</span>
                        <span className="font-mono font-medium text-neutral-700">{vatPln} PLN</span>
                      </div>
                      <div className="flex justify-between items-baseline text-techbay-blue text-lg font-black pt-2 border-t border-neutral-100">
                        <span>Do zapłaty brutto:</span>
                        <span className="text-brand font-mono text-3xl font-black">{totalGrossPln} PLN</span>
                      </div>
                    </div>
                  </div>

                  {errorMsg && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 font-medium">
                      {errorMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full rounded-xl bg-[#ED1C24] hover:bg-[#CC161D] active:bg-[#990E14] text-white py-4 text-base font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Dalej: Przejdź do płatności</span>
                    <span>→</span>
                  </button>

                  <div className="space-y-2 pt-2 text-[11px] text-neutral-500 text-center">
                    <div className="flex items-center justify-center gap-2 text-neutral-600 font-medium">
                      <span>🏛️ Weryfikacja GUS</span>
                      <span>•</span>
                      <span>🔒 Bezpieczne dane</span>
                      <span>•</span>
                      <span>⚡ Natychmiastowy dostęp</span>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </main>
        </>
      )}

      {/* ========================================================================= */}
      {/* EKRAN 2: PŁATNOŚĆ ONLINE (SAFERPAY) */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <main className="mx-auto max-w-4xl px-4 py-10">
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="inline-flex items-center gap-2 text-sm font-bold text-neutral-600 hover:text-techbay-blue transition cursor-pointer"
            >
              <span>←</span>
              <span>Wróć do edycji konfiguracji</span>
            </button>
            <span className="text-xs text-neutral-400 font-semibold">Krok 2 z 3</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Left: Summary of buyer and plan (7 cols) */}
            <div className="md:col-span-7 space-y-6">
              <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-sm space-y-4">
                <h2 className="text-lg font-bold text-techbay-blue border-b border-neutral-100 pb-3 flex items-center justify-between">
                  <span>Dane zamawiającego</span>
                  <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Zweryfikowano z GUS
                  </span>
                </h2>

                <div className="space-y-2.5 text-sm">
                  <div>
                    <span className="text-xs text-neutral-400 uppercase tracking-wider block font-bold">Firma:</span>
                    <strong className="text-techbay-blue font-extrabold text-base">{companyName}</strong>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-xs text-neutral-400 uppercase tracking-wider block font-bold">NIP:</span>
                      <span className="font-mono font-bold text-techbay-blue">{nip}</span>
                    </div>
                    <div>
                      <span className="text-xs text-neutral-400 uppercase tracking-wider block font-bold">E-mail:</span>
                      <span className="text-techbay-blue font-medium">{email}</span>
                    </div>
                  </div>

                  {address && (
                    <div className="pt-1">
                      <span className="text-xs text-neutral-400 uppercase tracking-wider block font-bold">Adres siedziby:</span>
                      <span className="text-neutral-700">{address}</span>
                    </div>
                  )}

                  {phone && (
                    <div className="pt-1">
                      <span className="text-xs text-neutral-400 uppercase tracking-wider block font-bold">Telefon:</span>
                      <span className="text-neutral-700">{phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Security info card */}
              <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-techbay-blue flex items-center gap-2">
                  <span>🛡️</span>
                  <span>Bezpieczna bramka płatnicza SolutionsBay</span>
                </h3>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Płatność jest realizowana przez certyfikowany system Saferpay (Wordline).
                  Twoje transakcje są chronione standardem PCI DSS poziomu 1.
                </p>
                <div className="flex items-center gap-4 pt-1 text-xs text-neutral-600 font-semibold">
                  <span>✓ BLIK</span>
                  <span>✓ Karta Visa / Mastercard</span>
                  <span>✓ Apple Pay / Google Pay</span>
                </div>
              </div>
            </div>

            {/* Right: Payment action & Amounts (5 cols) */}
            <div className="md:col-span-5">
              <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-md space-y-5">
                <h2 className="text-xl font-bold text-techbay-blue border-b border-neutral-100 pb-3 flex items-center justify-between">
                  <span>Do zapłaty</span>
                  <span className="text-xs text-neutral-500 font-medium">{months} mies.</span>
                </h2>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-neutral-600 text-xs">
                    <span>Wartość zamówienia netto:</span>
                    <span className="font-mono font-semibold text-techbay-blue">{totalNetPln} PLN</span>
                  </div>

                  {savingsPln > 0 && (
                    <div className="flex justify-between text-emerald-700 text-xs font-bold">
                      <span>Rabat ({discountPercent}%):</span>
                      <span>-{savingsPln} PLN</span>
                    </div>
                  )}

                  <div className="flex justify-between text-neutral-600 text-xs">
                    <span>Podatek VAT (23%):</span>
                    <span className="font-mono font-semibold text-techbay-blue">{vatPln} PLN</span>
                  </div>

                  <div className="border-t border-neutral-100 pt-3 flex justify-between items-baseline">
                    <span className="font-bold text-techbay-blue text-sm">Kwota brutto:</span>
                    <span className="font-mono text-3xl font-black text-brand">{totalGrossPln} PLN</span>
                  </div>
                </div>

                {errorMsg && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 font-medium">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleExecutePayment}
                  disabled={loading}
                  className="w-full rounded-xl bg-[#ED1C24] hover:bg-[#CC161D] active:bg-[#990E14] text-white py-4 text-base font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <span>Inicjalizacja płatności...</span>
                  ) : (
                    <>
                      <span>Zapłać bezpiecznie przez Saferpay</span>
                      <span>→</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-neutral-400 text-center leading-relaxed">
                  Zostaniesz bezpiecznie przekierowany na stronę płatności Saferpay, a po transakcji na Ekran 3 w celu utworzenia hasła administratora.
                </p>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
