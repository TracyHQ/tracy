/**
 * The three things nearly every route needs before it can do anything else: answer JSON with the
 * exact content type production sends, know who is asking (`tracy_sess`), and turn a site's raw
 * spelling into the one key the seat book agrees on.
 */
import { sessionFromCookieHeader } from './session.js'

/** `c.json()` defaults to `application/json` with no charset — this is the shape callers get instead. */
export function json(c, body, status = 200) {
  c.header('content-type', 'application/json; charset=utf-8')
  return c.body(JSON.stringify(body), status)
}

/** The signed-in viewer's email, or null. Identity only, never rights — callers still ask the seat book. */
export async function viewer(c, config) {
  return sessionFromCookieHeader(c.req.header('cookie') ?? null, config.sessionSecret)
}

/** `viewer`, or the 401 a route can return directly: `const email = await requireViewer(c, config); if (email instanceof Response) return email`. */
export async function requireViewer(c, config) {
  const email = await viewer(c, config)
  return email ?? json(c, { code: 'NOT_SIGNED_IN' }, 401)
}

const DOMAIN_SHAPE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/
const IPV4_SHAPE = /^(\d{1,3}\.){3}\d{1,3}$/

function isRegistrableHost(host) {
  const bare = host.replace(/:\d+$/, '')
  if (bare === 'localhost' || bare.endsWith('.localhost') || bare === '127.0.0.1') return true
  return DOMAIN_SHAPE.test(bare) || IPV4_SHAPE.test(bare)
}

/**
 * A site key as it came in a path or a query, percent-decoded — or null when it is not text a site
 * can be named by: a broken escape (`%FF`, which `decodeURIComponent` throws on) or a NUL anywhere
 * (Postgres refuses one in text, so it used to reach SQL and answer 500; QA run 20/10/2026).
 * @param {string} raw
 * @returns {string | null}
 */
export function decodedSiteKey(raw) {
  let decoded
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }
  return decoded.includes('\0') ? null : decoded
}

/**
 * `joomlart.com` from `https://www.joomlart.com/` — ported verbatim from `normalizeSiteKey` in
 * `workers/seat-registry/src/index.js:221-232`. Two Workers read the same book, so grant written
 * by one and looked up by the other has to land on the same key; this app is a third reader of
 * that same book, so it carries the exact same shape rather than a re-derivation of it.
 */
export function normalizeSiteKey(raw) {
  const decoded = decodedSiteKey(raw)
  if (decoded === null) return ''
  const trimmed = decoded.trim().toLowerCase()
  const withoutScheme = trimmed.replace(/^https?:\/\//, '')
  const key = withoutScheme.replace(/^www\./, '').replace(/\/.*$/, '')
  // The shape must be a real host: a normal domain, IPv4, or loopback. This is the wall — a junk
  // siteKey that gets past it becomes a real grant, a real site row, even a real GitHub repo.
  if (!isRegistrableHost(key)) return ''
  return key
}
