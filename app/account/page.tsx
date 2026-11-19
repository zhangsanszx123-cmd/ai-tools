import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CircleCheck, ClipboardList, LogOut, Plus, ShieldCheck, UserRound } from 'lucide-react'
import Markdown from 'react-markdown'
import { approveTool } from './actions'
import { signOut } from '@/app/login/actions'
import { SubmissionForm } from '@/components/submission-form'
import { SubHeader } from '@/components/sub-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { websiteUrl } from '@/lib/catalog'
import { getCurrentUser } from '@/lib/directory-auth'
import { getReviewQueue, getSubmissionHistory, isAdmin } from '@/lib/directory-submissions'

export const metadata: Metadata = { title: '个人中心', robots: { index: false } }
export const dynamic = 'force-dynamic'

const views = [ { id: 'history', title: '提交历史', icon: ClipboardList }, { id: 'submit', title: '提交表单', icon: Plus }, { id: 'profile', title: '个人信息', icon: UserRound }, { id: 'review', title: '审核队列', icon: ShieldCheck } ] as const
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' })

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string; submitted?: string; signout?: string; review?: string }> }) {
  const { tab, submitted, signout, review } = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(tab === 'submit' ? '/login?next=submit' : '/login')
  const admin = await isAdmin(user.id)
  const active = tab === 'submit' || tab === 'profile' || (tab === 'review' && admin) ? tab : 'history'
  return <><SubHeader hideAccount /><main className="subpage">
    <div className="account-heading"><h1>个人中心</h1><p>推荐有价值的 AI 工具，管理你的提交和账号。</p></div>
    <nav className="account-tabs" aria-label="个人中心页面">{views.filter(({ id }) => id !== 'review' || admin).map(({ id, title, icon: Icon }) => <Link key={id} href={id === 'history' ? '/account' : `/account?tab=${id}`} aria-current={active === id ? 'page' : undefined}><Icon size={16} aria-hidden="true" />{title}</Link>)}</nav>
    {active === 'history' && <SubmissionHistory userId={user.id} submitted={submitted === '1'} />}
    {active === 'submit' && <section className="surface account-panel"><h2>提交新的 AI 工具</h2><p className="text-sm text-muted-foreground">提交后进入审核队列，通过审核的工具将展示在目录中。</p><SubmissionForm /></section>}
    {active === 'profile' && <section className="surface account-panel"><h2>个人信息</h2><dl className="profile-data"><dt>昵称</dt><dd>{user.name}</dd><dt>邮箱</dt><dd>{user.email}</dd></dl>
      {signout === 'failed' && <p role="alert" className="mb-3 text-sm text-destructive">暂未退出，请重试。</p>}
      <form action={signOut}><Button type="submit" variant="outline"><LogOut data-icon="inline-start" aria-hidden="true" />退出登录</Button></form>
    </section>}
    {active === 'review' && <ReviewPanel adminId={user.id} result={review} />}
  </main></>
}

async function SubmissionHistory({ userId, submitted }: { userId: string; submitted: boolean }) {
  const history = await getSubmissionHistory(userId)
  return <section className="surface account-panel"><h2>提交历史</h2>
    {submitted && <Alert className="mb-3"><CircleCheck aria-hidden="true" /><AlertDescription>已提交，等待管理员审核。</AlertDescription></Alert>}
    {history.length ? <ul>{history.map((item) => <li key={item.slug} className="history-row"><div>{item.status === 'published' ? <Link className="text-action" href={`/tools/${item.slug}`}>{item.name}</Link> : <strong>{item.name}</strong>}<time dateTime={item.createdAt.toISOString()}>{dateFormat.format(item.createdAt)}</time></div><span className="history-status" data-status={item.status}>{item.status === 'published' ? '已发布' : '审核中'}</span></li>)}</ul> : <div className="catalog-empty">还没有提交记录。 <Link className="text-action" href="/account?tab=submit">推荐第一款工具</Link></div>}
  </section>
}

async function ReviewPanel({ adminId, result }: { adminId: string; result?: string }) {
  const queue = await getReviewQueue(adminId)
  return <section className="surface account-panel"><h2>审核队列</h2>
    {result === 'published' && <p role="status" className="mb-3 text-sm text-muted-foreground">工具已发布到首页目录。</p>}
    {result === 'unavailable' && <p role="alert" className="mb-3 text-sm text-destructive">工具已被处理，或你没有审核权限。</p>}
    {queue.length === 0 ? <p className="catalog-empty">当前没有待审核的工具。</p> : <ul className="grid gap-5">{queue.map((tool) => <li key={tool.slug} className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{tool.name}</h3><p className="text-sm text-muted-foreground">{tool.summary}</p></div><form action={approveTool}><input type="hidden" name="slug" value={tool.slug} /><Button type="submit">审核通过</Button></form></div>
      {websiteUrl(tool.website) && <a className="text-action mt-2 break-all" href={tool.website} target="_blank" rel="noopener noreferrer">查看官网（新标签页）</a>}
      { (tool.hasLogo || tool.hasCover) && <div className="review-media">
        {tool.hasLogo && <img src={`/api/tool-media/${tool.slug}/logo?review=1`} alt="提交的站点标志" />}
        {tool.hasCover && <img src={`/api/tool-media/${tool.slug}/cover?review=1`} alt="提交的站点预览图" />}
      </div>}
      <div className="markdown mt-2"><Markdown skipHtml disallowedElements={['img']}>{tool.content}</Markdown></div>
    </li>)}</ul>}
  </section>
}
