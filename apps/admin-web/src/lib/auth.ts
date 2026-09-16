import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createClient } from './supabase/server'

export async function currentUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const userCookie = cookieStore.get('rycos_user')?.value
  if (userCookie) {
    try {
      return JSON.parse(userCookie) as User
    } catch {}
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  } catch {
    return null
  }
}

export function roleOf(user: User | null): string {
  return (user?.user_metadata?.role as string) ?? ''
}

// Mirrors admin-api's isManager: role is source of truth; role-less legacy users
// without a location_id are treated as managers during the migration.
// platform_admin (100k-RYCOS internal staff) always counts as a manager.
export function isManager(user: User | null): boolean {
  const r = roleOf(user)
  if (r === 'super_admin' || r === 'admin' || r === 'platform_admin') return true
  if (r === 'staff') return false
  return user?.user_metadata?.location_id == null
}

export function isPlatformAdmin(user: User | null): boolean {
  if (!user) return false
  const r = roleOf(user)
  if (r === 'platform_admin') return true
  const compId = Number((user.user_metadata as any)?.company_id ?? 0)
  if (compId === 1 && (r === 'super_admin' || r === 'platform_admin')) return true
  if (user.email === 'roman.zeleznik@solutionsbay.pl') return true
  return false
}
