import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { SignupForm } from './SignupForm'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 bg-neutral-50/50">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <Logo />
          <p className="mt-2 text-sm text-neutral-500">Utwórz konto swojej firmy</p>
        </div>

        <SignupForm initialError={error} />

        <p className="mt-6 text-center text-sm text-neutral-500">
          Masz już konto?{' '}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Zaloguj się
          </Link>
        </p>
      </div>
    </main>
  )
}
