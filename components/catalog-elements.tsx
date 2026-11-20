import Link from 'next/link'
import { AudioLines, Bot, BrainCircuit, BriefcaseBusiness, ClipboardCheck, Code2, GraduationCap, Image, Laptop, LibraryBig, MessageCircle, Palette, PenLine, ScanText, Search, Sparkles, Terminal, Video, type LucideIcon } from 'lucide-react'
import { type CatalogTool, toolLogo } from '@/lib/catalog'

const categoryIcons: Record<string, LucideIcon> = {
  PenLine, Image, Video, LibraryBig, MessageCircle, Bot, Code2, Laptop, Palette,
  AudioLines, Search, GraduationCap, BrainCircuit, ClipboardCheck, ScanText, Terminal, BriefcaseBusiness, Sparkles,
}

export function getCategoryIcon(key: string): LucideIcon { return Object.hasOwn(categoryIcons, key) ? categoryIcons[key] : Sparkles }

export function Brand() {
  return <Link href="/" className="brand" aria-label="AI 工具箱首页">
    <span className="brand-mark"><Sparkles size={22} aria-hidden="true" /></span>
    <span><strong>AI 工具箱</strong><small>发现好用的 AI 工具</small></span>
  </Link>
}

export function ToolLogo({ tool }: { tool: CatalogTool }) {
  const src = toolLogo(tool)
  return <span className="tool-logo" data-brand={tool.logoKey ?? ''}>
    {src ? <img src={src} width="28" height="28" alt="" loading="lazy" decoding="async" /> : <span>{tool.name.slice(0, 1).toUpperCase()}</span>}
  </span>
}

export function ToolCard({ tool }: { tool: CatalogTool }) {
  return <Link className="tool-card" href={`/tools/${tool.slug}`} target="_blank" rel="noopener noreferrer" prefetch={false}>
    <ToolLogo tool={tool} />
    <div className="tool-card-copy">
      <h3 title={tool.name}>{tool.name}<span className="sr-only">（在新标签页打开）</span></h3>
      <p title={tool.summary}>{tool.summary}</p>
    </div>
  </Link>
}
