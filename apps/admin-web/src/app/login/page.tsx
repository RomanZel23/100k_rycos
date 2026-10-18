import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    verified?: string;
    reset?: string;
    unverified?: string;
  }>;
}) {
  const { error, notice, verified, reset, unverified } = await searchParams;

  let resolvedNotice = notice;
  if (!resolvedNotice && verified === '1') {
    resolvedNotice = 'Adres e-mail został potwierdzony! Twoje konto jest aktywne — możesz się teraz zalogować.';
  } else if (!resolvedNotice && reset === '1') {
    resolvedNotice = 'Hasło zostało pomyślnie zmienione. Możesz zalogować się nowym hasłem.';
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 bg-neutral-50/50">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo />
          <p className="mt-2 text-sm text-neutral-500">Zaloguj się do panelu administracyjnego firmy</p>
        </div>

        <LoginForm error={error} notice={resolvedNotice} unverifiedEmail={unverified} />

        <p className="mt-6 text-center text-sm text-neutral-500">
          Nie masz jeszcze konta w 100k-RYCOS?{' '}
          <Link href="/signup" className="font-semibold text-brand hover:underline">
            Utwórz konto
          </Link>
        </p>
      </div>
    </main>
  );
}
