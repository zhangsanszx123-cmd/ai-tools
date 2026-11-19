import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from 'pg'
import sharp from 'sharp'
import { postgresConfig } from '../lib/postgres-config.ts'

// Production Next.js, real server actions and real PostgreSQL, isolated from business data.
const values = {}
for (const file of ['.env', '.env.local']) if (existsSync(file)) Object.assign(values, parseEnv(readFileSync(file, 'utf8')))
const environment = { ...values, ...process.env }
const schema = `dir_e2e_${randomBytes(8).toString('hex')}`
const bootstrap = new Client(postgresConfig(environment))
let child, created = false, stage = 'setup', origin
const checks = []
const password = 'Isolated-test-password-2026-only'
const decode = value => value.replace(/&(quot|amp|lt|gt|#x27|#39);/g, (_, key) => ({ quot: '"', amp: '&', lt: '<', gt: '>', '#x27': "'", '#39': "'" })[key])
const attributes = tag => Object.fromEntries([...tag.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]))
const cookie = response => response.headers.getSetCookie().map(header => header.split(';')[0]).join('; ')
async function page(path, cookies = '') {
  const response = await fetch(origin + path, { headers: { Cookie: cookies }, redirect: 'manual' })
  return { response, html: await response.text() }
}
async function signup(email) {
  const response = await fetch(origin + '/api/auth/sign-up/email', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '新用户', email, password }) })
  assert.equal(response.status, 200)
  return { user: (await response.json()).user, cookie: cookie(response) }
}
async function postForm(path, cookies, select, fields) {
  const { html } = await page(path, cookies)
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(match => match[0])
  const template = forms.find(select)
  assert.ok(template, `Missing form at ${path}`)
  const body = new FormData()
  for (const [tag] of template.matchAll(/<input\b[^>]*>/g)) {
    const input = attributes(tag)
    if (input.type === 'hidden' && input.name) body.append(input.name, input.value ?? '')
  }
  assert.ok([...body.keys()].some(key => key.startsWith('$ACTION_')))
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  const response = await fetch(origin + path, { method: 'POST', headers: { Cookie: cookies, Origin: origin }, body, redirect: 'manual' })
  await response.text()
  return response
}
const hasInput = (html, name, value) => [...html.matchAll(/<input\b[^>]*>/g)].some(([tag]) => { const input = attributes(tag); return input.name === name && input.value === value })
const redirected = response => assert.ok([303, 307].includes(response.status), `Expected action redirect, received ${response.status}`)

try {
  await bootstrap.connect()
  assert.match(schema, /^dir_e2e_[a-f0-9]{16}$/)
  await bootstrap.query(`CREATE SCHEMA "${schema}"`)
  created = true
  await bootstrap.query(`SET search_path = "${schema}", public`)
  await bootstrap.query(readFileSync('db/auth-schema.sql', 'utf8'))
  await bootstrap.query(readFileSync('db/directory-v2.sql', 'utf8').replaceAll('"ai-tools"', `"${schema}"`).replaceAll("'ai-tools'", `'${schema}'`))
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  origin = `http://localhost:${port}`
  const url = new URL(environment.DATABASE_URL)
  url.searchParams.set('options', `-c search_path=${schema},public`)
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', String(port)], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...environment, DATABASE_URL: url.toString(), BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  child.on('error', () => {})
  for (let attempt = 0; ; attempt++) {
    if (attempt > 100 || child.exitCode !== null) throw new Error('APP_START_FAILED')
    try { if ((await fetch(origin + '/login')).ok) break } catch {}
    await delay(200)
  }
  stage = 'home-and-auth'
  assert.ok((await page('/')).html.includes('AI 写作工具'))
  assert.ok((await page('/')).html.includes('登录 / 注册'))
  const owner = await signup('owner-e2e@example.invalid')
  const signedInHome = (await page('/', owner.cookie)).html
  assert.ok(signedInHome.includes('已登录'))
  assert.ok(signedInHome.includes('owner-e2e@example.invalid'))
  assert.ok(!signedInHome.includes('登录 / 注册'))
  const admin = await signup('admin-e2e@example.invalid')
  const outsider = await signup('outsider-e2e@example.invalid')
  await bootstrap.query('UPDATE ai_directory_users SET role = $1 WHERE id = $2', ['admin', admin.user.id])
  assert.ok(!(await page('/account', owner.cookie)).html.includes('分类管理'))
  assert.ok((await page('/account', admin.cookie)).html.includes('分类管理'))
  checks.push('email registration, session and admin navigation')

  stage = 'category-management'
  const category = { id: 'e2e-category', name: '端到端测试分类', short: '测试', description: '临时测试分类', iconKey: 'Sparkles', sortOrder: '5', isEnabled: 'on' }
  redirected(await postForm('/account?tab=categories', admin.cookie, html => html.includes('新增分类'), category))
  assert.ok((await page('/')).html.includes(category.name))
  assert.ok((await page('/account?tab=submit', owner.cookie)).html.includes('value="e2e-category"'))
  checks.push('category creation appears in homepage and submission dropdown')

  stage = 'submission-action'
  const tool = { name: '端到端测试工具', slug: 'e2e-tool', category: category.id, website: 'https://example.invalid', summary: '测试摘要', content: '原始投稿快照' }
  const image = await sharp({ create: { width: 5, height: 5, channels: 3, background: '#633bdb' } }).webp().toBuffer()
  redirected(await postForm('/account?tab=submit', owner.cookie, html => html.includes('提交审核'), { ...tool, logo: new File([image], 'test.webp', { type: 'image/webp' }) }))
  const { rows: [submission] } = await bootstrap.query('SELECT id::text, status FROM ai_directory_tool_submissions WHERE requested_slug = $1', [tool.slug])
  assert.equal(submission.status, 'pending')
  assert.equal((await page('/tools/e2e-tool')).response.status, 404)
  const privatePath = `/api/submission-media/${submission.id}/logo`
  assert.equal((await page(privatePath)).response.status, 404)
  assert.equal((await page(privatePath, outsider.cookie)).response.status, 404)
  assert.equal((await page(privatePath, owner.cookie)).response.status, 200)
  assert.equal((await page(privatePath, admin.cookie)).response.status, 200)
  assert.equal((await page('/api/tool-media/e2e-tool/logo?review=1', owner.cookie)).response.status, 404)
  checks.push('real submission server action and private image authorization')

  stage = 'approval-action'
  const reviewForm = html => hasInput(html, 'id', submission.id)
  // Replay a real admin action with a regular user's cookie: identity still comes from the server session.
  const adminHtml = (await page('/account?tab=review', admin.cookie)).html
  const template = [...adminHtml.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(match => match[0]).find(reviewForm)
  assert.ok(template)
  const forged = new FormData()
  for (const [tag] of template.matchAll(/<input\b[^>]*>/g)) { const item = attributes(tag); if (item.type === 'hidden' && item.name) forged.append(item.name, item.value ?? '') }
  forged.set('decision', 'approve')
  const denied = await fetch(origin + '/account?tab=review', { method: 'POST', headers: { Cookie: owner.cookie, Origin: origin }, body: forged })
  assert.ok((await denied.text()).includes('你没有审核权限'))
  redirected(await postForm('/account?tab=review', admin.cookie, reviewForm, { decision: 'approve' }))
  assert.equal((await page('/tools/e2e-tool')).response.status, 200)
  assert.equal((await page('/api/tool-media/e2e-tool/logo')).response.status, 200)
  assert.ok((await page('/account', owner.cookie)).html.includes('已通过'))
  checks.push('server action authorization, approval and public detail/media')

  stage = 'rejection-action'
  redirected(await postForm('/account?tab=submit', owner.cookie, html => html.includes('提交审核'), { ...tool, slug: 'e2e-rejected' }))
  const { rows: [rejected] } = await bootstrap.query('SELECT id::text FROM ai_directory_tool_submissions WHERE requested_slug = $1', ['e2e-rejected'])
  redirected(await postForm('/account?tab=review', admin.cookie, html => hasInput(html, 'id', rejected.id), { decision: 'reject', reason: '请补充功能说明' }))
  assert.ok((await page('/account', owner.cookie)).html.includes('请补充功能说明'))
  assert.equal((await page('/tools/e2e-rejected')).response.status, 404)
  checks.push('rejection reason appears only in private submission history')

  stage = 'tool-management-action'
  const { rows: [formal] } = await bootstrap.query('SELECT id::text FROM ai_directory_tools WHERE slug = $1', [tool.slug])
  redirected(await postForm('/account?tab=tools', admin.cookie, html => hasInput(html, 'id', formal.id), {
    ...tool, content: '管理员更新后的正式内容', status: 'published', displayOrder: '1', featuredOrder: '0', logoKey: '',
  }))
  assert.ok((await page('/tools/e2e-tool')).html.includes('管理员更新后的正式内容'))
  assert.ok((await page('/account', owner.cookie)).html.includes(tool.content))
  checks.push('tool editor preserves original submission and existing image')

  stage = 'disabled-category'
  const disabled = { ...category }; delete disabled.isEnabled
  redirected(await postForm('/account?tab=categories', admin.cookie, html => hasInput(html, 'id', category.id), disabled))
  assert.ok(!(await page('/')).html.includes(category.name))
  assert.equal((await page('/tools/e2e-tool')).response.status, 404)
  assert.equal((await page('/api/tool-media/e2e-tool/logo')).response.status, 404)
  checks.push('category disabling hides homepage, tool detail and public image')

  stage = 'direct-publishing-and-unpublish'
  const direct = { ...tool, slug: 'e2e-direct', category: 'image', status: 'published', featuredOrder: '', displayOrder: '0', logoKey: '' }
  redirected(await postForm('/account?tab=tools', admin.cookie, html => html.includes('直接收录工具'), direct))
  const { rows: [directRow] } = await bootstrap.query('SELECT id::text FROM ai_directory_tools WHERE slug = $1', [direct.slug])
  assert.equal((await page('/tools/e2e-direct')).response.status, 200)
  redirected(await postForm('/account?tab=tools', admin.cookie, html => hasInput(html, 'id', directRow.id), { ...direct, status: 'disabled' }))
  assert.equal((await page('/tools/e2e-direct')).response.status, 404)
  checks.push('direct admin publishing and unpublishing')

  stage = 'logout'
  redirected(await postForm('/account?tab=profile', owner.cookie, html => html.includes('退出登录'), {}))
  assert.equal((await page('/account', owner.cookie)).response.status, 307)
  const signedOutHome = (await page('/', owner.cookie)).html
  assert.ok(signedOutHome.includes('登录 / 注册'))
  assert.ok(!signedOutHome.includes('class="account-email"'))
  checks.push('logout server action revokes protected page access')
  console.log(JSON.stringify({ ok: true, checks }, null, 2))
  if (process.argv.includes('--hold')) {
    console.log(JSON.stringify({ previewOrigin: origin, isolated: true, previewAdmin: 'admin-e2e@example.invalid' }))
    await once(process.stdin, 'data')
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, stage, code: error.code || error.message || error.name }))
  process.exitCode = 1
} finally {
  if (child && child.exitCode === null) { const closed = once(child, 'exit'); child.kill(); await closed }
  if (created && /^dir_e2e_[a-f0-9]{16}$/.test(schema)) {
    await bootstrap.query(`DROP SCHEMA "${schema}" CASCADE`)
    console.log('Removed isolated e2e schema and all temporary users/content.')
  }
  await bootstrap.end()
}
