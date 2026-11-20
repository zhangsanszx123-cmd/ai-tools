// Keep independent per-category tool rows, as requested. No schema changes.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { Client } from 'pg'
import { postgresConfig } from '../lib/postgres-config.ts'

const values = {}
for (const file of ['.env', '.env.local']) if (existsSync(file)) Object.assign(values, parseEnv(readFileSync(file, 'utf8')))
const client = new Client(postgresConfig({ ...values, ...process.env }))
try {
  await client.connect()
  await client.query('BEGIN')
  await client.query('LOCK TABLE ai_directory_tools IN SHARE ROW EXCLUSIVE MODE')
  const source = (await client.query(`SELECT * FROM ai_directory_tools WHERE slug=$1 FOR UPDATE`, ['jimeng-jianying-com-ab-17772'])).rows[0]
  assert.ok(source && source.category_id === 'video' && source.status === 'published' && !source.deleted_at)
  const category = (await client.query(`SELECT id FROM ai_directory_categories WHERE id='image' AND is_enabled`)).rows[0]
  assert.ok(category)
  const existing = (await client.query(`SELECT id::text, slug, status, deleted_at FROM ai_directory_tools WHERE category_id='image' AND (website=$1 OR slug=$2 OR name=$3)`, [source.website, 'jimeng-ai-image', source.name])).rows
  let result
  if (existing.length) {
    assert.equal(existing.length, 1)
    assert.equal(existing[0].status, 'published')
    assert.equal(existing[0].deleted_at, null)
    result = { created: false, tool: existing[0] }
  } else {
    const inserted = (await client.query(`INSERT INTO ai_directory_tools
      (slug, category_id, name, website, summary, content, logo_key, logo_url, cover_url, display_order, status)
      SELECT $1, 'image', name, website, summary, content, logo_key, logo_url, cover_url, 1, 'published'
      FROM ai_directory_tools WHERE id=$2
      RETURNING id::text, slug, category_id, name, display_order`, ['jimeng-ai-image', source.id])).rows[0]
    assert.ok(inserted)
    result = { created: true, tool: inserted }
  }
  const after = (await client.query(`SELECT * FROM ai_directory_tools WHERE id=$1`, [source.id])).rows[0]
  assert.deepEqual(after, source, 'Original video record must remain unchanged')
  await client.query('COMMIT')
  writeFileSync('docs/imports/jimeng-image-added-2026-11-20.json', JSON.stringify({ at: new Date().toISOString(), ...result, sourceId: String(source.id), sourceUnchanged: true }, null, 2))
  console.log(JSON.stringify(result))
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(JSON.stringify({ code: error.code ?? error.message }))
  process.exitCode = 1
} finally { await client.end() }
