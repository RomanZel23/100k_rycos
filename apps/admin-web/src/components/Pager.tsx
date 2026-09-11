'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import type { Pagination } from '@/lib/pagination'
import { PER_PAGE_CHOICES } from '@/lib/pagination'

// Page-size selector + Prev/Next + range summary. URL-driven so the surrounding
// page renders server-side with no extra state. Drop this in below any list
// that uses an /admin-api endpoint backed by `parsePageParams + buildPagination`.
export function Pager({ pagination, perPage }: { pagination: Pagination | null; perPage: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  if (!pagination) return null

  const { total, current_page, last_page, from, to } = pagination

  function urlFor(newPage: number, newPerPage?: number): string {
    const params = new URLSearchParams(sp?.toString() ?? '')
    params.set('page', String(newPage))
    if (newPerPage != null) params.set('per_page', String(newPerPage))
    return `${pathname}?${params.toString()}`
  }

  const prevDisabled = current_page <= 1
  const nextDisabled = current_page >= last_page

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">
      <p className="text-neutral-500">
        {total === 0 ? 'No results' : <>Showing <strong className="text-neutral-900">{from}</strong>–<strong className="text-neutral-900">{to}</strong> of <strong className="text-neutral-900">{total}</strong></>}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          Per page
          <select
            value={perPage}
            onChange={(e) => router.replace(urlFor(1, parseInt(e.target.value)))}
            className="input h-8 w-20 py-0 text-xs"
          >
            {PER_PAGE_CHOICES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="text-xs text-neutral-500">Page {current_page} of {last_page}</span>
        <div className="flex items-center gap-1">
          <PagerLink href={urlFor(current_page - 1)} disabled={prevDisabled}>&larr; Prev</PagerLink>
          <PagerLink href={urlFor(current_page + 1)} disabled={nextDisabled}>Next &rarr;</PagerLink>
        </div>
      </div>
    </div>
  )
}

function PagerLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled className="rounded-md border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-300">
        {children}
      </span>
    )
  }
  return (
    <Link href={href} className="rounded-md border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 transition hover:border-brand hover:text-brand">
      {children}
    </Link>
  )
}
