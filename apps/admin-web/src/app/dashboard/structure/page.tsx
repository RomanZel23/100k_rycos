import Link from 'next/link'
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{getTranslation(locale, 'nav.structure', 'Struktura lokalu')}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Lokalizacje, marki, stanowiska i urządzenia SBR na jednym schemacie. Połącz kropki liniami, aby ustalić, co gdzie jest sprzedawane,
            fiskalizowane, płacone kartą i drukowane. Zmiany trafiają do stanowisk po kliknięciu „Zapisz strukturę”.
          </p>
        </div>
        <Link
          href="/instrukcja-struktury"
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 px-3.5 py-2 text-xs font-bold text-neutral-700 shadow-xs transition shrink-0"
        >
          <span>📖</span>
          <span>Pełna instrukcja online ↗</span>
        </Link>
      </div>
      {data ? (
        <StructureEditor initial={data} />
      ) : (
        <div className="card text-sm text-neutral-600">Nie udało się pobrać struktury z API. Odśwież stronę za chwilę.</div>
      )}
    </div>
  )
}
