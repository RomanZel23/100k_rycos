'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminApi } from '@/lib/api'

// Parse `tr_<lang>_<attr>` form fields back into a nested object the admin-api
// understands. We deliberately filter out empty values so a blank translation
// field effectively *clears* that attribute for that language (the backend does
// delete-then-insert on save). If no tr_* fields are present in the form,
// returns null — the caller should then omit the `translations` key entirely
// to avoid wiping existing translations when a form without the tabs submits.
function parseTranslations(f: FormData): Record<string, Record<string, string>> | null {
  const out: Record<string, Record<string, string>> = {}
  let saw = false
  for (const [k, v] of f.entries()) {
    if (!k.startsWith('tr_')) continue
    saw = true
    const rest = k.slice(3)
    const sep = rest.indexOf('_')
    if (sep < 0) continue
    const lang = rest.slice(0, sep)
    const attr = rest.slice(sep + 1)
    const value = String(v ?? '').trim()
    if (!value) continue
    ;(out[lang] ??= {})[attr] = value
  }
  return saw ? out : null
}

function productBody(f: FormData) {
  const num = (k: string) => {
    const v = String(f.get(k) ?? '').trim()
    return v === '' ? undefined : Number(v)
  }
  const numNullable = (k: string) => {
    const v = String(f.get(k) ?? '').trim()
    return v === '' ? null : Number(v)
  }
  const translations = parseTranslations(f)
  const taxVal = num('tax')
  const prepVal = numNullable('prep_time')
  const isAvailable = f.get('is_available') === 'on'
  const isAgeRestricted = f.get('is_age_restricted') === 'on'

  const body: Record<string, unknown> = {
    name: String(f.get('name') || '').trim(),
    description: String(f.get('description') || '').trim() || undefined,
    price: num('price'),
    // Hashtag categories (find-or-create handled by admin-api).
    category_names: f.getAll('category_name').map(String).map((s) => s.trim()).filter(Boolean),
    tax: taxVal,
    taxRate: taxVal,
    tax_rate: taxVal,
    prep_time: prepVal,
    prepTimeMinutes: prepVal,
    // has_addons / is_delivered hidden for now — not sent, so existing DB values are preserved.
    is_available: isAvailable,
    isAvailable: isAvailable,
    is_age_restricted: isAgeRestricted,
    isAgeRestricted: isAgeRestricted,
    barcode: String(f.get('barcode') || '').trim() || undefined,
    sku: String(f.get('sku') || '').trim() || undefined,
  }
  if (translations !== null) body.translations = translations
  return body
}

export async function createProduct(formData: FormData): Promise<void> {
  const res = await adminApi('/products', { method: 'POST', body: JSON.stringify(productBody(formData)) })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    redirect('/dashboard/products?error=' + encodeURIComponent(j?.message || 'Failed to create product'))
  }
  revalidatePath('/dashboard/products')
  redirect('/dashboard/products')
}

export async function updateProduct(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const res = await adminApi(`/products/${id}`, { method: 'PUT', body: JSON.stringify(productBody(formData)) })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    redirect(`/dashboard/products/${id}?error=` + encodeURIComponent(j?.message || 'Failed to save'))
  }
  revalidatePath('/dashboard/products')
  revalidatePath(`/dashboard/products/${id}`)
  redirect(`/dashboard/products/${id}?notice=` + encodeURIComponent('Product saved'))
}

export async function deleteProduct(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  await adminApi(`/products/${id}`, { method: 'DELETE' })
  revalidatePath('/dashboard/products')
}

export async function toggleAvailability(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  await adminApi(`/products/${id}/availability`, { method: 'PUT' })
  revalidatePath('/dashboard/products')
}

export async function uploadImage(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const file = formData.get('image')
  if (file && file instanceof File && file.size > 0) {
    const fd = new FormData()
    fd.append('image', file)
    await adminApi(`/products/${id}/image`, { method: 'POST', body: fd })
  }
  revalidatePath('/dashboard/products')
  redirect(`/dashboard/products/${id}`)
}

export async function addCategory(formData: FormData): Promise<void> {
  const name = String(formData.get('name') || '').trim()
  if (name) await adminApi('/categories', { method: 'POST', body: JSON.stringify({ name }) })
  revalidatePath('/dashboard/products')
}

export async function deleteCategory(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  await adminApi(`/categories/${id}`, { method: 'DELETE' })
  revalidatePath('/dashboard/products')
}
