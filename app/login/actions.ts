'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDirectoryAuth } from '@/lib/directory-auth'

export async function signOut() {
  const auth = getDirectoryAuth()
  if (auth) {
    try {
      await auth.api.signOut({ headers: await headers() })
    } catch {
      redirect('/account?tab=profile&signout=failed')
    }
  }
  redirect('/login')
}
