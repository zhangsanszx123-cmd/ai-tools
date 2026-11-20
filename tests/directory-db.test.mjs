import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { readMediaFile } from '../lib/media-files.ts'
import { parseEnv } from 'node:util'
import { Pool, Client } from 'pg'
import sharp from 'sharp'
import { postgresConfig } from '../lib/postgres-config.ts'
import { createDirectoryStore } from '../lib/directory-store.ts'

// Real PostgreSQL tests run only in a unique, disposable schema. Business rows and auth roles are untouched.
const mediaTestRoot = mkdtempSync(join(tmpdir(), 'dir-media-test-'))
process.env.MEDIA_STORAGE_DIR = mediaTestRoot
const values = {}
for (const file of ['.env', '.env.local']) if (existsSync(file)) Object.assign(values, parseEnv(readFileSync(file, 'utf8')))
for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value
const schema = `dir_test_${randomBytes(8).toString('hex')}`
const config = postgresConfig()
let pool, store, logo, created = false
const admin = 'test-admin', owner = 'test-owner', other = 'test-other'
let serial = 0
const input = (slug, category = 'writing') => ({ slug, category, name: '测试工具', website: 'https://example.invalid/', summary: '测试摘要', content: '原始投稿内容', logoData: logo, coverData: null })
const managed = (value, fields = {}) => ({ ...value, status: 'published', displayOrder: 0, featuredOrder: null, logoKey: null, removeLogo: false, removeCover: false, ...fields })
const slug = () => `test-tool-${++serial}`

before(async () => {
  const bootstrap = new Client(config)
  await bootstrap.connect()
  try {
    assert.match(schema, /^dir_test_[a-f0-9]{16}$/)
    await bootstrap.query(`CREATE SCHEMA "${schema}"`)
    created = true
    await bootstrap.query(`CREATE TABLE "${schema}".ai_directory_users (LIKE "ai-tools".ai_directory_users INCLUDING ALL)`)
    const sql = readFileSync('db/directory-v2.sql', 'utf8').replaceAll('"ai-tools"', `"${schema}"`).replaceAll("'ai-tools'", `'${schema}'`)
    await bootstrap.query(sql)
    await bootstrap.query(`SET search_path = "${schema}", public`)
    await bootstrap.query(readFileSync('db/auth-schema.sql', 'utf8'))
    await bootstrap.query(readFileSync('db/admin-auth.sql', 'utf8'))
    await bootstrap.query(readFileSync('db/admin-audit-migration.sql', 'utf8'))
    await bootstrap.query(readFileSync('db/media-storage.sql', 'utf8'))
    pool = new Pool({ ...config, max: 8, options: `-c search_path=${schema},public` })
    store = createDirectoryStore(pool)
    for (const [id, role] of [[admin, 'admin'], [owner, 'user'], [other, 'user']]) {
      await pool.query(`INSERT INTO ai_directory_users (id, name, email, "emailVerified", role) VALUES ($1, $1, $2, false, $3)`, [id, `${id}@example.invalid`, role])
    }
    await pool.query(`INSERT INTO admin_user (id, name, email, "emailVerified") VALUES ($1, $1, $2, false)`, [admin, `${admin}@example.invalid`])
    logo = await sharp({ create: { width: 3, height: 3, channels: 3, background: '#633bdb' } }).webp().toBuffer()
  } finally { await bootstrap.end() }
})

after(async () => {
  assert.equal(dirname(resolve(mediaTestRoot)), resolve(tmpdir()))
  assert.ok(basename(mediaTestRoot).startsWith('dir-media-test-'))
  await rm(mediaTestRoot, { recursive: true, force: true })
  if (pool) await pool.end()
  if (created && /^dir_test_[a-f0-9]{16}$/.test(schema)) {
    const cleanup = new Client(config)
    await cleanup.connect()
    try { await cleanup.query(`DROP SCHEMA "${schema}" CASCADE`) } finally { await cleanup.end() }
    console.log('Removed isolated directory test schema; production business data unchanged.')
  }
})

test('managed accounts enforce permission, password updates, state checks and history retention', async () => {
  for (const backend of [false, true]) {
    const save = backend ? store.saveManagedAdmin : store.saveManagedUser
    const get = backend ? store.getManagedAdmin : store.getManagedUser
    const list = backend ? store.getManagedAdmins : store.getManagedUsers
    const status = backend ? store.setManagedAdminStatus : store.setManagedUserStatus
    const remove = backend ? store.deleteManagedAdmin : store.deleteManagedUser
    const table = backend ? 'admin_account' : 'ai_directory_accounts'
    const sessionTable = backend ? 'admin_session' : 'ai_directory_sessions'
    const value = { name: '账户测试', email: `managed-${backend}@example.invalid`, isEnabled: true, passwordHash: 'test-hash' }
    assert.equal(await save(owner, value), undefined)
    const record = await save(admin, value)
    assert.ok(record)
    assert.equal(await get(owner, record.id), undefined)
    assert.equal((await list(admin, 999, { query: value.email, pageSize: 20 })).page, 1)
    assert.equal((await list(admin, 1, { query: value.email })).total, 1)
    await pool.query(`INSERT INTO ${sessionTable} (id, token, "userId", "expiresAt", "updatedAt") VALUES ($1, $1, $2, now() + interval '1 day', now())`, [`session-${backend}`, record.id])
    await save(admin, { ...value, id: record.id, name: '修改后', passwordHash: 'new-hash' })
    assert.equal((await pool.query(`SELECT password FROM ${table} WHERE "userId" = $1`, [record.id])).rows[0].password, 'new-hash')
    assert.equal((await pool.query(`SELECT * FROM ${sessionTable} WHERE "userId" = $1`, [record.id])).rowCount, 0)
    await save(admin, { ...value, id: record.id, passwordHash: null })
    assert.equal((await pool.query(`SELECT password FROM ${table} WHERE "userId" = $1`, [record.id])).rows[0].password, 'new-hash')
    await assert.rejects(save(admin, value), { code: '23505' })
    assert.equal(await status(owner, record.id, false, true), undefined)
    assert.ok(await status(admin, record.id, false, true))
    assert.equal(await status(admin, record.id, false, true), undefined)
    assert.equal((await list(admin, 1, { query: value.email, status: 'disabled' })).total, 1)
    assert.ok(await status(admin, record.id, true, false))
    const submission = await store.submitTool(backend ? owner : record.id, input(slug()))
    if (backend) await store.rejectTool(record.id, submission.id, '保留历史')
    assert.equal(await remove(owner, record.id), undefined)
    assert.ok(await remove(admin, record.id))
    assert.equal(await get(admin, record.id), undefined)
    assert.equal((await pool.query(`SELECT * FROM ${table} WHERE "userId" = $1`, [record.id])).rowCount, 0)
    const history = (await pool.query('SELECT submitted_by, reviewed_by_admin FROM ai_directory_tool_submissions WHERE id = $1', [submission.id])).rows[0]
    assert.ok(history)
    assert.equal(backend ? history.reviewed_by_admin : history.submitted_by, null)
  }
  assert.equal(await store.setManagedAdminStatus(admin, admin, false, true), undefined)
  assert.equal(await store.deleteManagedAdmin(admin, admin), undefined)
  assert.equal(await store.saveManagedAdmin(admin, { id: admin, name: 'self', email: 'self@example.invalid', isEnabled: false, passwordHash: null }), undefined)
})

test('media settings require administrator, reject stale changes and resolve URLs without modifying stored paths', async () => {
  assert.equal(await store.getMediaBase(), '/')
  assert.equal(await store.saveMediaBase(owner, 'https://img.example.invalid', '/'), undefined)
  assert.equal(await store.saveMediaBase(admin, 'javascript:alert(1)', '/'), undefined)
  const tool = await store.saveTool(admin, managed(input(slug())))
  const local = await store.getTool(tool.slug)
  assert.match(local.logoUrl, /^\/media\/[a-f0-9]{64}\.webp$/)
  const stored = (await pool.query('SELECT logo_url,logo_data,cover_data FROM ai_directory_tools WHERE id=$1', [tool.id])).rows[0]
  assert.equal(stored.logo_url, local.logoUrl)
  assert.equal(stored.logo_data, null)
  assert.equal(stored.cover_data, null)
  assert.ok(await store.saveMediaBase(admin, 'https://img.example.invalid/assets/', '/'))
  assert.equal((await store.getTool(tool.slug)).logoUrl, 'https://img.example.invalid/assets' + local.logoUrl)
  assert.equal(await store.saveMediaBase(admin, '/', '/'), undefined)
  assert.ok(await store.getPublicMediaByUrl(local.logoUrl))
  assert.ok(await store.saveMediaBase(admin, '/', 'https://img.example.invalid/assets'))
  assert.equal((await store.getTool(tool.slug)).logoUrl, local.logoUrl)
})

test('database categories replace the fixed frontend list', async () => {
  const categories = await store.getCategories()
  assert.equal(categories.length, 17)
  assert.equal(categories[0].id, 'writing')
  assert.equal(categories[0].iconKey, 'PenLine')
})

test('AI tools paginate filtered rows with selectable sizes and clamp out-of-range pages', async () => {
  const prefix = slug() + '-pagination-'
  for (let index = 0; index < 25; index++) await store.saveTool(admin, managed(input(prefix + index)))
  const first = await store.getManagedTools(admin, 1, { query: prefix, pageSize: 10 })
  const second = await store.getManagedTools(admin, 2, { query: prefix, pageSize: 10 })
  const last = await store.getManagedTools(admin, 999, { query: prefix, pageSize: 10 })
  assert.equal(first.total, 25)
  assert.equal(first.items.length, 10)
  assert.equal(first.totalPages, 3)
  assert.equal(second.items.length, 10)
  assert.ok(!first.items.some(row => second.items.some(other => row.id === other.id)))
  assert.equal(last.page, 3)
  assert.equal(last.items.length, 5)
  assert.equal(last.hasNext, false)
  const larger = await store.getManagedTools(admin, 2, { query: prefix, pageSize: 20 })
  assert.equal(larger.totalPages, 2)
  assert.equal(larger.items.length, 5)
  const empty = await store.getManagedTools(admin, 99, { query: prefix, category: 'image', pageSize: 10 })
  assert.equal(empty.total, 0)
  assert.equal(empty.page, 1)
})

test('category row status action checks administrator and expected state without overwriting content', async () => {
  const category = { id: 'row-state-test', name: '状态测试分类', short: '状态测试', description: '保留说明', iconKey: 'Sparkles', sortOrder: 999, isEnabled: true }
  assert.ok(await store.saveCategory(admin, category))
  assert.equal(await store.setCategoryStatus(owner, category.id, false, true), undefined)
  assert.ok(await store.setCategoryStatus(admin, category.id, false, true))
  assert.equal(await store.setCategoryStatus(admin, category.id, true, true), undefined)
  const saved = (await store.getCategories(true)).find(item => item.id === category.id)
  assert.equal(saved.description, category.description)
  assert.equal(saved.isEnabled, false)
  assert.ok(await store.setCategoryStatus(admin, category.id, true, false))
})

test('tool list supports literal search, category/status filters, and full edit lookup', async () => {
  const value = input(slug())
  const tool = await store.saveTool(admin, managed({ ...value, name: 'Query % literal test' }))
  const found = await store.getManagedTools(admin, 1, { query: '% literal', status: 'published', category: 'writing' })
  assert.equal(found.total, 1)
  assert.equal(found.items[0].id, tool.id)
  assert.equal((await store.getManagedTool(admin, tool.id)).content, value.content)
  assert.equal((await store.getManagedTools(owner, 1, { query: '% literal' })).total, 0)
  assert.equal((await store.getManagedTools(admin, 1, { query: '% literal', status: 'disabled' })).total, 0)
  assert.equal((await store.getManagedTools(admin, 1, { query: '% literal', category: 'image' })).total, 0)
})

test('delete preserves audited submissions while hiding tools/media and prevents stale edits or republishing', async () => {
  const value = input(slug())
  const submission = await store.submitTool(owner, value)
  const tool = await store.approveTool(admin, submission.id)
  assert.equal(await store.deleteTool(owner, tool.id), undefined)
  assert.ok(await store.setToolStatus(admin, tool.id, 'disabled', 'published'))
  assert.equal(await store.setToolStatus(admin, tool.id, 'published', 'published'), undefined)
  assert.ok(await store.setToolStatus(admin, tool.id, 'published', 'disabled'))
  assert.ok(await store.deleteTool(admin, tool.id))
  assert.equal(await store.getTool(value.slug), undefined)
  assert.equal(await store.getPublicMedia(value.slug, 'logo'), undefined)
  assert.equal(await store.getManagedTool(admin, tool.id), undefined)
  assert.equal((await store.getManagedTools(admin, 1, { query: value.slug })).total, 0)
  assert.equal(await store.saveTool(admin, managed(value, { id: tool.id })), undefined)
  assert.equal(await store.setToolStatus(admin, tool.id, 'published', 'disabled'), undefined)
  assert.equal(await store.deleteTool(admin, tool.id), undefined)
  const snapshot = (await store.getSubmissionHistory(owner)).items.find(item => item.id === submission.id)
  assert.equal(snapshot.status, 'approved')
  assert.equal(snapshot.publishedSlug, null)
  assert.deepEqual(await readMediaFile((await store.getSubmissionMedia(owner, submission.id, 'logo')).url), logo)
})

test('pending submissions remain private and never enter the formal tool table', async () => {
  const value = input(slug())
  const submission = await store.submitTool(owner, value)
  assert.ok(submission.id)
  assert.equal(await store.getTool(value.slug), undefined)
  assert.equal(await store.getPublicMedia(value.slug, 'logo'), undefined)
  assert.deepEqual(await readMediaFile((await store.getSubmissionMedia(owner, submission.id, 'logo')).url), logo)
  assert.equal(await store.getSubmissionMedia(admin, submission.id, 'logo'), undefined)
  assert.ok(await store.getSubmissionMedia(null, submission.id, 'logo', admin))
  assert.equal(await store.getSubmissionMedia(other, submission.id, 'logo'), undefined)
  assert.ok((await store.getSubmissionHistory(owner)).items.some(item => item.id === submission.id))
  assert.ok(!(await store.getSubmissionHistory(other)).items.some(item => item.id === submission.id))
  await assert.rejects(store.submitTool(owner, value), error => error.code === '23505')
})

test('ordinary users cannot review, maintain categories or directly publish', async () => {
  const value = input(slug())
  const submission = await store.submitTool(owner, value)
  assert.equal(await store.approveTool(owner, submission.id), undefined)
  assert.equal(await store.rejectTool(other, submission.id, 'unauthorized'), undefined)
  assert.equal((await store.getReviewQueue(owner)).items.length, 0)
  assert.equal(await store.saveCategory(owner, { id: 'forbidden', name: 'Forbidden', short: 'X', description: '', iconKey: 'Sparkles', sortOrder: 1, isEnabled: true }), undefined)
  assert.equal(await store.saveTool(owner, managed(input(slug()))), undefined)
})

test('concurrent approval creates exactly one tool and retains the submission snapshot', async () => {
  const value = input(slug())
  const submission = await store.submitTool(owner, value)
  const results = await Promise.all([store.approveTool(admin, submission.id), store.approveTool(admin, submission.id)])
  assert.equal(results.filter(Boolean).length, 1)
  const tool = await store.getTool(value.slug)
  assert.ok(tool)
  const { rows } = await pool.query('SELECT count(*)::int AS count FROM ai_directory_tools WHERE slug = $1', [value.slug])
  assert.equal(rows[0].count, 1)
  const history = (await store.getSubmissionHistory(owner)).items.find(item => item.id === submission.id)
  assert.equal(history.status, 'approved')
  assert.equal(history.publishedSlug, value.slug)
  assert.equal(await store.rejectTool(admin, submission.id, 'too late'), undefined)
})

test('conflicting slugs roll back publishing and leave the losing submission pending', async () => {
  const value = input(slug())
  const first = await store.submitTool(owner, value), second = await store.submitTool(other, value)
  await store.approveTool(admin, first.id)
  await assert.rejects(store.approveTool(admin, second.id), error => error.code === '23505')
  const { rows: [remaining] } = await pool.query('SELECT status, published_tool_id FROM ai_directory_tool_submissions WHERE id = $1', [second.id])
  assert.equal(remaining.status, 'pending')
  assert.equal(remaining.published_tool_id, null)
})

test('rejection requires a reason and resubmission preserves rejected history', async () => {
  const value = input(slug()), submission = await store.submitTool(owner, value)
  await assert.rejects(store.rejectTool(admin, submission.id, ''), error => error.code === '23514')
  assert.ok(await store.rejectTool(admin, submission.id, '请补充产品介绍'))
  assert.equal(await store.getTool(value.slug), undefined)
  const again = await store.submitTool(owner, value)
  assert.notEqual(again.id, submission.id)
  const history = (await store.getSubmissionHistory(owner)).items.find(item => item.id === submission.id)
  assert.equal(history.status, 'rejected')
  assert.equal(history.rejectionReason, '请补充产品介绍')
})

test('editing and unpublishing a tool leaves original submission content and images intact', async () => {
  const value = input(slug()), submission = await store.submitTool(owner, value)
  const approved = await store.approveTool(admin, submission.id)
  const before = await store.getTool(value.slug)
  assert.ok(await store.saveTool(admin, managed(value, { id: approved.id, content: '新的正式内容', logoData: null, removeLogo: true, featuredOrder: 0 })))
  const after = await store.getTool(value.slug)
  assert.equal(after.content, '新的正式内容')
  assert.equal(after.hasLogo, false)
  assert.equal(after.publishedAt, before.publishedAt)
  const history = (await store.getSubmissionHistory(owner)).items.find(item => item.id === submission.id)
  assert.equal(history.content, value.content)
  assert.deepEqual(await readMediaFile((await store.getSubmissionMedia(owner, submission.id, 'logo')).url), logo)
  await store.saveTool(admin, managed(value, { id: approved.id, status: 'disabled' }))
  assert.equal(await store.getTool(value.slug), undefined)
  assert.equal(await store.getPublicMedia(value.slug, 'logo'), undefined)
  assert.equal((await store.getSubmissionHistory(owner)).items.find(item => item.id === submission.id).publishedSlug, null)
})

test('disabled categories disappear from public queries and cannot receive or approve submissions', async () => {
  const category = { id: 'test-category', name: '测试分类', short: '测试', description: '', iconKey: 'Sparkles', sortOrder: 1, isEnabled: true }
  await store.saveCategory(admin, category)
  const value = input(slug(), category.id), pending = await store.submitTool(owner, value)
  const direct = await store.saveTool(admin, managed(input(slug(), category.id)))
  await store.saveCategory(admin, { ...category, isEnabled: false })
  assert.ok(!(await store.getCategories()).some(item => item.id === category.id))
  assert.ok((await store.getCategories(true)).some(item => item.id === category.id))
  assert.ok(!(await store.getCatalog()).some(item => item.id === direct.id))
  assert.equal(await store.getTool(direct.slug), undefined)
  assert.equal(await store.getPublicMedia(direct.slug, 'logo'), undefined)
  assert.equal(await store.submitTool(owner, input(slug(), category.id)), undefined)
  assert.equal(await store.approveTool(admin, pending.id), undefined)
  assert.ok((await store.getReviewQueue(admin)).items.some(item => item.id === pending.id))
})

test('approval and rejection races have only one terminal outcome', async () => {
  const value = input(slug()), submission = await store.submitTool(owner, value)
  const results = await Promise.all([store.approveTool(admin, submission.id), store.rejectTool(admin, submission.id, '审核意见')])
  assert.equal(results.filter(Boolean).length, 1)
  const { rows: [row] } = await pool.query('SELECT status FROM ai_directory_tool_submissions WHERE id = $1', [submission.id])
  assert.ok(['approved', 'rejected'].includes(row.status))
  assert.equal(Boolean(await store.getTool(value.slug)), row.status === 'approved')
})

test('moderation and history pagination preserve access to older records', async () => {
  const ids = []
  for (let index = 0; index < 22; index++) ids.push((await store.submitTool(other, input(slug()))).id)
  const first = await store.getSubmissionHistory(other, 1), second = await store.getSubmissionHistory(other, 2)
  assert.equal(first.items.length, 20)
  assert.equal(first.hasNext, true)
  assert.ok(second.items.length > 0)
  assert.equal(first.items.some(item => second.items.some(next => next.id === item.id)), false)
  assert.ok((await store.getReviewQueue(admin, 1)).hasNext)
})

test('admin overview and managed tool media enforce admin check and support disabled tools', async () => {
  assert.equal(await store.getAdminOverview(owner), undefined)
  const before = await store.getAdminOverview(admin)
  assert.ok(before && typeof before.pendingSubmissions === 'number')
  const disabledTool = await store.saveTool(admin, managed(input(slug()), { status: 'disabled' }))
  const featuredTool = await store.saveTool(admin, managed(input(slug()), { status: 'published', featuredOrder: 1 }))
  assert.equal(await store.getManagedToolMedia(owner, disabledTool.id, 'logo'), undefined)
  assert.deepEqual(await readMediaFile((await store.getManagedToolMedia(admin, disabledTool.id, 'logo')).url), logo)
  const after = await store.getAdminOverview(admin)
  assert.equal(after.disabledTools, before.disabledTools + 1)
  assert.equal(after.publishedTools, before.publishedTools + 1)
  assert.equal(after.featuredTools, before.featuredTools + 1)
  await store.deleteTool(admin, disabledTool.id)
  assert.equal(await store.getManagedToolMedia(admin, disabledTool.id, 'logo'), undefined)
  assert.equal((await store.getAdminOverview(admin)).disabledTools, before.disabledTools)
})
