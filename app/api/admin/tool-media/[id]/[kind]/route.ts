import { validRecordId } from '@/lib/catalog'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { directoryStore } from '@/lib/directory-db'
import { readMediaFile } from '@/lib/media-files'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  if (!validRecordId(id) || (kind !== 'logo' && kind !== 'cover')) return new Response(null, { status: 404, headers })
  const admin = await getCurrentAdmin()
  if (!admin) return new Response(null, { status: 404, headers })
  try {
    const asset = await directoryStore.getManagedToolMedia(admin.id, id, kind)
    if (!asset?.url) return new Response(null, { status: 404, headers })
    return new Response(new Uint8Array(await readMediaFile(asset.url)), { headers: { ...headers, 'Content-Type': 'image/webp' } })
  } catch {
    return new Response(null, { status: 503, headers })
  }
}
