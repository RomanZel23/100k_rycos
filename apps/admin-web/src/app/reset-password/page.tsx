import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { ResetPasswordForm } from './ResetPasswordForm'

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-4 bg-neutral-50/50">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo />
          <p className="mt-2 text-sm text-neutral-500">Ustaw nowe hasło dostępu</p>
        </div>

        <ResetPasswordForm token={token} />

        <p className="mt-6 text-center text-sm text-neutral-500">
          <Link href="/login" className="font-semibold text-brand hover:underline">
            &larr; Wróć do logowania
          </Link>
        </p>
      </div>
    </main>
  )
}
