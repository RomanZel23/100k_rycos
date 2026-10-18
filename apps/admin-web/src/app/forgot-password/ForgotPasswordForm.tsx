'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { requestPasswordResetAction } from './actions'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentMessage, setSentMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await requestPasswordResetAction(email)
      if (!res.ok) {
        setError(res.error || 'Wystąpił błąd podczas wysyłania wiadomości')
        return
      }
      setSentMessage(
        res.message ||
          'Jeśli konto z podanym adresem e-mail istnieje w systemie, wysłaliśmy na nie link do zresetowania hasła.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (sentMessage) {
    return (
      <div className="card space-y-5 text-center py-8 px-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-neutral-900">Sprawdź swoją skrzynkę pocztową</h2>
          <p className="text-sm text-neutral-600 leading-relaxed">{sentMessage}</p>
        </div>

        <div className="pt-2">
          <Link
            href="/login"
            className="btn-brand w-full inline-flex items-center justify-center py-2.5 font-bold"
          >
            Wróć do logowania
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <p className="text-sm text-neutral-600 leading-relaxed">
        Podaj adres e-mail powiązany z Twoim kontem. Wyślemy Ci wiadomość z linkiem do ustawienia nowego hasła.
      </p>

      <div>
        <label className="label" htmlFor="email">
          Adres Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="np. biuro@twojafirma.pl"
          className="input"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn-brand w-full flex items-center justify-center gap-2 py-2.5 font-bold cursor-pointer"
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Wysyłanie...</span>
          </>
        ) : (
          <span>Wyślij link do resetowania hasła</span>
        )}
      </button>
    </form>
  )
}
