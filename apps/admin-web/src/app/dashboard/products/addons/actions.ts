'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminApi } from '@/lib/api'

async function failTo(path: string, res: Response, fallback: string): Promise<never> {
  const j = await res.json().catch(() => ({} as any))
  const msg = j?.errors ? Object.values(j.errors).join(' ') : j?.message || fallback
  redirect(`${path}?error=${encodeURIComponent(String(msg))}`)
}

function groupBody(f: FormData): Record<string, unknown> {
  return {
    name: String(f.get('name') || '').trim(),
    selection_mode: String(f.get('selection_mode') || 'single'),
    required: f.get('required') === 'on',
    min_select: String(f.get('min_select') ?? '0').trim(),
    max_select: String(f.get('max_select') ?? '').trim() || null,
    position: String(f.get('position') ?? '0').trim(),
  }
}

function optionBody(f: FormData): Record<string, unknown> {
  return {
    name: String(f.get('name') || '').trim(),
    price_delta: String(f.get('price_delta') ?? '0').trim(),
    position: String(f.get('position') ?? '0').trim(),
    is_available: f.get('is_available') === 'on',
    stock_quantity: String(f.get('stock_quantity') ?? '').trim() || null,
  }
}

export async function createGroup(formData: FormData): Promise<void> {
  const res = await adminApi('/addon-groups', { method: 'POST', body: JSON.stringify(groupBody(formData)) })
  if (!res.ok) await failTo('/dashboard/products/addons', res, 'Failed to create add-on group')
  revalidatePath('/dashboard/products/addons')
  redirect('/dashboard/products/addons?notice=' + encodeURIComponent('Add-on group created'))
}

export async function updateGroup(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const res = await adminApi(`/addon-groups/${id}`, { method: 'PUT', body: JSON.stringify(groupBody(formData)) })
  if (!res.ok) await failTo('/dashboard/products/addons', res, 'Failed to update add-on group')
  revalidatePath('/dashboard/products/addons')
  redirect('/dashboard/products/addons?notice=' + encodeURIComponent('Add-on group updated'))
}

export async function deleteGroup(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const res = await adminApi(`/addon-groups/${id}`, { method: 'DELETE' })
  if (!res.ok) await failTo('/dashboard/products/addons', res, 'Failed to delete add-on group')
  revalidatePath('/dashboard/products/addons')
  redirect('/dashboard/products/addons?notice=' + encodeURIComponent('Add-on group deleted'))
}

export async function createOption(formData: FormData): Promise<void> {
  const groupId = String(formData.get('group_id') || '')
  const res = await adminApi(`/addon-groups/${groupId}/options`, { method: 'POST', body: JSON.stringify(optionBody(formData)) })
  if (!res.ok) await failTo('/dashboard/products/addons', res, 'Failed to add option')
  revalidatePath('/dashboard/products/addons')
  redirect('/dashboard/products/addons?notice=' + encodeURIComponent('Option added'))
}

export async function updateOption(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const res = await adminApi(`/addon-options/${id}`, { method: 'PUT', body: JSON.stringify(optionBody(formData)) })
  if (!res.ok) await failTo('/dashboard/products/addons', res, 'Failed to update option')
  revalidatePath('/dashboard/products/addons')
  redirect('/dashboard/products/addons?notice=' + encodeURIComponent('Option updated'))
}

export async function deleteOption(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const res = await adminApi(`/addon-options/${id}`, { method: 'DELETE' })
  if (!res.ok) await failTo('/dashboard/products/addons', res, 'Failed to delete option')
  revalidatePath('/dashboard/products/addons')
  redirect('/dashboard/products/addons?notice=' + encodeURIComponent('Option deleted'))
}

// Parse trg_<lang>_group_name + tro_<lang>_<opt>_name back into the nested
// payload the addon-group translations endpoint expects. Empty fields are
// silently dropped so the backend just clears them.
export async function saveGroupTranslations(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const translations: Record<string, { group_name?: string; options: Record<string, string> }> = {}
  for (const [k, v] of formData.entries()) {
    const val = String(v ?? '').trim()
    if (!val) continue
    if (k.startsWith('trg_')) {
      const rest = k.slice(4) // "<lang>_group_name"
      const usc = rest.indexOf('_')
      if (usc < 0) continue
      const lang = rest.slice(0, usc)
      ;(translations[lang] ??= { options: {} }).group_name = val
    } else if (k.startsWith('tro_')) {
      // tro_<lang>_<option_id>_name
      const rest = k.slice(4)
      const firstUsc = rest.indexOf('_')
      if (firstUsc < 0) continue
      const lang = rest.slice(0, firstUsc)
      const tail = rest.slice(firstUsc + 1) // "<option_id>_name"
      const m = tail.match(/^(\d+)_name$/)
      if (!m) continue
      const optionId = m[1]
      ;(translations[lang] ??= { options: {} }).options[optionId] = val
    }
  }
  const res = await adminApi(`/addon-groups/${id}/translations`, {
    method: 'PUT',
    body: JSON.stringify({ translations }),
  })
  if (!res.ok) await failTo('/dashboard/products/addons', res, 'Failed to save translations')
  revalidatePath('/dashboard/products/addons')
  redirect('/dashboard/products/addons?notice=' + encodeURIComponent('Translations saved'))
}
