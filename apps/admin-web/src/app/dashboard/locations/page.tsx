import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import { addLocation, updateLocation, deleteLocation } from './actions'
import { ackSingleLocation } from '../actions'

interface Location {
  id: number
  name: string
  address?: string | null
  tables?: string[] | null
}
interface Setting {
  feature_key: string
  is_enabled: boolean | string
}
const isOn = (v: boolean | string | undefined) => v === true || v === 'true' || v === 't'

const DEFAULT_TABLES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Bar', 'Ogródek 1', 'Ogródek 2']

function formatTableBadge(table: string): string {
  const lower = table.toLowerCase().trim()
  if (
    lower.startsWith('stół') ||
    lower.startsWith('stolik') ||
    lower.startsWith('stol') ||
    lower.startsWith('ogr') ||
    lower.startsWith('bar') ||
    lower.startsWith('sala') ||
    lower.startsWith('taras') ||
    isNaN(Number(table))
  ) {
    return table
  }
  return `Stół ${table}`
}

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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{getTranslation(locale, 'locations.title', 'Lokalizacje')}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {getTranslation(locale, 'locations.subtitle', 'Oddziały, sale lub piętra. Dla każdej lokalizacji możesz zdefiniować własną listę stolików, baru i stref (np. ogródek), które wyświetlają się w systemie POS.')}
        </p>
      </div>

      {list.length === 0 && (
        <div className="card">
          <p className="text-sm text-neutral-600">
            {getTranslation(locale, 'locations.single_ack', 'Nie masz jeszcze zdefiniowanych lokalizacji — to w porządku. Zamówienia trafiają do całej firmy.')}
          </p>
          {singleAcked ? (
            <p className="mt-3 text-xs font-medium text-green-700">
              {getTranslation(locale, 'locations.single_confirmed', '✓ Potwierdzono: pojedyncza lokalizacja (cała firma).')}
            </p>
          ) : (
            <form action={ackSingleLocation} className="mt-3">
              <button className="text-xs font-semibold text-brand hover:underline">
                {getTranslation(locale, 'locations.single_btn', 'Prowadzę jeden lokal →')}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Locations List */}
      <div className="space-y-4">
        {list.length === 0 && (
          <div className="card text-center py-8">
            <p className="text-sm text-neutral-400">{getTranslation(locale, 'locations.empty', 'Brak zdefiniowanych lokalizacji.')}</p>
          </div>
        )}

        {list.map((l) => {
          const locTables = l.tables && Array.isArray(l.tables) && l.tables.length > 0 ? l.tables : DEFAULT_TABLES
          const tablesJoined = locTables.join(', ')

          return (
            <div key={l.id} className="card space-y-4">
              <div className="flex items-start justify-between gap-4">
                <form action={updateLocation} className="flex-1 space-y-3">
                  <input type="hidden" name="id" value={l.id} />
                  
                  <div>
                    <label className="label text-xs font-bold text-neutral-700 uppercase tracking-wide">
                      {getTranslation(locale, 'locations.name_label', 'Nazwa lokalizacji')}
                    </label>
                    <input
                      name="name"
                      defaultValue={l.name}
                      required
                      className="input font-semibold text-neutral-900"
                      placeholder="np. Sala Główna, Ogródek Letni, Foodtruck"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="label text-xs font-bold text-neutral-700 uppercase tracking-wide">
                        {getTranslation(locale, 'locations.tables_label', 'Stoliki / strefy / punkty wydań')}
                      </label>
                      <span className="text-xs text-neutral-400">
                        {locTables.length} {locTables.length === 1 ? 'pozycja' : 'pozycji'}
                      </span>
                    </div>
                    <input
                      name="tables"
                      defaultValue={tablesJoined}
                      className="input text-sm font-mono text-neutral-700"
                      placeholder={getTranslation(locale, 'locations.tables_placeholder', 'np. 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, Bar, Ogródek 1, Ogródek 2')}
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      {getTranslation(locale, 'locations.tables_help', 'Wpisz numery stolików lub nazwy stref rozdzielone przecinkami. Pojawią się one w terminalu POS.')}
                    </p>
                  </div>

                  {/* Visual Preview Chips */}
                  <div className="pt-2 flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs font-medium text-neutral-400 mr-1">Podgląd:</span>
                    {locTables.map((t, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200"
                      >
                        {formatTableBadge(t)}
                      </span>
                    ))}
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    <button type="submit" className="btn-brand sm:w-auto text-xs px-4 py-2">
                      {getTranslation(locale, 'btn.save', 'Zapisz zmiany')}
                    </button>
                  </div>
                </form>

                <form action={deleteLocation}>
                  <input type="hidden" name="id" value={l.id} />
                  <button
                    type="submit"
                    className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-xs font-semibold"
                    title={getTranslation(locale, 'btn.delete', 'Usuń')}
                  >
                    ✕ {getTranslation(locale, 'btn.delete', 'Usuń')}
                  </button>
                </form>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add New Location Card */}
      <div className="card bg-neutral-50/50 border-dashed border-2 border-neutral-200">
        <h2 className="text-base font-bold text-neutral-900 mb-3">
          + {getTranslation(locale, 'locations.new_title', 'Dodaj nową lokalizację')}
        </h2>
        <form action={addLocation} className="space-y-3">
          <div>
            <label className="label text-xs font-semibold text-neutral-600">
              {getTranslation(locale, 'locations.name_label', 'Nazwa lokalizacji')}
            </label>
            <input
              name="name"
              required
              placeholder={getTranslation(locale, 'locations.new_placeholder', 'Nowa lokalizacja (np. Ogródek, Piętro 1, Foodtruck #2)')}
              className="input bg-white"
            />
          </div>
          <div>
            <label className="label text-xs font-semibold text-neutral-600">
              {getTranslation(locale, 'locations.tables_label', 'Stoliki / strefy')}
            </label>
            <input
              name="tables"
              defaultValue="1, 2, 3, 4, 5, 6, 7, 8, 9, 10, Bar, Ogródek 1, Ogródek 2"
              placeholder={getTranslation(locale, 'locations.tables_placeholder', 'np. 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, Bar, Ogródek 1, Ogródek 2')}
              className="input bg-white text-sm font-mono"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Domyślny zestaw stolików dla tej lokalizacji (możesz go dowolnie zmienić w każdej chwili).
            </p>
          </div>
          <button className="btn-brand sm:w-auto px-6 py-2.5 text-xs font-bold">
            {getTranslation(locale, 'btn.add', 'Dodaj lokalizację')}
          </button>
        </form>
      </div>
    </div>
  )
}

