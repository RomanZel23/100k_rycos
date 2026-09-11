import Link from 'next/link'
import { notFound } from 'next/navigation'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { CategoryTags } from '@/components/CategoryTags'
import { ProductTranslationsTabs } from '@/components/ProductTranslationsTabs'
import { updateProduct, uploadImage, deleteProduct } from '../actions'

interface Category { id: number; name: string }
interface Product {
  id: number
  name: string
  description: string | null
  price: string | number
  category_id: number | null
  categories?: { id: number; name: string }[]
  tax: number | null
  prep_time: number | null
  has_addons: boolean
  is_delivered: boolean
  is_available: boolean
  is_age_restricted: boolean
  barcode: string | null
  sku: string | null
  image_url: string | null
  // Returned by admin-api as { lang: { attr: value } }.
  translations?: Record<string, Record<string, string>>
}
interface CompanyLang { language_code: string }
interface Company { default_language: string }

export default async function EditProductPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const { id } = await params
  const { error, notice } = await searchParams
  const [product, categories, companyLangs, company] = await Promise.all([
    adminApiData<Product>(`/products/${id}`),
    adminApiData<Category[]>('/categories'),
    adminApiData<CompanyLang[]>('/companies/languages'),
    adminApiData<Company>('/companies'),
  ])
  if (!product) notFound()
  const cats = categories ?? []

  // Enabled languages come from /companies/languages (Settings → Languages),
  // minus the default itself (its name/description live in the main form
  // fields). One source of truth, set by the owner.
  const defaultLang = company?.default_language ?? 'en'
  const enabledLanguages = (companyLangs ?? [])
    .map((r) => r.language_code)
    .filter((l) => l && l !== defaultLang)
  const initialTranslations = product.translations ?? {}

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/products" className="text-sm text-neutral-500 hover:text-brand">&larr; Products</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <Link href={`/dashboard/products/${product.id}/addons`} className="text-sm font-semibold text-brand hover:underline">Add-ons &rarr;</Link>
      </div>
      {error && <Banner kind="error" className="mt-4">{error}</Banner>}
      {notice && <Banner kind="success" className="mt-4">{notice}</Banner>}

      {/* Image */}
      <div className="card mt-6">
        <h2 className="text-base font-semibold">Image</h2>
        <div className="mt-3 flex items-center gap-4">
          {product.image_url
            ? <img src={product.image_url} alt="" className="h-20 w-20 rounded object-cover" />
            : <div className="flex h-20 w-20 items-center justify-center rounded bg-neutral-100 text-xs text-neutral-400">none</div>}
          <form action={uploadImage} className="flex items-center gap-2">
            <input type="hidden" name="id" value={product.id} />
            <input type="file" name="image" accept="image/*" required className="text-sm" />
            <button className="btn-brand sm:w-auto sm:px-4">Upload</button>
          </form>
        </div>
      </div>

      {/* Fields */}
      <form action={updateProduct} className="card mt-6 space-y-3">
        <input type="hidden" name="id" value={product.id} />
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" required defaultValue={product.name} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="price">Price</label>
            <input id="price" name="price" type="number" step="0.01" required defaultValue={Number(product.price)} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="tax">Tax %</label>
            <input id="tax" name="tax" type="number" defaultValue={product.tax ?? ''} className="input" />
          </div>
        </div>
        <div>
          <label className="label">Categories</label>
          <CategoryTags suggestions={cats.map((c) => c.name)} initial={(product.categories ?? []).map((c) => c.name)} />
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={3} defaultValue={product.description ?? ''} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="prep_time">Prep time (min)</label>
          <input id="prep_time" name="prep_time" type="number" defaultValue={product.prep_time ?? ''} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="barcode">Barcode</label>
            <input id="barcode" name="barcode" defaultValue={product.barcode ?? ''} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="sku">SKU</label>
            <input id="sku" name="sku" defaultValue={product.sku ?? ''} className="input" />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 pt-1 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="is_available" defaultChecked={product.is_available} /> Available</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="is_age_restricted" defaultChecked={product.is_age_restricted} /> 18+ (age-restricted)</label>
        </div>
        {/* Translations — one tab per enabled (non-default) language. Empty
            fields fall back to the default-language name/description above.
            Enabled set is managed in Settings → Languages. */}
        {enabledLanguages.length > 0 && (
          <div className="border-t border-neutral-100 pt-4">
            <h2 className="text-base font-semibold">Translations</h2>
            <p className="-mt-0.5 mb-2 text-xs text-neutral-500">
              Default language is <strong>{defaultLang.toUpperCase()}</strong> (the fields above). Manage which other languages appear here in{' '}
              <Link href="/dashboard/settings" className="font-medium text-brand hover:underline">Settings → Languages</Link>.
            </p>
            <ProductTranslationsTabs languages={enabledLanguages} initial={initialTranslations} />
          </div>
        )}

        <div className="pt-2">
          <button className="btn-brand sm:w-auto sm:px-6">Save changes</button>
        </div>
      </form>

      <form action={deleteProduct} className="mt-4 text-right">
        <input type="hidden" name="id" value={product.id} />
        <button className="text-sm font-medium text-red-600 hover:underline">Delete product</button>
      </form>
    </div>
  )
}
