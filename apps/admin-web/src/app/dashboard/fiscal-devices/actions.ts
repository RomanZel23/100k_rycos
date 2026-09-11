'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminApi } from '@/lib/api'

export async function addFiscalDevice(formData: FormData): Promise<void> {
  const body = {
    name: String(formData.get('name') || '').trim(),
    device_id: String(formData.get('device_id') || '').trim(),
  }
  if (body.name && body.device_id) await adminApi('/fiscal-devices', { method: 'POST', body: JSON.stringify(body) })
  revalidatePath('/dashboard/fiscal-devices')
}

export async function deleteFiscalDevice(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  await adminApi(`/fiscal-devices/${id}`, { method: 'DELETE' })
  revalidatePath('/dashboard/fiscal-devices')
}

export async function toggleFiscalDevice(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const status = String(formData.get('status') || '') === 'active' ? 'inactive' : 'active'
  await adminApi(`/fiscal-devices/${id}`, { method: 'PUT', body: JSON.stringify({ status }) })
  revalidatePath('/dashboard/fiscal-devices')
}

// Mark one fiscal device as THE primary fiscalizer for the company.
// Exclusive — admin-api clears is_primary on every other device first
// inside a single transaction; the DB partial unique index also guards.
export async function setPrimary(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const res = await adminApi(`/fiscal-devices/${id}/primary`, { method: 'POST' })
  if (!res.ok) {
    const j = await res.json().catch(() => ({} as { message?: string }))
    redirect('/dashboard/fiscal-devices?error=' + encodeURIComponent(String(j?.message || 'Failed to set primary')))
  }
  revalidatePath('/dashboard/fiscal-devices')
  redirect('/dashboard/fiscal-devices?notice=' + encodeURIComponent('Primary fiscalizer updated'))
}

// Replace the set of terminals using one fiscal device. The checkbox form
// posts every checked terminal_id as a repeated field; getAll() collects
// them all and admin-api handles the diff (unbind absent, bind/move listed)
// in a single transaction.
export async function saveTerminals(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const terminalIds = formData
    .getAll('terminal_ids')
    .map((v) => parseInt(String(v)))
    .filter((n) => Number.isFinite(n))
  const res = await adminApi(`/fiscal-devices/${id}/terminals`, {
    method: 'PUT',
    body: JSON.stringify({ terminal_ids: terminalIds }),
  })
  if (!res.ok) {
    const j = await res.json().catch(() => ({} as { message?: string }))
    redirect('/dashboard/fiscal-devices?error=' + encodeURIComponent(String(j?.message || 'Failed to save assignments')))
  }
  revalidatePath('/dashboard/fiscal-devices')
  redirect('/dashboard/fiscal-devices?notice=' + encodeURIComponent(
    `${terminalIds.length} terminal${terminalIds.length === 1 ? '' : 's'} now using this device`,
  ))
}
