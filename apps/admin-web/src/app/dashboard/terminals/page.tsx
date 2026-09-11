import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { createTerminal, logoutTerminal } from './actions'

interface Terminal {
  id: number; terminal_id: string; name: string; status: string
  location_id: number | null; location_name: string | null; last_active: string | null
}
interface Location { id: number; name: string }

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : '—')
const statusBadge: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  unclaimed: 'bg-amber-50 text-amber-700',
  inactive: 'bg-neutral-100 text-neutral-500',
}

export default async function TerminalsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  if (!isManager(await currentUser())) return <NoAccess />
  const { error, notice } = await searchParams
  const [terminals, locations] = await Promise.all([
    adminApiData<Terminal[]>('/terminals'),
    adminApiData<Location[]>('/locations'),
  ])

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">POS terminals</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Create a terminal to get a setup code, then pair it once on the device. The
        primary fiscalizer is the single terminal that fiscalizes each transaction.
      </p>
      {error && <Banner kind="error" className="mt-4">{error}</Banner>}
      {notice && <Banner kind="success" className="mt-4">{notice}</Banner>}

      <div className="card mt-6 overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-3">Terminal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Last active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {(terminals ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">No terminals yet.</td></tr>
            )}
            {(terminals ?? []).map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/terminals/${t.id}`} className="font-medium hover:text-brand">{t.name}</Link>
                  {t.status === 'unclaimed' && <span className="ml-2 font-mono text-xs text-neutral-400">code {t.terminal_id}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge[t.status] ?? 'bg-neutral-100 text-neutral-500'}`}>{t.status}</span>
                </td>
                <td className="px-4 py-3 text-neutral-600">{t.location_name ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-500">{t.status === 'unclaimed' ? '— not paired —' : fmt(t.last_active)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {/* Sign out the device for any paired terminal — including a
                        deactivated one whose device is still running. */}
                    {t.status !== 'unclaimed' && (
                      <form action={logoutTerminal}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className="text-xs font-medium text-neutral-500 hover:text-red-600 hover:underline">Log out</button>
                      </form>
                    )}
                    <Link href={`/dashboard/terminals/${t.id}`} className="text-xs font-medium text-brand hover:underline">
                      {t.status === 'unclaimed' ? 'Setup' : 'Edit'}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt-6">
        <h2 className="text-base font-semibold">Add terminal</h2>
        <form action={createTerminal} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" required placeholder="Till 1" className="input" />
          </div>
          <div className="sm:col-span-1">
            <label className="label" htmlFor="location_id">Location</label>
            <select id="location_id" name="location_id" className="input">
              <option value="">— none —</option>
              {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <Link href="/dashboard/locations" className="mt-1 inline-block text-xs font-medium text-brand hover:underline">
              {(locations ?? []).length === 0 ? 'No locations yet — add one ↗' : 'Manage locations ↗'}
            </Link>
          </div>
          <div className="flex items-end">
            <button className="btn-brand">Create &amp; get code</button>
          </div>
        </form>
      </div>
    </div>
  )
}
