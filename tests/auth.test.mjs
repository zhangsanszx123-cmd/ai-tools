import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { directoryAuthOptions } from '../lib/auth-options.ts'
import { postgresConfig } from '../lib/postgres-config.ts'

function fixture(rateLimit = false) {
  const database = { ai_directory_users: [], ai_directory_accounts: [], ai_directory_sessions: [], ai_directory_verifications: [] }
  const auth = betterAuth({
    ...directoryAuthOptions(undefined),
    database: memoryAdapter(database),
    baseURL: 'http://localhost:3000',
    secret: randomBytes(48).toString('base64url'),
    rateLimit: { enabled: rateLimit, storage: 'memory', customRules: { '/sign-in/email': { window: 60, max: 2 } } },
    advanced: { cookiePrefix: 'ai-directory', ipAddress: { ipAddressHeaders: [] } },
  })
  async function request(endpoint, body, cookie) {
    return auth.handler(new Request(`http://localhost:3000/api/auth/${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }))
  }
  const cookies = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  return { database, request, cookies }
}

test('registration, hashed password, persisted session, login and logout', async () => {
  const { database, request, cookies } = fixture()
  const credentials = { name: '测试用户', email: 'auth-test@example.com', password: randomBytes(24).toString('hex') }
  const signup = await request('sign-up/email', { ...credentials, role: 'admin' })
  assert.equal(signup.status, 200)
  const created = await signup.json()
  assert.equal(created.user.role, 'user', 'client cannot grant admin privileges')
  const signupCookies = cookies(signup)
  assert.match(signup.headers.get('set-cookie'), /HttpOnly/i)
  assert.match(signup.headers.get('set-cookie'), /SameSite=Lax/i)
  const accounts = database.ai_directory_accounts
  assert.equal(accounts.length, 1)
  assert.notEqual(accounts[0].password, credentials.password)
  assert.ok(accounts[0].password.length > 64)
  const session = await (await request('get-session', null, signupCookies)).json()
  assert.equal(session.user.email, credentials.email)
  assert.equal((await request('sign-out', {}, signupCookies)).status, 200)
  assert.equal(await (await request('get-session', null, signupCookies)).json(), null)
  assert.equal((await request('sign-in/email', { email: credentials.email, password: 'not-the-password' })).status, 401)
  const login = await request('sign-in/email', credentials)
  assert.equal(login.status, 200)
  assert.ok((await (await request('get-session', null, cookies(login))).json()).user)
  const duplicate = await request('sign-up/email', credentials)
  assert.ok(duplicate.status >= 400)
  assert.equal(database.ai_directory_users.length, 1)
  assert.equal(await (await request('get-session', null, 'ai-directory.session_token=forged')).json(), null)
})

test('registration rejects invalid emails and short passwords', async () => {
  const { request, database } = fixture()
  for (const body of [
    { name: 'Test', email: 'not-an-email', password: 'valid-password-123' },
    { name: 'Test', email: 'valid@example.com', password: 'short' },
  ]) assert.ok((await request('sign-up/email', body)).status >= 400)
  assert.equal(database.ai_directory_users?.length ?? 0, 0)
})

test('authentication endpoint rejects cross-origin requests', async () => {
  const auth = betterAuth({
    ...directoryAuthOptions(undefined), database: memoryAdapter({}), secret: randomBytes(48).toString('hex'), rateLimit: { enabled: false },
  })
  const response = await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/email', {
    method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'valid-password-123' }),
  }))
  assert.equal(response.status, 403)
})

test('login endpoint enforces rate limiting', async () => {
  const { request } = fixture(true)
  const body = { email: 'rate-test@example.com', password: 'invalid-password' }
  await request('sign-in/email', body)
  await request('sign-in/email', body)
  assert.equal((await request('sign-in/email', body)).status, 429)
})

test('URL parameters cannot disable SSL certificate verification', () => {
  const config = postgresConfig({ DATABASE_URL: 'postgresql://test:example@localhost/db?sslmode=no-verify&ssl=false', DB_CA_CERT: '-----BEGIN CERTIFICATE-----\\nexample\\n-----END CERTIFICATE-----' })
  assert.equal(config.ssl.rejectUnauthorized, true)
  assert.ok(config.ssl.ca.includes('\n'))
  assert.ok(!config.connectionString.includes('sslmode'))
})
