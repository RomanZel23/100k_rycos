'use server'

import { revalidatePath } from 'next/cache'
import { adminApi } from '@/lib/api'

export async function addLocation(formData: FormData): Promise<void> {
  const name = String(formData.get('name') || '').trim()
  if (name) await adminApi('/locations', { method: 'POST', body: JSON.stringify({ name }) })
  revalidatePath('/dashboard/locations')
}

export async function updateLocation(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const name = String(formData.get('name') || '').trim()
  if (name) await adminApi(`/locations/${id}`, { method: 'PUT', body: JSON.stringify({ name }) })
  revalidatePath('/dashboard/locations')
}

export async function deleteLocation(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  await adminApi(`/locations/${id}`, { method: 'DELETE' })
  revalidatePath('/dashboard/locations')
}
