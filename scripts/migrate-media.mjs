// --prepare exports and verifies files while retaining legacy bytes; --finalize clears verified bytes.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { join } from 'node:path'
import { Client } from 'pg'
import { postgresConfig } from '../lib/postgres-config.ts'
import { writeMediaFile, readMediaFile, mediaRoot } from '../lib/media-files.ts'

const env = {}
for (const f of ['.env', '.env.local']) if (existsSync(f)) Object.assign(env, parseEnv(readFileSync(f, 'utf8')))
for (const [key, value] of Object.entries(env)) if (process.env[key] === undefined) process.env[key] = value
const finalize = process.argv.includes('--finalize')
if (!finalize && !process.argv.includes('--prepare')) throw new Error('Choose --prepare or --finalize')
const client = new Client(postgresConfig())
const report = { phase: finalize ? 'finalize' : 'prepare', files: 0, bytes: 0, verifiedUrls: 0, tables: {}, root: mediaRoot() }
try {
  await client.connect()
  if ((await client.query('SELECT current_schema() AS name')).rows[0].name !== 'ai-tools') throw new Error('TARGET_SCHEMA_MISMATCH')
  await client.query(readFileSync('db/media-storage.sql', 'utf8'))
  await client.query('BEGIN')
  await client.query('LOCK TABLE ai_directory_tools, ai_directory_tool_submissions IN SHARE ROW EXCLUSIVE MODE')
  for (const table of ['ai_directory_tools', 'ai_directory_tool_submissions']) {
    const scope = table === 'ai_directory_tools' ? 'public' : 'private'
    const ids = (await client.query(`SELECT id::text FROM ${table} WHERE logo_data IS NOT NULL OR cover_data IS NOT NULL OR logo_url IS NOT NULL OR cover_url IS NOT NULL ORDER BY id`)).rows.map(r => r.id)
    report.tables[table] = ids.length
    for (let offset=0; offset<ids.length; offset+=25) {
      const { rows } = await client.query(`SELECT id::text, logo_data, cover_data, logo_url, cover_url FROM ${table} WHERE id::text=ANY($1::text[])`, [ids.slice(offset,offset+25)])
      for (const row of rows) {
      for (const kind of ['logo', 'cover']) {
        const data = row[kind + '_data']
        const oldUrl = row[kind + '_url']
        if (oldUrl) { await readMediaFile(oldUrl); report.verifiedUrls++ }
        if (!data) continue
        const url = await writeMediaFile(data, scope)
        if (oldUrl && oldUrl !== url) throw new Error('MEDIA_URL_CONFLICT')
        if (!(await readMediaFile(url)).equals(data)) throw new Error('MEDIA_VERIFY_FAILED')
        report.files++; report.bytes += data.length
        await client.query(`UPDATE ${table} SET ${kind}_url=$2 ${finalize ? `, ${kind}_data=NULL, ${kind}_type=NULL` : ''} WHERE id=$1`, [row.id, url])
      }
      }
      if (offset%100===0) console.log(JSON.stringify({ table, recordsChecked: Math.min(offset+25,ids.length), files: report.files, phase: report.phase }))
    }
    if (finalize) {
      const constraint = table === 'ai_directory_tools' ? 'tools_no_binary_media' : 'submissions_no_binary_media'
      const exists = (await client.query('SELECT 1 FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2', [table, constraint])).rowCount
      if (!exists) await client.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (logo_data IS NULL AND cover_data IS NULL AND logo_type IS NULL AND cover_type IS NULL)`)
    }
  }
  await client.query('COMMIT')
  mkdirSync('docs/imports', { recursive: true })
  writeFileSync(join('docs/imports', `media-${report.phase}-2026-11-20.json`), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: true, ...report }, null, 2))
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(JSON.stringify({ ok: false, code: e.code || e.message || e.name }))
  process.exitCode = 1
} finally { await client.end() }
