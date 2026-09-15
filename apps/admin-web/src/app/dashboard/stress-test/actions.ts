'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, adminApiData } from '@/lib/api';

export interface StressTestStats {
  dbPingMs: number;
  testOrdersCount: number;
  brands: { id: number; name: string; slug: string }[];
  serverMemoryMb: number;
  nodeEnv: string;
  maxSafeChunk: number;
  maxSafeConcurrency: number;
}

export interface StressTestResult {
  count: number;
  actualCount: number;
  concurrency: number;
  mode: 'in_memory' | 'synthetic_db';
  successfulOrders: number;
  failedOrders: number;
  totalDurationMs: number;
  ordersPerSecond: number;
  projectedPerMinute: number;
  stadiumTargetPct: number;
  latencies: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  memoryDeltaMb: number;
  autoCleanedCount: number;
  errors: string[];
}

export async function fetchStressTestStats(): Promise<StressTestStats | null> {
  return adminApiData<StressTestStats>('/stress-test/stats');
}

export async function runStressTest(params: {
  brandId?: number;
  count: number;
  concurrency: number;
  mode: 'in_memory' | 'synthetic_db';
  autoCleanup: boolean;
}): Promise<{ success: boolean; data?: StressTestResult; error?: string }> {
  try {
    const res = await adminApi('/stress-test/run', {
      method: 'POST',
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err?.message || 'Błąd wykonania stress testu' };
    }

    const json = await res.json();
    revalidatePath('/dashboard/stress-test');
    return { success: true, data: json.data as StressTestResult };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Błąd połączenia z serwerem testowym' };
  }
}

export async function cleanupTestOrders(): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  try {
    const res = await adminApi('/stress-test/cleanup', {
      method: 'POST',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err?.message || 'Błąd czyszczenia bazy' };
    }

    const json = await res.json();
    revalidatePath('/dashboard/stress-test');
    return { success: true, deletedCount: json.data?.deletedCount ?? 0 };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Błąd połączenia z bazą danych' };
  }
}
