'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminApi } from '@/lib/api'

async function failTo(path: string, res: Response, fallback: string): Promise<never> {
  const j = await res.json().catch(() => ({} as any))
  const msg = j?.errors ? Object.values(j.errors).join(' ') : j?.message || fallback
  redirect(`${path}?error=${encodeURIComponent(String(msg))}`)
}

// Parse the assignment form into the shape /products/:id/addons expects.
//   - `group` checkboxes (value = group_id) are the chosen groups in their
//      DOM order, which we treat as display order.
//   - `override_<option_id>` inputs hold per-option price overrides; empty
//      means "no override, use default".
export async function saveProductAddons(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const groupIds = formData.getAll('group').map((g) => parseInt(String(g))).filter(Number.isFinite)

  const overrides: Record<string, number> = {}
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith('override_')) continue
    const oid = k.slice('override_'.length)
    const raw = String(v ?? '').trim()
    if (raw === '') continue
    const n = parseFloat(raw)
    if (Number.isFinite(n)) overrides[oid] = n
  }

  const res = await adminApi(`/products/${id}/addons`, {
    method: 'PUT',
    body: JSON.stringify({ group_ids: groupIds, price_overrides: overrides }),
  })
  if (!res.ok) await failTo(`/dashboard/products/${id}/addons`, res, 'Failed to save add-ons')
  revalidatePath(`/dashboard/products/${id}`)
  revalidatePath(`/dashboard/products/${id}/addons`)
  redirect(`/dashboard/products/${id}/addons?notice=` + encodeURIComponent('Add-ons saved'))
}
