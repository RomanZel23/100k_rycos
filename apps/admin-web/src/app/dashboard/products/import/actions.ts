'use server'

import { revalidatePath } from 'next/cache'
import { adminApi } from '@/lib/api'

export interface DraftItem {
  category: string | null
  name: string
  description: string | null
  price: number | null
  taxRate: number
  barcode: string | null
  warnings: string[]
}

export interface MenuDraft {
  items: DraftItem[]
  warnings: string[]
  meta: { rows: number; delimiter: string; encoding: string; columns: Record<string, string | null> }
}

export interface ActionResult<T> {
  ok: boolean
  data?: T
  error?: string
}

async function callApi<T>(path: string, body: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<ActionResult<T>> {
  try {
    const res = await adminApi(path, { method, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({} as any))
    if (!res.ok || json?.success === false) {
      const message = json?.errors ? Object.values(json.errors).join(' ') : json?.message || json?.error
      return { ok: false, error: message || `Błąd ${res.status}` }
    }
    return { ok: true, data: json.data as T }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Brak połączenia z API' }
  }
}

/** Plik CSV → draft do korekty. */
export async function parseFileAction(filename: string, contentBase64: string): Promise<ActionResult<MenuDraft>> {
  return callApi<MenuDraft>('/menu-import/parse', { filename, content_base64: contentBase64 })
}

/** Zdjęcia lub PDF karty → draft do korekty. promptOverride działa tylko dla operatora platformy. */
export async function analyzeImagesAction(
  images: { filename: string; mime_type: string; content_base64: string }[],
  promptOverride?: string
): Promise<ActionResult<MenuDraft>> {
  return callApi<MenuDraft>('/menu-import/analyze-images', {
    images,
    ...(promptOverride ? { prompt_override: promptOverride } : {}),
  })
}

/** Zatwierdzony draft → produkty w menu wybranej marki. */
export async function commitAction(
  brandId: number,
  items: DraftItem[]
): Promise<ActionResult<{ createdProducts: number; createdCategories: number; skipped: { name: string; reason: string }[] }>> {
  const result = await callApi<{ createdProducts: number; createdCategories: number; skipped: { name: string; reason: string }[] }>(
    '/menu-import/commit',
    { brand_id: brandId, items }
  )
  if (result.ok) {
    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard/products/import')
  }
  return result
}

/** Zapis promptu odczytu karty (operator platformy); pusty tekst przywraca wbudowany. */
export async function savePromptAction(prompt: string | null): Promise<ActionResult<{ prompt: string; source: string }>> {
  return callApi<{ prompt: string; source: string }>('/menu-import/prompt', { prompt }, 'PUT')
}
