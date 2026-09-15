import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { DeleteBrandButton } from '@/components/DeleteBrandButton'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import { createBrand, deleteBrand, toggleBrandStatus } from './actions'

interface Brand {
  id: number
  name: string | null
  location_description: string | null
  qr_slug: string
  menu_layout: string
  product_count: number
  is_active: boolean
}

export default async function BrandsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await currentUser()
  if (!isManager(user)) return <NoAccess />
  const locale = await getAdminLocale()
  const { error, notice } = await searchParams
  const brands = (await adminApiData<Brand[]>('/brands')) ?? []
  const companyName = (user?.user_metadata?.name as string) || ''

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">{getTranslation(locale, 'brands.title', 'Brands')}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {getTranslation(locale, 'brands.subtitle', 'A brand is a customer ordering entry point (its own QR code, look & menu).')}
      </p>
      {error && <Banner kind="error" className="mt-4">{error}</Banner>}
      {notice && <Banner kind="success" className="mt-4">{notice}</Banner>}

      {brands.length === 0 ? (
        <div className="card mt-6 text-center">
          <h2 className="text-lg font-semibold">{getTranslation(locale, 'brands.create_first', 'Create your first brand')}</h2>
          <p className="mt-1 text-sm text-neutral-500">{getTranslation(locale, 'brands.create_first_hint', 'Give it a name — you can use your company name and customise it later.')}</p>
          <form action={createBrand} className="mx-auto mt-4 flex max-w-md gap-2">
            <input name="name" required defaultValue={companyName} placeholder={getTranslation(locale, 'brands.table.brand', 'Brand name')} className="input" />
            <button className="btn-brand sm:w-auto sm:px-6">{getTranslation(locale, 'btn.create', 'Create')}</button>
          </form>
        </div>
      ) : (
        <>
          <div className="card mt-6 overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-4 py-3">{getTranslation(locale, 'brands.table.brand', 'Brand')}</th>
                  <th className="px-4 py-3">{getTranslation(locale, 'brands.table.qr_slug', 'QR slug')}</th>
                  <th className="px-4 py-3">{getTranslation(locale, 'brands.table.layout', 'Layout')}</th>
                  <th className="px-4 py-3 text-right">{getTranslation(locale, 'brands.table.products', 'Products')}</th>
                  <th className="px-4 py-3 text-center">{getTranslation(locale, 'brands.table.status', 'Status')}</th>
                  <th className="px-4 py-3 text-right">{getTranslation(locale, 'common.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {brands.map((b) => (
                  <tr key={b.id} className={!b.is_active ? 'bg-neutral-50/50' : ''}>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{b.name || b.location_description || `Brand ${b.id}`}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{b.qr_slug}</td>
                    <td className="px-4 py-3 text-neutral-600">{b.menu_layout}</td>
                    <td className="px-4 py-3 text-right font-medium">{b.product_count}</td>
                    <td className="px-4 py-3 text-center">
                      {b.is_active ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {getTranslation(locale, 'brands.status_active', 'Active')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600 border border-neutral-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                          {getTranslation(locale, 'brands.status_paused', 'Paused')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <form action={toggleBrandStatus}>
                          <input type="hidden" name="id" value={b.id} />
                          <input type="hidden" name="is_active" value={String(b.is_active)} />
                          <button
                            type="submit"
                            className={`text-xs font-semibold transition-colors ${
                              b.is_active
                                ? 'text-amber-600 hover:text-amber-700 hover:underline'
                                : 'text-emerald-600 hover:text-emerald-700 hover:underline'
                            }`}
                            title={b.is_active ? getTranslation(locale, 'brands.pause_action', 'Pause') : getTranslation(locale, 'brands.activate_action', 'Activate')}
                          >
                            {b.is_active ? getTranslation(locale, 'brands.pause_action', 'Pause') : getTranslation(locale, 'brands.activate_action', 'Activate')}
                          </button>
                        </form>

                        <Link
                          href={`/dashboard/brands/${b.id}`}
                          className="text-xs font-medium text-brand hover:underline"
                        >
                          {getTranslation(locale, 'btn.edit', 'Edit')}
                        </Link>

                        <DeleteBrandButton
                          action={deleteBrand}
                          brandId={b.id}
                          brandName={b.name}
                          label={getTranslation(locale, 'btn.delete', 'Delete')}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <div className="card mt-6">
            <h2 className="text-base font-semibold">{locale === 'pl' ? 'Dodaj kolejną markę' : locale === 'de' ? 'Weitere Marke hinzufügen' : 'Add another brand'}</h2>
            <form action={createBrand} className="mt-3 flex gap-2">
              <input name="name" required placeholder={getTranslation(locale, 'brands.table.brand', 'Brand name')} className="input" />
              <button className="btn-brand sm:w-auto sm:px-6">{getTranslation(locale, 'btn.create', 'Create')}</button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}

