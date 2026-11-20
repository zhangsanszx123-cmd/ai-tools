import { DirectoryShell } from '@/components/directory-shell'
import { getCategories } from '@/lib/directory-db'
import { getCurrentUser } from '@/lib/directory-auth'

export default async function DirectoryLayout({ children }: { children: React.ReactNode }) {
  const [categories, user] = await Promise.all([
    getCategories().catch(() => []),
    getCurrentUser(),
  ])
  return <DirectoryShell categories={categories} user={user ? { email: user.email } : null}>{children}</DirectoryShell>
}
