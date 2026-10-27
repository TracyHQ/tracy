// Shared bounded HTTP capture helpers for source adapters.
import { htmlStartTags } from '../ingest/joomla-html-tags.mjs'

export const CAPTURE_LIMITS = Object.freeze({
  requestTimeoutMs: 30000,
  pageBytes: 8 * 1024 * 1024,
  sheetBytes: 4 * 1024 * 1024,
  routes: 2000,
  sheetsPerRoute: 200,
  files: 20000,
  fileBytes: 16 * 1024 * 1024,
  totalBytes: 400 * 1024 * 1024,
  depth: 16,
  imports: 32,
  concurrency: 4
})

const tagAttributes = (text) => {
  const map = new Map()
  for (const m of String(text).matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const name = m[1].toLowerCase()
    if (!map.has(name)) map.set(name, m[2] ?? m[3] ?? m[4] ?? '')
  }
  return map
}

function linkTags(html) {
  const out = []
  for (const t of htmlStartTags(html)) {
    if (t.unterminated) throw new Error(`a <${t.name}> tag at offset ${t.index} is not closed (unterminated quote or no ">"): the stylesheets after it cannot be read`)
    if (t.name === 'link') out.push(t.body)
  }
  return out
}

export function stylesheetLinks(html, max = CAPTURE_LIMITS.sheetsPerRoute) {
  const hrefs = []
  for (const body of linkTags(String(html))) {
    const attrs = tagAttributes(body)
    if (!(attrs.get('rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) continue
    const value = (attrs.get('href') ?? '').replace(/&amp;/g, '&').trim()
    if (value) hrefs.push(value)
  }
  if (hrefs.length > max) throw new Error(`a page links ${hrefs.length} stylesheets, over the ${max} bound`)
  return hrefs
}

export async function fetchBounded(url, { timeoutMs, maxBytes, signal, fetchImpl = fetch, includeContentType = false }) {
  const local = new AbortController()
  const stop = () => local.abort()
  signal?.addEventListener('abort', stop, { once: true })
  const timer = setTimeout(stop, timeoutMs)
  try {
    const res = await fetchImpl(url, { redirect: 'manual', signal: local.signal, headers: { accept: 'text/html,text/css,*/*;q=0.5' } })
    const chunks = []
    let bytes = 0
    if (res.body) {
      for await (const chunk of res.body) {
        bytes += chunk.length
        if (bytes > maxBytes) throw new Error(`${url}: the answer is larger than ${maxBytes} bytes`)
        chunks.push(chunk)
      }
    }
    return { status: res.status, location: res.headers.get('location'), ...(includeContentType ? { contentType: res.headers.get('content-type') || '' } : {}), body: Buffer.concat(chunks) }
  } catch (e) {
    if (local.signal.aborted && !signal?.aborted) throw new Error(`${url}: no answer within ${timeoutMs} ms`)
    if (signal?.aborted) throw new Error(`${url}: cancelled`)
    throw new Error(`${url}: ${e.message ?? e}`)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
  }
}

export const locationOf = (location, base) => {
  try {
    const u = new URL(location, base)
    return u.origin === base.origin ? `${u.pathname}${u.search}` : u.href
  } catch {
    return String(location)
  }
}
