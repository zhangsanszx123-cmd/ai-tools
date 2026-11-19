import 'server-only'
import { createNeonAuth } from '@neon/auth/next/server'
import { cache } from 'react'

export function getDirectoryAuth() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL
  const secret = process.env.NEON_AUTH_COOKIE_SECRET
  if (!baseUrl || !secret || secret.length < 32) return null
  return createNeonAuth({
    baseUrl,
    cookies: { secret, sameSite: process.env.NODE_ENV === 'development' ? 'none' : 'lax' },
  })
}

export const getCurrentUser = cache(async () => {
  const auth = getDirectoryAuth()
  if (!auth) return null
  try {
    const { data } = await auth.getSession()
    return data?.user ?? null
  } catch (error) {
    console.error('Could not read directory session:', error instanceof Error ? error.name : 'unknown')
    return null
  }
})
