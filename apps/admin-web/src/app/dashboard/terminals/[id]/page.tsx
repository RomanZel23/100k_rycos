import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import { updateTerminal, deleteTerminal, archiveTerminal, logoutTerminal } from '../actions'

import { CopyLinkButton } from './CopyLinkButton'
import { TerminalRoleConfigurator } from './TerminalRoleConfigurator'

interface Terminal {
  id: number
  terminal_id: string
  name: string
  role?: string
  status: string
  location_id: number | null
  location_name: string | null
  assigned_brand_ids?: number[]
  printer_device_id: string | null
  tap_device_id: string | null
  fiscal_device_id: string | null
  capabilities?: {
    can_sell?: boolean
    can_kds?: boolean
    can_pickup?: boolean
    has_softpos?: boolean
    has_printer?: boolean
  }
  config_json?: Record<string, any>
  last_active: string | null
}

interface Location { id: number; name: string }
interface Brand { id: number; name: string; slug: string; location_id?: number | null }
interface OptionsData {
  roles: Array<{ id: string; title: string; desc: string; icon: string }>
  fiscal_devices: Array<{ id: number; device_id: string; name: string; status: string }>
  terminals: Array<{ id: number; terminal_id: string; name: string }>
}

export default async function TerminalEditPage({
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

  const [terminalRes, locationsRes, brandsRes, optionsRes] = await Promise.all([
    adminApiData<Terminal>(`/terminals/${id}`),
    adminApiData<Location[]>('/locations'),
    adminApiData<Brand[]>('/brands'),
    adminApiData<OptionsData>('/terminals/options'),
  ])

  if (!terminalRes) notFound()
  const terminal = terminalRes
  const locations = locationsRes ?? []
  const allBrands = brandsRes ?? []
  const options = optionsRes ?? { roles: [], fiscal_devices: [], terminals: [] }

  const editable = terminal.status === 'active' || terminal.status === 'unclaimed'

  const appBase = process.env.NEXT_PUBLIC_ORDER_BASE_URL || 'https://100k.rycos.eu'
  const pairUrl = `${appBase}/pair?code=${terminal.terminal_id}`
  const qr = await QRCode.toDataURL(pairUrl, { width: 220, margin: 1 })

  const currentRole = terminal.role || 'all_in_one'
  const currentBrandIds = terminal.assigned_brand_ids ?? []
  const isAllBrands = currentBrandIds.length === 0

  const caps = terminal.capabilities ?? {
    can_sell: true,
    can_kds: true,
    can_pickup: true,
    has_softpos: true,
    has_printer: true,
  }

  // Filter hardware candidates: SBR devices and registered fiscal devices
  const sbrDevices = options.terminals.filter((t) => t.terminal_id?.startsWith('SBR-') && t.terminal_id !== terminal.terminal_id)
  const isCurrentSbr = terminal.terminal_id?.startsWith('SBR-')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Link href="/dashboard/terminals" className="text-xs font-semibold text-neutral-500 hover:text-brand transition-colors inline-flex items-center gap-1">
            &larr; {locale === 'pl' ? 'Wróć do listy stanowisk' : locale === 'de' ? 'Zurück zur Arbeitsplatzliste' : 'Back to workstations'}
          </Link>
          <div className="flex items-center gap-3 mt-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{terminal.name}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              terminal.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {terminal.status === 'active' 
                ? (locale === 'pl' ? '● Aktywny' : locale === 'de' ? '● Aktiv' : '● Active')
                : (locale === 'pl' ? '⏳ Oczekuje na sparowanie' : locale === 'de' ? '⏳ Warten auf Kopplung' : '⏳ Awaiting pairing')}
            </span>
          </div>
        </div>

        {/* Quick Launch / View in Action */}
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/terminals`}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors"
          >
            {locale === 'pl' ? 'Lista stanowisk' : locale === 'de' ? 'Arbeitsplatzliste' : 'Workstation list'}
          </Link>
        </div>
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {/* Setup & Pairing Banner */}
      <div className="card bg-gradient-to-r from-neutral-900 to-neutral-800 text-white p-5 border-0 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-white/10 text-amber-300 font-mono text-xs font-semibold uppercase tracking-wider">
                {locale === 'pl' ? 'Wewnętrzny Kod Stanowiska (BYOD / POS)' : locale === 'de' ? 'Interner Arbeitsplatzcode (BYOD / POS)' : 'Internal Workstation Code (BYOD / POS)'}
              </span>
              {isCurrentSbr && (
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-xs font-semibold">
                  SolutionsBay SBR
                </span>
              )}
            </div>
            <p className="font-mono text-3xl font-black tracking-widest text-white">{terminal.terminal_id}</p>
            <p className="text-xs text-neutral-300 max-w-md">
              {locale === 'pl' 
                ? 'Zeskanuj ten kod smartfonem pracownika (BYOD) lub wyślij mu bezpośredni link do autoryzacji.'
                : locale === 'de'
                ? 'Scannen Sie diesen Code mit dem Mitarbeiter-Smartphone (BYOD) oder senden Sie den Direktlink.'
                : 'Scan this code with a staff smartphone (BYOD) or share the direct link.'}
            </p>

            {/* Direct URL & Copy Button */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-2">
              <a
                href={pairUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-xs text-amber-300 hover:text-amber-200 underline break-all bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/10"
              >
                <span>🔗 {pairUrl}</span>
                <span className="text-[10px] uppercase font-sans font-bold bg-amber-400/20 px-1.5 py-0.5 rounded text-amber-300">
                  {locale === 'pl' ? 'Otwórz ↗' : locale === 'de' ? 'Öffnen ↗' : 'Open ↗'}
                </span>
              </a>
              <CopyLinkButton url={pairUrl} />
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/10 self-start md:self-auto shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Setup QR" className="h-28 w-28 rounded-lg bg-white p-1.5 shadow-sm" />
            <div className="text-xs space-y-1.5 text-neutral-300 max-w-[150px]">
              <p className="font-semibold text-white">{locale === 'pl' ? 'Szybkie parowanie' : locale === 'de' ? 'Schnellkopplung' : 'Quick Pairing'}</p>
              <p className="text-[11px] text-neutral-400">
                {locale === 'pl' ? 'Skieruj aparat telefonu na kod QR — otworzy bezpośredni link.' : locale === 'de' ? 'Kamera auf den QR-Code richten — öffnet Direktlink.' : 'Point camera at QR code — opens direct link.'}
              </p>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded">
                  {locale === 'pl' ? 'Stanowisko' : locale === 'de' ? 'Arbeitsplatz' : 'Station'} #{terminal.id}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Workstation Configurator Form */}
      {editable && (
        <form action={updateTerminal} className="space-y-6">
          <input type="hidden" name="id" value={terminal.id} />

          {/* Section 1: Role & Profile */}
          <div className="card bg-white border border-neutral-200/80 shadow-sm p-6">
            <TerminalRoleConfigurator initialRole={currentRole} initialCapabilities={caps} locale={locale} />
          </div>

          {/* Section 2: Workstation Identity & Location */}
          <div className="card bg-white border border-neutral-200/80 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-neutral-900">
              {locale === 'pl' ? '2. Dane stanowiska i lokalizacja' : locale === 'de' ? '2. Arbeitsplatzdaten und Standort' : '2. Workstation identity & location'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="name">{getTranslation(locale, 'terminals.name', 'Nazwa stanowiska')}</label>
                <input id="name" name="name" required defaultValue={terminal.name} className="input" placeholder="np. Lada Główna Foodtruck" />
              </div>
              <div>
                <label className="label" htmlFor="location_id">{getTranslation(locale, 'terminals.table.location', 'Lokalizacja / Foodtruck')}</label>
                <select id="location_id" name="location_id" defaultValue={terminal.location_id ?? ''} className="input">
                  <option value="">— {locale === 'pl' ? 'brak przypisania' : locale === 'de' ? 'keine Zuordnung' : 'unassigned'} —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Multi-Brand Matrix */}
          <div className="card bg-white border border-neutral-200/80 shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-neutral-900">
                {locale === 'pl' ? '3. Obsługiwane marki (Multi-Brand)' : locale === 'de' ? '3. Unterstützte Marken (Multi-Brand)' : '3. Supported Brands (Multi-Brand)'}
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {locale === 'pl'
                  ? 'Wybierz, jakie marki to stanowisko ma przetwarzać. Na ladzie zazwyczaj włącza się wszystkie marki w lokalu.'
                  : locale === 'de'
                  ? 'Wählen Sie, welche Marken dieser Arbeitsplatz bedienen soll. An der Theke werden meist alle Marken aktiviert.'
                  : 'Select which brands this workstation processes. Counter stations usually handle all brands.'}
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-neutral-200 bg-neutral-50/70 hover:bg-neutral-100/70 cursor-pointer">
                <input
                  type="checkbox"
                  name="all_brands"
                  defaultChecked={isAllBrands}
                  className="rounded text-brand h-4 w-4"
                />
                <div>
                  <div className="font-semibold text-xs text-neutral-900">
                    {locale === 'pl' ? 'Obsługuj wszystkie marki w tej lokalizacji (Zalecane)' : locale === 'de' ? 'Alle Marken an diesem Standort bedienen (Empfohlen)' : 'Handle all brands in this location (Recommended)'}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {locale === 'pl' ? 'Stanowisko automatycznie obsłuży wszystkie aktualne i przyszłe marki.' : locale === 'de' ? 'Der Arbeitsplatz verarbeitet automatisch alle aktuellen und zukünftigen Marken.' : 'Station will automatically handle all current and future brands.'}
                  </div>
                </div>
              </label>

              {allBrands.length > 0 && (
                <div className="pt-2">
                  <span className="text-xs font-semibold text-neutral-700 block mb-2">
                    {locale === 'pl' ? 'Lub wybierz konkretne marki:' : locale === 'de' ? 'Oder bestimmte Marken wählen:' : 'Or choose specific brands:'}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {allBrands.map((b) => {
                      const checked = currentBrandIds.includes(b.id)
                      return (
                        <label key={b.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            name="assigned_brand_ids"
                            value={b.id}
                            defaultChecked={checked}
                            className="rounded text-brand"
                          />
                          <span className="font-medium text-neutral-800">{b.name}</span>
                          <span className="font-mono text-[10px] text-neutral-400">/{b.slug}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Hardware Routing & Peripherals (SBR-*) */}
          <div className="card bg-white border border-neutral-200/80 shadow-sm p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-900">
                  {locale === 'pl' ? '4. Peryferia sprzętowe SolutionsBay / SBR-*' : locale === 'de' ? '4. Hardware-Peripherie SolutionsBay / SBR-*' : '4. Hardware Peripherals SolutionsBay / SBR-*'}
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                  {locale === 'pl' ? 'Opcjonalne' : locale === 'de' ? 'Optional' : 'Optional'}
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                {locale === 'pl'
                  ? 'Dla smartfonów pracowników (BYOD) pola te mogą pozostać puste. Wypełnij je, gdy chcesz przekierować wydruki lub płatności do zewnętrznego terminala SolutionsBay.'
                  : locale === 'de'
                  ? 'Für BYOD-Smartphones können diese Felder leer bleiben. Ausfüllen, um Belege oder Zahlungen an ein SolutionsBay-Gerät weiterzuleiten.'
                  : 'For BYOD smartphones, these fields can be left blank. Fill them to route prints or card payments to a SolutionsBay device.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Printer Routing */}
              <div>
                <label className="label" htmlFor="printer_device_id">
                  🖨️ {locale === 'pl' ? 'Drukarka bonowa / SBR-*' : locale === 'de' ? 'Bondrucker / SBR-*' : 'Receipt Printer / SBR-*'}
                </label>
                <input
                  id="printer_device_id"
                  name="printer_device_id"
                  list="printer-device-options"
                  defaultValue={terminal.printer_device_id ?? (isCurrentSbr ? 'self' : '')}
                  placeholder="— puste (brak) lub SBR-* —"
                  className="input font-mono text-xs"
                />
                <datalist id="printer-device-options">
                  <option value="self">self ({locale === 'pl' ? 'wbudowana w to urządzenie' : locale === 'de' ? 'im Gerät integriert' : 'built-in'})</option>
                  {sbrDevices.map((d) => (
                    <option key={d.id} value={d.terminal_id}>{d.terminal_id} ({d.name})</option>
                  ))}
                </datalist>
                <p className="text-[11px] text-neutral-400 mt-1">
                  {locale === 'pl' ? 'Zostaw puste, jeśli używasz ekranu KDS.' : locale === 'de' ? 'Leer lassen bei Nutzung von Küchenmonitoren.' : 'Leave blank if using kitchen display instead of paper.'}
                </p>
              </div>

              {/* SoftPOS Tap Routing */}
              <div>
                <label className="label" htmlFor="tap_device_id">
                  💳 {locale === 'pl' ? 'Terminal płatniczy / SoftPOS' : locale === 'de' ? 'Kartenterminal / SoftPOS' : 'Payment Terminal / SoftPOS'}
                </label>
                <input
                  id="tap_device_id"
                  name="tap_device_id"
                  list="tap-device-options"
                  defaultValue={terminal.tap_device_id ?? (isCurrentSbr ? 'self' : '')}
                  placeholder="— puste (brak) lub SBR-* —"
                  className="input font-mono text-xs"
                />
                <datalist id="tap-device-options">
                  <option value="self">self ({locale === 'pl' ? 'wbudowany SoftPOS' : locale === 'de' ? 'integriertes SoftPOS' : 'built-in SoftPOS'})</option>
                  {sbrDevices.map((d) => (
                    <option key={d.id} value={d.terminal_id}>{d.terminal_id} ({d.name})</option>
                  ))}
                </datalist>
                <p className="text-[11px] text-neutral-400 mt-1">
                  {locale === 'pl' ? 'Zostaw puste przy płatnościach gotówką.' : locale === 'de' ? 'Leer lassen bei reinen Barzahlungen.' : 'Leave blank for cash-only workstations.'}
                </p>
              </div>

              {/* Fiscal Routing */}
              <div>
                <label className="label" htmlFor="fiscal_device_id">
                  🏢 {locale === 'pl' ? 'Urządzenie Fiskalne / Hub' : locale === 'de' ? 'Fiskalgerät / Hub' : 'Fiscal Device / Hub'}
                </label>
                <input
                  id="fiscal_device_id"
                  name="fiscal_device_id"
                  list="fiscal-device-options"
                  defaultValue={terminal.fiscal_device_id ?? ''}
                  placeholder="— puste (brak) lub SBF-* —"
                  className="input font-mono text-xs"
                />
                <datalist id="fiscal-device-options">
                  {options.fiscal_devices?.map((f) => (
                    <option key={f.id} value={f.device_id}>{f.device_id} ({f.name})</option>
                  ))}
                </datalist>
                <p className="text-[11px] text-neutral-400 mt-1">
                  {locale === 'pl' ? 'Opcjonalna kasa wirtualna / hub do rejestracji e-paragonów.' : locale === 'de' ? 'Optionales Fiskalgerät für E-Belege.' : 'Optional virtual register / fiscal hub.'}
                </p>
              </div>
            </div>

            {sbrDevices.length > 0 && (
              <div className="pt-2 text-xs text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-200/60">
                <span className="font-semibold text-neutral-700 block mb-1">
                  {locale === 'pl' ? 'Dostępne fizyczne urządzenia SBR-* w Twojej firmie:' : locale === 'de' ? 'Verfügbare physische SBR-*-Geräte:' : 'Available physical SBR-* devices in your company:'}
                </span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {sbrDevices.map((d) => (
                    <span
                      key={d.id}
                      className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-neutral-200 text-neutral-700"
                    >
                      {d.terminal_id} ({d.name})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <button type="submit" className="btn-brand px-6">
                {locale === 'pl' ? 'Zapisz konfigurację stanowiska' : locale === 'de' ? 'Konfiguration speichern' : 'Save workstation configuration'}
              </button>
              <Link href="/dashboard/terminals" className="btn-secondary text-xs">
                {getTranslation(locale, 'btn.cancel', 'Anuluj')}
              </Link>
            </div>
          </div>
        </form>
      )}

      {/* Danger Zone */}
      <div className="card bg-neutral-50/70 border border-neutral-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-800">
              {locale === 'pl' ? 'Zarządzanie sesją i statusem' : locale === 'de' ? 'Sitzungs- und Statusverwaltung' : 'Session and status management'}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {locale === 'pl' ? 'Wylogowanie odłącza bieżące urządzenie i przywraca status oczekiwania na ponowne sparowanie.' : locale === 'de' ? 'Abmelden trennt das Gerät und setzt den Status auf Warten auf Kopplung.' : 'Logging out unpairs the current device and sets status to awaiting pairing.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {terminal.status !== 'unclaimed' && (
              <form action={logoutTerminal}>
                <input type="hidden" name="id" value={terminal.id} />
                <button className="text-xs font-semibold px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 transition-colors">
                  {locale === 'pl' ? 'Wyloguj urządzenie' : locale === 'de' ? 'Gerät abmelden' : 'Logout device'}
                </button>
              </form>
            )}
            {editable ? (
              <form action={deleteTerminal}>
                <input type="hidden" name="id" value={terminal.id} />
                <button className="text-xs font-semibold px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-red-700 hover:bg-red-100 transition-colors">
                  {locale === 'pl' ? 'Deaktywuj stanowisko' : locale === 'de' ? 'Arbeitsplatz deaktivieren' : 'Deactivate workstation'}
                </button>
              </form>
            ) : (
              <form action={archiveTerminal}>
                <input type="hidden" name="id" value={terminal.id} />
                <button className="text-xs font-semibold px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-neutral-600 hover:bg-neutral-50 transition-colors">
                  {locale === 'pl' ? 'Archiwizuj' : locale === 'de' ? 'Archivieren' : 'Archive'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

