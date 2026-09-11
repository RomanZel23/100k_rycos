'use client'

import { useEffect, useState } from 'react'

// Floating toast for save feedback. Fixed in the bottom-right corner, fades in
// on mount, auto-dismisses after ~3 seconds. Triggered by server actions that
// redirect with `?notice=…` or `?error=…`; the page re-renders, the prop
// changes (or refs the same string), the toast pops up briefly, then hides.
//
// The component name `Banner` is kept for backwards-compat with the existing
// pages that already import it; behaviour is now toast-style.

interface BannerProps {
  kind: 'error' | 'success' | 'warning'
  children: React.ReactNode
  className?: string // legacy prop, ignored (toast position is fixed)
  durationMs?: number
}

const STYLES = {
  error:   { box: 'bg-red-600 text-white',   icon: '⚠' },
  success: { box: 'bg-green-600 text-white', icon: '✓' },
  warning: { box: 'bg-amber-500 text-white', icon: '!' },
} as const

export function Banner({ kind, children, durationMs = 3000 }: BannerProps) {
  // `children` is the message body (a string in 99% of cases). Stringify it
  // for the visibility key so an identical message after a separate save
  // still re-triggers the timer reliably.
  const key = (() => {
    try { return String(children) } catch { return '' }
  })()

  const [visible, setVisible] = useState(true)
  useEffect(() => {
    setVisible(true)
    const id = setTimeout(() => setVisible(false), durationMs)
    return () => clearTimeout(id)
  }, [key, durationMs])

  if (!visible) return null
  const s = STYLES[kind]
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-xl px-4 py-3 shadow-lg ${s.box} transition-opacity duration-200`}
    >
      <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
        {s.icon}
      </span>
      <div className="flex-1 text-sm leading-5">{children}</div>
    </div>
  )
}
