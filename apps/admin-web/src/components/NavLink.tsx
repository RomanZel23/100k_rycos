'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavLinkProps {
  href: string
  children: React.ReactNode
}

// Sidebar item with active-route highlighting. Active = the current path is
// exactly this href OR starts with `href/` (so nested routes like
// /dashboard/brands/123 still highlight the "Brands" item).
export function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname() ?? ''
  const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))
  // /dashboard root is special: only highlight when exactly there, not for any nested page.
  const exactDashboard = href === '/dashboard' && pathname === '/dashboard'
  const active = isActive || exactDashboard

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-brand-50 text-brand-700 border-l-2 border-brand'
          : 'text-neutral-700 hover:bg-brand-50 hover:text-brand-700'
      }`}
    >
      {children}
    </Link>
  )
}
