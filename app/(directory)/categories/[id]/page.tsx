import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ChevronRight } from 'lucide-react'
import { ToolCard } from '@/components/catalog-elements'
import { getCategories, getCatalog } from '@/lib/directory-db'

export const dynamic = 'force-dynamic'
const loadCategory = cache(async (id: string) => (await getCategories()).find(category => category.id === id))
type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await loadCategory((await params).id)
  return { title: category?.name ?? '未找到分类', description: category?.description }
}

export default async function CategoryPage({ params }: Props) {
  const { id } = await params
  const category = await loadCategory(id)
  if (!category) notFound()
  const catalog = await getCatalog()
  const tools = catalog.filter(tool => tool.category === id).sort((a, b) => a.displayOrder - b.displayOrder)
  return <>
    <div>
      <nav className="breadcrumb" aria-label="当前位置"><Link href="/">首页</Link><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{category.name}</span></nav>
      <div className="account-heading"><h1>{category.name}</h1><p>{category.description}</p></div>
      <section className="tool-section" aria-label={`${category.name}全部工具`}>
        <div className="section-head"><span className="collection-count">共 {tools.length} 款工具</span><Link className="text-action" href={`/#${encodeURIComponent(id)}`}>返回首页分类</Link></div>
        {tools.length ? <div className="tool-grid">{tools.map(tool => <ToolCard key={tool.slug} tool={tool} />)}</div> : <div className="catalog-empty">此分类暂未收录工具。</div>}
      </section>
    </div>
  </>
}
