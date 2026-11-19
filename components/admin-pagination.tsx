import Link from 'next/link'
import { ADMIN_PAGE_SIZES, type adminPagination } from '@/lib/admin-pagination'

export function AdminPagination({ tab, params, pagination }: {
  tab: 'categories' | 'tools'; params: Record<string, string>; pagination: ReturnType<typeof adminPagination>
}) {
  const { total, page, pageSize, totalPages } = pagination
  const values = { ...params, tab }
  const href = (value: number) => `/admin?${new URLSearchParams({ ...values, pageSize: String(pageSize), page: String(value) })}`
  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index)
  return <nav className="admin-pagination" aria-label={tab === 'tools' ? 'AI 工具分页' : '分类管理分页'}>
    <p>共 {total} 条，第 {page} / {totalPages} 页</p>
    <div className="admin-page-links">
      {page > 1 ? <><Link href={href(1)}>首页</Link><Link href={href(page - 1)}>上一页</Link></> : <><span aria-disabled="true">首页</span><span aria-disabled="true">上一页</span></>}
      {pages.map(value => <Link key={value} href={href(value)} aria-label={`第 ${value} 页`} aria-current={value === page ? 'page' : undefined}>{value}</Link>)}
      {page < totalPages ? <><Link href={href(page + 1)}>下一页</Link><Link href={href(totalPages)}>末页</Link></> : <><span aria-disabled="true">下一页</span><span aria-disabled="true">末页</span></>}
    </div>
    <form method="GET" action="/admin" className="admin-page-form">
      {Object.entries(values).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <label>每页<select name="pageSize" defaultValue={pageSize}>{ADMIN_PAGE_SIZES.map(size => <option key={size} value={size}>{size} 条</option>)}</select></label><button type="submit">应用</button>
    </form>
    <form method="GET" action="/admin" className="admin-page-form">
      {Object.entries(values).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <input type="hidden" name="pageSize" value={pageSize} />
      <label>跳至<input name="page" type="number" min={1} max={totalPages} defaultValue={page} required aria-label="跳转页码" /></label><button type="submit">跳转</button>
    </form>
  </nav>
}
