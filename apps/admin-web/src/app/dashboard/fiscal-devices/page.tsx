import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
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
  // Set only on rows issued from the RYCOS portal (source='rycos'); manual rows
  // leave them null because nothing verifies a hand-typed id.
  source: 'manual' | 'rycos'
  kind: 'device' | 'hub'
  tier: string | null
  online: boolean | null
  aplikasa_installed: boolean | null
  last_seen_at: string | null
  license_expires_at: string | null
}
interface FiscalDevicesResponse {
  devices: FiscalDevice[]
  unassigned: TerminalRef[]
}

export default async function FiscalDevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; pin?: string; pin_expires?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const sp = await searchParams
  const data = (await adminApiData<FiscalDevicesResponse>('/fiscal-devices')) ?? { devices: [], unassigned: [] }
  const devices = data.devices
  const unassigned = data.unassigned
  const hasPrimary = devices.some((d) => d.is_primary)

  // Full terminal pool (assigned + unassigned) is the checkbox source for
  // each device's terminals form. Sorted alphabetically for stable UI.
  const allTerminals: TerminalRef[] = [
    ...devices.flatMap((d) => d.terminals),
    ...unassigned,
  ]
    // De-dup: a terminal that's on multiple fiscal devices (M:N) would
    // appear once per device. Keep the first occurrence so the checkbox grid
    // doesn't have repeats.
    .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Fiscal devices</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Each fiscal device handles fiscalization for a set of terminals. A terminal can route to
        several devices for round-robin load balancing. The <strong>primary fiscalizer</strong>{' '}
        handles any order whose terminal has no device of its own.
      </p>

      {sp.error && <Banner kind="error">{sp.error}</Banner>}
      {sp.notice && <Banner kind="success">{sp.notice}</Banner>}

      {/* RED warning: no primary fiscalizer is set. Without one, an order
          routed to an unassigned terminal has no fiscalization target and
          will fall through to the hardcoded last-resort device. */}
      {devices.length > 0 && !hasPrimary && (
        <div className="card mt-6 border-red-300 bg-red-50">
          <p className="text-sm font-semibold text-red-900">
            No primary fiscalizer set
          </p>
          <p className="mt-1 text-xs text-red-800">
            Orders routed to terminals without their own fiscal device have nowhere to fiscalize.
            Pick one device below as the primary fiscalizer — it acts as the safety net.
          </p>
        </div>
      )}

      {/* Unassigned-terminals warning. Not strictly broken — those terminals
          fall back to the primary fiscalizer — but worth surfacing so the
          admin can decide intentionally. */}
      {unassigned.length > 0 && (
        <div className="card mt-6 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">
            {unassigned.length} terminal{unassigned.length === 1 ? '' : 's'} not assigned to a fiscal device
          </p>
          <p className="mt-1 text-xs text-amber-800">
            These will use the primary fiscalizer when an order is routed to them. Assign them below
            if you want a different fiscalizer per location/area.
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
          <li className="card text-sm text-neutral-500">No fiscal devices yet — create one below.</li>
        )}
        {devices.map((d) => (
          <li key={d.id} className={`card ${d.is_primary ? 'border-blue-200 ring-2 ring-blue-100' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold">{d.name}</span>
                <span className="font-mono text-xs text-neutral-500">{d.device_id}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
                  {d.status}
                </span>
                {d.kind === 'hub' && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    LOAD-BALANCED HUB
                  </span>
                )}
                {/* Live state, only meaningful for RYCOS-issued rows. A device
                    that is offline or missing Aplikasa accepts the MQTT command
                    and then fails to issue, so it is worth showing here. */}
                {d.source === 'rycos' && d.online != null && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${d.online ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {d.online ? 'online' : 'offline'}
                  </span>
                )}
                {d.source === 'rycos' && d.kind === 'device' && d.aplikasa_installed === false && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    Aplikasa missing
                  </span>
                )}
                {/* Licence expiry, stamped by the RYCOS license.expiring
                    webhook (fires at 30 and 7 days). Past expiry the device
                    stays paired but RYCOS blocks fiscalisation. */}
                {d.license_expires_at && (() => {
                  const days = Math.ceil((new Date(d.license_expires_at.replace(' ', 'T') + 'Z').getTime() - Date.now()) / 86_400_000)
                  return (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${days <= 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                      {days <= 0 ? 'licence expired' : `licence expires in ${days}d`}
                    </span>
                  )
                })()}
                {d.source === 'manual' && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500" title="Entered by hand — not verified against RYCOS">
                    unverified
                  </span>
                )}
                {d.is_primary && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                    PRIMARY FISCALIZER
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {!d.is_primary && (
                  <form action={setPrimary}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="text-xs font-semibold text-blue-700 hover:underline">Make primary</button>
                  </form>
                )}
                <form action={toggleFiscalDevice}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="status" value={d.status} />
                  <button className="text-xs font-medium text-neutral-500 hover:underline">{d.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                </form>
                <form action={deleteFiscalDevice}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                </form>
              </div>
            </div>

            {/* One form per device. Checkboxes pre-checked for terminals already
                using this device. Submitting REPLACES the set: unchecking a
                terminal removes the edge; checking one already bound to another
                device ADDS this device alongside the others (M:N — terminal
                can route to several devices and we round-robin between them). */}
            <form action={saveTerminals} className="mt-4 rounded-lg border border-neutral-100 p-3">
              <input type="hidden" name="id" value={d.id} />
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Terminals routing to this fiscal device</p>
              {allTerminals.length === 0 ? (
                <p className="mt-2 text-xs text-neutral-400">
                  No active terminals yet. Pair one in <Link href="/dashboard/terminals" className="text-brand hover:underline">Terminals</Link>.
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {allTerminals.map((t) => {
                    const checked = d.terminals.some((x) => x.id === t.id)
                    // Other devices this terminal is already on. When true and
                    // this row's checkbox is also ticked, that's the M:N case:
                    // the terminal routes to multiple devices and we'll round-
                    // robin between them on fiscalize. Surface that count as a
                    // small hint so the operator knows it's intentional.
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
                            also on {alsoOnCount} other
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
              <div className="mt-3 text-right">
                <button className="btn-brand text-xs">Save assignments</button>
              </div>
            </form>
          </li>
        ))}
      </ul>

      <form action={addFiscalDevice} className="card mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Add a device by hand</p>
          <p className="mt-1 text-xs text-neutral-500">
            Only for a device you already know the id of. Nothing checks that it exists or is
            licensed — prefer issuing one from RYCOS below.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" required placeholder="Counter fiscal" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="device_id">Device ID</label>
          <input id="device_id" name="device_id" required placeholder="SBR-A0S0UH" className="input" />
        </div>
        <div className="flex items-end">
          <button className="btn-brand">Save</button>
        </div>
      </form>

      <RycosSection pin={sp.pin} pinExpires={sp.pin_expires} />
    </div>
  )
}
