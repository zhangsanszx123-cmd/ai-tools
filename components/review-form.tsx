'use client'

import { useActionState, useState } from 'react'
import { reviewSubmission } from '@/app/account/actions'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

export function ReviewForm({ id, categoryEnabled }: { id: string; categoryEnabled: boolean }) {
  const [state, action, pending] = useActionState(reviewSubmission, null)
  const [decision, setDecision] = useState(categoryEnabled ? 'approve' : 'reject')
  const [reason, setReason] = useState('')
  return <form action={action} aria-busy={pending} className="review-form">
    <input type="hidden" name="id" value={id} />
    <fieldset disabled={pending} className="grid gap-3">
      <legend className="mb-2 text-sm font-semibold">审核操作</legend>
      <div className="review-choices"><label><input type="radio" name="decision" value="approve" checked={decision === 'approve'} disabled={!categoryEnabled} onChange={() => setDecision('approve')} />通过并收录</label><label><input type="radio" name="decision" value="reject" checked={decision === 'reject'} onChange={() => setDecision('reject')} />驳回投稿</label></div>
      {!categoryEnabled && <p className="text-sm text-muted-foreground">该分类已停用，暂不能通过。可先启用分类或驳回并说明原因。</p>}
      {decision === 'reject' && <div className="grid gap-2"><label htmlFor={`reason-${id}`} className="text-sm font-medium">驳回原因</label><Textarea id={`reason-${id}`} name="reason" value={reason} onChange={event => setReason(event.target.value)} required maxLength={1000} placeholder="说明需要修改的内容，帮助用户重新提交。" /></div>}
      {state?.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
      <Button type="submit" className="justify-self-start min-h-11" variant={decision === 'reject' ? 'outline' : 'default'} disabled={pending || (decision === 'approve' && !categoryEnabled)}>{pending ? '正在处理…' : decision === 'approve' ? '确认通过并收录' : '确认驳回'}</Button>
    </fieldset>
  </form>
}
