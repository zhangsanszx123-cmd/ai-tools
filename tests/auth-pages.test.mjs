import assert from 'node:assert/strict'
import { test } from 'node:test'

// Start the app first. These requests never submit forms or create real users.
const origin = process.env.AUTH_TEST_ORIGIN || 'http://localhost:3000'

test('login page serves an enabled email/password form', async () => {
  const response = await fetch(`${origin}/login`)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /type="email"/)
  assert.match(html, /name="password"/)
  assert.match(html, /autocomplete="current-password"/i)
  assert.match(html, /显示密码/)
  assert.ok(!html.includes('登录服务尚未配置'))
  assert.ok(!html.includes('name="confirmPassword"'))
})

test('signup page omits nickname and includes password confirmation and contextual navigation', async () => {
  const response = await fetch(`${origin}/login?mode=signup&next=submit`)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.ok(!html.includes('name="name"'))
  assert.match(html, /name="confirmPassword"/)
  assert.match(html, /autocomplete="new-password"/i)
  assert.match(html, /href="\/login\?next=submit"/)
})

test('account page redirects unauthenticated visitors and retains submission destination', async () => {
  for (const [path, destination] of [['/account', '/login'], ['/account?tab=submit', '/login?next=submit']]) {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' })
    assert.equal(response.status, 307)
    assert.equal(new URL(response.headers.get('location'), origin).pathname + new URL(response.headers.get('location'), origin).search, destination)
  }
})
