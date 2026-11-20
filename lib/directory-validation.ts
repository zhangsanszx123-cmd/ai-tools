import { brandKeys, iconKeys, validRecordId, websiteUrl, type CatalogCategory } from './catalog.ts'

export const formText = (form: FormData, key: string) => typeof form.get(key) === 'string' ? String(form.get(key)).trim() : ''
export const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function parseToolForm(form: FormData) {
  const name = formText(form, 'name'), slug = formText(form, 'slug').toLowerCase(), category = formText(form, 'category')
  const rawWebsite = formText(form, 'website'), summary = formText(form, 'summary'), content = formText(form, 'content')
  const website = websiteUrl(rawWebsite)?.href
  if (!name || name.length > 90 || !slugPattern.test(slug) || slug.length > 70 || !slugPattern.test(category) || category.length > 40
    || !website || website.length > 1500 || !summary || summary.length > 130 || !content || content.length > 12000) return null
  return { name, slug, category, website, summary, content }
}

function order(value: string) {
  return /^\d{1,10}$/.test(value) && Number(value) <= 2147483647 ? Number(value) : null
}

export function parseToolManagement(form: FormData) {
  const tool = parseToolForm(form)
  const id = formText(form, 'id'), status = formText(form, 'status'), featured = formText(form, 'featuredOrder')
  const featuredOrder = featured ? order(featured) : null, displayOrder = order(formText(form, 'displayOrder'))
  const logoKey = formText(form, 'logoKey')
  if (!tool || (id && !validRecordId(id)) || !['published', 'disabled'].includes(status)
    || (featured && featuredOrder === null) || displayOrder === null
    || (logoKey && !(brandKeys as readonly string[]).includes(logoKey))) return null
  return { ...tool, id: id || undefined, status: status as 'published' | 'disabled', featuredOrder, displayOrder,
    logoKey: logoKey || null, removeLogo: form.get('removeLogo') === 'on', removeCover: form.get('removeCover') === 'on' }
}

export function parseCategoryForm(form: FormData): CatalogCategory | null {
  const id = formText(form, 'id'), name = formText(form, 'name'), short = formText(form, 'short')
  const description = formText(form, 'description'), iconKey = formText(form, 'iconKey'), sortOrder = order(formText(form, 'sortOrder'))
  const reserved = ['home', 'popular', 'latest', 'main-content', 'search-title', 'category-navigation']
  if (!slugPattern.test(id) || id.length > 40 || reserved.includes(id) || !name || name.length > 50 || !short || short.length > 30
    || description.length > 200 || !(iconKeys as readonly string[]).includes(iconKey) || sortOrder === null) return null
  return { id, name, short, description, iconKey, sortOrder, isEnabled: form.get('isEnabled') === 'on' }
}

export const userIdPattern = /^[A-Za-z0-9_-]{1,64}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validUserId(value: string) {
  return userIdPattern.test(value)
}

function parseUserAccountForm(form: FormData, minPasswordLength: number) {
  const id = formText(form, 'id')
  const name = formText(form, 'name')
  const email = formText(form, 'email').toLowerCase()
  const rawPassword = typeof form.get('password') === 'string' ? String(form.get('password')) : ''
  if (id && !validUserId(id)) return null
  if (!name || name.length > 50 || !email || email.length > 254 || !emailPattern.test(email)) return null
  if (!id && (rawPassword.length < minPasswordLength || rawPassword.length > 128)) return null
  if (id && rawPassword.length > 0 && (rawPassword.length < minPasswordLength || rawPassword.length > 128)) return null
  return {
    id: id || undefined,
    name,
    email,
    password: rawPassword || null,
    isEnabled: form.get('isEnabled') === 'on',
  }
}

export function parseFrontendUserForm(form: FormData) {
  return parseUserAccountForm(form, 8)
}

export function parseAdminUserForm(form: FormData) {
  return parseUserAccountForm(form, 12)
}

export function databaseErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN'
}
