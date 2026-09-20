'use client'

import { useEffect } from 'react'
import { getApiBaseUrl, getTerminalToken } from './api'

/**
 * Keeps the paired station's configuration in sync with the admin panel / structure editor.
 * - refreshTerminalConfig(): heartbeat + fetch of the current config (role, devices, brands)
 * - 'rycos:terminal-updated'  → new config was stored (detail = terminal object)
 * - 'rycos:terminal-unpaired' → the station was logged out / archived / re-paired elsewhere
 * - 'rycos:terminal-refresh'  → ask the guard to refresh now (e.g. after a WS notification)
 */
export const TERMINAL_UPDATED = 'rycos:terminal-updated'
export const TERMINAL_UNPAIRED = 'rycos:terminal-unpaired'
export const TERMINAL_REFRESH = 'rycos:terminal-refresh'

const CONFIG_KEYS = ['name', 'role', 'company_id', 'location_id', 'assigned_brand_ids', 'tap_device_id', 'printer_device_id', 'fiscal_device_id', 'capabilities', 'config_json', 'status'] as const

export async function refreshTerminalConfig(): Promise<'updated' | 'unchanged' | 'unpaired' | 'error'> {
  const token = getTerminalToken()
  if (!token) return 'error'
  try {
    const res = await fetch(`${getApiBaseUrl()}/v1/terminals/heartbeat`, {
      method: 'POST',
      headers: { 'x-terminal-token': token },
      cache: 'no-store',
    })
    if (res.status === 401) {
      try { localStorage.removeItem('rycos_terminal') } catch {}
      window.dispatchEvent(new Event(TERMINAL_UNPAIRED))
      return 'unpaired'
    }
    if (!res.ok) return 'error'
    const json = await res.json()
    const fresh = json?.data
    if (!fresh) return 'error'

    const stored = JSON.parse(localStorage.getItem('rycos_terminal') || '{}')
    const changed = CONFIG_KEYS.some((k) => JSON.stringify(stored[k] ?? null) !== JSON.stringify(fresh[k] ?? null))
    if (!changed) return 'unchanged'

    const merged = { ...stored, ...fresh, terminal_token: stored.terminal_token }
    localStorage.setItem('rycos_terminal', JSON.stringify(merged))
    window.dispatchEvent(new CustomEvent(TERMINAL_UPDATED, { detail: merged }))
    return 'updated'
  } catch {
    return 'error'
  }
}

/** Screens holding their own copy of the terminal (POS, KDS, Pickup) subscribe with this hook. */
export function useTerminalSync<T>(setTerminal: (t: T) => void) {
  useEffect(() => {
    const onUpdate = (e: Event) => setTerminal((e as CustomEvent).detail as T)
    window.addEventListener(TERMINAL_UPDATED, onUpdate)
    return () => window.removeEventListener(TERMINAL_UPDATED, onUpdate)
  }, [setTerminal])
}
