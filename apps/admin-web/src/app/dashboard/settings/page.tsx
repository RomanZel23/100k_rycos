import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { updateCompany, saveFeatures, saveTaxRates, saveLanguages } from './actions'
import { FEATURE_KEYS, FEATURE_LABELS, BUSINESS_TYPES } from './constants'

import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'

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

const FALLBACK_LANGUAGES: Language[] = [
  { code: 'pl', name: 'Polish', native_name: 'Polski' },
  { code: 'en', name: 'English', native_name: 'English' },
  { code: 'de', name: 'German', native_name: 'Deutsch' },
]

const LANG_FLAGS: Record<string, string> = {
  pl: '🇵🇱',
  en: '🇬🇧',
  de: '🇩🇪',
}

function parseRates(config: unknown): number[] {
  try {
    const c = typeof config === 'string' ? JSON.parse(config) : config
    return Array.isArray((c as any)?.rates) ? (c as any).rates : []
  } catch { return [] }
}

export default async function SettingsPage() {
  if (!isManager(await currentUser())) return <NoAccess />
  const locale = await getAdminLocale()
  const [company, settings, gateway, allLanguages, companyLanguages] = await Promise.all([
    adminApiData<Company>('/companies'),
    adminApiData<Setting[]>('/companies/settings'),
    adminApiData<Gateway>('/companies/payment-gateway'),
    adminApiData<Language[]>('/languages'),
    adminApiData<CompanyLang[]>('/companies/languages'),
  ])

  const languagesList = allLanguages && allLanguages.length > 0 ? allLanguages : FALLBACK_LANGUAGES
  const rawCodes = (companyLanguages ?? []).map((r: any) => (typeof r === 'string' ? r : r?.language_code || ''))
  const enabledCodes = new Set(rawCodes.length > 0 ? rawCodes : ['pl', 'en', 'de'])
  const settingMap = new Map((settings ?? []).map((s) => [s.feature_key, s]))
  const taxRates = parseRates(settingMap.get('tax_rates')?.config)
  const c = company ?? ({} as Company)
  const currentDefault = (c.default_language || 'pl').toLowerCase()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-techbay-blue">{getTranslation(locale, 'settings.title', 'Settings')}</h1>
        <p className="mt-1 text-sm text-neutral-500">{getTranslation(locale, 'settings.subtitle', 'Company profile, languages, features, tax and payments.')}</p>
      </div>

      {/* Company details */}
      <form action={updateCompany} className="card space-y-4">
        <h2 className="text-base font-bold text-techbay-blue">{getTranslation(locale, 'settings.company_details', 'Company details')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="name" label={getTranslation(locale, 'settings.company_name', 'Company name')} defaultValue={c.name} required />
          <Field name="email" label={getTranslation(locale, 'settings.email', 'Email')} type="email" defaultValue={c.email} />
          <Field name="phone" label={getTranslation(locale, 'settings.phone', 'Phone')} defaultValue={c.phone} />
          <Field name="country" label={getTranslation(locale, 'settings.country', 'Country')} defaultValue={c.country} />
          <Field name="currency" label={getTranslation(locale, 'settings.currency', 'Currency')} defaultValue={c.currency} />
          <div>
            <label className="label" htmlFor="business_type">{getTranslation(locale, 'settings.business_type', 'Business type')}</label>
            <select id="business_type" name="business_type" defaultValue={c.business_type || 'product'} className="input">
              {BUSINESS_TYPES.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
            </select>
          </div>
        </div>
        <Field name="address" label={getTranslation(locale, 'settings.address', 'Address')} defaultValue={c.address} />

        {/* Default Language Selector */}
        <div>
          <label className="label" htmlFor="default_language">{getTranslation(locale, 'settings.default_language', 'Default language')}</label>
          <select id="default_language" name="default_language" defaultValue={currentDefault} className="input">
            <option value="pl">🇵🇱 Polski (PL)</option>
            <option value="en">🇬🇧 English (EN)</option>
            <option value="de">🇩🇪 Deutsch (DE)</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="terms_and_conditions">{getTranslation(locale, 'settings.terms', 'Terms & conditions')}</label>
            <textarea id="terms_and_conditions" name="terms_and_conditions" rows={3} defaultValue={c.terms_and_conditions ?? ''} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="privacy_policy">{getTranslation(locale, 'settings.privacy', 'Privacy policy')}</label>
            <textarea id="privacy_policy" name="privacy_policy" rows={3} defaultValue={c.privacy_policy ?? ''} className="input" />
          </div>
        </div>
        <button className="btn-brand sm:w-auto sm:px-6">{getTranslation(locale, 'settings.save_company', 'Save company details')}</button>
      </form>

      {/* Languages Checklist */}
      <form action={saveLanguages} className="card space-y-4">
        <div>
          <h2 className="text-base font-bold text-techbay-blue">{getTranslation(locale, 'settings.languages', 'Languages')}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {getTranslation(locale, 'settings.languages_desc', 'Pick which languages are available across your products, brands and customer ordering.')}{' '}
            <span>
              {locale === 'pl' ? 'Język domyślny' : 'Default'}: (<strong>{currentDefault.toUpperCase()}</strong>) {locale === 'pl' ? 'jest zawsze aktywny.' : 'is always active.'}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {languagesList.map((l) => {
            const isDefault = l.code === currentDefault
            const isOnLang = isDefault || enabledCodes.has(l.code)
            const flag = LANG_FLAGS[l.code] || '🌐'

            return (
              <label
                key={l.code}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition-all ${
                  isOnLang
                    ? 'border-techbay-blue bg-techbay-blue/5 text-techbay-blue shadow-xs font-semibold'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                } ${isDefault ? 'cursor-not-allowed opacity-90' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    name="lang"
                    value={l.code}
                    defaultChecked={isOnLang}
                    disabled={isDefault}
                    className="h-4 w-4 rounded accent-brand"
                  />
                  <span className="text-lg">{flag}</span>
                  <div>
                    <span className="block text-sm font-semibold">{l.native_name}</span>
                    <span className="block text-[11px] uppercase tracking-wider text-neutral-400 font-normal">({l.code})</span>
                  </div>
                </div>
                {isDefault && (
                  <span className="rounded-full bg-techbay-blue px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                    {locale === 'pl' ? 'Domyślny' : 'Default'}
                  </span>
                )}
              </label>
            )
          })}
        </div>

        <button className="btn-brand sm:w-auto sm:px-6">{getTranslation(locale, 'settings.save_languages', 'Save languages')}</button>
      </form>

      <form action={saveFeatures} className="card space-y-3">
        <h2 className="text-base font-bold text-techbay-blue">{getTranslation(locale, 'settings.features', 'Features')}</h2>
        <div className="space-y-2">
          {FEATURE_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" name={key} defaultChecked={isOn(settingMap.get(key)?.is_enabled)} className="rounded accent-brand" />
              {FEATURE_LABELS[key] ?? key}
            </label>
          ))}
        </div>
        <button className="btn-brand sm:w-auto sm:px-6">{getTranslation(locale, 'settings.save_features', 'Save features')}</button>
      </form>

      {/* Tax rates */}
      <form action={saveTaxRates} className="card space-y-3">
        <h2 className="text-base font-bold text-techbay-blue">{getTranslation(locale, 'settings.tax_rates', 'Tax rates')}</h2>
        <Field name="rates" label="Rates % (comma-separated)" defaultValue={taxRates.join(', ')} placeholder="0, 5, 8, 23" />
        <button className="btn-brand sm:w-auto sm:px-6">{getTranslation(locale, 'settings.save_tax', 'Save tax rates')}</button>
      </form>

      {/* Payment gateway (read-only) */}
      <div className="card space-y-1">
        <h2 className="text-base font-bold text-techbay-blue">{getTranslation(locale, 'settings.payment_gateway', 'Payment gateway')}</h2>
        {gateway ? (
          <div className="text-sm text-neutral-600">
            <p><span className="text-neutral-400">Provider:</span> {gateway.gateway_name || gateway.type || '—'}</p>
            <p className="text-xs text-neutral-400">Gateway credentials are managed by 100k-RYCOS. Contact support to change them.</p>
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
