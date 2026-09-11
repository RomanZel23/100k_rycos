import Link from 'next/link'
import { adminApiData } from '@/lib/api'
import { currentUser, isManager } from '@/lib/auth'
import { NoAccess } from '@/components/NoAccess'
import { Banner } from '@/components/Banner'
import { createBrand } from './actions'

interface Brand {
  id: number
  name: string | null
  location_description: string | null
  qr_slug: string
  menu_layout: string
  product_count: number
}

export default async function BrandsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await currentUser()
  if (!isManager(user)) return <NoAccess />
  const { error, notice } = await searchParams
  const brands = (await adminApiData<Brand[]>('/brands')) ?? []
  const companyName = (user?.user_metadata?.name as string) || ''

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Brands</h1>
      <p className="mt-1 text-sm text-neutral-500">
        A brand is a customer ordering entry point (its own QR code, look &amp; menu). Most companies start with one.
      </p>
      {error && <Banner kind="error" className="mt-4">{error}</Banner>}
      {notice && <Banner kind="success" className="mt-4">{notice}</Banner>}

      {brands.length === 0 ? (
        <div className="card mt-6 text-center">
          <h2 className="text-lg font-semibold">Create your first brand</h2>
          <p className="mt-1 text-sm text-neutral-500">Give it a name — you can use your company name and customise it later.</p>
          <form action={createBrand} className="mx-auto mt-4 flex max-w-md gap-2">
            <input name="name" required defaultValue={companyName} placeholder="Brand name" className="input" />
            <button className="btn-brand sm:w-auto sm:px-6">Create</button>
          </form>
        </div>
      ) : (
        <>
          <div className="card mt-6 overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">QR slug</th>
                  <th className="px-4 py-3">Layout</th>
                  <th className="px-4 py-3 text-right">Products</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {brands.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-medium">{b.name || b.location_description || `Brand ${b.id}`}</td>
                    <td className="px-4 py-3 text-neutral-500">{b.qr_slug}</td>
                    <td className="px-4 py-3 text-neutral-600">{b.menu_layout}</td>
                    <td className="px-4 py-3 text-right">{b.product_count}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/brands/${b.id}`} className="text-xs font-medium text-brand hover:underline">Edit</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card mt-6">
            <h2 className="text-base font-semibold">Add another brand</h2>
            <form action={createBrand} className="mt-3 flex gap-2">
              <input name="name" required placeholder="Brand name" className="input" />
              <button className="btn-brand sm:w-auto sm:px-6">Create</button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
