import { directoryStore } from '@/lib/directory-db'
import { readMediaFile } from '@/lib/media-files'
import { resolveMediaUrl } from '@/lib/media-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params
  if (slug.length > 70 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || (kind !== 'cover' && kind !== 'logo')) return new Response(null, { status: 404 })
  try {
    const asset = await directoryStore.getPublicMedia(slug, kind)
    if (!asset?.url) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    const base = await directoryStore.getMediaBase()
    if (base !== '/') return new Response(null, { status: 307, headers: { Location: resolveMediaUrl(asset.url, base)!, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
    return new Response(new Uint8Array(await readMediaFile(asset.url)), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
