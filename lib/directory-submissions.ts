import 'server-only'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { pgTable, text } from 'drizzle-orm/pg-core'
import sharp from 'sharp'
import { db, tools } from '@/lib/directory-db'

const authUsers = pgTable('ai_directory_users', { id: text('id').primaryKey(), role: text('role') })

export async function isAdmin(userId: string) {
  const [user] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, userId)).limit(1)
  return Boolean(user?.role?.split(',').map((role) => role.trim()).includes('admin'))
}

export function getSubmissionHistory(userId: string) {
  return db.select({ slug: tools.slug, name: tools.name, status: tools.status, createdAt: tools.createdAt })
    .from(tools).where(eq(tools.userId, userId)).orderBy(desc(tools.createdAt))
}

export async function getReviewQueue(adminId: string) {
  if (!(await isAdmin(adminId))) return []
  return db.select({ slug: tools.slug, name: tools.name, website: tools.website, summary: tools.summary, content: tools.content, hasLogo: sql<boolean>`${tools.logoType} is not null`, hasCover: sql<boolean>`${tools.coverType} is not null` })
    .from(tools).where(eq(tools.status, 'pending')).orderBy(asc(tools.createdAt))
}

export async function publishTool(adminId: string, slug: string) {
  if (!(await isAdmin(adminId))) return false
  const rows = await db.update(tools).set({ status: 'published', publishedAt: new Date() })
    .where(and(eq(tools.slug, slug), eq(tools.status, 'pending'))).returning({ slug: tools.slug })
  return rows.length === 1
}

export async function normalizeImage(entry: FormDataEntryValue | null, maxBytes: number, edge: number) {
  if (!(entry instanceof File) || !entry.size) return null
  if (entry.size > maxBytes || !['image/png', 'image/jpeg', 'image/webp'].includes(entry.type)) throw new Error('Unsupported image')
  const image = sharp(Buffer.from(await entry.arrayBuffer()), { limitInputPixels: 16_000_000 })
  if (!['png', 'jpeg', 'webp'].includes((await image.metadata()).format ?? '')) throw new Error('Unsupported image')
  return image.rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer()
}
