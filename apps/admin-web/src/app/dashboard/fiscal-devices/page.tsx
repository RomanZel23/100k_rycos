import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import { addFiscalDevice, deleteFiscalDevice, toggleFiscalDevice, saveTerminals, setPrimary } from './actions'
import { RycosSection } from './RycosSection'

interface TerminalRef {
  id: number
  name: string
  terminal_id: string
}
interface FiscalDevice {
  id: number
  name: string
  device_id: string
  status: string
  is_primary: boolean
  terminals: TerminalRef[]
  source: 'manual' | 'rycos'
  kind: 'device' | 'hub'
  tier: string | null
  online: boolean | null
  aplikasa_installed: boolean | null
  last_seen_at: string | null
  license_expires_at: string | null
}

export default async function FiscalDevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; pin?: string; pin_expires?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const locale = await getAdminLocale()
  const sp = await searchParams
  const rawData: any = await adminApiData('/fiscal-devices')
  const rawDevices = Array.isArray(rawData) ? rawData : (rawData?.devices ?? [])
  const rawUnassigned = Array.isArray(rawData?.unassigned) ? rawData.unassigned : []

  const devices: FiscalDevice[] = (rawDevices || []).map((d: any) => ({
    id: d.id,
    name: d.name || '',
    device_id: d.device_id || d.deviceId || '',
    status: d.status || 'active',
    is_primary: Boolean(d.is_primary ?? d.isPrimary),
    terminals: (Array.isArray(d.terminals) ? d.terminals : []).map((t: any) => ({
      id: t.id,
      name: t.name,
      terminal_id: t.terminal_id || t.terminalId || '',
    })),
    source: d.source || 'manual',
    kind: d.kind || 'device',
    tier: d.tier ?? null,
    online: d.online ?? d.is_online ?? d.isOnline ?? null,
    aplikasa_installed: d.aplikasa_installed ?? null,
    last_seen_at: d.last_seen_at || d.lastSeenAt || null,
    license_expires_at: d.license_expires_at || null,
  }))

  const unassigned: TerminalRef[] = (rawUnassigned || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    terminal_id: t.terminal_id || t.terminalId || '',
  }))

  const hasPrimary = devices.some((d) => d.is_primary)

  const allTerminals: TerminalRef[] = [
    ...devices.flatMap((d) => d.terminals || []),
    ...unassigned,
  ]
    .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">{getTranslation(locale, 'fiscal.title', 'Urządzenia fiskalne')}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {getTranslation(locale, 'fiscal.subtitle', 'Każde urządzenie fiskalne obsługuje fiskalizację dla przypisanych terminali. Główne urządzenie fiskalizuje zamówienia bez dedykowanego przypisania.')}
      </p>

      {sp.error && <Banner kind="error">{sp.error}</Banner>}
      {sp.notice && <Banner kind="success">{sp.notice}</Banner>}

      {devices.length > 0 && !hasPrimary && (
        <div className="card mt-6 border-red-300 bg-red-50">
          <p className="text-sm font-semibold text-red-900">
            {getTranslation(locale, 'fiscal.warn_no_primary', 'Brak głównego urządzenia fiskalizującego')}
          </p>
          <p className="mt-1 text-xs text-red-800">
            {locale === 'pl'
              ? 'Zamówienia z terminali bez dedykowanego urządzenia nie mają celu fiskalizacji. Wybierz jedno urządzenie poniżej jako główne.'
              : locale === 'de'
              ? 'Bestellungen von Terminals ohne eigenes Fiskalgerät haben kein Ziel. Wählen Sie unten ein Gerät als primär.'
              : 'Orders routed to terminals without their own fiscal device have nowhere to fiscalize. Pick one device below as primary.'}
          </p>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="card mt-6 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">
            {unassigned.length} {locale === 'pl' ? 'terminali nieprzypisanych do urządzenia fiskalnego' : locale === 'de' ? 'nicht zugewiesene Terminals' : 'unassigned terminals'}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {locale === 'pl'
              ? 'Będą one korzystać z głównego urządzenia fiskalizującego.'
              : locale === 'de'
              ? 'Diese nutzen das primäre Fiskalgerät für Bestellungen.'
              : 'These will use the primary fiscalizer when an order is routed to them.'}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {unassigned.map((t) => (
              <li key={t.id} className="rounded-full bg-white px-2.5 py-1 font-medium text-amber-900 ring-1 ring-amber-200">
                {t.name} <span className="font-mono text-amber-600">· {t.terminal_id}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-6 space-y-4">
        {devices.length === 0 && (
          <li className="card text-sm text-neutral-500">
            {locale === 'pl' ? 'Brak urządzeń fiskalnych — dodaj pierwsze poniżej.' : locale === 'de' ? 'Noch keine Fiskalgeräte vorhanden.' : 'No fiscal devices yet — create one below.'}
          </li>
        )}
        {devices.map((d) => (
          <li key={d.id} className={`card ${d.is_primary ? 'border-blue-200 ring-2 ring-blue-100' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold">{d.name}</span>
                <span className="font-mono text-xs text-neutral-500">{d.device_id}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
                  {d.status === 'active' ? getTranslation(locale, 'status.active', 'Aktywny') : d.status}
                </span>
                {d.kind === 'hub' && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    HUB
                  </span>
                )}
                {d.source === 'rycos' && d.online != null && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${d.online ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {d.online ? 'online' : 'offline'}
                  </span>
                )}
                {d.source === 'rycos' && d.kind === 'device' && d.aplikasa_installed === false && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    {locale === 'pl' ? 'Brak Aplikasa' : 'Aplikasa missing'}
                  </span>
                )}
                {d.license_expires_at && (() => {
                  const days = Math.ceil((new Date(d.license_expires_at.replace(' ', 'T') + 'Z').getTime() - Date.now()) / 86_400_000)
                  return (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${days <= 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                      {days <= 0 ? (locale === 'pl' ? 'licencja wygasła' : 'licence expired') : (locale === 'pl' ? `licencja: ${days} dni` : `licence: ${days}d`)}
                    </span>
                  )
                })()}
                {d.is_primary && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                    {getTranslation(locale, 'fiscal.primary_badge', 'PRIMARY FISCALIZER')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {!d.is_primary && (
                  <form action={setPrimary}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="text-xs font-semibold text-blue-700 hover:underline">
                      {getTranslation(locale, 'fiscal.set_primary', 'Ustaw jako główne')}
                    </button>
                  </form>
                )}
                <form action={toggleFiscalDevice}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="status" value={d.status} />
                  <button className="text-xs font-medium text-neutral-500 hover:underline">
                    {d.status === 'active' ? (locale === 'pl' ? 'Deaktywuj' : locale === 'de' ? 'Deaktivieren' : 'Deactivate') : (locale === 'pl' ? 'Aktywuj' : locale === 'de' ? 'Aktivieren' : 'Activate')}
                  </button>
                </form>
                <form action={deleteFiscalDevice}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="text-xs font-medium text-red-600 hover:underline">
                    {getTranslation(locale, 'btn.delete', 'Usuń')}
                  </button>
                </form>
              </div>
            </div>

            <form action={saveTerminals} className="mt-4 rounded-lg border border-neutral-100 p-3">
              <input type="hidden" name="id" value={d.id} />
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                {getTranslation(locale, 'fiscal.assigned_terminals', 'Terminale przypisane do tego urządzenia')}
              </p>
              {allTerminals.length === 0 ? (
                <p className="mt-2 text-xs text-neutral-400">
                  {locale === 'pl' ? 'Brak terminali. ' : 'No active terminals. '}
                  <Link href="/dashboard/terminals" className="text-brand hover:underline">
                    {getTranslation(locale, 'nav.terminals', 'Terminale')}
                  </Link>.
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {allTerminals.map((t) => {
                    const checked = d.terminals.some((x) => x.id === t.id)
                    const alsoOnCount = devices.filter((other) => other.id !== d.id && other.terminals.some((x) => x.id === t.id)).length
                    return (
                      <label key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-neutral-50">
                        <input
                          type="checkbox"
                          name="terminal_ids"
                          value={t.id}
                          defaultChecked={checked}
                          className="h-4 w-4 accent-brand"
                        />
                        <span className="font-medium">{t.name}</span>
                        <span className="font-mono text-xs text-neutral-400">{t.terminal_id}</span>
                        {alsoOnCount > 0 && (
                          <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                            +{alsoOnCount}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
              <div className="mt-3 text-right">
                <button className="btn-brand text-xs">
                  {getTranslation(locale, 'btn.save', 'Zapisz przypisania')}
                </button>
              </div>
            </form>
          </li>
        ))}
      </ul>

      <form action={addFiscalDevice} className="card mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {locale === 'pl' ? 'Dodaj urządzenie ręcznie' : locale === 'de' ? 'Gerät manuell hinzufügen' : 'Add a device manually'}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {locale === 'pl'
              ? 'Dla urządzeń ze znanym identyfikatorem (np. SBR-XXXXXX).'
              : 'Only for a device you already know the id of.'}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="name">{getTranslation(locale, 'fiscal.device_name', 'Nazwa')}</label>
          <input id="name" name="name" required placeholder="np. Kasa Fiskalna 1" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="device_id">{getTranslation(locale, 'fiscal.device_id', 'Device ID')}</label>
          <input id="device_id" name="device_id" required placeholder="SBR-A0S0UH" className="input font-mono" />
        </div>
        <div className="flex items-end">
          <button className="btn-brand">{getTranslation(locale, 'btn.save', 'Zapisz')}</button>
        </div>
      </form>

      <RycosSection pin={sp.pin} pinExpires={sp.pin_expires} locale={locale} />
    </div>
  )
}

