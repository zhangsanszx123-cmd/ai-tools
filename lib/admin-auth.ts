import 'server-only'
import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { headers } from 'next/headers'
import { cache } from 'react'
import { adminAuthOptions } from './admin-auth-options'
import { isAuthConfigured } from './directory-auth'
import { pool, directoryStore } from './directory-db'

let auth: ReturnType<typeof createAdminAuth> | undefined
function createAdminAuth() { return betterAuth({ ...adminAuthOptions(pool), plugins: [nextCookies()] }) }
export function getAdminAuth() {
  if (!isAuthConfigured()) return null
  return auth ??= createAdminAuth()
}
export const getCurrentAdmin = cache(async () => {
  const auth = getAdminAuth()
  if (!auth) return null
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user && await directoryStore.isAdmin(session.user.id) ? session.user : null
  } catch { console.error('Could not read admin session'); return null }
})
