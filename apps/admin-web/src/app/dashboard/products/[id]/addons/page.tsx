import Link from 'next/link'
import { notFound } from 'next/navigation'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { saveProductAddons } from './actions'

interface AddonOption {
  id: number
  group_id: number
  name: string
  price_delta: string | number
  is_available: boolean
  stock_quantity: number | null
}
interface AddonGroup {
  id: number
  name: string
  selection_mode: 'single' | 'multi'
  required: boolean
  min_select: number
  max_select: number | null
  options: AddonOption[]
  assigned: boolean
  assignment_position: number | null
}
interface ProductAddons {
  product_id: number
  groups: AddonGroup[]
  price_overrides: Record<string, string | number>
}
interface Product { id: number; name: string }

const fmtDelta = (v: string | number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!Number.isFinite(n)) return '0.00'
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2)
}

export default async function ProductAddonsPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const { id } = await params
  const { error, notice } = await searchParams
  const [product, data] = await Promise.all([
    adminApiData<Product>(`/products/${id}`),
    adminApiData<ProductAddons>(`/products/${id}/addons`),
  ])
  if (!product) notFound()
  const groups = data?.groups ?? []
  const overrides = data?.price_overrides ?? {}

  // Sort assigned groups first (by assignment order), then everything else.
  const sorted = [...groups].sort((a, b) => {
    if (a.assigned !== b.assigned) return a.assigned ? -1 : 1
    if (a.assigned && b.assigned) return (a.assignment_position ?? 0) - (b.assignment_position ?? 0)
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/dashboard/products/${id}`} className="text-sm text-neutral-500 hover:text-brand">&larr; {product.name}</Link>
      <h1 className="mt-2 text-2xl font-bold">Add-ons for {product.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Pick which add-on groups apply to this product. For options whose price changes on this product (e.g. cheese costs more on a family pizza), enter an override; leave empty to use the group's default price.
      </p>

      {error && <Banner kind="error" className="mt-4">{error}</Banner>}
      {notice && <Banner kind="success" className="mt-4">{notice}</Banner>}

      {sorted.length === 0 ? (
        <div className="card mt-6">
          <p className="text-sm text-neutral-500">No add-on groups exist yet for your company.</p>
          <Link href="/dashboard/products/addons" className="mt-2 inline-block text-sm font-semibold text-brand hover:underline">Create add-on groups &rarr;</Link>
        </div>
      ) : (
        <form action={saveProductAddons} className="mt-6 space-y-4">
          <input type="hidden" name="id" value={product.id} />

          <ul className="space-y-3">
            {sorted.map((g) => (
              <li key={g.id} className="card p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" name="group" value={g.id} defaultChecked={g.assigned} className="mt-1 h-4 w-4 accent-brand" />
                  <span className="flex-1">
                    <span className="font-semibold">{g.name}</span>
                    <span className="ml-2 text-xs uppercase tracking-wide text-neutral-400">
                      {g.selection_mode === 'single' ? 'pick one' : 'pick any'}
                      {g.required ? ' · required' : ''}
                      {g.max_select != null ? ` · up to ${g.max_select}` : ''}
                    </span>
                  </span>
                </label>
                {g.options.length > 0 && (
                  <div className="mt-3 rounded-lg border border-neutral-100">
                    <div className="bg-neutral-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Options · per-product price override</div>
                    <ul className="divide-y divide-neutral-100">
                      {g.options.map((o) => {
                        const def = Number(o.price_delta)
                        const override = overrides[String(o.id)]
                        return (
                          <li key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <span className="flex-1">
                              <span className="font-medium">{o.name}</span>
                              <span className={`ml-2 font-mono text-xs ${def >= 0 ? 'text-neutral-500' : 'text-red-600'}`}>
                                default {fmtDelta(o.price_delta)}
                              </span>
                              {!o.is_available && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">out</span>}
                            </span>
                            <input
                              name={`override_${o.id}`}
                              type="number"
                              step="0.01"
                              defaultValue={override ?? ''}
                              placeholder={fmtDelta(o.price_delta)}
                              className="input w-24"
                              aria-label={`Override price for ${o.name}`}
                            />
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between pt-2">
            <Link href="/dashboard/products/addons" className="text-xs font-medium text-neutral-500 hover:underline">Manage add-on groups &rarr;</Link>
            <button className="btn-brand sm:w-auto sm:px-6">Save add-ons</button>
          </div>
        </form>
      )}
    </div>
  )
}
