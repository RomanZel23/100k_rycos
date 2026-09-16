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
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-brand selection:text-white">
      {/* Top Header */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
              <span className="text-brand">⚡</span> 100k-<span className="text-brand">RYCOS</span>
            </span>
            <span className="rounded-full bg-brand/20 text-brand text-[11px] font-bold px-2.5 py-0.5 border border-brand/30">
              Sklep & Onboarding
            </span>
          </div>
          <div className="text-xs text-neutral-400">
            Dostarczane przez <strong className="text-white font-semibold">SolutionsBay</strong>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-4 pt-10 pb-6 text-center space-y-3">
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
          Wybierz pakiet <span className="text-brand">100k-RYCOS</span> i terminale SBR
        </h1>
        <p className="mx-auto max-w-2xl text-sm sm:text-base text-neutral-400 leading-relaxed">
          Błyskawiczna aktywacja platformy obsługującej 100 000 zamówień/minutę, kas fiskalnych online i płatności zbliżeniowych SoftPOS.
        </p>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-20">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Configuration & Form (8 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* 1. Period Selector */}
            <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-6 backdrop-blur-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-black text-black">1</span>
                  Okres subskrypcji
                </h2>
                <span className="text-xs text-neutral-400">Wybierz czas trwania</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setMonths(1)}
                  className={`rounded-xl border p-4 text-center transition ${
                    months === 1
                      ? 'border-brand bg-brand/10 text-white font-bold ring-1 ring-brand'
                      : 'border-white/10 bg-black/40 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  <div className="text-sm font-bold">1 miesiąc</div>
                  <div className="text-xs text-neutral-400 mt-1">Standard</div>
                </button>

                <button
                  type="button"
                  onClick={() => setMonths(6)}
                  className={`relative rounded-xl border p-4 text-center transition ${
                    months === 6
                      ? 'border-brand bg-brand/10 text-white font-bold ring-1 ring-brand'
                      : 'border-white/10 bg-black/40 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  <span className="absolute -top-2.5 right-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-black">
                    -10%
                  </span>
                  <div className="text-sm font-bold">6 miesięcy</div>
                  <div className="text-xs text-emerald-400 mt-1">Oszczędzasz 10%</div>
                </button>

                <button
                  type="button"
                  onClick={() => setMonths(12)}
                  className={`relative rounded-xl border p-4 text-center transition ${
                    months === 12
                      ? 'border-brand bg-brand/10 text-white font-bold ring-1 ring-brand shadow-lg shadow-brand/10'
                      : 'border-white/10 bg-black/40 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  <span className="absolute -top-2.5 right-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-black text-black">
                    -20%
                  </span>
                  <div className="text-sm font-bold">12 miesięcy</div>
                  <div className="text-xs text-brand mt-1">2 m-ce gratis</div>
                </button>
              </div>
            </div>

            {/* 2. Platform & Devices Selector */}
            <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-6 backdrop-blur-sm space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-black text-black">2</span>
                  Pakiety i Urządzenia SBR
                </h2>
                <span className="text-xs text-neutral-400">Ceny netto / mc</span>
              </div>

              {/* Platform 100k Item */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-base">Silnik Platformy 100k-RYCOS</span>
                    <span className="rounded-md bg-brand/20 px-2 py-0.5 text-[10px] font-bold text-brand">Rekomendowane</span>
                  </div>
                  <p className="text-xs text-neutral-400 leading-tight">
                    Nielimitowane zamówienia QR, Kuchnia KDS, Panel SuperAdmina, Pełna telemetria
                  </p>
                  <div className="text-xs text-neutral-300 font-mono font-bold pt-1">
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
                  <div className="peer h-7 w-12 rounded-full bg-neutral-700 after:absolute after:top-[2px] after:left-[2px] after:h-6 after:w-6 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand peer-checked:after:translate-x-full peer-focus:outline-none" />
                </label>
              </div>

              {/* SBR Devices Section */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Licencje na terminale SBR-* (Kasy i SoftPOS)
                </h3>

                {/* SBR-PF */}
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <div className="font-bold text-white text-sm">SBR Pełna (POS + Kasa fiskalna + SoftPOS)</div>
                    <div className="text-xs text-neutral-400">Kasa fiskalna online + terminal płatniczy zbliżeniowy + POS</div>
                    <div className="text-xs text-brand font-mono font-bold pt-0.5">{pfPrice} PLN / mc</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSeatsPf(Math.max(0, seatsPf - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-lg font-bold text-neutral-300 hover:bg-neutral-700"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-mono font-bold text-base">{seatsPf}</span>
                    <button
                      type="button"
                      onClick={() => setSeatsPf(seatsPf + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-lg font-bold text-neutral-300 hover:bg-neutral-700"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* SBR-F */}
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <div className="font-bold text-white text-sm">SBR Fiskalna (Aplikasa)</div>
                    <div className="text-xs text-neutral-400">Drukarka/kasa fiskalna wirtualna zintegrowana z MF</div>
                    <div className="text-xs text-brand font-mono font-bold pt-0.5">{fPrice} PLN / mc</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSeatsF(Math.max(0, seatsF - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-lg font-bold text-neutral-300 hover:bg-neutral-700"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-mono font-bold text-base">{seatsF}</span>
                    <button
                      type="button"
                      onClick={() => setSeatsF(seatsF + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-lg font-bold text-neutral-300 hover:bg-neutral-700"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* SBR-P */}
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <div className="font-bold text-white text-sm">SBR Płatnicza (SoftPOS)</div>
                    <div className="text-xs text-neutral-400">Przyjmowanie płatności kartą i BLIK (PIN-on-Glass)</div>
                    <div className="text-xs text-brand font-mono font-bold pt-0.5">{pPrice} PLN / mc</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSeatsP(Math.max(0, seatsP - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-lg font-bold text-neutral-300 hover:bg-neutral-700"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-mono font-bold text-base">{seatsP}</span>
                    <button
                      type="button"
                      onClick={() => setSeatsP(seatsP + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-lg font-bold text-neutral-300 hover:bg-neutral-700"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* SBR-0 */}
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <div className="font-bold text-white text-sm">SBR Podstawowa (POS)</div>
                    <div className="text-xs text-neutral-400">Terminal kelnerski / ekran obsługi zamówień</div>
                    <div className="text-xs text-brand font-mono font-bold pt-0.5">{zeroPrice} PLN / mc</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSeats0(Math.max(0, seats0 - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-lg font-bold text-neutral-300 hover:bg-neutral-700"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-mono font-bold text-base">{seats0}</span>
                    <button
                      type="button"
                      onClick={() => setSeats0(seats0 + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-lg font-bold text-neutral-300 hover:bg-neutral-700"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Company & Admin Details Form */}
            <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-6 backdrop-blur-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-black text-black">3</span>
                  Dane Firmy & Administratora
                </h2>
                <span className="text-xs text-neutral-400">Do faktury i logowania</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">
                    NIP firmy <span className="text-brand">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="np. 5252839211 (10 cyfr)"
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">
                    Pełna nazwa firmy <span className="text-brand">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="np. Gastro Smak Sp. z o.o."
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">
                    E-mail administratora <span className="text-brand">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="admin@twojarestauracja.pl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">
                    Hasło do panelu admina <span className="text-brand">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Minimum 6 znaków"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">
                    Telefon kontaktowy
                  </label>
                  <input
                    type="tel"
                    placeholder="+48 600 000 000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">
                    Adres siedziby
                  </label>
                  <input
                    type="text"
                    placeholder="ul. Smakowa 10, 00-001 Warszawa"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-brand focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary & Payment (5 cols) */}
          <div className="lg:col-span-5">
            <div className="sticky top-24 rounded-2xl border border-white/10 bg-neutral-900/90 p-6 backdrop-blur-md space-y-6 shadow-2xl">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-4 flex items-center justify-between">
                <span>Podsumowanie</span>
                <span className="text-xs text-neutral-400 font-normal">Okres: {months} mies.</span>
              </h2>

              <div className="space-y-3 text-sm">
                {platform100k && (
                  <div className="flex justify-between text-neutral-300">
                    <span>Silnik 100k-RYCOS ({months}m)</span>
                    <span className="font-mono font-medium">{p100kPrice * months} PLN</span>
                  </div>
                )}
                {seatsPf > 0 && (
                  <div className="flex justify-between text-neutral-300">
                    <span>{seatsPf}× SBR Pełna ({months}m)</span>
                    <span className="font-mono font-medium">{seatsPf * pfPrice * months} PLN</span>
                  </div>
                )}
                {seatsF > 0 && (
                  <div className="flex justify-between text-neutral-300">
                    <span>{seatsF}× SBR Fiskalna ({months}m)</span>
                    <span className="font-mono font-medium">{seatsF * fPrice * months} PLN</span>
                  </div>
                )}
                {seatsP > 0 && (
                  <div className="flex justify-between text-neutral-300">
                    <span>{seatsP}× SBR Płatnicza ({months}m)</span>
                    <span className="font-mono font-medium">{seatsP * pPrice * months} PLN</span>
                  </div>
                )}
                {seats0 > 0 && (
                  <div className="flex justify-between text-neutral-300">
                    <span>{seats0}× SBR Podstawowa ({months}m)</span>
                    <span className="font-mono font-medium">{seats0 * zeroPrice * months} PLN</span>
                  </div>
                )}

                {savingsPln > 0 && (
                  <div className="flex justify-between text-emerald-400 text-xs font-bold pt-1">
                    <span>Rabat okresowy ({discountPercent}%)</span>
                    <span>-{savingsPln} PLN</span>
                  </div>
                )}

                <div className="border-t border-white/10 pt-3 space-y-1.5">
                  <div className="flex justify-between text-neutral-400 text-xs">
                    <span>Wartość netto:</span>
                    <span className="font-mono">{totalNetPln} PLN</span>
                  </div>
                  <div className="flex justify-between text-neutral-400 text-xs">
                    <span>Podatek VAT (23%):</span>
                    <span className="font-mono">{vatPln} PLN</span>
                  </div>
                  <div className="flex justify-between text-white text-lg font-black pt-2 border-t border-white/10">
                    <span>Do zapłaty brutto:</span>
                    <span className="text-brand font-mono text-2xl">{totalGrossPln} PLN</span>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-brand py-4 text-base font-black text-black hover:bg-brand-light transition shadow-lg shadow-brand/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <span>Przetwarzanie...</span>
                ) : (
                  <>
                    <span>Zapłać bezpiecznie przez Saferpay</span>
                    <span>→</span>
                  </>
                )}
              </button>

              <div className="space-y-2 pt-2 text-[11px] text-neutral-500 text-center">
                <div className="flex items-center justify-center gap-2 text-neutral-400">
                  <span>🔒 Szyfrowanie SSL</span>
                  <span>•</span>
                  <span>⚡ Natychmiastowy dostęp</span>
                  <span>•</span>
                  <span>💳 BLIK / Karta / GPay</span>
                </div>
                <p>
                  Po dokonaniu płatności zostaniesz automatycznie zalogowany do panelu administracyjnego 100k-admin.rycos.eu z gotowymi licencjami.
                </p>
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
