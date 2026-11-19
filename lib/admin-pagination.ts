export const ADMIN_PAGE_SIZES = [10, 20, 50, 100] as const

export function adminPageSize(value?: string | number) {
  const size = Number(value)
  return ADMIN_PAGE_SIZES.some(item => item === size) ? size : 10
}

export function adminPagination(total: number, requestedPage: number, size?: string | number) {
  const pageSize = adminPageSize(size)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(totalPages, Math.max(1, Math.trunc(requestedPage) || 1))
  return { total, page, pageSize, totalPages, offset: (page - 1) * pageSize, hasNext: page < totalPages }
}
