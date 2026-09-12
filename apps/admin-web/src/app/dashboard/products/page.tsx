import Link from 'next/link'
import { adminApiData, adminApiPaginated } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { CategoryTags } from '@/components/CategoryTags'
import { Pager } from '@/components/Pager'
import { parsePageParams } from '@/lib/pagination'
import { createProduct, deleteProduct, toggleAvailability } from './actions'

interface Category { id: number; name: string }
interface Product {
  id: number
  name: string
  price: string | number
  category_id: number | null
  categories?: { id: number; name: string }[]
  is_available: boolean
  image_url: string | null
}

const fmtPrice = (p: string | number) => Number(p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; page?: string; per_page?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const sp = await searchParams
  const { page, perPage } = parsePageParams(sp)
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) })
  const [productsResp, categories] = await Promise.all([
    adminApiPaginated<Product>(`/products?${qs.toString()}`),
    adminApiData<Category[]>('/categories'),
  ])
  const products = productsResp.items
  const pagination = productsResp.pagination
  const cats = categories ?? []
  const catNames = cats.map((c) => c.name)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="mt-1 text-sm text-neutral-500">Your menu / catalog. Changes apply across the vendor app and ordering.</p>
        </div>
        <div className="flex gap-4 text-sm font-semibold">
          <Link href="/dashboard/products/addons" className="text-brand hover:underline">Add-ons</Link>
          <Link href="/dashboard/products/stock" className="text-brand hover:underline">Stock &rarr;</Link>
        </div>
      </div>
      {sp.error && <Banner kind="error" className="mt-4">{sp.error}</Banner>}

      {/* Product list */}
      <div className="card mt-6 overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-center">Available</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {products.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">No products yet.</td></tr>
            )}
            {products.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {p.image_url
                      ? <img src={p.image_url} alt="" crossOrigin="anonymous" className="h-9 w-9 rounded object-cover" />
                      : <div className="h-9 w-9 rounded bg-neutral-100" />}
                    <Link href={`/dashboard/products/${p.id}`} className="font-medium hover:text-brand">{p.name}</Link>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {p.categories && p.categories.length
                    ? <span className="flex flex-wrap gap-1">{p.categories.map((c) => <span key={c.id} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">#{c.name}</span>)}</span>
                    : (p as any).category_name || (p as any).categoryName
                      ? <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">#{(p as any).category_name || (p as any).categoryName}</span>
                      : <span className="text-neutral-400">—</span>}
                </td>
                <td className="px-4 py-3 text-right">{fmtPrice(p.price)}</td>
                <td className="px-4 py-3 text-center">
                  <form action={toggleAvailability} className="inline">
                    <input type="hidden" name="id" value={p.id} />
                    <button className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.is_available ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
                      {p.is_available ? 'Available' : 'Hidden'}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link href={`/dashboard/products/${p.id}`} className="text-xs font-medium text-brand hover:underline">Edit</Link>
                    <form action={deleteProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager pagination={pagination} perPage={perPage} />

      <div className="mt-6">
        {/* New product */}
        <div className="card">
          <h2 className="text-base font-semibold">New product</h2>
          <form action={createProduct} className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" name="name" required className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="price">Price</label>
                <input id="price" name="price" type="number" step="0.01" required className="input" />
              </div>
              <div>
                <label className="label">Tax %</label>
                <input name="tax" type="number" className="input" />
              </div>
            </div>
            <div>
              <label className="label">Categories</label>
              <CategoryTags suggestions={catNames} />
            </div>
            <div>
              <label className="label" htmlFor="description">Description</label>
              <textarea id="description" name="description" rows={2} className="input" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Prep time (min)</label>
                <input name="prep_time" type="number" className="input" />
              </div>
              <div>
                <label className="label">Barcode</label>
                <input name="barcode" className="input" />
              </div>
              <div>
                <label className="label">SKU</label>
                <input name="sku" className="input" />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="is_available" defaultChecked /> Available</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="is_age_restricted" /> 18+ (age-restricted)</label>
            </div>
            <p className="text-xs text-neutral-400">You can upload an image after creating the product.</p>
            <button className="btn-brand sm:w-auto sm:px-6">Add product</button>
          </form>
        </div>
      </div>
    </div>
  )
}
