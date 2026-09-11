import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { addUser, removeUser, updateUserRole } from './actions'

interface TeamUser {
  id: string
  email: string
  name: string
  role: string
  created_at: string
  last_sign_in_at: string | null
}

const ROLES = ['super_admin', 'admin', 'staff']
const roleLabel = (r: string) => ({ super_admin: 'Owner', admin: 'Admin', staff: 'Staff' }[r] || r)
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : '—')

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  if (!isManager(await currentUser())) return <NoAccess />
  const { error, notice } = await searchParams
  const users = (await adminApiData<TeamUser[]>('/team')) ?? []

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">Users</h1>
      <p className="mt-1 text-sm text-neutral-500">Manage who can access your company admin.</p>
      {error && <Banner kind="error" className="mt-4">{error}</Banner>}
      {notice && <Banner kind="success" className="mt-4">{notice}</Banner>}

      <div className="card mt-6 overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Last sign-in</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">No users yet.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium">{u.email}</td>
                <td className="px-4 py-3 text-neutral-600">{u.name || '—'}</td>
                <td className="px-4 py-3">
                  <form action={updateUserRole} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <select name="role" defaultValue={u.role} className="rounded border border-neutral-300 px-2 py-1 text-xs">
                      {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </select>
                    <button className="text-xs font-medium text-brand hover:underline">Save</button>
                  </form>
                </td>
                <td className="px-4 py-3 text-neutral-500">{fmtDate(u.last_sign_in_at)}</td>
                <td className="px-4 py-3 text-right">
                  <form action={removeUser}>
                    <input type="hidden" name="id" value={u.id} />
                    <button className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt-6">
        <h2 className="text-base font-semibold">Add a user</h2>
        <form action={addUser} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Temporary password</label>
            <input id="password" name="password" type="text" required minLength={6} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="role">Role</label>
            <select id="role" name="role" defaultValue="staff" className="input">
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button className="btn-brand sm:w-auto sm:px-6">Add user</button>
          </div>
        </form>
      </div>
    </div>
  )
}
