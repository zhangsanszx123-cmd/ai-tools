import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { cache } from 'react'
import Markdown from 'react-markdown'
import { ToolLogo } from '@/components/catalog-elements'
import { SubHeader } from '@/components/sub-header'
import { websiteUrl } from '@/lib/catalog'
import { getCurrentUser } from '@/lib/directory-auth'
import { getTool } from '@/lib/directory-db'

const loadTool = cache(getTool)
export const dynamic = 'force-dynamic'

type ToolPageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: ToolPageProps): Promise<Metadata> {
  const tool = await loadTool((await params).slug)
  return tool ? { title: tool.name, description: tool.summary } : { title: '未找到工具' }
}

export default async function ToolPage({ params }: ToolPageProps) {
  const { slug } = await params
  const [tool, user] = await Promise.all([loadTool(slug), getCurrentUser()])
  if (!tool) notFound()
  const category = { id: tool.category, name: tool.categoryName }
  const url = websiteUrl(tool.website)
  return <>
    <SubHeader user={user ? { email: user.email } : null} />
    <main className="subpage">
      <nav className="breadcrumb" aria-label="当前位置"><Link href="/">首页</Link><ChevronRight size={14} aria-hidden="true" />{category && <><Link href={`/#${category.id}`}>{category.name}</Link><ChevronRight size={14} aria-hidden="true" /></>}<span aria-current="page">{tool.name}</span></nav>
      {tool.hasCover ? <div className="detail-cover"><img src={tool.coverUrl ?? `/api/tool-media/${tool.slug}/cover`} alt={`${tool.name} 网站预览`} /></div> : <div className="detail-cover art-cover" aria-hidden="true"><ToolLogo tool={tool} /><span className="cover-label">{tool.name}</span></div>}
      <div className="surface detail-heading"><div><h1>{tool.name}</h1><p>{tool.summary}</p><span className="tool-category">{category?.name ?? 'AI 工具'}</span></div>{url && <a className="primary-action" href={url.href} target="_blank" rel="noopener noreferrer">打开网站 <ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only">（新标签页）</span></a>}</div>
      <div className="detail-content">
        <section className="surface"><h2>工具介绍</h2><div className="markdown"><Markdown skipHtml disallowedElements={['img']}>{tool.content.replaceAll('\\n', '\n')}</Markdown></div></section>
        <section className="surface faq"><h2>常见问题</h2>
          <details><summary>如何使用 {tool.name}？</summary><p>点击「打开网站」前往官网。是否需要账号、如何开始使用，请以官网的说明为准。</p></details>
          <details><summary>{tool.name} 是否免费？</summary><p>功能和价格可能随地区、套餐和时间变化，请查看官网的最新说明。</p></details>
        </section>
      </div>
    </main>
  </>
}
