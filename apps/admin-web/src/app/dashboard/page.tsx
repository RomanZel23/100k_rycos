import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { ackSingleLocation, ackTeamOnly, setAcceptingOrders } from './actions'

interface Company {
  id: number; name: string; email: string; country: string
  currency: string; business_type: string; is_accepting_orders: boolean
}
interface Setting { feature_key: string; is_enabled: boolean | string }
interface Terminal { id: number; status: string; is_primary?: boolean | string }
interface FiscalDevice { id: number; status: string }
const isOn = (v: boolean | string | undefined) => v === true || v === 'true' || v === 't'

export default async function DashboardPage() {
  const manager = isManager(await currentUser())
  const company = await adminApiData<Company>('/companies')

  // Onboarding checklist data (managers only).
  let steps: { key: string; label: string; hint: string; href: string; done: boolean }[] = []
  let warnings: { key: string; title: string; body: string; href: string; cta: string }[] = []
  let locationsAcked = false
  let teamAcked = false
  if (manager) {
    const [brands, locations, terminals, fiscal, products, team, settings, gateways] = await Promise.all([
      adminApiData<unknown[]>('/brands'),
      adminApiData<unknown[]>('/locations'),
      adminApiData<Terminal[]>('/terminals'),
      // /fiscal-devices returns { devices, unassigned } since the multi-terminal
      // refactor — peel devices off so the rest of the page keeps working.
      adminApiData<{ devices: FiscalDevice[]; unassigned: unknown[] }>('/fiscal-devices'),
      adminApiData<unknown[]>('/products'),
      adminApiData<unknown[]>('/team'),
      adminApiData<Setting[]>('/companies/settings'),
      adminApiData<unknown[]>('/payment-gateways'),
    ])
    const len = (a: unknown[] | null) => (Array.isArray(a) ? a.length : 0)
    const terminalList = Array.isArray(terminals) ? terminals : []
    const fiscalList: FiscalDevice[] = fiscal?.devices ?? []
    const activeTerminals = terminalList.filter((t) => t.status === 'active')
    const activeFiscal = fiscalList.filter((f) => f.status === 'active')
    // Primary fiscalizer is now a property of the fiscal device, not the
    // terminal. The flag is exclusive per company (DB partial unique index).
    const hasPrimary = fiscalList.some((f) => isOn((f as FiscalDevice & { is_primary: boolean }).is_primary))
    locationsAcked = (settings ?? []).some((s) => s.feature_key === 'onboarding_locations_ack' && isOn(s.is_enabled))
    teamAcked = (settings ?? []).some((s) => s.feature_key === 'onboarding_team_ack' && isOn(s.is_enabled))
    steps = [
      { key: 'brand', label: 'Create your first brand', hint: 'A customer ordering entry point (its own QR & menu).', href: '/dashboard/brands', done: len(brands) > 0 },
      { key: 'location', label: 'Set up locations', hint: 'Branches or floors — or confirm you run a single location.', href: '/dashboard/locations', done: len(locations) > 0 || locationsAcked },
      { key: 'terminal', label: 'Add a POS terminal', hint: 'Create one, then pair the device so it becomes active.', href: '/dashboard/terminals', done: activeTerminals.length > 0 },
      { key: 'fiscal', label: 'Add a fiscal device', hint: 'Required to fiscalize sales (Poland). Keep at least one active.', href: '/dashboard/fiscal-devices', done: activeFiscal.length > 0 },
      { key: 'gateway', label: 'Connect a payment gateway', hint: 'So customers can pay.', href: '/dashboard/payment-gateways', done: len(gateways) > 0 },
      { key: 'product', label: 'Add a product', hint: 'Build your menu.', href: '/dashboard/products', done: len(products) > 0 },
      // The owner already counts as a member, so require either a teammate (>1)
      // or an explicit "just me" acknowledgement — otherwise the step is a no-op.
      { key: 'user', label: 'Invite your team', hint: 'Add staff or managers — or confirm it’s just you.', href: '/dashboard/users', done: len(team) > 1 || teamAcked },
    ]

    // Health warnings — surfaced once onboarding is complete (or anything regresses).
    // Each issue gets its own box.
    if (len(products) === 0)
      warnings.push({ key: 'no-products', title: 'No products', body: 'Your company has no products. Customers won’t see anything to order — please add at least one.', href: '/dashboard/products', cta: 'Add a product' })
    if (activeTerminals.length === 0)
      warnings.push({ key: 'no-active-terminal', title: 'No active POS terminal', body: terminalList.length > 0 ? 'You have a terminal but it isn’t active. Pair the device to start taking orders.' : 'You have no POS terminal. Add one and pair the device to take orders.', href: '/dashboard/terminals', cta: 'Manage terminals' })
    if (activeFiscal.length === 0)
      warnings.push({ key: 'no-active-fiscal', title: 'No active fiscal device', body: fiscalList.length > 0 ? 'You have a fiscal device but none is active. Activate one to fiscalize sales.' : 'No fiscal device is set up. Sales can’t be fiscalized until you add one (required in Poland).', href: '/dashboard/fiscal-devices', cta: 'Manage fiscal devices' })
    if (activeFiscal.length > 0 && !hasPrimary)
      warnings.push({ key: 'no-primary', title: 'No primary fiscalizer', body: 'No fiscal device is set as the primary fiscalizer. Orders routed to terminals without a fiscal device have nowhere to fiscalize — pick one device as the safety net.', href: '/dashboard/fiscal-devices', cta: 'Set primary' })
    if (len(gateways) === 0)
      warnings.push({ key: 'no-gateway', title: 'No payment gateway', body: 'Customers can’t pay until you connect a payment gateway. SaferPay (Worldline) is supported today.', href: '/dashboard/payment-gateways', cta: 'Connect SaferPay' })
  }
  const doneCount = steps.filter((s) => s.done).length
  const allDone = steps.length > 0 && doneCount === steps.length

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">Overview</h1>
      <p className="mt-1 text-sm text-neutral-500">Your company at a glance.</p>

      {/* Onboarding checklist */}
      {manager && !allDone && (
        <div className="card mt-6 border-brand/30">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Finish setting up</h2>
            <span className="text-sm text-neutral-500">{doneCount} of {steps.length} done</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-brand" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ul className="mt-4 space-y-2">
            {steps.map((s) => (
              <li key={s.key} className="flex items-center gap-3">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${s.done ? 'bg-green-500 text-white' : 'border border-neutral-300 text-neutral-400'}`}>
                  {s.done ? '✓' : ''}
                </span>
                <span className="flex-1">
                  <span className={`text-sm font-medium ${s.done ? 'text-neutral-400 line-through' : ''}`}>{s.label}</span>
                  {!s.done && <span className="ml-2 text-xs text-neutral-400">{s.hint}</span>}
                </span>
                {!s.done && (
                  <span className="flex shrink-0 items-center gap-3">
                    <Link href={s.href} className="text-xs font-semibold text-brand hover:underline">Set up →</Link>
                    {s.key === 'location' && (
                      <form action={ackSingleLocation}>
                        <button className="text-xs text-neutral-400 hover:underline">Single location</button>
                      </form>
                    )}
                    {s.key === 'user' && (
                      <form action={ackTeamOnly}>
                        <button className="text-xs text-neutral-400 hover:underline">Just me</button>
                      </form>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Health warnings — once setup is complete, flag anything that drifts out of shape. */}
      {manager && allDone && warnings.map((w) => (
        <div key={w.key} className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-amber-900">{w.title}</h3>
              <p className="mt-0.5 text-sm text-amber-800">{w.body}</p>
            </div>
            <Link href={w.href} className="shrink-0 whitespace-nowrap text-xs font-semibold text-amber-900 hover:underline">{w.cta} →</Link>
          </div>
        </div>
      ))}

      {!company ? (
        <div className="card mt-6 text-sm text-neutral-500">Couldn’t load your company details. Please try again shortly.</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="card sm:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{company.name}</h2>
                <p className="text-sm text-neutral-500">{company.email}</p>
              </div>
              {manager ? (
                <form action={setAcceptingOrders} className="flex items-center gap-3">
                  <input type="hidden" name="next" value={(!company.is_accepting_orders).toString()} />
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${company.is_accepting_orders ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {company.is_accepting_orders ? 'Accepting orders' : 'Paused'}
                  </span>
                  <button
                    type="submit"
                    aria-label="Toggle accepting orders"
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${company.is_accepting_orders ? 'bg-brand' : 'bg-neutral-300'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${company.is_accepting_orders ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </form>
              ) : (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${company.is_accepting_orders ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
                  {company.is_accepting_orders ? 'Accepting orders' : 'Paused'}
                </span>
              )}
            </div>
          </div>
          <Stat label="Country" value={company.country || '—'} />
          <Stat label="Currency" value={company.currency || '—'} />
          <Stat label="Business type" value={company.business_type || '—'} />
          <Stat label="Company ID" value={String(company.id)} />
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}
