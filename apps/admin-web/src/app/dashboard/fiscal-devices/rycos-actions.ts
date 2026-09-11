'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminApi } from '@/lib/api'

// Server actions for the RYCOS provisioning panel. Everything here is a thin
// pass-through to admin-api /rycos/*, which owns the tenant scoping — the
// browser never sees or sends a RYCOS client id.

const PATH = '/dashboard/fiscal-devices'

// admin-api answers with the PHP-parity envelope { success, message, data }.
// Surface its message either way: RYCOS errors ("Seat is paired", "NIP already
// exists") are the useful part and there is nothing better to say on top.
async function run(
  path: string,
  init: RequestInit,
  onSuccess: (data: any, message: string) => string,
): Promise<never> {
  let json: { message?: string; data?: any } = {}
  let ok = false
  try {
    const res = await adminApi(path, init)
    ok = res.ok
    json = await res.json().catch(() => ({}))
  } catch (e) {
    json = { message: (e as Error).message }
  }
  revalidatePath(PATH)
  if (!ok) redirect(`${PATH}?error=${encodeURIComponent(json.message || 'RYCOS request failed')}`)
  redirect(`${PATH}?${onSuccess(json.data, json.message || 'Done')}`)
}

export async function linkRycos(formData: FormData): Promise<void> {
  const body = {
    nip: String(formData.get('nip') || '').trim(),
    name: String(formData.get('name') || '').trim(),
    address_street: String(formData.get('address_street') || '').trim() || undefined,
    address_city: String(formData.get('address_city') || '').trim() || undefined,
    address_zip: String(formData.get('address_zip') || '').trim() || undefined,
    email: String(formData.get('email') || '').trim() || undefined,
  }
  await run('/rycos/link', { method: 'POST', body: JSON.stringify(body) },
    (_d, m) => `notice=${encodeURIComponent(m)}`)
}

export async function unlinkRycos(): Promise<void> {
  await run('/rycos/link', { method: 'DELETE' }, (_d, m) => `notice=${encodeURIComponent(m)}`)
}

export async function syncRycos(): Promise<void> {
  await run('/rycos/sync', { method: 'POST' }, (_d, m) => `notice=${encodeURIComponent(m)}`)
}

// The PIN is shown back through the query string: it is a 10-minute, 3-attempt
// pairing code, not a credential worth a session round-trip.
export async function generatePin(formData: FormData): Promise<void> {
  const seatId = String(formData.get('seat_id') || '')
  await run(`/rycos/seats/${seatId}/pin`, { method: 'POST' },
    (d) => `pin=${encodeURIComponent(d?.pin ?? '')}&pin_expires=${encodeURIComponent(d?.expires_at ?? '')}`)
}

export async function unpairDevice(formData: FormData): Promise<void> {
  const seatId = String(formData.get('seat_id') || '')
  await run(`/rycos/seats/${seatId}/device`, { method: 'DELETE' },
    (_d, m) => `notice=${encodeURIComponent(m)}`)
}

export async function buySeats(formData: FormData): Promise<void> {
  const num = (k: string) => parseInt(String(formData.get(k) || '0')) || 0
  const body = {
    seats_pf: num('seats_pf'),
    seats_p: num('seats_p'),
    seats_f: num('seats_f'),
    seats_0: num('seats_0'),
  }
  await run('/rycos/purchases', { method: 'POST', body: JSON.stringify(body) },
    (_d, m) => `notice=${encodeURIComponent(m)}`)
}

export async function extendPurchase(formData: FormData): Promise<void> {
  const id = String(formData.get('purchase_id') || '')
  const months = parseInt(String(formData.get('months') || '1'))
  await run(`/rycos/purchases/${id}/extend`, { method: 'POST', body: JSON.stringify({ months }) },
    (_d, m) => `notice=${encodeURIComponent(m)}`)
}

export async function addHubDevice(): Promise<void> {
  await run('/rycos/hub-device', { method: 'POST' }, (_d, m) => `notice=${encodeURIComponent(m)}`)
}
