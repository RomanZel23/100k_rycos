import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refreshes the Supabase session cookie on every request and guards /dashboard.
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (path.startsWith('/api/health')) {
    return NextResponse.next({ request })
  }

  const hasRycosToken = Boolean(request.cookies.get('rycos_token')?.value)

  if (hasRycosToken) {
    if (path === '/login' || path === '/signup') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next({ request })
  }

  if (path.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next({ request })
}
