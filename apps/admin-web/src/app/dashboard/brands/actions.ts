'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminApi } from '@/lib/api'

async function failTo(path: string, res: Response, fallback: string): Promise<never> {
  const j = await res.json().catch(() => ({} as any))
  const msg = j?.errors ? Object.values(j.errors).join(' ') : j?.message || fallback
  redirect(`${path}?error=${encodeURIComponent(String(msg))}`)
}

export async function createBrand(formData: FormData): Promise<void> {
  const name = String(formData.get('name') || '').trim()
  const slug = String(formData.get('slug') || formData.get('qr_slug') || '').trim()
  const res = await adminApi('/brands', { method: 'POST', body: JSON.stringify({ name, slug: slug || undefined }) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) redirect('/dashboard/brands?error=' + encodeURIComponent(json?.message || 'Could not create brand'))
  revalidatePath('/dashboard/brands')
  redirect(`/dashboard/brands/${json.data.id}?notice=` + encodeURIComponent('Brand created'))
}

// Routing (location_id/terminal_id), location_description and delivery_required
// were removed from the brand UI — routing moves to the upcoming "QR Print"
// section. Only send what the form still edits.
const DETAIL_FIELDS = ['name', 'slug', 'qr_slug', 'menu_layout', 'language', 'currency', 'active_button_color', 'background_button_color']

export async function updateBrand(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const body: Record<string, unknown> = {}
  for (const f of DETAIL_FIELDS) {
    const v = formData.get(f)
    if (v !== null) body[f] = String(v)
  }
  if (formData.has('is_active')) {
    body.is_active = formData.get('is_active') === 'on' || formData.get('is_active') === 'true'
  }
  body.allow_pay_at_counter = formData.get('allow_pay_at_counter') === 'on' || formData.get('allow_pay_at_counter') === 'true'
  if (formData.has('location_id')) {
    const loc = String(formData.get('location_id') || '').trim()
    body.location_id = loc ? parseInt(loc, 10) : null
  }
  if (formData.has('tables')) {
    const rawTables = String(formData.get('tables') || '').trim()
    body.tables = rawTables ? rawTables.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : null
  }
  if (formData.has('has_product_picker') || formData.has('product_id')) {
    const product_ids = formData.getAll('product_id').map((x) => parseInt(String(x))).filter((n) => !Number.isNaN(n))
    body.product_ids = product_ids
  }
  const res = await adminApi(`/brands/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (!res.ok) await failTo(`/dashboard/brands/${id}`, res, 'Failed to save brand details')
  revalidatePath('/dashboard/brands')
  revalidatePath(`/dashboard/brands/${id}`)
  redirect(`/dashboard/brands/${id}?notice=` + encodeURIComponent('Zmiany zostały pomyślnie zapisane'))
}

export async function toggleBrandStatus(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const currentActive = formData.get('is_active') === 'true' || formData.get('is_active') === '1'
  const newActive = !currentActive
  const res = await adminApi(`/brands/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: newActive }),
  })
  if (!res.ok) await failTo('/dashboard/brands', res, 'Failed to update brand status')
  revalidatePath('/dashboard/brands')
  revalidatePath(`/dashboard/brands/${id}`)
  redirect('/dashboard/brands?notice=' + encodeURIComponent(`Marka została ${newActive ? 'aktywowana' : 'dezaktywowana'}`))
}

export async function assignProducts(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const product_ids = formData.getAll('product_id').map((x) => parseInt(String(x))).filter((n) => !Number.isNaN(n))
  const res = await adminApi(`/brands/${id}/products`, { method: 'PUT', body: JSON.stringify({ product_ids }) })
  if (!res.ok) await failTo(`/dashboard/brands/${id}`, res, 'Failed to save menu')
  revalidatePath('/dashboard/brands')
  revalidatePath(`/dashboard/brands/${id}`)
  redirect(`/dashboard/brands/${id}?notice=` + encodeURIComponent(`Karta dań została zapisana (${product_ids.length} ${product_ids.length === 1 ? 'pozycja' : 'pozycji'})`))
}

export async function uploadBrandImage(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const type = String(formData.get('type') || 'logo')
  const file = formData.get('image')
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/dashboard/brands/${id}?error=` + encodeURIComponent('Pick an image file before uploading'))
  }
  const fd = new FormData()
  fd.append('image', file as File)
  const res = await adminApi(`/brands/${id}/image?type=${encodeURIComponent(type)}`, { method: 'POST', body: fd })
  if (!res.ok) await failTo(`/dashboard/brands/${id}`, res, `Failed to upload ${type} image`)
  revalidatePath(`/dashboard/brands/${id}`)
  redirect(`/dashboard/brands/${id}?notice=` + encodeURIComponent(`${type.charAt(0).toUpperCase() + type.slice(1)} image uploaded`))
}

export async function deleteBrand(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const res = await adminApi(`/brands/${id}`, { method: 'DELETE' })
  if (!res.ok) await failTo(`/dashboard/brands/${id}`, res, 'Failed to delete brand')
  revalidatePath('/dashboard/brands')
  redirect('/dashboard/brands?notice=' + encodeURIComponent('Brand deleted'))
}
