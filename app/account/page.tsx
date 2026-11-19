import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CircleCheck, ClipboardList, FolderTree, LogOut, Plus, Settings2, ShieldCheck, UserRound } from 'lucide-react'
import Markdown from 'react-markdown'
import { signOut } from '@/app/login/actions'
import { CategoryForm, ManagedToolForm } from '@/components/directory-admin-forms'
import { ReviewForm } from '@/components/review-form'
import { SubmissionForm } from '@/components/submission-form'
import { SubHeader } from '@/components/sub-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { pageNumber, websiteUrl } from '@/lib/catalog'
import { getCurrentUser } from '@/lib/directory-auth'
import { directoryStore, getCategories } from '@/lib/directory-db'
import type { SubmissionItem } from '@/lib/directory-store'
import { getReviewQueue, getSubmissionHistory, isAdmin } from '@/lib/directory-submissions'

export const metadata: Metadata = { title: '个人中心', robots: { index: false } }
export const dynamic = 'force-dynamic'

const views = [
  { id: 'history', title: '提交历史', icon: ClipboardList, admin: false },
  { id: 'submit', title: '提交工具', icon: Plus, admin: false },
  { id: 'profile', title: '个人信息', icon: UserRound, admin: false },
  { id: 'review', title: '审核队列', icon: ShieldCheck, admin: true },
  { id: 'categories', title: '分类管理', icon: FolderTree, admin: true },
  { id: 'tools', title: '工具管理', icon: Settings2, admin: true },
] as const
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' })

function Unavailable() { return <Alert><AlertDescription>暂时无法加载数据，请稍后刷新重试。</AlertDescription></Alert> }

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string; submitted?: string; signout?: string; review?: string; saved?: string; page?: string }> }) {
  const query = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(query.tab === 'submit' ? '/login?next=submit' : '/login')
  const admin = await isAdmin(user.id)
  const active = views.find(view => view.id === query.tab && (!view.admin || admin))?.id ?? 'history'
  const page = pageNumber(query.page)
  return <><SubHeader hideAccount /><main className="subpage">
    <div className="account-heading"><h1>个人中心</h1><p>推荐有价值的 AI 工具，管理你的提交和账号。</p></div>
    <nav className="account-tabs" aria-label="个人中心页面">{views.filter(view => !view.admin || admin).map(({ id, title, icon: Icon }) => <Link key={id} href={id === 'history' ? '/account' : `/account?tab=${id}`} aria-current={active === id ? 'page' : undefined}><Icon size={16} aria-hidden="true" />{title}</Link>)}</nav>
    {active === 'history' && <SubmissionHistory userId={user.id} page={page} submitted={query.submitted === '1'} />}
    {active === 'submit' && <SubmissionPanel />}
    {active === 'profile' && <section className="surface account-panel"><h2>个人信息</h2><dl className="profile-data"><dt>昵称</dt><dd>{user.name}</dd><dt>邮箱</dt><dd>{user.email}</dd><dt>账号权限</dt><dd>{admin ? '管理员' : '普通用户'}</dd></dl>
      {query.signout === 'failed' && <p role="alert" className="mb-3 text-sm text-destructive">暂未退出，请重试。</p>}
      <form action={signOut}><Button type="submit" variant="outline" className="min-h-11"><LogOut aria-hidden="true" />退出登录</Button></form>
    </section>}
    {active === 'review' && <ReviewPanel adminId={user.id} page={page} result={query.review} />}
    {active === 'categories' && <CategoryPanel saved={query.saved === '1'} />}
    {active === 'tools' && <ToolsPanel adminId={user.id} page={page} saved={query.saved === '1'} />}
  </main></>
}

async function SubmissionPanel() {
  const categories = await getCategories().catch(() => null)
  return <section className="surface account-panel"><h2>提交新的 AI 工具</h2><p className="mb-5 text-sm text-muted-foreground">提交后进入审核队列，通过后才会公开收录。投稿内容与审核结果会保留在提交历史中。</p>{categories ? <SubmissionForm categories={categories} /> : <Unavailable />}</section>
}

function Pager({ page, hasNext, tab }: { page: number; hasNext: boolean; tab: string }) {
  if (page === 1 && !hasNext) return null
  return <nav className="account-pagination" aria-label="记录分页">
    {page > 1 ? <Link className="text-action" href={`/account?tab=${tab}&page=${page - 1}`}>上一页</Link> : <span />}
    <span>第 {page} 页</span>
    {hasNext ? <Link className="text-action" href={`/account?tab=${tab}&page=${page + 1}`}>下一页</Link> : <span />}
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

async function SubmissionHistory({ userId, submitted, page }: { userId: string; submitted: boolean; page: number }) {
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

async function ReviewPanel({ adminId, result, page }: { adminId: string; result?: string; page: number }) {
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

async function CategoryPanel({ saved }: { saved: boolean }) {
  const categories = await getCategories(true).catch(() => null)
  return <section className="surface account-panel"><h2>分类管理</h2><p className="mb-4 text-sm text-muted-foreground">分类标识创建后固定。停用会隐藏该分类下的公开工具，不删除任何内容。</p>
    {saved && <p role="status" className="mb-4 text-sm text-muted-foreground">分类已保存。</p>}
    {!categories ? <Unavailable /> : <div className="grid gap-3"><details className="admin-editor"><summary>新增分类</summary><CategoryForm /></details>{categories.map(category => <details key={category.id} className="admin-editor"><summary>{category.name}<span className="editor-state">{category.isEnabled ? '启用' : '停用'} · 排序 {category.sortOrder}</span></summary><CategoryForm category={category} /></details>)}</div>}
  </section>
}

async function ToolsPanel({ adminId, page, saved }: { adminId: string; page: number; saved: boolean }) {
  const result = await Promise.all([getCategories(true), directoryStore.getManagedTools(adminId, page)]).catch(() => null)
  return <section className="surface account-panel"><h2>工具管理</h2><p className="mb-4 text-sm text-muted-foreground">直接收录或编辑正式工具，设置热门排序，或将工具下架。原始投稿不会随编辑改变。</p>
    {saved && <p role="status" className="mb-4 text-sm text-muted-foreground">工具已保存。</p>}
    {!result ? <Unavailable /> : <>
      <div className="grid gap-3"><details className="admin-editor"><summary>直接收录工具</summary><ManagedToolForm categories={result[0]} /></details>
        {result[1].items.map(tool => <details className="admin-editor" key={tool.id}><summary>{tool.name}<span className="editor-state">{tool.status === 'published' ? '发布' : '下架'} · {tool.categoryName}</span></summary><ManagedToolForm tool={tool} categories={result[0]} /></details>)}
      </div><Pager page={page} tab="tools" hasNext={result[1].hasNext} />
    </>}
  </section>
}
