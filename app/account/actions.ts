'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { hashPassword } from 'better-auth/crypto'
import { validRecordId } from '@/lib/catalog'
import { getCurrentUser } from '@/lib/directory-auth'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { directoryStore } from '@/lib/directory-db'
import { normalizeImage } from '@/lib/directory-submissions'
import {
  databaseErrorCode,
  formText,
  parseAdminUserForm,
  parseCategoryForm,
  parseFrontendUserForm,
  parseToolForm,
  parseToolManagement,
  validUserId,
} from '@/lib/directory-validation'

export type ActionState = { error?: string } | null

async function currentAdmin() {
  const user = await getCurrentAdmin()
  if (!user) redirect('/admin/login')
  return user
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
  revalidatePath('/admin')
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
  redirect(`/admin?tab=review&review=${decision === 'approve' ? 'published' : 'rejected'}`)
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
  redirect('/admin?tab=categories&saved=1')
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
  redirect('/admin?tab=tools&saved=1')
}

export async function changeCategoryStatus(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentAdmin()
  const id = formText(form, 'id'), enabled = formText(form, 'enabled'), expected = formText(form, 'expected')
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id.length > 40 || !['true', 'false'].includes(enabled) || !['true', 'false'].includes(expected)) return { error: '分类操作参数无效，请刷新重试。' }
  if (enabled === 'false' && form.get('confirmDisable') !== 'yes') return { error: '请先确认停用分类及隐藏其下工具。' }
  try {
    if (!await directoryStore.setCategoryStatus(user.id, id, enabled === 'true', expected === 'true')) return { error: '分类不存在、状态已变化或你已没有权限，请刷新列表。' }
  } catch (error) {
    console.error('Category status error code:', databaseErrorCode(error))
    return { error: '分类状态暂时无法更新，请稍后重试。' }
  }
  refreshDirectory()
  redirect('/admin?tab=categories&changed=1')
}

export async function changeManagedTool(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentAdmin()
  const id = formText(form, 'id'), intent = formText(form, 'intent'), expected = formText(form, 'expected')
  if (!validRecordId(id) || !['delete', 'published', 'disabled'].includes(intent)) return { error: '操作参数无效，请刷新后重试。' }
  if (intent === 'delete' && form.get('confirmDelete') !== 'yes') return { error: '请先勾选确认删除。' }
  if (intent !== 'delete' && !['published', 'disabled'].includes(expected)) return { error: '工具状态无效，请刷新列表。' }
  try {
    const result = intent === 'delete' ? await directoryStore.deleteTool(user.id, id)
      : await directoryStore.setToolStatus(user.id, id, intent as 'published' | 'disabled', expected as 'published' | 'disabled')
    if (!result) return { error: '工具已删除、状态已变化、分类已停用或你已没有权限，请刷新列表。' }
  } catch (error) {
    console.error('Directory list action error code:', databaseErrorCode(error))
    return { error: '操作未完成，请稍后重试。' }
  }
  refreshDirectory()
  redirect(`/admin?tab=tools&${intent === 'delete' ? 'deleted=1' : 'changed=1'}`)
}

export async function saveFrontendUser(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentAdmin()
  if (!user) return { error: '你没有前端用户管理权限。' }
  const value = parseFrontendUserForm(form)
  if (!value) return { error: '请检查用户昵称、有效邮箱及 8–128 位密码。' }
  try {
    const passwordHash = value.password ? await hashPassword(value.password) : null
    if (!await directoryStore.saveManagedUser(user.id, { ...value, passwordHash })) {
      return { error: '用户不存在或你已没有管理权限，请返回列表重试。' }
    }
  } catch (error) {
    const code = databaseErrorCode(error)
    console.error('Directory frontend user save error code:', code)
    return { error: code === '23505' ? '该邮箱已被其他前端用户使用，请更换邮箱。' : '用户暂时无法保存，请稍后重试。' }
  }
  refreshDirectory()
  redirect('/admin?tab=users&saved=1')
}

export async function changeFrontendUser(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentAdmin()
  const id = formText(form, 'id'), intent = formText(form, 'intent'), expected = formText(form, 'expected')
  if (!validUserId(id) || !['delete', 'enabled', 'disabled'].includes(intent)) return { error: '操作参数无效，请刷新后重试。' }
  if (intent === 'delete' && form.get('confirmDelete') !== 'yes') return { error: '请先勾选确认删除该用户。' }
  if (intent !== 'delete' && !['true', 'false'].includes(expected)) return { error: '用户状态参数无效，请刷新列表。' }
  try {
    const result = intent === 'delete'
      ? await directoryStore.deleteManagedUser(user.id, id)
      : await directoryStore.setManagedUserStatus(user.id, id, intent === 'enabled', expected === 'true')
    if (!result) return { error: '用户不存在、状态已变化或你已没有权限，请刷新列表。' }
  } catch (error) {
    console.error('Directory frontend user action error code:', databaseErrorCode(error))
    return { error: '操作未完成，请稍后重试。' }
  }
  refreshDirectory()
  redirect(`/admin?tab=users&${intent === 'delete' ? 'deleted=1' : 'changed=1'}`)
}

export async function saveAdminUser(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentAdmin()
  if (!user) return { error: '你没有后端管理员维护权限。' }
  const value = parseAdminUserForm(form)
  if (!value) return { error: '请检查管理员名称、有效邮箱及 12–128 位高强度密码。' }
  if (value.id === user.id && !value.isEnabled) return { error: '不能停用当前正在登录的管理员账号。' }
  try {
    const passwordHash = value.password ? await hashPassword(value.password) : null
    if (!await directoryStore.saveManagedAdmin(user.id, { ...value, passwordHash })) {
      return { error: '管理员不存在、不能停用自身账号或你已没有权限，请刷新重试。' }
    }
  } catch (error) {
    const code = databaseErrorCode(error)
    console.error('Directory admin user save error code:', code)
    return { error: code === '23505' ? '该邮箱已被其他后台管理员使用，请更换邮箱。' : '管理员账号暂时无法保存，请稍后重试。' }
  }
  refreshDirectory()
  redirect('/admin?tab=admins&saved=1')
}

export async function changeAdminUser(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentAdmin()
  const id = formText(form, 'id'), intent = formText(form, 'intent'), expected = formText(form, 'expected')
  if (!validUserId(id) || !['delete', 'enabled', 'disabled'].includes(intent)) return { error: '操作参数无效，请刷新后重试。' }
  if (id === user.id && (intent === 'delete' || intent === 'disabled')) return { error: '不能停用或删除当前正在登录的管理员账号。' }
  if (intent === 'delete' && form.get('confirmDelete') !== 'yes') return { error: '请先勾选确认删除该管理员。' }
  if (intent !== 'delete' && !['true', 'false'].includes(expected)) return { error: '管理员状态参数无效，请刷新列表。' }
  try {
    const result = intent === 'delete'
      ? await directoryStore.deleteManagedAdmin(user.id, id)
      : await directoryStore.setManagedAdminStatus(user.id, id, intent === 'enabled', expected === 'true')
    if (!result) return { error: '管理员不存在、状态已变化、无法操作当前登录账号或你已没有权限，请刷新列表。' }
  } catch (error) {
    console.error('Directory admin user action error code:', databaseErrorCode(error))
    return { error: '操作未完成，请稍后重试。' }
  }
  refreshDirectory()
  redirect(`/admin?tab=admins&${intent === 'delete' ? 'deleted=1' : 'changed=1'}`)
}
