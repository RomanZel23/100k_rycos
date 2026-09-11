import QRCode from 'qrcode'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { PrintButton } from '@/components/PrintButton'

interface Brand { id: number; name: string | null; qr_slug: string }
interface Location { id: number; name: string }
interface Terminal { id: number; terminal_id: string; name: string; status: string; location_id: number | null }

const ORDER_BASES: Record<string, string> = { product: 'https://restaurants.yallaorder.ai' }
const orderBase = (t?: string) => ORDER_BASES[t ?? ''] || process.env.NEXT_PUBLIC_ORDER_BASE_URL || 'https://restaurants.yallaorder.ai'

// Cap on a single batch so one request can't generate thousands of QR codes.
const BATCH_MAX = 100

// Translation-ready copy. TODO: source from the shared app translation table when
// the panel gets i18n (master panel).
const T = {
  intro: 'Generate a QR code for a brand. Optionally tie it to a location and/or a specific terminal — this controls where the resulting orders appear.',
  whereHeading: 'Where orders go',
  ruleCompany: 'No location and no terminal → the order goes to all terminals in the company.',
  ruleLocation: 'A location but no terminal → the order goes to every terminal in that location (e.g. a whole floor).',
  ruleTerminal: 'A specific terminal → the order goes only to that terminal.',
  important: 'Choosing the right location/terminal matters: it decides which screen the customer’s order shows up on.',
  batchHeading: 'Batch print tables',
  batchHint: 'Generate one QR per table over a range and print them all on A4 in one go.',
}

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

  // Batch QRs (one per table over [from, to]).
  let batch: { table: number; dataUrl: string }[] = []
  let batchError: string | null = null
  if (brand && isBatch) {
    const from = parseInt(sp.from ?? '')
    const to = parseInt(sp.to ?? '')
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) {
      batchError = 'Enter a valid range — “from” ≥ 1 and “to” ≥ “from”.'
    } else if (to - from + 1 > BATCH_MAX) {
      batchError = `That’s more than ${BATCH_MAX} tables. Print in smaller batches.`
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
      {locationName ? `Location: ${locationName}` : 'Whole company'}
      {terminalName ? ` · Terminal: ${terminalName}` : ''}
    </>
  )

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold print:hidden">QR Print</h1>
      <p className="mt-1 text-sm text-neutral-500 print:hidden">{T.intro}</p>

      {brandList.length === 0 ? (
        <div className="card mt-6 text-sm text-neutral-500 print:hidden">Create a brand first, then come back to print its QR codes.</div>
      ) : (
        <>
          {/* Scope + mode form (GET — updates the query params). Two submit buttons
              share the brand/location/terminal scope: one prints a single QR for an
              optional table, the other prints a whole range on A4. */}
          <form method="get" className="card mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 print:hidden">
            <div>
              <label className="label" htmlFor="brand">Brand</label>
              <select id="brand" name="brand" defaultValue={String(brand?.id ?? '')} className="input">
                {brandList.map((b) => <option key={b.id} value={b.id}>{b.name || b.qr_slug}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="location">Location (optional)</label>
              <select id="location" name="location" defaultValue={sp.location ?? ''} className="input">
                <option value="">— whole company —</option>
                {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="terminal">Terminal (optional)</label>
              <select id="terminal" name="terminal" defaultValue={sp.terminal ?? ''} className="input">
                <option value="">— any in scope —</option>
                {activeTerminals.map((t) => <option key={t.id} value={t.terminal_id}>{t.name}</option>)}
              </select>
            </div>

            {/* Single QR */}
            <div className="sm:col-span-2 mt-1 border-t border-neutral-100 pt-3">
              <p className="label">Single QR</p>
            </div>
            <div>
              <label className="label" htmlFor="table">Table number (optional)</label>
              <input id="table" name="table" defaultValue={sp.table ?? ''} placeholder="e.g. 12" className="input" />
            </div>
            <div className="flex items-end">
              <button name="mode" value="single" className="btn-brand sm:w-auto sm:px-6">Generate</button>
            </div>

            {/* Batch */}
            <div className="sm:col-span-2 mt-1 border-t border-neutral-100 pt-3">
              <p className="label">{T.batchHeading}</p>
              <p className="-mt-0.5 text-xs text-neutral-400">{T.batchHint}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="from">From table</label>
                <input id="from" name="from" type="number" min={1} defaultValue={sp.from ?? '1'} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="to">To table</label>
                <input id="to" name="to" type="number" min={1} defaultValue={sp.to ?? '20'} className="input" />
              </div>
            </div>
            <div className="flex items-end">
              <button name="mode" value="batch" className="btn-brand sm:w-auto sm:px-6">Generate batch (A4)</button>
            </div>
          </form>

          {/* Routing explanation */}
          <div className="card mt-4 print:hidden">
            <p className="text-sm font-semibold">{T.whereHeading}</p>
            <ul className="mt-2 space-y-1 text-sm text-neutral-600">
              <li>• {T.ruleCompany}</li>
              <li>• {T.ruleLocation}</li>
              <li>• {T.ruleTerminal}</li>
            </ul>
            <p className="mt-2 text-xs text-neutral-400">{T.important}</p>
          </div>

          {/* Single QR output */}
          {qrDataUrl && (
            <div className="card mt-4 flex flex-col items-center text-center print-area">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR code" className="h-64 w-64" />
              <p className="mt-3 text-lg font-bold">{brand?.name || brand?.qr_slug}</p>
              <p className="text-sm text-neutral-500">
                {scopeLabel}
                {sp.table ? ` · Table ${sp.table}` : ''}
              </p>
              <p className="mt-1 break-all text-[10px] text-neutral-300">{url}</p>
              <div className="mt-4">
                <PrintButton label="Print this QR" />
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
                  {batch.length} table{batch.length === 1 ? '' : 's'} · {scopeLabel}
                </p>
                <PrintButton label="Print all (A4)" />
              </div>
              <div className="print-area mt-4">
                <div className="qr-batch-grid">
                  {batch.map((q) => (
                    <div key={q.table} className="qr-batch-cell">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={q.dataUrl} alt={`QR table ${q.table}`} className="mx-auto h-36 w-36" />
                      <p className="mt-1 text-center text-base font-bold">Table {q.table}</p>
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
