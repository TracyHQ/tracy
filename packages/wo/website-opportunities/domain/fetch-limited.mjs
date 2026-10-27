import { assertPublicUrl } from './url-guard.mjs'
import { sniffMime } from './media.mjs'

export const USER_AGENT = 'TracyWebsiteOpportunities/0.1 (+https://tracy.ai)'
const MAX_REDIRECTS = 5
const TEXT_MIMES = new Set([
  'text/plain',
  'text/xml',
  'application/xml',
  'application/json',
  'application/ld+json',
  'text/css',
  'text/csv',
  'application/rss+xml',
  'application/atom+xml',
  'text/html'
])

export class FetchLimitedError extends Error {
  constructor(code, message, extra = {}) {
    super(message ?? code)
    this.name = 'FetchLimitedError'
    this.code = code
    Object.assign(this, extra)
  }
}

function mimeMatches(mime, patterns) {
  if (!mime) return false
  return patterns.some((p) => (p.endsWith('/*') ? mime.startsWith(p.slice(0, -1)) : mime === p))
}

async function readCapped(res, maxBytes) {
  if (!res.body) return { bytes: new Uint8Array(), truncated: false }
  const reader = res.body.getReader()
  const chunks = []
  let total = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const room = maxBytes - total
    if (value.length > room) {
      chunks.push(value.subarray(0, room))
      total += room
      truncated = true
      await reader.cancel().catch(() => {})
      break
    }
    chunks.push(value)
    total += value.length
  }
  const bytes = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    bytes.set(c, off)
    off += c.length
  }
  return { bytes, truncated }
}

/**
 * Fetch with SSRF guard on every hop, manual redirects (max 5), a byte cap and one overall timeout.
 * `accept`: optional list of MIME patterns ('image/*'); a sniffed type outside it throws MIME_REJECTED.
 * The injected fetch does its own DNS lookup; the guard narrows but cannot fully close a rebinding
 * race between our lookup and its connect. Hosts that need a hard guarantee must pin the address.
 */
export async function fetchLimited(
  url,
  {
    fetch,
    resolve,
    maxBytes = 5 * 1024 * 1024,
    timeoutMs = 15_000,
    accept,
    allowPorts,
    method = 'GET',
    headers = {},
    body
  } = {}
) {
  if (typeof fetch !== 'function') throw new FetchLimitedError('FETCH_FAILED', 'fetch dependency missing')
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new FetchLimitedError('TIMEOUT', 'request timed out')),
    timeoutMs
  )
  try {
    let current = url
    for (let hop = 0; ; hop++) {
      const u = await assertPublicUrl(current, { resolve }, { allowPorts })
      let res
      try {
        res = await fetch(u.href, {
          method: hop === 0 ? method : 'GET',
          body: hop === 0 ? body : undefined,
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': USER_AGENT,
            ...(Array.isArray(accept) ? { accept: accept.join(', ') } : {}),
            ...headers
          }
        })
      } catch (err) {
        if (controller.signal.aborted) throw new FetchLimitedError('TIMEOUT', 'request timed out')
        throw new FetchLimitedError('FETCH_FAILED', err?.message ?? 'fetch failed')
      }
      const location = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => {})
        if (hop >= MAX_REDIRECTS) throw new FetchLimitedError('TOO_MANY_REDIRECTS', 'too many redirects')
        current = new URL(location, u).href
        continue
      }
      let read
      try {
        read = await readCapped(res, maxBytes)
      } catch (err) {
        if (controller.signal.aborted) throw new FetchLimitedError('TIMEOUT', 'request timed out')
        throw new FetchLimitedError('FETCH_FAILED', err?.message ?? 'read failed')
      }
      const declared = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      const mime = sniffMime(read.bytes) ?? (TEXT_MIMES.has(declared) ? declared : null)
      if (Array.isArray(accept) && res.ok && !mimeMatches(mime, accept)) {
        throw new FetchLimitedError('MIME_REJECTED', `unexpected type ${mime ?? 'unknown'}`, { mime })
      }
      return { url: u.href, status: res.status, mime, bytes: read.bytes, truncated: read.truncated }
    }
  } finally {
    clearTimeout(timer)
  }
}
