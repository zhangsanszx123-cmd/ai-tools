import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, basename } from 'node:path'
import sharp from 'sharp'
import { normalizeMediaBase, resolveMediaUrl } from '../lib/media-url.ts'
import { writeMediaFile, readMediaFile, publishMediaFile, mediaFilePath } from '../lib/media-files.ts'

const root = await mkdtemp(join(tmpdir(), 'media-unit-'))
process.env.MEDIA_STORAGE_DIR = root
const pixel = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#3366aa' } }).webp().toBuffer()
after(async () => {
  assert.equal(dirname(resolve(root)), resolve(tmpdir()))
  assert.ok(basename(root).startsWith('media-unit-'))
  await rm(root, { recursive: true, force: true })
})

test('local and independent server URLs normalize without credentials or protocol injection', () => {
  const path = '/media/' + 'a'.repeat(64) + '.webp'
  assert.equal(resolveMediaUrl(path, '/'), path)
  assert.equal(normalizeMediaBase(' https://img.example.com/images/ '), 'https://img.example.com/images')
  assert.equal(resolveMediaUrl(path, 'http://192.168.1.10:8080/'), 'http://192.168.1.10:8080' + path)
  assert.equal(resolveMediaUrl(path, 'https://img.example.com/images'), 'https://img.example.com/images' + path)
  for (const value of ['//evil.test', '/other', 'javascript:alert(1)', 'https://user:pass@img.example.com', 'https://x.test/?q=1', 'https://x.test/#a', 'https://x.test/\\evil', 'https://x.test/%2fsecret']) assert.equal(normalizeMediaBase(value), null)
  assert.equal(resolveMediaUrl('/private-media/' + 'a'.repeat(64) + '.webp', 'https://img.example.com'), null)
  assert.equal(resolveMediaUrl('//evil.test/image', '/'), null)
})

test('concurrent uploads preserve identical verified files and keep private/public namespaces separate', async () => {
  const urls = await Promise.all(Array.from({ length: 8 }, () => writeMediaFile(pixel, 'private')))
  assert.equal(new Set(urls).size, 1)
  const privateUrl = urls[0]
  assert.deepEqual(await readMediaFile(privateUrl), pixel)
  const publicUrl = await publishMediaFile(privateUrl)
  assert.ok(publicUrl.startsWith('/media/'))
  assert.notEqual(mediaFilePath(publicUrl), mediaFilePath(privateUrl))
  assert.deepEqual(await readMediaFile(publicUrl), pixel)
  assert.deepEqual(await readMediaFile(privateUrl), pixel)
})

test('traversal, invalid file contents and changed on-disk bytes are rejected', async () => {
  for (const path of ['../../.env', '/media/../x', '/private-media/%2e%2e/x', '/media/' + 'a'.repeat(64) + '.svg']) assert.throws(() => mediaFilePath(path), /INVALID_MEDIA_PATH/)
  await assert.rejects(writeMediaFile(Buffer.from('<script>not an image</script>'), 'public'), /INVALID_WEBP/)
  const url = await writeMediaFile(pixel, 'public')
  await writeFile(mediaFilePath(url), Buffer.from('corrupted'))
  await assert.rejects(readMediaFile(url), /MEDIA_CHECKSUM_MISMATCH/)
  await assert.rejects(writeMediaFile(pixel, 'public'), /MEDIA_CHECKSUM_MISMATCH/)
})
