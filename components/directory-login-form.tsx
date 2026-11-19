'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { adminAuthClient } from '@/lib/admin-auth-client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

function authError(code: string | undefined, status: number, signup: boolean) {
  if (status === 429) return '操作过于频繁，请稍等一分钟再试。'
  if (code === 'INVALID_EMAIL') return '请输入有效的邮箱地址。'
  if (code === 'PASSWORD_TOO_SHORT') return '密码至少需要 8 个字符。'
  if (code === 'PASSWORD_TOO_LONG') return '密码最多为 128 个字符。'
  if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') return '该邮箱暂时无法注册，请尝试登录或使用其他邮箱。'
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || status === 401) return '邮箱或密码不正确，请重新输入。'
  if (status >= 500 || status === 0) return '登录服务暂时不可用，请稍后重试。'
  return signup ? '注册未完成，请检查填写内容后重试。' : '登录未完成，请检查邮箱和密码后重试。'
}

export function DirectoryLoginForm({ signup, submit, available, destination, admin = false }: { signup: boolean; submit: boolean; available: boolean; destination?: string; admin?: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const [visible, setVisible] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  async function authenticate(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !available) return
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim().toLowerCase()
    const password = String(form.get('password') ?? '')
    setError('')
    setMismatch(false)
    if (signup && password !== form.get('confirmPassword')) {
      setMismatch(true)
      setError('两次输入的密码不一致，请重新确认。')
      return
    }
    busy.current = true
    setPending(true)
    try {
      const next = destination ?? (submit ? '/account?tab=submit' : '/account')
      const result = signup
        ? await authClient.signUp.email({ name: '新用户', email, password })
        : await (admin ? adminAuthClient : authClient).signIn.email({ email, password })
      if (result.error) {
        setError(authError(result.error.code, result.error.status, signup))
        return
      }
      router.replace(next)
      router.refresh()
    } catch {
      setError('无法连接登录服务，请检查网络后重试。')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return <form onSubmit={authenticate} aria-busy={pending}>
    <FieldGroup className="gap-5">
      {!available && <Alert><AlertCircle aria-hidden="true" /><AlertDescription>登录服务尚未配置，工具目录仍可正常浏览。</AlertDescription></Alert>}
      <Field><FieldLabel htmlFor="email">邮箱</FieldLabel><Input required id="email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" maxLength={254} disabled={!available || pending} /></Field>
      <Field><FieldLabel htmlFor="password">密码</FieldLabel><div className="password-control"><Input required id="password" name="password" type={visible ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} minLength={8} maxLength={128} aria-describedby={signup ? 'password-hint' : undefined} disabled={!available || pending} /><button type="button" className="password-toggle" aria-label={visible ? '隐藏密码' : '显示密码'} aria-pressed={visible} onClick={() => setVisible(!visible)} disabled={!available || pending}>{visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div>{signup && <p id="password-hint" className="password-hint">8–128 个字符，建议使用不易猜测的独立密码。</p>}</Field>
      {signup && <Field><FieldLabel htmlFor="confirm-password">确认密码</FieldLabel><Input required id="confirm-password" name="confirmPassword" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} aria-invalid={mismatch || undefined} aria-describedby={mismatch ? 'auth-error' : undefined} onChange={() => setMismatch(false)} disabled={!available || pending} /></Field>}
      {error && <div id="auth-error" ref={errorRef} tabIndex={-1} role="alert"><Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert></div>}
      <Button type="submit" className="auth-submit" disabled={pending || !available}>{pending && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}{pending ? signup ? '正在创建账号…' : '正在登录…' : signup ? '创建账号' : '登录'}</Button>
    </FieldGroup>
  </form>
}
