import { directoryStore } from '@/lib/directory-db'
import { readMediaFile } from '@/lib/media-files'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  if (!/^[a-f0-9]{64}\.webp$/.test(file)) return new Response(null, { status: 404, headers })
  try {
    const url = '/media/' + file
    if (!await directoryStore.getPublicMediaByUrl(url)) return new Response(null, { status: 404, headers })
    return new Response(new Uint8Array(await readMediaFile(url)), { headers: { ...headers, 'Content-Type': 'image/webp' } })
  } catch { return new Response(null, { status: 503, headers }) }
}
