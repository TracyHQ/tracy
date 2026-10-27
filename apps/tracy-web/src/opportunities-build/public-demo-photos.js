/**
 * The pictures of a `/v1/demos` request (tasks/todo-wo-public-demos.md C3): Tracy fetches each URL itself, through
 * the package's guarded fetch on the crawler's pinned connection (every redirect hop checked, the dialled address
 * checked, IPv4/IPv6 private and cloud metadata refused), within a byte cap per picture and per request, a decoded
 * size cap, one timeout per picture and one deadline for all. Nothing is stored here: the caller stores the bytes
 * only once every URL passed, so a refused request leaves nothing behind.
 */

export const PHOTO_LIMITS = Object.freeze({
  bytesEach: 5 * 1024 * 1024,
  bytesTotal: 48 * 1024 * 1024,
  pixels: 40_000_000,
  side: 12_000,
  timeoutMs: 15_000,
  deadlineMs: 60_000
})
const EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif'
}
const BLOCKED = (error) => error?.code === 'URL_BLOCKED'

/**
 * @param {any} domain the package's domain (`assertPublicUrl`, `fetchLimited`, `sha256Hex`)
 * @param {{url: string, caption?: string, alt?: string}[]} photos
 * @param {{ fetch: typeof fetch, resolve: Function, imageInfo: (bytes: Uint8Array) => Promise<any>, now?: () => number }} deps
 * @returns {Promise<{ blocked: { index: number, reason: string } } | {
 *   got: { index: number, bytes: Uint8Array, mime: string, ext: string, sha256: string, info: any }[],
 *   skipped: { index: number, reason: string }[] }>}
 */
export async function fetchDemoPhotos(domain, photos, { fetch, resolve, imageInfo, now = Date.now }) {
  // Every address first: a request naming a private one is refused before Tracy fetches anything.
  for (const [index, photo] of photos.entries()) {
    try {
      await domain.assertPublicUrl(photo.url, { resolve })
    } catch (error) {
      if (BLOCKED(error)) return { blocked: { index, reason: error.reason ?? 'blocked' } }
      throw error
    }
  }
  const deadline = now() + PHOTO_LIMITS.deadlineMs
  const got = []
  const skipped = []
  let total = 0
  for (const [index, photo] of photos.entries()) {
    const left = deadline - now()
    if (left <= 0 || total >= PHOTO_LIMITS.bytesTotal) {
      skipped.push({ index, reason: left <= 0 ? 'deadline' : 'request_too_large' })
      continue
    }
    let answer
    try {
      answer = await domain.fetchLimited(photo.url, {
        fetch,
        resolve,
        maxBytes: Math.min(PHOTO_LIMITS.bytesEach, PHOTO_LIMITS.bytesTotal - total),
        timeoutMs: Math.min(PHOTO_LIMITS.timeoutMs, left),
        accept: ['image/*']
      })
    } catch (error) {
      // A redirect into a private address is the request's fault, not the picture's.
      if (BLOCKED(error)) return { blocked: { index, reason: error.reason ?? 'blocked' } }
      skipped.push({ index, reason: String(error?.code ?? 'download_failed').toLowerCase() })
      continue
    }
    if (answer.status >= 400 || answer.truncated || !EXT[answer.mime]) {
      skipped.push({
        index,
        reason: answer.truncated ? 'too_large' : answer.status >= 400 ? 'download_failed' : 'not_media'
      })
      continue
    }
    let info
    try {
      info = await imageInfo(answer.bytes)
    } catch {
      skipped.push({ index, reason: 'image_unreadable' })
      continue
    }
    const { width, height } = info ?? {}
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width > PHOTO_LIMITS.side ||
      height > PHOTO_LIMITS.side ||
      width * height > PHOTO_LIMITS.pixels
    ) {
      skipped.push({ index, reason: 'image_too_large' })
      continue
    }
    total += answer.bytes.length
    got.push({
      index,
      bytes: answer.bytes,
      mime: answer.mime,
      ext: EXT[answer.mime],
      sha256: domain.sha256Hex(answer.bytes),
      info
    })
  }
  return { got, skipped }
}
