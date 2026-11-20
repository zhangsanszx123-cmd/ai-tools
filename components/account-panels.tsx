import Link from 'next/link'
import { CircleCheck } from 'lucide-react'
import Markdown from 'react-markdown'
import { SubmissionForm } from '@/components/submission-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { websiteUrl } from '@/lib/catalog'
import { getCategories } from '@/lib/directory-db'
import type { SubmissionItem } from '@/lib/directory-store'
import { getSubmissionHistory } from '@/lib/directory-submissions'

export { CategoryPanel, ReviewPanel, ToolsPanel } from './admin-panels'

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
