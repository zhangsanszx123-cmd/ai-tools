import { Directory } from '@/components/directory'
import { getCurrentUser } from '@/lib/directory-auth'
import { getCatalog } from '@/lib/directory-db'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [result, user] = await Promise.all([
    getCatalog().catch((error: unknown) => { console.error('Could not load directory:', error instanceof Error ? error.name : 'unknown'); return null }),
    getCurrentUser(),
  ])
  return <Directory tools={result ?? []} signedIn={Boolean(user)} unavailable={!result} />
}
