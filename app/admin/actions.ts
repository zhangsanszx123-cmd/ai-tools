'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminAuth } from '@/lib/admin-auth'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { directoryStore } from '@/lib/directory-db'
import { normalizeMediaBase } from '@/lib/media-url'
import { revalidatePath } from 'next/cache'

export async function adminSignOut() {
  const auth = getAdminAuth()
  if (auth) {
    try { await auth.api.signOut({ headers: await headers() }) }
    catch { redirect('/admin?signout=failed') }
  }
  redirect('/admin/login')
}

export async function saveImageSettings(_state: { error?: string } | null, form: FormData): Promise<{ error?: string } | null> {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?tab=media')
  const base = normalizeMediaBase(String(form.get('base') ?? ''))
  const expected = String(form.get('expected') ?? '')
  if (!base) return { error: '请填写 / 或完整的 HTTP、HTTPS 地址，不支持账号密码、查询参数和锚点。' }
  if ((process.env.BETTER_AUTH_URL ?? '').startsWith('https:') && base.startsWith('http:')) return { error: '当前网站使用 HTTPS，请填写 HTTPS 图片服务器地址。' }
  try {
    if (!await directoryStore.saveMediaBase(admin.id, base, expected)) return { error: '设置已被其他管理员修改或权限已失效，请刷新后重试。' }
  } catch { return { error: '暂时无法保存图片设置，请稍后重试。' } }
  revalidatePath('/')
  revalidatePath('/admin')
  revalidatePath('/tools/[slug]', 'page')
  redirect('/admin?tab=media&saved=1')
}
