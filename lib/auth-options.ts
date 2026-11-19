import type { BetterAuthOptions } from 'better-auth'
import type { Pool } from 'pg'

export function directoryAuthOptions(database: Pool): BetterAuthOptions {
  return {
    appName: 'AI 工具箱',
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    secret: process.env.BETTER_AUTH_SECRET,
    database,
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true },
    user: {
      modelName: 'ai_directory_users',
      additionalFields: { role: { type: 'string', defaultValue: 'user', input: false } },
    },
    session: { modelName: 'ai_directory_sessions', expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    account: { modelName: 'ai_directory_accounts' },
    verification: { modelName: 'ai_directory_verifications' },
    rateLimit: {
      enabled: true, storage: 'database', modelName: 'ai_directory_rate_limits', window: 60, max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
    advanced: { cookiePrefix: 'ai-directory', defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' } },
    logger: { disabled: true },
  }
}
