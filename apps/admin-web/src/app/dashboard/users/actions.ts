'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminApi } from '@/lib/api'

async function failTo(path: string, res: Response, fallback: string): Promise<never> {
  const j = await res.json().catch(() => ({} as any))
  const msg = j?.errors ? Object.values(j.errors).join(' ') : j?.message || fallback
  redirect(`${path}?error=${encodeURIComponent(String(msg))}`)
}

export async function addUser(formData: FormData): Promise<void> {
  const body = {
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || ''),
    name: String(formData.get('name') || '').trim(),
    role: String(formData.get('role') || 'staff'),
  }
  const res = await adminApi('/team', { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) await failTo('/dashboard/users', res, 'Failed to add user')
  revalidatePath('/dashboard/users')
  redirect('/dashboard/users?notice=' + encodeURIComponent(`Invited ${body.email}`))
}

export async function removeUser(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const res = await adminApi(`/team/${id}`, { method: 'DELETE' })
  if (!res.ok) await failTo('/dashboard/users', res, 'Failed to remove user')
  revalidatePath('/dashboard/users')
}

export async function updateUserRole(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const role = String(formData.get('role') || '')
  const res = await adminApi(`/team/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) })
  if (!res.ok) await failTo('/dashboard/users', res, 'Failed to update role')
  revalidatePath('/dashboard/users')
}
