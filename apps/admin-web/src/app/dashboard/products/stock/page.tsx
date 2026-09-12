import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { Banner } from '@/components/Banner'
import { saveStock } from './actions'
import { StockEditor } from './StockEditor'

interface Product {
  id: number
  name: string
  is_available: boolean
  stock_quantity: number | null
  image_url?: string | null
}

// Stock lives under /dashboard/products because day-to-day stock work happens
// in the POS / vendor app — this page is for occasional admin checks. Future
// stock-history charts / statistics will live alongside this one.
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const { error, notice } = await searchParams
  const products = (await adminApiData<Product[]>('/products')) ?? []
  const sorted = [...products].sort((a, b) => Number(a.is_available === false) - Number(b.is_available === false) || a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/products" className="text-sm text-neutral-500 hover:text-brand">&larr; Products</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stock</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Quick stock + availability per product. Day-to-day adjustments happen on the POS / vendor app — this view is for occasional admin checks.
          </p>
        </div>
        <div className="flex gap-4 text-sm font-semibold">
          <Link href="/dashboard/products/stock/insights" className="text-brand hover:underline">Insights</Link>
          <Link href="/dashboard/products/stock/history" className="text-brand hover:underline">History</Link>
        </div>
      </div>

      {error && <Banner kind="error" className="mt-4">{error}</Banner>}
      {notice && <Banner kind="success" className="mt-4">{notice}</Banner>}

      {sorted.length === 0 ? (
        <div className="card mt-6 text-sm text-neutral-500">No products yet.</div>
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
                  {p.stock_quantity == null ? 'Not tracked' : `${p.stock_quantity} in stock`}
                  {' · '}
                  {p.is_available ? <span className="text-green-700">available</span> : <span className="text-red-600">out of stock</span>}
                </p>
              </div>

              <form action={saveStock} className="flex shrink-0 flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="name" value={p.name} />
                <StockEditor productId={p.id} initialQty={p.stock_quantity} />
                <label className="flex cursor-pointer items-center gap-2 pb-3 text-xs font-medium text-neutral-700">
                  <input type="checkbox" name="is_available" defaultChecked={p.is_available} className="h-4 w-4 accent-brand" />
                  Available
                </label>
                <button className="btn-brand h-11 sm:w-auto sm:px-5">Save</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-neutral-400">
        Uncheck <strong>Track stock</strong> for unlimited items (services, made-to-order). When tracked, 0 + <strong>Available</strong> unchecked shows customers &quot;out of stock&quot;.
      </p>
    </div>
  )
}
