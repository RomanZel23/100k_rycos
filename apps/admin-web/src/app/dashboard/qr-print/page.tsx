import QRCode from 'qrcode'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { PrintButton } from '@/components/PrintButton'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'

interface Brand { id: number; name: string | null; qr_slug: string }
interface Location { id: number; name: string }
interface Terminal { id: number; terminal_id: string; name: string; status: string; location_id: number | null }

const ORDER_BASES: Record<string, string> = { product: 'https://100k.rycos.eu' }
const orderBase = (t?: string) => ORDER_BASES[t ?? ''] || process.env.NEXT_PUBLIC_ORDER_BASE_URL || 'https://100k.rycos.eu'

const BATCH_MAX = 100

function buildUrl(base: string, slug: string, opts: { location?: string; terminal?: string; table?: string }): string {
  const u = new URL(`${base.replace(/\/$/, '')}/${slug}`)
  if (opts.location) u.searchParams.set('location', opts.location)
  if (opts.terminal) u.searchParams.set('terminal_id', opts.terminal)
  if (opts.table) u.searchParams.set('table', opts.table)
  return u.toString()
}

export default async function QrPrintPage({ searchParams }: {
  searchParams: Promise<{ brand?: string; location?: string; terminal?: string; table?: string; mode?: string; from?: string; to?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const locale = await getAdminLocale()
  const sp = await searchParams
  const [brands, locations, terminals, company] = await Promise.all([
    adminApiData<Brand[]>('/brands'),
    adminApiData<Location[]>('/locations'),
    adminApiData<Terminal[]>('/terminals'),
    adminApiData<{ business_type: string }>('/companies'),
  ])
  const brandList = brands ?? []
  const activeTerminals = (terminals ?? []).filter((t) => t.status === 'active')
  const base = orderBase(company?.business_type)

  const brand = brandList.find((b) => String(b.id) === sp.brand) ?? brandList[0]
  const scope = { location: sp.location, terminal: sp.terminal }
  const locationName = sp.location ? ((locations ?? []).find((l) => String(l.id) === sp.location)?.name ?? sp.location) : null
  const terminalName = sp.terminal ? (activeTerminals.find((t) => t.terminal_id === sp.terminal)?.name ?? sp.terminal) : null

  const isBatch = sp.mode === 'batch'

  // Single QR.
  let qrDataUrl: string | null = null
  let url = ''
  if (brand && !isBatch) {
    url = buildUrl(base, brand.qr_slug, { ...scope, table: sp.table })
    qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1 })
  }

  // Batch QRs
  let batch: { table: number; dataUrl: string }[] = []
  let batchError: string | null = null
  if (brand && isBatch) {
    const from = parseInt(sp.from ?? '')
    const to = parseInt(sp.to ?? '')
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) {
      batchError = locale === 'pl' ? 'Podaj prawidłowy zakres — „od” ≥ 1 oraz „do” ≥ „od”.' : 'Enter a valid range — “from” ≥ 1 and “to” ≥ “from”.'
    } else if (to - from + 1 > BATCH_MAX) {
      batchError = locale === 'pl' ? `Maksymalnie ${BATCH_MAX} stolików na raz.` : `That’s more than ${BATCH_MAX} tables. Print in smaller batches.`
    } else {
      const tables = Array.from({ length: to - from + 1 }, (_, i) => from + i)
      batch = await Promise.all(
        tables.map(async (table) => ({
          table,
          dataUrl: await QRCode.toDataURL(buildUrl(base, brand.qr_slug, { ...scope, table: String(table) }), { width: 220, margin: 1 }),
        }))
      )
    }
  }

  const scopeLabel = (
    <>
      {locationName ? `${locale === 'pl' ? 'Lokalizacja' : 'Location'}: ${locationName}` : (locale === 'pl' ? 'Cała firma' : 'Whole company')}
      {terminalName ? ` · ${locale === 'pl' ? 'Terminal' : 'Terminal'}: ${terminalName}` : ''}
    </>
  )

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold print:hidden">{getTranslation(locale, 'qr.title', 'Drukowanie kodów QR')}</h1>
      <p className="mt-1 text-sm text-neutral-500 print:hidden">
        {getTranslation(locale, 'qr.intro', 'Generuj kody QR dla swoich marek, stolików lub całych sal. Kod QR prowadzi bezpośrednio do menu zamówień.')}
      </p>

      {brandList.length === 0 ? (
        <div className="card mt-6 text-sm text-neutral-500 print:hidden">
          {locale === 'pl' ? 'Najpierw utwórz markę, aby móc wydrukować jej kody QR.' : 'Create a brand first, then come back to print its QR codes.'}
        </div>
      ) : (
        <>
          <form method="get" className="card mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 print:hidden">
            <div>
              <label className="label" htmlFor="brand">{getTranslation(locale, 'qr.brand', 'Marka')}</label>
              <select id="brand" name="brand" defaultValue={String(brand?.id ?? '')} className="input">
                {brandList.map((b) => <option key={b.id} value={b.id}>{b.name || b.qr_slug}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="location">{getTranslation(locale, 'nav.locations', 'Lokalizacja')} ({locale === 'pl' ? 'opcjonalnie' : 'optional'})</label>
              <select id="location" name="location" defaultValue={sp.location ?? ''} className="input">
                <option value="">— {locale === 'pl' ? 'cała firma' : 'whole company'} —</option>
                {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="terminal">{getTranslation(locale, 'nav.terminals', 'Terminal')} ({locale === 'pl' ? 'opcjonalnie' : 'optional'})</label>
              <select id="terminal" name="terminal" defaultValue={sp.terminal ?? ''} className="input">
                <option value="">— {locale === 'pl' ? 'dowolny' : 'any'} —</option>
                {activeTerminals.map((t) => <option key={t.id} value={t.terminal_id}>{t.name}</option>)}
              </select>
            </div>

            {/* Single QR */}
            <div className="sm:col-span-2 mt-1 border-t border-neutral-100 pt-3">
              <p className="label">{getTranslation(locale, 'qr.single_heading', 'Pojedynczy kod QR')}</p>
            </div>
            <div>
              <label className="label" htmlFor="table">{getTranslation(locale, 'qr.table_number', 'Numer stolika (opcjonalnie)')}</label>
              <input id="table" name="table" defaultValue={sp.table ?? ''} placeholder="np. 12" className="input" />
            </div>
            <div className="flex items-end">
              <button name="mode" value="single" className="btn-brand sm:w-auto sm:px-6">
                {locale === 'pl' ? 'Generuj kod' : 'Generate'}
              </button>
            </div>

            {/* Batch */}
            <div className="sm:col-span-2 mt-1 border-t border-neutral-100 pt-3">
              <p className="label">{getTranslation(locale, 'qr.batch_heading', 'Druk seryjny dla stolików (A4)')}</p>
              <p className="-mt-0.5 text-xs text-neutral-400">
                {getTranslation(locale, 'qr.batch_hint', 'Wygeneruj zestaw kodów QR dla zakresu numerów stolików i wydrukuj je na arkuszach A4.')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="from">{getTranslation(locale, 'qr.range_from', 'Stolik od nr')}</label>
                <input id="from" name="from" type="number" min={1} defaultValue={sp.from ?? '1'} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="to">{getTranslation(locale, 'qr.range_to', 'Stolik do nr')}</label>
                <input id="to" name="to" type="number" min={1} defaultValue={sp.to ?? '20'} className="input" />
              </div>
            </div>
            <div className="flex items-end">
              <button name="mode" value="batch" className="btn-brand sm:w-auto sm:px-6">
                {locale === 'pl' ? 'Generuj serię (A4)' : 'Generate batch (A4)'}
              </button>
            </div>
          </form>

          {/* Single QR output */}
          {qrDataUrl && (
            <div className="card mt-4 flex flex-col items-center text-center print-area">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR code" className="h-64 w-64" />
              <p className="mt-3 text-lg font-bold">{brand?.name || brand?.qr_slug}</p>
              <p className="text-sm text-neutral-500">
                {scopeLabel}
                {sp.table ? ` · ${locale === 'pl' ? 'Stolik' : 'Table'} ${sp.table}` : ''}
              </p>
              <p className="mt-1 break-all text-[10px] text-neutral-300">{url}</p>
              <div className="mt-4">
                <PrintButton label={locale === 'pl' ? 'Wydrukuj ten kod QR' : 'Print this QR'} />
              </div>
            </div>
          )}

          {/* Batch output */}
          {isBatch && batchError && (
            <div className="card mt-4 text-sm text-red-600 print:hidden">{batchError}</div>
          )}
          {batch.length > 0 && (
            <div className="mt-4">
              <div className="card flex items-center justify-between print:hidden">
                <p className="text-sm text-neutral-600">
                  {batch.length} {locale === 'pl' ? 'stolików' : 'tables'} · {scopeLabel}
                </p>
                <PrintButton label={locale === 'pl' ? 'Drukuj wszystkie (A4)' : 'Print all (A4)'} />
              </div>
              <div className="print-area mt-4">
                <div className="qr-batch-grid">
                  {batch.map((q) => (
                    <div key={q.table} className="qr-batch-cell">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={q.dataUrl} alt={`QR table ${q.table}`} className="mx-auto h-36 w-36" />
                      <p className="mt-1 text-center text-base font-bold">{locale === 'pl' ? 'Stolik' : 'Table'} {q.table}</p>
                      <p className="text-center text-xs text-neutral-500">{brand?.name || brand?.qr_slug}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

