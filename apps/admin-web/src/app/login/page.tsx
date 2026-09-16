import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 bg-neutral-50/50">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo />
          <p className="mt-2 text-sm text-neutral-500">Sign in to your company admin</p>
        </div>

        <LoginForm error={error} />

        <p className="mt-6 text-center text-sm text-neutral-500">
          New to 100k-RYCOS?{' '}
          <Link href="/signup" className="font-semibold text-brand hover:underline">Create an account</Link>
        </p>
      </div>
    </main>
  )
}
