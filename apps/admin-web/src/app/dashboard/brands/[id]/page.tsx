import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { BrandMenuPicker, type PickerProduct } from '@/components/BrandMenuPicker'
import { BrandImageUploader } from '@/components/BrandImageUploader'
import { Banner } from '@/components/Banner'
import { updateBrand, assignProducts, deleteBrand } from '../actions'

interface Brand {
  id: number; name: string | null; qr_slug: string
  menu_layout: string; language: string; currency: string
  style: string | null
  product_ids: number[]; images: { header: string | null; logo: string | null; footer: string | null }
}

const LANGS = ['en', 'pl', 'ar', 'fr', 'de', 'sv']
const CURRENCIES = ['usd', 'eur', 'pln', 'sar', 'aed', 'sek', 'qar']
const ALL_LAYOUTS = ['boxed', 'list', 'circled', 'cards', 'scanner', 'lines', 'free', 'parking', 'freeCards', 'freeGrid']
// Allowed menu layouts per business type (TODO: move to a business_type_defaults
// table once onboarding uses it). Unlisted types fall back to all layouts.
const LAYOUTS_BY_TYPE: Record<string, string[]> = {
  product: ['list', 'boxed', 'circled'], // F&B / restaurants
}
const LAYOUT_HELP =
  'How the customer ordering menu is arranged. list = simple rows; boxed = grid of boxed items with images; circled = round category chips. Pick what fits your menu.'

// Customer ordering domain by company business type (extend as new verticals launch).
const ORDER_BASES: Record<string, string> = {
  product: 'https://100k.rycos.eu', // restaurants / F&B / retail
}
const orderBase = (businessType?: string) =>
  ORDER_BASES[businessType ?? ''] || process.env.NEXT_PUBLIC_ORDER_BASE_URL || 'https://100k.rycos.eu'

function parseColors(style: string | null): { active: string; bg: string } {
  try {
    const arr = style ? JSON.parse(style) : null
    const s = Array.isArray(arr) ? arr[0] : arr
    return { active: s?.active_button_color ?? '0xFFFF8800', bg: s?.background_button_color ?? 'black' }
  } catch { return { active: '0xFFFF8800', bg: 'black' } }
}

export default async function EditBrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const { id } = await params
  const { error, notice } = await searchParams
  const [brand, products, company] = await Promise.all([
    adminApiData<Brand>(`/brands/${id}`),
    adminApiData<PickerProduct[]>('/products'),
    adminApiData<{ business_type: string }>('/companies'),
  ])
  if (!brand) notFound()
  const colors = parseColors(brand.style)
  const brandSlug = brand.qr_slug || (brand as any).slug || `brand-${id}`
  const orderUrl = `${orderBase(company?.business_type).replace(/\/$/, '')}/${brandSlug}`
  const qrDataUrl = await QRCode.toDataURL(orderUrl, { width: 180, margin: 1 })
  // Limit layouts to the company's vertical; always include the current value.
  const layouts = LAYOUTS_BY_TYPE[company?.business_type ?? ''] ?? ALL_LAYOUTS
  const layoutOptions = layouts.includes(brand.menu_layout) ? layouts : [brand.menu_layout, ...layouts]
  const brandImages = brand.images ?? { header: null, logo: null, footer: null }
  const brandProductIds = Array.isArray(brand.product_ids) ? brand.product_ids : []

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard/brands" className="text-sm text-neutral-500 hover:text-brand">&larr; Brands</Link>
        <h1 className="mt-2 text-2xl font-bold">{brand.name || `Brand ${brand.id}`}</h1>
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {/* QR */}
      <div className="card flex flex-wrap items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="QR code" className="h-44 w-44 rounded border border-neutral-200" />
        <div className="text-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Ordering link</p>
          <p className="mt-1 break-all font-medium">{orderUrl}</p>
          <p className="mt-2 text-xs text-neutral-400">QR slug: {brandSlug}</p>
        </div>
      </div>

      {/* Details */}
      <form action={updateBrand} className="card space-y-3">
        <input type="hidden" name="id" value={brand.id} />
        <h2 className="text-base font-semibold">Szczegóły marki (Details)</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="name" label="Nazwa marki" defaultValue={brand.name ?? ''} />
          <Field name="qr_slug" label="Krótki QR Slug (np. g2d6a)" defaultValue={brandSlug} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="menu_layout">
              Układ menu (Layout){' '}
              <span title={LAYOUT_HELP} className="cursor-help text-neutral-400" aria-label={LAYOUT_HELP}>ⓘ</span>
            </label>
            <select id="menu_layout" name="menu_layout" defaultValue={brand.menu_layout} className="input">
              {layoutOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <Select name="language" label="Język menu" options={LANGS} value={brand.language} />
          <Select name="currency" label="Waluta" options={CURRENCIES} value={brand.currency} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="active_button_color" label="Kolor przycisków (0xAARRGGBB lub nazwa)" defaultValue={colors.active} />
          <Field name="background_button_color" label="Kolor tła" defaultValue={colors.bg} />
        </div>
        <button className="btn-brand sm:w-auto sm:px-6">Zapisz szczegóły</button>
      </form>

      {/* Images (Supabase Storage) */}
      <div className="card">
        <h2 className="text-base font-semibold">Grafiki marki (Supabase Storage)</h2>
        <p className="mt-1 text-xs text-neutral-500">Zarządzaj grafikami nagłówka, logo oraz stopki dla tej marki.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <BrandImageUploader
            brandId={brand.id}
            type="header"
            label="Header / Baner"
            aspectHint="Poziomy baner na górze menu (np. 16:9 lub 3:1, min. 1200x500 px)"
            currentUrl={brandImages.header}
          />
          <BrandImageUploader
            brandId={brand.id}
            type="logo"
            label="Logo"
            aspectHint="Kwadratowe logo marki (1:1, np. 500x500 px)"
            currentUrl={brandImages.logo}
          />
          <BrandImageUploader
            brandId={brand.id}
            type="footer"
            label="Stopka (Footer)"
            aspectHint="Pozioma grafika na dole menu (np. sponsorzy, 1200x300 px)"
            currentUrl={brandImages.footer}
          />
        </div>
      </div>

      {/* Menu assignment */}
      <form action={assignProducts} className="card">
        <input type="hidden" name="id" value={brand.id} />
        <h2 className="text-base font-semibold">Menu — products in this brand</h2>
        <p className="mb-3 mt-1 text-sm text-neutral-500">Choose which products appear when customers order from this brand.</p>
        <BrandMenuPicker products={products ?? []} initial={brandProductIds} />
        <button className="btn-brand mt-3 sm:w-auto sm:px-6">Save menu</button>
      </form>

      <form action={deleteBrand} className="text-right">
        <input type="hidden" name="id" value={brand.id} />
        <button className="text-sm font-medium text-red-600 hover:underline">Delete brand</button>
      </form>
    </div>
  )
}

function Field({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={defaultValue ?? ''} className="input" />
    </div>
  )
}
function Select({ name, label, options, value }: { name: string; label: string; options: string[]; value: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={value} className="input">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
