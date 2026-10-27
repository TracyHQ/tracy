/**
 * What a pasted link is, shared by the server and the browser. Pure: no imports, only the standard `URL`.
 *
 * `linkKind` reads one link, `judgeLinks` says which of an ordered list the create doors can use and why the
 * others cannot, `splitPasted` cuts pasted text into link tokens and leftover words.
 *
 * The private-host check here is a string check only (no DNS). The server still runs its own public-URL guard.
 */

/** Most links one create request may use. */
export const MAX_LINKS = 5

/**
 * Listing and directory hosts: host suffix -> display name. A key ending in `.*` matches any TLD
 * (`tripadvisor.com`, `tripadvisor.co.uk`, `tripadvisor.ae`).
 * @type {Readonly<Record<string, string>>}
 */
export const LISTING_HOSTS = Object.freeze({
  'magicpin.com': 'magicpin',
  'tripadvisor.*': 'Tripadvisor',
  'yelp.*': 'Yelp',
  'zomato.com': 'Zomato',
  'talabat.com': 'Talabat',
  'foursquare.com': 'Foursquare',
  'deliveroo.*': 'Deliveroo',
  'fresha.com': 'Fresha'
})

/**
 * @typedef {'google'|'listing'|'website'|'facebook'|'instagram'|'tiktok'|'youtube'} LinkKind
 * @typedef {{ kind: LinkKind, url: string, key: string, source?: string, handle?: string }} LinkInfo
 * @typedef {'invalid'|'not-public'|'duplicate'|'limit'|'one-google'|'one-website'} LinkRejection
 * @typedef {{ raw: string, url: string|null, kind: string|null, source?: string, used: boolean, reason?: LinkRejection }} JudgedLink
 */

/** Share and campaign tracking parameters a link loses wherever Tracy keeps or shows it (one list, #1780). */
export const TRACKING_PARAMS = /^(utm_.*|igsh|igshid|mdxt|mibextid|fbclid|gclid|si)$/i

/**
 * Drop the tracking parameters of a URL `searchParams` in place (keys copied first: deleting while iterating skips one).
 * @param {URLSearchParams} searchParams
 */
export function dropTracking(searchParams) {
  for (const key of Array.from(searchParams.keys())) if (TRACKING_PARAMS.test(key)) searchParams.delete(key)
}

/**
 * `url` without its tracking parameters, else `url` as it was when it is no URL.
 * @param {string} url
 */
export function withoutTracking(url) {
  try {
    const u = new URL(url)
    dropTracking(u.searchParams)
    return u.href
  } catch {
    return url
  }
}
const TLD_TAIL = '[a-z]{2,}(?:\\.[a-z]{2})?'
/** @type {Record<string, LinkKind>} */
const SOCIAL_HOSTS = {
  'instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'tiktok.com': 'tiktok',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube'
}
/** First path segments that are not a handle: the whole path identifies the page instead. */
const NON_HANDLE_SEGMENTS = new Set([
  'profile.php',
  'pages',
  'people',
  'groups',
  'channel',
  'c',
  'user',
  'watch',
  'p',
  'reel',
  'tv'
])

/** @param {string} host @param {string} suffix */
function isListingMatch(host, suffix) {
  if (suffix.endsWith('.*')) {
    const label = suffix.slice(0, -2).replace(/\./g, '\\.')
    return new RegExp(`^(?:.+\\.)?${label}\\.${TLD_TAIL}$`).test(host)
  }
  return host === suffix || host.endsWith(`.${suffix}`)
}

/** @param {string} host @param {string} path */
function isGoogle(host, path) {
  if (host === 'share.google' || host === 'maps.app.goo.gl' || host === 'g.page') return true
  if (host === 'goo.gl') return path.startsWith('/maps')
  if (host === 'g.co') return path.startsWith('/kgs/')
  if (/^maps\.google\.[a-z.]+$/.test(host)) return true
  return /^google\.[a-z.]+$/.test(host) && path.startsWith('/maps')
}

/**
 * Parse the text into a URL, adding https:// to a bare domain. Null when it is not an http(s) link.
 * @param {unknown} raw
 */
function toUrl(raw) {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text || /\s/.test(text)) return null
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
  if (!hasScheme && /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^/]+:\d+(\/|$)/.test(text)) return null
  if (
    !hasScheme &&
    !/^[^/?#]+\.[a-z]{2,}(?::\d+)?([/?#]|$)/i.test(text) &&
    !/^\d{1,3}(\.\d{1,3}){3}([:/?#]|$)/.test(text)
  )
    return null
  let url
  try {
    url = new URL(hasScheme ? text : `https://${text}`)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return url
}

/**
 * What one pasted link is. Null when the text is not an http(s) link (a bare domain like `example.ae` counts;
 * https:// is added).
 * @param {string} raw
 * @returns {LinkInfo | null}
 */
export function linkKind(raw) {
  const u = toUrl(raw)
  if (!u) return null
  let host = u.hostname.toLowerCase()
  if (!host) return null
  const isIp = host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  if (!isIp && host !== 'localhost' && !/^[^.]+(\.[^.]+)*\.[a-z]{2,}$/.test(host)) return null
  host = host
    .replace(/^(www|m)\./, (m) => (SOCIAL_HOSTS[host.slice(m.length)] ? '' : m))
    .replace(/^www\./, '')
  const path = u.pathname

  dropTracking(u.searchParams)
  const kept = u.searchParams.toString()
  const cleanPath = path === '/' && !kept ? '' : path
  const scheme = u.protocol === 'http:' && isIp ? 'http' : 'https'
  const url = `${scheme}://${host}${u.port ? `:${u.port}` : ''}${cleanPath}${kept ? `?${kept}` : ''}`
  const plainKey = `${host}${path.replace(/\/+$/, '').toLowerCase()}`

  if (isGoogle(host, path)) return { kind: 'google', url, key: url }

  const social = SOCIAL_HOSTS[host]
  if (social) {
    const first = path.split('/').filter(Boolean)[0] || ''
    const handle = decodeURIComponent(first).replace(/^@/, '')
    /** @type {LinkInfo} */
    const info = { kind: social, url, key: plainKey }
    if (handle) {
      info.handle = handle
      if (!NON_HANDLE_SEGMENTS.has(handle.toLowerCase())) info.key = `${social}:${handle.toLowerCase()}`
      else
        info.key = `${social}:${plainKey.slice(plainKey.indexOf('/'))}${u.searchParams.get('id') ? `?id=${u.searchParams.get('id')}` : ''}`
    }
    return info
  }

  for (const [suffix, source] of Object.entries(LISTING_HOSTS)) {
    if (isListingMatch(host, suffix)) return { kind: 'listing', url, key: plainKey, source }
  }
  return { kind: 'website', url, key: plainKey }
}

/**
 * The link is a business's page on a listing or directory site (`LISTING_HOSTS`): never the business's own website.
 * @param {unknown} raw
 */
export function isListingUrl(raw) {
  return typeof raw === 'string' && linkKind(raw)?.kind === 'listing'
}

/** @param {string} raw */
function isPrivateHost(raw) {
  const u = toUrl(raw)
  if (!u) return false
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

/**
 * An ordered list of pasted links, judged the way the create doors use them. Checks run in this order for each
 * link: invalid, duplicate, not-public, limit, one-google, one-website.
 * @param {string[]} raws
 * @returns {JudgedLink[]}
 */
export function judgeLinks(raws) {
  const seen = new Set()
  let used = 0
  let hasGoogle = false
  let hasWebsite = false
  return raws.map((raw) => {
    const info = linkKind(raw)
    if (!info) return { raw, url: null, kind: null, used: false, reason: 'invalid' }
    /** @type {JudgedLink} */
    const out = { raw, url: info.url, kind: info.kind, used: false }
    if (info.source) out.source = info.source
    const reject = () => {
      if (seen.has(info.key)) return 'duplicate'
      if (isPrivateHost(raw)) return 'not-public'
      if (used >= MAX_LINKS) return 'limit'
      if (info.kind === 'google' && hasGoogle) return 'one-google'
      if (info.kind === 'website' && hasWebsite) return 'one-website'
      return null
    }
    const reason = reject()
    seen.add(info.key)
    if (reason) return { ...out, reason }
    used += 1
    if (info.kind === 'google') hasGoogle = true
    if (info.kind === 'website') hasWebsite = true
    return { ...out, used: true }
  })
}

/**
 * Pasted text split into link tokens (in order) and the leftover words (joined by one space).
 * Separators: whitespace and commas.
 * @param {string} text
 * @returns {{ links: string[], words: string }}
 */
export function splitPasted(text) {
  const links = []
  const words = []
  for (const token of String(text ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)) {
    if (linkKind(token)) links.push(token)
    else words.push(token)
  }
  return { links, words: words.join(' ') }
}
