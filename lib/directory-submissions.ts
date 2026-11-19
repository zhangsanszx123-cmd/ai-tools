import 'server-only'
import sharp from 'sharp'
import { directoryStore } from './directory-db'

export const { isAdmin, getSubmissionHistory, getReviewQueue } = directoryStore

export async function normalizeImage(entry: FormDataEntryValue | null, maxBytes: number, edge: number) {
  if (!(entry instanceof File) || !entry.size) return null
  if (entry.size > maxBytes || !['image/png', 'image/jpeg', 'image/webp'].includes(entry.type)) throw new Error('Unsupported image')
  const image = sharp(Buffer.from(await entry.arrayBuffer()), { limitInputPixels: 16_000_000 })
  if (!['png', 'jpeg', 'webp'].includes((await image.metadata()).format ?? '')) throw new Error('Unsupported image')
  const output = await image.rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer()
  if (output.length > maxBytes) throw new Error('Image too large after encoding')
  return output
}
