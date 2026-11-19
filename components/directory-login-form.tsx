'use client'

import { useActionState } from 'react'
import { AlertCircle } from 'lucide-react'
import { authenticate } from '@/app/login/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export function DirectoryLoginForm({ signup, submit, available }: { signup: boolean; submit: boolean; available: boolean }) {
  const [state, action, pending] = useActionState(authenticate, null)
  return <form action={action}>
    <input type="hidden" name="mode" value={signup ? 'signup' : 'login'} />
    <input type="hidden" name="next" value={submit ? 'submit' : ''} />
    <FieldGroup className="gap-4">
      {!available && <Alert><AlertCircle aria-hidden="true" /><AlertDescription>登录服务尚未配置，工具目录仍可正常浏览。</AlertDescription></Alert>}
      {signup && <Field><FieldLabel htmlFor="name">昵称</FieldLabel><Input required id="name" name="name" autoComplete="nickname" maxLength={80} disabled={!available} /></Field>}
      <Field><FieldLabel htmlFor="email">邮箱</FieldLabel><Input required id="email" name="email" type="email" autoComplete="email" maxLength={254} disabled={!available} /></Field>
      <Field><FieldLabel htmlFor="password">密码</FieldLabel><Input required id="password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={8} maxLength={128} disabled={!available} /></Field>
      {state?.error && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{state.error}</AlertDescription></Alert>}
      {state?.notice && <p role="status">{state.notice}</p>}
      <Button type="submit" disabled={pending || !available}>{pending ? '处理中…' : signup ? '创建账号' : '登录'}</Button>
    </FieldGroup>
  </form>
}
