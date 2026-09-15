import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import { createTerminal, logoutTerminal } from './actions'

interface Terminal {
  id: number
  terminal_id: string
  name: string
  role?: string
  status: string
  location_id: number | null
  location_name: string | null
  assigned_brand_ids?: number[]
  assigned_brands?: Array<{ id: number; name: string; slug: string }>
  printer_device_id?: string | null
  tap_device_id?: string | null
  fiscal_device_id?: string | null
  capabilities?: {
    can_sell?: boolean
    can_kds?: boolean
    can_pickup?: boolean
    has_softpos?: boolean
    has_printer?: boolean
  }
  last_active: string | null
}

interface Location { id: number; name: string }

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : '—')

const statusBadge: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  unclaimed: 'bg-amber-50 text-amber-700 border-amber-200',
  inactive: 'bg-neutral-100 text-neutral-500 border-neutral-200',
  archived: 'bg-neutral-100 text-neutral-400 border-neutral-200',
}

const roleMeta: Record<string, { key: string; icon: string; bg: string; text: string }> = {
  all_in_one: { key: 'terminals.role.all_in_one', icon: '⚡', bg: 'bg-amber-50', text: 'text-amber-800' },
  pos: { key: 'terminals.role.pos', icon: '🖥️', bg: 'bg-blue-50', text: 'text-blue-800' },
  kds: { key: 'terminals.role.kds', icon: '🍳', bg: 'bg-orange-50', text: 'text-orange-800' },
  pickup: { key: 'terminals.role.pickup', icon: '📱', bg: 'bg-emerald-50', text: 'text-emerald-800' },
  kiosk: { key: 'terminals.role.kiosk', icon: '🛎️', bg: 'bg-purple-50', text: 'text-purple-800' },
  fiscal_hub: { key: 'terminals.role.fiscal_hub', icon: '🏢', bg: 'bg-slate-50', text: 'text-slate-800' },
}

export default async function TerminalsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  if (!isManager(await currentUser())) return <NoAccess />
  const locale = await getAdminLocale()
  const { error, notice } = await searchParams
  const [terminals, locations] = await Promise.all([
    adminApiData<Terminal[]>('/terminals'),
    adminApiData<Location[]>('/locations'),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            {getTranslation(locale, 'terminals.title', 'Stanowiska pracy & Terminale')}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {getTranslation(locale, 'terminals.subtitle', 'Zarządzaj profilami stanowisk: urządzenia All-in-One, kasy ladowe, kuchnia KDS, skanery wydań BYOD oraz integracja ze sprzętem SolutionsBay (SBR-*).')}
          </p>
        </div>
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {/* Terminal Workstations Table */}
      <div className="card overflow-hidden p-0 border border-neutral-200/80 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-neutral-50/80 border-b border-neutral-200 text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3">{getTranslation(locale, 'terminals.table.station', 'Stanowisko & ID')}</th>
                <th className="px-4 py-3">{getTranslation(locale, 'terminals.table.profile', 'Profil operacyjny')}</th>
                <th className="px-4 py-3">{getTranslation(locale, 'terminals.table.location', 'Lokalizacja')}</th>
                <th className="px-4 py-3">{getTranslation(locale, 'terminals.table.brands', 'Marki')}</th>
                <th className="px-4 py-3">{getTranslation(locale, 'terminals.table.hardware', 'Peryferia (Hardware)')}</th>
                <th className="px-4 py-3">{getTranslation(locale, 'terminals.table.status', 'Status')}</th>
                <th className="px-4 py-3 text-right">{getTranslation(locale, 'common.actions', 'Akcje')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {(terminals ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-neutral-400">
                    {getTranslation(locale, 'terminals.empty', 'Brak skonfigurowanych stanowisk. Utwórz pierwsze stanowisko poniżej.')}
                  </td>
                </tr>
              )}
              {(terminals ?? []).map((t) => {
                const meta = roleMeta[t.role || 'all_in_one'] || roleMeta.all_in_one
                const roleTitle = getTranslation(locale, meta.key, t.role || 'All-in-One')
                const isAllBrands = !t.assigned_brand_ids || t.assigned_brand_ids.length === 0
                const isSBR = t.terminal_id?.startsWith('SBR-')

                return (
                  <tr key={t.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <Link href={`/dashboard/terminals/${t.id}`} className="font-semibold text-neutral-900 hover:text-brand transition-colors">
                          {t.name}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`font-mono text-xs px-1.5 py-0.2 rounded ${isSBR ? 'bg-indigo-50 text-indigo-700 font-medium' : 'bg-neutral-100 text-neutral-600'}`}>
                            {t.terminal_id}
                          </span>
                          {t.status === 'unclaimed' && (
                            <span className="text-[11px] text-amber-600 font-medium">
                              ({locale === 'pl' ? 'kod parowania' : locale === 'de' ? 'Kopplung' : 'pairing'})
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.text}`}>
                        <span>{meta.icon}</span>
                        <span>{roleTitle}</span>
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-neutral-600 whitespace-nowrap">
                      {t.location_name ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          📍 {t.location_name}
                        </span>
                      ) : (
                        <span className="text-neutral-400 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      {isAllBrands ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 text-neutral-700">
                          {getTranslation(locale, 'terminals.all_brands', 'Wszystkie marki')}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {t.assigned_brands?.map((b) => (
                            <span key={b.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60">
                              {b.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span title={t.printer_device_id ? `Drukarka: ${t.printer_device_id}` : 'Brak drukarki'} className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${t.printer_device_id ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-neutral-300'}`}>
                          🖨️ {t.printer_device_id ? (t.printer_device_id === 'self' ? (locale === 'pl' ? 'Lokalna' : locale === 'de' ? 'Lokal' : 'Local') : t.printer_device_id) : '—'}
                        </span>
                        <span title={t.tap_device_id ? `SoftPOS: ${t.tap_device_id}` : 'Brak SoftPOS'} className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${t.tap_device_id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-neutral-300'}`}>
                          💳 {t.tap_device_id ? (t.tap_device_id === 'self' ? (locale === 'pl' ? 'Lokalny' : locale === 'de' ? 'Lokal' : 'Local') : t.tap_device_id) : '—'}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge[t.status] ?? 'bg-neutral-100 text-neutral-500 border-neutral-200'}`}>
                        {t.status === 'active' ? getTranslation(locale, 'status.active', 'Aktywny') : t.status === 'unclaimed' ? (locale === 'pl' ? 'Oczekuje' : locale === 'de' ? 'Ausstehend' : 'Unclaimed') : t.status}
                      </span>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        {t.status === 'unclaimed' ? (locale === 'pl' ? '— brak sesji —' : locale === 'de' ? '— keine Sitzung —' : '— no session —') : fmt(t.last_active)}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2.5">
                        {t.status !== 'unclaimed' && (
                          <form action={logoutTerminal}>
                            <input type="hidden" name="id" value={t.id} />
                            <button className="text-xs font-medium text-neutral-400 hover:text-red-600 transition-colors">
                              {locale === 'pl' ? 'Wyloguj' : locale === 'de' ? 'Abmelden' : 'Logout'}
                            </button>
                          </form>
                        )}
                        <Link
                          href={`/dashboard/terminals/${t.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-brand bg-brand/5 hover:bg-brand/10 rounded-md transition-colors"
                        >
                          {t.status === 'unclaimed' 
                            ? (locale === 'pl' ? 'Paruj / Konfiguruj' : locale === 'de' ? 'Koppeln / Konfig.' : 'Pair / Configure') 
                            : (locale === 'pl' ? 'Konfiguruj ⚙️' : locale === 'de' ? 'Konfigurieren ⚙️' : 'Configure ⚙️')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Add Workstation */}
      <div className="card bg-white border border-neutral-200/80 shadow-sm p-6">
        <h2 className="text-base font-bold text-neutral-900">{getTranslation(locale, 'terminals.new_title', 'Dodaj nowe stanowisko pracy (BYOD / POS)')}</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          {locale === 'pl'
            ? 'Wprowadź nazwę i profil operacyjny. System automatycznie wygeneruje unikalny wewnętrzny kod parowania oraz kod QR dla smartfona lub tabletu.'
            : locale === 'de'
            ? 'Geben Sie Name und Profil ein. Das System generiert automatisch Kopplungscode und QR-Code.'
            : 'Enter workstation name and role. The system will automatically generate a pairing code and QR.'}
        </p>

        <form action={createTerminal} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="label" htmlFor="name">{getTranslation(locale, 'terminals.name', 'Nazwa stanowiska')}</label>
              <input id="name" name="name" required placeholder={locale === 'pl' ? 'np. Kelner Bartek (A55), Kasa 1, Grill KDS' : 'e.g. Counter 1, Kitchen KDS'} className="input" />
            </div>

            <div className="sm:col-span-1">
              <label className="label" htmlFor="role">{getTranslation(locale, 'terminals.role', 'Profil operacyjny')}</label>
              <select id="role" name="role" defaultValue="all_in_one" className="input font-medium">
                <option value="all_in_one">⚡ {getTranslation(locale, 'terminals.role.all_in_one', 'All-in-One Foodtruck Master')}</option>
                <option value="pos">🖥️ {getTranslation(locale, 'terminals.role.pos', 'Kasa na Ladzie / Kelner (POS)')}</option>
                <option value="kds">🍳 {getTranslation(locale, 'terminals.role.kds', 'Kuchnia (KDS)')}</option>
                <option value="pickup">📱 {getTranslation(locale, 'terminals.role.pickup', 'Skaner Wydań (BYOD)')}</option>
                <option value="kiosk">🛎️ {getTranslation(locale, 'terminals.role.kiosk', 'Kiosk Samoobsługowy')}</option>
                <option value="fiscal_hub">🏢 {getTranslation(locale, 'terminals.role.fiscal_hub', 'Hub Fiskalny')}</option>
              </select>
            </div>

            <div className="sm:col-span-1">
              <label className="label" htmlFor="location_id">{getTranslation(locale, 'terminals.table.location', 'Lokalizacja / Foodtruck')}</label>
              <select id="location_id" name="location_id" className="input">
                <option value="">— {locale === 'pl' ? 'brak przypisania' : locale === 'de' ? 'keine Zuordnung' : 'unassigned'} —</option>
                {(locations ?? []).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-neutral-100">
            <button className="btn-brand">
              {locale === 'pl' ? 'Utwórz stanowisko & wygeneruj kod parowania ➔' : locale === 'de' ? 'Arbeitsplatz erstellen & Kopplungscode generieren ➔' : 'Create workstation & generate pairing code ➔'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

