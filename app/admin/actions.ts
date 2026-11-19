'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminAuth } from '@/lib/admin-auth'

export async function adminSignOut() {
  const auth = getAdminAuth()
  if (auth) {
    try { await auth.api.signOut({ headers: await headers() }) }
    catch { redirect('/admin?signout=failed') }
  }
  redirect('/admin/login')
}
