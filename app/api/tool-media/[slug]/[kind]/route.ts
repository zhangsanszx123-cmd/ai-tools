import { directoryStore } from '@/lib/directory-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params
  if (slug.length > 70 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || (kind !== 'cover' && kind !== 'logo')) return new Response(null, { status: 404 })
  try {
    const asset = await directoryStore.getPublicMedia(slug, kind)
    if (!asset?.data || asset.type !== 'image/webp') return new Response(null, { status: 404 })
    return new Response(new Uint8Array(asset.data), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
