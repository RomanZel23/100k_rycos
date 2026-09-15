import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'

interface Insights {
  top_movers: { id: number; name: string; total_deducted: number }[]
  deductions_by_day: { day: string; total: number }[]
  low_stock: { id: number; name: string; stock_quantity: number; is_available: boolean }[]
}

export default async function StockInsightsPage() {
  const locale = await getAdminLocale()
  const data = (await adminApiData<Insights>('/inventory-insights')) ?? { top_movers: [], deductions_by_day: [], low_stock: [] }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/products/stock" className="text-sm text-neutral-500 hover:text-brand">
        &larr; {getTranslation(locale, 'stock.title', 'Stany magazynowe')}
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{getTranslation(locale, 'stock.insights_btn', 'Analiza stanów i sprzedaży')}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {locale === 'pl' ? 'Ostatnie 30 dni rotacji produktów i pozycje na wyczerpaniu.' : 'Last 30 days of order deductions and items running low.'}
          </p>
        </div>
        <Link href="/dashboard/products/stock/history" className="text-sm font-semibold text-brand hover:underline">
          {getTranslation(locale, 'stock.history_btn', 'Historia zmian')} &rarr;
        </Link>
      </div>

      {/* Deductions per day */}
      <section className="card mt-6">
        <h2 className="text-base font-semibold">{locale === 'pl' ? 'Sprzedane sztuki dziennie' : 'Units sold per day'}</h2>
        <p className="text-xs text-neutral-500">{locale === 'pl' ? 'Łączna liczba pozycji odpisanych z magazynu przez zamówienia.' : 'Total quantity of items deducted by orders, day by day.'}</p>
        <div className="mt-4">
          {data.deductions_by_day.length === 0 ? (
            <p className="text-sm text-neutral-400">{locale === 'pl' ? 'Brak sprzedaży w ciągu ostatnich 30 dni.' : 'No sales activity in the last 30 days.'}</p>
          ) : (
            <BarChart series={data.deductions_by_day.map((d) => ({ label: d.day, value: d.total }))} height={140} />
          )}
        </div>
      </section>

      {/* Top movers */}
      <section className="card mt-6">
        <h2 className="text-base font-semibold">{getTranslation(locale, 'orders.top_sellers', 'Bestsellery')} ({locale === 'pl' ? 'ostatnie 30 dni' : 'last 30 days'})</h2>
        <p className="text-xs text-neutral-500">{locale === 'pl' ? 'Najczęściej zamawiane pozycje z menu.' : 'Products ordered most often.'}</p>
        <div className="mt-4">
          {data.top_movers.length === 0 ? (
            <p className="text-sm text-neutral-400">{locale === 'pl' ? 'Brak sprzedaży.' : 'No sales yet.'}</p>
          ) : (
            <HorizontalBars rows={data.top_movers.map((m) => ({ label: m.name, value: m.total_deducted }))} />
          )}
        </div>
      </section>

      {/* Low stock */}
      <section className="card mt-6">
        <h2 className="text-base font-semibold">{locale === 'pl' ? 'Niski stan magazynowy' : 'Running low'}</h2>
        <p className="text-xs text-neutral-500">{locale === 'pl' ? 'Śledzone pozycje z zapasem ≤ 10 sztuk. Uzupełnij zapas.' : 'Tracked items with 10 or fewer in stock. Restock soon.'}</p>
        <div className="mt-4">
          {data.low_stock.length === 0 ? (
            <p className="text-sm text-neutral-400">{locale === 'pl' ? 'Wszystkie pozycje mają bezpieczny stan magazynowy. 🎉' : 'Nothing tracked is low. 🎉'}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-3 py-2">{getTranslation(locale, 'products.table.product', 'Produkt')}</th>
                  <th className="px-3 py-2 text-right">{getTranslation(locale, 'stock.quantity', 'Na stanie')}</th>
                  <th className="px-3 py-2">{getTranslation(locale, 'common.status', 'Status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.low_stock.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className={`px-3 py-2 text-right font-mono ${p.stock_quantity === 0 ? 'text-red-600' : p.stock_quantity <= 3 ? 'text-amber-700' : 'text-neutral-700'}`}>{p.stock_quantity}</td>
                    <td className="px-3 py-2">{p.is_available ? <span className="text-green-700">{locale === 'pl' ? 'dostępny' : 'available'}</span> : <span className="text-red-600">{locale === 'pl' ? 'wyprzedany' : 'out of stock'}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

function BarChart({ series, height = 120 }: { series: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...series.map((s) => s.value))
  const w = 600
  const gap = 4
  const barW = (w - gap * (series.length - 1)) / series.length
  const labelEvery = Math.ceil(series.length / 8)
  return (
    <svg viewBox={`0 0 ${w} ${height + 24}`} className="w-full" role="img" aria-label="Units sold per day">
      {series.map((d, i) => {
        const h = (d.value / max) * height
        const x = i * (barW + gap)
        const y = height - h
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={h} className="fill-brand" rx={2} />
            {i % labelEvery === 0 && (
              <text x={x + barW / 2} y={height + 16} textAnchor="middle" className="fill-neutral-400 text-[9px]">
                {d.label.slice(5)}
              </text>
            )}
            {d.value > 0 && h > 14 && (
              <text x={x + barW / 2} y={y + 11} textAnchor="middle" className="fill-white text-[9px] font-bold">
                {d.value}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function HorizontalBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="w-32 shrink-0 truncate text-sm font-medium">{r.label}</div>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-neutral-100">
            <div
              className="h-full rounded bg-brand"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <div className="w-10 shrink-0 text-right font-mono text-sm">{r.value}</div>
        </div>
      ))}
    </div>
  )
}

