import { and, eq, or } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/directory-auth'
import { db, tools } from '@/lib/directory-db'
import { isAdmin } from '@/lib/directory-submissions'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params
  if (slug.length > 70 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || (kind !== 'cover' && kind !== 'logo')) return new Response(null, { status: 404 })
  const review = new URL(request.url).searchParams.get('review') === '1'
  const user = review ? await getCurrentUser() : null
  const admin = user ? await isAdmin(user.id) : false
  const visibility = admin ? undefined : user ? or(eq(tools.status, 'published'), eq(tools.userId, user.id)) : eq(tools.status, 'published')
  const [asset] = await db.select({ data: kind === 'cover' ? tools.coverData : tools.logoData, type: kind === 'cover' ? tools.coverType : tools.logoType })
    .from(tools).where(and(eq(tools.slug, slug), visibility)).limit(1)
  if (!asset?.data || asset.type !== 'image/webp') return new Response(null, { status: 404 })
  return new Response(new Uint8Array(asset.data), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': review ? 'private, no-store' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } })
}
