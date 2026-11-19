'use client'

import { useActionState } from 'react'
import { AlertCircle, Send } from 'lucide-react'
import { submitTool } from '@/app/account/actions'
import type { CatalogCategory } from '@/lib/catalog'
import { ToolFields } from './tool-fields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function SubmissionForm({ categories }: { categories: CatalogCategory[] }) {
  const [state, action, pending] = useActionState(submitTool, null)
  if (!categories.length) return <p className="catalog-empty">暂无开放投稿的分类，请稍后再来。</p>
  return <form action={action} className="submission-form" aria-busy={pending}>
    <fieldset disabled={pending} className="grid min-w-0 gap-5">
      <ToolFields categories={categories} prefix="submit" />
      {state?.error && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{state.error}</AlertDescription></Alert>}
      <Button type="submit" className="self-start min-h-11"><Send aria-hidden="true" />{pending ? '正在提交…' : '提交审核'}</Button>
    </fieldset>
  </form>
}
