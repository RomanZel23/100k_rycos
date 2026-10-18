import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { adminApi } from '@/lib/api'

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  let verified = false
  let message = ''

  if (!token) {
    message = 'Brak tokenu aktywacyjnego w adresie URL.'
  } else {
    try {
      const res = await adminApi('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        verified = true
        message = json?.message || 'Adres e-mail został potwierdzony! Twoje konto jest teraz aktywne.'
      } else {
        message = json?.message || json?.error || 'Link aktywacyjny jest nieprawidłowy lub wygasł.'
      }
    } catch {
      message = 'Wystąpił błąd podczas weryfikacji adresu e-mail. Spróbuj ponownie.'
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 bg-neutral-50/50">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo />
          <p className="mt-2 text-sm text-neutral-500">Weryfikacja adresu e-mail</p>
        </div>

        <div className="card space-y-5 text-center py-8 px-6">
          {verified ? (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-neutral-900">Konto zostało aktywowane!</h1>
                <p className="text-sm text-neutral-600 leading-relaxed">{message}</p>
              </div>
              <div className="pt-2">
                <Link
                  href="/login?verified=1"
                  className="btn-brand w-full inline-flex items-center justify-center py-2.5 font-bold"
                >
                  Zaloguj się do panelu
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 border border-red-200 text-red-600">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-neutral-900">Weryfikacja nie powiodła się</h1>
                <p className="text-sm text-neutral-600 leading-relaxed">{message}</p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <Link
                  href="/login"
                  className="btn-brand w-full inline-flex items-center justify-center py-2.5 font-bold"
                >
                  Przejdź do logowania
                </Link>
                <Link href="/signup" className="text-xs font-semibold text-neutral-500 hover:text-brand">
                  Utwórz nowe konto
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
