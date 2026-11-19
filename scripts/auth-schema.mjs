import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { Pool } from 'pg'
import { getMigrations } from 'better-auth/db/migration'
import { directoryAuthOptions } from '../lib/auth-options.ts'
import { postgresConfig } from '../lib/postgres-config.ts'

const env = {}
for (const file of ['.env', '.env.local']) {
  if (existsSync(file)) Object.assign(env, parseEnv(readFileSync(file, 'utf8')))
}
for (const [key, value] of Object.entries(env)) if (process.env[key] === undefined) process.env[key] = value

const pool = new Pool(postgresConfig())
pool.on('error', () => {})
try {
  // PostgreSQL's default "$user", public search_path supports an isolated,
  // role-owned schema when the app role cannot create objects in public.
  if (process.argv.includes('--apply')) {
    const { rows: [permissions] } = await pool.query(`SELECT current_user AS role,
      has_schema_privilege(current_user, current_schema(), 'CREATE') AS can_create,
      has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema,
      current_setting('search_path') AS search_path`)
    if (!permissions.can_create) {
      if (!permissions.can_create_schema || !permissions.search_path.includes('"$user"')) throw new Error('SCHEMA_PERMISSION_REQUIRED')
      const quotedRole = '"' + permissions.role.replaceAll('"', '""') + '"'
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quotedRole} AUTHORIZATION CURRENT_USER`)
      const { rows: [resolved] } = await pool.query('SELECT current_schema() AS schema')
      if (resolved.schema !== permissions.role) throw new Error('SCHEMA_PERMISSION_REQUIRED')
      console.log(JSON.stringify({ authSchema: resolved.schema }))
    }
  }
  const plan = await getMigrations(directoryAuthOptions(pool))
  const tables = plan.toBeCreated.map(({ table }) => table)
  const allowed = new Set(['ai_directory_users', 'ai_directory_sessions', 'ai_directory_accounts', 'ai_directory_verifications', 'ai_directory_rate_limits'])
  if (tables.some(table => !allowed.has(table)) || plan.toBeAdded.length || plan.unsafeChanges.length || plan.schemaProblems.length) {
    throw new Error('SCHEMA_REVIEW_REQUIRED')
  }
  if (process.argv.includes('--sql')) console.log(await plan.compileMigrations())
  else if (process.argv.includes('--apply')) {
    const sql = await plan.compileMigrations()
    const connection = await pool.connect()
    try {
      await connection.query('BEGIN')
      if (sql.trim()) await connection.query(sql)
      await connection.query('COMMIT')
    } catch (error) {
      await connection.query('ROLLBACK')
      throw error
    } finally {
      connection.release()
    }
    console.log(JSON.stringify({ applied: true, createdTables: tables }))
  } else console.log(JSON.stringify({ readOnly: true, missingTables: tables, missingIndexes: plan.toBeAddedIndexes.length }))
} catch (error) {
  // Do not print arbitrary driver messages that may contain credentials or queries.
  console.error('Auth schema check failed:', error.code || (error.message === 'SCHEMA_REVIEW_REQUIRED' ? error.message : error.name))
  process.exitCode = 1
} finally {
  await pool.end()
}
