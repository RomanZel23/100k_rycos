import type { User } from '@supabase/supabase-js'
import { createClient } from './supabase/server'

export async function currentUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export function roleOf(user: User | null): string {
  return (user?.user_metadata?.role as string) ?? ''
}

// Mirrors admin-api's isManager: role is source of truth; role-less legacy users
// without a location_id are treated as managers during the migration.
// platform_admin (YallaOrder internal staff) always counts as a manager.
export function isManager(user: User | null): boolean {
  const r = roleOf(user)
  if (r === 'super_admin' || r === 'admin' || r === 'platform_admin') return true
  if (r === 'staff') return false
  return user?.user_metadata?.location_id == null
}
