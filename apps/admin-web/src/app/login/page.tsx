import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Banner } from '@/components/Banner'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo />
          <p className="mt-2 text-sm text-neutral-500">Sign in to your company admin</p>
        </div>

        <form action={login} className="card space-y-4">
          {error && <Banner kind="error">{error}</Banner>}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
          </div>
          <button type="submit" className="btn-brand">Sign in</button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-500">
          New to YallaOrder?{' '}
          <Link href="/signup" className="font-semibold text-brand hover:underline">Create an account</Link>
        </p>
      </div>
    </main>
  )
}
