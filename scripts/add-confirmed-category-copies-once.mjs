// Eight category copies explicitly approved after the homepage comparison.
// Atomic and repeatable; preserves all existing tool records and schema.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { Client } from 'pg'
import { postgresConfig } from '../lib/postgres-config.ts'

const approved = [
  { sourceId: '60', category: 'writing', order: 3, slug: 'xiaohuanxiong-writing' },
  { sourceId: '178', category: 'image', order: 3, slug: 'gaoding-ai-image' },
  { sourceId: '181', category: 'image', order: 7, slug: 'meitu-designkit-image' },
  { sourceId: '112', category: 'image', order: 8, slug: 'jiaotu-ai-image' },
  { sourceId: '627', category: 'image', order: 20, slug: 'qianwen-creation-image' },
  { sourceId: '25', category: 'video', order: 16, slug: 'kling-ai-video' },
  { sourceId: '1', category: 'chat', order: 1, slug: 'doubao-chat' },
  { sourceId: '296', category: 'chat', order: 26, slug: 'intern-ai-chat' },
]
const audit = JSON.parse(readFileSync('docs/imports/cross-category-audit-2026-11-20.json', 'utf8'))
for (const item of approved) assert.ok(audit.needAdditionalCategory.some(row => row.targetCategory === item.category
  && row.targetOrder === item.order && row.matches.some(match => match.id === item.sourceId && match.visible)))
const values = {}
for (const file of ['.env', '.env.local']) if (existsSync(file)) Object.assign(values, parseEnv(readFileSync(file, 'utf8')))
const client = new Client(postgresConfig({ ...values, ...process.env }))
const fingerprints = () => client.query('SELECT id::text, md5(row_to_json(t)::text) AS fingerprint FROM ai_directory_tools t ORDER BY id')
try {
  await client.connect()
  await client.query('BEGIN')
  await client.query('LOCK TABLE ai_directory_tools IN SHARE ROW EXCLUSIVE MODE')
  const before = (await fingerprints()).rows
  const result = []
  for (const item of approved) {
    const source = (await client.query(`SELECT t.* FROM ai_directory_tools t
      JOIN ai_directory_categories c ON c.id=t.category_id
      WHERE t.id=$1 AND t.status='published' AND t.deleted_at IS NULL AND c.is_enabled`, [item.sourceId])).rows[0]
    assert.ok(source && source.category_id !== item.category, 'Source must be available in another category')
    assert.ok((await client.query('SELECT id FROM ai_directory_categories WHERE id=$1 AND is_enabled', [item.category])).rowCount === 1)
    const existing = (await client.query(`SELECT id::text, slug, display_order, status, deleted_at FROM ai_directory_tools
      WHERE category_id=$1 AND (website=$2 OR name=$3 OR slug=$4)`, [item.category, source.website, source.name, item.slug])).rows
    let row
    if (existing.length) {
      assert.equal(existing.length, 1)
      row = existing[0]
      assert.equal(row.status, 'published')
      assert.equal(row.deleted_at, null)
      assert.equal(row.display_order, item.order)
    } else {
      row = (await client.query(`INSERT INTO ai_directory_tools
        (slug, category_id, name, website, summary, content, logo_key, logo_url, cover_url, display_order, status)
        SELECT $1,$2,name,website,summary,content,logo_key,logo_url,cover_url,$3,'published'
        FROM ai_directory_tools WHERE id=$4 RETURNING id::text,slug,display_order`, [item.slug, item.category, item.order, item.sourceId])).rows[0]
      assert.ok(row)
    }
    result.push({ sourceId: item.sourceId, id: row.id, name: source.name, category: item.category, slug: row.slug,
      order: row.display_order, created: !existing.length })
  }
  const after = (await fingerprints()).rows
  const byId = new Map(after.map(row => [row.id, row.fingerprint]))
  assert.ok(before.every(row => byId.get(row.id) === row.fingerprint), 'All original records must remain unchanged')
  assert.equal(after.length, before.length + result.filter(row => row.created).length)
  await client.query('COMMIT')
  const report = { at: new Date().toISOString(), created: result.filter(row => row.created).length,
    originalRecordsUnchanged: true, records: result }
  writeFileSync('docs/imports/confirmed-category-copies-2026-11-20.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(JSON.stringify({ code: error.code ?? error.message }))
  process.exitCode = 1
} finally { await client.end() }
