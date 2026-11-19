import { validRecordId } from '@/lib/catalog'
import { getCurrentUser } from '@/lib/directory-auth'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { directoryStore } from '@/lib/directory-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  if (!validRecordId(id) || (kind !== 'logo' && kind !== 'cover')) return new Response(null, { status: 404, headers })
  const [user, admin] = await Promise.all([getCurrentUser(), getCurrentAdmin()])
  if (!user && !admin) return new Response(null, { status: 404, headers })
  try {
    const asset = await directoryStore.getSubmissionMedia(user?.id ?? null, id, kind, admin?.id ?? null)
    if (!asset?.data || asset.type !== 'image/webp') return new Response(null, { status: 404, headers })
    return new Response(new Uint8Array(asset.data), { headers: { ...headers, 'Content-Type': 'image/webp' } })
  } catch { return new Response(null, { status: 503, headers }) }
}
