'use server'

import { redirect } from 'next/navigation'
import { getDirectoryAuth } from '@/lib/directory-auth'

type LoginState = { error?: string; notice?: string } | null

export async function authenticate(_state: LoginState, form: FormData): Promise<LoginState> {
  const auth = getDirectoryAuth()
  if (!auth) return { error: '登录服务尚未配置。你仍可浏览工具目录。' }
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const password = String(form.get('password') ?? '')
  const name = String(form.get('name') ?? '').trim()
  const registration = form.get('mode') === 'signup'
  const next = form.get('next') === 'submit' ? '/account?tab=submit' : '/account'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128 || (registration && (!name || name.length > 80))) {
    return { error: '请填写有效的邮箱和至少 8 个字符的密码。' }
  }
  try {
    const { data, error } = registration ? await auth.signUp.email({ name, email, password, callbackURL: next }) : await auth.signIn.email({ email, password })
    if (error || !data) return { error: registration ? '注册暂未完成。请检查填写内容，或使用已有账号登录。' : '未能登录。请检查邮箱、密码或邮箱验证状态。' }
    if (registration && !data.token) return { notice: '请查看邮箱中的验证邮件，完成验证后再登录。' }
  } catch (error) {
    console.error('Directory authentication failed:', error instanceof Error ? error.name : 'unknown')
    return { error: '暂时无法连接登录服务，请稍后再试。' }
  }
  redirect(next)
}

export async function signOut() {
  const auth = getDirectoryAuth()
  if (auth) {
    const { error } = await auth.signOut()
    if (error) redirect('/account?tab=profile&signout=failed')
  }
  redirect('/')
}
