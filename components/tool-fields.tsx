'use client'

import { useState } from 'react'
import type { CatalogCategory } from '@/lib/catalog'
import type { ManagedTool } from '@/lib/directory-store'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function ToolFields({ categories, tool, prefix }: { categories: CatalogCategory[]; tool?: ManagedTool; prefix: string }) {
  const [value, setValue] = useState({ name: tool?.name ?? '', slug: tool?.slug ?? '', website: tool?.website ?? '',
    category: tool?.category ?? '', summary: tool?.summary ?? '', content: tool?.content ?? '' })
  const change = (key: keyof typeof value) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValue({ ...value, [key]: event.target.value })
  return <FieldGroup className="gap-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <Field><FieldLabel htmlFor={`${prefix}-name`}>网站名称</FieldLabel><Input id={`${prefix}-name`} name="name" value={value.name} onChange={change('name')} required maxLength={90} placeholder="例如：我的 AI 工具" /></Field>
      <Field><FieldLabel htmlFor={`${prefix}-slug`}>站点标识（Slug）</FieldLabel><Input id={`${prefix}-slug`} name="slug" value={value.slug} onChange={change('slug')} readOnly={Boolean(tool)} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={70} placeholder="my-ai-tool" aria-describedby={`${prefix}-slug-hint`} /><FieldDescription id={`${prefix}-slug-hint`}>{tool ? '已收录工具的标识固定，避免已有链接失效。' : '小写字母、数字和短横线，作为详情页地址的一部分。'}</FieldDescription></Field>
      <Field><FieldLabel htmlFor={`${prefix}-website`}>官网网址</FieldLabel><Input id={`${prefix}-website`} name="website" value={value.website} onChange={change('website')} type="url" required maxLength={1500} placeholder="https://example.com" /></Field>
      <Field><FieldLabel htmlFor={`${prefix}-category`}>所属分类</FieldLabel><select id={`${prefix}-category`} name="category" className="native-select" required value={value.category} onChange={change('category')}><option value="" disabled>请选择一个分类</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}{!category.isEnabled ? '（已停用）' : ''}</option>)}</select></Field>
      <Field><FieldLabel htmlFor={`${prefix}-logo`}>网站 Logo（选填）</FieldLabel><Input id={`${prefix}-logo`} name="logo" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={`${prefix}-logo-hint`} /><FieldDescription id={`${prefix}-logo-hint`}>PNG、JPEG 或 WebP，不超过 512 KB。{tool?.hasLogo ? '不上传则保留原图。' : ''}</FieldDescription>{tool?.hasLogo && <label className="check-label"><input type="checkbox" name="removeLogo" />移除现有 Logo（上传新图时优先替换）</label>}</Field>
      <Field><FieldLabel htmlFor={`${prefix}-cover`}>网站预览图（选填）</FieldLabel><Input id={`${prefix}-cover`} name="cover" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={`${prefix}-cover-hint`} /><FieldDescription id={`${prefix}-cover-hint`}>PNG、JPEG 或 WebP，不超过 2 MB，建议宽幅图片。{tool?.hasCover ? '不上传则保留原图。' : ''}</FieldDescription>{tool?.hasCover && <label className="check-label"><input type="checkbox" name="removeCover" />移除现有预览图（上传新图时优先替换）</label>}</Field>
    </div>
    <Field><FieldLabel htmlFor={`${prefix}-summary`}>工具概要</FieldLabel><Input id={`${prefix}-summary`} name="summary" value={value.summary} onChange={change('summary')} required maxLength={130} placeholder="用一句话介绍这个工具能做什么" /></Field>
    <Field><FieldLabel htmlFor={`${prefix}-content`}>详细介绍（Markdown）</FieldLabel><Textarea id={`${prefix}-content`} name="content" value={value.content} onChange={change('content')} required maxLength={12000} className="min-h-32" placeholder="介绍主要功能、使用场景和特色…" /></Field>
  </FieldGroup>
}
