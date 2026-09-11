import { adminApiData } from '@/lib/api'
import {
  linkRycos, unlinkRycos, syncRycos, generatePin, unpairDevice,
  buySeats, extendPurchase, addHubDevice,
} from './rycos-actions'

// RYCOS provisioning panel.
//
// Fiscal devices used to be a text box: you typed a routing id and hoped it was
// right. This section issues them instead — link the company to its RYCOS
// client, order licence seats, hand out a pairing PIN, and the paired terminal
// shows up in the list above with its licence tier and live online state.
//
// Renders nothing when the integration has no API key, so the manual flow is
// untouched on installs that don't use RYCOS.

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

export async function RycosSection({ pin, pinExpires }: { pin?: string; pinExpires?: string }) {
  const s = await adminApiData<RycosStatus>('/rycos/status')
  if (!s || !s.configured) return null

  // ── Not linked yet: one form to connect ────────────────────────────────
  if (!s.linked) {
    const company = await adminApiData<{ name?: string; address?: string; email?: string }>('/companies')
    return (
      <section className="card mt-10 border-blue-200 bg-blue-50/40">
        <h2 className="text-lg font-semibold">Issue fiscal devices from RYCOS</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Connect this company to the RYCOS portal to order licence seats and pair real fiscal
          terminals, instead of typing device ids by hand. Matching is by tax id (NIP) — if RYCOS
          already holds a client with that NIP, we link to it rather than creating a second one.
        </p>
        <form action={linkRycos} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="nip">NIP (10 digits)</label>
            <input id="nip" name="nip" required placeholder="1111111111" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="rycos_name">Registered company name</label>
            <input id="rycos_name" name="name" required defaultValue={company?.name ?? ''} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="address_street">Street</label>
            <input id="address_street" name="address_street" className="input" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="label" htmlFor="address_zip">Zip</label>
              <input id="address_zip" name="address_zip" placeholder="00-867" className="input" />
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="address_city">City</label>
              <input id="address_city" name="address_city" className="input" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="rycos_email">Contact email</label>
            <input id="rycos_email" name="email" type="email" defaultValue={company?.email ?? ''} className="input" />
          </div>
          <div className="flex items-end">
            <button className="btn-brand">Connect to RYCOS</button>
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
          <h2 className="text-lg font-semibold">RYCOS licences &amp; pairing</h2>
          <p className="text-sm text-neutral-500">
            {s.client?.name} · NIP {s.client?.nip}
            {s.client?.hub_id && <> · hub <span className="font-mono">{s.client.hub_id}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <form action={syncRycos}>
            <button className="btn-brand text-xs">Sync devices</button>
          </form>
          <form action={unlinkRycos}>
            <button className="text-xs font-medium text-neutral-500 hover:underline">Disconnect</button>
          </form>
        </div>
      </div>

      {s.portal_error && (
        <div className="card mt-4 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">RYCOS portal unavailable</p>
          <p className="mt-1 text-xs text-amber-800">
            {s.portal_error} — the devices listed above keep working; only provisioning is paused.
          </p>
        </div>
      )}

      {/* A freshly generated PIN. 6 digits, 10 minutes, 3 attempts — read it out
          to whoever is standing at the terminal. */}
      {pin && (
        <div className="card mt-4 border-green-300 bg-green-50">
          <p className="text-sm font-semibold text-green-900">Pairing PIN</p>
          <p className="mt-2 font-mono text-4xl font-bold tracking-[0.3em] text-green-900">{pin}</p>
          <p className="mt-2 text-xs text-green-800">
            Enter it in the RYCOS app on the terminal. Valid for 10 minutes
            {pinExpires && <> (until {new Date(pinExpires).toLocaleTimeString()})</>}, 3 attempts.
            The device appears in the list above after you press “Sync devices”.
          </p>
        </div>
      )}

      {/* Hub routing. Worth offering only once there is more than one fiscal
          device — with a single register, addressing it directly is simpler. */}
      {s.hub && s.hub.device_count > 1 && !s.hub_device_added && (
        <div className="card mt-4 border-blue-200 bg-blue-50">
          <p className="text-sm font-semibold text-blue-900">
            Load-balance across {s.hub.device_count} fiscal devices
          </p>
          <p className="mt-1 text-xs text-blue-800">
            RYCOS can distribute receipts across every eligible register ({s.hub.eligible_count} ready
            now) with automatic failover, instead of you pinning terminals to one device. Adds{' '}
            <span className="font-mono">{s.hub.hub_id}</span> as a fiscal device you can assign
            terminals to above.
          </p>
          <form action={addHubDevice} className="mt-3">
            <button className="btn-brand text-xs">Use the fiscal hub</button>
          </form>
        </div>
      )}

      <div className="card mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Licence seats — {paired.length} paired, {available.length} free
          </p>
          {/* admin-api returns Postgres timestamps as raw "YYYY-MM-DD HH:mm:ss"
              (its pg type parsers are overridden for Flutter parity), so
              normalise before handing it to Date. */}
          {s.synced_at && (
            <p className="text-xs text-neutral-400">
              synced {new Date(s.synced_at.replace(' ', 'T') + 'Z').toLocaleString()}
            </p>
          )}
        </div>

        {s.seats.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            No seats yet. Order some below — each seat licenses one terminal.
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
                        {/* Fiscalisation needs the Aplikasa companion app; a
                            paired device without it silently cannot issue. */}
                        {hubDev && !hubDev.aplikasa_installed && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Aplikasa missing
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-neutral-400">no device paired</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {seat.status === 'available' && (
                      <form action={generatePin}>
                        <input type="hidden" name="seat_id" value={seat.id} />
                        <button className="text-xs font-semibold text-blue-700 hover:underline">Generate pairing PIN</button>
                      </form>
                    )}
                    {seat.status === 'paired' && (
                      <form action={unpairDevice}>
                        <input type="hidden" name="seat_id" value={seat.id} />
                        <button className="text-xs font-medium text-red-600 hover:underline">Unpair</button>
                      </form>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Renewal. RYCOS extends from MAX(now, current validity), so renewing
          early costs nothing. */}
      {s.purchases.length > 0 && (
        <div className="card mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Renew licences</p>
          <ul className="mt-2 space-y-2">
            {s.purchases.map((p) => (
              <li key={p.purchase_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {p.seat_count} seat{p.seat_count === 1 ? '' : 's'}
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
                        +{m === 12 ? '1 year' : '1 month'}
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
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Order more seats</p>
        <p className="mt-1 text-xs text-neutral-500">
          One seat licenses one terminal for 3 months. Pick the mix you need.
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
            <button className="btn-brand">Order</button>
          </div>
        </div>
      </form>
    </section>
  )
}
