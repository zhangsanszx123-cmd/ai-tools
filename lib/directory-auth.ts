import 'server-only'
import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { headers } from 'next/headers'
import { cache } from 'react'
import { pool } from './directory-db'
import { directoryAuthOptions } from './auth-options'

export function isAuthConfigured() {
  return Boolean(process.env.DATABASE_URL && (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32)
}

function createDirectoryAuth() {
  return betterAuth({
    ...directoryAuthOptions(pool),
    plugins: [nextCookies()],
  })
}

let auth: ReturnType<typeof createDirectoryAuth> | undefined

export function getDirectoryAuth() {
  if (!isAuthConfigured()) return null
  return auth ??= createDirectoryAuth()
}

export const getCurrentUser = cache(async () => {
  const auth = getDirectoryAuth()
  if (!auth) return null
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user ?? null
  } catch {
    console.error('Could not read directory session')
    return null
  }
})
