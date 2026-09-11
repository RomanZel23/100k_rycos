// Shared pagination types + helpers for the company-admin Next.js app. The
// admin-api returns paginated lists wrapped as { data: T[], pagination: {...} },
// so the client just unwraps that envelope.

export interface Pagination {
  total: number
  per_page: number
  current_page: number
  last_page: number
  from: number
  to: number
}

const DEFAULT_PER_PAGE = 50
const MAX_PER_PAGE = 200
const PER_PAGE_OPTIONS = [10, 20, 50, 100, 200] as const

export const PER_PAGE_CHOICES = PER_PAGE_OPTIONS

export function parsePageParams(sp: Record<string, string | string[] | undefined>): {
  page: number
  perPage: number
} {
  const get = (k: string): string | undefined => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }
  let page = parseInt(get('page') ?? '1')
  let perPage = parseInt(get('per_page') ?? String(DEFAULT_PER_PAGE))
  if (!Number.isFinite(page) || page < 1) page = 1
  if (!Number.isFinite(perPage) || perPage < 1) perPage = DEFAULT_PER_PAGE
  if (perPage > MAX_PER_PAGE) perPage = MAX_PER_PAGE
  return { page, perPage }
}
