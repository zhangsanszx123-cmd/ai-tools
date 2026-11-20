'use client'

import { useActionState } from 'react'
import { AlertTriangle, Ban, CheckCircle2, LoaderCircle } from 'lucide-react'
import { changeCategoryStatus } from '@/app/account/actions'
import { Button } from './ui/button'

export function CategoryStatusAction({ id, enabled }: { id: string; enabled: boolean }) {
  const [state, action, pending] = useActionState(changeCategoryStatus, null)

  if (!enabled) {
    return (
      <form action={action} aria-busy={pending} className="inline-flex flex-col items-start">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="enabled" value="true" />
        <input type="hidden" name="expected" value="false" />
        <Button variant="outline" size="sm" className="admin-row-btn admin-row-btn-enable" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          {pending ? '正在更新…' : '启用'}
        </Button>
        {state?.error && <p role="alert" className="row-error">{state.error}</p>}
      </form>
    )
  }

  return (
    <details className="admin-confirm-popover admin-confirm-warn">
      <summary className="admin-row-btn admin-row-btn-warn">
        <Ban size={14} aria-hidden="true" />
        <span>停用</span>
      </summary>
      <form action={action} aria-busy={pending} className="admin-confirm-panel">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="enabled" value="false" />
        <input type="hidden" name="expected" value="true" />
        <div className="admin-confirm-head">
          <AlertTriangle size={16} aria-hidden="true" />
          <strong>确认停用此分类？</strong>
        </div>
        <p>停用后，该分类及其下所有工具将从前台隐藏，已有内容不会被删除。</p>
        <label className="admin-confirm-check">
          <input required type="checkbox" name="confirmDisable" value="yes" disabled={pending} />
          <span>我确认停用该分类</span>
        </label>
        <Button variant="outline" size="sm" className="min-h-10 w-full" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {pending ? '正在更新…' : '确认停用'}
        </Button>
        {state?.error && <p role="alert" className="row-error">{state.error}</p>}
      </form>
    </details>
  )
}
