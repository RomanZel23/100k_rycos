import { NextResponse, type NextRequest } from 'next/server'

/**
 * Session guard for the admin panel.
 *
 * A session is only valid when BOTH cookies are present:
 *   - `rycos_token`  — bearer token for admin-api
 *   - `rycos_user`   — the signed-in user (the dashboard layout resolves it)
 *
 * With only the token, the middleware used to let /dashboard through while the layout
 * bounced back to /login (no user) — and the middleware sent /login straight back to
 * /dashboard: ERR_TOO_MANY_REDIRECTS. A half-session is now treated as signed out and
 * the leftover cookies are cleared, so the visitor lands on the login form instead.
 */
/**
 * The onboarding hand-off writes the cookies for the whole `.rycos.eu` domain, the login
 * action writes them for this host only. A cookie is removed only when the delete matches
 * its domain, so both variants have to be expired.
 */
export function parentCookieDomain(hostname: string): string | undefined {
  const host = (hostname || '').trim().toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost') return undefined
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return undefined // IP address
  const labels = host.split('.')
  if (labels.length < 3) return undefined // already the registrable domain
  return `.${labels.slice(-2).join('.')}`
}

function clearSessionCookies(response: NextResponse, request: NextRequest) {
  const parentDomain = parentCookieDomain(request.nextUrl.hostname || request.headers.get('host') || '')

  for (const name of ['rycos_token', 'rycos_user']) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 })
    if (parentDomain) {
      response.cookies.set(name, '', { path: '/', maxAge: 0, domain: parentDomain })
    }
  }
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (path.startsWith('/api/health')) {
    return NextResponse.next({ request })
  }

  const hasToken = Boolean(request.cookies.get('rycos_token')?.value)
  const hasUser = Boolean(request.cookies.get('rycos_user')?.value)

  if (hasToken && hasUser) {
    if (path === '/login' || path === '/signup') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next({ request })
  }

  // Incomplete session: drop what is left of it so the next request starts clean.
  if (hasToken || hasUser) {
    const target = path.startsWith('/dashboard') ? '/login?expired=1' : path
    const response =
      target === path ? NextResponse.next({ request }) : NextResponse.redirect(new URL(target, request.url))
    clearSessionCookies(response, request)
    return response
  }

  if (path.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next({ request })
}
