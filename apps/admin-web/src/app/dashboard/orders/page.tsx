import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'

interface KPIs {
  revenue: number
  orders: number
  aov: number
  items_sold: number
  revenue_delta_pct: number | null
  orders_delta_pct: number | null
  aov_delta_pct: number | null
  items_delta_pct: number | null
}
interface Analytics {
  range: string
  kpis: KPIs
  daily: { day: string; revenue: number; orders: number }[]
  monthly: { month: string; revenue: number; orders: number }[]
  top_products: { id: number; name: string; qty: number; revenue: number }[]
  hour_heatmap: { dow: number; hour: number; orders: number }[]
  by_brand: { brand_name: string; revenue: number; orders: number }[]
}
interface Brand { id: number; name: string | null }
interface Company { currency: string }

const RANGES: { key: string; label: string }[] = [
  { key: 'today',  label: 'Today' },
  { key: '7d',     label: '7 days' },
  { key: '30d',    label: '30 days' },
  { key: '90d',    label: '90 days' },
  { key: 'mtd',    label: 'Month to date' },
  { key: 'ytd',    label: 'Year to date' },
  { key: 'custom', label: 'Custom range' },
]

// Default custom range = last 30 calendar days, ending today. Used to pre-fill
// the date pickers when the user first switches to Custom so they don't have
// to type two dates from scratch.
function isoToday(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const fmtMoney = (n: number, cur: string) =>
  `${cur} ${(Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtPct = (n: number | null) => {
  if (n == null) return '—'
  const rounded = Math.round(n * 10) / 10
  if (rounded === 0) return '0%'
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

export default async function OrdersAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; brand_id?: string; from?: string; to?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const sp = await searchParams
  const range = sp.range ?? '30d'
  const brandId = sp.brand_id ?? ''
  // For the picker default: 30 days ago → today. The Custom branch passes
  // these straight through to the server.
  const fromInput = sp.from ?? isoToday(-29)
  const toInput   = sp.to   ?? isoToday(0)

  const qs = new URLSearchParams({ range })
  if (brandId) qs.set('brand_id', brandId)
  if (range === 'custom') {
    qs.set('from', fromInput)
    qs.set('to', toInput)
  }

  const [data, brands, company] = await Promise.all([
    adminApiData<Analytics>(`/orders/analytics?${qs.toString()}`),
    adminApiData<Brand[]>('/brands'),
    adminApiData<Company>('/companies'),
  ])
  const currency = (company?.currency || 'PLN').toUpperCase()
  const a = data

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders analytics</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Revenue, order counts and trends. Comparison delta is vs the immediately preceding window of the same length.
          </p>
        </div>
      </div>

      {/* Filters — pure GET form, server-rendered. */}
      <form method="get" className="card mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="range">Range</label>
          <select id="range" name="range" defaultValue={range} className="input">
            {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        {/* Custom range pickers — always rendered so the user can fill them in
            before switching the dropdown to Custom; server ignores them
            unless range=custom. */}
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={fromInput} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={toInput} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="brand_id">Brand</label>
          <select id="brand_id" name="brand_id" defaultValue={brandId} className="input">
            <option value="">All brands</option>
            {(brands ?? []).map((b) => <option key={b.id} value={b.id}>{b.name || `Brand ${b.id}`}</option>)}
          </select>
        </div>
        <div>
          <button className="btn-brand sm:w-auto sm:px-6">Apply</button>
        </div>
      </form>

      {!a ? (
        <div className="card mt-6 text-sm text-neutral-500">Couldn't load analytics. Try again shortly.</div>
      ) : (
        <>
          {/* KPI strip */}
          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Revenue" value={fmtMoney(a.kpis.revenue, currency)} delta={a.kpis.revenue_delta_pct} />
            <Kpi label="Orders" value={a.kpis.orders.toLocaleString()} delta={a.kpis.orders_delta_pct} />
            <Kpi label="Avg order value" value={fmtMoney(a.kpis.aov, currency)} delta={a.kpis.aov_delta_pct} />
            <Kpi label="Items sold" value={a.kpis.items_sold.toLocaleString()} delta={a.kpis.items_delta_pct} />
          </section>

          {/* Daily revenue chart */}
          <section className="card mt-6">
            <h2 className="text-base font-semibold">Revenue per day</h2>
            <p className="text-xs text-neutral-500">{a.daily.length} day{a.daily.length === 1 ? '' : 's'} in the selected range.</p>
            <div className="mt-4">
              {a.daily.length === 0 ? (
                <p className="text-sm text-neutral-400">No orders in this range.</p>
              ) : (
                <BarChart
                  series={a.daily.map((d) => ({ label: d.day, value: d.revenue, sub: `${d.orders} order${d.orders === 1 ? '' : 's'}` }))}
                  height={160}
                  formatValue={(v) => fmtMoney(v, currency)}
                />
              )}
            </div>
          </section>

          {/* Monthly trend */}
          <section className="card mt-6">
            <h2 className="text-base font-semibold">Month-over-month revenue (last 12 months)</h2>
            <p className="text-xs text-neutral-500">Independent of the range filter so you can see seasonality even when scoped to a recent window.</p>
            <div className="mt-4">
              {a.monthly.length === 0 ? (
                <p className="text-sm text-neutral-400">No order history yet.</p>
              ) : (
                <BarChart
                  series={a.monthly.map((m) => ({ label: m.month, value: m.revenue, sub: `${m.orders} order${m.orders === 1 ? '' : 's'}` }))}
                  height={160}
                  formatValue={(v) => fmtMoney(v, currency)}
                  // Compact axis: month label like "11" (skip year for tight bars) — full date on tooltip via <title>.
                  labelTransform={(s) => s.slice(5)}
                />
              )}
            </div>
          </section>

          {/* Top sellers + brand breakdown side-by-side on wide screens */}
          <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card">
              <h2 className="text-base font-semibold">Top sellers</h2>
              <p className="text-xs text-neutral-500">By revenue in the selected range.</p>
              <div className="mt-3">
                {a.top_products.length === 0 ? (
                  <p className="text-sm text-neutral-400">Nothing sold yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
                      <tr><th className="py-1">Product</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Revenue</th></tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {a.top_products.map((p) => (
                        <tr key={p.id}>
                          <td className="py-1.5 font-medium">{p.name}</td>
                          <td className="py-1.5 text-right font-mono">{p.qty}</td>
                          <td className="py-1.5 text-right font-mono">{fmtMoney(p.revenue, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="card">
              <h2 className="text-base font-semibold">Revenue by brand</h2>
              <p className="text-xs text-neutral-500">In the selected range.</p>
              <div className="mt-3">
                {a.by_brand.length === 0 ? (
                  <p className="text-sm text-neutral-400">No brand activity yet.</p>
                ) : (
                  <HorizontalBars rows={a.by_brand.map((b) => ({ label: b.brand_name, value: b.revenue, sub: `${b.orders} order${b.orders === 1 ? '' : 's'}` }))} formatValue={(v) => fmtMoney(v, currency)} />
                )}
              </div>
            </div>
          </section>

          {/* Hour heatmap */}
          <section className="card mt-6">
            <h2 className="text-base font-semibold">When customers order</h2>
            <p className="text-xs text-neutral-500">Order count by day-of-week × hour-of-day. Darker = busier.</p>
            <div className="mt-3">
              <Heatmap cells={a.hour_heatmap} />
            </div>
          </section>

          <p className="mt-6 text-xs text-neutral-400">
            Only fulfilled orders (status <code>completed</code> or <code>ready_to_collect</code>) are included. Cart abandons and failed payments don't pollute the numbers.{' '}
            <Link href="/dashboard/products/stock/insights" className="font-medium text-brand hover:underline">Stock insights →</Link>
          </p>
        </>
      )}
    </div>
  )
}

// — Small server-rendered components ----------------------------------------

function Kpi({ label, value, delta }: { label: string; value: string; delta: number | null }) {
  const positive = delta != null && delta > 0
  const negative = delta != null && delta < 0
  const color = positive ? 'text-green-700' : negative ? 'text-red-600' : 'text-neutral-400'
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      <p className={`mt-0.5 text-xs font-medium ${color}`}>
        {fmtPct(delta)} <span className="font-normal text-neutral-400">vs prior period</span>
      </p>
    </div>
  )
}

interface SeriesPoint { label: string; value: number; sub?: string }

function BarChart({
  series, height = 140, formatValue, labelTransform,
}: {
  series: SeriesPoint[]
  height?: number
  formatValue?: (v: number) => string
  labelTransform?: (label: string) => string
}) {
  const max = Math.max(1, ...series.map((s) => s.value))
  const w = 800
  const gap = 4
  const barW = Math.max(2, (w - gap * (series.length - 1)) / series.length)
  const labelEvery = Math.ceil(series.length / Math.max(1, Math.floor(w / 60)))
  return (
    <svg viewBox={`0 0 ${w} ${height + 28}`} className="w-full" role="img" aria-label="bar chart">
      {series.map((d, i) => {
        const h = max > 0 ? (d.value / max) * height : 0
        const x = i * (barW + gap)
        const y = height - h
        const tip = `${d.label}: ${formatValue ? formatValue(d.value) : d.value}${d.sub ? ` (${d.sub})` : ''}`
        const lbl = labelTransform ? labelTransform(d.label) : d.label.slice(5)
        return (
          <g key={`${d.label}-${i}`}>
            <title>{tip}</title>
            <rect x={x} y={y} width={barW} height={h} className="fill-brand" rx={2} />
            {i % labelEvery === 0 && (
              <text x={x + barW / 2} y={height + 18} textAnchor="middle" className="fill-neutral-400 text-[9px]">{lbl}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function HorizontalBars({ rows, formatValue }: { rows: SeriesPoint[]; formatValue?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="w-28 shrink-0 truncate text-sm font-medium" title={r.label}>{r.label}</div>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-neutral-100">
            <div className="h-full rounded bg-brand" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <div className="w-32 shrink-0 text-right font-mono text-xs text-neutral-700">
            {formatValue ? formatValue(r.value) : r.value}
            {r.sub && <span className="ml-2 text-neutral-400">{r.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// 7×24 heatmap — order count per (day-of-week, hour). Cell color scales with
// the max across the grid. Empty cells render as a faint placeholder so the
// grid is visible even when traffic is sparse.
function Heatmap({ cells }: { cells: { dow: number; hour: number; orders: number }[] }) {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const c of cells) {
    if (c.dow >= 0 && c.dow < 7 && c.hour >= 0 && c.hour < 24) grid[c.dow][c.hour] = c.orders
  }
  const max = Math.max(1, ...cells.map((c) => c.orders))

  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="w-10"></th>
            {Array.from({ length: 24 }).map((_, h) => (
              <th key={h} className="w-7 px-0 text-center font-normal text-neutral-400">{h % 3 === 0 ? h : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, dow) => (
            <tr key={dow}>
              <td className="pr-2 text-right text-neutral-500">{DOW_LABELS[dow]}</td>
              {row.map((v, h) => {
                const intensity = max === 0 ? 0 : v / max
                // brand color (#FF8800) at varying opacity
                const bg = v === 0 ? '#f5f5f5' : `rgba(255, 136, 0, ${0.15 + intensity * 0.85})`
                return (
                  <td key={h} className="p-0">
                    <div
                      title={`${DOW_LABELS[dow]} ${h.toString().padStart(2, '0')}:00 — ${v} order${v === 1 ? '' : 's'}`}
                      className="m-px h-6 w-7 rounded"
                      style={{ background: bg }}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
