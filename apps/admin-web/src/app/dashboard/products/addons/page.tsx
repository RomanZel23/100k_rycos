import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { AddonGroupTranslationTabs } from '@/components/AddonGroupTranslationTabs'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import { createGroup, updateGroup, deleteGroup, createOption, updateOption, deleteOption, saveGroupTranslations } from './actions'

interface AddonOption {
  id: number
  name: string
  price_delta: string | number
  position: number
  is_available: boolean
  stock_quantity: number | null
}
interface AddonGroup {
  id: number
  name: string
  selection_mode: 'single' | 'multi'
  required: boolean
  min_select: number
  max_select: number | null
  position: number
  options: AddonOption[]
}

const fmtDelta = (v: string | number) => {
  const n = typeof v === 'number' ? v : parseFloat(v)
  if (!Number.isFinite(n)) return '0.00'
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2)
}

interface Company { default_language: string }
interface CompanyLang { language_code: string }

interface GroupTranslations {
  translations: Record<string, { group_name?: string; options?: Record<string, string> }>
}

export default async function AddonsPage({ searchParams }: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  if (!isManager(await currentUser())) return <NoAccess />
  const locale = await getAdminLocale()
  const { error, notice } = await searchParams
  const [groups, company, companyLangs] = await Promise.all([
    adminApiData<AddonGroup[]>('/addon-groups'),
    adminApiData<Company>('/companies'),
    adminApiData<CompanyLang[]>('/companies/languages'),
  ])
  const groupsList = groups ?? []
  const defaultLang = company?.default_language ?? 'pl'
  const enabledLanguages = (companyLangs ?? [])
    .map((r) => r.language_code)
    .filter((l) => l && l !== defaultLang)

  const groupTranslations: Record<number, GroupTranslations['translations']> = {}
  if (enabledLanguages.length > 0 && groupsList.length > 0) {
    const results = await Promise.all(
      groupsList.map((g) => adminApiData<GroupTranslations>(`/addon-groups/${g.id}/translations`)),
    )
    for (let i = 0; i < groupsList.length; i++) {
      groupTranslations[groupsList[i].id] = results[i]?.translations ?? {}
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/products" className="text-sm text-neutral-500 hover:text-brand">&larr; {getTranslation(locale, 'products.title', 'Products')}</Link>
      <h1 className="mt-2 text-2xl font-bold">{getTranslation(locale, 'addons.title', 'Add-ons')}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {getTranslation(locale, 'addons.subtitle', 'Groups of choices that customers pick when ordering a product — sizes, toppings, dips, etc.')}
      </p>

      {error && <Banner kind="error" className="mt-4">{error}</Banner>}
      {notice && <Banner kind="success" className="mt-4">{notice}</Banner>}

      <ul className="mt-6 space-y-4">
        {groupsList.length === 0 && (
          <li className="card text-sm text-neutral-500">{locale === 'pl' ? 'Brak grup dodatków. Utwórz pierwszą grupę poniżej.' : locale === 'de' ? 'Keine Zusatzgruppen vorhanden.' : 'No add-on groups yet. Create one below to get started.'}</li>
        )}
        {groupsList.map((g) => (
          <li key={g.id} className="card space-y-4 p-5">
            {/* Group header */}
            <form action={updateGroup} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <input type="hidden" name="id" value={g.id} />
              <div className="sm:col-span-2">
                <label className="label">{getTranslation(locale, 'common.name', 'Name')}</label>
                <input name="name" defaultValue={g.name} className="input" />
              </div>
              <div>
                <label className="label">{getTranslation(locale, 'addons.selection_mode', 'Mode')}</label>
                <select name="selection_mode" defaultValue={g.selection_mode} className="input">
                  <option value="single">{getTranslation(locale, 'addons.mode_single', 'Single (pick one)')}</option>
                  <option value="multi">{getTranslation(locale, 'addons.mode_multiple', 'Multi (pick any)')}</option>
                </select>
              </div>
              <div>
                <label className="label">{getTranslation(locale, 'addons.min_select', 'Min')}</label>
                <input name="min_select" type="number" min={0} defaultValue={g.min_select} className="input" />
              </div>
              <div>
                <label className="label">{getTranslation(locale, 'addons.max_select', 'Max')}</label>
                <input name="max_select" type="number" min={1} defaultValue={g.max_select ?? ''} placeholder="—" className="input" />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 pb-1 text-sm">
                  <input type="checkbox" name="required" defaultChecked={g.required} className="h-4 w-4 accent-brand" />
                  {getTranslation(locale, 'addons.required', 'Required')}
                </label>
              </div>
              <div className="sm:col-span-6 flex items-center justify-between">
                <button className="text-xs font-semibold text-brand hover:underline">{getTranslation(locale, 'btn.save', 'Save group')}</button>
                <form action={deleteGroup}>
                  <input type="hidden" name="id" value={g.id} />
                  <button className="text-xs font-medium text-red-600 hover:underline">{getTranslation(locale, 'btn.delete', 'Delete group')}</button>
                </form>
              </div>
            </form>

            {/* Options inside this group */}
            <div className="rounded-lg border border-neutral-100">
              <div className="bg-neutral-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">{getTranslation(locale, 'addons.options', 'Options')}</div>
              <ul className="divide-y divide-neutral-100">
                {g.options.length === 0 && <li className="px-3 py-3 text-xs text-neutral-400">{locale === 'pl' ? 'Brak opcji w tej grupie.' : locale === 'de' ? 'Noch keine Optionen vorhanden.' : 'No options yet.'}</li>}
                {g.options.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-end gap-3 px-3 py-2">
                    <form action={updateOption} className="flex flex-1 flex-wrap items-end gap-3">
                      <input type="hidden" name="id" value={o.id} />
                      <div className="min-w-[120px] flex-1">
                        <label className="label text-xs">{getTranslation(locale, 'addons.option_name', 'Name')}</label>
                        <input name="name" defaultValue={o.name} className="input" />
                      </div>
                      <div className="w-24">
                        <label className="label text-xs">{getTranslation(locale, 'addons.price_delta', 'Price ±')}</label>
                        <input name="price_delta" type="number" step="0.01" defaultValue={Number(o.price_delta)} className="input" />
                      </div>
                      <div className="w-20">
                        <label className="label text-xs">{getTranslation(locale, 'stock.quantity', 'Stock')}</label>
                        <input name="stock_quantity" type="number" min={0} defaultValue={o.stock_quantity ?? ''} placeholder="—" className="input" />
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs">
                        <input type="checkbox" name="is_available" defaultChecked={o.is_available} className="h-4 w-4 accent-brand" />
                        {getTranslation(locale, 'status.available', 'Available')}
                      </label>
                      <button className="btn-brand h-10 sm:w-auto sm:px-4">{getTranslation(locale, 'btn.save', 'Save')}</button>
                    </form>
                    <form action={deleteOption}>
                      <input type="hidden" name="id" value={o.id} />
                      <button className="pb-2 text-xs font-medium text-red-600 hover:underline">{getTranslation(locale, 'btn.remove', 'Remove')}</button>
                    </form>
                  </li>
                ))}
              </ul>
              {/* Translations */}
              {enabledLanguages.length > 0 && (
                <form action={saveGroupTranslations} className="border-t border-neutral-100 px-3 py-3">
                  <input type="hidden" name="id" value={g.id} />
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">{getTranslation(locale, 'settings.languages', 'Translations')}</p>
                  <AddonGroupTranslationTabs
                    languages={enabledLanguages}
                    defaultLanguage={defaultLang}
                    options={g.options.map((o) => ({ id: o.id, name: o.name }))}
                    initial={groupTranslations[g.id] ?? {}}
                  />
                  <div className="mt-2 text-right">
                    <button className="text-xs font-semibold text-brand hover:underline">{getTranslation(locale, 'btn.save', 'Save translations')}</button>
                  </div>
                </form>
              )}

              {/* Add option */}
              <form action={createOption} className="flex flex-wrap items-end gap-3 border-t border-neutral-100 px-3 py-3">
                <input type="hidden" name="group_id" value={g.id} />
                <div className="min-w-[120px] flex-1">
                  <label className="label text-xs">{getTranslation(locale, 'addons.option_name', 'New option name')}</label>
                  <input name="name" required placeholder={locale === 'pl' ? 'np. Sos czosnkowy, Podwójny ser' : locale === 'de' ? 'z. B. Knoblauchsauce, Extra Käse' : 'e.g. Garlic sauce, Extra cheese'} className="input" />
                </div>
                <div className="w-24">
                  <label className="label text-xs">{getTranslation(locale, 'addons.price_delta', 'Price ±')}</label>
                  <input name="price_delta" type="number" step="0.01" defaultValue="0" className="input" />
                </div>
                <div className="w-20">
                  <label className="label text-xs">{getTranslation(locale, 'stock.quantity', 'Stock')}</label>
                  <input name="stock_quantity" type="number" min={0} placeholder="—" className="input" />
                </div>
                <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs">
                  <input type="checkbox" name="is_available" defaultChecked className="h-4 w-4 accent-brand" />
                  {getTranslation(locale, 'status.available', 'Available')}
                </label>
                <button className="btn-brand h-10 sm:w-auto sm:px-4">{getTranslation(locale, 'addons.add_option', 'Add option')}</button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      {/* Create new group */}
      <div className="card mt-8">
        <h2 className="text-base font-semibold">{getTranslation(locale, 'addons.new_group', 'New add-on group')}</h2>
        <p className="-mt-0.5 text-xs text-neutral-500">{locale === 'pl' ? 'Grupa to zestaw opcji do wyboru przy daniu. Opcje dodasz po jej utworzeniu.' : locale === 'de' ? 'Eine Gruppe ist eine Reihe von Auswahlmöglichkeiten bei der Bestellung.' : 'A group is a set of choices customers pick from when ordering. Add the options after creating it.'}</p>
        <form action={createGroup} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="label">{getTranslation(locale, 'common.name', 'Name')}</label>
            <input name="name" required placeholder={locale === 'pl' ? 'np. Wybierz sos, Dodatki do burgera' : locale === 'de' ? 'z. B. Sauce wählen, Burger-Extras' : 'e.g. Choose sauce, Burger toppings'} className="input" />
          </div>
          <div>
            <label className="label">{getTranslation(locale, 'addons.selection_mode', 'Mode')}</label>
            <select name="selection_mode" defaultValue="single" className="input">
              <option value="single">{getTranslation(locale, 'addons.mode_single', 'Single (pick one)')}</option>
              <option value="multi">{getTranslation(locale, 'addons.mode_multiple', 'Multi (pick any)')}</option>
            </select>
          </div>
          <div>
            <label className="label">{getTranslation(locale, 'addons.min_select', 'Min')}</label>
            <input name="min_select" type="number" min={0} defaultValue={0} className="input" />
          </div>
          <div>
            <label className="label">{getTranslation(locale, 'addons.max_select', 'Max')}</label>
            <input name="max_select" type="number" min={1} placeholder="—" className="input" />
          </div>
          <label className="flex items-center gap-2 pb-1 text-sm">
            <input type="checkbox" name="required" className="h-4 w-4 accent-brand" />
            {getTranslation(locale, 'addons.required', 'Required')}
          </label>
          <div className="sm:col-span-6">
            <button className="btn-brand sm:w-auto sm:px-6">{getTranslation(locale, 'btn.create', 'Create group')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

