import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import { savePaymentGateway, deletePaymentGateway } from './actions'

interface PaymentGateway {
  id: number
  gateway_name: string
  type: string
  public_key: string | null
  private_key_set: boolean
  is_test?: boolean
  additional_data: { customer_id?: string | number; terminal_id?: string | number; is_test?: boolean } | null
}

export default async function PaymentGatewaysPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const locale = await getAdminLocale()
  const { error, notice } = await searchParams
  const gateways = (await adminApiData<PaymentGateway[]>('/payment-gateways')) ?? []
  const saferpay = gateways.find((g) => g.gateway_name === 'SaferPay') ?? null
  const isTestMode = saferpay ? (saferpay.is_test ?? saferpay.additional_data?.is_test ?? true) : true

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">{getTranslation(locale, 'gateways.title', 'Bramka płatności (Payment gateway)')}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {getTranslation(locale, 'gateways.subtitle', 'Podłącz bramkę płatniczą, aby klienci mogli opłacać zamówienia online (karty, Google Pay, BLIK).')}
      </p>

      {error && <Banner kind="error" className="mt-4">{error}</Banner>}
      {notice && <Banner kind="success" className="mt-4">{notice}</Banner>}

      {/* SaferPay card */}
      <div className="card mt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <WorldlineBadge />
            <div>
              <p className="text-base font-semibold">SaferPay (Worldline)</p>
              <p className="text-xs text-neutral-500">{getTranslation(locale, 'gateways.saferpay_desc', 'Karty płatnicze, Google Pay, Apple Pay, BLIK')}</p>
            </div>
          </div>
          {saferpay ? (
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                {getTranslation(locale, 'gateways.status_active', 'Aktywny')}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isTestMode ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {isTestMode ? getTranslation(locale, 'gateways.mode_sandbox', 'Sandbox / Test') : getTranslation(locale, 'gateways.mode_live', 'Produkcja / Live')}
              </span>
            </div>
          ) : (
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-500">
              {getTranslation(locale, 'gateways.status_unconfigured', 'Nieskonfigurowany')}
            </span>
          )}
        </div>

        <form action={savePaymentGateway} autoComplete="off" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="gateway_name" value="SaferPay" />
          {saferpay && <input type="hidden" name="id" value={saferpay.id} />}

          <div className="sm:col-span-2">
            <label className="label" htmlFor="public_key">{getTranslation(locale, 'gateways.api_user', 'API username')}</label>
            <input
              id="public_key"
              name="public_key"
              required
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-lpignore="true"
              defaultValue={saferpay?.public_key ?? ''}
              placeholder="np. API_278134_67182699"
              className="input"
            />
            <p className="mt-1 text-xs text-neutral-400">
              {getTranslation(locale, 'gateways.api_user_hint', 'Z panelu SaferPay → Settings → JSON API. Format: API_*_* (nie jest to Twój e-mail).')}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="private_key">{getTranslation(locale, 'gateways.api_password', 'API password')}</label>
            <input
              id="private_key"
              name="private_key"
              type="password"
              autoComplete="new-password"
              data-lpignore="true"
              required={!saferpay}
              placeholder={saferpay?.private_key_set ? getTranslation(locale, 'gateways.api_password_keep', '•••••••• (pozostaw puste, aby zachować obecne hasło)') : (locale === 'pl' ? 'Hasło wygenerowane dla użytkownika JSON API' : 'Password generated for JSON API user')}
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="customer_id">{getTranslation(locale, 'gateways.customer_id', 'CustomerId')}</label>
            <input
              id="customer_id"
              name="customer_id"
              required
              inputMode="numeric"
              autoComplete="off"
              defaultValue={String(saferpay?.additional_data?.customer_id ?? '')}
              placeholder="np. 278134"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="terminal_id">{getTranslation(locale, 'gateways.terminal_id', 'TerminalId')}</label>
            <input
              id="terminal_id"
              name="terminal_id"
              required
              inputMode="numeric"
              autoComplete="off"
              defaultValue={String(saferpay?.additional_data?.terminal_id ?? '')}
              placeholder="np. 17770988"
              className="input"
            />
          </div>

          <div className="sm:col-span-2 mt-1 rounded-lg border border-neutral-200 bg-neutral-50/70 p-3.5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="is_test"
                defaultChecked={isTestMode}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-neutral-800 text-sm block">
                  {getTranslation(locale, 'gateways.test_toggle', 'Środowisko testowe (Sandbox)')}
                </span>
                <span className="text-neutral-500 block mt-0.5">
                  {locale === 'pl'
                    ? <>Zaznaczone: zapytania kierowane są do środowiska testowego Saferpay (<code className="font-mono text-neutral-700">test.saferpay.com</code>).<br />Odznacz, gdy wprowadzasz docelowe dane produkcyjne (<code className="font-mono text-neutral-700">www.saferpay.com</code>).</>
                    : <>Checked: requests route to Saferpay sandbox (<code className="font-mono text-neutral-700">test.saferpay.com</code>).<br />Uncheck when using production credentials (<code className="font-mono text-neutral-700">www.saferpay.com</code>).</>}
                </span>
              </div>
            </label>
          </div>

          <div className="sm:col-span-2 flex items-center gap-3 pt-2">
            <button className="btn-brand sm:w-auto sm:px-6">
              {saferpay ? getTranslation(locale, 'btn.save', 'Zapisz zmiany') : (locale === 'pl' ? 'Zapisz poświadczenia' : 'Save credentials')}
            </button>
            {saferpay && (
              <form action={deletePaymentGateway}>
                <input type="hidden" name="id" value={saferpay.id} />
                <button className="text-sm font-medium text-red-600 hover:underline">
                  {getTranslation(locale, 'btn.delete', 'Usuń konfigurację')}
                </button>
              </form>
            )}
          </div>
        </form>
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        {locale === 'pl' ? 'Wkrótce kolejne bramki (Stripe, PayU...).' : 'More gateways (Stripe, PayU...) coming soon.'}
      </p>
    </div>
  )
}

function WorldlineBadge() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/worldline.jpg" alt="Worldline" className="h-14 w-14 rounded-lg object-contain" />
}

