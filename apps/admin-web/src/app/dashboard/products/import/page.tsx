import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager, isPlatformAdmin } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { getAdminLocale } from '@/lib/i18n-server'
import { MenuImportClient } from './MenuImportClient'

interface Brand { id: number; name: string }
interface Capabilities {
  file: boolean
  images: boolean
  max_images: number
  max_image_mb: number
  default_tax_rate: number
}
interface PromptInfo { prompt: string; source: string; default_prompt: string; is_default: boolean }

export default async function MenuImportPage() {
  const user = await currentUser()
  if (!isManager(user)) return <NoAccess />
  const locale = await getAdminLocale()
  const platformAdmin = isPlatformAdmin(user)

  const [brands, capabilities, promptInfo] = await Promise.all([
    adminApiData<Brand[]>('/brands'),
    adminApiData<Capabilities>('/menu-import/capabilities'),
    platformAdmin ? adminApiData<PromptInfo>('/menu-import/prompt') : Promise.resolve(null),
  ])

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/dashboard/products" className="text-sm text-neutral-500 hover:text-brand">
        &larr; {locale === 'pl' ? 'Produkty' : 'Products'}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        {locale === 'pl' ? 'Import menu' : 'Menu import'}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        {locale === 'pl'
          ? 'Wgraj plik z menu albo zrób zdjęcia karty dań — pozycje trafią do tabeli, którą poprawisz przed zapisem.'
          : 'Upload a menu file or photograph the printed card — items land in a table you correct before saving.'}
      </p>

      <MenuImportClient
        brands={brands ?? []}
        capabilities={capabilities ?? { file: true, images: false, max_images: 6, max_image_mb: 6, default_tax_rate: 23 }}
        promptInfo={promptInfo}
        canEditPrompt={platformAdmin}
      />
    </div>
  )
}
