'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminApi } from '@/lib/api'

export async function createTerminal(formData: FormData): Promise<void> {
  const customId = String(formData.get('terminal_id') || '').trim()
  const role = String(formData.get('role') || 'all_in_one').trim()
  
  const roleDefaults: Record<string, any> = {
    all_in_one: { can_sell: true, can_kds: true, can_pickup: true, has_softpos: true, has_printer: true },
    pos: { can_sell: true, can_kds: false, can_pickup: true, has_softpos: true, has_printer: true },
    kds: { can_sell: false, can_kds: true, can_pickup: true, has_softpos: false, has_printer: false },
    pickup: { can_sell: false, can_kds: false, can_pickup: true, has_softpos: false, has_printer: false },
    kiosk: { can_sell: true, can_kds: false, can_pickup: false, has_softpos: false, has_printer: false },
    fiscal_hub: { can_sell: false, can_kds: false, can_pickup: false, has_softpos: false, has_printer: false },
  }

  const body = {
    name: String(formData.get('name') || '').trim(),
    role,
    capabilities: roleDefaults[role] || roleDefaults.all_in_one,
    location_id: formData.get('location_id') ? Number(formData.get('location_id')) : null,
    printer_device_id: formData.get('printer_device_id') ? String(formData.get('printer_device_id')).trim() : null,
    tap_device_id: formData.get('tap_device_id') ? String(formData.get('tap_device_id')).trim() : null,
    fiscal_device_id: formData.get('fiscal_device_id') ? String(formData.get('fiscal_device_id')).trim() : null,
    ...(customId ? { terminal_id: customId } : {}),
  }
  const res = await adminApi('/terminals', { method: 'POST', body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) redirect('/dashboard/terminals?error=' + encodeURIComponent(json?.message || 'Could not create terminal'))
  revalidatePath('/dashboard/terminals')
  redirect(`/dashboard/terminals/${json.data.id}`)
}

export async function updateTerminal(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const role = String(formData.get('role') || 'all_in_one').trim()
  
  // Brands handling:
  // If 'all_brands' checkbox is checked, assigned_brand_ids is [] (meaning all brands in location).
  // Otherwise, collect all checked 'assigned_brand_ids'.
  const allBrands = formData.get('all_brands') === 'on' || formData.get('all_brands') === 'true'
  const brandIdsRaw = formData.getAll('assigned_brand_ids')
  const assignedBrandIds = allBrands
    ? []
    : brandIdsRaw.map((x) => parseInt(String(x), 10)).filter((n) => !isNaN(n))

  const capabilities = {
    can_sell: formData.get('cap_sell') === 'on' || formData.get('cap_sell') === 'true',
    can_kds: formData.get('cap_kds') === 'on' || formData.get('cap_kds') === 'true',
    can_pickup: formData.get('cap_pickup') === 'on' || formData.get('cap_pickup') === 'true',
    has_softpos: formData.get('cap_softpos') === 'on' || formData.get('cap_softpos') === 'true',
    has_printer: formData.get('cap_printer') === 'on' || formData.get('cap_printer') === 'true',
  }

  const body: Record<string, unknown> = {
    name: String(formData.get('name') || '').trim(),
    role,
    location_id: formData.get('location_id') ? Number(formData.get('location_id')) : null,
    assigned_brand_ids: assignedBrandIds,
    printer_device_id: formData.get('printer_device_id') ? String(formData.get('printer_device_id')).trim() : null,
    tap_device_id: formData.get('tap_device_id') ? String(formData.get('tap_device_id')).trim() : null,
    fiscal_device_id: formData.get('fiscal_device_id') ? String(formData.get('fiscal_device_id')).trim() : null,
    capabilities,
  }

  const res = await adminApi(`/terminals/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    redirect(`/dashboard/terminals/${id}?error=` + encodeURIComponent(json?.message || 'Could not update workstation'))
  }
  revalidatePath(`/dashboard/terminals/${id}`)
  revalidatePath('/dashboard/terminals')
  redirect(`/dashboard/terminals/${id}?notice=` + encodeURIComponent('Stanowisko zaktualizowane pomyślnie'))
}

export async function deleteTerminal(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  await adminApi(`/terminals/${id}`, { method: 'DELETE' })
  revalidatePath('/dashboard/terminals')
  redirect('/dashboard/terminals')
}

export async function archiveTerminal(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  await adminApi(`/terminals/${id}/archive`, { method: 'POST' })
  revalidatePath('/dashboard/terminals')
  redirect('/dashboard/terminals')
}

export async function logoutTerminal(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const res = await adminApi(`/terminals/${id}/logout`, { method: 'POST' })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    redirect('/dashboard/terminals?error=' + encodeURIComponent(json?.message || 'Could not log out the terminal'))
  }
  redirect('/dashboard/terminals?notice=' + encodeURIComponent('Terminal signed out'))
}

// `setPrimary` removed: "primary fiscalizer" now lives on fiscal_devices.
// Set it from /dashboard/fiscal-devices instead.
