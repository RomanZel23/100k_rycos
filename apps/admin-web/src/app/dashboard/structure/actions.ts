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
