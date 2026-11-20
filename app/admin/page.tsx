import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertCircle,
  ChevronRight,
  ExternalLink,
  FolderTree,
  LogOut,
  Settings2,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { adminSignOut } from '@/app/admin/actions'
import { CategoryPanel, ReviewPanel, ToolsPanel } from '@/components/admin-panels'
import { UsersPanel } from '@/components/admin-users-panel'
import { Brand } from '@/components/catalog-elements'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { pageNumber } from '@/lib/catalog'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { directoryStore } from '@/lib/directory-db'

export const metadata: Metadata = { title: '后台管理', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const views = [
  { id: 'review', title: '审核队列', icon: ShieldCheck },
  { id: 'categories', title: '分类管理', icon: FolderTree },
  { id: 'tools', title: 'AI 工具', icon: Settings2 },
  { id: 'users', title: '前端用户', icon: UserRound },
  { id: 'admins', title: '后端用户', icon: ShieldCheck },
] as const

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string
    page?: string
    pageSize?: string
    review?: string
    saved?: string
    signout?: string
    q?: string
    status?: string
    category?: string
    edit?: string
    new?: string
    deleted?: string
    changed?: string
  }>
}) {
  const query = await searchParams
  const active = views.find(view => view.id === query.tab) ?? views[0]
  const user = await getCurrentAdmin()
  if (!user) redirect(`/admin/login?tab=${active.id}`)

  const page = pageNumber(query.page)
  const overview = await directoryStore.getAdminOverview(user.id).catch(() => null)
  const ActiveIcon = active.icon
  const adminInitial = (user.email.trim()[0] ?? 'A').toUpperCase()

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-top">
          <Brand />
          <span className="admin-console-badge">
            <ShieldCheck size={12} aria-hidden="true" />
            管理控制台
          </span>
        </div>

        <div className="admin-nav-group">
          <p className="admin-nav-label">运营管理</p>
          <nav aria-label="后台管理导航">
            {views.map(({ id, title, icon: Icon }) => {
              const current = active.id === id
              const pendingCount = id === 'review' ? (overview?.pendingSubmissions ?? 0) : 0
              return (
                <Link key={id} href={`/admin?tab=${id}`} aria-current={current ? 'page' : undefined}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{title}</span>
                  {pendingCount > 0 && (
                    <span className="admin-nav-badge" aria-label={`${pendingCount} 条待审核`}>
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="admin-sidebar-footer">
          <p className="admin-nav-label">快捷入口</p>
          <Link href="/">
            <ExternalLink size={16} aria-hidden="true" />
            <span>返回工具导航</span>
          </Link>
          <Link href="/account">
            <UserRound size={16} aria-hidden="true" />
            <span>个人中心</span>
          </Link>
        </div>
      </aside>

      <div className="admin-pane">
        <header className="admin-header">
          <div className="admin-breadcrumb">
            <span className="admin-breadcrumb-root">
              <ShieldCheck size={16} aria-hidden="true" />
              管理员工作台
            </span>
            <ChevronRight size={14} className="admin-breadcrumb-sep" aria-hidden="true" />
            <span className="admin-breadcrumb-current">
              <ActiveIcon size={15} aria-hidden="true" />
              {active.title}
            </span>
          </div>

          <div className="admin-session">
            <Link href="/" className="admin-header-visit" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} aria-hidden="true" />
              <span>预览前台</span>
            </Link>
            <div className="admin-user-chip" title={user.email}>
              <span className="admin-user-avatar" aria-hidden="true">{adminInitial}</span>
              <span className="admin-user-info">
                <strong>{user.email}</strong>
                <small>独立管理员</small>
              </span>
            </div>
            <form action={adminSignOut}>
              <Button variant="outline" className="admin-signout-btn min-h-10">
                <LogOut aria-hidden="true" />
                退出后台
              </Button>
            </form>
          </div>
        </header>

        <main className="admin-main">
          {(active.id === 'users' || active.id === 'admins') && <UsersPanel adminId={user.id} kind={active.id} page={page} query={query} />}
          {query.signout === 'failed' && (
            <Alert variant="destructive" className="mb-5">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>暂未退出后台，请重试。</AlertDescription>
            </Alert>
          )}

          {active.id === 'review' && <ReviewPanel adminId={user.id} page={page} result={query.review} />}
          {active.id === 'categories' && <CategoryPanel saved={query.saved === '1'} page={page} query={query} />}
          {active.id === 'tools' && <ToolsPanel adminId={user.id} page={page} saved={query.saved === '1'} query={query} />}
        </main>
      </div>
    </div>
  )
}
