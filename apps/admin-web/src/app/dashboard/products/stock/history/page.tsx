import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'

interface HistoryRow {
  id: number
  product_id: number
  product_name: string | null
  quantity_change: number
  quantity_after: number | null
  is_available_after: boolean | null
  source: 'manual' | 'order' | 'auto_disable'
  reference: string | null
  note: string | null
  created_at: string
}

export default async function StockHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; product_id?: string }>
}) {
  const locale = await getAdminLocale()
  const sp = await searchParams
  const qs = new URLSearchParams()
  if (sp.source) qs.set('source', sp.source)
  if (sp.product_id) qs.set('product_id', sp.product_id)
  qs.set('limit', '100')
  const rows = (await adminApiData<HistoryRow[]>(`/inventory-history?${qs.toString()}`)) ?? []

  const sources = [
    { v: '', label: locale === 'pl' ? 'Wszystkie źródła' : 'All sources' },
    { v: 'order', label: locale === 'pl' ? 'Sprzedaż / Zamówienia' : 'Sales' },
    { v: 'manual', label: locale === 'pl' ? 'Ręczne edycje' : 'Manual edits' },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/products/stock" className="text-sm text-neutral-500 hover:text-brand">
        &larr; {getTranslation(locale, 'stock.title', 'Stany magazynowe')}
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{getTranslation(locale, 'stock.history_btn', 'Historia stanów magazynowych')}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {locale === 'pl'
              ? 'Każda zmiana magazynowa od najnowszych. Filtruj wg źródła (sprzedaż lub ręczna korekta).'
              : 'Every stock change, most recent first. Filter by source to separate sales from manual edits.'}
          </p>
        </div>
        <Link href="/dashboard/products/stock/insights" className="text-sm font-semibold text-brand hover:underline">
          {getTranslation(locale, 'stock.insights_btn', 'Analiza')} &rarr;
        </Link>
      </div>

      <form method="get" className="card mt-6 flex flex-wrap gap-3">
        <div>
          <label className="label" htmlFor="source">{locale === 'pl' ? 'Źródło' : 'Source'}</label>
          <select id="source" name="source" defaultValue={sp.source ?? ''} className="input">
            {sources.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="product_id">{locale === 'pl' ? 'ID Produktu (opcjonalnie)' : 'Product ID (optional)'}</label>
          <input id="product_id" name="product_id" type="number" inputMode="numeric" defaultValue={sp.product_id ?? ''} className="input" />
        </div>
        <div className="flex items-end">
          <button className="btn-brand sm:w-auto sm:px-6">{locale === 'pl' ? 'Filtruj' : 'Filter'}</button>
        </div>
      </form>

      <div className="card mt-4 overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-3">{locale === 'pl' ? 'Kiedy' : 'When'}</th>
              <th className="px-4 py-3">{getTranslation(locale, 'products.table.product', 'Produkt')}</th>
              <th className="px-4 py-3">{locale === 'pl' ? 'Zmiana' : 'Change'}</th>
              <th className="px-4 py-3">{locale === 'pl' ? 'Stan po' : 'After'}</th>
              <th className="px-4 py-3">{locale === 'pl' ? 'Źródło' : 'Source'}</th>
              <th className="px-4 py-3">Ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">{locale === 'pl' ? 'Brak wpisów w historii.' : 'No history rows match the filter.'}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-neutral-500">{new Date(r.created_at).toLocaleString(locale === 'pl' ? 'pl-PL' : locale === 'de' ? 'de-DE' : 'en-US')}</td>
                <td className="px-4 py-3 font-medium">{r.product_name ?? `#${r.product_id}`}</td>
                <td className={`px-4 py-3 font-mono ${r.quantity_change > 0 ? 'text-green-700' : r.quantity_change < 0 ? 'text-red-600' : 'text-neutral-500'}`}>
                  {r.quantity_change > 0 ? `+${r.quantity_change}` : r.quantity_change}
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {r.quantity_after ?? '—'}
                  {r.is_available_after === false && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{locale === 'pl' ? 'brak' : 'out'}</span>}
                </td>
                <td className="px-4 py-3 text-neutral-600">{r.source}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-400">{r.reference ?? r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

