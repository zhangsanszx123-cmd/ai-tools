import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rankHomepageCategory, selectHomepageTools } from '../lib/homepage-curation.ts'

const tools = [
  { id: '1', name: 'New unknown tool', category: 'chat' },
  { id: '2', name: 'ChatGPT', category: 'chat' },
  { id: '3', name: 'Claude', category: 'chat' },
  { id: '4', name: 'ChatGPT', category: 'code' },
]

test('homepage follows editorial order without promoting unselected or unavailable tools', () => {
  assert.deepEqual(selectHomepageTools(tools, ['Claude', 'Missing tool', 'ChatGPT']).map(tool => tool.id), ['3', '2'])
  assert.deepEqual(selectHomepageTools(tools, ['Missing tool']), [])
})

test('category selections cannot pull a namesake from a different category or repeat a tool', () => {
  assert.deepEqual(selectHomepageTools(tools, ['ChatGPT', 'ChatGPT', 'Claude'], 'code').map(tool => tool.id), ['4'])
})

test('homepage selection preserves the full catalog for search and category pages', () => {
  const original = structuredClone(tools)
  selectHomepageTools(tools, ['Claude', 'ChatGPT'])
  assert.deepEqual(tools, original)
})

test('category previews take the first 30 by backend order without trimming the full catalog', () => {
  const catalog = Array.from({ length: 40 }, (_, index) => ({ id: String(index), name: `Tool ${index}`, category: 'chat', displayOrder: 39 - index }))
  catalog[35].name = 'ChatGPT'
  catalog[35].displayOrder = 99
  const ranked = rankHomepageCategory(catalog, 'chat')
  assert.equal(ranked[0].name, 'Tool 39')
  assert.equal(ranked.length, 30)
  assert.equal(new Set(ranked.map(tool => tool.id)).size, 30)
  assert.deepEqual(ranked.map(tool => tool.displayOrder), catalog.map(tool => tool.displayOrder).sort((a, b) => a - b).slice(0, 30))
  assert.equal(catalog.length, 40)
  assert.equal(catalog[0].name, 'Tool 0')
})

test('small and empty categories display available tools without padding', () => {
  assert.equal(rankHomepageCategory([{ id: '1', name: 'Only tool', category: 'chat', displayOrder: 0 }], 'chat').length, 1)
  assert.deepEqual(rankHomepageCategory([], 'chat'), [])
})
