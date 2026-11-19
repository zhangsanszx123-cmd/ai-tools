import { createHmac } from 'node:crypto'
import type { BetterAuthOptions } from 'better-auth'
import type { Pool } from 'pg'

export function adminAuthOptions(database: Pool, provision = false): BetterAuthOptions {
  return {
    appName: 'AI 工具箱后台',
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    basePath: '/api/admin-auth',
    secret: createHmac('sha256', process.env.BETTER_AUTH_SECRET || '').update('ai-tools:admin-auth:v1').digest('hex'),
    database,
    emailAndPassword: { enabled: true, disableSignUp: !provision, minPasswordLength: 12, maxPasswordLength: 128, autoSignIn: false },
    user: { modelName: 'admin_user', additionalFields: { isEnabled: { type: 'boolean', defaultValue: true, input: false } } },
    session: { modelName: 'admin_session', expiresIn: 60 * 60 * 8, updateAge: 60 * 60 },
    account: { modelName: 'admin_account' },
    verification: { modelName: 'admin_verification' },
    rateLimit: { enabled: true, storage: 'database', modelName: 'admin_rate_limit', window: 60, max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 5 } } },
    advanced: { cookiePrefix: 'ai-tools-admin', defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' } },
    logger: { disabled: true },
  }
}
