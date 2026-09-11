'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Onboarding: create the company + auth user via admin-api, then sign the new
// user in so they land in the dashboard. admin-api owns the orchestration (it
// holds the Supabase service-role key); this action never sees that secret.
export async function signup(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const payload = {
    company_name: String(formData.get('company_name') || '').trim(),
    email,
    password,
    name: String(formData.get('name') || '').trim(),
    country: String(formData.get('country') || '').trim(),
    currency: String(formData.get('currency') || '').trim(),
    business_type: String(formData.get('business_type') || '').trim(),
  }

  const res = await fetch(`${process.env.ADMIN_API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg =
      json?.errors
        ? Object.values(json.errors).join(' ')
        : json?.message || 'Could not create your account'
    redirect('/signup?error=' + encodeURIComponent(msg))
  }

  // Account exists — establish the session.
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    redirect('/login?error=' + encodeURIComponent('Account created — please sign in'))
  }
  redirect('/dashboard')
}
