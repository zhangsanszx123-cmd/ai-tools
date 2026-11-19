import Link from 'next/link'
import { CircleCheck } from 'lucide-react'
import Markdown from 'react-markdown'
import { CategoryForm, ManagedToolForm } from '@/components/directory-admin-forms'
import { ReviewForm } from '@/components/review-form'
import { SubmissionForm } from '@/components/submission-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { validRecordId, websiteUrl } from '@/lib/catalog'
import { ToolDeleteAction, ToolStatusAction } from './tool-row-actions'
import { CategoryStatusAction } from './category-row-actions'
import { AdminPagination } from './admin-pagination'
import { adminPagination, adminPageSize } from '@/lib/admin-pagination'
import { directoryStore, getCategories } from '@/lib/directory-db'
import type { SubmissionItem } from '@/lib/directory-store'
import { getReviewQueue, getSubmissionHistory } from '@/lib/directory-submissions'

const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' })

function Unavailable() { return <Alert><AlertDescription>暂时无法加载数据，请稍后刷新重试。</AlertDescription></Alert> }

export async function SubmissionPanel() {
  const categories = await getCategories().catch(() => null)
  return <section className="surface account-panel"><h2>提交新的 AI 工具</h2><p className="mb-5 text-sm text-muted-foreground">提交后进入审核队列，通过后才会公开收录。投稿内容与审核结果会保留在提交历史中。</p>{categories ? <SubmissionForm categories={categories} /> : <Unavailable />}</section>
}

function Pager({ page, hasNext, tab }: { page: number; hasNext: boolean; tab: string }) {
  if (page === 1 && !hasNext) return null
  const base = tab === 'history' ? '/account' : '/admin'
  return <nav className="account-pagination" aria-label="记录分页">
    {page > 1 ? <Link className="text-action" href={`${base}?tab=${tab}&page=${page - 1}`}>上一页</Link> : <span />}
    <span>第 {page} 页</span>
    {hasNext ? <Link className="text-action" href={`${base}?tab=${tab}&page=${page + 1}`}>下一页</Link> : <span />}
  </nav>
}

function SubmittedContent({ item }: { item: SubmissionItem }) {
  return <details className="submission-details"><summary>查看投稿内容</summary>
    <p className="mt-3 text-sm text-muted-foreground">分类：{item.categoryName} · 申请标识：{item.slug}</p>
    <p className="my-2 text-sm">{item.summary}</p>
    {websiteUrl(item.website) && <a className="text-action break-all" href={item.website} target="_blank" rel="noopener noreferrer">访问投稿官网（新标签页）</a>}
    {(item.hasLogo || item.hasCover) && <div className="review-media">{item.hasLogo && <img loading="lazy" src={`/api/submission-media/${item.id}/logo`} alt="投稿 Logo" />}{item.hasCover && <img loading="lazy" src={`/api/submission-media/${item.id}/cover`} alt="投稿预览图" />}</div>}
    <div className="markdown mt-3"><Markdown skipHtml disallowedElements={['img']}>{item.content}</Markdown></div>
  </details>
}

export async function SubmissionHistory({ userId, submitted, page }: { userId: string; submitted: boolean; page: number }) {
  const result = await getSubmissionHistory(userId, page).catch(() => null)
  return <section className="surface account-panel"><h2>提交历史</h2>
    {submitted && <Alert className="mb-4"><CircleCheck aria-hidden="true" /><AlertDescription>已提交，等待管理员审核。</AlertDescription></Alert>}
    {!result ? <Unavailable /> : <>
      {result.items.length ? <ul className="submission-history">{result.items.map(item => <li key={item.id}>
        <div className="history-row"><div>{item.publishedSlug ? <Link className="text-action" href={`/tools/${item.publishedSlug}`}>{item.name}</Link> : <strong>{item.name}</strong>}<time dateTime={item.submittedAt.toISOString()}>{dateFormat.format(item.submittedAt)}</time></div><span className="history-status" data-status={item.status}>{({ pending: '审核中', approved: '已通过', rejected: '已驳回' })[item.status]}</span></div>
        {item.reviewedAt && <p className="text-sm text-muted-foreground">审核时间：{dateFormat.format(item.reviewedAt)}</p>}
        {item.status === 'rejected' && <p className="review-reason">驳回原因：{item.rejectionReason} <Link className="text-action" href="/account?tab=submit">修改后重新投稿</Link></p>}
        {item.status === 'approved' && !item.publishedSlug && <p className="text-sm text-muted-foreground">审核已通过，正式工具当前未公开展示。</p>}
        <SubmittedContent item={item} />
      </li>)}</ul> : <div className="catalog-empty">{page > 1 ? '这一页没有记录。' : '还没有提交记录。'} <Link className="text-action" href="/account?tab=submit">推荐一款工具</Link></div>}
      <Pager page={page} tab="history" hasNext={result.hasNext} />
    </>}
  </section>
}

export async function ReviewPanel({ adminId, result, page }: { adminId: string; result?: string; page: number }) {
  const queue = await getReviewQueue(adminId, page).catch(() => null)
  return <section className="surface account-panel"><h2>审核队列</h2>
    {(result === 'published' || result === 'rejected') && <p role="status" className="mb-4 text-sm text-muted-foreground">{result === 'published' ? '工具已收录，原始投稿记录已保留。' : '投稿已驳回，用户可在提交历史查看原因。'}</p>}
    {!queue ? <Unavailable /> : <>
      {queue.items.length === 0 ? <p className="catalog-empty">当前页没有待审核投稿。</p> : <ul className="grid gap-5">{queue.items.map(item => <li key={item.id} className="review-item">
        <h3 className="font-semibold">{item.name}</h3><p className="mt-1 text-sm text-muted-foreground">{item.submitterName ?? '账号已注销'} · {dateFormat.format(item.submittedAt)}</p>
        <SubmittedContent item={item} /><ReviewForm id={item.id} categoryEnabled={item.categoryEnabled} />
      </li>)}</ul>}
      <Pager page={page} tab="review" hasNext={queue.hasNext} />
    </>}
  </section>
}

export async function CategoryPanel({ saved, page, query }: { saved: boolean; page: number; query: { q?: string; status?: string; edit?: string; new?: string; changed?: string; pageSize?: string } }) {
  const categories = await getCategories(true).catch(() => null)
  if (!categories) return <Unavailable />
  if (query.new === '1' || query.edit !== undefined) {
    const category = categories.find(item => item.id === query.edit)
    return <section className="surface account-panel"><div className="tool-list-heading"><h2>{query.edit !== undefined ? '编辑分类' : '新增分类'}</h2><Link className="text-action" href="/admin?tab=categories">返回分类列表</Link></div>
      {query.edit !== undefined && !category ? <p role="alert">分类不存在，请返回列表重试。</p> : <CategoryForm key={category?.id ?? 'new'} category={query.edit !== undefined ? category : undefined} />}
    </section>
  }
  const q = query.q?.trim().slice(0, 100) ?? ''
  const status = ['enabled', 'disabled'].includes(query.status ?? '') ? query.status! : ''
  const filtered = categories.filter(item => `${item.name} ${item.id} ${item.short}`.toLowerCase().includes(q.toLowerCase()) && (!status || item.isEnabled === (status === 'enabled')))
  const pagination = adminPagination(filtered.length, page, query.pageSize)
  const items = filtered.slice(pagination.offset, pagination.offset + pagination.pageSize)
  return <section className="surface account-panel">
    <div className="tool-list-heading"><div><h2>分类列表</h2><p className="text-sm text-muted-foreground">维护分类名称、图标、排序和启用状态。</p></div><Link className="primary-action" href="/admin?tab=categories&new=1">新增分类</Link></div>
    {saved && <p role="status" className="tool-list-notice">分类已保存。</p>}
    {query.changed === '1' && <p role="status" className="tool-list-notice">分类启停状态已更新。</p>}
    <form method="GET" action="/admin" className="tool-filters"><input type="hidden" name="tab" value="categories" />
      <input type="hidden" name="pageSize" value={pagination.pageSize} />
      <label>关键词<input name="q" defaultValue={q} maxLength={100} placeholder="分类名称、短名或标识" /></label>
      <label>状态<select name="status" defaultValue={status}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
      <button className="primary-action" type="submit">查询</button><Link className="text-action" href="/admin?tab=categories">重置</Link>
    </form>
    <p className="tool-list-count">共 {filtered.length} 条，每页 {pagination.pageSize} 条</p>
    <div className="tool-table-scroll" role="region" aria-label="分类列表，可横向滚动" tabIndex={0}><table className="tool-table"><caption className="sr-only">工具分类列表</caption><thead><tr><th scope="col">分类名称 / 标识</th><th scope="col">短名称</th><th scope="col">图标</th><th scope="col">排序</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>
      {items.map(item => <tr key={item.id}><td><strong>{item.name}</strong><span className="tool-list-slug">{item.id}</span></td><td>{item.short}</td><td>{item.iconKey}</td><td>{item.sortOrder}</td><td><span className="tool-state" data-status={item.isEnabled ? 'published' : 'disabled'}>{item.isEnabled ? '启用' : '停用'}</span></td><td><div className="tool-row-actions"><Link className="text-action" href={`/admin?tab=categories&edit=${encodeURIComponent(item.id)}`}>编辑</Link><CategoryStatusAction id={item.id} enabled={item.isEnabled} /></div></td></tr>)}
      {!items.length && <tr><td colSpan={6} className="catalog-empty">{q || status ? '没有符合查询条件的分类。' : page > 1 ? '这一页没有分类，请返回上一页。' : '暂无分类，点击“新增分类”开始创建。'}</td></tr>}
    </tbody></table></div>
    <AdminPagination tab="categories" params={{ q, status }} pagination={pagination} />
  </section>
}

export async function ToolsPanel({ adminId, page, saved, query }: {
  adminId: string; page: number; saved: boolean
  query: { q?: string; status?: string; category?: string; edit?: string; new?: string; deleted?: string; changed?: string; pageSize?: string }
}) {
  const categories = await getCategories(true).catch(() => null)
  if (!categories) return <Unavailable />
  if (query.new === '1' || query.edit !== undefined) {
    const tool = query.edit && validRecordId(query.edit) ? await directoryStore.getManagedTool(adminId, query.edit).catch(() => null) : undefined
    return <section className="surface account-panel"><div className="tool-list-heading"><h2>{query.edit !== undefined ? '编辑工具' : '新增工具'}</h2><Link className="text-action" href="/admin?tab=tools">返回工具列表</Link></div>
      {query.edit !== undefined && !tool ? <p role="alert">工具不存在、已删除或暂时无法加载。请返回列表重试。</p> : <ManagedToolForm key={tool?.id ?? 'new'} tool={tool ?? undefined} categories={categories} />}
    </section>
  }
  const q = query.q?.trim().slice(0, 100) ?? ''
  const status = ['published', 'disabled'].includes(query.status ?? '') ? query.status! : ''
  const category = query.category ?? ''
  const pageSize = adminPageSize(query.pageSize)
  const result = await directoryStore.getManagedTools(adminId, page, { query: q, status, category, pageSize }).catch(() => null)
  return <section className="surface account-panel">
    <div className="tool-list-heading"><div><h2>工具列表</h2><p className="text-sm text-muted-foreground">查询正式工具，维护内容和上下架状态。</p></div><Link className="primary-action" href="/admin?tab=tools&new=1">新增工具</Link></div>
    {saved && <p role="status" className="tool-list-notice">工具已保存。</p>}
    {query.deleted === '1' && <p role="status" className="tool-list-notice">工具已删除，原始投稿与审核记录保留。</p>}
    {query.changed === '1' && <p role="status" className="tool-list-notice">上下架状态已更新。</p>}
    <form method="GET" action="/admin" className="tool-filters">
      <input type="hidden" name="tab" value="tools" />
      <input type="hidden" name="pageSize" value={pageSize} />
      <label>关键词<input name="q" defaultValue={q} maxLength={100} placeholder="工具名称、标识或网址" /></label>
      <label>分类<select name="category" defaultValue={category}><option value="">全部分类</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>状态<select name="status" defaultValue={status}><option value="">全部状态</option><option value="published">已上架</option><option value="disabled">已下架</option></select></label>
      <button className="primary-action" type="submit">查询</button><Link className="text-action" href="/admin?tab=tools">重置</Link>
    </form>
    {!result ? <Unavailable /> : <>
      <p className="tool-list-count">共 {result.total} 条，每页 {result.pageSize} 条</p>
      <div className="tool-table-scroll" role="region" aria-label="工具列表，可横向滚动" tabIndex={0}><table className="tool-table"><caption className="sr-only">正式 AI 工具列表</caption><thead><tr><th scope="col">工具名称 / 标识</th><th scope="col">分类</th><th scope="col">状态</th><th scope="col">排序 / 热门</th><th scope="col">操作</th></tr></thead><tbody>
        {result.items.map(tool => <tr key={tool.id}><td><strong>{tool.name}</strong><span className="tool-list-slug">{tool.slug}</span></td><td>{tool.categoryName}</td><td><span className="tool-state" data-status={tool.status}>{tool.status === 'published' ? '已上架' : '已下架'}</span></td><td>{tool.displayOrder} / {tool.featuredOrder ?? '不推荐'}</td><td><div className="tool-row-actions"><Link className="text-action" href={`/admin?tab=tools&edit=${tool.id}`}>编辑</Link><ToolStatusAction id={tool.id} status={tool.status} /><ToolDeleteAction id={tool.id} name={tool.name} /></div></td></tr>)}
        {!result.items.length && <tr><td colSpan={5} className="catalog-empty">{q || status || category ? '没有符合查询条件的工具。' : page > 1 ? '这一页没有工具，请返回上一页。' : '暂无工具，点击“新增工具”开始收录。'}</td></tr>}
      </tbody></table></div>
      <AdminPagination tab="tools" params={{ q, status, category }} pagination={result} />
    </>}
  </section>
}
