// Read-only comparison of homepage category placements with the local catalog.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { Client } from 'pg'
import { postgresConfig } from '../lib/postgres-config.ts'

const values = {}
for (const file of ['.env', '.env.local']) if (existsSync(file)) Object.assign(values, parseEnv(readFileSync(file, 'utf8')))
const reference = JSON.parse(readFileSync('docs/imports/cross-category-reference-2026-11-20.json', 'utf8'))
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
function website(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || /(^|\.)ai-bot\.cn$/.test(url.hostname)) return null
    return url.hostname.toLowerCase().replace(/^www\./, '') + url.pathname.replace(/\/+$/, '')
  } catch { return null }
}
const client = new Client(postgresConfig({ ...values, ...process.env }))
try {
  await client.connect()
  await client.query('BEGIN READ ONLY')
  const { rows } = await client.query(`SELECT t.id::text, t.slug, t.name, t.website, t.category_id,
    t.status, t.deleted_at, t.display_order, c.name AS category_name, c.is_enabled AS category_enabled
    FROM ai_directory_tools t JOIN ai_directory_categories c ON c.id=t.category_id`)
  const categories = (await client.query('SELECT id, name FROM ai_directory_categories')).rows
  const categoryNames = new Map(categories.map(row => [row.id, row.name]))
  const report = { source: reference.source, capturedAt: reference.capturedAt, auditedAt: new Date().toISOString(), readOnly: true,
    placements: [], needAdditionalCategory: [], needsIdentityReview: [], unavailable: [], notCollected: [] }
  const visible = row => row.status === 'published' && !row.deleted_at && row.category_enabled
  for (const [category, items] of Object.entries(reference.categories)) {
    for (const [index, item] of items.entries()) {
      const ids = new Set([item.sourceId, /\/sites\/(\d+)\.html/.exec(item.source ?? '')?.[1]].filter(Boolean))
      const seeds = rows.filter(row => normalize(row.name) === normalize(item.name)
        || [...ids].some(id => row.slug.endsWith(`-ab-${id}`))
        || (website(item.website) && website(item.website) === website(row.website)))
      const strongIdentity = seeds.some(row => normalize(row.name) === normalize(item.name)
        || [...ids].some(id => row.slug.endsWith(`-ab-${id}`)))
      // Include existing per-category copies, whose unique slugs no longer carry source IDs.
      const knownNames = new Set(seeds.map(row => normalize(row.name)))
      const knownWebsites = new Set(seeds.map(row => website(row.website)).filter(Boolean))
      const matches = rows.filter(row => seeds.includes(row) || knownNames.has(normalize(row.name))
        || (website(row.website) && knownWebsites.has(website(row.website))))
      const record = { sourceName: item.name, targetCategory: category, targetCategoryName: categoryNames.get(category), targetOrder: index + 1,
        source: item.source, matchBasis: strongIdentity ? 'name-or-source-id' : matches.length ? 'website-only' : 'none', matches: matches.map(row => ({ id: row.id, slug: row.slug, name: row.name, category: row.category_id,
          categoryName: row.category_name, website: row.website, visible: visible(row), deleted: !!row.deleted_at, order: row.display_order })) }
      const inCategory = matches.filter(row => row.category_id === category)
      if (matches.length && !strongIdentity) { record.result = 'identity-review'; report.needsIdentityReview.push(record) }
      else if (inCategory.some(visible)) record.result = 'already-present'
      else if (inCategory.length) { record.result = 'unavailable-in-target'; report.unavailable.push(record) }
      else if (matches.some(visible)) { record.result = 'needs-category-copy'; report.needAdditionalCategory.push(record) }
      else if (matches.length) { record.result = 'unavailable'; report.unavailable.push(record) }
      else { record.result = 'not-collected'; report.notCollected.push(record) }
      report.placements.push(record)
    }
  }
  report.summary = { localTools: rows.length, categories: Object.keys(reference.categories).length, referencePlacements: report.placements.length,
    alreadyPresent: report.placements.filter(row => row.result === 'already-present').length,
    copiesNeeded: report.needAdditionalCategory.length, identityReview: report.needsIdentityReview.length, unavailable: report.unavailable.length, notCollected: report.notCollected.length }
  await client.query('COMMIT')
  writeFileSync('docs/imports/cross-category-audit-2026-11-20.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ summary: report.summary, needAdditionalCategory: report.needAdditionalCategory,
    needsIdentityReview: report.needsIdentityReview, unavailable: report.unavailable, notCollected: report.notCollected.map(row => ({ name: row.sourceName, category: row.targetCategory })) }, null, 2))
} finally { await client.end() }
