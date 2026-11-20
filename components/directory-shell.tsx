'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronRight, Compass, Menu, Plus, X } from 'lucide-react'
import { Brand, getCategoryIcon } from './catalog-elements'
import { AccountStatus, type AccountIdentity } from './account-status'
import type { CatalogCategory } from '@/lib/catalog'

export function DirectoryShell({ categories, user, children }: { categories: CatalogCategory[]; user: AccountIdentity | null; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false)
  const [homeCategory, setHomeCategory] = useState('')
  const pathname = usePathname()
  useEffect(() => { setDrawer(false) }, [pathname])
  useEffect(() => {
    function close(event: KeyboardEvent) { if (event.key === 'Escape') setDrawer(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [])
  useEffect(() => {
    function syncHash() { setHomeCategory(decodeURIComponent(window.location.hash.slice(1))) }
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [pathname])
  const active = pathname === '/' ? homeCategory : categories.find(category => pathname === `/categories/${encodeURIComponent(category.id)}`)?.id
  return <div className="directory-shell" id="home">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    {drawer && <button className="nav-backdrop" type="button" onClick={() => setDrawer(false)} aria-label="关闭分类导航" />}
    <aside id="category-navigation" className="directory-sidebar" data-open={drawer}>
      <div className="sidebar-brand"><Brand /><button className="icon-button nav-close" type="button" onClick={() => setDrawer(false)} aria-label="关闭菜单"><X size={20} /></button></div>
      <nav className="sidebar-nav" aria-label="分类导航">
        <p className="nav-label">工具分类</p>
        {categories.map(({ id, name, iconKey }) => {
          const Icon = getCategoryIcon(iconKey)
          return <Link key={id} href={`/#${encodeURIComponent(id)}`} onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            setDrawer(false)
            setHomeCategory(id)
            if (pathname === '/') window.dispatchEvent(new CustomEvent('directory:category-jump', { detail: id }))
          }} data-active={active === id} aria-current={active === id ? 'location' : undefined}><Icon size={17} aria-hidden="true" /><span>{name}</span><ChevronRight className="nav-chevron" size={14} aria-hidden="true" /></Link>
        })}
      </nav>
      <div className="sidebar-footer"><Link href="/account?tab=submit" className="submit-link"><Plus size={18} aria-hidden="true" />提交站点</Link><p>收录优质工具 · 持续更新</p></div>
    </aside>
    <div className="directory-pane">
      <header className="directory-header">
        <button type="button" className="icon-button nav-toggle" onClick={() => setDrawer(!drawer)} aria-label="打开分类导航" aria-expanded={drawer} aria-controls="category-navigation"><Menu size={22} /></button>
        <div className="header-title"><Compass size={17} aria-hidden="true" /><span>探索</span><ChevronRight size={14} aria-hidden="true" /><strong>工具导航</strong></div>
        <div className="header-actions"><Link className="text-action admin-entry" href="/admin">后台管理</Link><AccountStatus user={user} /></div>
      </header>
      <main className="directory-content" id="main-content">
        {children}
      </main>
    </div>
  </div>
}
