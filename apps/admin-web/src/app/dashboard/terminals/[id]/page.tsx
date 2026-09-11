import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { updateTerminal, deleteTerminal, archiveTerminal } from '../actions'

interface Terminal {
  id: number; terminal_id: string; name: string; status: string
  location_id: number | null
  tap_device_id: string | null; printer_device_id: string | null
}
interface Location { id: number; name: string }

export default async function TerminalEditPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isManager(await currentUser())) return <NoAccess />
  const { id } = await params
  // Fiscal device assignment used to live on this page but moved to
  // /dashboard/fiscal-devices when the model became M:N (one terminal can
  // route to several devices for round-robin fiscalization).
  const [terminals, locations] = await Promise.all([
    adminApiData<Terminal[]>('/terminals'),
    adminApiData<Location[]>('/locations'),
  ])
  const terminal = (terminals ?? []).find((t) => String(t.id) === id)
  if (!terminal) notFound()
  const unclaimed = terminal.status === 'unclaimed'
  const editable = terminal.status === 'active' || terminal.status === 'unclaimed'
  const qr = unclaimed ? await QRCode.toDataURL(terminal.terminal_id, { width: 180, margin: 1 }) : null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/dashboard/terminals" className="text-sm text-neutral-500 hover:text-brand">&larr; Terminals</Link>
        <h1 className="mt-2 text-2xl font-bold">{terminal.name}</h1>
      </div>

      {/* Setup code / QR — shown ONCE, only while the terminal is unclaimed. */}
      {unclaimed ? (
        <div className="card flex flex-wrap items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr!} alt="Setup QR" className="h-44 w-44 rounded border border-neutral-200" />
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Setup code</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-widest">{terminal.terminal_id}</p>
            <p className="mt-2 max-w-xs text-xs text-neutral-500">
              On the new device, open the vendor app → POS setup and enter or scan this code.
              It can only be used once.
            </p>
          </div>
        </div>
      ) : (
        <div className="card text-sm text-neutral-500">
          This terminal is <span className="font-semibold">{terminal.status}</span>. The setup code is no longer
          available. If the device broke, deactivate this terminal and create a new one.
        </div>
      )}

      {/* Details — only for live terminals; a deactivated one can only be archived. */}
      {editable && (
      <form action={updateTerminal} className="card space-y-3">
        <input type="hidden" name="id" value={terminal.id} />
        <h2 className="text-base font-semibold">Details</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" required defaultValue={terminal.name} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="location_id">Location</label>
            <select id="location_id" name="location_id" defaultValue={terminal.location_id ?? ''} className="input">
              <option value="">— none —</option>
              {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <h3 className="pt-2 text-sm font-semibold text-neutral-600">Peripherals</h3>
        <p className="text-xs text-neutral-500">
          Fiscal device assignment moved to <Link href="/dashboard/fiscal-devices" className="text-brand hover:underline">Fiscal devices</Link> —
          a terminal can route to several devices for round-robin fiscalization.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="tap_device_id">Tap device ID</label>
            <input id="tap_device_id" name="tap_device_id" defaultValue={terminal.tap_device_id ?? ''} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="printer_device_id">Printer device ID</label>
            <input id="printer_device_id" name="printer_device_id" defaultValue={terminal.printer_device_id ?? ''} className="input" />
          </div>
        </div>
        <button className="btn-brand sm:w-auto sm:px-6">Save</button>
      </form>
      )}

      <div className="flex items-center justify-end gap-4">
        {editable ? (
          <form action={deleteTerminal}>
            <input type="hidden" name="id" value={terminal.id} />
            <button className="text-sm font-medium text-red-600 hover:underline">Deactivate terminal</button>
          </form>
        ) : (
          <form action={archiveTerminal}>
            <input type="hidden" name="id" value={terminal.id} />
            <button className="text-sm font-medium text-neutral-500 hover:underline">Archive</button>
          </form>
        )}
      </div>
    </div>
  )
}
