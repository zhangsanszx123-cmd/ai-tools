'use client'

import { useActionState, useState } from 'react'
import { saveCategory, saveManagedTool } from '@/app/account/actions'
import { brandKeys, iconKeys, type CatalogCategory } from '@/lib/catalog'
import type { ManagedTool } from '@/lib/directory-store'
import { ToolFields } from './tool-fields'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'

export function CategoryForm({ category }: { category?: CatalogCategory }) {
  const [state, action, pending] = useActionState(saveCategory, null)
  const [value, setValue] = useState({ id: category?.id ?? '', name: category?.name ?? '', short: category?.short ?? '',
    description: category?.description ?? '', iconKey: category?.iconKey ?? 'Sparkles', sortOrder: String(category?.sortOrder ?? 0) })
  const [enabled, setEnabled] = useState(category?.isEnabled ?? true)
  const prefix = `category-${category?.id ?? 'new'}`
  const change = (key: keyof typeof value) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValue({ ...value, [key]: event.target.value })
  return <form action={action} className="admin-form" aria-busy={pending}><fieldset disabled={pending}>
    <FieldGroup className="gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel htmlFor={`${prefix}-id`}>分类标识</FieldLabel><Input id={`${prefix}-id`} name="id" value={value.id} onChange={change('id')} readOnly={Boolean(category)} required maxLength={40} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="如 writing，创建后固定" /></Field>
        <Field><FieldLabel htmlFor={`${prefix}-name`}>完整名称</FieldLabel><Input id={`${prefix}-name`} name="name" value={value.name} onChange={change('name')} required maxLength={50} /></Field>
        <Field><FieldLabel htmlFor={`${prefix}-short`}>卡片短名称</FieldLabel><Input id={`${prefix}-short`} name="short" value={value.short} onChange={change('short')} required maxLength={30} /></Field>
        <Field><FieldLabel htmlFor={`${prefix}-order`}>导航排序（越小越靠前）</FieldLabel><Input id={`${prefix}-order`} name="sortOrder" type="number" min={0} max={2147483647} step={1} value={value.sortOrder} onChange={change('sortOrder')} required /></Field>
        <Field><FieldLabel htmlFor={`${prefix}-icon`}>分类图标</FieldLabel><select id={`${prefix}-icon`} name="iconKey" className="native-select" value={value.iconKey} onChange={change('iconKey')}>{iconKeys.map(key => <option key={key}>{key}</option>)}</select></Field>
      </div>
      <Field><FieldLabel htmlFor={`${prefix}-description`}>分类说明</FieldLabel><Input id={`${prefix}-description`} name="description" maxLength={200} value={value.description} onChange={change('description')} /></Field>
      <label className="check-label"><input type="checkbox" name="isEnabled" checked={enabled} onChange={event => setEnabled(event.target.checked)} />启用分类（停用会隐藏该分类下所有公开工具）</label>
      {state?.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
      <Button type="submit" className="self-start min-h-11">{pending ? '正在保存…' : category ? '保存分类' : '新增分类'}</Button>
    </FieldGroup>
  </fieldset></form>
}

export function ManagedToolForm({ tool, categories }: { tool?: ManagedTool; categories: CatalogCategory[] }) {
  const [state, action, pending] = useActionState(saveManagedTool, null)
  const [status, setStatus] = useState(tool?.status ?? 'published')
  const [featured, setFeatured] = useState(String(tool?.featuredOrder ?? ''))
  const [order, setOrder] = useState(String(tool?.displayOrder ?? 0))
  const [logoKey, setLogoKey] = useState(tool?.logoKey ?? '')
  const prefix = `managed-${tool?.id ?? 'new'}`
  if (!categories.length) return <p className="catalog-empty">请先新增分类，再收录工具。</p>
  return <form action={action} className="admin-form" aria-busy={pending}>
    {tool && <input type="hidden" name="id" value={tool.id} />}
    <fieldset disabled={pending} className="grid min-w-0 gap-5">
      <ToolFields categories={categories} tool={tool} prefix={prefix} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel htmlFor={`${prefix}-status`}>展示状态</FieldLabel><select id={`${prefix}-status`} name="status" className="native-select" value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="published">发布</option><option value="disabled">下架</option></select></Field>
        <Field><FieldLabel htmlFor={`${prefix}-featured`}>热门排序（留空不推荐）</FieldLabel><Input id={`${prefix}-featured`} name="featuredOrder" type="number" min={0} max={2147483647} step={1} value={featured} onChange={event => setFeatured(event.target.value)} /></Field>
        <Field><FieldLabel htmlFor={`${prefix}-order`}>分类内排序（越小越靠前）</FieldLabel><Input id={`${prefix}-order`} name="displayOrder" type="number" min={0} max={2147483647} step={1} value={order} onChange={event => setOrder(event.target.value)} required /></Field>
        <Field><FieldLabel htmlFor={`${prefix}-brand`}>内置品牌 Logo（选填）</FieldLabel><select id={`${prefix}-brand`} name="logoKey" className="native-select" value={logoKey} onChange={event => setLogoKey(event.target.value)}><option value="">使用上传图或名称首字</option>{brandKeys.map(key => <option key={key}>{key}</option>)}</select></Field>
      </div>
      {state?.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
      <Button type="submit" className="justify-self-start min-h-11">{pending ? '正在保存…' : tool ? '保存工具' : '直接收录工具'}</Button>
    </fieldset>
  </form>
}
