'use server'

import { revalidatePath } from 'next/cache'
import { adminApi } from '@/lib/api'

// Mark the "locations" onboarding step as handled for companies that operate as a
// single location (orders go company-wide). Stored as a company setting.
export async function ackSingleLocation(): Promise<void> {
  await adminApi('/companies/settings/onboarding_locations_ack', {
    method: 'PUT',
    body: JSON.stringify({ is_enabled: true }),
  })
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/locations')
}

// Mark the "invite your team" onboarding step as handled for owners who run the
// business solo. Stored as a company setting (DB), so it persists across devices.
export async function ackTeamOnly(): Promise<void> {
  await adminApi('/companies/settings/onboarding_team_ack', {
    method: 'PUT',
    body: JSON.stringify({ is_enabled: true }),
  })
  revalidatePath('/dashboard')
}

// Flip the company's "accepting orders" switch. The endpoint also writes to
// order_acceptance_logs for the audit trail.
export async function setAcceptingOrders(formData: FormData): Promise<void> {
  const next = formData.get('next') === 'true'
  await adminApi('/companies/accepting-orders', {
    method: 'PATCH',
    body: JSON.stringify({ is_accepting_orders: next }),
  })
  revalidatePath('/dashboard')
}
