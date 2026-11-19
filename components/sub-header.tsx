import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Brand } from './catalog-elements'
import { AccountStatus, type AccountIdentity } from './account-status'

export function SubHeader({ user, hideAccount = false }: { user?: AccountIdentity | null; hideAccount?: boolean }) {
  return <header className="sub-header"><div className="sub-header-inner">
    <Brand />
    {hideAccount ? <Link className="text-action" href="/"><ArrowLeft size={16} aria-hidden="true" />返回导航</Link> : <AccountStatus user={user} />}
  </div></header>
}
