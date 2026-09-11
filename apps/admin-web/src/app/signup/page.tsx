import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Banner } from '@/components/Banner'
import { signup } from './actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <Logo />
          <p className="mt-2 text-sm text-neutral-500">Create your company account</p>
        </div>

        <form action={signup} className="card space-y-4">
          {error && <Banner kind="error">{error}</Banner>}

          <div>
            <label className="label" htmlFor="company_name">Company name</label>
            <input id="company_name" name="company_name" required className="input" placeholder="Acme Foods" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="country">Country</label>
              <input id="country" name="country" className="input" placeholder="Poland" />
            </div>
            <div>
              <label className="label" htmlFor="currency">Currency</label>
              <input id="currency" name="currency" className="input" placeholder="PLN" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="business_type">Business type</label>
            <select id="business_type" name="business_type" defaultValue="product" className="input">
              <option value="product">Products / F&amp;B / Retail</option>
              <option value="service">Services</option>
              <option value="ticket">Tickets &amp; Events</option>
              <option value="petrol_pump">Petrol / Fuel</option>
            </select>
          </div>

          <hr className="border-neutral-200" />

          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input id="name" name="name" className="input" placeholder="Jane Doe" />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" className="input" />
            <p className="mt-1 text-xs text-neutral-400">At least 6 characters.</p>
          </div>

          <button type="submit" className="btn-brand">Create account</button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-500">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  )
}
