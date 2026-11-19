import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adminPagination, adminPageSize } from '../lib/admin-pagination.ts'

test('admin pagination supports only bounded page sizes', () => {
  for (const size of [10, 20, 50, 100]) assert.equal(adminPageSize(String(size)), size)
  for (const size of [undefined, '-1', '0', '100000', 'abc']) assert.equal(adminPageSize(size), 10)
})

test('admin pagination clamps pages and handles empty, single and last pages', () => {
  assert.deepEqual(adminPagination(0, 99), { total: 0, page: 1, pageSize: 10, totalPages: 1, offset: 0, hasNext: false })
  assert.equal(adminPagination(17, 1).hasNext, true)
  assert.deepEqual(adminPagination(25, 999, 10), { total: 25, page: 3, pageSize: 10, totalPages: 3, offset: 20, hasNext: false })
  assert.equal(adminPagination(25, 2, 20).offset, 20)
  assert.equal(adminPagination(17, -5, 20).page, 1)
})
