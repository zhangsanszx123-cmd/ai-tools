import { getAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(request: Request) {
  // No public administrator registration, profile changes or password reset endpoints.
  const endpoint = new URL(request.url).pathname.replace('/api/admin-auth', '')
  const allowed = request.method === 'GET' ? endpoint === '/get-session' : ['/sign-in/email', '/sign-out'].includes(endpoint)
  if (!allowed) return Response.json({ error: 'NOT_FOUND' }, { status: 404 })
  const auth = getAdminAuth()
  if (!auth) return Response.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503 })
  return auth.handler(request)
}
export const GET = handle
export const POST = handle
