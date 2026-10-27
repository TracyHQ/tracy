/**
 * Tracy's own reads of a site at its public Tracy address — a Design system preview of a site on
 * another host, the brief's reader of the site as a visitor sees it — marked so the site router
 * (`bar/route.js`) still serves them the page where it sends a visitor on to the site's own domain.
 *
 * 🔒 THE MARK SKIPS THE OWN-DOMAIN 301 AND NOTHING ELSE. A marked read is still served as nobody: no
 * seat, no tier, no picker, no header it carries believed. It only proves that THIS process asked,
 * for THIS hostname, in the last `VALID_S` seconds — an HMAC keyed from the session secret under its
 * own label (never a session or another token's key), over the hostname and the expiry. The header
 * never reaches the site (`bar/site-proxy.js`).
 *
 * Lives in `lib/` because two domains use it: `sites/` and `app.js` mark, `bar/` verifies.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const OWN_READ_HEADER = 'x-tracy-own-read'
const DOMAIN = 'tracy-own-read:v1:'
// Long enough for one read's redirects and assets; short enough that a mark seen in a log is spent.
const VALID_S = 60

const signature = (secret, hostname, exp) =>
  createHmac('sha256', String(secret))
    .update(`${DOMAIN}${String(hostname).toLowerCase()}\n${exp}`)
    .digest('base64url')

/**
 * The mark for one read of `hostname`.
 * @param {string} secret - `config.sessionSecret`
 * @param {string} hostname
 * @param {number} [now] - milliseconds
 */
export function ownReadMark(secret, hostname, now = Date.now()) {
  const exp = Math.floor(now / 1000) + VALID_S
  return `${exp}.${signature(secret, hostname, exp)}`
}

/**
 * Whether `value` is a mark this process made for `hostname` that has not expired. Anything else —
 * missing, malformed, another hostname, expired, signed with another secret, dated past the validity
 * window — is false; it never throws.
 * @param {string} secret
 * @param {string} hostname - the request's host name, without a port
 * @param {string | null | undefined} value - the header as received
 * @param {number} [now] - milliseconds
 */
export function isOwnRead(secret, hostname, value, now = Date.now()) {
  if (!secret || typeof value !== 'string' || value.length > 128) return false
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value)
  if (!match) return false
  const exp = Number(match[1])
  const at = Math.floor(now / 1000)
  if (exp < at || exp > at + VALID_S) return false
  const want = Buffer.from(signature(secret, hostname, exp))
  const got = Buffer.from(match[2])
  return want.length === got.length && timingSafeEqual(want, got)
}

/**
 * `fetchImpl`, marking each request to a Tracy address of this deployment (a name under
 * `config.siteDomain` or one of its aliases — where every Tracy address, label or managed name,
 * lives). Any other host (Google Fonts, a site's container) is asked exactly as before, unmarked.
 * @param {typeof fetch} fetchImpl
 * @param {{ sessionSecret?: string, siteDomain?: string, siteDomainAliases?: string[] }} config
 * @param {() => number} [now]
 * @returns {typeof fetch}
 */
export function markOwnReads(fetchImpl, config, now = Date.now) {
  const domains = [config.siteDomain, ...(config.siteDomainAliases ?? [])]
    .filter(Boolean)
    .map((d) => String(d).toLowerCase())
  const isTracyAddress = (hostname) => domains.some((d) => hostname.endsWith(`.${d}`))
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const hostname = url.hostname.toLowerCase()
    if (!config.sessionSecret || !isTracyAddress(hostname)) return fetchImpl(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(OWN_READ_HEADER, ownReadMark(config.sessionSecret, hostname, now()))
    return fetchImpl(input, { ...init, headers })
  }
}
