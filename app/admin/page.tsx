import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FolderTree, LogOut, Settings2, ShieldCheck } from 'lucide-react'
import { adminSignOut } from '@/app/admin/actions'
import { CategoryPanel, ReviewPanel, ToolsPanel } from '@/components/account-panels'
import { Brand } from '@/components/catalog-elements'
import { Button } from '@/components/ui/button'
import { pageNumber } from '@/lib/catalog'
import { getCurrentAdmin } from '@/lib/admin-auth'

export const metadata: Metadata = { title: '后台管理', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
const views = [
  { id: 'review', title: '审核队列', description: '审核用户投稿，通过后收录到公开目录。', icon: ShieldCheck },
  { id: 'categories', title: '分类管理', description: '维护导航分类、展示顺序和启用状态。', icon: FolderTree },
  { id: 'tools', title: 'AI 工具', description: '收录、编辑工具，管理热门排序与发布状态。', icon: Settings2 },
] as const

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string; pageSize?: string; review?: string; saved?: string; signout?: string; q?: string; status?: string; category?: string; edit?: string; new?: string; deleted?: string; changed?: string }> }) {
  const query = await searchParams
  const active = views.find(view => view.id === query.tab) ?? views[0]
  const user = await getCurrentAdmin()
  if (!user) redirect(`/admin/login?tab=${active.id}`)
  const page = pageNumber(query.page)
  return <div className="admin-shell">
    <aside className="admin-sidebar"><Brand /><p className="admin-label">后台管理</p><nav aria-label="后台管理导航">{views.map(({ id, title, icon: Icon }) => <Link key={id} href={`/admin?tab=${id}`} aria-current={active.id === id ? 'page' : undefined}><Icon size={18} aria-hidden="true" />{title}</Link>)}</nav><div className="admin-sidebar-footer"><Link href="/">返回工具导航</Link><Link href="/account">个人中心</Link></div></aside>
    <div className="admin-pane"><header className="admin-header"><span><ShieldCheck size={17} aria-hidden="true" />管理员工作台</span><div className="admin-session"><span title={user.email}>{user.email}</span><form action={adminSignOut}><Button variant="outline" className="min-h-11"><LogOut aria-hidden="true" />退出后台</Button></form></div></header>
      <main className="admin-main"><div className="account-heading"><h1>{active.title}</h1><p>{active.description}</p></div>
        {query.signout === 'failed' && <p role="alert">暂未退出后台，请重试。</p>}
        {active.id === 'review' && <ReviewPanel adminId={user.id} page={page} result={query.review} />}
        {active.id === 'categories' && <CategoryPanel saved={query.saved === '1'} page={page} query={query} />}
        {active.id === 'tools' && <ToolsPanel adminId={user.id} page={page} saved={query.saved === '1'} query={query} />}
      </main>
    </div>
  </div>
}
