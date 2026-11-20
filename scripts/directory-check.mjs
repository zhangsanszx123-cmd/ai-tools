import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { Client } from 'pg'
import { postgresConfig } from '../lib/postgres-config.ts'

const values = {}
for (const file of ['.env', '.env.local']) if (existsSync(file)) Object.assign(values, parseEnv(readFileSync(file, 'utf8')))
for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value
let client
try {
  client = new Client(postgresConfig())
  await client.connect()
  await client.query('BEGIN READ ONLY')
  const requirements = {
    ai_directory_categories: ['id', 'name', 'short_name', 'description', 'icon_key', 'sort_order', 'is_enabled'],
    ai_directory_tools: ['id', 'slug', 'category_id', 'status', 'deleted_at', 'created_by_admin', 'display_order', 'featured_order', 'logo_url', 'cover_url', 'published_at'],
    ai_directory_tool_submissions: ['id', 'submitted_by', 'requested_slug', 'status', 'reviewed_by_admin', 'rejection_reason', 'published_tool_id', 'submitted_at', 'logo_url', 'cover_url'],
    ai_directory_settings: ['key', 'value', 'updated_at'],
  }
  const { rows } = await client.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, [Object.keys(requirements)])
  const missing = Object.entries(requirements).flatMap(([table, columns]) => columns.filter(column => !rows.some(row => row.table_name === table && row.column_name === column)).map(column => `${table}.${column}`))
  if (missing.length) { console.log(JSON.stringify({ ok: false, missing })); process.exitCode = 1 }
  else {
    const { rows: [counts] } = await client.query(`SELECT
      (SELECT count(*)::int FROM ai_directory_categories) AS categories,
      (SELECT count(*)::int FROM ai_directory_tools) AS tools,
      (SELECT count(*)::int FROM ai_directory_tool_submissions) AS submissions`)
    console.log(JSON.stringify({ ok: true, readOnly: true, sslCertificateVerified: client.connection.stream.authorized === true, counts }, null, 2))
  }
  await client.query('COMMIT')
} catch (error) { console.error(JSON.stringify({ ok: false, code: error.code || error.name })); process.exitCode = 1 }
finally { if (client) await client.end().catch(() => {}) }
