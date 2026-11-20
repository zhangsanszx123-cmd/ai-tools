export function normalizeMediaBase(value: string): string | null {
  const text = value.trim()
  if (text === '/') return '/'
  if (!text || text.length > 1000 || /[\\\s\u0000-\u001f\u007f]/.test(text)) return null
  try {
    const url = new URL(text)
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) return null
    if (/%(?:2f|5c|00|0a|0d)/i.test(url.pathname)) return null
    return url.href.replace(/\/+$/, '')
  } catch { return null }
}

export function validMediaPath(path: string) {
  return /^\/(?:private-media|media)\/[a-f0-9]{64}\.webp$/.test(path)
}

export function resolveMediaUrl(path: string | null | undefined, base = '/') {
  if (!path || !validMediaPath(path)) return null
  if (path.startsWith('/private-media/')) return null
  const normalized = normalizeMediaBase(base)
  return normalized ? (normalized === '/' ? path : normalized + path) : null
}
