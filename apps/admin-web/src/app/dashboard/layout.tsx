import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Logo } from '@/components/Logo'
import { NavLink } from '@/components/NavLink'
import { currentUser, isManager } from '@/lib/auth'

async function signOut() {
  'use server'
  const cookieStore = await cookies()
  cookieStore.delete('rycos_token')
  cookieStore.delete('rycos_user')
  redirect('/login')
}

// `manager: true` items are hidden from staff (operational users).
const NAV = [
  { href: '/dashboard', label: 'Overview', manager: false },
  { href: '/dashboard/orders', label: 'Orders', manager: true },
  { href: '/dashboard/products', label: 'Products', manager: true },
  { href: '/dashboard/brands', label: 'Brands', manager: true },
  { href: '/dashboard/locations', label: 'Locations', manager: true },
  { href: '/dashboard/terminals', label: 'POS terminals', manager: true },
  { href: '/dashboard/fiscal-devices', label: 'Fiscal devices', manager: true },
  { href: '/dashboard/payment-gateways', label: 'Payment gateway', manager: true },
  { href: '/dashboard/qr-print', label: 'QR Print', manager: true },
  { href: '/dashboard/users', label: 'Users', manager: true },
  { href: '/dashboard/master', label: 'Platform SaaS (Master)', manager: true },
  { href: '/dashboard/billing', label: 'Billing', manager: true },
  { href: '/dashboard/settings', label: 'Settings', manager: true },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const manager = isManager(user)
  const nav = NAV.filter((item) => !item.manager || manager)

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-4">
          <Logo className="text-xl" />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href}>{item.label}</NavLink>
          ))}

          {/* Quick launch for Live POS & KDS */}
          <div className="pt-2 border-t border-neutral-100 mt-2 space-y-1">
            <a
              href={`${process.env.NEXT_PUBLIC_CUSTOMER_URL || 'https://100k.rycos.eu'}/pos`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
            >
              <span>Terminal POS (Kelner)</span>
              <span aria-hidden className="text-amber-600">↗</span>
            </a>
            <a
              href={`${process.env.NEXT_PUBLIC_CUSTOMER_URL || 'https://100k.rycos.eu'}/kds`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2 text-xs font-bold text-white hover:bg-neutral-800 transition-colors"
            >
              <span>Kuchnia Live (KDS)</span>
              <span aria-hidden className="text-amber-400">↗</span>
            </a>
          </div>
        </nav>
        <div className="border-t border-neutral-200 p-3">
          <p className="truncate px-3 pb-2 text-xs text-neutral-400">{user.email}</p>
          <form action={signOut}>
            <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-neutral-600 hover:bg-neutral-100">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
