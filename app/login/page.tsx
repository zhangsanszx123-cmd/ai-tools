import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { DirectoryLoginForm } from '@/components/directory-login-form'
import { SubHeader } from '@/components/sub-header'
import { getCurrentUser, getDirectoryAuth } from '@/lib/directory-auth'

export const metadata: Metadata = { title: '账号登录', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string }> }) {
  const { mode, next } = await searchParams
  const submit = next === 'submit'
  const signup = mode === 'signup'
  if (await getCurrentUser()) redirect(submit ? '/account?tab=submit' : '/account')
  const alternate = new URLSearchParams()
  if (!signup) alternate.set('mode', 'signup')
  if (submit) alternate.set('next', 'submit')
  return <><SubHeader hideAccount /><main className="subpage login-page"><div className="surface login-card">
    <span className="brand-mark"><Sparkles size={22} aria-hidden="true" /></span>
    <h1>{signup ? '创建账号' : '登录 AI 工具箱'}</h1>
    <p>{submit ? '登录后即可推荐站点、追踪审核状态。' : '管理你推荐的 AI 工具，查看提交记录。'}</p>
    <DirectoryLoginForm key={String(signup)} signup={signup} submit={submit} available={Boolean(getDirectoryAuth())} />
    <p className="login-switch">{signup ? '已有账号？' : '还没有账号？'} <Link className="text-action" href={alternate.size ? `/login?${alternate}` : '/login'}>{signup ? '去登录' : '注册账号'}</Link></p>
  </div></main></>
}
