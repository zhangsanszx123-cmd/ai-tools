import Link from 'next/link'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { ADMIN_PAGE_SIZES, type adminPagination } from '@/lib/admin-pagination'

const paginationLabels = {
  categories: '分类管理分页',
  tools: 'AI 工具分页',
  users: '前端用户分页',
  admins: '后端用户分页',
} as const

export function AdminPagination({
  tab,
  params,
  pagination,
}: {
  tab: keyof typeof paginationLabels
  params: Record<string, string>
  pagination: ReturnType<typeof adminPagination>
}) {
  const { total, page, pageSize, totalPages } = pagination
  const values = { ...params, tab }
  const href = (value: number) =>
    `/admin?${new URLSearchParams({ ...values, pageSize: String(pageSize), page: String(value) })}`
  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index)

  return (
    <nav className="admin-pagination" aria-label={paginationLabels[tab]}>
      <p className="admin-pagination-summary">
        共 <strong>{total}</strong> 条，第 {page} / {totalPages} 页
      </p>

      <div className="admin-page-links">
        {page > 1 ? (
          <>
            <Link href={href(1)} className="admin-page-nav" title="首页">
              <ChevronsLeft size={15} aria-hidden="true" />
              <span>首页</span>
            </Link>
            <Link href={href(page - 1)} className="admin-page-nav" title="上一页">
              <ChevronLeft size={15} aria-hidden="true" />
              <span>上一页</span>
            </Link>
          </>
        ) : (
          <>
            <span className="admin-page-nav" aria-disabled="true">
              <ChevronsLeft size={15} aria-hidden="true" />
              <span>首页</span>
            </span>
            <span className="admin-page-nav" aria-disabled="true">
              <ChevronLeft size={15} aria-hidden="true" />
              <span>上一页</span>
            </span>
          </>
        )}

        <div className="admin-page-numbers">
          {pages.map(value => (
            <Link
              key={value}
              href={href(value)}
              aria-label={`第 ${value} 页`}
              aria-current={value === page ? 'page' : undefined}
            >
              {value}
            </Link>
          ))}
        </div>

        {page < totalPages ? (
          <>
            <Link href={href(page + 1)} className="admin-page-nav" title="下一页">
              <span>下一页</span>
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
            <Link href={href(totalPages)} className="admin-page-nav" title="末页">
              <span>末页</span>
              <ChevronsRight size={15} aria-hidden="true" />
            </Link>
          </>
        ) : (
          <>
            <span className="admin-page-nav" aria-disabled="true">
              <span>下一页</span>
              <ChevronRight size={15} aria-hidden="true" />
            </span>
            <span className="admin-page-nav" aria-disabled="true">
              <span>末页</span>
              <ChevronsRight size={15} aria-hidden="true" />
            </span>
          </>
        )}
      </div>

      <div className="admin-page-controls">
        <form method="GET" action="/admin" className="admin-page-form">
          {Object.entries(values).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <label>
            <span>每页</span>
            <select name="pageSize" defaultValue={pageSize}>
              {ADMIN_PAGE_SIZES.map(size => (
                <option key={size} value={size}>
                  {size} 条
                </option>
              ))}
            </select>
          </label>
          <button type="submit">应用</button>
        </form>

        <form method="GET" action="/admin" className="admin-page-form">
          {Object.entries(values).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <input type="hidden" name="pageSize" value={pageSize} />
          <label>
            <span>跳至</span>
            <input
              name="page"
              type="number"
              min={1}
              max={totalPages}
              defaultValue={page}
              required
              aria-label="跳转页码"
            />
          </label>
          <button type="submit">跳转</button>
        </form>
      </div>
    </nav>
  )
}
