'use client'

import { useActionState } from 'react'
import { changeCategoryStatus } from '@/app/account/actions'
import { Button } from './ui/button'

export function CategoryStatusAction({ id, enabled }: { id: string; enabled: boolean }) {
  const [state, action, pending] = useActionState(changeCategoryStatus, null)
  const form = <form action={action} aria-busy={pending}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="enabled" value={String(!enabled)} /><input type="hidden" name="expected" value={String(enabled)} />
    {enabled && <><p>停用后，该分类及其下所有工具将从前台隐藏，已有内容不会被删除。</p><label className="check-label"><input required type="checkbox" name="confirmDisable" value="yes" disabled={pending} />我确认停用该分类</label></>}
    <Button variant="outline" className="min-h-11" disabled={pending}>{pending ? '正在更新…' : enabled ? '确认停用' : '启用'}</Button>
    {state?.error && <p role="alert" className="row-error">{state.error}</p>}
  </form>
  return enabled ? <details className="tool-delete category-disable"><summary>停用</summary>{form}</details> : form
}
