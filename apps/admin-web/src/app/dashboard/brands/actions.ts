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
  const res = await adminApi('/brands', { method: 'POST', body: JSON.stringify({ name }) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) redirect('/dashboard/brands?error=' + encodeURIComponent(json?.message || 'Could not create brand'))
  revalidatePath('/dashboard/brands')
  redirect(`/dashboard/brands/${json.data.id}?notice=` + encodeURIComponent('Brand created'))
}

// Routing (location_id/terminal_id), location_description and delivery_required
// were removed from the brand UI — routing moves to the upcoming "QR Print"
// section. Only send what the form still edits.
const DETAIL_FIELDS = ['name', 'menu_layout', 'language', 'currency', 'active_button_color', 'background_button_color']

export async function updateBrand(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const body: Record<string, unknown> = {}
  for (const f of DETAIL_FIELDS) {
    const v = formData.get(f)
    if (v !== null) body[f] = String(v)
  }
  const res = await adminApi(`/brands/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (!res.ok) await failTo(`/dashboard/brands/${id}`, res, 'Failed to save brand details')
  revalidatePath(`/dashboard/brands/${id}`)
  redirect(`/dashboard/brands/${id}?notice=` + encodeURIComponent('Details saved'))
}

export async function assignProducts(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const product_ids = formData.getAll('product_id').map((x) => parseInt(String(x))).filter((n) => !Number.isNaN(n))
  const res = await adminApi(`/brands/${id}/products`, { method: 'PUT', body: JSON.stringify({ product_ids }) })
  if (!res.ok) await failTo(`/dashboard/brands/${id}`, res, 'Failed to save menu')
  revalidatePath(`/dashboard/brands/${id}`)
  redirect(`/dashboard/brands/${id}?notice=` + encodeURIComponent(`Menu saved (${product_ids.length} product${product_ids.length === 1 ? '' : 's'})`))
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
