'use server'

import { adminApi } from '@/lib/api'

export async function requestPasswordResetAction(email: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, error: 'Podaj poprawny adres e-mail' }
  }

  try {
    const res = await adminApi('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: cleanEmail }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        error: json?.message || json?.error || 'Nie udało się wysłać linku do resetowania hasła',
      }
    }
    return {
      ok: true,
      message:
        json?.message ||
        'Jeśli konto z podanym adresem e-mail istnieje w systemie, wysłaliśmy na nie link do zresetowania hasła.',
    }
  } catch {
    return { ok: false, error: 'Wystąpił błąd połączenia z serwerem. Spróbuj ponownie.' }
  }
}
