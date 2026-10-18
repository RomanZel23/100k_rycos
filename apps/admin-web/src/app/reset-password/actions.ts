'use server'

import { adminApi } from '@/lib/api'

export async function resetPasswordAction(
  token: string,
  password: string
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const cleanToken = String(token || '').trim()
  const cleanPassword = String(password || '')

  if (!cleanToken) {
    return { ok: false, error: 'Brak tokenu resetowania hasła' }
  }
  if (cleanPassword.length < 6) {
    return { ok: false, error: 'Nowe hasło musi mieć co najmniej 6 znaków' }
  }

  try {
    const res = await adminApi('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: cleanToken, password: cleanPassword }),
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      const msg = json?.errors
        ? Object.values(json.errors).join(' ')
        : json?.message || json?.error || 'Nie udało się zmienić hasła'
      return { ok: false, error: String(msg) }
    }

    return {
      ok: true,
      message: json?.message || 'Hasło zostało pomyślnie zmienione.',
    }
  } catch {
    return { ok: false, error: 'Wystąpił błąd połączenia z serwerem. Spróbuj ponownie.' }
  }
}
