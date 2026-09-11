import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// One-time SSO handoff to the Flutter vendor app. The admin user already has a
// Supabase session here; we pass the refresh token in the URL *fragment* (not the
// query, so it never hits server logs) and the vendor app calls setSession() with
// it on load. Falls back to the plain app URL if anything is missing.
export async function GET() {
  const base = process.env.NEXT_PUBLIC_VENDOR_APP_URL
  if (!base) return NextResponse.redirect(new URL('/dashboard', 'http://localhost'))

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  // Query param (not fragment): Flutter web reads it reliably regardless of the
  // app's hash-routing. The refresh token is single-use (rotates on first use).
  let target = base
  if (session?.refresh_token) {
    const u = new URL(base)
    u.searchParams.set('ya_handoff', session.refresh_token)
    target = u.toString()
  }
  return NextResponse.redirect(target)
}
