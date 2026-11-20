import Link from 'next/link'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CirclePlus,
  Clock3,
  ExternalLink,
  FileText,
  Flame,
  FolderPlus,
  FolderTree,
  Inbox,
  ListFilter,
  Pencil,
  Plus,
  Search,
  Sparkles,
  UserRound,
} from 'lucide-react'
import Markdown from 'react-markdown'
import { CategoryForm, ManagedToolForm } from '@/components/directory-admin-forms'
import { ReviewForm } from '@/components/review-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { brandKeys, validRecordId, websiteUrl } from '@/lib/catalog'
import { adminPagination, adminPageSize } from '@/lib/admin-pagination'
import { directoryStore, getCategories } from '@/lib/directory-db'
import { getReviewQueue } from '@/lib/directory-submissions'
import { AdminPagination } from './admin-pagination'
import { getCategoryIcon } from './catalog-elements'
import { CategoryStatusAction } from './category-row-actions'
import { ToolDeleteAction, ToolStatusAction } from './tool-row-actions'

const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Shanghai',
})

function AdminUnavailable() {
  return (
    <Alert variant="destructive" className="admin-banner">
      <AlertCircle aria-hidden="true" />
      <AlertDescription>暂时无法加载数据，请稍后刷新重试。</AlertDescription>
    </Alert>
  )
}

function AdminNotice({ message, tone = 'success' }: { message: string; tone?: 'success' | 'info' }) {
  return (
    <div role="status" className="admin-notice" data-tone={tone}>
      <CheckCircle2 size={16} aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

function ReviewPager({ page, hasNext }: { page: number; hasNext: boolean }) {
  if (page === 1 && !hasNext) return null
  return (
    <nav className="admin-review-pager" aria-label="记录分页">
      {page > 1 ? (
        <Link className="admin-page-nav" href={`/admin?tab=review&page=${page - 1}`}>
          上一页
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">第 {page} 页</span>
      {hasNext ? (
        <Link className="admin-page-nav" href={`/admin?tab=review&page=${page + 1}`}>
          下一页
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}

function AdminToolAvatar({
  id,
  name,
  hasLogo,
  logoKey,
}: {
  id: string
  name: string
  hasLogo: boolean
  logoKey: string | null
}) {
  const brandSrc = logoKey && (brandKeys as readonly string[]).includes(logoKey) ? `/brands/${logoKey}.svg` : null
  const src = hasLogo ? `/api/admin/tool-media/${id}/logo` : brandSrc
  return (
    <span className="tool-logo admin-tool-thumb" data-brand={hasLogo ? '' : (logoKey ?? '')}>
      {src ? (
        <img src={src} width="26" height="26" alt="" decoding="async" />
      ) : (
        <span>{name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  )
}

export async function ReviewPanel({ adminId, result, page }: { adminId: string; result?: string; page: number }) {
  const queue = await getReviewQueue(adminId, page).catch(() => null)
  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div className="admin-title-group">
          <h1>待审核投稿</h1>
          {queue && (
            <span className="admin-count-chip">
              本页 {queue.items.length} 条
            </span>
          )}
        </div>
      </div>

      {result === 'published' && <AdminNotice message="工具已收录，原始投稿记录已保留。" />}
      {result === 'rejected' && <AdminNotice message="投稿已驳回，用户可在提交历史查看原因。" tone="info" />}

      {!queue ? (
        <AdminUnavailable />
      ) : queue.items.length === 0 ? (
        <div className="admin-empty-state">
          <span className="admin-empty-icon" aria-hidden="true">
            <Inbox size={26} />
          </span>
          <h3>{page > 1 ? '这一页没有待审核投稿' : '审核队列已清空'}</h3>
          <p>
            {page > 1
              ? '当前页暂无待处理投稿，可返回上一页查看。'
              : '当前页没有待审核投稿。你也可以前往工具管理直接收录新工具。'}
          </p>
          <div className="admin-empty-actions">
            {page > 1 ? (
              <Link className="primary-action" href="/admin?tab=review">
                回到第一页
              </Link>
            ) : (
              <Link className="primary-action" href="/admin?tab=tools&new=1">
                <Plus size={16} aria-hidden="true" />
                直接收录工具
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <ul className="admin-review-list">
            {queue.items.map(item => {
              const safeWebsite = websiteUrl(item.website)
              return (
                <li key={item.id} className="admin-review-card">
                  <div className="admin-review-top">
                    <div className="admin-review-identity">
                      <span className="admin-review-logo">
                        {item.hasLogo ? (
                          <img loading="lazy" src={`/api/submission-media/${item.id}/logo`} alt={`${item.name} Logo`} />
                        ) : (
                          <span>{item.name.slice(0, 1).toUpperCase()}</span>
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="admin-review-title-row">
                          <h3>{item.name}</h3>
                          <code className="admin-slug-tag">{item.slug}</code>
                          <span className="admin-category-pill">{item.categoryName}</span>
                          {!item.categoryEnabled && (
                            <span className="admin-status-pill" data-tone="danger">
                              <AlertTriangle size={12} aria-hidden="true" />
                              分类已停用
                            </span>
                          )}
                        </div>
                        <div className="admin-review-meta">
                          <span>
                            <UserRound size={13} aria-hidden="true" />
                            {item.submitterName ?? '账号已注销'}
                          </span>
                          <span>
                            <Clock3 size={13} aria-hidden="true" />
                            <time dateTime={item.submittedAt.toISOString()}>{dateFormat.format(item.submittedAt)}</time>
                          </span>
                        </div>
                      </div>
                    </div>

                    {safeWebsite && (
                      <a
                        className="admin-website-chip"
                        href={item.website}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                        <span>访问投稿官网</span>
                      </a>
                    )}
                  </div>

                  <p className="admin-review-summary">{item.summary}</p>

                  {item.hasCover && (
                    <div className="admin-review-cover">
                      <img loading="lazy" src={`/api/submission-media/${item.id}/cover`} alt={`${item.name} 预览图`} />
                    </div>
                  )}

                  <details className="admin-markdown-details">
                    <summary>
                      <FileText size={15} aria-hidden="true" />
                      <span>展开完整 Markdown 详细介绍</span>
                    </summary>
                    <div className="markdown admin-markdown-body">
                      <Markdown skipHtml disallowedElements={['img']}>
                        {item.content}
                      </Markdown>
                    </div>
                  </details>

                  <ReviewForm id={item.id} categoryEnabled={item.categoryEnabled} />
                </li>
              )
            })}
          </ul>
          <ReviewPager page={page} hasNext={queue.hasNext} />
        </>
      )}
    </section>
  )
}

export async function CategoryPanel({
  saved,
  page,
  query,
}: {
  saved: boolean
  page: number
  query: { q?: string; status?: string; edit?: string; new?: string; changed?: string; pageSize?: string }
}) {
  const categories = await getCategories(true).catch(() => null)
  if (!categories) return <AdminUnavailable />

  if (query.new === '1' || query.edit !== undefined) {
    const category = categories.find(item => item.id === query.edit)
    return (
      <section className="admin-card">
        <div className="admin-subview-head">
          <div>
            <Link className="admin-back-link" href="/admin?tab=categories">
              <ArrowLeft size={15} aria-hidden="true" />
              返回分类列表
            </Link>
            <h1>{query.edit !== undefined ? `编辑分类${category ? ` · ${category.name}` : ''}` : '新增分类'}</h1>
          </div>
        </div>
        {query.edit !== undefined && !category ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>分类不存在，请返回列表重试。</AlertDescription>
          </Alert>
        ) : (
          <CategoryForm key={category?.id ?? 'new'} category={query.edit !== undefined ? category : undefined} />
        )}
      </section>
    )
  }

  const q = query.q?.trim().slice(0, 100) ?? ''
  const status = ['enabled', 'disabled'].includes(query.status ?? '') ? query.status! : ''
  const filtered = categories.filter(
    item =>
      `${item.name} ${item.id} ${item.short}`.toLowerCase().includes(q.toLowerCase()) &&
      (!status || item.isEnabled === (status === 'enabled')),
  )
  const pagination = adminPagination(filtered.length, page, query.pageSize)
  const items = filtered.slice(pagination.offset, pagination.offset + pagination.pageSize)
  const hasFilters = Boolean(q || status)

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div className="admin-title-group">
          <h1>分类列表</h1>
          <span className="admin-count-chip">
            共 {filtered.length} 条 · 每页 {pagination.pageSize} 条
          </span>
          {hasFilters && <span className="admin-filter-pill">已筛选</span>}
        </div>
        <Link className="primary-action admin-cta" href="/admin?tab=categories&new=1">
          <FolderPlus size={15} aria-hidden="true" />
          新增分类
        </Link>
      </div>

      {saved && <AdminNotice message="分类已保存。" />}
      {query.changed === '1' && <AdminNotice message="分类启停状态已更新。" />}

      <form method="GET" action="/admin" className="admin-filters">
        <input type="hidden" name="tab" value="categories" />
        <input type="hidden" name="pageSize" value={pagination.pageSize} />
        <label className="admin-filter-search">
          <span className="sr-only">关键词</span>
          <div className="admin-input-wrap">
            <Search size={14} aria-hidden="true" />
            <input name="q" defaultValue={q} maxLength={100} placeholder="搜索分类名称、短名或标识…" />
          </div>
        </label>
        <label className="admin-filter-select">
          <span className="sr-only">状态</span>
          <select name="status" defaultValue={status}>
            <option value="">全部状态</option>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
        </label>
        <button className="admin-query-btn" type="submit">
          <ListFilter size={14} aria-hidden="true" />
          查询
        </button>
      </form>

      <div className="admin-table-wrap" role="region" aria-label="分类列表，可横向滚动" tabIndex={0}>
        <table className="admin-table">
          <caption className="sr-only">工具分类列表</caption>
          <thead>
            <tr>
              <th scope="col">分类名称 / 标识</th>
              <th scope="col">短名称</th>
              <th scope="col">图标</th>
              <th scope="col">排序</th>
              <th scope="col">状态</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const Icon = getCategoryIcon(item.iconKey)
              return (
                <tr key={item.id}>
                  <td>
                    <div className="admin-cell-entity">
                      <span className="admin-icon-badge" aria-hidden="true">
                        <Icon size={17} />
                      </span>
                      <div className="min-w-0">
                        <strong className="admin-entity-title">{item.name}</strong>
                        <code className="admin-entity-slug">{item.id}</code>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="admin-pill-subtle">{item.short}</span>
                  </td>
                  <td>
                    <span className="admin-icon-key-chip">
                      <Icon size={14} aria-hidden="true" />
                      <span>{item.iconKey}</span>
                    </span>
                  </td>
                  <td>
                    <span className="admin-order-chip">#{item.sortOrder}</span>
                  </td>
                  <td>
                    <span className="admin-status-pill" data-tone={item.isEnabled ? 'success' : 'muted'}>
                      <span aria-hidden="true" />
                      {item.isEnabled ? '启用' : '停用'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <Link
                        className="admin-row-btn admin-row-btn-edit"
                        href={`/admin?tab=categories&edit=${encodeURIComponent(item.id)}`}
                      >
                        <Pencil size={14} aria-hidden="true" />
                        <span>编辑</span>
                      </Link>
                      <CategoryStatusAction id={item.id} enabled={item.isEnabled} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {!items.length && (
              <tr>
                <td colSpan={6} className="admin-table-empty">
                  <div className="admin-empty-inline">
                    <FolderTree size={22} aria-hidden="true" />
                    <p>
                      {q || status
                        ? '没有符合查询条件的分类。'
                        : page > 1
                          ? '这一页没有分类，请返回上一页。'
                          : '暂无分类，点击“新增分类”开始创建。'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination tab="categories" params={{ q, status }} pagination={pagination} />
    </section>
  )
}

export async function ToolsPanel({
  adminId,
  page,
  saved,
  query,
}: {
  adminId: string
  page: number
  saved: boolean
  query: {
    q?: string
    status?: string
    category?: string
    edit?: string
    new?: string
    deleted?: string
    changed?: string
    pageSize?: string
  }
}) {
  const categories = await getCategories(true).catch(() => null)
  if (!categories) return <AdminUnavailable />

  if (query.new === '1' || query.edit !== undefined) {
    const tool =
      query.edit && validRecordId(query.edit)
        ? await directoryStore.getManagedTool(adminId, query.edit).catch(() => null)
        : undefined
    return (
      <section className="admin-card">
        <div className="admin-subview-head">
          <div>
            <Link className="admin-back-link" href="/admin?tab=tools">
              <ArrowLeft size={15} aria-hidden="true" />
              返回工具列表
            </Link>
            <h1>{query.edit !== undefined ? `编辑工具${tool ? ` · ${tool.name}` : ''}` : '新增工具'}</h1>
          </div>
          {tool && tool.status === 'published' && (
            <Link
              className="admin-website-chip"
              href={`/tools/${tool.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} aria-hidden="true" />
              <span>查看公开详情</span>
            </Link>
          )}
        </div>
        {query.edit !== undefined && !tool ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>工具不存在、已删除或暂时无法加载。请返回列表重试。</AlertDescription>
          </Alert>
        ) : (
          <ManagedToolForm key={tool?.id ?? 'new'} tool={tool ?? undefined} categories={categories} />
        )}
      </section>
    )
  }

  const q = query.q?.trim().slice(0, 100) ?? ''
  const status = ['published', 'disabled'].includes(query.status ?? '') ? query.status! : ''
  const category = query.category ?? ''
  const pageSize = adminPageSize(query.pageSize)
  const result = await directoryStore
    .getManagedTools(adminId, page, { query: q, status, category, pageSize })
    .catch(() => null)
  const hasFilters = Boolean(q || status || category)

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div className="admin-title-group">
          <h1>工具列表</h1>
          {result && (
            <span className="admin-count-chip">
              共 {result.total} 条 · 每页 {result.pageSize} 条
            </span>
          )}
          {hasFilters && <span className="admin-filter-pill">已筛选</span>}
        </div>
        <Link className="primary-action admin-cta" href="/admin?tab=tools&new=1">
          <CirclePlus size={15} aria-hidden="true" />
          新增工具
        </Link>
      </div>

      {saved && <AdminNotice message="工具已保存。" />}
      {query.deleted === '1' && <AdminNotice message="工具已删除，原始投稿与审核记录保留。" tone="info" />}
      {query.changed === '1' && <AdminNotice message="上下架状态已更新。" />}

      <form method="GET" action="/admin" className="admin-filters">
        <input type="hidden" name="tab" value="tools" />
        <input type="hidden" name="pageSize" value={pageSize} />
        <label className="admin-filter-search">
          <span className="sr-only">关键词</span>
          <div className="admin-input-wrap">
            <Search size={14} aria-hidden="true" />
            <input name="q" defaultValue={q} maxLength={100} placeholder="搜索工具名称、标识或网址…" />
          </div>
        </label>
        <label className="admin-filter-select">
          <span className="sr-only">分类</span>
          <select name="category" defaultValue={category}>
            <option value="">全部分类</option>
            {categories.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-filter-select">
          <span className="sr-only">状态</span>
          <select name="status" defaultValue={status}>
            <option value="">全部状态</option>
            <option value="published">已上架</option>
            <option value="disabled">已下架</option>
          </select>
        </label>
        <button className="admin-query-btn" type="submit">
          <ListFilter size={14} aria-hidden="true" />
          查询
        </button>
      </form>

      {!result ? (
        <AdminUnavailable />
      ) : (
        <>
          <div className="admin-table-wrap" role="region" aria-label="工具列表，可横向滚动" tabIndex={0}>
            <table className="admin-table">
              <caption className="sr-only">正式 AI 工具列表</caption>
              <thead>
                <tr>
                  <th scope="col">工具名称 / 标识</th>
                  <th scope="col">分类</th>
                  <th scope="col">状态</th>
                  <th scope="col">排序 / 热门</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map(tool => {
                  const safeSite = websiteUrl(tool.website)
                  return (
                    <tr key={tool.id}>
                      <td>
                        <div className="admin-cell-entity">
                          <AdminToolAvatar
                            id={tool.id}
                            name={tool.name}
                            hasLogo={tool.hasLogo}
                            logoKey={tool.logoKey}
                          />
                          <div className="min-w-0">
                            <div className="admin-entity-title-row">
                              <strong className="admin-entity-title">{tool.name}</strong>
                              {safeSite && (
                                <a
                                  href={tool.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="admin-external-dot"
                                  title={`打开官网：${safeSite.hostname}`}
                                  aria-label={`打开 ${tool.name} 官网`}
                                >
                                  <ExternalLink size={13} aria-hidden="true" />
                                </a>
                              )}
                            </div>
                            <code className="admin-entity-slug">{tool.slug}</code>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="admin-category-pill">{tool.categoryName}</span>
                      </td>
                      <td>
                        <span
                          className="admin-status-pill"
                          data-tone={tool.status === 'published' ? 'success' : 'muted'}
                        >
                          <span aria-hidden="true" />
                          {tool.status === 'published' ? '已上架' : '已下架'}
                        </span>
                      </td>
                      <td>
                        <div className="admin-rank-group">
                          <span className="admin-order-chip">排序 #{tool.displayOrder}</span>
                          {tool.featuredOrder !== null ? (
                            <span className="admin-featured-chip">
                              <Flame size={12} aria-hidden="true" />
                              热门 #{tool.featuredOrder}
                            </span>
                          ) : (
                            <span className="admin-unfeatured-text">未推荐</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <Link className="admin-row-btn admin-row-btn-edit" href={`/admin?tab=tools&edit=${tool.id}`}>
                            <Pencil size={14} aria-hidden="true" />
                            <span>编辑</span>
                          </Link>
                          <ToolStatusAction id={tool.id} status={tool.status} />
                          <ToolDeleteAction id={tool.id} name={tool.name} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!result.items.length && (
                  <tr>
                    <td colSpan={5} className="admin-table-empty">
                      <div className="admin-empty-inline">
                        <Sparkles size={22} aria-hidden="true" />
                        <p>
                          {q || status || category
                            ? '没有符合查询条件的工具。'
                            : page > 1
                              ? '这一页没有工具，请返回上一页。'
                              : '暂无工具，点击“新增工具”开始收录。'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <AdminPagination tab="tools" params={{ q, status, category }} pagination={result} />
        </>
      )}
    </section>
  )
}
