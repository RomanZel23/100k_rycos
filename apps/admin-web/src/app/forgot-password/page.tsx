import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 bg-neutral-50/50">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo />
          <p className="mt-2 text-sm text-neutral-500">Przypominanie / resetowanie hasła</p>
        </div>

        <ForgotPasswordForm />

        <p className="mt-6 text-center text-sm text-neutral-500">
          Pamiętasz hasło?{' '}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Wróć do logowania
          </Link>
        </p>
      </div>
    </main>
  )
}
