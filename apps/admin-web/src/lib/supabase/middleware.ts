import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refreshes the Supabase session cookie on every request and guards /dashboard.
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (path.startsWith('/api/health')) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return response
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // Unauthenticated users can't reach the app area.
    if (!user && path.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // Authenticated users skip the auth pages.
    if (user && (path === '/login' || path === '/signup')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  } catch (err) {
    console.warn('[middleware] Supabase session error:', err)
  }

  return response
}
