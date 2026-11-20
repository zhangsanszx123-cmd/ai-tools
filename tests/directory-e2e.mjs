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
import { hashPassword } from 'better-auth/crypto'
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
  await bootstrap.query(readFileSync('db/admin-auth.sql', 'utf8'))
  await bootstrap.query(readFileSync('db/admin-audit-migration.sql', 'utf8'))
  await bootstrap.query(`INSERT INTO admin_user (id, name, email, "emailVerified") VALUES ('isolated-admin', '管理员', 'admin-e2e@example.invalid', false)`)
  await bootstrap.query(`INSERT INTO admin_account (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES ('isolated-admin-account', 'isolated-admin', 'credential', 'isolated-admin', $1, CURRENT_TIMESTAMP)`, [await hashPassword(password)])
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
  const guestAdmin = await page('/admin?tab=tools')
  assert.equal(guestAdmin.response.status, 307)
  assert.equal(guestAdmin.response.headers.get('location'), '/admin/login?tab=tools')
  const adminLogin = (await page('/admin/login')).html
  assert.ok(adminLogin.includes('后台管理登录'))
  assert.ok(adminLogin.includes('type="email"'))
  assert.ok(!adminLogin.includes('name="confirmPassword"'))
  assert.ok((await page('/')).html.includes('AI 写作工具'))
  assert.ok((await page('/')).html.includes('登录 / 注册'))
  const owner = await signup('owner-e2e@example.invalid')
  const forbiddenAdmin = await page('/admin?tab=categories', owner.cookie)
  assert.equal(forbiddenAdmin.response.status, 307)
  assert.equal(forbiddenAdmin.response.headers.get('location'), '/admin/login?tab=categories')
  const frontSessionLogin = await page('/admin/login', owner.cookie)
  assert.equal(frontSessionLogin.response.status, 200)
  assert.ok(frontSessionLogin.html.includes('后台管理登录'))
  const legacyAdmin = await page('/account?tab=categories', owner.cookie)
  assert.equal(legacyAdmin.response.status, 307)
  assert.equal(legacyAdmin.response.headers.get('location'), '/admin?tab=categories')
  const signedInHome = (await page('/', owner.cookie)).html
  assert.ok(signedInHome.includes('已登录'))
  assert.ok(signedInHome.includes('owner-e2e@example.invalid'))
  assert.ok(!signedInHome.includes('登录 / 注册'))
  const frontAdminEmail = await signup('admin-e2e@example.invalid')
  const outsider = await signup('outsider-e2e@example.invalid')
  await bootstrap.query('UPDATE ai_directory_users SET role = $1 WHERE id = $2', ['admin', frontAdminEmail.user.id])
  assert.equal((await page('/admin', frontAdminEmail.cookie)).response.status, 307)
  const credentials = { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin-e2e@example.invalid', password }) }
  const loginResponse = await fetch(origin + '/api/admin-auth/sign-in/email', credentials)
  assert.equal(loginResponse.status, 200)
  const admin = { cookie: cookie(loginResponse) }
  assert.ok(admin.cookie.includes('ai-tools-admin'))
  assert.ok(!admin.cookie.includes('ai-directory.'))
  assert.equal((await page('/account', admin.cookie)).response.status, 307)
  assert.ok((await page('/', admin.cookie)).html.includes('登录 / 注册'))
  assert.equal((await fetch(origin + '/api/admin-auth/sign-up/email', credentials)).status, 404)
  const frontendOnlyAdminLogin = await fetch(origin + '/api/admin-auth/sign-in/email', { ...credentials, body: JSON.stringify({ email: 'owner-e2e@example.invalid', password }) })
  assert.equal(frontendOnlyAdminLogin.status, 401)
  assert.ok(!(await page('/account', owner.cookie)).html.includes('分类管理'))
  assert.ok((await page('/admin', admin.cookie)).html.includes('分类管理'))
  assert.ok(!(await page('/account', admin.cookie)).html.includes('后台管理导航'))
  checks.push('independent admin login, guest redirect, ordinary-user denial and legacy redirect')
  checks.push('email registration, session and admin navigation')

  stage = 'user-management'
  for (const backend of [false, true]) {
    const tab = backend ? 'admins' : 'users'
    const base = `/admin?tab=${tab}`
    const email = `managed-e2e-${tab}@example.invalid`
    const userTable = backend ? 'admin_user' : 'ai_directory_users'
    const api = backend ? '/api/admin-auth' : '/api/auth'
    const list = (await page(base, admin.cookie)).html
    assert.ok(list.includes('<table'))
    assert.ok(list.includes(`aria-label="${backend ? '后端用户' : '前端用户'}分页"`))
    assert.equal((await page(base, owner.cookie)).response.status, 307)
    redirected(await postForm(`${base}&new=1`, admin.cookie, html => html.includes('name="password"'), { name: '用户管理测试', email, password, isEnabled: 'on' }))
    const record = (await bootstrap.query(`SELECT id FROM ${userTable} WHERE email = $1`, [email])).rows[0]
    assert.ok(record)
    async function loginManaged(pass = password) {
      const response = await fetch(origin + api + '/sign-in/email', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) })
      return { response, cookie: cookie(response) }
    }
    const signed = await loginManaged()
    assert.equal(signed.response.status, 200)
    assert.equal((await page(backend ? '/admin' : '/account', signed.cookie)).response.status, 200)
    const filtered = (await page(`${base}&q=${email}&status=enabled&page=999`, admin.cookie)).html
    assert.ok(filtered.includes(`edit=${record.id}`))
    const edit = `${base}&edit=${record.id}`
    redirected(await postForm(edit, admin.cookie, html => html.includes('name="password"'), { name: '已修改用户', email, password: password + '-reset', isEnabled: 'on' }))
    assert.equal((await page(backend ? '/admin' : '/account', signed.cookie)).response.status, 307)
    const reset = await loginManaged(password + '-reset')
    assert.equal(reset.response.status, 200)
    redirected(await postForm(base, admin.cookie, html => hasInput(html, 'id', record.id) && hasInput(html, 'intent', 'disabled'), { expected: 'true', intent: 'disabled' }))
    assert.equal((await page(backend ? '/admin' : '/account', reset.cookie)).response.status, 307)
    assert.ok((await page(`${base}&q=${email}&status=disabled`, admin.cookie)).html.includes(`edit=${record.id}`))
    redirected(await postForm(base, admin.cookie, html => hasInput(html, 'id', record.id) && hasInput(html, 'intent', 'enabled'), { expected: 'false', intent: 'enabled' }))
    const unconfirmed = await postForm(base, admin.cookie, html => hasInput(html, 'id', record.id) && hasInput(html, 'intent', 'delete'), {})
    assert.equal(unconfirmed.status, 200)
    assert.equal((await bootstrap.query(`SELECT id FROM ${userTable} WHERE id = $1`, [record.id])).rowCount, 1)
    if (backend) {
      await postForm(base, admin.cookie, html => hasInput(html, 'id', record.id) && hasInput(html, 'intent', 'delete'), { id: 'isolated-admin', confirmDelete: 'yes' })
      assert.equal((await page('/admin', admin.cookie)).response.status, 200)
    }
    redirected(await postForm(base, admin.cookie, html => hasInput(html, 'id', record.id) && hasInput(html, 'intent', 'delete'), { confirmDelete: 'yes' }))
    assert.equal((await bootstrap.query(`SELECT id FROM ${userTable} WHERE id = $1`, [record.id])).rowCount, 0)
    assert.ok((await page(edit, admin.cookie)).html.includes('账号不存在'))
  }
  checks.push('frontend users and backend administrators: lists, filters, forms, create, edit, password reset, session revocation, enable/disable, confirmed deletion and access isolation')

  stage = 'category-management'
  const category = { id: 'e2e-category', name: '端到端测试分类', short: '测试', description: '临时测试分类', iconKey: 'Sparkles', sortOrder: '5', isEnabled: 'on' }
  redirected(await postForm('/admin?tab=categories&new=1', admin.cookie, html => html.includes('新增分类'), category))
  const categoryList = (await page('/admin?tab=categories', admin.cookie)).html
  assert.ok(categoryList.includes('<table'))
  assert.ok(categoryList.includes('aria-label="分类管理分页"'))
  assert.ok(categoryList.includes('name="pageSize"'))
  const categorySecondPage = (await page('/admin?tab=categories&q=AI&status=enabled&pageSize=10&page=2', admin.cookie)).html
  assert.ok(categorySecondPage.replace(/<!--.*?-->/g, '').includes('第 2 / 2 页'))
  assert.ok(categorySecondPage.includes('q=AI&amp;status=enabled'))
  const categoryLargerPage = (await page('/admin?tab=categories&pageSize=20', admin.cookie)).html
  assert.ok(categoryLargerPage.replace(/<!--.*?-->/g, '').includes('第 1 / 1 页'))
  assert.ok(categoryList.includes(`edit=${category.id}`))
  assert.ok(categoryList.includes('AI 工具'))
  assert.ok(!categoryList.includes('工具管理、上下架'))
  assert.ok((await page('/admin?tab=categories&q=does-not-match', admin.cookie)).html.includes('没有符合查询条件的分类'))
  assert.ok((await page('/admin?tab=categories&q=e2e-category&status=disabled', admin.cookie)).html.includes('没有符合查询条件的分类'))
  redirected(await postForm(`/admin?tab=categories&edit=${category.id}`, admin.cookie, html => hasInput(html, 'id', category.id), { ...category, description: '更新后的分类说明' }))
  assert.equal((await bootstrap.query('SELECT description FROM ai_directory_categories WHERE id = $1', [category.id])).rows[0].description, '更新后的分类说明')
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
  const adminHtml = (await page('/admin?tab=review', admin.cookie)).html
  const template = [...adminHtml.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(match => match[0]).find(reviewForm)
  assert.ok(template)
  const forged = new FormData()
  for (const [tag] of template.matchAll(/<input\b[^>]*>/g)) { const item = attributes(tag); if (item.type === 'hidden' && item.name) forged.append(item.name, item.value ?? '') }
  forged.set('decision', 'approve')
  const denied = await fetch(origin + '/admin?tab=review', { method: 'POST', headers: { Cookie: owner.cookie, Origin: origin }, body: forged, redirect: 'manual' })
  redirected(denied)
  assert.equal((await bootstrap.query('SELECT status FROM ai_directory_tool_submissions WHERE id = $1', [submission.id])).rows[0].status, 'pending')
  redirected(await postForm('/admin?tab=review', admin.cookie, reviewForm, { decision: 'approve' }))
  assert.equal((await page('/tools/e2e-tool')).response.status, 200)
  assert.equal((await page('/api/tool-media/e2e-tool/logo')).response.status, 200)
  assert.ok((await page('/account', owner.cookie)).html.includes('已通过'))
  checks.push('server action authorization, approval and public detail/media')

  stage = 'rejection-action'
  redirected(await postForm('/account?tab=submit', owner.cookie, html => html.includes('提交审核'), { ...tool, slug: 'e2e-rejected' }))
  const { rows: [rejected] } = await bootstrap.query('SELECT id::text FROM ai_directory_tool_submissions WHERE requested_slug = $1', ['e2e-rejected'])
  redirected(await postForm('/admin?tab=review', admin.cookie, html => hasInput(html, 'id', rejected.id), { decision: 'reject', reason: '请补充功能说明' }))
  assert.ok((await page('/account', owner.cookie)).html.includes('请补充功能说明'))
  assert.equal((await page('/tools/e2e-rejected')).response.status, 404)
  checks.push('rejection reason appears only in private submission history')

  stage = 'tool-management-action'
  const { rows: [formal] } = await bootstrap.query('SELECT id::text FROM ai_directory_tools WHERE slug = $1', [tool.slug])
  redirected(await postForm(`/admin?tab=tools&edit=${formal.id}`, admin.cookie, html => hasInput(html, 'id', formal.id), {
    ...tool, content: '管理员更新后的正式内容', status: 'published', displayOrder: '1', featuredOrder: '0', logoKey: '',
  }))
  assert.ok((await page('/tools/e2e-tool')).html.includes('管理员更新后的正式内容'))
  assert.ok((await page('/account', owner.cookie)).html.includes(tool.content))
  checks.push('tool editor preserves original submission and existing image')

  stage = 'disabled-category'
  redirected(await postForm('/admin?tab=categories', admin.cookie, html => hasInput(html, 'id', category.id), { id: category.id, enabled: 'false', expected: 'true', confirmDisable: 'yes' }))
  assert.ok(!(await page('/')).html.includes(category.name))
  assert.equal((await page('/tools/e2e-tool')).response.status, 404)
  assert.equal((await page('/api/tool-media/e2e-tool/logo')).response.status, 404)
  checks.push('category disabling hides homepage, tool detail and public image')
  redirected(await postForm('/admin?tab=categories', admin.cookie, html => hasInput(html, 'id', category.id), { id: category.id, enabled: 'true', expected: 'false' }))
  assert.ok((await page('/')).html.includes(category.name))
  assert.equal((await page('/tools/e2e-tool')).response.status, 200)
  checks.push('category table, search, status filter, independent create/edit, confirmed disable and re-enable')

  stage = 'direct-publishing-and-unpublish'
  const direct = { ...tool, slug: 'e2e-direct', category: 'image', status: 'published', featuredOrder: '', displayOrder: '0', logoKey: '' }
  redirected(await postForm('/admin?tab=tools&new=1', admin.cookie, html => html.includes('直接收录工具'), direct))
  const { rows: [directRow] } = await bootstrap.query('SELECT id::text FROM ai_directory_tools WHERE slug = $1', [direct.slug])
  assert.equal((await page('/tools/e2e-direct')).response.status, 200)
  const listHtml = (await page('/admin?tab=tools', admin.cookie)).html
  assert.ok(listHtml.includes('<table'))
  assert.ok(listHtml.includes('新增工具'))
  assert.ok(listHtml.includes(`edit=${directRow.id}`))
  const noMatch = (await page('/admin?tab=tools&q=does-not-match-anything', admin.cookie)).html
  assert.ok(noMatch.includes('没有符合查询条件的工具'))
  redirected(await postForm('/admin?tab=tools', admin.cookie, html => hasInput(html, 'id', directRow.id) && hasInput(html, 'intent', 'disabled'), { id: directRow.id, intent: 'disabled', expected: 'published' }))
  assert.equal((await page('/tools/e2e-direct')).response.status, 404)
  redirected(await postForm('/admin?tab=tools', admin.cookie, html => hasInput(html, 'id', directRow.id) && hasInput(html, 'intent', 'published'), { id: directRow.id, intent: 'published', expected: 'disabled' }))
  assert.equal((await page('/tools/e2e-direct')).response.status, 200)
  checks.push('direct admin publishing and unpublishing')

  stage = 'tool-list-delete'
  redirected(await postForm('/admin?tab=tools', admin.cookie, html => hasInput(html, 'id', directRow.id) && hasInput(html, 'intent', 'delete'), { id: directRow.id, intent: 'delete', confirmDelete: 'yes' }))
  assert.equal((await page('/tools/e2e-direct')).response.status, 404)
  assert.ok(!(await page('/admin?tab=tools', admin.cookie)).html.includes(`edit=${directRow.id}`))
  assert.ok((await page(`/admin?tab=tools&edit=${directRow.id}`, admin.cookie)).html.includes('工具不存在、已删除'))
  assert.ok((await bootstrap.query('SELECT deleted_at FROM ai_directory_tools WHERE id = $1', [directRow.id])).rows[0].deleted_at)
  checks.push('table list, independent create/edit forms, query, status actions and confirmed logical deletion')

  stage = 'admin-pagination'
  await bootstrap.query(`INSERT INTO ai_directory_tools (slug, category_id, name, website, summary, content)
    SELECT 'pagination-e2e-' || i, 'image', '分页工具 ' || i, 'https://example.invalid', '分页验证', '隔离测试内容' FROM generate_series(1, 23) i`)
  const pagedTools = (await page('/admin?tab=tools&q=pagination-e2e-&category=image&status=published&pageSize=10&page=2', admin.cookie)).html
  assert.ok(pagedTools.replace(/<!--.*?-->/g, '').includes('第 2 / 3 页'))
  assert.ok(pagedTools.includes('aria-label="AI 工具分页"'))
  assert.ok(pagedTools.includes('category=image'))
  assert.ok(pagedTools.includes('name="page"'))
  const clampedTools = (await page('/admin?tab=tools&q=pagination-e2e-&pageSize=20&page=999', admin.cookie)).html
  assert.ok(clampedTools.replace(/<!--.*?-->/g, '').includes('第 2 / 2 页'))
  const emptyTools = (await page('/admin?tab=tools&q=no-such-pagination-item&page=999', admin.cookie)).html
  assert.ok(emptyTools.replace(/<!--.*?-->/g, '').includes('第 1 / 1 页'))
  checks.push('both admin pagers, selectable sizes, filter preservation, page links, jump forms and range clamping')
  stage = 'self-password-reset'
  // Reset only the isolated fixture's login budget before the separate logout scenario.
  await bootstrap.query('DELETE FROM admin_rate_limit')
  redirected(await postForm('/admin?tab=admins&edit=isolated-admin', admin.cookie, html => html.includes('name="password"'), { name: '管理员', email: 'admin-e2e@example.invalid', password, isEnabled: 'on' }))
  assert.equal((await page('/admin', admin.cookie)).response.status, 307)
  const selfLogin = await fetch(origin + '/api/admin-auth/sign-in/email', credentials)
  assert.equal(selfLogin.status, 200)
  admin.cookie = cookie(selfLogin)
  checks.push('missing delete confirmation and forged self deletion denied; own password reset revokes previous admin session')
  stage = 'logout'
  const bothCookies = `${admin.cookie}; ${owner.cookie}`
  assert.equal((await page('/account', bothCookies)).response.status, 200)
  assert.equal((await page('/admin', bothCookies)).response.status, 200)
  redirected(await postForm('/admin', bothCookies, html => html.includes('退出后台'), {}))
  assert.equal((await page('/admin', bothCookies)).response.status, 307)
  assert.equal((await page('/account', bothCookies)).response.status, 200)
  // Re-login admin, then prove frontend sign-out does not revoke the backend session.
  const adminAgain = await fetch(origin + '/api/admin-auth/sign-in/email', credentials)
  assert.equal(adminAgain.status, 200)
  const updatedBoth = `${cookie(adminAgain)}; ${owner.cookie}`
  redirected(await postForm('/account?tab=profile', updatedBoth, html => html.includes('退出登录'), {}))
  assert.equal((await page('/account', owner.cookie)).response.status, 307)
  assert.equal((await page('/admin', updatedBoth)).response.status, 200)
  await bootstrap.query(`UPDATE admin_user SET "isEnabled" = false WHERE id = 'isolated-admin'`)
  assert.equal((await page('/admin', updatedBoth)).response.status, 307)
  const signedOutHome = (await page('/', owner.cookie)).html
  assert.ok(signedOutHome.includes('登录 / 注册'))
  assert.ok(!signedOutHome.includes('class="account-email"'))
  checks.push('logout server action revokes protected page access')
  checks.push('independent admin_user, APIs, cookies and sessions; frontend and backend logout isolation; disabled admin denial')
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
