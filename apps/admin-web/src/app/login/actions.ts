'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export async function login(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  try {
    const adminApiUrl = process.env.ADMIN_API_URL || 'https://100k-api.rycos.eu/v1/admin';
    const res = await fetch(`${adminApiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = json?.message || json?.error || 'Nieprawidłowy login lub hasło';
      redirect('/login?error=' + encodeURIComponent(msg));
    }

    const { access_token, user } = json.data || {};
    if (!access_token) {
      redirect('/login?error=' + encodeURIComponent('Brak tokenu autoryzacji'));
    }

    const cookieStore = await cookies();
    cookieStore.set('rycos_token', access_token, {
      path: '/',
      httpOnly: true,
      secure: false,
      maxAge: 30 * 86400,
      sameSite: 'lax',
    });

    cookieStore.set('rycos_user', JSON.stringify(user), {
      path: '/',
      httpOnly: false,
      secure: false,
      maxAge: 30 * 86400,
      sameSite: 'lax',
    });
  } catch (err: any) {
    if (err?.digest?.startsWith('NEXT_REDIRECT')) {
      throw err;
    }
    redirect('/login?error=' + encodeURIComponent(err.message || 'Błąd logowania'));
  }

  redirect('/dashboard');
}
