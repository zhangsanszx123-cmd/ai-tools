import Link from 'next/link'
import { ArrowUpRight, AudioLines, Bot, BrainCircuit, BriefcaseBusiness, ClipboardCheck, Code2, GraduationCap, Image, Laptop, LibraryBig, MessageCircle, Palette, PenLine, ScanText, Search, Sparkles, Terminal, Video, type LucideIcon } from 'lucide-react'
import { type CatalogTool, type CategoryId, categories, toolLogo } from '@/lib/catalog'

export const categoryIcons = {
  writing: PenLine,
  image: Image,
  video: Video,
  office: LibraryBig,
  chat: MessageCircle,
  agents: Bot,
  code: Code2,
  platforms: Laptop,
  design: Palette,
  audio: AudioLines,
  search: Search,
  learning: GraduationCap,
  training: BrainCircuit,
  evaluation: ClipboardCheck,
  detection: ScanText,
  prompts: Terminal,
  'side-hustle': BriefcaseBusiness,
} satisfies Record<CategoryId, LucideIcon>

export function Brand() {
  return <Link href="/" className="brand" aria-label="AI 工具箱首页">
    <span className="brand-mark"><Sparkles size={22} aria-hidden="true" /></span>
    <span><strong>AI 工具箱</strong><small>发现好用的 AI 工具</small></span>
  </Link>
}

export function ToolLogo({ tool }: { tool: CatalogTool }) {
  const src = toolLogo(tool)
  return <span className="tool-logo" data-brand={tool.logoKey ?? ''}>
    {src ? <img src={src} width="28" height="28" alt="" decoding="async" /> : <span>{tool.name.slice(0, 1).toUpperCase()}</span>}
  </span>
}

export function ToolCard({ tool }: { tool: CatalogTool }) {
  const category = categories.find(({ id }) => id === tool.category)
  return <Link className="tool-card" href={`/tools/${tool.slug}`} target="_blank" rel="noopener noreferrer" prefetch={false}>
    <div className="tool-card-top"><ToolLogo tool={tool} /><ArrowUpRight className="tool-arrow" size={17} aria-hidden="true" /></div>
    <h3>{tool.name}<span className="sr-only">（在新标签页打开）</span></h3>
    <p title={tool.summary}>{tool.summary}</p>
    <span className="tool-category">{category?.short ?? 'AI 工具'}</span>
  </Link>
}
