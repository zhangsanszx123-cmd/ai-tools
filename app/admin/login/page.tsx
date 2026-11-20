import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, FolderTree, Lock, Settings2, ShieldCheck } from 'lucide-react'
import { Brand } from '@/components/catalog-elements'
import { DirectoryLoginForm } from '@/components/directory-login-form'
import { isAuthConfigured } from '@/lib/directory-auth'
import { getCurrentAdmin } from '@/lib/admin-auth'

export const metadata: Metadata = { title: '后台登录', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const destination = `/admin?tab=${['review', 'categories', 'tools', 'users', 'admins', 'media'].includes(tab ?? '') ? tab : 'review'}`
  if (await getCurrentAdmin()) redirect(destination)

  return (
    <div className="admin-login-shell">
      <header className="admin-login-header">
        <div className="admin-login-header-inner">
          <Brand />
          <Link className="admin-login-back" href="/">
            <ArrowLeft size={15} aria-hidden="true" />
            <span>返回工具导航</span>
          </Link>
        </div>
      </header>

      <main className="admin-login-main">
        <div className="admin-login-grid">
          <section className="admin-login-showcase" aria-hidden="true">
            <span className="admin-login-pill">
              <ShieldCheck size={14} />
              AI 工具箱 · 独立后台控制台
            </span>
            <h2>高效运营目录内容，安全守护数据边界</h2>
            <p>
              统一管理用户投稿审核、导航分类编排与正式工具收录，所有管理会话均与前台普通账号完全隔离。
            </p>
            <ul className="admin-login-features">
              <li>
                <span className="admin-login-feature-icon"><ShieldCheck size={17} /></span>
                <div>
                  <strong>原子化投稿审核</strong>
                  <small>一键通过收录或反馈驳回原因，保留完整原始快照</small>
                </div>
              </li>
              <li>
                <span className="admin-login-feature-icon"><FolderTree size={17} /></span>
                <div>
                  <strong>可视化分类与排序</strong>
                  <small>灵活维护导航图标、展示顺序与分类启停状态</small>
                </div>
              </li>
              <li>
                <span className="admin-login-feature-icon"><Settings2 size={17} /></span>
                <div>
                  <strong>全生命周期工具管理</strong>
                  <small>直接收录、热门精选推荐、上下架与安全软删除</small>
                </div>
              </li>
            </ul>
            <div className="admin-login-security-foot">
              <Lock size={14} />
              <span>独立 admin_user 鉴权 · 8 小时安全会话 · 限流防护</span>
            </div>
          </section>

          <section className="admin-login-card">
            <div className="admin-login-card-head">
              <span className="brand-mark">
                <ShieldCheck size={22} aria-hidden="true" />
              </span>
              <h1>后台管理登录</h1>
              <p>使用已授权的管理员邮箱和密码登录，处理投稿、维护分类和工具。</p>
            </div>

            <DirectoryLoginForm
              admin
              signup={false}
              submit={false}
              destination={destination}
              available={isAuthConfigured()}
            />

            <div className="admin-login-footnote">
              <p>后台账号独立管理，不开放注册。前台登录状态不会用于后台。</p>
              <Link className="text-action" href="/login">
                前往前台用户登录
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
