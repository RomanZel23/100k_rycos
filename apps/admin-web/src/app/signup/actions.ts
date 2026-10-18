'use server'

import { adminApi } from '@/lib/api'

export interface GusLookupResult {
  ok: boolean
  data?: {
    nip: string
    regon?: string
    name: string
    street?: string
    propertyNumber?: string
    apartmentNumber?: string
    city?: string
    postalCode?: string
    formattedAddress?: string
  }
  error?: string
}

export async function lookupCompanyByNip(nip: string): Promise<GusLookupResult> {
  const cleanNip = String(nip || '').replace(/^PL/i, '').replace(/[^0-9]/g, '')
  if (cleanNip.length !== 10) {
    return { ok: false, error: 'Podaj poprawny 10-cyfrowy numer NIP' }
  }

  try {
    const res = await adminApi('/auth/gus-lookup', {
      method: 'POST',
      body: JSON.stringify({ nip: cleanNip }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        error: json?.message || json?.error || 'Nie udało się pobrać danych z GUS. Możesz wpisać je ręcznie.',
      }
    }
    return { ok: true, data: json?.data }
  } catch {
    return {
      ok: false,
      error: 'Nie udało się połączyć z bazą GUS. Możesz wpisać dane firmy ręcznie.',
    }
  }
}

export interface SignupActionResult {
  ok: boolean
  email?: string
  emailSent?: boolean
  emailError?: string | null
  error?: string
}

export async function signupAction(formData: FormData): Promise<SignupActionResult> {
  const nip = String(formData.get('nip') || '').replace(/^PL/i, '').replace(/[^0-9]/g, '')
  const company_name = String(formData.get('company_name') || '').trim()
  const address = String(formData.get('address') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const name = String(formData.get('name') || '').trim()
  const country = String(formData.get('country') || 'PL').trim()
  const currency = String(formData.get('currency') || 'PLN').trim()
  const business_type = String(formData.get('business_type') || 'product').trim()

  const payload = {
    nip,
    company_name,
    address,
    email,
    password,
    name,
    country,
    currency,
    business_type,
  }

  try {
    const res = await adminApi('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      const msg = json?.errors
        ? Object.values(json.errors).join(' ')
        : json?.message || json?.error || 'Nie udało się utworzyć konta'
      return { ok: false, error: String(msg) }
    }

    return {
      ok: true,
      email,
      emailSent: json?.data?.email_sent !== false,
      emailError: json?.data?.email_error || null,
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Wystąpił błąd połączenia z serwerem podczas rejestracji',
    }
  }
}

export async function resendVerificationEmailAction(email: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await adminApi('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: json?.message || json?.error || 'Nie udało się wysłać linku aktywacyjnego' }
    }
    return { ok: true, message: json?.message || 'Nowy link aktywacyjny został wysłany na podany adres e-mail.' }
  } catch {
    return { ok: false, error: 'Błąd połączenia z serwerem' }
  }
}
