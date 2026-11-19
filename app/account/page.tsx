import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { signOut } from '@/app/login/actions'
import { SubmissionHistory, SubmissionPanel } from '@/components/account-panels'
import { SubHeader } from '@/components/sub-header'
import { Button } from '@/components/ui/button'
import { pageNumber } from '@/lib/catalog'
import { getCurrentUser } from '@/lib/directory-auth'

export const metadata: Metadata = { title: '个人中心', robots: { index: false } }
export const dynamic = 'force-dynamic'
const views = [{ id: 'history', title: '提交历史' }, { id: 'submit', title: '提交工具' }, { id: 'profile', title: '个人信息' }]

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string; submitted?: string; signout?: string }> }) {
  const query = await searchParams
  if (['review', 'categories', 'tools'].includes(query.tab ?? '')) redirect(`/admin?tab=${query.tab}`)
  const user = await getCurrentUser()
  if (!user) redirect(query.tab === 'submit' ? '/login?next=submit' : '/login')
  const active = views.find(view => view.id === query.tab)?.id ?? 'history'
  return <><SubHeader hideAccount /><main className="subpage">
    <div className="account-heading"><h1>个人中心</h1><p>推荐有价值的 AI 工具，管理你的提交和账号。</p></div>
    <nav className="account-tabs" aria-label="个人中心页面">{views.map(({ id, title }) => <Link key={id} href={id === 'history' ? '/account' : `/account?tab=${id}`} aria-current={active === id ? 'page' : undefined}>{title}</Link>)}</nav>
    {active === 'history' && <SubmissionHistory userId={user.id} page={pageNumber(query.page)} submitted={query.submitted === '1'} />}
    {active === 'submit' && <SubmissionPanel />}
    {active === 'profile' && <section className="surface account-panel"><h2>个人信息</h2><dl className="profile-data"><dt>邮箱</dt><dd>{user.email}</dd><dt>账号类型</dt><dd>前台用户</dd></dl>
      {query.signout === 'failed' && <p role="alert" className="mb-3 text-sm text-destructive">暂未退出，请重试。</p>}
      <form action={signOut}><Button type="submit" variant="outline" className="min-h-11"><LogOut aria-hidden="true" />退出登录</Button></form>
    </section>}
  </main></>
}
