'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { ArrowRight, ChevronRight, Clock3, Compass, Flame, Menu, Plus, Search, Sparkles, X } from 'lucide-react'
import { type CatalogCategory, type CatalogTool, type CategoryId } from '@/lib/catalog'
import { Brand, getCategoryIcon, ToolCard } from './catalog-elements'
import { AccountStatus, type AccountIdentity } from './account-status'

function SearchBox({ query, onQuery, onSubmit, inputRef }: {
  query: string
  onQuery: (query: string) => void
  onSubmit: () => void
  inputRef: React.Ref<HTMLInputElement>
}) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit() }
  return <form role="search" className="search-box hero-search" onSubmit={submit}>
    <Search size={18} aria-hidden="true" />
    <label htmlFor="tool-query" className="sr-only">搜索 AI 工具</label>
    <input ref={inputRef} id="tool-query" type="search" enterKeyHint="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索工具名称、关键词或分类..." autoComplete="off" aria-keyshortcuts="Control+K Meta+K" />
    <button type="submit" className="primary-action">搜索</button>
  </form>
}

function FeaturedSection({ id, title, description, icon: Icon, tools, emptyMessage }: {
  id: 'popular' | 'latest'
  title: string
  description: string
  icon: typeof Flame
  tools: CatalogTool[]
  emptyMessage: string
}) {
  return <section id={id} className="tool-section" aria-labelledby={`${id}-title`}>
    <div className="section-head">
      <div className="section-title">
        <span className="section-icon"><Icon size={21} aria-hidden="true" /></span>
        <div><h2 id={`${id}-title`}>{title}</h2><p>{description}</p></div>
      </div>
    </div>
    {tools.length ? <div className="tool-grid">{tools.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}</div> : <div className="catalog-empty">{emptyMessage}</div>}
  </section>
}

export function Directory({ categories, tools, user, unavailable }: { categories: CatalogCategory[]; tools: CatalogTool[]; user: AccountIdentity | null; unavailable: 'configuration' | 'connection' | null }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState('home')
  const [drawer, setDrawer] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | ''>('')
  const searchInput = useRef<HTMLInputElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); searchInput.current?.focus()
      }
      if (event.key === 'Escape') setDrawer(false)
    }
    document.addEventListener('keydown', shortcuts)
    return () => document.removeEventListener('keydown', shortcuts)
  }, [])

  const isFiltered = Boolean(query.trim() || categoryFilter)
  const matches = tools.filter((tool) => {
    const category = categories.find(({ id }) => id === tool.category)
    return (!categoryFilter || categoryFilter === tool.category) && `${tool.name} ${tool.summary} ${category?.name ?? ''} ${category?.short ?? ''} ${tool.slug}`.toLowerCase().includes(query.trim().toLowerCase())
  })
  const popularTools = tools.filter((tool) => tool.featuredOrder !== null).sort((a, b) => a.featuredOrder! - b.featuredOrder!).slice(0, 8)
  const latestTools = tools.slice(0, 8)

  function jump(event: MouseEvent<HTMLAnchorElement>, id: CategoryId) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    setQuery(''); setCategoryFilter(''); setActive(id); setDrawer(false)
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'auto' }))
  }

  function submitSearch() { resultHeading.current?.focus(); resultHeading.current?.scrollIntoView({ block: 'start' }) }

  return <div className="directory-shell" id="home">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    {drawer && <button className="nav-backdrop" type="button" onClick={() => setDrawer(false)} aria-label="关闭分类导航" />}
    <aside id="category-navigation" className="directory-sidebar" data-open={drawer}>
      <div className="sidebar-brand"><Brand /><button className="icon-button nav-close" type="button" onClick={() => setDrawer(false)} aria-label="关闭菜单"><X size={20} /></button></div>
      <nav className="sidebar-nav" aria-label="分类导航">
        <p className="nav-label">工具分类</p>
        {categories.map(({ id, name, iconKey }) => {
          const Icon = getCategoryIcon(iconKey)
          return <a key={id} href={`#${id}`} onClick={(event) => jump(event, id)} data-active={active === id} aria-current={active === id ? 'location' : undefined}><Icon size={17} aria-hidden="true" /><span>{name}</span><ChevronRight className="nav-chevron" size={14} aria-hidden="true" /></a>
        })}
      </nav>
      <div className="sidebar-footer"><Link href="/account?tab=submit" className="submit-link"><Plus size={18} aria-hidden="true" />提交站点</Link><p>收录优质工具 · 持续更新</p></div>
    </aside>
    <div className="directory-pane">
      <header className="directory-header">
        <button type="button" className="icon-button nav-toggle" onClick={() => setDrawer(!drawer)} aria-label="打开分类导航" aria-expanded={drawer} aria-controls="category-navigation"><Menu size={22} /></button>
        <div className="header-title"><Compass size={17} aria-hidden="true" /><span>探索</span><ChevronRight size={14} aria-hidden="true" /><strong>工具导航</strong></div>
        <AccountStatus user={user} />
      </header>
      <main className="directory-content" id="main-content">
        <div className="directory-hero">
          <div className="hero-copy">
            <span className="hero-badge"><Sparkles size={14} aria-hidden="true" /> AI 工具导航</span>
            <h1>发现下一款好用的 <span>AI 工具</span></h1>
            <p>从灵感到实践，找到适合你的 AI 工具。</p>
            <SearchBox query={query} onQuery={setQuery} onSubmit={submitSearch} inputRef={searchInput} />
            <label className="hero-category">
              <span className="sr-only">按分类筛选</span>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as CategoryId | '')}>
                <option value="">搜索全部分类</option>
                {categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          </div>
        </div>
        {unavailable ? <div className="catalog-empty" role="status">{unavailable === 'configuration' && process.env.NODE_ENV === 'development'
          ? '目录数据库尚未配置。请在 .env.local 中设置 DATABASE_URL，按 README 初始化数据表，然后重启开发服务。'
          : '目录暂时无法加载，请稍后刷新页面重试。'}</div> : isFiltered ? <section className="tool-section" aria-labelledby="search-title">
          <div className="section-head"><div className="section-title"><span className="section-icon"><Search size={20} aria-hidden="true" /></span><div><h2 id="search-title" ref={resultHeading} tabIndex={-1}>搜索结果</h2><p aria-live="polite">找到 {matches.length} 款工具</p></div></div><button type="button" onClick={() => { setQuery(''); setCategoryFilter('') }} className="text-action">清除筛选 <X size={15} aria-hidden="true" /></button></div>
          {matches.length ? <div className="tool-grid">{matches.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}</div> : <div className="catalog-empty">没有找到匹配的工具，试试其他关键词或分类。</div>}
        </section> : <>
          <FeaturedSection id="popular" title="热门工具" description="从这些广受欢迎的 AI 工具开始" icon={Flame} tools={popularTools} emptyMessage="暂无热门工具。" />
          <FeaturedSection id="latest" title="最新收录" description="最近添加到目录的 AI 工具" icon={Clock3} tools={latestTools} emptyMessage="暂无新收录的工具。" />
          {categories.map(({ id, name, description, iconKey }) => {
            const list = tools.filter((tool) => tool.category === id).sort((a, b) => a.displayOrder - b.displayOrder)
            const Icon = getCategoryIcon(iconKey)
            return <section key={id} id={id} className="tool-section category-section" aria-labelledby={`${id}-title`}>
              <div className="section-head"><div className="section-title"><span className="section-icon"><Icon size={20} aria-hidden="true" /></span><div><h2 id={`${id}-title`}>{name}</h2><p>{description}</p></div></div><span className="collection-count">{list.length} 款工具</span></div>
              {list.length ? <div className="tool-grid">{list.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}</div> : <div className="catalog-empty">此分类暂未收录工具。</div>}
            </section>
          })}
        </>}
        <footer className="directory-footer"><span>AI 工具箱</span><Link href="/account?tab=submit">推荐一款工具 <ArrowRight size={15} aria-hidden="true" /></Link></footer>
      </main>
    </div>
  </div>
}
