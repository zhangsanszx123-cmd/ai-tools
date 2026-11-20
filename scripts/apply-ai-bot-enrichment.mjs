// Apply downloaded product facts/assets to the exact existing import batch.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { Client } from 'pg'
import sharp from 'sharp'
import { postgresConfig } from '../lib/postgres-config.ts'
import { writeMediaFile } from '../lib/media-files.ts'

const folder = process.argv[2]
if (!folder) throw new Error('Expected import folder')
const apply = process.argv.includes('--apply')
const env = {}
for (const file of ['.env', '.env.local']) if (existsSync(file)) Object.assign(env, parseEnv(readFileSync(file, 'utf8')))
for (const [key, value] of Object.entries(env)) if (process.env[key] === undefined) process.env[key] = value
const client = new Client(postgresConfig({ ...env, ...process.env }))
const records = readdirSync(join(folder, 'enriched')).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(folder, 'enriched', f), 'utf8')))
for (const info of records) {
  const officialFile = join(folder, 'official', info.id + '.json')
  // Invalid source responses are never accepted as images. Prefer product-owned assets.
  const official = existsSync(officialFile) ? JSON.parse(readFileSync(officialFile, 'utf8')) : {}
  info.logo = official.logo ?? null
  info.covers = official.covers ?? []
  info.statusNotice = official.statusNotice
}
const manifest = JSON.parse(readFileSync(join(folder, 'inserted-manifest.json'), 'utf8'))
const allowed = new Map(manifest.inserted.map(r => [r.id, r.slug]))
const imported = new Map(JSON.parse(readFileSync(join(folder, 'apply-plan.json'), 'utf8')).accepted.map(r => [r.slug, r]))
const knownBrands = {
  'openai.com':'openai', 'claude.ai':'claude', 'midjourney.com':'midjourney', 'deepseek.com':'deepseek',
  'gemini.google.com':'gemini', 'perplexity.ai':'perplexity', 'notion.so':'notion', 'notion.com':'notion',
  'cursor.com':'cursor', 'kimi.com':'kimi', 'doubao.com':'doubao', 'grammarly.com':'grammarly',
  'ideogram.ai':'ideogram', 'runwayml.com':'runway', 'descript.com':'descript', 'suno.com':'suno',
  'elevenlabs.io':'elevenlabs', 'canva.com':'canva', 'windsurf.com':'windsurf',
}
for (const info of records) {
  if (info.logo) continue
  const target = imported.get(info.slug)
  if (!target) continue
  const host = new URL(target.website).hostname.replace(/^www\./, '')
  const brand = Object.entries(knownBrands).find(([domain]) => host === domain || host.endsWith('.' + domain))?.[1]
  const file = brand && join(process.cwd(), 'public', 'brands', brand + '.svg')
  if (file && existsSync(file)) info.logo = { file, kind: 'existing-project-brand' }
}
const encodedDir = join(folder, 'webp')
mkdirSync(encodedDir, { recursive: true })
const escape = text => String(text).replace(/[\\`*_[\]<>]/g, ' ').replace(/\s+/g, ' ').trim()
const cleanFacts = facts => [...new Set((facts ?? []).map(escape))].filter(s => s.length >= 2 && s.length <= 42 && !/https?:|官网|价格|收费|免费|承诺|低查重|保障|权威/.test(s)).slice(0, 8)
function content(row, info, category) {
  const intro = escape(info.description || row.summary)
  const short = intro.length <= 180 ? intro : intro.slice(0, 180).replace(/[^。！？；;]*$/, '') || intro.slice(0, 160) + '…'
  const features = cleanFacts(info.features)
  const scenarios = cleanFacts(info.scenarios).slice(0, 6)
  const sections = ['## 产品概览', `${escape(row.name)} · ${escape(category)}\n\n${short}`]
  if (info.statusNotice) sections.push('## 服务状态提醒', escape(info.statusNotice))
  if (features.length) sections.push('## 主要功能', `根据产品资料，可关注以下功能模块：\n\n${features.map(f => '- ' + f).join('\n')}`)
  if (scenarios.length) sections.push('## 适用场景', scenarios.map(f => '- ' + f).join('\n'))
  sections.push('## 使用入口', `[前往 ${escape(row.name)} 官网](${row.website})\n\n进入官网后，可根据实际任务查看相应功能和使用说明。账号要求、免费额度、套餐价格与地区可用性请以官网当前说明为准。`)
  sections.push('## 资料来源', `[AI工具集产品资料](${info.source})。产品信息可能随版本更新，请以官网当前说明为准。`)
  return sections.join('\n\n')
}
async function encode(asset, kind) {
  if (!asset?.file || !existsSync(asset.file)) return null
  const cache = join(encodedDir, asset.file.split(/[\\/]/).at(-1) + '-' + kind + '.webp')
  if (existsSync(cache)) return readFileSync(cache)
  const raw = readFileSync(asset.file)
  const image = sharp(raw, { limitInputPixels: 40_000_000, animated: false })
  const meta = await image.metadata()
  if (!meta.width || !meta.height || !['png', 'jpeg', 'webp', 'gif', 'avif', 'svg'].includes(meta.format)) throw new Error('INVALID_IMAGE')
  if (kind === 'cover' && (meta.width < 300 || meta.height < 130 || meta.width / meta.height < 1.15)) return null
  const edge = kind === 'logo' ? 256 : 1500
  const bytes = await image.rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer()
  if (bytes.length > (kind === 'logo' ? 524288 : 2097152)) throw new Error('IMAGE_TOO_LARGE')
  writeFileSync(cache, bytes)
  return bytes
}
try {
  await client.connect()
  if ((await client.query('SELECT current_schema() AS name')).rows[0].name !== 'ai-tools') throw new Error('UNEXPECTED_SCHEMA')
  const rows = (await client.query(`SELECT t.id::text, t.slug, t.name, t.website, t.summary, t.content, t.updated_at,
    t.logo_url IS NOT NULL AS has_logo, t.cover_url IS NOT NULL AS has_cover, c.name AS category
    FROM ai_directory_tools t JOIN ai_directory_categories c ON c.id=t.category_id WHERE t.id::text=ANY($1::text[]) AND t.deleted_at IS NULL`, [[...allowed.keys()]])).rows
  const byId = new Map(rows.map(r => [r.id, r]))
  const backup = join(folder, 'pre-enrichment.json')
  if (apply && !existsSync(backup)) writeFileSync(backup, JSON.stringify(rows, null, 2))
  const results = [], failures = []
  let logos = 0, covers = 0, texts = 0, applied = 0
  for (const info of records) {
    const row = byId.get(info.id)
    if (!info.ok || !row || allowed.get(info.id) !== row.slug) continue
    if (row.content !== undefined && !row.content.includes(info.source)) { failures.push({ id: info.id, reason: 'content-edited' }); continue }
    let logo = null, cover = null
    try { logo = await encode(info.logo, 'logo') } catch (e) { failures.push({ id: info.id, reason: 'logo-' + e.message }) }
    for (const asset of info.covers ?? []) {
      try { cover = await encode(asset, 'cover') } catch (e) { failures.push({ id: info.id, reason: 'cover-' + e.message }) }
      if (cover) break
    }
    const text = content(row, info, row.category)
    if (!text || text.length > 12000) throw new Error('INVALID_CONTENT')
    if (row.content === text && (!logo || row.has_logo) && (!cover || row.has_cover)) continue
    if (logo) logos++
    if (cover) covers++
    texts++
    results.push({ id: row.id, source: info.source, logo: Boolean(logo), cover: Boolean(cover), textLength: text.length, features: cleanFacts(info.features).length })
    if (apply) {
      const logoUrl = await writeMediaFile(logo, 'public')
      const coverUrl = await writeMediaFile(cover, 'public')
      const result = await client.query(`UPDATE ai_directory_tools SET content=$2,
        logo_url=COALESCE(logo_url,$3::text), cover_url=COALESCE(cover_url,$4::text),
        logo_data=NULL, logo_type=NULL, cover_data=NULL, cover_type=NULL,
        updated_at=statement_timestamp()
        WHERE id=$1 AND deleted_at IS NULL AND content=$5 RETURNING id`, [row.id, text, logoUrl, coverUrl, row.content])
      if (result.rowCount) applied++
      else failures.push({ id: row.id, reason: 'record-changed' })
    }
    if (results.length % 100 === 0) console.log(JSON.stringify({ processed: results.length, logos, covers, texts, applied }))
  }
  const report = { checked: records.length, processed: results.length, logos, covers, texts, applied, failures, results }
  writeFileSync(join(folder, apply ? 'enrichment-applied.json' : 'enrichment-preview.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ done: true, checked: records.length, processed: results.length, logos, covers, texts, applied, failures: failures.length }))
} catch (e) {
  console.error(JSON.stringify({ ok: false, code: e.code || e.message || e.name }))
  process.exitCode = 1
} finally { await client.end() }
