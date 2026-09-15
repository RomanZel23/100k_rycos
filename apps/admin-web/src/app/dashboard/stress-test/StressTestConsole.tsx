'use client';

import React, { useState, useTransition } from 'react';
import { runStressTest, cleanupTestOrders, StressTestResult, StressTestStats } from './actions';
import { AdminLocale, getTranslation } from '@/lib/i18n';

interface StressTestConsoleProps {
  initialStats: StressTestStats | null;
  locale: AdminLocale;
}

export function StressTestConsole({ initialStats, locale }: StressTestConsoleProps) {
  const [stats, setStats] = useState<StressTestStats | null>(initialStats);
  const [brandId, setBrandId] = useState<number | undefined>(initialStats?.brands?.[0]?.id);
  const [count, setCount] = useState<number>(250);
  const [concurrency, setConcurrency] = useState<number>(15);
  const [mode, setMode] = useState<'in_memory' | 'synthetic_db'>('in_memory');
  const [autoCleanup, setAutoCleanup] = useState<boolean>(true);

  const [isRunning, startRunningTransition] = useTransition();
  const [isCleaning, startCleaningTransition] = useTransition();

  const [result, setResult] = useState<StressTestResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const t = (key: string, fallback?: string) => getTranslation(locale, key, fallback);

  const handlePreset = (presetCount: number, presetConcurrency: number, presetMode: 'in_memory' | 'synthetic_db') => {
    setCount(presetCount);
    setConcurrency(presetConcurrency);
    setMode(presetMode);
  };

  const handleRun = () => {
    setErrorMessage(null);
    setSuccessNotice(null);

    startRunningTransition(async () => {
      const res = await runStressTest({
        brandId,
        count,
        concurrency,
        mode,
        autoCleanup: mode === 'synthetic_db' ? autoCleanup : false,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Stress test zakończył się błędem');
      } else if (res.data) {
        setResult(res.data);
        if (mode === 'synthetic_db' && !autoCleanup) {
          setStats((prev) =>
            prev ? { ...prev, testOrdersCount: prev.testOrdersCount + res.data!.successfulOrders } : null
          );
        }
      }
    });
  };

  const handleCleanup = () => {
    setErrorMessage(null);
    setSuccessNotice(null);

    startCleaningTransition(async () => {
      const res = await cleanupTestOrders();
      if (!res.success) {
        setErrorMessage(res.error || 'Błąd czyszczenia bazy');
      } else {
        setSuccessNotice(`${t('stress_test.cleanup_success', 'Pomyślnie usunięto zamówienia testowe.')} (${res.deletedCount ?? 0})`);
        setStats((prev) => (prev ? { ...prev, testOrdersCount: 0 } : null));
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Stats & Safe Mode indicator */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-neutral-900">{t('stress_test.title', 'Stress Test Wydajności (100 000 / min)')}</h2>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                🛡️ {t('stress_test.safe_mode_badge', 'Bezpieczne Środowisko')}
              </span>
            </div>
            <p className="text-xs text-neutral-500">{t('stress_test.subtitle', 'Symulator obciążenia stadionu. Bezpiecznie przetestuj maksymalną przepustowość.')}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="rounded-lg bg-neutral-50 px-3 py-2 border border-neutral-200">
            <span className="text-neutral-500">{t('stress_test.db_ping', 'Ping Bazy')}: </span>
            <span className="font-bold text-neutral-900">{stats?.dbPingMs ?? '—'} ms</span>
          </div>
          <div className="rounded-lg bg-neutral-50 px-3 py-2 border border-neutral-200">
            <span className="text-neutral-500">{t('stress_test.test_orders_in_db', 'Zamówienia testowe w DB')}: </span>
            <span className={`font-bold ${(stats?.testOrdersCount ?? 0) > 0 ? 'text-amber-600' : 'text-neutral-900'}`}>
              {stats?.testOrdersCount ?? 0}
            </span>
          </div>
          {(stats?.testOrdersCount ?? 0) > 0 && (
            <button
              onClick={handleCleanup}
              disabled={isCleaning}
              className="rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-2 font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {isCleaning ? t('stress_test.cleanup_running', 'Czyszczenie...') : t('stress_test.cleanup_btn', 'Wyczyść bazę')}
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 flex items-center gap-2">
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}
      {successNotice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 flex items-center gap-2">
          <span>✅</span>
          <span>{successNotice}</span>
        </div>
      )}

      {/* Main Grid: Controls & Live Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Parameter Configuration */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs space-y-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500">Parametry Testu</h3>

            {/* Presets */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-700 block">Szybkie Presety:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handlePreset(50, 5, 'in_memory')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    count === 50 && mode === 'in_memory'
                      ? 'border-brand bg-brand/5 text-brand shadow-xs'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  🟢 Szybki (50)
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset(250, 15, 'in_memory')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    count === 250 && mode === 'in_memory'
                      ? 'border-brand bg-brand/5 text-brand shadow-xs'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  🟡 Średni (250)
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset(1000, 30, 'in_memory')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    count === 1000 && mode === 'in_memory'
                      ? 'border-brand bg-brand/5 text-brand shadow-xs'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  🟠 Max (1 000)
                </button>
              </div>
            </div>

            {/* Brand Select */}
            {stats?.brands && stats.brands.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-700 block">Marka (Brand):</label>
                <select
                  value={brandId}
                  onChange={(e) => setBrandId(Number(e.target.value))}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  {stats.brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Mode Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-700 block">{t('stress_test.mode', 'Tryb testu')}:</label>
              <div className="space-y-2">
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    mode === 'in_memory'
                      ? 'border-brand bg-brand/5'
                      : 'border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="testMode"
                    value="in_memory"
                    checked={mode === 'in_memory'}
                    onChange={() => setMode('in_memory')}
                    className="mt-1 text-brand focus:ring-brand"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-neutral-900 block">{t('stress_test.mode_in_memory', '⚡ In-Memory Engine (Dry Run)')}</span>
                    <span className="text-neutral-500 mt-0.5 block">{t('stress_test.mode_in_memory_desc', 'Mierzy czystą przepustowość silnika obliczeniowego i logiki zamówień.')}</span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    mode === 'synthetic_db'
                      ? 'border-brand bg-brand/5'
                      : 'border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="testMode"
                    value="synthetic_db"
                    checked={mode === 'synthetic_db'}
                    onChange={() => setMode('synthetic_db')}
                    className="mt-1 text-brand focus:ring-brand"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-neutral-900 block">{t('stress_test.mode_synthetic_db', '💾 Transakcyjna Baza Danych (Test ACID DB)')}</span>
                    <span className="text-neutral-500 mt-0.5 block">{t('stress_test.mode_synthetic_db_desc', 'Tworzy rzeczywiste rekordy w tabeli orders z oznaczeniem "test".')}</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Count Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <label className="font-bold text-neutral-700">{t('stress_test.orders_count', 'Liczba zamówień')}:</label>
                <span className="font-mono font-bold text-neutral-900">{count} szt.</span>
              </div>
              <input
                type="range"
                min="10"
                max="1000"
                step="10"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
                <span>10</span>
                <span>250</span>
                <span>500</span>
                <span>1 000 (Safe Max)</span>
              </div>
            </div>

            {/* Concurrency Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <label className="font-bold text-neutral-700">{t('stress_test.concurrency', 'Równoległe strumienie')}:</label>
                <span className="font-mono font-bold text-neutral-900">{concurrency} workers</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
                <span>1</span>
                <span>10</span>
                <span>25</span>
                <span>50 (Max)</span>
              </div>
            </div>

            {/* Auto Cleanup checkbox */}
            {mode === 'synthetic_db' && (
              <label className="flex items-center gap-2 p-3 rounded-xl bg-amber-50/50 border border-amber-200 cursor-pointer text-xs select-none">
                <input
                  type="checkbox"
                  checked={autoCleanup}
                  onChange={(e) => setAutoCleanup(e.target.checked)}
                  className="rounded text-brand focus:ring-brand"
                />
                <span className="font-bold text-amber-900">{t('stress_test.auto_cleanup', 'Automatycznie usuń zamówienia testowe po pomiarze')}</span>
              </label>
            )}

            {/* Submit Button */}
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="w-full py-3.5 rounded-xl bg-neutral-900 hover:bg-black text-white font-bold text-sm shadow-md transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isRunning ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>{t('stress_test.running', 'Wykonywanie testu obciążeniowego...')}</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>{t('stress_test.start_btn', 'Uruchom Stress Test')} ({count} zamówień)</span>
                </>
              )}
            </button>
          </div>

          {/* Safety rules info box */}
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-2 text-xs text-neutral-600">
            <h4 className="font-bold text-neutral-800 flex items-center gap-1.5">
              <span>🛡️</span>
              <span>{t('stress_test.safety_rules_title', 'Zasady bezpieczeństwa')}</span>
            </h4>
            <ul className="space-y-1 text-[11px] list-disc list-inside">
              <li>{t('stress_test.safety_rules_1', 'Limit partii: Max 1 000 zamówień na test.')}</li>
              <li>{t('stress_test.safety_rules_2', 'Izolacja: Rekordy mają order_type="test".')}</li>
              <li>{t('stress_test.safety_rules_3', 'Auto-cleanup: Natychmiastowe czyszczenie bazy.')}</li>
              <li>{t('stress_test.safety_rules_4', 'In-Memory Dry Run: Badanie CPU bez I/O dysku.')}</li>
            </ul>
          </div>
        </div>

        {/* Right Column: Live Benchmark Results & Stadium Target Gauge */}
        <div className="lg:col-span-7 space-y-5">
          {result ? (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Stadium 100k Target Gauge */}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-900 text-white p-6 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                    {t('stress_test.target_gauge', 'Cel stadionu (100 000 / min)')}
                  </span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand text-brand-text">
                    {result.mode === 'in_memory' ? 'In-Memory Dry Run' : 'PostgreSQL ACID'}
                  </span>
                </div>

                <div className="flex items-baseline gap-3">
                  <span className="text-4xl sm:text-5xl font-mono font-black text-white">
                    {result.projectedPerMinute.toLocaleString()}
                  </span>
                  <span className="text-sm text-neutral-400 font-medium">zamówień / minutę</span>
                </div>

                {/* Progress bar towards 100,000 / min */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-neutral-300">Przepustowość wzgl. celu 100k:</span>
                    <span className="text-emerald-400">{result.stadiumTargetPct}%</span>
                  </div>
                  <div className="h-3 w-full bg-neutral-800 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-brand to-emerald-400 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(result.stadiumTargetPct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center shadow-xs">
                  <span className="text-[11px] font-bold text-neutral-500 uppercase block">{t('stress_test.rps', 'RPS')}</span>
                  <span className="text-2xl font-mono font-black text-neutral-900 mt-1 block">
                    {result.ordersPerSecond}
                  </span>
                  <span className="text-[10px] text-neutral-400 font-medium">req / sec</span>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center shadow-xs">
                  <span className="text-[11px] font-bold text-neutral-500 uppercase block">Czas partii</span>
                  <span className="text-2xl font-mono font-black text-neutral-900 mt-1 block">
                    {(result.totalDurationMs / 1000).toFixed(2)}s
                  </span>
                  <span className="text-[10px] text-neutral-400 font-medium">{result.actualCount} reqs</span>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center shadow-xs">
                  <span className="text-[11px] font-bold text-neutral-500 uppercase block">{t('stress_test.latency_avg', 'Średnia')}</span>
                  <span className="text-2xl font-mono font-black text-neutral-900 mt-1 block">
                    {result.latencies.avg} ms
                  </span>
                  <span className="text-[10px] text-neutral-400 font-medium">Avg per req</span>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center shadow-xs">
                  <span className="text-[11px] font-bold text-neutral-500 uppercase block">{t('stress_test.latency_p95', 'P95')}</span>
                  <span className="text-2xl font-mono font-black text-emerald-600 mt-1 block">
                    {result.latencies.p95} ms
                  </span>
                  <span className="text-[10px] text-neutral-400 font-medium">95% żądań</span>
                </div>
              </div>

              {/* Latency Percentile Breakdown Card */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Rozkład opóźnień (Latency Percentiles)
                </h4>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                    <span className="text-[10px] font-bold text-neutral-400 block">MIN</span>
                    <span className="text-sm font-mono font-bold text-neutral-900">{result.latencies.min} ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                    <span className="text-[10px] font-bold text-neutral-400 block">P50</span>
                    <span className="text-sm font-mono font-bold text-neutral-900">{result.latencies.p50} ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                    <span className="text-[10px] font-bold text-neutral-400 block">AVG</span>
                    <span className="text-sm font-mono font-bold text-neutral-900">{result.latencies.avg} ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                    <span className="text-[10px] font-bold text-neutral-400 block">P90</span>
                    <span className="text-sm font-mono font-bold text-neutral-900">{result.latencies.p90} ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                    <span className="text-[10px] font-bold text-neutral-400 block">P95</span>
                    <span className="text-sm font-mono font-bold text-emerald-600">{result.latencies.p95} ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                    <span className="text-[10px] font-bold text-neutral-400 block">P99</span>
                    <span className="text-sm font-mono font-bold text-amber-600">{result.latencies.p99} ms</span>
                  </div>
                </div>

                {/* Additional diagnostic stats */}
                <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between text-xs text-neutral-500">
                  <span>Sukces: <strong className="text-neutral-900">{result.successfulOrders}</strong> / {result.actualCount} ({((result.successfulOrders / result.actualCount) * 100).toFixed(1)}%)</span>
                  <span>Zużycie pamięci RAM: <strong className="text-neutral-900">{result.memoryDeltaMb > 0 ? `+${result.memoryDeltaMb}` : result.memoryDeltaMb} MB</strong></span>
                  {result.autoCleanedCount > 0 && (
                    <span className="text-emerald-600 font-semibold">🧹 Auto-oczyszczono {result.autoCleanedCount} rekordów</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white p-12 text-center space-y-3">
              <span className="text-4xl block">📊</span>
              <h3 className="text-base font-bold text-neutral-800">Gotowy do wykonania testu</h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Wybierz parametry po lewej stronie i kliknij <strong>&quot;Uruchom Stress Test&quot;</strong>, aby zmierzyć rzeczywistą przepustowość systemu 100k.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
