import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, open, lstat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { validMediaPath } from './media-url.ts'
import sharp from 'sharp'

// Persistent media is provisioned separately from the build, never traced into deployment bundles.
export function mediaRoot() { return resolve(/* turbopackIgnore: true */ process.env.MEDIA_STORAGE_DIR || join(process.cwd(), 'storage', 'media')) }
export function mediaFilePath(url: string) {
  if (!validMediaPath(url)) throw new Error('INVALID_MEDIA_PATH')
  return join(/* turbopackIgnore: true */ mediaRoot(), url.startsWith('/private-media/') ? 'private' : 'public', url.split('/').at(-1)!)
}
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex')
export async function readMediaFile(url: string) {
  const path = mediaFilePath(url)
  if (!(await lstat(path)).isFile()) throw new Error('INVALID_MEDIA_FILE')
  const data = await readFile(/* turbopackIgnore: true */ path)
  if (digest(data) !== url.split('/').at(-1)!.slice(0, -5)) throw new Error('MEDIA_CHECKSUM_MISMATCH')
  return data
}

export async function writeMediaFile(data: Buffer | null, scope: 'public' | 'private'): Promise<string | null> {
  if (!data) return null
  if (data.length < 12 || data.length > 2097152 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') throw new Error('INVALID_WEBP')
  if ((await sharp(data, { limitInputPixels: 16_000_000 }).metadata()).format !== 'webp') throw new Error('INVALID_WEBP')
  const hash = digest(data)
  const url = `/${scope === 'public' ? 'media' : 'private-media'}/${hash}.webp`
  const target = mediaFilePath(url)
  const dir = join(/* turbopackIgnore: true */ mediaRoot(), scope)
  await mkdir(dir, { recursive: true })
  try {
    const existing = await readMediaFile(url)
    if (!existing.equals(data)) throw new Error('MEDIA_CHECKSUM_MISMATCH')
    return url
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const temporary = join(/* turbopackIgnore: true */ dir, `.${hash}-${randomUUID()}.tmp`)
  try {
    const file = await open(temporary, 'wx', 0o600)
    try { await file.writeFile(data); await file.sync() } finally { await file.close() }
    try { await rename(temporary, target) }
    catch (error) { if (!(await readMediaFile(url).catch(() => null))?.equals(data)) throw error }
    if (!(await readMediaFile(url)).equals(data)) throw new Error('MEDIA_WRITE_VERIFICATION_FAILED')
    return url
  } finally { await rm(temporary, { force: true }) }
}

export async function publishMediaFile(url: string | null) {
  if (!url) return null
  if (!url.startsWith('/private-media/')) throw new Error('INVALID_PRIVATE_MEDIA')
  return writeMediaFile(await readMediaFile(url), 'public')
}
