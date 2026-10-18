'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { lookupCompanyByNip, signupAction, resendVerificationEmailAction } from './actions'

export function SignupForm({ initialError }: { initialError?: string }) {
  const [nip, setNip] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [address, setAddress] = useState('')
  const [country, setCountry] = useState('Polska')
  const [currency, setCurrency] = useState('PLN')
  const [businessType, setBusinessType] = useState('product')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [gusLoading, setGusLoading] = useState(false)
  const [lastSearchedNip, setLastSearchedNip] = useState('')
  const [gusInfo, setGusInfo] = useState<{ kind: 'success' | 'warn'; text: string } | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError || null)

  // Post-signup confirmation screen state
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendStatus, setResendStatus] = useState<{ ok: boolean; text: string } | null>(null)

  const runGusLookup = async (rawNip: string, force = false) => {
    const cleanNip = rawNip.replace(/^PL/i, '').replace(/[^0-9]/g, '')
    if (cleanNip.length !== 10) {
      if (force) {
        setGusInfo({ kind: 'warn', text: 'Wpisz 10 cyfr numeru NIP, aby pobrać dane z GUS.' })
      }
      return
    }
    if (!force && cleanNip === lastSearchedNip) return

    setLastSearchedNip(cleanNip)
    setGusLoading(true)
    setGusInfo(null)

    try {
      const res = await lookupCompanyByNip(cleanNip)
      if (res.ok && res.data) {
        if (res.data.name) setCompanyName(res.data.name)
        if (res.data.formattedAddress) setAddress(res.data.formattedAddress)
        setGusInfo({
          kind: 'success',
          text: 'Dane spółki zostały pobrane z GUS. Możesz je w razie potrzeby poprawić w polach poniżej.',
        })
      } else {
        setGusInfo({
          kind: 'warn',
          text: res.error || 'Nie znaleziono danych w GUS — uzupełnij lub popraw pola ręcznie.',
        })
      }
    } catch {
      setGusInfo({
        kind: 'warn',
        text: 'Nie udało się pobrać danych z GUS. Możesz wpisać dane firmy ręcznie.',
      })
    } finally {
      setGusLoading(false)
    }
  }

  const handleNipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setNip(val)
    const digits = val.replace(/^PL/i, '').replace(/[^0-9]/g, '')
    if (digits.length === 10) {
      runGusLookup(digits)
    } else {
      setLastSearchedNip('')
      setGusInfo(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const fd = new FormData()
      fd.set('nip', nip)
      fd.set('company_name', companyName)
      fd.set('address', address)
      fd.set('country', country)
      fd.set('currency', currency)
      fd.set('business_type', businessType)
      fd.set('name', name)
      fd.set('email', email)
      fd.set('password', password)

      const res = await signupAction(fd)
      if (!res.ok) {
        setError(res.error || 'Nie udało się utworzyć konta')
        return
      }

      setRegisteredEmail(res.email || email)
      setEmailError(res.emailError || null)
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!registeredEmail) return
    setResendLoading(true)
    setResendStatus(null)
    try {
      const res = await resendVerificationEmailAction(registeredEmail)
      if (res.ok) {
        setResendStatus({ ok: true, text: res.message || 'Wysłano nowy link aktywacyjny.' })
        setEmailError(null)
      } else {
        setResendStatus({ ok: false, text: res.error || 'Nie udało się wysłać wiadomości.' })
      }
    } finally {
      setResendLoading(false)
    }
  }

  if (registeredEmail) {
    return (
      <div className="card space-y-5 text-center py-8 px-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-neutral-900">Potwierdź swój adres e-mail</h2>
          <p className="text-sm text-neutral-600 leading-relaxed">
            Wysłaliśmy wiadomość z linkiem aktywacyjnym na adres{' '}
            <strong className="text-neutral-900">{registeredEmail}</strong>.
          </p>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Konto staje się aktywne po kliknięciu w link potwierdzający adres mailowy. Sprawdź również folder SPAM lub Oferty.
          </p>
        </div>

        {emailError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
            Uwaga przy wysyłce wiadomości: {emailError}
          </div>
        )}

        {resendStatus && (
          <div
            className={`rounded-xl border p-3 text-xs font-semibold ${
              resendStatus.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {resendStatus.text}
          </div>
        )}

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={handleResend}
            disabled={resendLoading}
            className="px-4 py-2.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-700 transition cursor-pointer disabled:opacity-50"
          >
            {resendLoading ? 'Wysyłanie...' : 'Wyślij link aktywacyjny ponownie'}
          </button>
          <Link
            href="/login"
            className="btn-brand px-6 py-2.5 text-xs font-bold inline-flex items-center justify-center"
          >
            Przejdź do logowania
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

      {/* 1. Numer NIP (pierwsze pole, automatyczne pobieranie danych z GUS) */}
      <div>
        <label className="label" htmlFor="nip">
          Numer NIP
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              id="nip"
              name="nip"
              value={nip}
              onChange={handleNipChange}
              required
              placeholder="np. 5252674798 (10 cyfr)"
              className="input font-mono"
            />
            {gusLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="animate-spin h-4 w-4 text-brand" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => runGusLookup(nip, true)}
            disabled={gusLoading}
            className="px-3.5 py-2 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-xs font-semibold text-neutral-700 shrink-0 transition cursor-pointer disabled:opacity-50"
          >
            {gusLoading ? 'Pobieranie...' : 'Pobierz z GUS'}
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          Po wpisaniu 10 cyfr NIP system automatycznie pobierze dane firmy z rejestru GUS (z możliwością ich edycji).
        </p>

        {gusInfo && (
          <div
            className={`mt-2 rounded-lg border px-3 py-2 text-xs font-medium ${
              gusInfo.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {gusInfo.text}
          </div>
        )}
      </div>

      {/* 2. Nazwa firmy (wypełniana z GUS, w pełni edytowalna) */}
      <div>
        <label className="label" htmlFor="company_name">
          Nazwa firmy
        </label>
        <input
          id="company_name"
          name="company_name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
          className="input"
          placeholder="np. IDream Business Center Sp. z o.o."
        />
      </div>

      {/* 3. Adres siedziby firmy (wypełniany z GUS, w pełni edytowalny) */}
      <div>
        <label className="label" htmlFor="address">
          Adres siedziby firmy
        </label>
        <input
          id="address"
          name="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="input"
          placeholder="np. ul. Przykładowa 10, 00-001 Warszawa"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="country">
            Kraj
          </label>
          <input
            id="country"
            name="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="input"
            placeholder="Polska"
          />
        </div>
        <div>
          <label className="label" htmlFor="currency">
            Waluta
          </label>
          <input
            id="currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="input"
            placeholder="PLN"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="business_type">
          Rodzaj działalności
        </label>
        <select
          id="business_type"
          name="business_type"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          className="input"
        >
          <option value="product">Gastronomia / Produkty / Handel</option>
          <option value="service">Usługi</option>
          <option value="ticket">Bilety i Wydarzenia</option>
          <option value="petrol_pump">Paliwa / Stacje</option>
        </select>
      </div>

      <hr className="border-neutral-200" />

      <div>
        <label className="label" htmlFor="name">
          Twoje imię i nazwisko
        </label>
        <input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          placeholder="np. Marcin Bajda"
        />
      </div>

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

      <div>
        <label className="label" htmlFor="password">
          Hasło
        </label>
        <div className="relative flex items-center">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Wpisz hasło (min. 6 znaków)..."
            className="input pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 p-1.5 text-neutral-400 hover:text-neutral-700 focus:outline-none transition rounded-lg hover:bg-neutral-100"
            title={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
            aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-400">Minimum 6 znaków.</p>
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
            <span>Tworzenie konta...</span>
          </>
        ) : (
          <span>Utwórz konto</span>
        )}
      </button>
    </form>
  )
}
