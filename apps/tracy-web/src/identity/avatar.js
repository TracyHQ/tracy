/**
 * A person's provider picture, fetched by Tracy and kept for a while — the half of
 * `GET /auth/avatar/:accountId` (`route.js`) that talks to Google's or GitHub's picture CDN.
 *
 * WHY TRACY FETCHES IT AND NOT THE PAGE (09/10/2026). A face drawn straight from
 * `lh3.googleusercontent.com` would tell Google the address of everyone who looks at a Team tab, would
 * need a third-party `img-src` on every Tracy page and the dsh page, and would break when the
 * provider's address expires. So the stored provider address never leaves the server: `personFace`
 * hands out Tracy's own address, and this module answers it.
 *
 * What it guarantees, each one a test in `test/avatar-door.test.mjs`:
 *   - only an address `lib/avatar-source.js` passes is ever requested — every redirect hop too
 *     (`redirect: 'manual'`, at most `MAX_HOPS`), so a provider redirect cannot point Tracy at
 *     another host;
 *   - nothing of the viewer rides along: no cookie, no forwarded header;
 *   - an answer is kept only when it is a raster image (`image/png|jpeg|gif|webp|avif`, never SVG)
 *     of at most `MAX_BYTES`, read within `timeoutMs`;
 *   - a good answer is kept in memory (least recently used first out, `MAX_ENTRIES` and
 *     `MAX_TOTAL_BYTES`, `TTL_MS`), keyed by account AND source, so a new picture is fetched anew;
 *     a failure is not kept, so the next read asks again.
 *
 * In memory, per process: a restart costs one provider request per face, which is cheaper than a
 * bucket and a cleanup job for pictures the provider keeps anyway.
 */
import { createHash } from 'node:crypto'
import { avatarSource } from '../lib/avatar-source.js'

export const MAX_BYTES = 1024 * 1024
const MAX_HOPS = 3
const MAX_ENTRIES = 500
const MAX_TOTAL_BYTES = 32 * 1024 * 1024
const TTL_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 5000
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'])

/**
 * Read a body to the end, giving up past `limit` bytes.
 * @returns {Promise<Uint8Array | null>} null when over the limit or unreadable
 */
async function readCapped(response, limit) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => {})
    return null
  }
  if (!response.body) return new Uint8Array(0)
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return bytes
}

/**
 * Fetch one picture, following redirects only onto allowed hosts.
 * @returns {Promise<{ bytes: Uint8Array, type: string } | null>}
 */
async function fetchPicture(source, { fetchImpl, timeoutMs }) {
  const signal = AbortSignal.timeout(timeoutMs)
  let url = avatarSource(source)
  try {
    for (let hop = 0; url && hop <= MAX_HOPS; hop += 1) {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' }
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        await response.body?.cancel().catch(() => {})
        url = location ? avatarSource(new URL(location, url).toString()) : null
        continue
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        return null
      }
      const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!IMAGE_TYPES.has(type)) {
        await response.body?.cancel().catch(() => {})
        return null
      }
      const bytes = await readCapped(response, MAX_BYTES)
      return bytes && bytes.byteLength > 0 ? { bytes, type } : null
    }
  } catch {
    // A timeout, a reset socket, a bad redirect address: no picture, and the letter is drawn.
    return null
  }
  return null
}

/**
 * The picture store behind `GET /auth/avatar/:accountId`.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: () => number, timeoutMs?: number }} [deps]
 * @returns {{ get(accountId: string, source: string | null): Promise<{ bytes: Uint8Array, type: string, etag: string } | null> }}
 *   `get` answers null when `source` is no provider picture or the provider gave nothing usable.
 */
export function avatarPictures({ fetchImpl = fetch, now = Date.now, timeoutMs = TIMEOUT_MS } = {}) {
  /** Insertion order is recency order: a hit is deleted and set again. */
  const kept = new Map()
  let total = 0
  const drop = (key) => {
    const entry = kept.get(key)
    if (!entry) return
    total -= entry.bytes.byteLength
    kept.delete(key)
  }
  return {
    async get(accountId, source) {
      const allowed = avatarSource(source)
      if (!allowed) return null
      const key = `${accountId}\n${allowed}`
      const hit = kept.get(key)
      if (hit && hit.until > now()) {
        kept.delete(key)
        kept.set(key, hit)
        return hit
      }
      drop(key)
      const picture = await fetchPicture(allowed, { fetchImpl, timeoutMs })
      if (!picture) return null
      const entry = {
        ...picture,
        etag: `"${createHash('sha256').update(picture.bytes).digest('hex').slice(0, 32)}"`,
        until: now() + TTL_MS
      }
      kept.set(key, entry)
      total += entry.bytes.byteLength
      while (kept.size > MAX_ENTRIES || total > MAX_TOTAL_BYTES) drop(kept.keys().next().value)
      return entry
    }
  }
}
