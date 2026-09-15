import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { BrandMenuPicker, type PickerProduct } from '@/components/BrandMenuPicker'
import { BrandImageUploader } from '@/components/BrandImageUploader'
import { BrandColorPicker } from '@/components/BrandColorPicker'
import { Banner } from '@/components/Banner'
import { DeleteBrandButton } from '@/components/DeleteBrandButton'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import { updateBrand, assignProducts, deleteBrand } from '../actions'

interface Brand {
  id: number; name: string | null; qr_slug: string
  menu_layout: string; language: string; currency: string
  style: string | null
  is_active: boolean
  allow_pay_at_counter?: boolean
  product_ids: number[]; images: { header: string | null; logo: string | null; footer: string | null }
}

const LANGS = [
  { value: 'pl', label: 'Polski (pl)' },
  { value: 'en', label: 'English (en)' },
  { value: 'de', label: 'Deutsch (de)' },
  { value: 'fr', label: 'Français (fr)' },
  { value: 'ar', label: 'العربية (ar)' },
  { value: 'sv', label: 'Svenska (sv)' },
]

const CURRENCIES = [
  { value: 'PLN', label: 'PLN (zł)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'CHF', label: 'CHF' },
  { value: 'SAR', label: 'SAR' },
  { value: 'AED', label: 'AED' },
  { value: 'SEK', label: 'SEK' },
  { value: 'QAR', label: 'QAR' },
]
const ALL_LAYOUTS = ['boxed', 'list', 'circled', 'cards', 'scanner', 'lines', 'free', 'parking', 'freeCards', 'freeGrid']
const LAYOUTS_BY_TYPE: Record<string, string[]> = {
  product: ['list', 'boxed', 'circled'],
}
const LAYOUT_HELP =
  'How the customer ordering menu is arranged. list = simple rows; boxed = grid of boxed items with images; circled = round category chips.'

const ORDER_BASES: Record<string, string> = {
  product: 'https://100k.rycos.eu',
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
  const locale = await getAdminLocale()
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
  const layouts = LAYOUTS_BY_TYPE[company?.business_type ?? ''] ?? ALL_LAYOUTS
  const layoutOptions = layouts.includes(brand.menu_layout) ? layouts : [brand.menu_layout, ...layouts]
  const brandImages = brand.images ?? { header: null, logo: null, footer: null }
  const brandProductIds = Array.isArray(brand.product_ids) ? brand.product_ids : []

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard/brands" className="text-sm text-neutral-500 hover:text-brand">&larr; {getTranslation(locale, 'brands.title', 'Brands')}</Link>
        <h1 className="mt-2 text-2xl font-bold">{brand.name || `Brand ${brand.id}`}</h1>
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {/* QR */}
      <div className="card flex flex-wrap items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="QR code" className="h-44 w-44 rounded border border-neutral-200" />
        <div className="text-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-400">{locale === 'pl' ? 'Link do menu QR' : locale === 'de' ? 'QR-Bestelllink' : 'Ordering link'}</p>
          <p className="mt-1 break-all font-medium">{orderUrl}</p>
          <p className="mt-2 text-xs text-neutral-400">QR slug: {brandSlug}</p>
        </div>
      </div>

      {/* Details */}
      <form action={updateBrand} className="card space-y-3">
        <input type="hidden" name="id" value={brand.id} />
        <h2 className="text-base font-semibold">{getTranslation(locale, 'brands.edit_title', 'Brand details')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="name" label={getTranslation(locale, 'brands.table.brand', 'Brand name')} defaultValue={brand.name ?? ''} />
          <Field name="qr_slug" label={getTranslation(locale, 'brands.slug_label', 'QR Slug URL')} defaultValue={brandSlug} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="menu_layout">
              {getTranslation(locale, 'brands.table.layout', 'Menu layout')}{' '}
              <span title={LAYOUT_HELP} className="cursor-help text-neutral-400" aria-label={LAYOUT_HELP}>ⓘ</span>
            </label>
            <select id="menu_layout" name="menu_layout" defaultValue={brand.menu_layout} className="input">
              {layoutOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <Select name="language" label={getTranslation(locale, 'settings.default_language', 'Menu language')} options={LANGS} value={brand.language} />
          <Select name="currency" label={getTranslation(locale, 'settings.currency', 'Currency')} options={CURRENCIES} value={brand.currency} />
        </div>

        <div className="pt-3 border-t border-neutral-100 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_active"
              name="is_active"
              defaultChecked={brand.is_active !== false}
              className="h-4 w-4 rounded border-neutral-300 text-brand focus:ring-brand cursor-pointer"
            />
            <label htmlFor="is_active" className="text-sm font-semibold text-neutral-800 cursor-pointer">
              {locale === 'pl' ? 'Marka aktywna (klienci mogą składać zamówienia przez kod QR)' : locale === 'de' ? 'Marke aktiv (Kunden können per QR-Code bestellen)' : 'Brand active (customers can place orders via QR code)'}
            </label>
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="allow_pay_at_counter"
              name="allow_pay_at_counter"
              defaultChecked={Boolean((brand as any).allow_pay_at_counter ?? (brand as any).allowPayAtCounter)}
              className="h-4 w-4 rounded border-neutral-300 text-brand focus:ring-brand cursor-pointer mt-0.5"
            />
            <div>
              <label htmlFor="allow_pay_at_counter" className="text-sm font-semibold text-neutral-800 cursor-pointer block">
                {getTranslation(locale, 'brands.pay_at_counter', 'Allow pay at counter / bar')}
              </label>
              <p className="text-xs text-neutral-500">
                {locale === 'pl'
                  ? 'Gdy włączone, klienci w menu QR mogą wybrać opcję zapłaty gotówką lub kartą przy ladzie / u kelnera. Gdy wyłączone, wymagana jest natychmiastowa płatność online.'
                  : locale === 'de'
                  ? 'Wenn aktiviert, können Kunden die Zahlung an der Theke/beim Kellner wählen. Wenn deaktiviert, ist sofortige Online-Zahlung erforderlich.'
                  : 'When enabled, customers can choose to pay at the counter / bar. When disabled, immediate online payment is required.'}
              </p>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-neutral-100">
          <BrandColorPicker initialActiveColor={colors.active} initialBgColor={colors.bg} />
        </div>
        <div className="pt-2">
          <button className="btn-brand sm:w-auto sm:px-6">{getTranslation(locale, 'btn.save', 'Save')}</button>
        </div>
      </form>

      {/* Images */}
      <div className="card">
        <h2 className="text-base font-semibold">{locale === 'pl' ? 'Grafiki marki' : locale === 'de' ? 'Markengrafiken' : 'Brand images'}</h2>
        <p className="mt-1 text-xs text-neutral-500">{locale === 'pl' ? 'Zarządzaj grafikami nagłówka, logo oraz stopki dla tej marki.' : locale === 'de' ? 'Kopfzeilen-, Logo- und Fußzeilengrafiken verwalten.' : 'Manage header, logo and footer graphics for this brand.'}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <BrandImageUploader
            brandId={brand.id}
            type="header"
            label={getTranslation(locale, 'brands.banner_image', 'Header Banner')}
            aspectHint="16:9 / 3:1 (min. 1200x500 px)"
            currentUrl={brandImages.header}
          />
          <BrandImageUploader
            brandId={brand.id}
            type="logo"
            label={getTranslation(locale, 'brands.logo_image', 'Brand Logo')}
            aspectHint="1:1 (min. 500x500 px)"
            currentUrl={brandImages.logo}
          />
          <BrandImageUploader
            brandId={brand.id}
            type="footer"
            label={getTranslation(locale, 'brands.footer_image', 'Footer Graphic')}
            aspectHint="1200x300 px"
            currentUrl={brandImages.footer}
          />
        </div>
      </div>

      {/* Menu assignment */}
      <form action={assignProducts} className="card">
        <input type="hidden" name="id" value={brand.id} />
        <h2 className="text-base font-semibold">{locale === 'pl' ? 'Karta dań — produkty w tej marce' : locale === 'de' ? 'Speisekarte — Produkte dieser Marke' : 'Menu — products in this brand'}</h2>
        <p className="mb-3 mt-1 text-sm text-neutral-500">{locale === 'pl' ? 'Wybierz, które pozycje mają być widoczne dla klientów zamawiających z tej marki.' : locale === 'de' ? 'Wählen Sie die Produkte aus, die Kunden sehen können.' : 'Choose which products appear when customers order from this brand.'}</p>
        <BrandMenuPicker products={products ?? []} initial={brandProductIds} />
        <button className="btn-brand mt-3 sm:w-auto sm:px-6">{getTranslation(locale, 'btn.save', 'Save menu')}</button>
      </form>

      {/* Danger zone */}
      <div className="card border border-red-200 bg-red-50/40 p-5 rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-red-900">{locale === 'pl' ? 'Strefa niebezpieczna — usuwanie marki' : locale === 'de' ? 'Gefahrenbereich — Marke löschen' : 'Danger zone — delete brand'}</h3>
            <p className="text-xs text-red-700 mt-0.5">
              {locale === 'pl' ? 'Usunięcie marki spowoduje trwałe odpięcie jej kodu QR i menu.' : locale === 'de' ? 'Das Löschen der Marke entfernt den QR-Code und das Menü dauerhaft.' : 'Deleting a brand permanently removes its QR code and menu.'}
            </p>
          </div>
          <DeleteBrandButton
            action={deleteBrand}
            brandId={brand.id}
            brandName={brand.name}
            label={getTranslation(locale, 'btn.delete', 'Delete')}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shrink-0 shadow-sm"
          />
        </div>
      </div>
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
function Select({
  name,
  label,
  options,
  value,
}: {
  name: string
  label: string
  options: (string | { value: string; label: string })[]
  value?: string | null
}) {
  const normVal = String(value ?? '').trim().toLowerCase()
  const matched = options.find((o) => {
    const val = typeof o === 'string' ? o : o.value
    return val.toLowerCase() === normVal
  })
  const defaultValue = matched
    ? (typeof matched === 'string' ? matched : matched.value)
    : (typeof options[0] === 'string' ? options[0] : options[0]?.value)

  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={defaultValue} className="input">
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value
          const lbl = typeof o === 'string' ? o : o.label
          return <option key={val} value={val}>{lbl}</option>
        })}
      </select>
    </div>
  )
}

