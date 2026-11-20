// Optional one-off fallback: actual public product website screenshots, never generated mockups.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const folder = process.argv[2]
const runtime = process.argv[3]
if (!folder || !runtime) throw new Error('Expected import folder and external Playwright runtime')
const { chromium } = await import(pathToFileURL(join(runtime, 'node_modules/playwright/index.mjs')).href)
const screenshots = join(folder, 'official-screenshots')
mkdirSync(screenshots, { recursive: true })
const records = readdirSync(join(folder, 'official')).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(folder, 'official', f), 'utf8')))
  .filter(r => r.ok && existsSync(join(folder, 'official-html', r.id + '.html')) && (!r.logo || !r.covers?.length))
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const results = []
const privateHost = host => /(^|\.)(localhost|local|internal)$|^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host) || (host.includes(':') && /^\[?(::1|fc|fd|fe80:)/i.test(host))
let index = 0
async function worker() {
  while (index < records.length) {
    const record = records[index++]
    const output = join(folder, 'official', record.id + '.json')
    if (record.captureAttempted) continue
    const result = { id: record.id, cover: false, logo: false }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, userAgent: 'AI-Tools-OneOff-Importer/1.0', serviceWorkers: 'block', acceptDownloads: false, reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      await context.route('**/*', async route => {
        const request = route.request()
        const url = new URL(request.url())
        if (privateHost(url.hostname) || !['http:', 'https:'].includes(url.protocol) || ['media', 'websocket'].includes(request.resourceType())) return route.abort()
        return route.continue()
      })
      const response = await page.goto(record.website, { waitUntil: 'domcontentloaded', timeout: 12000 })
      if (!response || response.status() >= 400) throw new Error('HTTP_' + response?.status())
      await page.waitForTimeout(1800)
      const title = await page.title()
      const text = (await page.locator('body').innerText({ timeout: 2500 })).slice(0, 6000)
      if (/just a moment|access denied|captcha|verify you are human|security verification|人机验证|安全验证|访问受限|网页无法访问|无法访问此网站|not found|^404|^403/i.test(title + '\n' + text.slice(0, 500))) throw new Error('VERIFICATION_OR_ERROR_PAGE')
      if (text.trim().length < 60) throw new Error('INSUFFICIENT_PAGE_CONTENT')
      if (text.length < 2500 && /has been acquired|is joining|sunsetting|shutting down|停止服务|停止运营|关闭服务/i.test(text)) record.statusNotice = '官网当前展示产品或服务变更公告，使用前请查看官网最新说明。'
      if (!record.covers?.length) {
        const file = join(screenshots, record.id + '-cover.png')
        await page.screenshot({ path: file, fullPage: false, timeout: 6000, animations: 'disabled' })
        record.covers = [{ file, url: page.url(), kind: 'official-website-screenshot' }]
        result.cover = true
      }
      if (!record.logo) {
        const logos = page.locator('img[alt*="logo" i], header img[src*="logo" i], nav img[src*="logo" i]')
        for (let i = 0; i < Math.min(await logos.count(), 3); i++) {
          const image = logos.nth(i)
          const box = await image.boundingBox()
          if (!box || box.y > 250 || box.width < 16 || box.height < 12 || box.width > 600 || box.height > 180) continue
          const file = join(screenshots, record.id + '-logo.png')
          await image.screenshot({ path: file, timeout: 2500, animations: 'disabled' })
          record.logo = { file, url: page.url(), kind: 'official-website-logo-screenshot' }
          result.logo = true
          break
        }
      }
      record.captureAttempted = true
      writeFileSync(output, JSON.stringify(record, null, 2))
    } catch (e) {
      result.error = e.message?.split('\n')[0]
      record.captureAttempted = true
      record.captureError = result.error
      writeFileSync(output, JSON.stringify(record, null, 2))
    } finally {
      await context.close().catch(() => {})
      results.push(result)
      if (results.length % 20 === 0 || results.length === records.length) console.log(JSON.stringify({ capturedChecked: results.length, total: records.length, covers: results.filter(r => r.cover).length, logos: results.filter(r => r.logo).length }))
    }
  }
}
try {
  await Promise.all(Array.from({ length: 8 }, worker))
  writeFileSync(join(folder, 'screenshots-report.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ done: true, checked: results.length, covers: results.filter(r => r.cover).length, logos: results.filter(r => r.logo).length }))
} finally { await browser.close() }
