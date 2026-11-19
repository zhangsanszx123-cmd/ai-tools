'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { validRecordId } from '@/lib/catalog'
import { getCurrentUser } from '@/lib/directory-auth'
import { directoryStore } from '@/lib/directory-db'
import { isAdmin, normalizeImage } from '@/lib/directory-submissions'
import { databaseErrorCode, formText, parseCategoryForm, parseToolForm, parseToolManagement } from '@/lib/directory-validation'

export type ActionState = { error?: string } | null

async function currentAdmin() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return await isAdmin(user.id) ? user : null
}

async function images(form: FormData) {
  const [logoData, coverData] = await Promise.all([
    normalizeImage(form.get('logo'), 512 * 1024, 256),
    normalizeImage(form.get('cover'), 2 * 1024 * 1024, 1500),
  ])
  return { logoData, coverData }
}

function refreshDirectory() {
  revalidatePath('/')
  revalidatePath('/account')
  revalidatePath('/tools/[slug]', 'page')
}

export async function submitTool(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=submit')
  const value = parseToolForm(form)
  if (!value) return { error: '请检查必填内容、网址、分类和站点标识后再提交。' }
  let media
  try { media = await images(form) } catch { return { error: '请上传符合大小限制的 PNG、JPEG 或 WebP 图片。' } }
  try {
    if (!await directoryStore.submitTool(user.id, { ...value, ...media })) return { error: '分类已停用或该工具已被收录，请刷新分类或更换站点标识。' }
  } catch (error) {
    const code = databaseErrorCode(error)
    console.error('Directory submission error code:', code)
    return { error: code === '23505' ? '你已经提交了相同标识的待审核工具，请查看提交历史。' : '暂时无法提交，请稍后重试。' }
  }
  revalidatePath('/account')
  redirect('/account?submitted=1')
}

export async function reviewSubmission(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentAdmin()
  if (!user) return { error: '你没有审核权限。' }
  const id = formText(form, 'id'), decision = formText(form, 'decision'), reason = formText(form, 'reason')
  if (!validRecordId(id) || !['approve', 'reject'].includes(decision)) return { error: '审核参数无效，请刷新后重试。' }
  if (decision === 'reject' && (!reason || reason.length > 1000)) return { error: '驳回原因必填，最多 1000 个字符。' }
  try {
    const result = decision === 'approve'
      ? await directoryStore.approveTool(user.id, id)
      : await directoryStore.rejectTool(user.id, id, reason)
    if (!result) return { error: '投稿已被处理、分类已停用，或你已没有审核权限。' }
  } catch (error) {
    const code = databaseErrorCode(error)
    console.error('Directory review error code:', code)
    return { error: code === '23505' ? '站点标识已被其他工具使用。本次未通过审核，请驳回并说明原因。' : '审核暂未完成，请稍后重试。' }
  }
  refreshDirectory()
  redirect(`/account?tab=review&review=${decision === 'approve' ? 'published' : 'rejected'}`)
}

export async function saveCategory(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentAdmin()
  if (!user) return { error: '你没有分类管理权限。' }
  const value = parseCategoryForm(form)
  if (!value) return { error: '请检查分类标识、名称、图标和排序。分类标识不能使用页面保留名称。' }
  try {
    if (!await directoryStore.saveCategory(user.id, value)) return { error: '分类未保存，请检查管理权限。' }
  } catch (error) {
    console.error('Directory category error code:', databaseErrorCode(error))
    return { error: '分类暂时无法保存，请稍后重试。' }
  }
  refreshDirectory()
  redirect('/account?tab=categories&saved=1')
}

export async function saveManagedTool(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentAdmin()
  if (!user) return { error: '你没有工具管理权限。' }
  const value = parseToolManagement(form)
  if (!value) return { error: '请检查工具内容、分类、展示状态及非负整数排序。' }
  let media
  try { media = await images(form) } catch { return { error: '图片无效或超出大小限制，请重新上传。' } }
  try {
    if (!await directoryStore.saveTool(user.id, { ...value, ...media })) return { error: '工具已不存在、分类已停用或你没有权限。停用分类的工具仅能保存为下架状态。' }
  } catch (error) {
    const code = databaseErrorCode(error)
    console.error('Directory tool management error code:', code)
    return { error: code === '23505' ? '该站点标识已被使用，请更换标识。' : '工具暂时无法保存，请稍后重试。' }
  }
  refreshDirectory()
  redirect('/account?tab=tools&saved=1')
}
