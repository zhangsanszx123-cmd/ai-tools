import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { DirectoryLoginForm } from '@/components/directory-login-form'
import { SubHeader } from '@/components/sub-header'
import { isAuthConfigured } from '@/lib/directory-auth'
import { getCurrentAdmin } from '@/lib/admin-auth'

export const metadata: Metadata = { title: '后台登录', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const destination = `/admin?tab=${['review', 'categories', 'tools'].includes(tab ?? '') ? tab : 'review'}`
  if (await getCurrentAdmin()) redirect(destination)
  return <><SubHeader hideAccount /><main className="subpage login-page"><div className="surface login-card">
    <span className="brand-mark"><ShieldCheck size={22} aria-hidden="true" /></span><h1>后台管理登录</h1><p>使用已授权的管理员邮箱和密码登录，处理投稿、维护分类和工具。</p>
    <DirectoryLoginForm admin signup={false} submit={false} destination={destination} available={isAuthConfigured()} />
    <p className="login-switch">后台账号独立管理，不开放注册。前台登录状态不会用于后台。<Link className="text-action" href="/login">前台用户登录</Link></p>
  </div></main></>
}
