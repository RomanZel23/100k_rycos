import { cookies } from 'next/headers'
import { createClient } from './supabase/server'

// Server-side call to admin-api, forwarding the signed-in user's access token as a
// Bearer (admin-api scopes everything by the token's company_id).
export async function adminApi(path: string, init: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies()
  let token = cookieStore.get('rycos_token')?.value

  if (!token) {
    try {
      const supabase = await createClient()
      const { data: { session } } = await supabase.auth.getSession()
      token = session?.access_token
    } catch {}
  }

  // Only declare a JSON content-type when we're actually sending a JSON body.
  // A body-less POST/DELETE (e.g. /primary, /archive) with `Content-Type:
  // application/json` makes Fastify reject the empty body with a 400, which is
  // why those actions silently did nothing. For FormData, let fetch set the
  // multipart boundary itself.
  const hasBody = init.body != null
  const isForm = hasBody && typeof FormData !== 'undefined' && init.body instanceof FormData
  const sendJson = hasBody && !isForm

  const headers = {
    ...(sendJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers || {}),
  }

  const candidateUrls = [
    process.env.ADMIN_API_URL,
    'http://api:8000/v1/admin',
    'http://127.0.0.1:8000/v1/admin',
    'https://100k-api.rycos.eu/v1/admin',
  ].filter(Boolean) as string[];

  const uniqueUrls = Array.from(new Set(candidateUrls));

  for (let i = 0; i < uniqueUrls.length; i++) {
    const baseUrl = uniqueUrls[i];
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
        cache: 'no-store',
      });
      if (res.status !== 502 && res.status !== 503 && res.status !== 504) {
        return res;
      }
      if (i === uniqueUrls.length - 1) {
        return res;
      }
    } catch (err) {
      if (i === uniqueUrls.length - 1) {
        throw err;
      }
    }
  }

  return fetch(`${process.env.ADMIN_API_URL || 'https://100k-api.rycos.eu/v1/admin'}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

// Convenience: GET and return the admin-api envelope's `data`, or null on error.
export async function adminApiData<T = unknown>(path: string): Promise<T | null> {
  try {
    const res = await adminApi(path)
    if (!res.ok) return null
    const json = await res.json()
    return (json?.data ?? null) as T
  } catch {
    return null
  }
}

// Paginated GET. Endpoints that opt into pagination wrap their data as
// `data: { data: T[], pagination: {...} }`. This peels both layers and
// returns { items, pagination } so callers don't have to think about it.
// Falls back gracefully if the endpoint returns a bare array.
import type { Pagination } from './pagination'
export async function adminApiPaginated<T = unknown>(path: string): Promise<{ items: T[]; pagination: Pagination | null }> {
  try {
    const res = await adminApi(path)
    if (!res.ok) return { items: [], pagination: null }
    const json = await res.json()
    const inner = json?.data
    if (Array.isArray(inner)) {
      return { items: inner as T[], pagination: null }
    }
    return {
      items: (inner?.data ?? []) as T[],
      pagination: (inner?.pagination ?? null) as Pagination | null,
    }
  } catch {
    return { items: [], pagination: null }
  }
}
