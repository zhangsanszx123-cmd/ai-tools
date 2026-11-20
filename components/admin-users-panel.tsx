import Link from 'next/link'
import { AlertCircle, ArrowLeft, CheckCircle2, CirclePlus, ListFilter, Pencil, Search, ShieldCheck, UserRound } from 'lucide-react'
import { directoryStore } from '@/lib/directory-db'
import { validUserId } from '@/lib/directory-validation'
import { adminPageSize } from '@/lib/admin-pagination'
import { FrontendUserForm, AdminUserForm } from './directory-admin-forms'
import { AdminPagination } from './admin-pagination'
import { AdminUserDeleteAction, AdminUserStatusAction, FrontendUserDeleteAction, FrontendUserStatusAction } from './user-row-actions'
import { Alert, AlertDescription } from './ui/alert'

type Query = { q?: string; status?: string; pageSize?: string; edit?: string; new?: string; saved?: string; changed?: string; deleted?: string }
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' })

function Unavailable() {
  return <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>暂时无法加载用户数据，请稍后刷新重试。</AlertDescription></Alert>
}

export async function UsersPanel({ adminId, kind, page, query }: { adminId: string; kind: 'users' | 'admins'; page: number; query: Query }) {
  const isAdmin = kind === 'admins'
  const label = isAdmin ? '后台管理员' : '前端用户'
  const Icon = isAdmin ? ShieldCheck : UserRound
  const base = `/admin?tab=${kind}`
  if (query.new === '1' || query.edit !== undefined) {
    const editing = query.edit !== undefined
    const record = editing && validUserId(query.edit ?? '')
      ? await (isAdmin ? directoryStore.getManagedAdmin(adminId, query.edit!) : directoryStore.getManagedUser(adminId, query.edit!)).catch(() => null)
      : null
    return <section className="admin-card">
      <div className="admin-subview-head"><div>
        <Link className="admin-back-link" href={base}><ArrowLeft size={15} aria-hidden="true" />返回用户列表</Link>
        <h1>{editing ? '编辑' : '新增'}{label}{record ? ` · ${record.name}` : ''}</h1>
      </div></div>
      {editing && !record ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>账号不存在或暂时无法加载，请返回列表重试。</AlertDescription></Alert>
        : isAdmin ? <AdminUserForm key={record?.id ?? 'new'} admin={record as Awaited<ReturnType<typeof directoryStore.getManagedAdmin>>} isSelf={record?.id === adminId} />
        : <FrontendUserForm key={record?.id ?? 'new'} user={record as Awaited<ReturnType<typeof directoryStore.getManagedUser>>} />}
    </section>
  }
  const q = query.q?.trim().slice(0, 100) ?? ''
  const status = ['enabled', 'disabled'].includes(query.status ?? '') ? query.status! : ''
  const pageSize = adminPageSize(query.pageSize)
  const result = await (isAdmin ? directoryStore.getManagedAdmins(adminId, page, { query: q, status, pageSize }) : directoryStore.getManagedUsers(adminId, page, { query: q, status, pageSize })).catch(() => null)
  const notice = query.saved === '1' ? '账号已保存。' : query.changed === '1' ? '账号状态已更新。' : query.deleted === '1' ? '账号已删除，历史业务记录已保留。' : ''
  return <section className="admin-card">
    <div className="admin-card-head">
      <div className="admin-title-group"><h1>{label}列表</h1>{result && <span className="admin-count-chip">共 {result.total} 条</span>}{(q || status) && <span className="admin-filter-pill">已筛选</span>}</div>
      <Link className="primary-action admin-cta" href={`${base}&new=1`}><CirclePlus size={15} aria-hidden="true" />新增{label}</Link>
    </div>
    <p className="admin-users-description">{isAdmin ? '管理后台登录账号与管理权限。当前登录账号不可停用或删除。' : '管理前台注册账号、登录状态与投稿概况。'}</p>
    {notice && <div role="status" className="admin-notice"><CheckCircle2 size={16} aria-hidden="true" />{notice}</div>}
    <form method="GET" action="/admin" className="admin-filters">
      <input type="hidden" name="tab" value={kind} /><input type="hidden" name="pageSize" value={pageSize} />
      <label className="admin-filter-search"><span className="sr-only">用户关键词</span><div className="admin-input-wrap"><Search size={14} aria-hidden="true" /><input name="q" defaultValue={q} maxLength={100} placeholder="搜索名称或邮箱…" /></div></label>
      <label className="admin-filter-select"><span className="sr-only">账号状态</span><select name="status" defaultValue={status}><option value="">全部状态</option><option value="enabled">已启用</option><option value="disabled">已停用</option></select></label>
      <button className="admin-query-btn" type="submit"><ListFilter size={14} aria-hidden="true" />查询</button>
      {(q || status) && <Link className="admin-back-link" href={base}>重置筛选</Link>}
    </form>
    {!result ? <Unavailable /> : <>
      <div className="admin-table-wrap" role="region" aria-label={`${label}列表，可横向滚动`} tabIndex={0}>
        <table className="admin-table"><caption className="sr-only">{label}列表</caption>
          <thead><tr><th scope="col">名称 / 邮箱</th><th scope="col">状态</th><th scope="col">{isAdmin ? '运营记录' : '投稿记录'}</th><th scope="col">创建时间</th><th scope="col">操作</th></tr></thead>
          <tbody>{result.items.map(item => <tr key={item.id}>
            <td><div className="admin-cell-entity"><span className="admin-icon-badge" aria-hidden="true"><Icon size={17} /></span><div className="min-w-0"><strong className="admin-entity-title">{item.name}</strong><span className="admin-entity-slug admin-user-email">{item.email}</span></div></div></td>
            <td><span className="admin-status-pill" data-tone={item.isEnabled ? 'success' : 'muted'}><span aria-hidden="true" />{item.isEnabled ? '已启用' : '已停用'}</span></td>
            <td><div className="admin-rank-group">{'reviewCount' in item ? <><span>审核 {item.reviewCount} 次</span><span className="admin-unfeatured-text">收录 {item.toolCount} 项</span></> : <><span>投稿 {item.submissionCount} 次</span><span className="admin-unfeatured-text">通过 {item.approvedCount} 次</span></>}</div></td>
            <td><time className="admin-user-date" dateTime={new Date(item.createdAt).toISOString()}>{dateFormat.format(new Date(item.createdAt))}</time></td>
            <td><div className="admin-row-actions">
              <Link className="admin-row-btn admin-row-btn-edit" href={`${base}&edit=${encodeURIComponent(item.id)}`}><Pencil size={14} aria-hidden="true" />编辑</Link>
              {isAdmin ? <><AdminUserStatusAction id={item.id} enabled={item.isEnabled} isSelf={item.id === adminId} /><AdminUserDeleteAction id={item.id} email={item.email} isSelf={item.id === adminId} /></> : <><FrontendUserStatusAction id={item.id} enabled={item.isEnabled} /><FrontendUserDeleteAction id={item.id} email={item.email} /></>}
            </div></td>
          </tr>)}{!result.items.length && <tr><td colSpan={5} className="admin-table-empty"><div className="admin-empty-inline"><Icon size={22} aria-hidden="true" /><p>{q || status ? '没有符合查询条件的账号。' : '暂无账号，点击新增开始创建。'}</p></div></td></tr>}</tbody>
        </table>
      </div>
      <AdminPagination tab={kind} params={{ q, status }} pagination={result} />
    </>}
  </section>
}
