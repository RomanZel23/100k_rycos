import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'

interface Billing {
  month: string
  currency: string
  orders: number
  sales_gross: number
  commission_pct: number
  commission: number
  tier: { label: string; up_to: number | null; base_usd: number }
  base_usd: number
  base_currency: string
  by_terminal: { terminal_id: string | null; order_count: number; gross: number; commission: number }[]
  note: string
}
interface Stats {
  bucket: string
  series: { bucket: string; order_count: number; gross: number }[]
  totals: { order_count: number; gross: number }
}

const money = (n: number, c: string) => `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${c ? ' ' + c : ''}`
const usd = (n: number) => `$${n.toLocaleString()}`

function bucketLabel(iso: string, bucket: string, locale: string) {
  const d = new Date(iso)
  const loc = locale === 'pl' ? 'pl-PL' : locale === 'de' ? 'de-DE' : 'en-US'
  if (bucket === 'month') return d.toLocaleDateString(loc, { month: 'short', year: '2-digit' })
  return d.toLocaleDateString(loc, { month: 'short', day: 'numeric' })
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const locale = await getAdminLocale()
  const { range } = await searchParams
  const bucket = range === 'week' ? 'week' : 'month'

  const [billing, stats] = await Promise.all([
    adminApiData<Billing>('/billing/summary'),
    adminApiData<Stats>(`/stats/orders?bucket=${bucket}`),
  ])

  const maxOrders = Math.max(1, ...((stats?.series ?? []).map((s) => s.order_count)))

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">{getTranslation(locale, 'billing.title', 'Rozliczenia i Prowizje')}</h1>
      <p className="mt-1 text-sm text-neutral-500">{getTranslation(locale, 'billing.subtitle', 'Podsumowanie zamówień, naliczona prowizja oraz miesięczny plan abonamentowy.')}</p>

      {!billing ? (
        <div className="card mt-6 text-sm text-neutral-500">{locale === 'pl' ? 'Nie udało się wczytać rozliczeń.' : 'Couldn’t load billing right now.'}</div>
      ) : (
        <>
          {/* Current month summary */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Stat label={`${getTranslation(locale, 'nav.orders', 'Zamówienia')} (${billing.month})`} value={billing.orders.toLocaleString()} />
            <Stat label={getTranslation(locale, 'billing.sales', 'Wartość sprzedaży')} value={money(billing.sales_gross, billing.currency)} />
            <Stat label={`${getTranslation(locale, 'billing.plan', 'Plan')} — ${billing.tier.label}`} value={usd(billing.base_usd) + (locale === 'pl' ? '/mies.' : '/mo')} />
            <Stat label={`${getTranslation(locale, 'billing.commission', 'Prowizja')} (${billing.commission_pct}%)`} value={money(billing.commission, billing.currency)} />
          </div>

          <div className="card mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-400">{getTranslation(locale, 'billing.estimated_charge', 'Szacowane opłaty w tym miesiącu')}</p>
              <p className="mt-1 text-lg font-semibold">
                {usd(billing.base_usd)} <span className="text-neutral-400">{locale === 'pl' ? 'baza' : 'base'}</span>
                {'  +  '}
                {money(billing.commission, billing.currency)} <span className="text-neutral-400">{getTranslation(locale, 'billing.commission', 'prowizja')}</span>
              </p>
            </div>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {billing.tier.label}
            </span>
          </div>
          <p className="mt-2 text-xs text-neutral-400">{billing.note}</p>

          {/* Order stats */}
          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{getTranslation(locale, 'billing.order_volume', 'Wolumen zamówień')}</h2>
            <div className="flex gap-1 text-sm">
              <RangeTab active={bucket === 'month'} href="/dashboard/billing?range=month" label={getTranslation(locale, 'billing.monthly', 'Miesięcznie')} />
              <RangeTab active={bucket === 'week'} href="/dashboard/billing?range=week" label={getTranslation(locale, 'billing.weekly', 'Tygodniowo')} />
            </div>
          </div>
          <div className="card mt-3">
            {(stats?.series ?? []).length === 0 ? (
              <p className="text-sm text-neutral-400">{locale === 'pl' ? 'Brak zamówień w tym okresie.' : 'No orders in this period.'}</p>
            ) : (
              <div className="space-y-2">
                {stats!.series.map((s) => (
                  <div key={s.bucket} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs text-neutral-500">{bucketLabel(s.bucket, bucket, locale)}</span>
                    <div className="h-5 flex-1 rounded bg-neutral-100">
                      <div
                        className="flex h-5 items-center rounded bg-brand px-2 text-[10px] font-semibold text-white"
                        style={{ width: `${Math.max(6, (s.order_count / maxOrders) * 100)}%` }}
                      >
                        {s.order_count}
                      </div>
                    </div>
                    <span className="w-28 shrink-0 text-right text-xs text-neutral-500">
                      {money(s.gross, billing.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per-terminal */}
          <h2 className="mt-8 text-lg font-semibold">{locale === 'pl' ? 'W tym miesiącu wg stanowisk' : 'This month by terminal'}</h2>
          <div className="card mt-3 overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="px-4 py-3">{getTranslation(locale, 'terminals.title', 'Stanowisko')}</th>
                    <th className="px-4 py-3 text-right">{getTranslation(locale, 'orders.kpi.orders', 'Zamówienia')}</th>
                    <th className="px-4 py-3 text-right">{getTranslation(locale, 'orders.kpi.revenue', 'Przychód')}</th>
                    <th className="px-4 py-3 text-right">{getTranslation(locale, 'billing.commission', 'Prowizja')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {billing.by_terminal.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-400">{locale === 'pl' ? 'Brak sprzedaży w tym miesiącu.' : 'No sales this month.'}</td></tr>
                  )}
                  {billing.by_terminal.map((t, i) => (
                    <tr key={t.terminal_id ?? `none-${i}`}>
                      <td className="px-4 py-3 font-medium">{t.terminal_id ?? (locale === 'pl' ? 'Online / nieprzypisane' : 'Online / unassigned')}</td>
                      <td className="px-4 py-3 text-right">{t.order_count}</td>
                      <td className="px-4 py-3 text-right">{money(t.gross, billing.currency)}</td>
                      <td className="px-4 py-3 text-right">{money(t.commission, billing.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function RangeTab({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1 font-medium ${active ? 'bg-brand text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}
    >
      {label}
    </Link>
  )
}

