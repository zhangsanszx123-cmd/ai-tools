import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { Client } from 'pg'
import { postgresConfig } from '../lib/postgres-config.ts'

for (const file of ['.env.local', '.env']) if (existsSync(file)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) if (process.env[key] === undefined) process.env[key] = value
}
const client = new Client(postgresConfig())
try {
  await client.connect()
  const { rows: [schema] } = await client.query('SELECT current_schema() AS name')
  if (schema.name !== 'ai-tools') throw new Error('TARGET_SCHEMA_MISMATCH')
  if (process.argv.includes('--apply')) {
    // Both scripts are transactional and retain existing users, credentials and audit history.
    await client.query(readFileSync('db/admin-auth.sql', 'utf8'))
    await client.query(readFileSync('db/admin-audit-migration.sql', 'utf8'))
    await client.query(readFileSync('db/tool-management.sql', 'utf8'))
    await client.query(readFileSync('db/media-storage.sql', 'utf8'))
  }
  const { rows } = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, [['admin_user', 'admin_session', 'admin_account', 'admin_verification', 'admin_rate_limit']])
  console.log(JSON.stringify({ applied: process.argv.includes('--apply'), sslCertificateVerified: client.connection.stream.authorized === true, adminTables: rows.map(r => r.table_name) }))
} catch (error) { console.error('Admin schema error:', error.code || error.name); process.exitCode = 1 }
finally { await client.end().catch(() => {}) }
