'use client'

import React, { useState, useMemo } from 'react';
import { checkoutOnboarding } from '@/lib/api';

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
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanNip = nip.replace(/^PL/i, '').replace(/[^0-9]/g, '');
    if (cleanNip.length !== 10) {
      setErrorMsg('Wpisz poprawny 10-cyfrowy NIP firmy');
      return;
    }
    if (!companyName.trim()) {
      setErrorMsg('Podaj nazwę firmy');
      return;
    }
    if (!email.includes('@')) {
      setErrorMsg('Podaj poprawny adres e-mail');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Hasło administratora musi mieć minimum 6 znaków');
      return;
    }
    if (!platform100k && seatsPf === 0 && seatsF === 0 && seatsP === 0 && seats0 === 0) {
      setErrorMsg('Wybierz przynajmniej jeden pakiet lub stanowisko');
      return;
    }

    setLoading(true);
    try {
      const res = await checkoutOnboarding({
        nip: cleanNip,
        company_name: companyName,
        email,
        phone,
        address,
        password,
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

      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-4 pt-10 pb-8 text-center space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-600 border border-neutral-200 shadow-xs mb-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Natychmiastowa aktywacja i licencjonowanie online
        </div>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-techbay-blue">
          Wybierz pakiet <span className="text-brand">100k-RYCOS</span> i terminale SBR
        </h1>
        <p className="mx-auto max-w-2xl text-sm sm:text-base text-neutral-600 leading-relaxed">
          Błyskawiczna aktywacja platformy obsługującej 100 000 zamówień/minutę, wirtualnych kas fiskalnych online oraz płatności zbliżeniowych SoftPOS.
        </p>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-20">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
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

              {/* Platform 100k Item */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 flex items-center justify-between gap-4 transition hover:border-neutral-300">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-techbay-blue text-base">Silnik Platformy 100k-RYCOS</span>
                    <span className="rounded-md bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-bold text-brand">
                      Rekomendowane
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 leading-tight">
                    Nielimitowane zamówienia QR, Kuchnia KDS, Panel SuperAdmina, Pełna telemetria
                  </p>
                  <div className="text-xs text-neutral-700 font-mono font-bold pt-1">
                    {p100kPrice} PLN / mc
                  </div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={platform100k}
                    onChange={(e) => setPlatform100k(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-neutral-300 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand peer-checked:after:translate-x-full peer-focus:outline-none shadow-inner" />
                </label>
              </div>

              {/* SBR Devices Section */}
              <div className="space-y-3 pt-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Licencje na terminale SBR-* (Kasy i SoftPOS)
                </h3>

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

            {/* 3. Company & Admin Details Form */}
            <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <h2 className="text-lg font-bold text-techbay-blue flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-techbay-blue text-xs font-bold text-white">
                    3
                  </span>
                  Dane Firmy & Administratora
                </h2>
                <span className="text-xs text-neutral-400 font-medium">Do faktury i logowania</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-techbay-blue/80 mb-1.5">
                    NIP firmy <span className="text-brand">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="np. 5252839211 (10 cyfr)"
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-techbay-blue/80 mb-1.5">
                    Pełna nazwa firmy <span className="text-brand">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="np. SolutionsBay Sp. z o.o."
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-techbay-blue/80 mb-1.5">
                    E-mail administratora <span className="text-brand">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="admin@twojarestauracja.pl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-techbay-blue/80 mb-1.5">
                    Hasło do panelu admina <span className="text-brand">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Minimum 6 znaków"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 pr-11 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs"
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
                    Adres siedziby
                  </label>
                  <input
                    type="text"
                    placeholder="ul. Smakowa 10, 00-001 Warszawa"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-techbay-blue placeholder-neutral-400 focus:border-techbay-blue focus:ring-2 focus:ring-techbay-lightblue/30 focus:outline-none transition shadow-2xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary & Payment (5 cols) */}
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
                disabled={loading}
                className="w-full rounded-xl bg-brand py-3.5 text-base font-bold text-white hover:bg-brand-600 active:bg-techbay-darkred transition shadow-sm hover:shadow disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <span>Przetwarzanie zamówienia...</span>
                ) : (
                  <>
                    <span>Zapłać bezpiecznie przez Saferpay</span>
                    <span>→</span>
                  </>
                )}
              </button>

              <div className="space-y-2 pt-2 text-[11px] text-neutral-500 text-center">
                <div className="flex items-center justify-center gap-2 text-neutral-600 font-medium">
                  <span>🔒 Szyfrowanie SSL</span>
                  <span>•</span>
                  <span>⚡ Natychmiastowy dostęp</span>
                  <span>•</span>
                  <span>💳 BLIK / Karta / GPay</span>
                </div>
                <p className="leading-relaxed">
                  Po dokonaniu płatności zostaniesz automatycznie zalogowany do portalu administracyjnego{' '}
                  <strong className="text-techbay-blue font-semibold">100k-admin.rycos.eu</strong> z gotowymi licencjami.
                </p>
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
