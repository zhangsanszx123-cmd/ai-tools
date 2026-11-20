export type CategoryId = string

export type CatalogCategory = {
  id: string
  name: string
  short: string
  description: string
  iconKey: string
  sortOrder: number
  isEnabled: boolean
}

export type CatalogTool = {
  id: string
  slug: string
  name: string
  category: string
  categoryName: string
  categoryShort: string
  website: string
  summary: string
  logoKey: string | null
  hasLogo: boolean
  logoUrl?: string | null
  coverUrl?: string | null
  featuredOrder: number | null
  displayOrder: number
  publishedAt: string
}

export const iconKeys = ['PenLine', 'Image', 'Video', 'LibraryBig', 'MessageCircle', 'Bot', 'Code2', 'Laptop', 'Palette', 'AudioLines', 'Search', 'GraduationCap', 'BrainCircuit', 'ClipboardCheck', 'ScanText', 'Terminal', 'BriefcaseBusiness', 'Sparkles'] as const
export const brandKeys = ['openai', 'claude', 'midjourney', 'deepseek', 'gemini', 'perplexity', 'notion', 'cursor', 'kimi', 'doubao', 'grammarly', 'ideogram', 'runway', 'descript', 'suno', 'elevenlabs', 'canva', 'windsurf'] as const

export function toolLogo(tool: Pick<CatalogTool, 'slug' | 'hasLogo' | 'logoKey'>) {
  if (tool.hasLogo) return ('logoUrl' in tool && typeof tool.logoUrl === 'string') ? tool.logoUrl : `/api/tool-media/${tool.slug}/logo`
  if (tool.logoKey && (brandKeys as readonly string[]).includes(tool.logoKey)) return `/brands/${tool.logoKey}.svg`
  return null
}

export function websiteUrl(value: string) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password ? url : null
  } catch { return null }
}

export function validRecordId(value: string) {
  return /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= BigInt('9223372036854775807')
}

export function pageNumber(value?: string) {
  return value && /^[0-9]{1,6}$/.test(value) ? Math.max(1, Math.min(Number(value), 100000)) : 1
}
