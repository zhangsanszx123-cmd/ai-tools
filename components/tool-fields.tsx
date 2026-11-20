'use client'

import { useEffect, useState } from 'react'
import { Eye, FileText, Image as ImageIcon, PencilLine } from 'lucide-react'
import Markdown from 'react-markdown'
import type { CatalogCategory } from '@/lib/catalog'
import type { ManagedTool } from '@/lib/directory-store'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

function useLocalPreview(file: File | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return url
}

export function ToolFields({
  categories,
  tool,
  prefix,
  mediaPreviewBase,
}: {
  categories: CatalogCategory[]
  tool?: ManagedTool
  prefix: string
  mediaPreviewBase?: string
}) {
  const [value, setValue] = useState({
    name: tool?.name ?? '',
    slug: tool?.slug ?? '',
    website: tool?.website ?? '',
    category: tool?.category ?? '',
    summary: tool?.summary ?? '',
    content: tool?.content ?? '',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [removeCover, setRemoveCover] = useState(false)
  const [editorMode, setEditorMode] = useState<'write' | 'preview'>('write')

  const logoLocalUrl = useLocalPreview(logoFile)
  const coverLocalUrl = useLocalPreview(coverFile)

  const existingLogoUrl = tool?.hasLogo && mediaPreviewBase ? `${mediaPreviewBase}/logo` : null
  const existingCoverUrl = tool?.hasCover && mediaPreviewBase ? `${mediaPreviewBase}/cover` : null
  const shownLogoUrl = logoLocalUrl ?? existingLogoUrl
  const shownCoverUrl = coverLocalUrl ?? existingCoverUrl

  const change = (key: keyof typeof value) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setValue({ ...value, [key]: event.target.value })

  return (
    <FieldGroup className="gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${prefix}-name`}>网站名称</FieldLabel>
          <Input
            id={`${prefix}-name`}
            name="name"
            value={value.name}
            onChange={change('name')}
            required
            maxLength={90}
            placeholder="例如：我的 AI 工具"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${prefix}-slug`}>站点标识（Slug）</FieldLabel>
          <Input
            id={`${prefix}-slug`}
            name="slug"
            value={value.slug}
            onChange={change('slug')}
            readOnly={Boolean(tool)}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={70}
            placeholder="my-ai-tool"
            className={tool ? 'bg-muted/60 font-mono text-muted-foreground' : 'font-mono'}
            aria-describedby={`${prefix}-slug-hint`}
          />
          <FieldDescription id={`${prefix}-slug-hint`}>
            {tool ? '已收录工具的标识固定，避免已有链接失效。' : '小写字母、数字和短横线，作为详情页地址的一部分。'}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${prefix}-website`}>官网网址</FieldLabel>
          <Input
            id={`${prefix}-website`}
            name="website"
            value={value.website}
            onChange={change('website')}
            type="url"
            required
            maxLength={1500}
            placeholder="https://example.com"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${prefix}-category`}>所属分类</FieldLabel>
          <select
            id={`${prefix}-category`}
            name="category"
            className="native-select"
            required
            value={value.category}
            onChange={change('category')}
          >
            <option value="" disabled>
              请选择一个分类
            </option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
                {!category.isEnabled ? '（已停用）' : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field className="admin-upload-card">
          <FieldLabel htmlFor={`${prefix}-logo`}>网站 Logo（选填）</FieldLabel>
          {shownLogoUrl && (
            <div className="admin-media-preview admin-media-preview-logo" data-removing={!logoLocalUrl && removeLogo}>
              <img src={shownLogoUrl} alt="Logo 预览" />
              <span className="admin-media-tag">
                {logoLocalUrl ? '新上传预览' : removeLogo ? '保存后将移除' : '当前 Logo'}
              </span>
            </div>
          )}
          <Input
            id={`${prefix}-logo`}
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-describedby={`${prefix}-logo-hint`}
            onChange={event => setLogoFile(event.target.files?.[0] ?? null)}
          />
          <FieldDescription id={`${prefix}-logo-hint`}>
            <ImageIcon size={13} className="mr-1 inline align-text-bottom" aria-hidden="true" />
            PNG、JPEG 或 WebP，不超过 512 KB。{tool?.hasLogo ? '不上传则保留原图。' : ''}
          </FieldDescription>
          {tool?.hasLogo && (
            <label className="check-label">
              <input
                type="checkbox"
                name="removeLogo"
                checked={removeLogo}
                onChange={event => setRemoveLogo(event.target.checked)}
              />
              移除现有 Logo（上传新图时优先替换）
            </label>
          )}
        </Field>

        <Field className="admin-upload-card">
          <FieldLabel htmlFor={`${prefix}-cover`}>网站预览图（选填）</FieldLabel>
          {shownCoverUrl && (
            <div className="admin-media-preview admin-media-preview-cover" data-removing={!coverLocalUrl && removeCover}>
              <img src={shownCoverUrl} alt="预览图预览" />
              <span className="admin-media-tag">
                {coverLocalUrl ? '新上传预览' : removeCover ? '保存后将移除' : '当前预览图'}
              </span>
            </div>
          )}
          <Input
            id={`${prefix}-cover`}
            name="cover"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-describedby={`${prefix}-cover-hint`}
            onChange={event => setCoverFile(event.target.files?.[0] ?? null)}
          />
          <FieldDescription id={`${prefix}-cover-hint`}>
            <ImageIcon size={13} className="mr-1 inline align-text-bottom" aria-hidden="true" />
            PNG、JPEG 或 WebP，不超过 2 MB，建议宽幅图片。{tool?.hasCover ? '不上传则保留原图。' : ''}
          </FieldDescription>
          {tool?.hasCover && (
            <label className="check-label">
              <input
                type="checkbox"
                name="removeCover"
                checked={removeCover}
                onChange={event => setRemoveCover(event.target.checked)}
              />
              移除现有预览图（上传新图时优先替换）
            </label>
          )}
        </Field>
      </div>

      <Field>
        <div className="admin-field-meta">
          <FieldLabel htmlFor={`${prefix}-summary`}>工具概要</FieldLabel>
          <span className="admin-char-count">{value.summary.length} / 130</span>
        </div>
        <Input
          id={`${prefix}-summary`}
          name="summary"
          value={value.summary}
          onChange={change('summary')}
          required
          maxLength={130}
          placeholder="用一句话介绍这个工具能做什么"
        />
      </Field>

      <Field>
        <div className="admin-markdown-toolbar">
          <div className="flex items-center gap-2">
            <FieldLabel htmlFor={`${prefix}-content`}>详细介绍（Markdown）</FieldLabel>
            <span className="admin-char-count">{value.content.length} / 12000</span>
          </div>
          <div className="admin-segmented" role="tablist" aria-label="Markdown 编辑模式">
            <button
              type="button"
              role="tab"
              aria-selected={editorMode === 'write'}
              data-active={editorMode === 'write'}
              onClick={() => setEditorMode('write')}
            >
              <PencilLine size={14} aria-hidden="true" />
              编写
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editorMode === 'preview'}
              data-active={editorMode === 'preview'}
              onClick={() => setEditorMode('preview')}
            >
              <Eye size={14} aria-hidden="true" />
              预览
            </button>
          </div>
        </div>
        <Textarea
          id={`${prefix}-content`}
          name="content"
          value={value.content}
          onChange={change('content')}
          required
          maxLength={12000}
          className={editorMode === 'preview' ? 'hidden' : 'min-h-40'}
          placeholder="介绍主要功能、使用场景和特色…"
        />
        {editorMode === 'preview' && (
          <div className="admin-markdown-preview">
            {value.content.trim() ? (
              <div className="markdown">
                <Markdown skipHtml disallowedElements={['img']}>
                  {value.content}
                </Markdown>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText size={15} aria-hidden="true" />
                暂无内容可预览，请切换到“编写”输入 Markdown 介绍。
              </p>
            )}
          </div>
        )}
      </Field>
    </FieldGroup>
  )
}
