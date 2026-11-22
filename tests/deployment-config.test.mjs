import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {productionOrigin, runtimeConfig, rawEnv, sshSettings, mediaManifest} from '../deploy/setup-production.mjs'

const credentials = {DATABASE_URL: 'postgresql://site:p%40ss%24word@43.143.85.207:6543/ai-tools?options=-c%20search_path%3Dai-tools&sslmode=no-verify', BETTER_AUTH_SECRET: 'a'.repeat(48)}

test('setup preserves encoded credentials and schema options when routing internally', () => {
  const config = runtimeConfig(credentials, 'https://tools.example.com/')
  const url = new URL(config.DATABASE_URL)
  assert.equal(url.hostname, 'postgresql')
  assert.equal(url.port, '5432')
  assert.equal(url.password, 'p%40ss%24word')
  assert.equal(url.searchParams.get('options'), '-c search_path=ai-tools')
  assert.equal(url.searchParams.has('sslmode'), false)
  assert.equal(config.DB_TLS_IDENTITY, '43.143.85.207')
  assert.equal(config.BETTER_AUTH_SECRET, credentials.BETTER_AUTH_SECRET)
})

test('setup accepts HTTPS or HTTP IP preview and rejects unsafe origins', () => {
  for (const value of ['http://example.com', 'https://localhost', 'https://example.com/path', 'https://user:secret@example.com', 'https://example.com?token=secret']) assert.throws(() => productionOrigin(value))
  assert.equal(productionOrigin('https://tools.example.com:443/'), 'https://tools.example.com')
  assert.equal(productionOrigin('http://43.143.85.207/'), 'http://43.143.85.207')
  assert.equal(productionOrigin('http://43.143.85.207:8080/'), 'http://43.143.85.207:8080')
  for (const value of ['http://127.0.0.2', 'http://0.0.0.0', 'http://[::1]', 'http://43.143.85.207/path', 'ftp://43.143.85.207']) assert.throws(() => productionOrigin(value))
})

test('raw env preserves dollar signs and quotes but rejects injected configuration lines', () => {
  assert.equal(rawEnv({BETTER_AUTH_SECRET: 'a$literal"quote'}), 'BETTER_AUTH_SECRET=a$literal"quote\n')
  for (const value of ['safe\nINJECTED=1', 'safe\rINJECTED=1', 'safe\0']) assert.throws(() => rawEnv({BETTER_AUTH_SECRET: value}))
})

test('invalid database errors do not echo credentials', () => {
  const marker = 'do-not-print-this-password'
  let failure
  try { runtimeConfig({DATABASE_URL: marker}, 'https://tools.example.com') } catch (error) { failure = error }
  assert.ok(failure)
  assert.ok(!failure.message.includes(marker))
})

test('SSH destination rejects shell options and command injection', () => {
  for (const options of [{host: '-oProxyCommand=oops'}, {host: 'host;echo'}, {user: 'ubuntu;echo'}, {port: '22;echo'}, {port: '65536'}]) assert.throws(() => sshSettings(options))
  assert.equal(sshSettings({host: '43.143.85.207', user: 'ubuntu', port: '22'}).host, '43.143.85.207')
})

test('media import hashes exact file content and rejects newline filenames', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-tools-media-manifest-'))
  try {
    await mkdir(join(dir, 'public'))
    await writeFile(join(dir, 'public', 'example.webp'), 'sample-image-bytes')
    const hash = createHash('sha256').update('sample-image-bytes').digest('hex')
    assert.equal(await mediaManifest(dir), `${hash}  public/example.webp\n`)
    await writeFile(join(dir, 'public', 'unexpected name.webp'), 'sample')
    await assert.rejects(mediaManifest(dir), /文件名/)
  } finally { await rm(dir, {recursive: true, force: true}) }
})

test('HTTP IP preview does not change strict database TLS identity', () => {
  const config = runtimeConfig(credentials, 'http://43.143.85.207')
  assert.equal(config.BETTER_AUTH_URL, 'http://43.143.85.207')
  assert.equal(config.DB_TLS_IDENTITY, '43.143.85.207')
  assert.equal(new URL(config.DATABASE_URL).hostname, 'postgresql')
})
