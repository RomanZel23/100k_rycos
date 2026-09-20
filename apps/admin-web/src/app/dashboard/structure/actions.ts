'use server'

import { revalidatePath } from 'next/cache'
import { adminApi } from '@/lib/api'
import type { ApiStructure, toSavePayload } from './model'

export interface SaveResult {
  ok: boolean
  message?: string
  errors?: Record<string, string>
  data?: ApiStructure
}

export async function saveStructure(payload: ReturnType<typeof toSavePayload>): Promise<SaveResult> {
  try {
    const res = await adminApi('/structure', { method: 'PUT', body: JSON.stringify(payload) })
    const json = await res.json().catch(() => ({} as any))
    if (!res.ok) {
      return { ok: false, message: json?.message || `Błąd zapisu (HTTP ${res.status})`, errors: json?.errors }
    }
    revalidatePath('/dashboard/structure')
    revalidatePath('/dashboard/terminals')
    return { ok: true, data: json.data as ApiStructure }
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Brak połączenia z API' }
  }
}

export interface LiveStatus {
  server_time: string
  terminals: Record<string, { status: string; last_active: string | null; online: boolean }>
  devices: Record<string, { online: boolean; last_seen: string | null }>
}

/** Lightweight live status (heartbeats of stations, online flag of fiscal devices). */
export async function fetchStructureStatus(): Promise<LiveStatus | null> {
  try {
    const res = await adminApi('/structure/status')
    if (!res.ok) return null
    const json = await res.json()
    return (json?.data ?? null) as LiveStatus
  } catch {
    return null
  }
}
