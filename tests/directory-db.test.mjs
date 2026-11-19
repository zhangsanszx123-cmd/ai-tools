import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { Pool, Client } from 'pg'
import sharp from 'sharp'
import { postgresConfig } from '../lib/postgres-config.ts'
import { createDirectoryStore } from '../lib/directory-store.ts'

// Real PostgreSQL tests run only in a unique, disposable schema. Business rows and auth roles are untouched.
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
    pool = new Pool({ ...config, max: 8, options: `-c search_path=${schema},public` })
    store = createDirectoryStore(pool)
    for (const [id, role] of [[admin, 'admin'], [owner, 'user'], [other, 'user']]) {
      await pool.query(`INSERT INTO ai_directory_users (id, name, email, "emailVerified", role) VALUES ($1, $1, $2, false, $3)`, [id, `${id}@example.invalid`, role])
    }
    logo = await sharp({ create: { width: 3, height: 3, channels: 3, background: '#633bdb' } }).webp().toBuffer()
  } finally { await bootstrap.end() }
})

after(async () => {
  if (pool) await pool.end()
  if (created && /^dir_test_[a-f0-9]{16}$/.test(schema)) {
    const cleanup = new Client(config)
    await cleanup.connect()
    try { await cleanup.query(`DROP SCHEMA "${schema}" CASCADE`) } finally { await cleanup.end() }
    console.log('Removed isolated directory test schema; production business data unchanged.')
  }
})

test('database categories replace the fixed frontend list', async () => {
  const categories = await store.getCategories()
  assert.equal(categories.length, 17)
  assert.equal(categories[0].id, 'writing')
  assert.equal(categories[0].iconKey, 'PenLine')
})

test('pending submissions remain private and never enter the formal tool table', async () => {
  const value = input(slug())
  const submission = await store.submitTool(owner, value)
  assert.ok(submission.id)
  assert.equal(await store.getTool(value.slug), undefined)
  assert.equal(await store.getPublicMedia(value.slug, 'logo'), undefined)
  assert.deepEqual((await store.getSubmissionMedia(owner, submission.id, 'logo')).data, logo)
  assert.ok(await store.getSubmissionMedia(admin, submission.id, 'logo'))
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
  assert.deepEqual((await store.getSubmissionMedia(owner, submission.id, 'logo')).data, logo)
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
