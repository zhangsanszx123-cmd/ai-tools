import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { customType, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' })

export const tools = pgTable('ai_directory_tools', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  website: text('website').notNull(),
  summary: text('summary').notNull(),
  content: text('content').notNull(),
  logoKey: text('logo_key'),
  logoData: bytea('logo_data'),
  logoType: text('logo_type'),
  coverData: bytea('cover_data'),
  coverType: text('cover_type'),
  featuredOrder: integer('featured_order'),
  status: text('status', { enum: ['pending', 'published'] }).notNull().default('pending'),
  userId: text('userId'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
})

const globalPool = globalThis as typeof globalThis & { directoryPool?: Pool }
const pool = globalPool.directoryPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000 })
if (process.env.NODE_ENV !== 'production') globalPool.directoryPool = pool

export const db = drizzle(pool)

const publicFields = {
  slug: tools.slug,
  name: tools.name,
  category: tools.category,
  website: tools.website,
  summary: tools.summary,
  logoKey: tools.logoKey,
  hasLogo: sql<boolean>`${tools.logoType} is not null`,
  featuredOrder: tools.featuredOrder,
}

export async function getCatalog() {
  if (!process.env.DATABASE_URL) throw new Error('Database configuration unavailable')
  return db.select(publicFields).from(tools).where(eq(tools.status, 'published')).orderBy(desc(tools.publishedAt), tools.slug)
}

export async function getTool(slug: string) {
  const [tool] = await db.select({ ...publicFields, content: tools.content, hasCover: sql<boolean>`${tools.coverType} is not null` })
    .from(tools).where(and(eq(tools.slug, slug), eq(tools.status, 'published'))).limit(1)
  return tool
}
