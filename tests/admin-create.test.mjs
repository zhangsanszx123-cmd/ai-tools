import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adminCreationError, validateAdminCredentials } from '../scripts/admin-create-errors.mjs'

test('admin credentials distinguish short, long, mismatched passwords and invalid emails', () => {
  for (const [email, password, confirmation, code] of [
    ['admin@example.invalid', 'short', 'short', 'PASSWORD_TOO_SHORT'],
    ['admin@example.invalid', 'a'.repeat(129), 'a'.repeat(129), 'PASSWORD_TOO_LONG'],
    ['admin@example.invalid', 'a'.repeat(12), 'b'.repeat(12), 'PASSWORD_MISMATCH'],
    ['not-an-email', 'a'.repeat(12), 'a'.repeat(12), 'INVALID_EMAIL'],
  ]) assert.throws(() => validateAdminCredentials(email, password, confirmation), { message: code })
  assert.doesNotThrow(() => validateAdminCredentials('admin@example.invalid', 'a'.repeat(12), 'a'.repeat(12)))
})

test('safe diagnostics recognize API errors and wrapped database errors without printing secrets', () => {
  assert.equal(adminCreationError({ body: { code: 'USER_ALREADY_EXISTS' } }).code, 'USER_ALREADY_EXISTS')
  assert.equal(adminCreationError(new Error('private SQL', { cause: { code: '42P01' } })).code, '42P01')
  const secret = 'must-never-appear-in-output'
  assert.ok(!JSON.stringify(adminCreationError(new Error(secret))).includes(secret))
  const cyclic = { code: secret }; cyclic.cause = cyclic
  assert.equal(adminCreationError(cyclic).code, 'UNKNOWN')
})
