'use client'

import { useActionState } from 'react'
import { changeManagedTool } from '@/app/account/actions'
import { Button } from './ui/button'

export function ToolStatusAction({ id, status }: { id: string; status: 'published' | 'disabled' }) {
  const [state, action, pending] = useActionState(changeManagedTool, null)
  return <form action={action} aria-busy={pending}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="expected" value={status} /><input type="hidden" name="intent" value={status === 'published' ? 'disabled' : 'published'} />
    <Button variant="outline" disabled={pending} className="min-h-11">{pending ? '处理中…' : status === 'published' ? '下架' : '上架'}</Button>
    {state?.error && <p role="alert" className="row-error">{state.error}</p>}
  </form>
}

export function ToolDeleteAction({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(changeManagedTool, null)
  return <details className="tool-delete"><summary>删除</summary><form action={action} aria-busy={pending}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="intent" value="delete" />
    <p>删除“{name}”？删除后不再展示，原始投稿和审核记录保留。该标识仍会保留。</p>
    <label className="check-label"><input required type="checkbox" name="confirmDelete" value="yes" disabled={pending} />我确认删除该工具</label>
    <Button variant="destructive" disabled={pending} className="min-h-11">{pending ? '正在删除…' : '确认删除'}</Button>
    {state?.error && <p role="alert" className="row-error">{state.error}</p>}
  </form></details>
}
