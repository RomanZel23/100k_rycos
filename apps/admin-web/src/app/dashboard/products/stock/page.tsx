import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { Banner } from '@/components/Banner'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import { saveStock } from './actions'
import { StockEditor } from './StockEditor'

interface Product {
  id: number
  name: string
  is_available: boolean
  stock_quantity: number | null
  image_url?: string | null
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const locale = await getAdminLocale()
  const { error, notice } = await searchParams
  const products = (await adminApiData<Product[]>('/products')) ?? []
  const sorted = [...products].sort((a, b) => Number(a.is_available === false) - Number(b.is_available === false) || a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/products" className="text-sm text-neutral-500 hover:text-brand">
        &larr; {getTranslation(locale, 'nav.products', 'Produkty')}
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{getTranslation(locale, 'stock.title', 'Stany magazynowe')}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {getTranslation(locale, 'stock.subtitle', 'Szybki podgląd ilości i dostępności pozycji. Codzienna obsługa odbywa się na POS.')}
          </p>
        </div>
        <div className="flex gap-4 text-sm font-semibold">
          <Link href="/dashboard/products/stock/insights" className="text-brand hover:underline">
            {getTranslation(locale, 'stock.insights_btn', 'Analiza sprzedaży')}
          </Link>
          <Link href="/dashboard/products/stock/history" className="text-brand hover:underline">
            {getTranslation(locale, 'stock.history_btn', 'Historia zmian')}
          </Link>
        </div>
      </div>

      {error && <Banner kind="error" className="mt-4">{error}</Banner>}
      {notice && <Banner kind="success" className="mt-4">{notice}</Banner>}

      {sorted.length === 0 ? (
        <div className="card mt-6 text-sm text-neutral-500">
          {getTranslation(locale, 'products.empty', 'Brak produktów w menu.')}
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {sorted.map((p) => (
            <li key={p.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.image_url ? (
                <img src={p.image_url} alt="" crossOrigin="anonymous" className="h-12 w-12 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">no img</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-neutral-500">
                  {p.stock_quantity == null ? (locale === 'pl' ? 'Bez limitu' : 'Not tracked') : `${p.stock_quantity} ${locale === 'pl' ? 'szt. na stanie' : 'in stock'}`}
                  {' · '}
                  {p.is_available ? <span className="text-green-700">{locale === 'pl' ? 'dostępny' : 'available'}</span> : <span className="text-red-600">{locale === 'pl' ? 'wyprzedany' : 'out of stock'}</span>}
                </p>
              </div>

              <form action={saveStock} className="flex shrink-0 flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="name" value={p.name} />
                <StockEditor productId={p.id} initialQty={p.stock_quantity} />
                <label className="flex cursor-pointer items-center gap-2 pb-3 text-xs font-medium text-neutral-700">
                  <input type="checkbox" name="is_available" defaultChecked={p.is_available} className="h-4 w-4 accent-brand" />
                  {locale === 'pl' ? 'Dostępny' : 'Available'}
                </label>
                <button className="btn-brand h-11 sm:w-auto sm:px-5">{getTranslation(locale, 'btn.save', 'Zapisz')}</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-neutral-400">
        {locale === 'pl'
          ? 'Odznacz „Śledź stan magazynowy” dla pozycji nielimitowanych (usługi, dania robione na bieżąco).'
          : 'Uncheck Track stock for unlimited items (services, made-to-order).'}
      </p>
    </div>
  )
}

