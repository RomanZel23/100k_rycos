import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import { addUser, removeUser, updateUserRole } from './actions'

interface TeamUser {
  id: string
  email: string
  name: string
  role: string
  created_at?: string
  createdAt?: string
  last_sign_in_at?: string | null
  lastSignInAt?: string | null
  is_active?: boolean
  isActive?: boolean
}

const ROLES = ['super_admin', 'admin', 'manager', 'staff', 'kitchen']

const roleBadge: Record<string, string> = {
  super_admin: 'bg-purple-50 text-purple-700 border-purple-200',
  admin: 'bg-blue-50 text-techbay-blue border-blue-200',
  manager: 'bg-amber-50 text-amber-800 border-amber-200',
  staff: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  kitchen: 'bg-orange-50 text-orange-800 border-orange-200',
}

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : '—')

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const user = await currentUser()
  if (!isManager(user)) return <NoAccess />
  const locale = await getAdminLocale()
  const { error, notice } = await searchParams
  const users = (await adminApiData<TeamUser[]>('/team')) ?? []

  const currentEmail = (user?.email || '').toLowerCase()
  const currentId = user?.id || ''

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-techbay-blue">
          {getTranslation(locale, 'users.title', 'Użytkownicy i uprawnienia')}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {getTranslation(
            locale,
            'users.subtitle',
            'Zarządzaj osobami mającymi dostęp do panelu administracyjnego firmy oraz stanowisk sprzedaży.'
          )}
        </p>
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {/* Tabela użytkowników */}
      <div className="card overflow-hidden p-0 shadow-xs">
        <div className="border-b border-neutral-100 bg-neutral-50/70 px-5 py-3.5 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            {getTranslation(locale, 'users.title', 'Lista użytkowników')} ({users.length})
          </span>
          <span className="text-xs font-medium text-neutral-400">
            100K-RYCOS Access Control
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="px-5 py-3">{getTranslation(locale, 'users.table.email', 'Adres e-mail')}</th>
                <th className="px-5 py-3">{getTranslation(locale, 'users.table.name', 'Imię i nazwisko')}</th>
                <th className="px-5 py-3">{getTranslation(locale, 'users.table.role', 'Rola')}</th>
                <th className="px-5 py-3">{getTranslation(locale, 'users.table.last_signin', 'Ostatnia aktywność')}</th>
                <th className="px-5 py-3 text-right">{getTranslation(locale, 'users.table.actions', 'Akcje')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-neutral-400">
                    {getTranslation(locale, 'users.table.empty', 'Brak użytkowników.')}
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const isMe = Boolean((currentId && u.id === currentId) || (currentEmail && u.email?.toLowerCase() === currentEmail))
                const roleKey = `users.role.${u.role}`
                const roleName = getTranslation(locale, roleKey, u.role)
                const badgeClass = roleBadge[u.role] || 'bg-neutral-100 text-neutral-700 border-neutral-200'
                const activityDate = u.last_sign_in_at || u.lastSignInAt || u.created_at || u.createdAt

                return (
                  <tr key={u.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-800">{u.email}</span>
                        {isMe && (
                          <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                            {getTranslation(locale, 'users.you', '(Ty)')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-neutral-600">
                      {u.name || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <form action={updateUserRole} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          disabled={isMe && u.role === 'super_admin'}
                          className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-neutral-100 disabled:cursor-not-allowed"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {getTranslation(locale, `users.role.${r}`, r)}
                            </option>
                          ))}
                        </select>
                        {(!isMe || u.role !== 'super_admin') && (
                          <button
                            type="submit"
                            className="text-xs font-semibold text-brand hover:underline"
                          >
                            {getTranslation(locale, 'users.save', 'Zapisz')}
                          </button>
                        )}
                        <span
                          className={`hidden sm:inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}
                        >
                          {roleName}
                        </span>
                      </form>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-neutral-500">
                      {fmtDate(activityDate)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {isMe ? (
                        <span className="text-xs text-neutral-400 italic">Aktywne konto</span>
                      ) : (
                        <form action={removeUser}>
                          <input type="hidden" name="id" value={u.id} />
                          <button
                            type="submit"
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:underline transition-colors"
                          >
                            {getTranslation(locale, 'users.remove', 'Usuń')}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formularz dodawania użytkownika */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-base font-bold text-techbay-blue">
            {getTranslation(locale, 'users.add.title', 'Dodaj nowego użytkownika')}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {getTranslation(locale, 'users.add.subtitle', 'Utwórz konto pracownika, kelnera lub kierownika.')}
          </p>
        </div>

        <form action={addUser} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="email">
              {getTranslation(locale, 'users.add.email', 'Adres e-mail')} *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="np. kelner@twojafirma.pl"
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="name">
              {getTranslation(locale, 'users.add.name', 'Imię i nazwisko')}
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="np. Jan Kowalski"
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              {getTranslation(locale, 'users.add.password', 'Tymczasowe hasło')} *
            </label>
            <input
              id="password"
              name="password"
              type="text"
              required
              minLength={6}
              placeholder="Minimum 6 znaków"
              className="input font-mono"
            />
          </div>

          <div>
            <label className="label" htmlFor="role">
              {getTranslation(locale, 'users.add.role', 'Przypisana rola')}
            </label>
            <select id="role" name="role" defaultValue="staff" className="input">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {getTranslation(locale, `users.role.${r}`, r)}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 pt-2">
            <button type="submit" className="btn-brand sm:w-auto sm:px-6">
              {getTranslation(locale, 'users.add.submit', 'Dodaj użytkownika')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
