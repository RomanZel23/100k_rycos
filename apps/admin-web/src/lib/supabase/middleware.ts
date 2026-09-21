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
    response.cookies.delete('rycos_token')
    response.cookies.delete('rycos_user')
    return response
  }

  if (path.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next({ request })
}
