import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import { addLocation, updateLocation, deleteLocation } from './actions'
import { ackSingleLocation } from '../actions'

interface Location { id: number; name: string }
interface Setting { feature_key: string; is_enabled: boolean | string }
const isOn = (v: boolean | string | undefined) => v === true || v === 'true' || v === 't'

export default async function LocationsPage() {
  if (!isManager(await currentUser())) return <NoAccess />
  const locale = await getAdminLocale()
  const [locations, settings] = await Promise.all([
    adminApiData<Location[]>('/locations'),
    adminApiData<Setting[]>('/companies/settings'),
  ])
  const list = locations ?? []
  const singleAcked = (settings ?? []).some((s) => s.feature_key === 'onboarding_locations_ack' && isOn(s.is_enabled))

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">{getTranslation(locale, 'locations.title', 'Lokalizacje')}</h1>
      <p className="mt-1 text-sm text-neutral-500">{getTranslation(locale, 'locations.subtitle', 'Oddziały, sale lub piętra. Terminale i marki mogą być przypisane do konkretnej lokalizacji.')}</p>

      {list.length === 0 && (
        <div className="card mt-6">
          <p className="text-sm text-neutral-600">
            {getTranslation(locale, 'locations.single_ack', 'Nie masz jeszcze zdefiniowanych lokalizacji — to w porządku. Zamówienia trafiają do całej firmy.')}
          </p>
          {singleAcked ? (
            <p className="mt-3 text-xs font-medium text-green-700">{getTranslation(locale, 'locations.single_confirmed', '✓ Potwierdzono: pojedyncza lokalizacja (cała firma).')}</p>
          ) : (
            <form action={ackSingleLocation} className="mt-3">
              <button className="text-xs font-semibold text-brand hover:underline">{getTranslation(locale, 'locations.single_btn', 'Prowadzę jeden lokal →')}</button>
            </form>
          )}
        </div>
      )}

      <div className="card mt-6 divide-y divide-neutral-100 p-0">
        {list.length === 0 && <p className="p-4 text-sm text-neutral-400">{getTranslation(locale, 'locations.empty', 'Brak zdefiniowanych lokalizacji.')}</p>}
        {list.map((l) => (
          <div key={l.id} className="flex items-center gap-2 p-3">
            <form action={updateLocation} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="id" value={l.id} />
              <input name="name" defaultValue={l.name} className="input flex-1" />
              <button className="text-xs font-medium text-brand hover:underline">{getTranslation(locale, 'btn.save', 'Zapisz')}</button>
            </form>
            <form action={deleteLocation}>
              <input type="hidden" name="id" value={l.id} />
              <button className="text-xs font-medium text-red-600 hover:underline">{getTranslation(locale, 'btn.delete', 'Usuń')}</button>
            </form>
          </div>
        ))}
      </div>

      <form action={addLocation} className="card mt-6 flex gap-2">
        <input name="name" required placeholder={getTranslation(locale, 'locations.new_placeholder', 'Nowa lokalizacja (np. Ogródek, Piętro 1, Foodtruck #2)')} className="input" />
        <button className="btn-brand sm:w-auto sm:px-6">{getTranslation(locale, 'btn.add', 'Dodaj')}</button>
      </form>
    </div>
  )
}

