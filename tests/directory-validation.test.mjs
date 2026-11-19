import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validRecordId, pageNumber, websiteUrl } from '../lib/catalog.ts'
import { parseToolForm, parseCategoryForm, parseToolManagement } from '../lib/directory-validation.ts'

const form = value => { const data = new FormData(); for (const [key, text] of Object.entries(value)) data.set(key, text); return data }
const tool = { slug: 'test-tool', name: '测试工具', category: 'writing', website: 'https://example.com', summary: '测试摘要', content: '测试内容' }

test('tool validation normalizes URL and rejects unsafe or incomplete input', () => {
  assert.equal(parseToolForm(form(tool)).website, 'https://example.com/')
  for (const fields of [{ website: 'javascript:alert(1)' }, { website: 'https://user:password@example.com' }, { category: '../../etc' }, { slug: 'bad_slug' }, { content: ' ' }, { name: 'x'.repeat(91) }]) {
    assert.equal(parseToolForm(form({ ...tool, ...fields })), null)
  }
  assert.equal(websiteUrl('file:///etc/passwd'), null)
})

test('category validation restricts IDs, icons and sort values', () => {
  const category = { id: 'test-category', name: '测试分类', short: '测试', description: '', iconKey: 'Sparkles', sortOrder: '0', isEnabled: 'on' }
  assert.equal(parseCategoryForm(form(category)).isEnabled, true)
  for (const fields of [{ id: 'home' }, { id: 'latest' }, { iconKey: '../../secret' }, { sortOrder: '-1' }, { sortOrder: '1.5' }]) {
    assert.equal(parseCategoryForm(form({ ...category, ...fields })), null)
  }
})

test('tool management validates IDs, orders, state and brands', () => {
  const value = { ...tool, status: 'published', displayOrder: '0', featuredOrder: '', logoKey: '' }
  assert.equal(parseToolManagement(form(value)).featuredOrder, null)
  for (const fields of [{ id: '9223372036854775808' }, { status: 'pending' }, { displayOrder: '-1' }, { featuredOrder: '2147483648' }, { logoKey: '../escape' }]) {
    assert.equal(parseToolManagement(form({ ...value, ...fields })), null)
  }
})

test('record IDs preserve bigint precision and page parameters are bounded', () => {
  assert.equal(validRecordId('9223372036854775807'), true)
  for (const id of ['0', '-1', '01', '1e3', '9223372036854775808', 'hello']) assert.equal(validRecordId(id), false)
  assert.equal(pageNumber('-2'), 1)
  assert.equal(pageNumber('999999'), 100000)
  assert.equal(pageNumber('2'), 2)
})
