'use client'

import { useActionState } from 'react'
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, LoaderCircle, Trash2 } from 'lucide-react'
import { changeManagedTool } from '@/app/account/actions'
import { Button } from './ui/button'

export function ToolStatusAction({ id, status }: { id: string; status: 'published' | 'disabled' }) {
  const [state, action, pending] = useActionState(changeManagedTool, null)
  const isPublished = status === 'published'
  return (
    <form action={action} aria-busy={pending} className="inline-flex flex-col items-start">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expected" value={status} />
      <input type="hidden" name="intent" value={isPublished ? 'disabled' : 'published'} />
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        className={isPublished ? 'admin-row-btn admin-row-btn-warn' : 'admin-row-btn admin-row-btn-enable'}
      >
        {pending ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : isPublished ? (
          <ArrowDownCircle aria-hidden="true" />
        ) : (
          <ArrowUpCircle aria-hidden="true" />
        )}
        {pending ? '处理中…' : isPublished ? '下架' : '上架'}
      </Button>
      {state?.error && <p role="alert" className="row-error">{state.error}</p>}
    </form>
  )
}

export function ToolDeleteAction({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(changeManagedTool, null)
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
          <strong>删除“{name}”？</strong>
        </div>
        <p>删除后不再展示，原始投稿和审核记录保留。该标识仍会保留。</p>
        <label className="admin-confirm-check">
          <input required type="checkbox" name="confirmDelete" value="yes" disabled={pending} />
          <span>我确认删除该工具</span>
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
