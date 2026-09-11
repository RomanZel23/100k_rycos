'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminApi } from '@/lib/api'

export async function createTerminal(formData: FormData): Promise<void> {
  const body = {
    name: String(formData.get('name') || '').trim(),
    location_id: formData.get('location_id') ? Number(formData.get('location_id')) : null,
  }
  const res = await adminApi('/terminals', { method: 'POST', body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) redirect('/dashboard/terminals?error=' + encodeURIComponent(json?.message || 'Could not create terminal'))
  revalidatePath('/dashboard/terminals')
  redirect(`/dashboard/terminals/${json.data.id}`)
}

export async function updateTerminal(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  // fiscal_device_id intentionally omitted — assignment now lives on the
  // Fiscal devices page (terminal_fiscal_devices join table).
  const body: Record<string, unknown> = {
    name: String(formData.get('name') || '').trim(),
    location_id: formData.get('location_id') ? Number(formData.get('location_id')) : null,
    tap_device_id: String(formData.get('tap_device_id') || '').trim(),
    printer_device_id: String(formData.get('printer_device_id') || '').trim(),
  }
  await adminApi(`/terminals/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  revalidatePath(`/dashboard/terminals/${id}`)
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
