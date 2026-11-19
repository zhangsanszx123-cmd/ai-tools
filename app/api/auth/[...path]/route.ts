import { getDirectoryAuth } from '@/lib/directory-auth'

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  if (path.length !== 1 || path[0] !== 'verify-email') return new Response(null, { status: 404 })
  const auth = getDirectoryAuth()
  if (!auth) return new Response(null, { status: 503 })
  return auth.handler().GET(request, context)
}
