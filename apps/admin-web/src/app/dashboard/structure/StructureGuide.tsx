'use client'

import React, { useState } from 'react'
import Link from 'next/link'

export function StructureGuideContent({
  standalone = false,
  onClose,
}: {
  standalone?: boolean
  onClose?: () => void
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'wires' | 'actions' | 'scenarios'>('overview')

  return (
    <div className="space-y-6 text-neutral-800">
      {/* Header banner */}
      <div className="rounded-2xl bg-gradient-to-br from-[#002633] via-slate-900 to-slate-800 text-white p-6 sm:p-8 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-400/20 border border-sky-400/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sky-300">
              Przewodnik interaktywny · 100k-RYCOS
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Jak działa i jak konfigurować Diagram Struktury Lokalu?
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Diagram zastępuje skomplikowane tabele konfiguracji jednym wizualnym schematem. Łącząc kafelki kolorowymi
              liniami decydujesz w kilka sekund, które stanowisko sprzedaje daną markę oraz na którym urządzeniu SBR
              drukuje paragony i przyjmuje płatności zbliżeniowe.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {standalone ? (
              <>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition cursor-pointer"
                >
                  🖨️ Drukuj / Zapisz PDF
                </button>
                <Link
                  href="/dashboard/structure"
                  className="px-4 py-2 rounded-xl bg-brand hover:opacity-95 text-xs font-bold text-white transition"
                >
                  Otwórz edytor struktury →
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/instrukcja-struktury"
                  target="_blank"
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition"
                >
                  Otwórz w osobnym oknie ↗
                </Link>
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
                  >
                    ✕ Zamknij instrukcję
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Visual flow summary bar */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5 border-t border-white/10 text-xs">
          <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600 font-extrabold text-white">
              M
            </span>
            <div>
              <div className="font-bold text-white">1. Marka (po lewej)</div>
              <p className="text-slate-300 mt-0.5">
                Menu QR dla gości i stoliki. Wypzcza zieloną linię do stanowisk, które mają ją obsługiwać.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-600 font-extrabold text-white">
              POS
            </span>
            <div>
              <div className="font-bold text-white">2. Stanowisko (w środku)</div>
              <p className="text-slate-300 mt-0.5">
                Kasa POS, All-in-One, Kuchnia KDS lub Wydawka. Odbiera zamówienia i kieruje operacje na sprzęt.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-600 font-extrabold text-white">
              SBR
            </span>
            <div>
              <div className="font-bold text-white">3. Urządzenie SBR / SBF (po prawej)</div>
              <p className="text-slate-300 mt-0.5">
                Fizyczny terminal RYCOS wykonujący fiskalizację, płatność kartą (SoftPOS) oraz wydruk.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (hidden in print, all sections visible in print) */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3 print:hidden">
        {[
          { id: 'overview', label: '1. Elementy na schemacie' },
          { id: 'wires', label: '2. Kolory linii i połączeń' },
          { id: 'actions', label: '3. Jak łączyć i edytować (Krok po kroku)' },
          { id: 'scenarios', label: '4. Przykładowe konfiguracje (Scenariusze)' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
              activeTab === t.id
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* SECTION 1: ELEMENTY NA SCHEMACIE */}
      <div className={activeTab === 'overview' || standalone ? 'space-y-6' : 'hidden print:block space-y-6'}>
        <section className="card space-y-4">
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-white text-xs">1</span>
            Co oznaczają poszczególne elementy na diagramie?
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lokalizacja */}
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-lg bg-slate-200/80 px-2.5 py-1 text-xs font-bold text-slate-800">
                  Tor Służewiec <span className="font-normal text-slate-500">#2 · 4 stolików</span>
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ramka lokalizacji</span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                <strong>Lokalizacja (oddział / sala / strefa):</strong> Przerywana ramka grupuje elementy znajdujące się w
                jednym fizycznym miejscu. Przeciągnięcie marki lub stanowiska do wnętrza ramki automatycznie przypisuje je
                do tej lokalizacji oraz jej puli stolików.
              </p>
              <p className="text-[11px] text-neutral-500">
                💡 Dolna ramka <strong>„Poza lokalizacją”</strong> przechowuje elementy, które nie są jeszcze przypisane do
                żadnego oddziału.
              </p>
            </div>

            {/* Marka */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0d6e6e] text-white font-extrabold text-xs">
                  M
                </span>
                <div>
                  <div className="text-sm font-bold text-neutral-900">Wielka Warszawska</div>
                  <div className="text-[11px] text-neutral-500 font-mono">/ww0927 · własne stoliki: 4</div>
                </div>
                <span className="ml-auto h-2.5 w-2.5 rounded-full bg-emerald-600" title="Konfiguracja OK" />
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                <strong>Marka (Menu QR):</strong> Reprezentuje kartę dań i kod QR dla klientów. Posiada wyjście{' '}
                <strong className="text-[#0d6e6e]">„sprzedawana na ●”</strong>, z którego przeciągasz zieloną linię do
                kas POS, kiosków, kuchni lub wydawek.
              </p>
            </div>

            {/* Stanowiska */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2.5 shadow-sm">
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded bg-[#334e68] text-white font-bold text-[11px]">AIO — All-in-One</span>
                <span className="px-2 py-0.5 rounded bg-[#334e68] text-white font-bold text-[11px]">POS — Kasa POS</span>
                <span className="px-2 py-0.5 rounded bg-[#334e68] text-white font-bold text-[11px]">KDS — Kuchnia</span>
                <span className="px-2 py-0.5 rounded bg-[#334e68] text-white font-bold text-[11px]">WYD — Wydawka</span>
                <span className="px-2 py-0.5 rounded bg-[#334e68] text-white font-bold text-[11px]">KIO — Kiosk</span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                <strong>Stanowiska pracy:</strong> Tablety, laptopy lub ekrany w lokalu:
              </p>
              <ul className="text-xs text-neutral-600 space-y-1 list-disc pl-4">
                <li>
                  <strong>AIO (All-in-One)</strong> — pełne stanowisko: sprzedaż POS + ekran kuchni KDS + wydawka w jednym.
                </li>
                <li>
                  <strong>POS (Kasa POS)</strong> — stanowisko kasjera/kelnera przyjmujące zamówienia i płatności.
                </li>
                <li>
                  <strong>WYD (Wydawka)</strong> — ekran dla klientów/obsługi pokazujący numery gotowych zamówień (PIN odbioru).
                </li>
                <li>
                  <strong>KDS (Kuchnia)</strong> — ekran dla kucharzy wyświetlający zamówienia do przygotowania.
                </li>
              </ul>
            </div>

            {/* Urządzenie SBR / SBF */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b45309] text-white font-extrabold text-[11px]">
                  SBR
                </span>
                <div>
                  <div className="text-sm font-bold text-neutral-900">Hammer Romana / Moto Romana</div>
                  <div className="text-[11px] text-neutral-500 font-mono">Urządzenie SBR · SBR-C5N34S</div>
                </div>
                <span className="ml-auto rounded-full bg-emerald-50 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  online
                </span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                <strong>Urządzenie fizyczne RYCOS (SBR / SBF):</strong> Terminal z aplikacją mobilną RYCOS połączony przez
                chmurę MQTT. Posiada trzy wejścia po lewej stronie:{' '}
                <strong className="text-[#c2590a]">● fiskalizacja</strong>,{' '}
                <strong className="text-[#6d4aff]">● płatność kartą</strong> oraz{' '}
                <strong className="text-[#475569]">● wydruk</strong>. Więcej niż jedno stanowisko POS może korzystać z tego
                samego urządzenia SBR!
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* SECTION 2: KOLORY LINII I POŁĄCZEŃ */}
      <div className={activeTab === 'wires' || standalone ? 'space-y-6' : 'hidden print:block space-y-6'}>
        <section className="card space-y-4">
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-white text-xs">2</span>
            Co oznaczają 4 kolory kropek i linii?
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600">
            Zasada jest prosta: <strong>zawsze łączymy kropkę wyjściową (po prawej stronie kafelka) z kropką wejściową (po lewej stronie docelowego kafelka) tego samego koloru</strong>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border-l-4 border-l-[#0d6e6e] border border-neutral-200 p-4 bg-teal-50/20 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-sm text-[#0d6e6e]">
                <span className="h-3.5 w-3.5 rounded-full border-[3px] border-[#0d6e6e] bg-white inline-block" />
                Zielona linia: Marka → Stanowisko
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Określa, które stanowisko obsługuje daną markę. Na przykład na Twoim zrzucie marka{' '}
                <strong>„Wielka Warszawska”</strong> jest połączona zielonymi liniami z 3 stanowiskami:{' '}
                <em>Wydawką (Hammer Romana)</em>, <em>macbookiem Romana (AIO)</em> oraz <em>Kasą POS (Moto Romana)</em>.
              </p>
              <p className="text-[11px] text-neutral-500">
                💡 <strong>Wskazówka:</strong> Jeśli w danej lokalizacji stanowisko nie ma przypisanej żadnej zielonej linii,
                domyślnie obsługuje <strong>wszystkie marki</strong> znajdujące się w tej samej lokalizacji.
              </p>
            </div>

            <div className="rounded-xl border-l-4 border-l-[#c2590a] border border-neutral-200 p-4 bg-amber-50/20 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-sm text-[#c2590a]">
                <span className="h-3.5 w-3.5 rounded-full border-[3px] border-[#c2590a] bg-white inline-block" />
                Pomarańczowa linia: Stanowisko → Fiskalizacja
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Wskazuje urządzenie <strong>SBR</strong> lub <strong>Hub SBF</strong>, które wystawi i zarejestruje paragon
                fiskalny dla zamówień z tego stanowiska. Na zrzucie ekranu <em>macbook Romana</em> fiskalizuje na urządzeniu{' '}
                <strong>Hammer Romana (SBR)</strong>, natomiast <em>Kasa POS Moto Romana</em> fiskalizuje na{' '}
                <strong>Moto Romana (SBR)</strong>.
              </p>
            </div>

            <div className="rounded-xl border-l-4 border-l-[#6d4aff] border border-neutral-200 p-4 bg-violet-50/20 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-sm text-[#6d4aff]">
                <span className="h-3.5 w-3.5 rounded-full border-[3px] border-[#6d4aff] bg-white inline-block" />
                Fioletowa linia: Stanowisko → Płatność kartą (SoftPOS)
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Wskazuje terminal <strong>SBR z funkcją SoftPOS</strong>, na którym uruchomi się ekran zbliżenia karty
                płatniczej / telefonu (VISA, Mastercard, Apple Pay, Google Pay), gdy kasjer wybierze na POS płatność kartą.
                Wiele stanowisk może kierować płatności kartą na ten sam terminal SBR!
              </p>
            </div>

            <div className="rounded-xl border-l-4 border-l-[#475569] border border-neutral-200 p-4 bg-slate-50 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-sm text-[#475569]">
                <span className="h-3.5 w-3.5 rounded-full border-[3px] border-[#475569] bg-white inline-block" />
                Szara przerywana linia: Stanowisko → Wydruk
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Wskazuje urządzenie <strong>SBR</strong> z drukarką bonową, na którym mają być drukowane bony kuchenne lub
                potwierdzenia zamówień z danego stanowiska.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* SECTION 3: JAK ŁĄCZYĆ I EDYTOWAĆ (KROK PO KROKU) */}
      <div className={activeTab === 'actions' || standalone ? 'space-y-6' : 'hidden print:block space-y-6'}>
        <section className="card space-y-4">
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-white text-xs">3</span>
            Instrukcja obsługi edytora krok po kroku
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="rounded-xl border border-neutral-200 p-4 space-y-2">
              <div className="font-bold text-sm text-neutral-900">🔗 Krok 1: Tworzenie połączenia (przeciągnij z kropki do kropki)</div>
              <ol className="list-decimal pl-4 space-y-1 text-neutral-600 leading-relaxed">
                <li>Najedź myszką na <strong>kropkę po prawej stronie</strong> kafelka (np. <em>→ fiskalizacja</em> na stanowisku POS).</li>
                <li>Wciśnij lewy przycisk myszy i przeciągnij kolorową linię do <strong>kropki tego samego koloru po lewej stronie</strong> urządzenia docelowego (np. <em>● fiskalizacja</em> na urządzeniu SBR).</li>
                <li>Upuść przycisk myszy — linia połączy oba urządzenia. Jeśli wcześniej istniało inne połączenie fiskalizacji z tego stanowiska, zostanie ono automatycznie podmienione.</li>
              </ol>
            </div>

            <div className="rounded-xl border border-neutral-200 p-4 space-y-2">
              <div className="font-bold text-sm text-neutral-900">🗑️ Krok 2: Usuwanie połączenia</div>
              <ol className="list-decimal pl-4 space-y-1 text-neutral-600 leading-relaxed">
                <li>Kliknij bezpośrednio w kolorową linię łączącą dwa kafelki (linia stanie się pogrubiona).</li>
                <li>Naciśnij klawisz <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-300 font-mono">Delete</kbd> lub <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-300 font-mono">Backspace</kbd> na klawiaturze, <strong>albo</strong> kliknij przycisk <strong>„Usuń połączenie”</strong> w panelu właściwości po prawej stronie.</li>
              </ol>
            </div>

            <div className="rounded-xl border border-neutral-200 p-4 space-y-2">
              <div className="font-bold text-sm text-neutral-900">📦 Krok 3: Przypisywanie do lokalizacji i stolików</div>
              <ol className="list-decimal pl-4 space-y-1 text-neutral-600 leading-relaxed">
                <li>Chwyć kafelek marki lub stanowiska za jego górną część i <strong>przeciągnij go do wnętrza przerywanej ramki lokalizacji</strong> (np. <em>Tor Służewiec</em>).</li>
                <li>Klikając w nagłówek ramki lokalizacji możesz w prawym panelu zmienić jej nazwę oraz listę stolików (np. <code>1, 2, 3, 4, Loża VIP</code>).</li>
                <li>Klikając w kafelek marki możesz włączyć dla niej <strong>„Własne stoliki marki”</strong> (np. gdy dana marka obsługuje tylko stoliki ogródkowe lub własne numery).</li>
              </ol>
            </div>

            <div className="rounded-xl border border-neutral-200 p-4 space-y-2">
              <div className="font-bold text-sm text-neutral-900">➕ Krok 4: Dodawanie stanowisk, szablonów i zapis</div>
              <ol className="list-decimal pl-4 space-y-1 text-neutral-600 leading-relaxed">
                <li>Na górnym pasku wybierz rolę (np. <em>Kasa POS</em>, <em>Kuchnia KDS</em>, <em>Wydawka</em>) i kliknij <strong>„+ Stanowisko”</strong>, lub wybierz gotowy zestaw z menu <strong>„+ Szablon lokalu…”</strong>.</li>
                <li>Możesz cofać i ponawiać ruchy przyciskami <strong>↶ / ↷</strong> (<kbd className="px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-300 font-mono">Ctrl+Z</kbd>).</li>
                <li>Na koniec kliknij niebieski przycisk <strong>„Zapisz strukturę”</strong> w prawym górnym rogu — zmiana natychmiast zaktualizuje wszystkie stanowiska!</li>
              </ol>
            </div>
          </div>
        </section>
      </div>

      {/* SECTION 4: PRZYKŁADOWE KONFIGURACJE (SCENARIUSZE) */}
      <div className={activeTab === 'scenarios' || standalone ? 'space-y-6' : 'hidden print:block space-y-6'}>
        <section className="card space-y-4">
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-white text-xs">4</span>
            Jak czytać przykład ze zrzutu ekranu („Tor Służewiec”)?
          </h2>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3 text-xs leading-relaxed text-neutral-700">
            <p className="font-bold text-sm text-neutral-900">
              Dokładne wyjaśnienie tego, co dzieje się na schemacie „Tor Służewiec”:
            </p>
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <strong>Marka „Wielka Warszawska” (/ww0927)</strong> ma zdefiniowane 4 własne stoliki i jest połączona{' '}
                <strong className="text-[#0d6e6e]">zielonymi liniami</strong> z trzema stanowiskami:
                <ul className="list-circle pl-5 mt-1 space-y-1 text-neutral-600">
                  <li>
                    <strong>Hammer Romana (WYD — Wydawka):</strong> widzi na ekranie zamówienia marki <em>Wielka Warszawska</em>, aby klienci widzieli, kiedy ich zamówienie jest gotowe do odbioru.
                  </li>
                  <li>
                    <strong>macbook Romana (AIO — All-in-One):</strong> sprzedaje produkty marki <em>Wielka Warszawska</em>, przy czym:
                    <br />– <strong className="text-[#c2590a]">fiskalizację (pomarańczowa linia)</strong> wysyła na urządzenie <strong>Hammer Romana (SBR)</strong>,
                    <br />– <strong className="text-[#6d4aff]">płatność kartą (fioletowa linia)</strong> oraz <strong className="text-[#475569]">wydruk (szara przerywana linia)</strong> wysyła na urządzenie <strong>Moto Romana (SBR)</strong>!
                  </li>
                  <li>
                    <strong>Moto Romana (POS — Kasa POS):</strong> również sprzedaje produkty marki <em>Wielka Warszawska</em>, a wszystkie trzy operacje sprzętowe (<strong className="text-[#c2590a]">fiskalizację</strong>, <strong className="text-[#6d4aff]">płatność kartą</strong> i <strong className="text-[#475569]">wydruk</strong>) kieruje na urządzenie fizyczne <strong>Moto Romana (SBR)</strong>.
                  </li>
                </ul>
              </li>
              <li>
                Dzięki takiemu układowi <strong>dwa stanowiska kasowe (macbook Romana oraz Kasa POS Moto Romana) współdzielą terminal płatniczy i drukarkę na urządzeniu Moto Romana (SBR)</strong>, a jednocześnie <em>macbook Romana</em> może wystawiać paragony fiskalne przez osobne urządzenie <em>Hammer Romana (SBR)</em>!
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}

export function StructureGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-neutral-50 p-4 sm:p-6 shadow-2xl border border-neutral-200">
        <StructureGuideContent standalone={false} onClose={onClose} />
      </div>
    </div>
  )
}
