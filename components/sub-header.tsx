import Link from 'next/link'
import { ArrowLeft, UserRound } from 'lucide-react'
import { Brand } from './catalog-elements'

export function SubHeader({ account, hideAccount = false }: { account?: boolean; hideAccount?: boolean }) {
  return <header className="sub-header"><div className="sub-header-inner">
    <Brand />
    {hideAccount ? <Link className="text-action" href="/"><ArrowLeft size={16} aria-hidden="true" />返回导航</Link> : <Link className="account-link" href={account ? '/account' : '/login'}><UserRound size={16} aria-hidden="true" />{account ? '个人中心' : '登录'}</Link>}
  </div></header>
}
