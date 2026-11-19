import { getDirectoryAuth } from '@/lib/directory-auth'

export const runtime = 'nodejs'

async function handle(request: Request) {
  const auth = getDirectoryAuth()
  if (!auth) return Response.json({ code: 'AUTH_NOT_CONFIGURED', message: '登录服务尚未配置' }, { status: 503 })
  return auth.handler(request)
}

export const GET = handle
export const POST = handle
