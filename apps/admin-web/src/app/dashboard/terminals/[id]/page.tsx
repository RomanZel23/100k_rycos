import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { updateTerminal, deleteTerminal, archiveTerminal, logoutTerminal } from '../actions'

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

  const unclaimed = terminal.status === 'unclaimed'
  const editable = terminal.status === 'active' || terminal.status === 'unclaimed'
  const qr = await QRCode.toDataURL(terminal.terminal_id, { width: 180, margin: 1 })

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
            &larr; Wróć do listy stanowisk
          </Link>
          <div className="flex items-center gap-3 mt-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{terminal.name}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              terminal.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {terminal.status === 'active' ? '● Aktywny' : '⏳ Oczekuje na sparowanie'}
            </span>
          </div>
        </div>

        {/* Quick Launch / View in Action */}
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/terminals`}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors"
          >
            Lista stanowisk
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
                Kod Identyfikatora / Parowania
              </span>
              {isCurrentSbr && (
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-xs font-semibold">
                  SolutionsBay SBR
                </span>
              )}
            </div>
            <p className="font-mono text-3xl font-black tracking-widest text-white">{terminal.terminal_id}</p>
            <p className="text-xs text-neutral-300 max-w-md">
              Zeskanuj ten kod smartfonem pracownika lub wpisz go w aplikacji SolutionsBay / POS, aby natychmiast uruchomić ten profil na urządzeniu.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/10 self-start md:self-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Setup QR" className="h-28 w-28 rounded-lg bg-white p-1.5 shadow-sm" />
            <div className="text-xs space-y-1.5 text-neutral-300">
              <p className="font-semibold text-white">Szybkie parowanie</p>
              <p>Otwórz aparat w telefonie pracownika lub aplikację ladową.</p>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded">
                  Stanowisko #{terminal.id}
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
          <div className="card bg-white border border-neutral-200/80 shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-neutral-900">1. Profil i rola stanowiska pracy</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Wybierz przeznaczenie tego urządzenia. W foodtrucku tablet na ladzie zazwyczaj działa w trybie <strong className="text-neutral-700">All-in-One</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[
                {
                  id: 'all_in_one',
                  title: '⚡ All-in-One Foodtruck Master',
                  desc: 'Kasa POS + Kuchnia KDS + Skaner Wydań + SoftPOS i Drukarka SBR-*',
                  badge: 'Zalecane na ladę',
                },
                {
                  id: 'pos',
                  title: '🖥️ Kasa na Ladzie (POS)',
                  desc: 'Sprzedaż bezpośrednia, obsługa gotówki, SoftPOS, druk paragonów',
                  badge: 'Tylko sprzedaż',
                },
                {
                  id: 'kds',
                  title: '🍳 Kuchnia (KDS)',
                  desc: 'Ekran zamówień w kuchni / przy grillu, oznaczanie dań jako gotowe',
                  badge: 'Dla kucharzy',
                },
                {
                  id: 'pickup',
                  title: '📱 Skaner Wydań (BYOD)',
                  desc: 'Prywatny smartfon pracownika na wydawce, szybkie skanowanie QR',
                  badge: 'Mobilne BYOD',
                },
                {
                  id: 'kiosk',
                  title: '🛎️ Kiosk Samoobsługowy',
                  desc: 'Tablet dla klientów na zewnątrz foodtrucka do samodzielnego zamawiania',
                  badge: 'Samoobsługa',
                },
                {
                  id: 'fiscal_hub',
                  title: '🏢 Hub Fiskalny / Manager',
                  desc: 'Centralna rejestracja fiskalna w tle (e-paragony / kasa wirtualna)',
                  badge: 'Fiskalizacja',
                },
              ].map((r) => {
                const isSelected = currentRole === r.id
                return (
                  <label
                    key={r.id}
                    className={`relative flex flex-col justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-brand bg-brand/5 shadow-sm ring-1 ring-brand/20'
                        : 'border-neutral-200/80 hover:border-neutral-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <input
                          type="radio"
                          name="role"
                          value={r.id}
                          defaultChecked={isSelected}
                          className="text-brand focus:ring-brand"
                        />
                        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider bg-neutral-100 px-1.5 py-0.2 rounded">
                          {r.badge}
                        </span>
                      </div>
                      <div className="font-semibold text-xs text-neutral-900 mt-1">{r.title}</div>
                      <div className="text-[11px] text-neutral-500 mt-1 leading-snug">{r.desc}</div>
                    </div>
                  </label>
                )
              })}
            </div>

            {/* Granular Capabilities */}
            <div className="pt-3 border-t border-neutral-100">
              <span className="text-xs font-semibold text-neutral-700 block mb-2">
                Włączone moduły i funkcje na tym stanowisku:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <label className="flex items-center gap-2 p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer">
                  <input type="checkbox" name="cap_sell" defaultChecked={caps.can_sell !== false} className="rounded text-brand" />
                  <span>💳 Sprzedaż (POS)</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer">
                  <input type="checkbox" name="cap_kds" defaultChecked={caps.can_kds !== false} className="rounded text-brand" />
                  <span>🍳 Kuchnia (KDS)</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer">
                  <input type="checkbox" name="cap_pickup" defaultChecked={caps.can_pickup !== false} className="rounded text-brand" />
                  <span>📦 Wydawka (Skaner)</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer">
                  <input type="checkbox" name="cap_softpos" defaultChecked={caps.has_softpos !== false} className="rounded text-brand" />
                  <span>📱 SoftPOS (Karty)</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer">
                  <input type="checkbox" name="cap_printer" defaultChecked={caps.has_printer !== false} className="rounded text-brand" />
                  <span>🖨️ Druk bonów</span>
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Workstation Identity & Location */}
          <div className="card bg-white border border-neutral-200/80 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-neutral-900">2. Dane stanowiska i lokalizacja</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="name">Nazwa stanowiska</label>
                <input id="name" name="name" required defaultValue={terminal.name} className="input" placeholder="np. Lada Główna Foodtruck" />
              </div>
              <div>
                <label className="label" htmlFor="location_id">Lokalizacja / Foodtruck</label>
                <select id="location_id" name="location_id" defaultValue={terminal.location_id ?? ''} className="input">
                  <option value="">— brak przypisania —</option>
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
              <h2 className="text-base font-bold text-neutral-900">3. Obsługiwane marki (Multi-Brand)</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Wybierz, jakie marki ten foodtruck lub stanowisko ma przetwarzać. Na ladzie zazwyczaj włącza się wszystkie marki w lokalu.
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
                  <div className="font-semibold text-xs text-neutral-900">Obsługuj wszystkie marki w tej lokalizacji (Zalecane)</div>
                  <div className="text-[11px] text-neutral-500">Stanowisko automatycznie obsłuży wszystkie aktualne i przyszłe marki.</div>
                </div>
              </label>

              {allBrands.length > 0 && (
                <div className="pt-2">
                  <span className="text-xs font-semibold text-neutral-700 block mb-2">Lub wybierz konkretne marki:</span>
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
              <h2 className="text-base font-bold text-neutral-900">4. Peryferia i sprzęt (Hardware Routing)</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Wskaż urządzenia fizyczne odpowiedzialne za wydruki Bluetooth, płatności SoftPOS i fiskalizację. Wpisz <span className="font-mono font-semibold">self</span>, jeśli to urządzenie posiada podłączony sprzęt.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Printer Routing */}
              <div>
                <label className="label" htmlFor="printer_device_id">
                  🖨️ Drukarka bonów (ESC/POS)
                </label>
                <input
                  id="printer_device_id"
                  name="printer_device_id"
                  defaultValue={terminal.printer_device_id ?? (isCurrentSbr ? 'self' : '')}
                  placeholder="self lub np. SBR-C5N34S"
                  className="input font-mono text-xs"
                />
                <p className="text-[11px] text-neutral-400 mt-1">
                  Urządzenie wysyłające komendy Bluetooth do drukarki kuchennej/bonowej.
                </p>
              </div>

              {/* SoftPOS Tap Routing */}
              <div>
                <label className="label" htmlFor="tap_device_id">
                  💳 Terminal SoftPOS (Karta)
                </label>
                <input
                  id="tap_device_id"
                  name="tap_device_id"
                  defaultValue={terminal.tap_device_id ?? (isCurrentSbr ? 'self' : '')}
                  placeholder="self lub np. SBR-C5N34S"
                  className="input font-mono text-xs"
                />
                <p className="text-[11px] text-neutral-400 mt-1">
                  Urządzenie z licencją SoftPOS (Worldline Tap on Mobile).
                </p>
              </div>

              {/* Fiscal Routing */}
              <div>
                <label className="label" htmlFor="fiscal_device_id">
                  🏢 Urządzenie Fiskalne / Hub
                </label>
                <input
                  id="fiscal_device_id"
                  name="fiscal_device_id"
                  defaultValue={terminal.fiscal_device_id ?? ''}
                  placeholder="np. SBF-14d68457 lub SBR-*"
                  className="input font-mono text-xs"
                />
                <p className="text-[11px] text-neutral-400 mt-1">
                  Wirtualny Hub Fiskalny lub lokalna kasa rejestrująca e-paragony.
                </p>
              </div>
            </div>

            {sbrDevices.length > 0 && (
              <div className="pt-2 text-xs text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-200/60">
                <span className="font-semibold text-neutral-700 block mb-1">Wykryte urządzenia fizyczne w Twojej firmie:</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {sbrDevices.map((d) => (
                    <span key={d.id} className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-neutral-200">
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
                Zapisz konfigurację stanowiska
              </button>
              <Link href="/dashboard/terminals" className="btn-secondary text-xs">
                Anuluj
              </Link>
            </div>
          </div>
        </form>
      )}

      {/* Danger Zone */}
      <div className="card bg-neutral-50/70 border border-neutral-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-800">Zarządzanie sesją i statusem</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Wylogowanie odłącza bieżące urządzenie i przywraca status oczekiwania na ponowne sparowanie.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {terminal.status !== 'unclaimed' && (
              <form action={logoutTerminal}>
                <input type="hidden" name="id" value={terminal.id} />
                <button className="text-xs font-semibold px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 transition-colors">
                  Wyloguj urządzenie
                </button>
              </form>
            )}
            {editable ? (
              <form action={deleteTerminal}>
                <input type="hidden" name="id" value={terminal.id} />
                <button className="text-xs font-semibold px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-red-700 hover:bg-red-100 transition-colors">
                  Deaktywuj stanowisko
                </button>
              </form>
            ) : (
              <form action={archiveTerminal}>
                <input type="hidden" name="id" value={terminal.id} />
                <button className="text-xs font-semibold px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-neutral-600 hover:bg-neutral-50 transition-colors">
                  Archiwizuj
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
