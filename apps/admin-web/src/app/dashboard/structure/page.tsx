import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { getTranslation } from '@/lib/i18n'
import { getAdminLocale } from '@/lib/i18n-server'
import type { ApiStructure } from './model'
import { StructureEditor } from './StructureEditor'

export const dynamic = 'force-dynamic'

export default async function StructurePage() {
  if (!isManager(await currentUser())) return <NoAccess />
  const locale = await getAdminLocale()
  const data = await adminApiData<ApiStructure>('/structure')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{getTranslation(locale, 'nav.structure', 'Struktura lokalu')}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Lokalizacje, marki, stanowiska i urządzenia SBR na jednym schemacie. Połącz kropki liniami, aby ustalić, co gdzie jest sprzedawane,
          fiskalizowane, płacone kartą i drukowane. Zmiany trafiają do stanowisk po kliknięciu „Zapisz strukturę”.
        </p>
      </div>
      {data ? (
        <StructureEditor initial={data} />
      ) : (
        <div className="card text-sm text-neutral-600">Nie udało się pobrać struktury z API. Odśwież stronę za chwilę.</div>
      )}
    </div>
  )
}
