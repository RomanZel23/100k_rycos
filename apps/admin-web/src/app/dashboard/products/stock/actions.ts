'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminApi } from '@/lib/api'

async function failTo(path: string, res: Response, fallback: string): Promise<never> {
  const j = await res.json().catch(() => ({} as any))
  const msg = j?.errors ? Object.values(j.errors).join(' ') : j?.message || fallback
  redirect(`${path}?error=${encodeURIComponent(String(msg))}`)
}

export async function saveStock(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const name = String(formData.get('name') || 'product')
  const rawStock = String(formData.get('stock_quantity') ?? '').trim()
  const body: Record<string, unknown> = {
    is_available: formData.get('is_available') === 'on',
    stock_quantity: rawStock === '' ? null : rawStock,
  }
  const res = await adminApi(`/products/${id}/stock`, { method: 'PUT', body: JSON.stringify(body) })
  if (!res.ok) await failTo('/dashboard/products/stock', res, `Nie udało się zapisać: ${name}`)
  revalidatePath('/dashboard/products/stock')
  redirect('/dashboard/products/stock?notice=' + encodeURIComponent(`Zapisano: ${name}`))
}
