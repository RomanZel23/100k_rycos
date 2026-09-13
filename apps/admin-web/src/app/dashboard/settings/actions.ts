'use server'

import { revalidatePath } from 'next/cache'
import { adminApi } from '@/lib/api'
import { FEATURE_KEYS } from './constants'

const COMPANY_FIELDS = [
  'name', 'address', 'email', 'phone', 'country', 'currency', 'business_type',
  // active_languages retired — see /companies/languages + Settings → Languages section
  'default_language', 'terms_and_conditions', 'privacy_policy',
]

export async function updateCompany(formData: FormData): Promise<void> {
  const body: Record<string, string> = {}
  for (const f of COMPANY_FIELDS) {
    const v = formData.get(f)
    if (v !== null) body[f] = String(v)
  }
  await adminApi('/companies', { method: 'PUT', body: JSON.stringify(body) })
  revalidatePath('/dashboard/settings')
}

export async function saveFeatures(formData: FormData): Promise<void> {
  for (const key of FEATURE_KEYS) {
    const enabled = formData.get(key) === 'on'
    await adminApi(`/companies/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ is_enabled: enabled }),
    })
  }
  revalidatePath('/dashboard/settings')
}

export async function saveLanguages(formData: FormData): Promise<void> {
  const codes = formData.getAll('lang').map(String).filter(Boolean)
  await adminApi('/companies/languages', {
    method: 'PUT',
    body: JSON.stringify({ codes }),
  })
  revalidatePath('/dashboard/settings')
}
