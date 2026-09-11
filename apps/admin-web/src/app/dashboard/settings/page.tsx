import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { updateCompany, saveFeatures, saveTaxRates, saveLanguages } from './actions'
import { FEATURE_KEYS, FEATURE_LABELS, BUSINESS_TYPES } from './constants'

interface Company {
  name: string; address: string; email: string; phone: string; country: string
  currency: string; business_type: string; default_language: string
  terms_and_conditions: string | null; privacy_policy: string | null
}
interface Setting { feature_key: string; is_enabled: boolean | string; config: unknown }
interface Gateway { gateway_name?: string; type?: string; public_key?: string }
interface Language { code: string; name: string; native_name: string }
interface CompanyLang { language_code: string }

const isOn = (v: boolean | string | undefined) => v === true || v === 'true' || v === 't'

function parseRates(config: unknown): number[] {
  try {
    const c = typeof config === 'string' ? JSON.parse(config) : config
    return Array.isArray((c as any)?.rates) ? (c as any).rates : []
  } catch { return [] }
}

export default async function SettingsPage() {
  if (!isManager(await currentUser())) return <NoAccess />
  const [company, settings, gateway, allLanguages, companyLanguages] = await Promise.all([
    adminApiData<Company>('/companies'),
    adminApiData<Setting[]>('/companies/settings'),
    adminApiData<Gateway>('/companies/payment-gateway'),
    adminApiData<Language[]>('/languages'),
    adminApiData<CompanyLang[]>('/companies/languages'),
  ])
  const enabledCodes = new Set((companyLanguages ?? []).map((r) => r.language_code))
  const settingMap = new Map((settings ?? []).map((s) => [s.feature_key, s]))
  const taxRates = parseRates(settingMap.get('tax_rates')?.config)
  const c = company ?? ({} as Company)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Company profile, languages, features, tax and payments.</p>
      </div>

      {/* Company details */}
      <form action={updateCompany} className="card space-y-3">
        <h2 className="text-base font-semibold">Company details</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="name" label="Company name" defaultValue={c.name} required />
          <Field name="email" label="Email" type="email" defaultValue={c.email} />
          <Field name="phone" label="Phone" defaultValue={c.phone} />
          <Field name="country" label="Country" defaultValue={c.country} />
          <Field name="currency" label="Currency" defaultValue={c.currency} />
          <div>
            <label className="label" htmlFor="business_type">Business type</label>
            <select id="business_type" name="business_type" defaultValue={c.business_type || 'product'} className="input">
              {BUSINESS_TYPES.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
            </select>
          </div>
        </div>
        <Field name="address" label="Address" defaultValue={c.address} />
        <Field name="default_language" label="Default language" defaultValue={c.default_language} placeholder="en" />
        {/* Active languages live in their own Languages section below — the
            legacy comma-separated column has been retired (see deferred-
            cleanups.md → drop companies.active_languages). */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="terms_and_conditions">Terms &amp; conditions</label>
            <textarea id="terms_and_conditions" name="terms_and_conditions" rows={3} defaultValue={c.terms_and_conditions ?? ''} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="privacy_policy">Privacy policy</label>
            <textarea id="privacy_policy" name="privacy_policy" rows={3} defaultValue={c.privacy_policy ?? ''} className="input" />
          </div>
        </div>
        <button className="btn-brand sm:w-auto sm:px-6">Save company details</button>
      </form>

      {/* Features */}
      {/* Languages — what your customers can switch the menu to. The company's
          default language is always enabled (can't be unchecked here). */}
      <form action={saveLanguages} className="card space-y-3">
        <h2 className="text-base font-semibold">Languages</h2>
        <p className="-mt-2 text-xs text-neutral-500">
          Pick which languages are available across your products, brands and customer ordering.
          Your default (<strong>{c.default_language?.toUpperCase()}</strong>) is always on.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {(allLanguages ?? []).map((l) => {
            const isDefault = l.code === c.default_language
            const isOnLang = isDefault || enabledCodes.has(l.code)
            return (
              <label
                key={l.code}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isOnLang ? 'border-brand bg-brand-50 text-brand-700' : 'border-neutral-300 text-neutral-700'} ${isDefault ? 'cursor-not-allowed opacity-80' : ''}`}
              >
                <input
                  type="checkbox"
                  name="lang"
                  value={l.code}
                  defaultChecked={isOnLang}
                  disabled={isDefault}
                  className="h-4 w-4 accent-brand"
                />
                <span className="font-medium">{l.native_name}</span>
                <span className="text-xs uppercase text-neutral-400">({l.code})</span>
              </label>
            )
          })}
        </div>
        <button className="btn-brand sm:w-auto sm:px-6">Save languages</button>
      </form>

      <form action={saveFeatures} className="card space-y-3">
        <h2 className="text-base font-semibold">Features</h2>
        <div className="space-y-2">
          {FEATURE_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={key} defaultChecked={isOn(settingMap.get(key)?.is_enabled)} />
              {FEATURE_LABELS[key] ?? key}
            </label>
          ))}
        </div>
        <button className="btn-brand sm:w-auto sm:px-6">Save features</button>
      </form>

      {/* Tax rates */}
      <form action={saveTaxRates} className="card space-y-3">
        <h2 className="text-base font-semibold">Tax rates</h2>
        <Field name="rates" label="Rates % (comma-separated)" defaultValue={taxRates.join(', ')} placeholder="0, 5, 8, 23" />
        <button className="btn-brand sm:w-auto sm:px-6">Save tax rates</button>
      </form>

      {/* Payment gateway (read-only) */}
      <div className="card space-y-1">
        <h2 className="text-base font-semibold">Payment gateway</h2>
        {gateway ? (
          <div className="text-sm text-neutral-600">
            <p><span className="text-neutral-400">Provider:</span> {gateway.gateway_name || gateway.type || '—'}</p>
            <p className="text-xs text-neutral-400">Gateway credentials are managed by YallaOrder. Contact support to change them.</p>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No payment gateway configured.</p>
        )}
      </div>
    </div>
  )
}

function Field({ name, label, defaultValue, type = 'text', required = false, placeholder }: {
  name: string; label: string; defaultValue?: string; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue ?? ''} className="input" />
    </div>
  )
}
