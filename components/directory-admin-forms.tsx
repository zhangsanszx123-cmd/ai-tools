'use client'

import { useActionState, useState } from 'react'
import { AlertCircle, Check, Eye, EyeOff, Flame, KeyRound, Layers, LoaderCircle, Save, ShieldCheck, Sparkles, Tag, UserRound } from 'lucide-react'
import { saveAdminUser, saveCategory, saveFrontendUser, saveManagedTool } from '@/app/account/actions'
import { brandKeys, iconKeys, type CatalogCategory } from '@/lib/catalog'
import type { ManagedAdminUser, ManagedFrontendUser, ManagedTool } from '@/lib/directory-store'
import { getCategoryIcon } from './catalog-elements'
import { ToolFields } from './tool-fields'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'

export function CategoryForm({ category }: { category?: CatalogCategory }) {
  const [state, action, pending] = useActionState(saveCategory, null)
  const [value, setValue] = useState({
    id: category?.id ?? '',
    name: category?.name ?? '',
    short: category?.short ?? '',
    description: category?.description ?? '',
    iconKey: category?.iconKey ?? 'Sparkles',
    sortOrder: String(category?.sortOrder ?? 0),
  })
  const [enabled, setEnabled] = useState(category?.isEnabled ?? true)
  const prefix = `category-${category?.id ?? 'new'}`
  const SelectedIcon = getCategoryIcon(value.iconKey)
  const change = (key: keyof typeof value) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValue({ ...value, [key]: event.target.value })

  return (
    <form action={action} className="admin-form" aria-busy={pending}>
      <fieldset disabled={pending} className="grid min-w-0 gap-6">
        <div className="admin-form-section">
          <div className="admin-form-section-head">
            <span className="admin-form-section-icon" aria-hidden="true"><Tag size={16} /></span>
            <div>
              <h3>基础信息</h3>
              <p>定义分类的稳定标识、导航展示名与首页卡片短名称。</p>
            </div>
          </div>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${prefix}-id`}>分类标识</FieldLabel>
                <Input
                  id={`${prefix}-id`}
                  name="id"
                  value={value.id}
                  onChange={change('id')}
                  readOnly={Boolean(category)}
                  required
                  maxLength={40}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  className={category ? 'bg-muted/60 font-mono text-muted-foreground' : 'font-mono'}
                  placeholder="如 writing，创建后固定"
                />
                <FieldDescription>{category ? '分类标识创建后不可更改，同时用作首页锚点。' : '仅支持小写字母、数字和短横线。'}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-name`}>完整名称</FieldLabel>
                <Input id={`${prefix}-name`} name="name" value={value.name} onChange={change('name')} required maxLength={50} placeholder="如：AI 写作工具" />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-short`}>卡片短名称</FieldLabel>
                <Input id={`${prefix}-short`} name="short" value={value.short} onChange={change('short')} required maxLength={30} placeholder="如：AI 写作" />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-order`}>导航排序（越小越靠前）</FieldLabel>
                <Input id={`${prefix}-order`} name="sortOrder" type="number" min={0} max={2147483647} step={1} value={value.sortOrder} onChange={change('sortOrder')} required />
              </Field>
            </div>
            <Field>
              <div className="admin-field-meta">
                <FieldLabel htmlFor={`${prefix}-description`}>分类说明</FieldLabel>
                <span className="admin-char-count">{value.description.length} / 200</span>
              </div>
              <Input id={`${prefix}-description`} name="description" maxLength={200} value={value.description} onChange={change('description')} placeholder="展示在首页分类标题下方的简短说明" />
            </Field>
          </FieldGroup>
        </div>

        <div className="admin-form-section">
          <div className="admin-form-section-head">
            <span className="admin-form-section-icon" aria-hidden="true"><Sparkles size={16} /></span>
            <div>
              <h3>图标与展示预览</h3>
              <p>从白名单图标中直观挑选，实时预览导航呈现效果。</p>
            </div>
          </div>

          <div className="admin-category-live-preview">
            <span className="admin-icon-badge admin-icon-badge-lg" aria-hidden="true">
              <SelectedIcon size={20} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="truncate text-sm">{value.name || '分类完整名称'}</strong>
                <span className="admin-pill-subtle">{value.short || '短名称'}</span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{value.description || '分类说明将展示在此处'}</p>
            </div>
          </div>

          <Field className="mt-4">
            <FieldLabel htmlFor={`${prefix}-icon`}>分类图标（当前：{value.iconKey}）</FieldLabel>
            <select
              id={`${prefix}-icon`}
              name="iconKey"
              className="native-select"
              value={value.iconKey}
              onChange={change('iconKey')}
            >
              {iconKeys.map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
            <div className="admin-icon-grid" role="group" aria-label="可视化图标选择">
              {iconKeys.map(key => {
                const Icon = getCategoryIcon(key)
                const selected = value.iconKey === key
                return (
                  <button
                    key={key}
                    type="button"
                    className="admin-icon-option"
                    data-selected={selected}
                    title={key}
                    aria-pressed={selected}
                    onClick={() => setValue(current => ({ ...current, iconKey: key }))}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{key}</span>
                  </button>
                )
              })}
            </div>
          </Field>
        </div>

        <label className="admin-toggle-card" data-checked={enabled}>
          <input
            type="checkbox"
            name="isEnabled"
            checked={enabled}
            onChange={event => setEnabled(event.target.checked)}
          />
          <span className="admin-toggle-copy">
            <strong>启用分类</strong>
            <small>停用会隐藏该分类下所有公开工具，并暂停该分类的新投稿与审核通过，不会删除已有内容。</small>
          </span>
          <span className="admin-status-pill" data-tone={enabled ? 'success' : 'muted'}>
            <span aria-hidden="true" />
            {enabled ? '已启用' : '已停用'}
          </span>
        </label>

        {state?.error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <div className="admin-form-actions">
          <Button type="submit" className="min-h-11 px-6">
            {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {pending ? '正在保存…' : category ? '保存分类' : '新增分类'}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

export function ManagedToolForm({ tool, categories }: { tool?: ManagedTool; categories: CatalogCategory[] }) {
  const [state, action, pending] = useActionState(saveManagedTool, null)
  const [status, setStatus] = useState(tool?.status ?? 'published')
  const [featured, setFeatured] = useState(String(tool?.featuredOrder ?? ''))
  const [order, setOrder] = useState(String(tool?.displayOrder ?? 0))
  const [logoKey, setLogoKey] = useState(tool?.logoKey ?? '')
  const prefix = `managed-${tool?.id ?? 'new'}`

  if (!categories.length) return <p className="catalog-empty">请先新增分类，再收录工具。</p>

  return (
    <form action={action} className="admin-form" aria-busy={pending}>
      {tool && <input type="hidden" name="id" value={tool.id} />}
      <fieldset disabled={pending} className="grid min-w-0 gap-6">
        <div className="admin-form-section">
          <div className="admin-form-section-head">
            <span className="admin-form-section-icon" aria-hidden="true"><Layers size={16} /></span>
            <div>
              <h3>基础信息与内容详情</h3>
              <p>配置工具基础字段、图标预览图及详情页 Markdown 介绍。</p>
            </div>
          </div>
          <ToolFields
            categories={categories}
            tool={tool}
            prefix={prefix}
            mediaPreviewBase={tool ? `/api/admin/tool-media/${tool.id}` : undefined}
          />
        </div>

        <div className="admin-form-section">
          <div className="admin-form-section-head">
            <span className="admin-form-section-icon" aria-hidden="true"><Flame size={16} /></span>
            <div>
              <h3>展示状态与推荐配置</h3>
              <p>控制前台上下架状态、首页热门排序、分类排序与内置品牌图标。</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor={`${prefix}-status`}>展示状态</FieldLabel>
              <select
                id={`${prefix}-status`}
                name="status"
                className="native-select"
                value={status}
                onChange={event => setStatus(event.target.value as typeof status)}
              >
                <option value="published">发布（公开展示）</option>
                <option value="disabled">下架（前台隐藏）</option>
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${prefix}-featured`}>热门排序（留空不推荐）</FieldLabel>
              <Input
                id={`${prefix}-featured`}
                name="featuredOrder"
                type="number"
                min={0}
                max={2147483647}
                step={1}
                placeholder="如 1、2、3"
                value={featured}
                onChange={event => setFeatured(event.target.value)}
              />
              <FieldDescription>数值越小，首页“热门工具”位置越靠前。</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${prefix}-order`}>分类内排序（越小越靠前）</FieldLabel>
              <Input
                id={`${prefix}-order`}
                name="displayOrder"
                type="number"
                min={0}
                max={2147483647}
                step={1}
                value={order}
                onChange={event => setOrder(event.target.value)}
                required
              />
              <FieldDescription>同分类下按此数值升序排列。</FieldDescription>
            </Field>
          </div>

          <Field className="mt-5">
            <FieldLabel htmlFor={`${prefix}-brand`}>内置品牌 Logo（选填）</FieldLabel>
            <select
              id={`${prefix}-brand`}
              name="logoKey"
              className="native-select"
              value={logoKey}
              onChange={event => setLogoKey(event.target.value)}
            >
              <option value="">使用上传图或名称首字</option>
              {brandKeys.map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
            <div className="admin-brand-grid" role="group" aria-label="内置品牌图标选择">
              <button
                type="button"
                className="admin-brand-option"
                data-selected={logoKey === ''}
                aria-pressed={logoKey === ''}
                onClick={() => setLogoKey('')}
              >
                <span className="admin-brand-none">{logoKey === '' ? <Check size={14} /> : '无'}</span>
                <span>默认 / 上传图</span>
              </button>
              {brandKeys.map(key => {
                const selected = logoKey === key
                return (
                  <button
                    key={key}
                    type="button"
                    className="admin-brand-option"
                    data-selected={selected}
                    aria-pressed={selected}
                    onClick={() => setLogoKey(key)}
                  >
                    <span className="tool-logo admin-brand-thumb" data-brand={key}>
                      <img src={`/brands/${key}.svg`} width="20" height="20" alt="" decoding="async" />
                    </span>
                    <span>{key}</span>
                  </button>
                )
              })}
            </div>
          </Field>
        </div>

        {state?.error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <div className="admin-form-actions">
          <Button type="submit" className="min-h-11 px-6">
            {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {pending ? '正在保存…' : tool ? '保存工具' : '直接收录工具'}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

export function FrontendUserForm({ user }: { user?: ManagedFrontendUser }) {
  const [state, action, pending] = useActionState(saveFrontendUser, null)
  const [name, setName] = useState(user?.name ?? '新用户')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [enabled, setEnabled] = useState(user?.isEnabled ?? true)
  const prefix = `front-user-${user?.id ?? 'new'}`

  return (
    <form action={action} className="admin-form" aria-busy={pending}>
      {user && <input type="hidden" name="id" value={user.id} />}
      <fieldset disabled={pending} className="grid min-w-0 gap-6">
        <div className="admin-form-section">
          <div className="admin-form-section-head">
            <span className="admin-form-section-icon" aria-hidden="true"><UserRound size={16} /></span>
            <div>
              <h3>前端用户资料</h3>
              <p>维护前台用户的显示昵称与登录邮箱。前端账号仅用于前台登录与工具投稿，不具备任何后台权限。</p>
            </div>
          </div>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${prefix}-name`}>用户昵称</FieldLabel>
                <Input
                  id={`${prefix}-name`}
                  name="name"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  required
                  maxLength={50}
                  placeholder="例如：新用户"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-email`}>登录邮箱</FieldLabel>
                <Input
                  id={`${prefix}-email`}
                  name="email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                  maxLength={254}
                  placeholder="user@example.com"
                />
              </Field>
            </div>
          </FieldGroup>
        </div>

        <div className="admin-form-section">
          <div className="admin-form-section-head">
            <span className="admin-form-section-icon" aria-hidden="true"><KeyRound size={16} /></span>
            <div>
              <h3>{user ? '重置登录密码（选填）' : '设置初始密码'}</h3>
              <p>{user ? '留空则保持原密码不变；填写新密码后将使用 scrypt 重新加密并自动注销该用户的旧登录会话。' : '密码长度为 8–128 个字符，使用 Better Auth scrypt 加盐哈希存储。'}</p>
            </div>
          </div>
          <Field>
            <FieldLabel htmlFor={`${prefix}-password`}>{user ? '新密码（留空不修改）' : '登录密码（8–128 位）'}</FieldLabel>
            <div className="password-control">
              <Input
                id={`${prefix}-password`}
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required={!user}
                minLength={8}
                maxLength={128}
                placeholder={user ? '不修改密码请留空' : '请输入 8–128 位密码'}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={visible ? '隐藏密码' : '显示密码'}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </Field>
        </div>

        <label className="admin-toggle-card" data-checked={enabled}>
          <input
            type="checkbox"
            name="isEnabled"
            checked={enabled}
            onChange={event => setEnabled(event.target.checked)}
          />
          <span className="admin-toggle-copy">
            <strong>启用前端用户账号</strong>
            <small>取消勾选将禁用该账号，立即清除其在线会话并阻止其访问个人中心或提交新投稿。</small>
          </span>
          <span className="admin-status-pill" data-tone={enabled ? 'success' : 'muted'}>
            <span aria-hidden="true" />
            {enabled ? '正常' : '已禁用'}
          </span>
        </label>

        {state?.error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <div className="admin-form-actions">
          <Button type="submit" className="min-h-11 px-6">
            {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {pending ? '正在保存…' : user ? '保存前端用户' : '创建前端用户'}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

export function AdminUserForm({ admin, isSelf = false }: { admin?: ManagedAdminUser; isSelf?: boolean }) {
  const [state, action, pending] = useActionState(saveAdminUser, null)
  const [name, setName] = useState(admin?.name ?? '管理员')
  const [email, setEmail] = useState(admin?.email ?? '')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [enabled, setEnabled] = useState(admin ? admin.isEnabled : true)
  const prefix = `admin-user-${admin?.id ?? 'new'}`

  return (
    <form action={action} className="admin-form" aria-busy={pending}>
      {admin && <input type="hidden" name="id" value={admin.id} />}
      <fieldset disabled={pending} className="grid min-w-0 gap-6">
        <div className="admin-form-section">
          <div className="admin-form-section-head">
            <span className="admin-form-section-icon" aria-hidden="true"><ShieldCheck size={16} /></span>
            <div>
              <h3>后台管理员身份</h3>
              <p>独立存储于 admin_user 表，拥有审核投稿、维护分类、管理工具与用户的完整后台权限。</p>
            </div>
          </div>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${prefix}-name`}>管理员名称</FieldLabel>
                <Input
                  id={`${prefix}-name`}
                  name="name"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  required
                  maxLength={50}
                  placeholder="例如：系统管理员"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-email`}>管理员登录邮箱</FieldLabel>
                <Input
                  id={`${prefix}-email`}
                  name="email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                  maxLength={254}
                  placeholder="admin@example.com"
                />
              </Field>
            </div>
          </FieldGroup>
        </div>

        <div className="admin-form-section">
          <div className="admin-form-section-head">
            <span className="admin-form-section-icon" aria-hidden="true"><KeyRound size={16} /></span>
            <div>
              <h3>{admin ? '重置管理员密码（选填）' : '设置高强度管理员密码'}</h3>
              <p>{admin ? '留空则保持原密码不变；后台管理员密码要求至少 12 个字符。' : '后台安全策略要求管理员密码长度为 12–128 个字符。'}</p>
            </div>
          </div>
          <Field>
            <FieldLabel htmlFor={`${prefix}-password`}>{admin ? '新密码（留空不修改，至少 12 位）' : '管理员密码（12–128 位）'}</FieldLabel>
            <div className="password-control">
              <Input
                id={`${prefix}-password`}
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required={!admin}
                minLength={12}
                maxLength={128}
                placeholder={admin ? '不修改密码请留空' : '请输入 12–128 位高强度密码'}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={visible ? '隐藏密码' : '显示密码'}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </Field>
        </div>

        <label className="admin-toggle-card" data-checked={isSelf ? true : enabled}>
          {isSelf && <input type="hidden" name="isEnabled" value="on" />}
          <input
            type="checkbox"
            name={isSelf ? undefined : 'isEnabled'}
            checked={isSelf ? true : enabled}
            disabled={isSelf}
            onChange={event => setEnabled(event.target.checked)}
          />
          <span className="admin-toggle-copy">
            <strong>启用管理员权限</strong>
            <small>
              {isSelf
                ? '当前正在登录的管理员账号受防自锁保护，不可停用自己。'
                : '停用后该管理员将立即无法访问后台或执行任何管理操作，既有会话同步失效。'}
            </small>
          </span>
          <span className="admin-status-pill" data-tone={(isSelf || enabled) ? 'success' : 'muted'}>
            <span aria-hidden="true" />
            {(isSelf || enabled) ? '已启用' : '已停用'}
          </span>
        </label>

        {state?.error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <div className="admin-form-actions">
          <Button type="submit" className="min-h-11 px-6">
            {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {pending ? '正在保存…' : admin ? '保存管理员' : '创建管理员'}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
