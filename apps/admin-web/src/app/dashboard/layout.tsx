import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Logo } from '@/components/Logo'
import { NavLink } from '@/components/NavLink'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { currentUser, isManager, isPlatformAdmin } from '@/lib/auth'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'

async function signOut() {
  'use server'
  const cookieStore = await cookies()
  cookieStore.delete('rycos_token')
  cookieStore.delete('rycos_user')
  redirect('/login')
}

// `manager: true` items are hidden from staff (operational users).
// `platformAdminOnly: true` items are visible ONLY to platform operators (SolutionsBay / Roman).
const NAV = [
  { href: '/dashboard', key: 'nav.overview', defaultLabel: 'Overview', manager: false },
  { href: '/dashboard/orders', key: 'nav.orders', defaultLabel: 'Orders', manager: true },
  { href: '/dashboard/products', key: 'nav.products', defaultLabel: 'Products', manager: true },
  { href: '/dashboard/brands', key: 'nav.brands', defaultLabel: 'Brands', manager: true },
  { href: '/dashboard/locations', key: 'nav.locations', defaultLabel: 'Locations', manager: true },
  { href: '/dashboard/terminals', key: 'nav.terminals', defaultLabel: 'POS terminals', manager: true },
  { href: '/dashboard/fiscal-devices', key: 'nav.fiscal', defaultLabel: 'Fiscal devices', manager: true },
  { href: '/dashboard/licenses', key: 'nav.licenses', defaultLabel: 'Licencje RYCOS', manager: true },
  { href: '/dashboard/payment-gateways', key: 'nav.gateways', defaultLabel: 'Payment gateway', manager: true },
  { href: '/dashboard/qr-print', key: 'nav.qr', defaultLabel: 'QR Print', manager: true },
  { href: '/dashboard/users', key: 'nav.users', defaultLabel: 'Users', manager: true },
  { href: '/dashboard/master', key: 'nav.master', defaultLabel: 'Platform SaaS (Master)', manager: true, platformAdminOnly: true },
  { href: '/dashboard/billing', key: 'nav.billing', defaultLabel: 'Billing', manager: true },
  { href: '/dashboard/stress-test', key: 'nav.stress_test', defaultLabel: 'Stress Test (100k)', manager: true, platformAdminOnly: true },
  { href: '/dashboard/settings', key: 'nav.settings', defaultLabel: 'Settings', manager: true },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const manager = isManager(user)
  const platformAdmin = isPlatformAdmin(user)
  const locale = await getAdminLocale()
  const nav = NAV.filter((item) => {
    if (item.platformAdminOnly && !platformAdmin) return false
    if (item.manager && !manager) return false
    return true
  })

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r border-neutral-200 bg-white shadow-xs">
        <div className="border-b border-neutral-100 px-5 py-4">
          <Logo />
        </div>

        {/* Language Switcher bar */}
        <div className="px-3 pt-3">
          <LanguageSwitcher currentLocale={locale} />
        </div>

        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {getTranslation(locale, item.key, item.defaultLabel)}
            </NavLink>
          ))}

          {/* Quick launch for Live POS & KDS */}
          <div className="pt-3 border-t border-neutral-100 mt-3 space-y-1.5">
            <a
              href={`${process.env.NEXT_PUBLIC_CUSTOMER_URL || 'https://100k.rycos.eu'}/pos`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg bg-techbay-blue px-3 py-2 text-xs font-bold text-white hover:bg-techbay-blue-dark transition-colors shadow-xs"
            >
              <span>{getTranslation(locale, 'nav.pos_live', 'Terminal POS (Kelner)')}</span>
              <span aria-hidden className="text-techbay-lightblue">↗</span>
            </a>
            <a
              href={`${process.env.NEXT_PUBLIC_CUSTOMER_URL || 'https://100k.rycos.eu'}/kds`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2 text-xs font-bold text-white hover:bg-neutral-800 transition-colors shadow-xs"
            >
              <span>{getTranslation(locale, 'nav.kds_live', 'Kuchnia Live (KDS)')}</span>
              <span aria-hidden className="text-brand">↗</span>
            </a>
          </div>
        </nav>

        <div className="border-t border-neutral-100 p-3 bg-neutral-50/50">
          <p className="truncate px-3 pb-2 text-xs font-medium text-neutral-400">{user.email}</p>
          <form action={signOut}>
            <button className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-brand transition">
              {getTranslation(locale, 'nav.sign_out', 'Sign out')}
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
