export type PageSlice<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function clampPage(page: number, totalPages: number): number {
  if (totalPages < 1) return 1
  return Math.min(Math.max(1, page), totalPages)
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): PageSlice<T> {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = clampPage(page, totalPages)
  const start = (safePage - 1) * pageSize

  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  }
}

export function parsePageParam(value: string | null): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.floor(parsed)
}
