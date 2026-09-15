import { adminApiData } from '@/lib/api'
import type { AdminLocale } from '@/lib/i18n'
import { getTranslation } from '@/lib/i18n'
import {
  linkRycos, unlinkRycos, syncRycos, generatePin, unpairDevice,
  buySeats, extendPurchase, addHubDevice,
} from './rycos-actions'

interface RycosSeat {
  id: string
  tier: 'rycos_0' | 'rycos_p' | 'rycos_f' | 'rycos_pf'
  status: 'available' | 'paired' | 'suspended' | 'revoked'
  paired_at: string | null
  purchase_id: string
  devices: { display_id: string; device_name: string | null; last_seen_at: string | null } | null
}

interface RycosStatus {
  configured: boolean
  linked: boolean
  client: { id: string; nip: string; name: string; hub_id: string | null } | null
  hub: {
    hub_id: string
    fiscal_topic: string
    device_count: number
    eligible_count: number
    devices: Array<{ display_id: string; online: boolean; aplikasa_installed: boolean; eligible: boolean }>
  } | null
  hub_device_added?: boolean
  seats: RycosSeat[]
  purchases: Array<{ purchase_id: string; seat_count: number; tiers: Record<string, number> }>
  synced_at?: string | null
  portal_error: string | null
}

const TIER_LABEL: Record<string, string> = {
  rycos_0:  'Basic',
  rycos_p:  'Payments',
  rycos_f:  'Fiscal',
  rycos_pf: 'Payments + Fiscal',
}

function StatusPill({ status }: { status: RycosSeat['status'] }) {
  const styles: Record<string, string> = {
    paired:    'bg-green-50 text-green-700',
    available: 'bg-blue-50 text-blue-700',
    suspended: 'bg-amber-50 text-amber-800',
    revoked:   'bg-neutral-100 text-neutral-500',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status] ?? styles.revoked}`}>{status}</span>
}

export async function RycosSection({ pin, pinExpires, locale = 'pl' }: { pin?: string; pinExpires?: string; locale?: AdminLocale }) {
  const s = await adminApiData<RycosStatus>('/rycos/status')
  if (!s || !s.configured) return null

  // ── Not linked yet: one form to connect ────────────────────────────────
  if (!s.linked) {
    const company = await adminApiData<{ name?: string; address?: string; email?: string }>('/companies')
    return (
      <section className="card mt-10 border-blue-200 bg-blue-50/40">
        <h2 className="text-lg font-semibold">
          {getTranslation(locale, 'fiscal.rycos_title', 'Pobieraj urządzenia z Portalu RYCOS')}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          {getTranslation(locale, 'fiscal.rycos_subtitle', 'Połącz firmę z portalem RYCOS, aby automatycznie licencjonować i parować drukarki fiskalne.')}
        </p>
        <form action={linkRycos} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="nip">NIP (10 cyfr)</label>
            <input id="nip" name="nip" required placeholder="1111111111" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="rycos_name">{locale === 'pl' ? 'Zarejestrowana nazwa firmy' : 'Registered company name'}</label>
            <input id="rycos_name" name="name" required defaultValue={company?.name ?? ''} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="address_street">{locale === 'pl' ? 'Ulica i numer' : 'Street'}</label>
            <input id="address_street" name="address_street" className="input" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="label" htmlFor="address_zip">{locale === 'pl' ? 'Kod pocztowy' : 'Zip code'}</label>
              <input id="address_zip" name="address_zip" placeholder="00-867" className="input" />
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="address_city">{locale === 'pl' ? 'Miasto' : 'City'}</label>
              <input id="address_city" name="address_city" className="input" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="rycos_email">{locale === 'pl' ? 'E-mail kontaktowy' : 'Contact email'}</label>
            <input id="rycos_email" name="email" type="email" defaultValue={company?.email ?? ''} className="input" />
          </div>
          <div className="flex items-end">
            <button className="btn-brand">{locale === 'pl' ? 'Połącz z RYCOS' : 'Connect to RYCOS'}</button>
          </div>
        </form>
      </section>
    )
  }

  // ── Linked ─────────────────────────────────────────────────────────────
  const available = s.seats.filter((x) => x.status === 'available')
  const paired = s.seats.filter((x) => x.status === 'paired')

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{locale === 'pl' ? 'Licencje RYCOS i parowanie urządzeń' : 'RYCOS licences & pairing'}</h2>
          <p className="text-sm text-neutral-500">
            {s.client?.name} · NIP {s.client?.nip}
            {s.client?.hub_id && <> · hub <span className="font-mono">{s.client.hub_id}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <form action={syncRycos}>
            <button className="btn-brand text-xs">{locale === 'pl' ? 'Synchronizuj urządzenia' : 'Sync devices'}</button>
          </form>
          <form action={unlinkRycos}>
            <button className="text-xs font-medium text-neutral-500 hover:underline">{locale === 'pl' ? 'Odłącz' : 'Disconnect'}</button>
          </form>
        </div>
      </div>

      {s.portal_error && (
        <div className="card mt-4 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">{locale === 'pl' ? 'Portal RYCOS niedostępny' : 'RYCOS portal unavailable'}</p>
          <p className="mt-1 text-xs text-amber-800">
            {s.portal_error}
          </p>
        </div>
      )}

      {/* Fresh PIN */}
      {pin && (
        <div className="card mt-4 border-green-300 bg-green-50">
          <p className="text-sm font-semibold text-green-900">{locale === 'pl' ? 'Kod parowania PIN' : 'Pairing PIN'}</p>
          <p className="mt-2 font-mono text-4xl font-bold tracking-[0.3em] text-green-900">{pin}</p>
          <p className="mt-2 text-xs text-green-800">
            {locale === 'pl'
              ? `Wpisz kod w aplikacji RYCOS na terminalu. Ważny przez 10 minut${pinExpires ? ` (do ${new Date(pinExpires).toLocaleTimeString()})` : ''}. Urządzenie pojawi się po kliknięciu „Synchronizuj urządzenia”.`
              : `Enter it in the RYCOS app on the terminal. Valid for 10 minutes${pinExpires ? ` (until ${new Date(pinExpires).toLocaleTimeString()})` : ''}.`}
          </p>
        </div>
      )}

      {s.hub && s.hub.device_count > 1 && !s.hub_device_added && (
        <div className="card mt-4 border-blue-200 bg-blue-50">
          <p className="text-sm font-semibold text-blue-900">
            {locale === 'pl' ? `Load-balance pomiędzy ${s.hub.device_count} urządzeniami` : `Load-balance across ${s.hub.device_count} fiscal devices`}
          </p>
          <form action={addHubDevice} className="mt-3">
            <button className="btn-brand text-xs">{locale === 'pl' ? 'Użyj huba fiskalnego' : 'Use the fiscal hub'}</button>
          </form>
        </div>
      )}

      <div className="card mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {locale === 'pl' ? `Miejsca licencyjne — ${paired.length} sparowanych, ${available.length} wolnych` : `Licence seats — ${paired.length} paired, ${available.length} free`}
          </p>
          {s.synced_at && (
            <p className="text-xs text-neutral-400">
              {locale === 'pl' ? 'zsynchronizowano ' : 'synced '} {new Date(s.synced_at.replace(' ', 'T') + 'Z').toLocaleString()}
            </p>
          )}
        </div>

        {s.seats.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            {locale === 'pl' ? 'Brak licencji. Zamów licencje poniżej.' : 'No seats yet. Order some below.'}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {s.seats.map((seat) => {
              const hubDev = s.hub?.devices.find((d) => d.display_id === seat.devices?.display_id)
              return (
                <li key={seat.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={seat.status} />
                    <span className="text-sm font-medium">{TIER_LABEL[seat.tier] ?? seat.tier}</span>
                    {seat.devices ? (
                      <>
                        <span className="font-mono text-xs text-neutral-500">{seat.devices.display_id}</span>
                        {seat.devices.device_name && (
                          <span className="text-xs text-neutral-500">{seat.devices.device_name}</span>
                        )}
                        {hubDev && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${hubDev.online ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'}`}>
                            {hubDev.online ? 'online' : 'offline'}
                          </span>
                        )}
                        {hubDev && !hubDev.aplikasa_installed && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Brak Aplikasa
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-neutral-400">{locale === 'pl' ? 'brak urządzenia' : 'no device paired'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {seat.status === 'available' && (
                      <form action={generatePin}>
                        <input type="hidden" name="seat_id" value={seat.id} />
                        <button className="text-xs font-semibold text-blue-700 hover:underline">
                          {locale === 'pl' ? 'Generuj kod PIN do parowania' : 'Generate pairing PIN'}
                        </button>
                      </form>
                    )}
                    {seat.status === 'paired' && (
                      <form action={unpairDevice}>
                        <input type="hidden" name="seat_id" value={seat.id} />
                        <button className="text-xs font-medium text-red-600 hover:underline">
                          {locale === 'pl' ? 'Odłącz' : 'Unpair'}
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Renewal */}
      {s.purchases.length > 0 && (
        <div className="card mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{locale === 'pl' ? 'Przedłuż licencje' : 'Renew licences'}</p>
          <ul className="mt-2 space-y-2">
            {s.purchases.map((p) => (
              <li key={p.purchase_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {p.seat_count} {locale === 'pl' ? 'stanowisk' : 'seats'}
                  <span className="ml-2 text-xs text-neutral-500">
                    {Object.entries(p.tiers).map(([t, n]) => `${n}× ${TIER_LABEL[t] ?? t}`).join(', ')}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {[1, 12].map((m) => (
                    <form key={m} action={extendPurchase}>
                      <input type="hidden" name="purchase_id" value={p.purchase_id} />
                      <input type="hidden" name="months" value={m} />
                      <button className="text-xs font-semibold text-blue-700 hover:underline">
                        +{m === 12 ? (locale === 'pl' ? '1 rok' : '1 year') : (locale === 'pl' ? '1 miesiąc' : '1 month')}
                      </button>
                    </form>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form action={buySeats} className="card mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{locale === 'pl' ? 'Zamów kolejne licencje' : 'Order more seats'}</p>
        <p className="mt-1 text-xs text-neutral-500">
          {locale === 'pl' ? 'Jedno miejsce licencjonuje jeden terminal.' : 'One seat licenses one terminal.'}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([
            ['seats_pf', 'Payments + Fiscal'],
            ['seats_f', 'Fiscal only'],
            ['seats_p', 'Payments only'],
            ['seats_0', 'Basic'],
          ] as const).map(([name, label]) => (
            <div key={name}>
              <label className="label" htmlFor={name}>{label}</label>
              <input id={name} name={name} type="number" min={0} defaultValue={0} className="input" />
            </div>
          ))}
          <div className="flex items-end">
            <button className="btn-brand">{locale === 'pl' ? 'Zamów' : 'Order'}</button>
          </div>
        </div>
      </form>
    </section>
  )
}

