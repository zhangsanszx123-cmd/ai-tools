import { Directory } from '@/components/directory'
import { getCurrentUser } from '@/lib/directory-auth'
import { getCatalog, getCategories } from '@/lib/directory-db'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const configured = Boolean(process.env.DATABASE_URL?.trim())
  const [result, user] = await Promise.all([
    configured ? Promise.all([getCategories(), getCatalog()]).catch((error: unknown) => {
      // Drizzle wraps driver errors. Log only a diagnostic code, never the query or credentials.
      const cause = error instanceof Error && error.cause ? error.cause : error
      const code = cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
        ? cause.code : 'UNKNOWN'
      console.warn('Could not load directory. Database error code:', code)
      return null
    }) : Promise.resolve(null),
    getCurrentUser(),
  ])
  const unavailable = result === null ? (configured ? 'connection' : 'configuration') : null
  return <Directory categories={result?.[0] ?? []} tools={result?.[1] ?? []} user={user ? { email: user.email } : null} unavailable={unavailable} />
}
