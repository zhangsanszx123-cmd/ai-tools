'use client'

import { useActionState } from 'react'
import { AlertTriangle, Ban, CheckCircle2, LoaderCircle, ShieldAlert, Trash2 } from 'lucide-react'
import { changeAdminUser, changeFrontendUser } from '@/app/account/actions'
import { Button } from './ui/button'

export function FrontendUserStatusAction({ id, enabled }: { id: string; enabled: boolean }) {
  const [state, action, pending] = useActionState(changeFrontendUser, null)
  return (
    <form action={action} aria-busy={pending} className="inline-flex flex-col items-start">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expected" value={String(enabled)} />
      <input type="hidden" name="intent" value={enabled ? 'disabled' : 'enabled'} />
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        className={enabled ? 'admin-row-btn admin-row-btn-warn' : 'admin-row-btn admin-row-btn-enable'}
      >
        {pending ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : enabled ? (
          <Ban aria-hidden="true" />
        ) : (
          <CheckCircle2 aria-hidden="true" />
        )}
        {pending ? '处理中…' : enabled ? '禁用' : '启用'}
      </Button>
      {state?.error && <p role="alert" className="row-error">{state.error}</p>}
    </form>
  )
}

export function FrontendUserDeleteAction({ id, email }: { id: string; email: string }) {
  const [state, action, pending] = useActionState(changeFrontendUser, null)
  return (
    <details className="admin-confirm-popover admin-confirm-danger">
      <summary className="admin-row-btn admin-row-btn-danger">
        <Trash2 size={14} aria-hidden="true" />
        <span>删除</span>
      </summary>
      <form action={action} aria-busy={pending} className="admin-confirm-panel">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="intent" value="delete" />
        <div className="admin-confirm-head">
          <AlertTriangle size={16} aria-hidden="true" />
          <strong>删除前端用户？</strong>
        </div>
        <p>删除“{email}”后，该账号会话与登录凭据将被清除，其历史投稿与已收录工具将自动保留。</p>
        <label className="admin-confirm-check">
          <input required type="checkbox" name="confirmDelete" value="yes" disabled={pending} />
          <span>我确认删除该前端用户</span>
        </label>
        <Button variant="destructive" size="sm" disabled={pending} className="min-h-10 w-full">
          {pending && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {pending ? '正在删除…' : '确认删除'}
        </Button>
        {state?.error && <p role="alert" className="row-error">{state.error}</p>}
      </form>
    </details>
  )
}

export function AdminUserStatusAction({ id, enabled, isSelf }: { id: string; enabled: boolean; isSelf: boolean }) {
  const [state, action, pending] = useActionState(changeAdminUser, null)
  if (isSelf) {
    return (
      <span className="admin-self-guard" title="当前登录账号受防自锁保护，不可停用或删除自己">
        <ShieldAlert size={13} aria-hidden="true" />
        当前账号
      </span>
    )
  }
  return (
    <form action={action} aria-busy={pending} className="inline-flex flex-col items-start">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expected" value={String(enabled)} />
      <input type="hidden" name="intent" value={enabled ? 'disabled' : 'enabled'} />
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        className={enabled ? 'admin-row-btn admin-row-btn-warn' : 'admin-row-btn admin-row-btn-enable'}
      >
        {pending ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : enabled ? (
          <Ban aria-hidden="true" />
        ) : (
          <CheckCircle2 aria-hidden="true" />
        )}
        {pending ? '处理中…' : enabled ? '停用' : '启用'}
      </Button>
      {state?.error && <p role="alert" className="row-error">{state.error}</p>}
    </form>
  )
}

export function AdminUserDeleteAction({ id, email, isSelf }: { id: string; email: string; isSelf: boolean }) {
  const [state, action, pending] = useActionState(changeAdminUser, null)
  if (isSelf) return null
  return (
    <details className="admin-confirm-popover admin-confirm-danger">
      <summary className="admin-row-btn admin-row-btn-danger">
        <Trash2 size={14} aria-hidden="true" />
        <span>删除</span>
      </summary>
      <form action={action} aria-busy={pending} className="admin-confirm-panel">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="intent" value="delete" />
        <div className="admin-confirm-head">
          <AlertTriangle size={16} aria-hidden="true" />
          <strong>删除后台管理员？</strong>
        </div>
        <p>删除“{email}”后，该管理员立即失去后台权限，其过往审核与收录记录将保留。</p>
        <label className="admin-confirm-check">
          <input required type="checkbox" name="confirmDelete" value="yes" disabled={pending} />
          <span>我确认删除该管理员</span>
        </label>
        <Button variant="destructive" size="sm" disabled={pending} className="min-h-10 w-full">
          {pending && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {pending ? '正在删除…' : '确认删除'}
        </Button>
        {state?.error && <p role="alert" className="row-error">{state.error}</p>}
      </form>
    </details>
  )
}
