import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Logo } from '@/components/Logo'
import { NavLink } from '@/components/NavLink'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { currentUser, isManager, isPlatformAdmin, companyIdOf } from '@/lib/auth'
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
  { href: '/dashboard/structure', key: 'nav.structure', defaultLabel: 'Structure', manager: true },
  { href: '/dashboard/locations', key: 'nav.locations', defaultLabel: 'Locations', manager: true },
  { href: '/dashboard/terminals', key: 'nav.terminals', defaultLabel: 'POS terminals', manager: true },
  { href: '/dashboard/fiscal-devices', key: 'nav.fiscal', defaultLabel: 'Fiscal devices', manager: true },
  { href: '/dashboard/licenses', key: 'nav.licenses', defaultLabel: 'Licencje RYCOS', manager: true },
  { href: '/dashboard/payment-gateways', key: 'nav.gateways', defaultLabel: 'Payment gateway', manager: true },
  { href: '/dashboard/qr-print', key: 'nav.qr', defaultLabel: 'QR Print', manager: true },
  { href: '/dashboard/users', key: 'nav.users', defaultLabel: 'Users', manager: true },
  { href: '/dashboard/master', key: 'nav.master', defaultLabel: 'Platform SaaS (Master)', manager: true, platformAdminOnly: true },
  { href: '/dashboard/database', key: 'nav.database', defaultLabel: 'Baza Danych (DB)', manager: true, platformAdminOnly: true },
  { href: '/dashboard/billing', key: 'nav.billing', defaultLabel: 'Billing', manager: true },
  { href: '/dashboard/stress-test', key: 'nav.stress_test', defaultLabel: 'Stress Test (100k)', manager: true, platformAdminOnly: true },
  { href: '/dashboard/settings', key: 'nav.settings', defaultLabel: 'Settings', manager: true },
]

import { adminApi } from '@/lib/api'
import { CompanySwitcher } from '@/components/CompanySwitcher'
import { switchActiveCompany } from './actions'

async function resetActiveCompany() {
  'use server'
  await switchActiveCompany(null)
}

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

  // Multi-tenant company switcher for Platform Admin
  let companiesList: Array<{ id: number; name: string; slug: string; nip?: string | null }> = []
  const cookieStore = await cookies()
  const defaultCompanyId = companyIdOf(user)
  const activeCompanyIdCookie = cookieStore.get('active_company_id')?.value
  const activeCompanyId = activeCompanyIdCookie ? parseInt(activeCompanyIdCookie, 10) : defaultCompanyId

  if (platformAdmin) {
    try {
      const res = await adminApi('/master/companies')
      if (res.ok) {
        const json = await res.json()
        companiesList = json.data || []
      }
    } catch {}

    if (companiesList.length === 0) {
      companiesList = [{ id: defaultCompanyId, name: 'Rycos Food Group', slug: 'rycos-food-group' }]
    }
  }

  const isOverridden = platformAdmin && activeCompanyId !== defaultCompanyId
  const currentCompany = companiesList.find((c) => c.id === activeCompanyId)

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r border-neutral-200 bg-white shadow-xs">
        <div className="border-b border-neutral-100 px-5 py-4">
          <Logo />
        </div>

        {/* Multi-tenant Company Switcher (visible for Platform Super-Admin) */}
        {platformAdmin && companiesList.length > 0 && (
          <CompanySwitcher
            companies={companiesList}
            activeCompanyId={activeCompanyId}
            defaultCompanyId={defaultCompanyId}
          />
        )}

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
            <button className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-brand transition cursor-pointer">
              {getTranslation(locale, 'nav.sign_out', 'Sign out')}
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-neutral-50/60">
        {/* Super-Admin Active Company Override Banner */}
        {isOverridden && currentCompany && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-8 py-2.5 flex items-center justify-between text-xs text-amber-900 sticky top-0 z-30 backdrop-blur-xs">
            <div className="flex items-center gap-2 font-medium">
              <span className="text-base">🏢</span>
              <span>
                <strong>Tryb Super-Admin:</strong> Przeglądasz i edytujesz dane firmy{' '}
                <strong className="text-techbay-blue underline">{currentCompany.name}</strong> (ID: {currentCompany.id}
                {currentCompany.nip ? `, NIP: ${currentCompany.nip}` : ''})
              </span>
            </div>
            <form action={resetActiveCompany}>
              <button
                type="submit"
                className="rounded-lg bg-white border border-amber-300 px-3 py-1 font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs cursor-pointer"
              >
                Wróć do firmy domyślnej
              </button>
            </form>
          </div>
        )}

        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  )
}
