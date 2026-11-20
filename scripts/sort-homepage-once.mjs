// One-time category ordering from a reviewed public homepage snapshot.
// Dry run by default. --apply changes only display_order and updated_at.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { Client } from 'pg'
import { postgresConfig } from '../lib/postgres-config.ts'

const apply = process.argv.includes('--apply')
const values = {}
for (const file of ['.env', '.env.local']) if (existsSync(file)) Object.assign(values, parseEnv(readFileSync(file, 'utf8')))
const referencePath = process.argv.find(arg => arg.startsWith('--reference='))?.slice('--reference='.length) ?? 'docs/imports/homepage-reference-order-2026-11-20.json'
const reportPrefix = process.argv.find(arg => arg.startsWith('--report-prefix='))?.slice('--report-prefix='.length) ?? 'homepage-order'
if (!/^[a-z0-9-]+$/.test(reportPrefix)) throw new Error('INVALID_REPORT_PREFIX')
const reference = JSON.parse(readFileSync(referencePath, 'utf8'))
const client = new Client(postgresConfig({ ...values, ...process.env }))
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
const report = { source: reference.source, at: new Date().toISOString(), applied: false, categories: [], changes: [] }
try {
  await client.connect()
  await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY')
  if (apply) await client.query('LOCK TABLE ai_directory_tools IN SHARE ROW EXCLUSIVE MODE')
  const { rows } = await client.query(`SELECT t.id::text, t.slug, t.name, t.category_id, t.display_order, t.updated_at,
    t.status, t.deleted_at FROM ai_directory_tools t JOIN ai_directory_categories c ON c.id=t.category_id
    WHERE c.is_enabled ORDER BY t.display_order, t.published_at DESC, t.id DESC`)
  const untouched = rows.filter(row => !Object.hasOwn(reference.categories, row.category_id))
  for (const [category, items] of Object.entries(reference.categories)) {
    const all = rows.filter(row => row.category_id === category)
    const available = all.filter(row => row.status === 'published' && !row.deleted_at)
    const selected = new Set()
    const missing = []
    const matches = []
    for (const [index, item] of items.entries()) {
      const sourceId = /\/sites\/(\d+)\.html/.exec(item.source ?? '')?.[1] ?? item.sourceId
      const same = all.filter(row => normalize(row.name) === normalize(item.name) || (sourceId && row.slug.endsWith(`-ab-${sourceId}`)))
      const row = same.find(row => row.status === 'published' && !row.deleted_at && !selected.has(row.id))
      if (!row) { missing.push({ name: item.name, source: item.source, reason: same.length ? 'unavailable-or-duplicate' : 'not-in-category' }); continue }
      selected.add(row.id)
      matches.push({ name: item.name, id: row.id, order: index + 1 })
      report.changes.push({ id: row.id, category, name: row.name, before: row.display_order, after: index + 1 })
    }
    available.filter(row => !selected.has(row.id)).forEach((row, index) => {
      report.changes.push({ id: row.id, category, name: row.name, before: row.display_order, after: 1000 + index })
    })
    report.categories.push({ category, available: available.length, matched: matches.length, matches, missing })
  }
  const changed = report.changes.filter(change => change.before !== change.after)
  if (apply) for (const change of changed) {
    const result = await client.query(`UPDATE ai_directory_tools SET display_order=$1, updated_at=CURRENT_TIMESTAMP
      WHERE id=$2 AND display_order=$3 AND status='published' AND deleted_at IS NULL`, [change.after, change.id, change.before])
    if (result.rowCount !== 1) throw new Error('STALE_ORDER_UPDATE')
  }
  const { rows: verified } = await client.query('SELECT id::text, display_order, updated_at FROM ai_directory_tools WHERE id=ANY($1::bigint[])', [rows.map(row => row.id)])
  const byId = new Map(verified.map(row => [row.id, row]))
  if (untouched.some(row => row.display_order !== byId.get(row.id)?.display_order || row.updated_at.getTime() !== byId.get(row.id)?.updated_at.getTime())) throw new Error('UNRELATED_CATEGORY_CHANGED')
  if (apply && report.changes.some(change => byId.get(change.id)?.display_order !== change.after)) throw new Error('ORDER_VERIFY_FAILED')
  report.otherCategoriesUnchanged = true
  const path = `docs/imports/${reportPrefix}-${apply ? 'applied' : 'preview'}-2026-11-20.json`
  writeFileSync(path, JSON.stringify(report, null, 2))
  await client.query('COMMIT')
  report.applied = apply
  writeFileSync(path, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ applied: apply, total: report.changes.length, changed: changed.length, previouslyZero: report.changes.filter(c => c.before === 0).length,
    categories: report.categories.map(({ category, available, matched, missing }) => ({ category, available, matched, missing: missing.map(m => m.name) })) }, null, 2))
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(JSON.stringify({ code: error.code ?? error.message }))
  process.exitCode = 1
} finally { await client.end() }
