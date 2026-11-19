'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { categories, websiteUrl } from '@/lib/catalog'
import { getCurrentUser } from '@/lib/directory-auth'
import { db, tools } from '@/lib/directory-db'
import { normalizeImage, publishTool } from '@/lib/directory-submissions'

type SubmissionState = { error?: string } | null

export async function submitTool(_state: SubmissionState, form: FormData): Promise<SubmissionState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=submit')
  const value = (key: string) => typeof form.get(key) === 'string' ? String(form.get(key)).trim() : ''
  const name = value('name'), slug = value('slug').toLowerCase(), category = value('category'), website = value('website'), summary = value('summary'), content = value('content')
  if (!name || name.length > 90 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 70 || !categories.some(({ id }) => category === id) || website.length > 1500 || !websiteUrl(website) || !summary || summary.length > 130 || !content || content.length > 12000) {
    return { error: '请检查必填内容、网址和站点标识格式后再提交。' }
  }
  let logo: Buffer | null, cover: Buffer | null
  try {
    ;[logo, cover] = await Promise.all([
      normalizeImage(form.get('logo'), 512 * 1024, 256),
      normalizeImage(form.get('cover'), 2 * 1024 * 1024, 1500),
    ])
  } catch {
    return { error: '无法读取图片。请上传符合大小限制的 PNG、JPEG 或 WebP。' }
  }
  try {
    const rows = await db.insert(tools).values({ name, slug, category, website: websiteUrl(website)!.href, summary, content, logoData: logo, logoType: logo ? 'image/webp' : null, coverData: cover, coverType: cover ? 'image/webp' : null, userId: user.id, status: 'pending' }).onConflictDoNothing().returning({ slug: tools.slug })
    if (!rows.length) return { error: '该站点标识不可用，请更换后再提交。' }
  } catch (error) {
    console.error('Could not submit directory tool:', error instanceof Error ? error.name : 'unknown')
    return { error: '提交暂未完成，请稍后重试。' }
  }
  revalidatePath('/account')
  redirect('/account?submitted=1')
}

export async function approveTool(form: FormData) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const slug = String(form.get('slug') ?? '')
  if (slug.length > 70 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !(await publishTool(user.id, slug))) redirect('/account?tab=review&review=unavailable')
  revalidatePath('/')
  revalidatePath(`/tools/${slug}`)
  redirect('/account?tab=review&review=published')
}
