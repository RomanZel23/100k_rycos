import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { savePaymentGateway, deletePaymentGateway } from './actions'

interface PaymentGateway {
  id: number
  gateway_name: string
  type: string
  public_key: string | null
  private_key_set: boolean
  additional_data: { customer_id?: string | number; terminal_id?: string | number } | null
}

export default async function PaymentGatewaysPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const { error, notice } = await searchParams
  const gateways = (await adminApiData<PaymentGateway[]>('/payment-gateways')) ?? []
  const saferpay = gateways.find((g) => g.gateway_name === 'SaferPay') ?? null

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Payment gateway</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Connect a payment processor so customers can pay through the order page. More gateways will be added — for now we support SaferPay (Worldline).
      </p>

      {error && <Banner kind="error" className="mt-4">{error}</Banner>}
      {notice && <Banner kind="success" className="mt-4">{notice}</Banner>}

      {/* SaferPay card */}
      <div className="card mt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <WorldlineBadge />
            <div>
              <p className="text-base font-semibold">SaferPay</p>
              <p className="text-xs text-neutral-500">cards, Google Pay, BLIK</p>
            </div>
          </div>
          {saferpay ? (
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">Active</span>
          ) : (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">Not configured</span>
          )}
        </div>

        <form action={savePaymentGateway} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="gateway_name" value="SaferPay" />
          {saferpay && <input type="hidden" name="id" value={saferpay.id} />}

          <div className="sm:col-span-2">
            <label className="label" htmlFor="public_key">API username</label>
            <input
              id="public_key"
              name="public_key"
              required
              defaultValue={saferpay?.public_key ?? ''}
              placeholder="API_278134_67182699"
              className="input"
            />
            <p className="mt-1 text-xs text-neutral-400">
              From the SaferPay backoffice → Settings → JSON API. Looks like <span className="font-mono">API_*_*</span>.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="private_key">API password</label>
            <input
              id="private_key"
              name="private_key"
              type="password"
              required={!saferpay}
              placeholder={saferpay?.private_key_set ? '•••••••• (leave blank to keep current)' : 'API password'}
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="customer_id">CustomerId</label>
            <input
              id="customer_id"
              name="customer_id"
              required
              inputMode="numeric"
              defaultValue={String(saferpay?.additional_data?.customer_id ?? '')}
              placeholder="278134"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="terminal_id">TerminalId</label>
            <input
              id="terminal_id"
              name="terminal_id"
              required
              inputMode="numeric"
              defaultValue={String(saferpay?.additional_data?.terminal_id ?? '')}
              placeholder="17770988"
              className="input"
            />
          </div>

          <div className="sm:col-span-2 flex items-center gap-3 pt-2">
            <button className="btn-brand sm:w-auto sm:px-6">{saferpay ? 'Update credentials' : 'Save credentials'}</button>
            {saferpay && (
              <form action={deletePaymentGateway}>
                <input type="hidden" name="id" value={saferpay.id} />
                <button className="text-sm font-medium text-red-600 hover:underline">Remove</button>
              </form>
            )}
          </div>
        </form>
      </div>

      {/* Coming-soon stubs so the path is obvious to the owner. */}
      <p className="mt-6 text-xs text-neutral-400">More gateways (Stripe, PayU, …) coming as they're integrated.</p>
    </div>
  )
}

// Worldline wordmark — served from /public/worldline.jpg.
function WorldlineBadge() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/worldline.jpg" alt="Worldline" className="h-14 w-14 rounded-lg object-contain" />
}
