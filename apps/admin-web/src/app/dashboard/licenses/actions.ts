'use server'

import { revalidatePath } from 'next/cache'
import { adminApi } from '@/lib/api'

export async function generatePairingPinAction(seatId: string): Promise<{ pin: string; expires_at: string; seat_id: string }> {
  const res = await adminApi('/rycos/pin', {
    method: 'POST',
    body: JSON.stringify({ seat_id: seatId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to generate PIN' }))
    throw new Error(err.message || err.error || 'Failed to generate PIN')
  }
  const json = await res.json()
  revalidatePath('/dashboard/licenses')
  return json.data as { pin: string; expires_at: string; seat_id: string }
}

export async function unpairDeviceAction(seatId: string): Promise<{ success: boolean }> {
  const res = await adminApi('/rycos/unpair', {
    method: 'POST',
    body: JSON.stringify({ seat_id: seatId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to unpair device' }))
    throw new Error(err.message || err.error || 'Failed to unpair device')
  }
  const json = await res.json()
  revalidatePath('/dashboard/licenses')
  return (json.data ?? { success: true }) as { success: boolean }
}

export async function refreshLicensesAction(): Promise<void> {
  revalidatePath('/dashboard/licenses')
}
