// Repair missing URLs with verified source images through a normal browser context.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { parseEnv } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from 'pg'
import sharp from 'sharp'
import { postgresConfig } from '../lib/postgres-config.ts'
import { writeMediaFile } from '../lib/media-files.ts'

const folder = process.argv[2], runtime = process.argv[3]
if (!folder || !runtime) throw new Error('Expected import folder and Playwright runtime folder')
const { chromium } = await import(pathToFileURL(join(runtime, 'node_modules/playwright/index.mjs')).href)
for (const f of ['.env', '.env.local']) if (existsSync(f)) {
  const values = parseEnv(readFileSync(f, 'utf8'))
  for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value
}
const manifest = JSON.parse(readFileSync(join(folder, 'inserted-manifest.json'), 'utf8'))
const sources = new Map(manifest.inserted.map(r => [r.id, r.source]))
const cache = join(folder, 'browser-source-images')
mkdirSync(cache, { recursive: true })
const client = new Client(postgresConfig())
const cardLogos = new Map()
for (const filename of readdirSync(folder).filter(f => /^page-\d+\.html$/.test(f))) {
  const html = readFileSync(join(folder, filename), 'utf8')
  for (const match of html.matchAll(/<a\b[^>]*href=["'](https:\/\/ai-bot\.cn\/sites\/\d+\.html)["'][^>]*>[\s\S]*?<\/a>/g)) {
    const image = match[0].match(/<img\b[^>]*data-src=["']([^"']+)["']/)?.[1]
    if (image?.startsWith('https://ai-bot.cn/wp-content/uploads/')) cardLogos.set(match[1], image)
  }
}
let browser, stopped = false, nextRequest = 0, index = 0
const results = []
async function fetchImage(context, source, url, kind) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'ai-bot.cn' || !parsed.pathname.startsWith('/wp-content/uploads/')) throw new Error('UNEXPECTED_IMAGE_SOURCE')
  const filename = createHash('sha256').update(url).digest('hex') + '.raw'
  const cached = join(cache, filename)
  let bytes
  if (existsSync(cached)) bytes = readFileSync(cached)
  else {
    const scheduled = Math.max(Date.now(), nextRequest)
    nextRequest = scheduled + 250
    await delay(Math.max(0, scheduled - Date.now()))
    if (stopped) throw new Error('SOURCE_PAUSED')
    const response = await context.request.get(url, { headers: { Referer: source }, timeout: 15000, maxRedirects: 3 })
    try {
      if (response.status() === 429) stopped = true
      if (response.status() !== 200) throw new Error('HTTP_' + response.status())
      if (new URL(response.url()).hostname !== 'ai-bot.cn' || !response.headers()['content-type']?.startsWith('image/')) throw new Error('NON_IMAGE_RESPONSE')
      if (Number(response.headers()['content-length'] ?? 0) > 8000000) throw new Error('SOURCE_IMAGE_TOO_LARGE')
      bytes = await response.body()
      if (bytes.length > 8000000) throw new Error('SOURCE_IMAGE_TOO_LARGE')
      await sharp(bytes, { limitInputPixels: 32000000 }).metadata()
      writeFileSync(cached, bytes)
    } finally { await response.dispose() }
  }
  const image = sharp(bytes, { limitInputPixels: 32000000 })
  const meta = await image.metadata()
  if (kind === 'cover' && (meta.width < 300 || meta.height < 130 || (meta.width / meta.height < 1.15 && !/website|screenshot|preview/i.test(url)))) throw new Error('NOT_A_COVER_IMAGE')
  const edge = kind === 'logo' ? 256 : 1500
  const output = await image.rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer()
  if (output.length > (kind === 'logo' ? 524288 : 2097152)) throw new Error('ENCODED_IMAGE_TOO_LARGE')
  return writeMediaFile(output, 'public')
}

try {
  await client.connect()
  if ((await client.query('SELECT current_schema() AS name')).rows[0].name !== 'ai-tools') throw new Error('UNEXPECTED_SCHEMA')
  const rows = (await client.query(`SELECT id::text,slug,name,website,logo_url,cover_url FROM ai_directory_tools
    WHERE id::text=ANY($1::text[]) AND deleted_at IS NULL AND (logo_url IS NULL OR cover_url IS NULL) ORDER BY id`, [[...sources.keys()]])).rows
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('https://ai-bot.cn/sites/1825.html', { waitUntil: 'domcontentloaded', timeout: 25000 })
  async function worker() {
    while (index < rows.length && !stopped) {
      const row = rows[index++]
      const source = sources.get(row.id)
      const sid = source.match(/\/sites\/(\d+)\.html$/)[1]
      const path = join(folder, 'enriched', sid + '.json')
      const info = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
      const result = { id: row.id, name: row.name, source, logoAdded: false, coverAdded: false, failures: [] }
      let logoUrl = null, coverUrl = null
      for (const kind of ['logo', 'cover']) {
        if (row[kind + '_url']) continue
        let candidates = kind === 'logo' ? [cardLogos.get(source), info.logoUrl] : (info.coverUrls ?? [])
        if (kind === 'cover' && !candidates.length) {
          const detail = await context.newPage()
          try {
            await detail.goto(source, { waitUntil: 'domcontentloaded', timeout: 20000 })
            candidates = await detail.evaluate(() => [...document.querySelectorAll('.siteico img, .panel-body.single img')].map(image => image.getAttribute('data-src') || image.getAttribute('src')).filter(url => url?.includes('/wp-content/uploads/')))
          } catch (e) { result.failures.push({ kind, source, code: e.message?.split('\n')[0] }) }
          finally { await detail.close() }
        }
        for (const url of [...new Set(candidates.filter(Boolean))]) {
          try {
            const local = await fetchImage(context, source, url, kind)
            if (kind === 'logo') logoUrl = local
            else coverUrl = local
            result[kind + 'Source'] = url
            break
          } catch (e) { result.failures.push({ kind, source: url, code: e.message?.split('\n')[0] }) }
        }
      }
      if (!row.cover_url && !coverUrl && process.argv.includes('--official-covers')) {
        const website = await context.newPage()
        try {
          const destination = new URL(row.website)
          if (!['http:', 'https:'].includes(destination.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(destination.hostname)) throw new Error('UNEXPECTED_WEBSITE')
          const response = await website.goto(row.website, { waitUntil: 'domcontentloaded', timeout: 15000 })
          if (!response || response.status() >= 400) throw new Error('WEBSITE_HTTP_' + response?.status())
          await website.waitForTimeout(1500)
          const title = await website.title()
          const text = (await website.locator('body').innerText({ timeout: 3000 })).trim()
          if (text.length < 60 || /just a moment|access denied|captcha|verify you are human|not found|domain is for sale|buy this domain|no longer available|has been discontinued|人机验证|安全验证|域名出售/i.test(title + '\n' + text.slice(0, 500))) throw new Error('UNSUITABLE_WEBSITE_PREVIEW')
          const brand = row.name.split(/[\s.]+/)[0].toLowerCase()
          if (brand.length >= 3 && !(title + ' ' + text).toLowerCase().includes(brand)) throw new Error('WEBSITE_BRAND_CHANGED')
          const screenshot = await website.screenshot({ fullPage: false, animations: 'disabled', timeout: 6000 })
          writeFileSync(join(cache, row.id + '-official-cover.png'), screenshot)
          coverUrl = await writeMediaFile(await sharp(screenshot).webp({ quality: 86 }).toBuffer(), 'public')
          result.coverSource = website.url()
          result.coverMethod = 'official-browser-screenshot'
        } catch (e) { result.failures.push({ kind: 'official-cover', source: row.website, code: e.message?.split('\n')[0] }) }
        finally { await website.close() }
      }
      if (logoUrl || coverUrl) {
        const update = await client.query(`UPDATE ai_directory_tools SET logo_url=COALESCE(logo_url,$2::text),
          cover_url=COALESCE(cover_url,$3::text),updated_at=statement_timestamp()
          WHERE id=$1 AND slug=$4 AND deleted_at IS NULL RETURNING logo_url,cover_url`, [row.id, logoUrl, coverUrl, row.slug])
        if (update.rows[0]) {
          result.logoAdded = !!logoUrl && update.rows[0].logo_url === logoUrl
          result.coverAdded = !!coverUrl && update.rows[0].cover_url === coverUrl
        }
      }
      results.push(result)
      if (results.length % 25 === 0 || results.length === rows.length) console.log(JSON.stringify({ checked: results.length, total: rows.length, logosAdded: results.filter(r => r.logoAdded).length, coversAdded: results.filter(r => r.coverAdded).length, paused: stopped }))
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  const counts = (await client.query('SELECT count(*)::int total,count(logo_url)::int logos,count(cover_url)::int covers FROM ai_directory_tools')).rows[0]
  const report = { verifiedAt: new Date().toISOString(), checked: results.length, logosAdded: results.filter(r => r.logoAdded).length, coversAdded: results.filter(r => r.coverAdded).length, paused: stopped, counts, results }
  mkdirSync('docs/imports', { recursive: true })
  const reportName = process.argv.includes('--official-covers') ? 'browser-official-cover-repair-2026-11-20.json' : process.argv.includes('--retry-covers') ? 'browser-cover-repair-2026-11-20.json' : 'browser-image-repair-2026-11-20.json'
  writeFileSync(join('docs/imports', reportName), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, results: results.length }, null, 2))
} catch (e) { console.error(JSON.stringify({ ok: false, code: e.code || e.message })); process.exitCode = 1 }
finally { await browser?.close(); await client.end() }
