// One-off metadata import. Dry run by default; --apply writes one atomic batch.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { Client } from 'pg'
import { postgresConfig } from '../lib/postgres-config.ts'
import { parseToolForm } from '../lib/directory-validation.ts'

const folder = process.argv[2]
if (!folder) throw new Error('Expected collection folder')
const apply = process.argv.includes('--apply')
const env = {}
for (const file of ['.env', '.env.local']) if (existsSync(file)) Object.assign(env, parseEnv(readFileSync(file, 'utf8')))
const client = new Client(postgresConfig({ ...env, ...process.env }))
const collected = JSON.parse(readFileSync(join(folder, 'collected.json'), 'utf8'))
const normalizeName = name => name.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
function normalizeWebsite(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('INVALID_WEBSITE')
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref($|_|errer|erral)|from$|source$|invite|aff|tracking|channel|ch$|r$|sqm$)/i.test(key) || /aibot|ai-bot/i.test(url.searchParams.get(key))) url.searchParams.delete(key)
  url.searchParams.sort()
  return url
}
const websiteKey = url => url.hostname.toLowerCase().replace(/^www\./, '') + url.pathname.replace(/\/+$/, '') + url.search
const ignoredHosts = /(^|\.)(cgref\.cn|chatdesks\.cn)$|^(dis|click|redirect)\./i
try {
  await client.connect()
  await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY')
  const schema = (await client.query('SELECT current_schema() AS name')).rows[0].name
  if (schema !== 'ai-tools') throw new Error('UNEXPECTED_DATABASE_SCHEMA')
  if (apply) await client.query('LOCK TABLE ai_directory_tools IN SHARE ROW EXCLUSIVE MODE')
  const categories = (await client.query('SELECT id, name FROM ai_directory_categories WHERE is_enabled')).rows
  const categoryMap = new Map(categories.map(c => [c.id, c.name]))
  const before = (await client.query('SELECT id::text, slug, name, website, category_id, status, deleted_at FROM ai_directory_tools')).rows
  const names = new Set(before.map(r => normalizeName(r.name)))
  const websites = new Set(before.map(r => websiteKey(normalizeWebsite(r.website))))
  const slugs = new Set(before.map(r => r.slug))
  const accepted = [], skipped = []
  for (const item of collected.items) {
    const skip = reason => skipped.push({ source: item.source, name: item.name, reason })
    let url
    try { url = normalizeWebsite(item.website) } catch { skip('invalid-website'); continue }
    if (ignoredHosts.test(url.hostname)) { skip('unresolved-promotion-link'); continue }
    if (!categoryMap.has(item.category)) { skip('missing-or-disabled-category'); continue }
    const id = item.source.match(/^https:\/\/ai-bot\.cn\/sites\/(\d+)\.html$/)?.[1]
    if (!id) { skip('invalid-source'); continue }
    const nameKey = normalizeName(item.name)
    const webKey = websiteKey(url)
    if (names.has(nameKey) || websites.has(webKey)) { skip('duplicate-name-or-website'); continue }
    const slug = url.hostname.replace(/^www\./, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) + '-ab-' + id
    if (slugs.has(slug)) { skip('existing-slug'); continue }
    const summary = item.summary?.trim()
    if (!summary || summary.length > 130 || item.name.length > 90) { skip('missing-or-oversize-text'); continue }
    // Only directory metadata is imported, not the source's editorial article or images.
    const content = `${summary}\n\n分类：${categoryMap.get(item.category)}\n\n[访问官网](${url.href})\n\n资料来源：[AI工具集](${item.source})。功能与服务信息请以工具官网为准。`
    const form = new FormData()
    for (const [key, value] of Object.entries({ slug, name: item.name, category: item.category, website: url.href, summary, content })) form.set(key, value)
    const parsed = parseToolForm(form)
    if (!parsed) { skip('application-validation'); continue }
    accepted.push({ ...parsed, source: item.source })
    names.add(nameKey); websites.add(webKey); slugs.add(slug)
  }
  const counts = Object.fromEntries(categories.map(c => [c.id, accepted.filter(r => r.category === c.id).length]))
  const report = { collected: collected.items.length, existing: before.length, accepted: accepted.length, skipped: skipped.length, skipReasons: Object.fromEntries([...new Set(skipped.map(s => s.reason))].map(reason => [reason, skipped.filter(s => s.reason === reason).length])), categories: counts }
  writeFileSync(join(folder, apply ? 'apply-plan.json' : 'dry-run.json'), JSON.stringify({ ...report, accepted, skipped }, null, 2))
  const inserted = []
  if (apply) {
    writeFileSync(join(folder, 'existing-tools-before.json'), JSON.stringify(before, null, 2))
    const result = await client.query(`INSERT INTO ai_directory_tools (slug, category_id, name, website, summary, content, status)
      SELECT slug, category, name, website, summary, content, 'published'
      FROM jsonb_to_recordset($1::jsonb) AS batch(slug text, category text, name text, website text, summary text, content text)
      RETURNING id::text, slug`, [JSON.stringify(accepted)])
    const sources = new Map(accepted.map(row => [row.slug, row.source]))
    inserted.push(...result.rows.map(row => ({ ...row, source: sources.get(row.slug) })))
    const after = (await client.query('SELECT count(*)::integer AS count FROM ai_directory_tools')).rows[0].count
    if (after !== before.length + accepted.length) throw new Error('COUNT_MISMATCH')
    const visible = (await client.query(`SELECT count(*)::integer AS count FROM ai_directory_tools t JOIN ai_directory_categories c ON c.id=t.category_id
      WHERE t.id::text = ANY($1::text[]) AND t.status='published' AND t.deleted_at IS NULL AND c.is_enabled`, [inserted.map(r => r.id)])).rows[0].count
    if (visible !== accepted.length) throw new Error('PUBLIC_VISIBILITY_MISMATCH')
    // Prepare a manifest before commit as well, so the batch remains traceable if the process exits after commit.
    writeFileSync(join(folder, 'inserted-manifest.json'), JSON.stringify({ ...report, inserted, transaction: 'prepared' }, null, 2))
    await client.query('COMMIT')
    writeFileSync(join(folder, 'inserted-manifest.json'), JSON.stringify({ ...report, inserted, transaction: 'committed', totalAfter: after }, null, 2))
    console.log(JSON.stringify({ ...report, applied: true, inserted: inserted.length, totalAfter: after, publicVisible: visible }, null, 2))
  } else {
    await client.query('ROLLBACK')
    console.log(JSON.stringify({ ...report, applied: false }, null, 2))
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(JSON.stringify({ ok: false, code: e.code || e.message || e.name }))
  process.exitCode = 1
} finally { await client.end() }
