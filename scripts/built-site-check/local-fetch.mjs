// Reading a locally built site for the built site check (ticket #601). Only the base address given is read: a host
// that is not local is refused before any request, a redirect off that origin is not followed, and only GET is sent.
// The tool never reads a customer site.

const LOCAL_SUFFIXES = ['.localhost', '.test', '.ddev.site']
const MAX_REDIRECTS = 3
const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15000

export class BuiltSiteCheckError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'BuiltSiteCheckError'
    this.code = code
  }
}

/** Whether a host name is this machine or a local development name. */
export function isLocalHost(hostname) {
  const host = String(hostname ?? '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '::1') return true
  if (/^127(\.\d{1,3}){3}$/.test(host)) return true
  return LOCAL_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length)
}

/** The base address of a locally built site, or a `site_not_local` error. */
export function localBaseOf(text) {
  let url
  try {
    url = new URL(String(text))
  } catch {
    throw new BuiltSiteCheckError('site_not_local', 'the site is not an address')
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new BuiltSiteCheckError('site_not_local', 'the site address is not http or https')
  if (url.username || url.password)
    throw new BuiltSiteCheckError('site_not_local', 'the site address carries a login')
  if (!isLocalHost(url.hostname))
    throw new BuiltSiteCheckError(
      'site_not_local',
      'only a locally built site is read (localhost, 127.x, *.localhost, *.test, *.ddev.site)'
    )
  url.hash = ''
  url.search = ''
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url
}

/** Whether an address is on the base's origin and under its path. */
export const onBase = (url, base) =>
  url.origin === base.origin && url.pathname.startsWith(base.pathname.replace(/\/$/, '') || '/')

/**
 * One page of the base, GET only, redirects followed only on the base.
 * @returns {Promise<{status: number, html: string, url: string, note?: string}>}
 */
export async function fetchLocal(base, address, { fetchImpl = fetch } = {}) {
  let url = new URL(address, base)
  if (!onBase(url, base)) return { status: 0, html: '', url: url.href, note: 'off_base' }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res
    try {
      res = await fetchImpl(url.href, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch (error) {
      return { status: 0, html: '', url: url.href, note: `unreachable: ${error?.name ?? 'error'}` }
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), url)
      if (!onBase(next, base))
        return { status: res.status, html: '', url: url.href, note: 'redirect_off_base' }
      url = next
      continue
    }
    const type = res.headers.get('content-type') ?? ''
    const text = /html|^$/.test(type) ? await res.text() : ''
    return { status: res.status, html: text.slice(0, MAX_BYTES), url: url.href }
  }
  return { status: 0, html: '', url: url.href, note: 'too_many_redirects' }
}

/** Run `work` over `items` with at most `limit` running at once. */
export async function pooled(items, limit, work) {
  const out = Array.from({ length: items.length })
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await work(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  return out
}
