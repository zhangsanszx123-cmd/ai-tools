'use client'

import { useActionState } from 'react'
import { AlertCircle, Send } from 'lucide-react'
import { submitTool } from '@/app/account/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { categories } from '@/lib/catalog'

export function SubmissionForm() {
  const [state, action, pending] = useActionState(submitTool, null)
  return <form action={action} className="submission-form">
    <FieldGroup className="gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="tool-name">网站名称</FieldLabel><Input id="tool-name" name="name" required maxLength={90} placeholder="例如：我的 AI 工具" /></Field>
        <Field><FieldLabel htmlFor="tool-slug">站点标识（Slug）</FieldLabel><Input id="tool-slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={70} placeholder="my-ai-tool" aria-describedby="slug-hint" /><FieldDescription id="slug-hint">只使用小写字母、数字和短横线，将作为详情页地址的一部分。</FieldDescription></Field>
        <Field><FieldLabel htmlFor="tool-website">网址</FieldLabel><Input id="tool-website" name="website" type="url" required maxLength={1500} placeholder="https://example.com" /></Field>
        <Field><FieldLabel htmlFor="tool-category">所属分类</FieldLabel><select id="tool-category" name="category" className="native-select" required defaultValue=""><option value="" disabled>请选择一个分类</option>{categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></Field>
        <Field><FieldLabel htmlFor="tool-logo">网站 Logo（选填）</FieldLabel><Input id="tool-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="logo-hint" /><FieldDescription id="logo-hint">PNG、JPEG 或 WebP，不超过 512 KB。</FieldDescription></Field>
        <Field><FieldLabel htmlFor="tool-cover">网站预览图（选填）</FieldLabel><Input id="tool-cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="cover-hint" /><FieldDescription id="cover-hint">PNG、JPEG 或 WebP，不超过 2 MB，建议宽幅图片。</FieldDescription></Field>
      </div>
      <Field><FieldLabel htmlFor="tool-summary">工具概要</FieldLabel><Input id="tool-summary" name="summary" required maxLength={130} placeholder="用一句话介绍这个工具能做什么" /></Field>
      <Field><FieldLabel htmlFor="tool-content">详细介绍（Markdown）</FieldLabel><Textarea id="tool-content" name="content" className="min-h-32" required maxLength={12000} aria-describedby="content-hint" placeholder="介绍主要功能、使用场景和特色…" /><FieldDescription id="content-hint">支持 Markdown 标题、列表、强调和链接。</FieldDescription></Field>
      {state?.error && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{state.error}</AlertDescription></Alert>}
      <Button type="submit" size="lg" className="self-start" disabled={pending}><Send data-icon="inline-start" aria-hidden="true" />{pending ? '正在提交…' : '提交审核'}</Button>
    </FieldGroup>
  </form>
}
