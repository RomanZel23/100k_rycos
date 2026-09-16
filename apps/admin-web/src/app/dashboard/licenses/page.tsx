import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { LicensesClient, type LicensingData } from './LicensesClient'
import { getAdminLocale } from '@/lib/i18n-server'
import { getTranslation } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function LicensesPage() {
  if (!isManager(await currentUser())) return <NoAccess />
  const locale = await getAdminLocale()

  const data = await adminApiData<LicensingData>('/rycos/licenses')

  const fallbackData: LicensingData = {
    company: {
      id: 0,
      name: 'Firma',
      nip: null,
    },
    integrator: {
      configured: false,
      apiKeyPresent: false,
      nip: null,
      client: null,
      seats: [],
      devices: [],
      tierSummary: {
        total: 0,
        paired: 0,
        available: 0,
        byTier: {},
      },
      error: 'Brak połączenia z API licencji.',
    },
    server_license: null,
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-techbay-blue">
            {getTranslation(locale, 'licenses.title', 'Licencje i Flota Urządzeń RYCOS')}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {getTranslation(
              locale,
              'licenses.subtitle',
              'Zarządzanie licencjami serwerowymi, slotami kas fiskalnych i urządzeniami SBR-* zintegrowanymi przez NIP.'
            )}
          </p>
        </div>
      </div>

      <LicensesClient data={data || fallbackData} />
    </div>
  )
}
