'use client'

import { useActionState, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, LoaderCircle, XCircle } from 'lucide-react'
import { reviewSubmission } from '@/app/account/actions'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

export function ReviewForm({ id, categoryEnabled }: { id: string; categoryEnabled: boolean }) {
  const [state, action, pending] = useActionState(reviewSubmission, null)
  const [decision, setDecision] = useState<'approve' | 'reject'>(categoryEnabled ? 'approve' : 'reject')
  const [reason, setReason] = useState('')

  return (
    <form action={action} aria-busy={pending} className="admin-review-form">
      <input type="hidden" name="id" value={id} />
      <fieldset disabled={pending} className="grid gap-4">
        <legend className="admin-review-legend">审核决策</legend>

        <div className="admin-decision-grid">
          <label
            className="admin-decision-card"
            data-tone="approve"
            data-selected={decision === 'approve'}
            data-disabled={!categoryEnabled}
          >
            <input
              type="radio"
              name="decision"
              value="approve"
              checked={decision === 'approve'}
              disabled={!categoryEnabled}
              onChange={() => setDecision('approve')}
            />
            <span className="admin-decision-icon" aria-hidden="true">
              <CheckCircle2 size={18} />
            </span>
            <span className="admin-decision-copy">
              <strong>通过并收录</strong>
              <small>立即发布到公开目录并保留原投稿快照</small>
            </span>
          </label>

          <label
            className="admin-decision-card"
            data-tone="reject"
            data-selected={decision === 'reject'}
          >
            <input
              type="radio"
              name="decision"
              value="reject"
              checked={decision === 'reject'}
              onChange={() => setDecision('reject')}
            />
            <span className="admin-decision-icon" aria-hidden="true">
              <XCircle size={18} />
            </span>
            <span className="admin-decision-copy">
              <strong>驳回投稿</strong>
              <small>不录入公开目录，向投稿人反馈修改意见</small>
            </span>
          </label>
        </div>

        {!categoryEnabled && (
          <div className="admin-inline-warning" role="note">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>该分类当前已停用，暂不能通过审核。请先前往分类管理启用分类，或选择驳回并说明原因。</span>
          </div>
        )}

        {decision === 'reject' && (
          <div className="grid gap-2">
            <div className="admin-field-meta">
              <label htmlFor={`reason-${id}`} className="text-sm font-medium">
                驳回原因
              </label>
              <span className="admin-char-count">{reason.length} / 1000</span>
            </div>
            <Textarea
              id={`reason-${id}`}
              name="reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              required
              maxLength={1000}
              className="min-h-24 bg-white"
              placeholder="请具体说明需要补充或修改的内容，帮助用户重新提交。"
            />
          </div>
        )}

        {state?.error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            className="min-h-11 px-5"
            variant={decision === 'reject' ? 'destructive' : 'default'}
            disabled={pending || (decision === 'approve' && !categoryEnabled)}
          >
            {pending && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {pending ? '正在处理…' : decision === 'approve' ? '确认通过并收录' : '确认驳回'}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
