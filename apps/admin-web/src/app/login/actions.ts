'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export async function login(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  const candidateUrls = [
    process.env.ADMIN_API_URL,
    'http://api:8000/v1/admin',
    'http://127.0.0.1:8000/v1/admin',
    'https://100k-api.rycos.eu/v1/admin',
  ].filter(Boolean) as string[];

  const uniqueUrls = Array.from(new Set(candidateUrls));
  let lastErrorMsg = 'Nieprawidłowy login lub hasło';
  let successData: any = null;

  try {
    for (const adminApiUrl of uniqueUrls) {
      try {
        const res = await fetch(`${adminApiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          cache: 'no-store',
        });

        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          if (json?.data?.access_token) {
            successData = json.data;
            break;
          }
        } else if (res.status === 401 || res.status === 403 || res.status === 422) {
          const json = await res.json().catch(() => ({}));
          lastErrorMsg = json?.message || json?.error || 'Nieprawidłowy login lub hasło';
          break;
        }
      } catch (err: any) {
        console.warn(`[Login] Endpoint ${adminApiUrl} unreachable:`, err.message);
      }
    }

    if (!successData) {
      redirect('/login?error=' + encodeURIComponent(lastErrorMsg));
    }

    const { access_token, user } = successData;
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
