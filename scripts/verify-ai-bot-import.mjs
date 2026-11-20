import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { Client } from 'pg'
import sharp from 'sharp'
import { postgresConfig } from '../lib/postgres-config.ts'

const folder = process.argv[2]
const origin = process.argv[3]
const env = {}
for (const f of ['.env', '.env.local']) if (existsSync(f)) Object.assign(env, parseEnv(readFileSync(f, 'utf8')))
const manifest = JSON.parse(readFileSync(join(folder, 'inserted-manifest.json'), 'utf8'))
const original = JSON.parse(readFileSync(join(folder, 'existing-tools-before.json'), 'utf8'))
const sources = new Map(manifest.inserted.map(r => [r.id, r.source]))
const client = new Client(postgresConfig({ ...env, ...process.env }))
try {
  await client.connect()
  await client.query('BEGIN READ ONLY')
  const { rows } = await client.query(`SELECT t.id::text, t.slug, t.name, t.website, t.category_id,
    t.logo_url IS NOT NULL AS logo, t.cover_url IS NOT NULL AS cover,
    length(t.content) AS content_length, position('## ' in t.content)>0 AS structured,
    (t.status='published' AND t.deleted_at IS NULL AND c.is_enabled) AS visible,
    (t.logo_data IS NOT NULL OR t.cover_data IS NOT NULL OR t.logo_type IS NOT NULL OR t.cover_type IS NOT NULL) AS invalid_media
    FROM ai_directory_tools t JOIN ai_directory_categories c ON c.id=t.category_id WHERE t.id::text=ANY($1::text[])`, [[...sources.keys()]])
  assert.equal(rows.length, manifest.inserted.length)
  assert.ok(rows.every(r => r.visible && r.structured && r.content_length > 100 && !r.invalid_media))
  for (const before of original) {
    const { rows: [current] } = await client.query('SELECT id::text, slug, name, website, category_id, status, deleted_at FROM ai_directory_tools WHERE id=$1', [before.id])
    assert.deepEqual(JSON.parse(JSON.stringify(current)), before)
  }
  await client.query('COMMIT')
  const http = []
  if (origin) {
    const home = await fetch(origin, { signal: AbortSignal.timeout(20000) })
    assert.equal(home.status, 200)
    assert.ok((await home.text()).includes('loading="lazy"'))
    http.push({ path: '/', status: home.status, lazyImages: true })
    for (const row of rows.filter(r => r.logo && r.cover).slice(0, 4)) {
      const page = await fetch(origin + '/tools/' + row.slug, { signal: AbortSignal.timeout(15000) })
      assert.equal(page.status, 200)
      const html = await page.text()
      assert.ok(html.includes(row.name) && html.includes('产品概览'))
      for (const kind of ['logo', 'cover']) {
        const path = `/api/tool-media/${row.slug}/${kind}`
        const response = await fetch(origin + path, { signal: AbortSignal.timeout(15000) })
        assert.equal(response.status, 200)
        assert.equal(response.headers.get('content-type'), 'image/webp')
        const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
        assert.equal(metadata.format, 'webp')
        http.push({ path, status: response.status, width: metadata.width, height: metadata.height })
      }
    }
  }
  const officials = readdirSync(join(folder, 'official')).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(folder, 'official', f), 'utf8')))
  const byId = new Map(officials.map(r => [r.id, r]))
  const report = {
    verifiedAt: new Date().toISOString(), imported: rows.length, totalTools: rows.length + original.length,
    descriptions: rows.filter(r => r.structured).length, logos: rows.filter(r => r.logo).length,
    covers: rows.filter(r => r.cover).length, visible: rows.filter(r => r.visible).length,
    existingRecordsUnchanged: true, invalidMedia: rows.filter(r => r.invalid_media).length,
    categories: Object.fromEntries([...new Set(rows.map(r => r.category_id))].map(id => [id, rows.filter(r => r.category_id === id).length])),
    http,
    missingImages: rows.filter(r => !r.logo || !r.cover).map(r => ({ id: r.id, slug: r.slug, name: r.name, website: r.website,
      source: sources.get(r.id), missingLogo: !r.logo, missingCover: !r.cover,
      collectionErrors: byId.get(r.id)?.errors, captureError: byId.get(r.id)?.captureError })),
    records: rows.map(r => ({ id: r.id, slug: r.slug, source: sources.get(r.id), logo: r.logo, cover: r.cover,
      logoSource: byId.get(r.id)?.logo?.url ?? (r.logo ? 'existing-project-brand' : null), coverSource: byId.get(r.id)?.covers?.[0]?.url,
      coverKind: r.cover ? byId.get(r.id)?.covers?.[0]?.kind ?? 'official-public-image' : null })),
  }
  mkdirSync('docs/imports', { recursive: true })
  writeFileSync('docs/imports/ai-bot-2026-11-20.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, missingImages: report.missingImages.length, records: report.records.length }, null, 2))
} finally { await client.end() }
