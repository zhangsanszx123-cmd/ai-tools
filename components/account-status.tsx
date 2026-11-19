import Link from 'next/link'
import { UserRound } from 'lucide-react'

export type AccountIdentity = { email: string }

export function AccountStatus({ user }: { user?: AccountIdentity | null }) {
  if (!user) return <Link className="account-link" href="/login"><UserRound size={16} aria-hidden="true" />登录 / 注册</Link>

  return <Link className="account-status" href="/account" aria-label={`已登录：${user.email}，进入个人中心`}>
    <span className="account-avatar" aria-hidden="true"><UserRound size={18} /></span>
    <span className="account-identity">
      <span className="account-email" title={user.email}>{user.email}</span>
      <span className="account-state"><span aria-hidden="true" />已登录<span className="account-destination"> · 个人中心</span></span>
    </span>
  </Link>
}
