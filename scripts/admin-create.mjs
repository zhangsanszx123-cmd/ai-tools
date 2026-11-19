import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { Pool } from 'pg'
import { betterAuth } from 'better-auth'
import { adminAuthOptions } from '../lib/admin-auth-options.ts'
import { postgresConfig } from '../lib/postgres-config.ts'
import { adminCreationError, validateAdminCredentials } from './admin-create-errors.mjs'

for (const file of ['.env.local', '.env']) if (existsSync(file)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) if (process.env[key] === undefined) process.env[key] = value
}
let muted = false
const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback() } })
const prompt = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) })
let pool
try {
  if ((process.env.BETTER_AUTH_SECRET?.length ?? 0) < 32) throw new Error('AUTH_NOT_CONFIGURED')
  const email = (await prompt.question('Admin email: ')).trim().toLowerCase()
  process.stdout.write('Admin password (12-128 characters, hidden): ')
  muted = true
  const password = await prompt.question('')
  muted = false
  process.stdout.write('\nConfirm password (hidden): ')
  muted = true
  const confirmation = await prompt.question('')
  muted = false
  process.stdout.write('\n')
  validateAdminCredentials(email, password, confirmation)
  pool = new Pool(postgresConfig())
  pool.on('error', () => {})
  const { rows: [schema] } = await pool.query('SELECT current_schema() AS name')
  if (schema.name !== 'ai-tools') throw new Error('TARGET_SCHEMA_MISMATCH')
  const existing = await pool.query('SELECT 1 FROM admin_user WHERE lower(email) = $1', [email])
  if (existing.rowCount) throw new Error('USER_ALREADY_EXISTS')
  const auth = betterAuth(adminAuthOptions(pool, true))
  const result = await auth.api.signUpEmail({ body: { name: '管理员', email, password } })
  console.log(JSON.stringify({ created: Boolean(result.user?.id), accountType: 'independent-admin' }))
} catch (error) {
  muted = false
  const failure = adminCreationError(error)
  console.error(`后台账号创建失败 [${failure.code}]：${failure.message}`)
  process.exitCode = 1
}
finally { prompt.close(); if (pool) await pool.end() }
