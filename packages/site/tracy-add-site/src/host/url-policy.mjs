/**
 * One narrow policy for following administrative redirects and deciding what may ride them — kept
 * in one place so the three redirect followers (`joomla.ts`, `wordpress.ts`, and the token path's
 * `webroot.mjs`) cannot drift on the two rules that matter: an https flow must never step down to
 * http, and a credential (cookie or Basic auth) must never reach a host the flow did not start on.
 *
 * WHY THIS EXISTS. A hardened Joomla admin measured on a real site 301s `…/administrator` (no
 * slash, https) to `http://…/administrator/` — same host, scheme dropped — while the https slash
 * URL itself answers 200. `fetch`, curl and every browser follow that hop down to http; the login
 * then POSTs over http, the webroot is derived as http, and the seat book (which requires https and
 * rejects the rest) refuses the component credential with INVALID_REQUEST. The copy is provisioned
 * without a credential and Apply answers COMPONENT_NOT_REGISTERED for good. Preserving https across
 * the same-host hop is the fix.
 *
 * WHAT TRUST IS NOT. It is not "the last two labels match". `alice.co.uk` and `bob.co.uk` share
 * their last two labels and are different tenants; so do two customers of one hosting domain. A
 * credential is trusted to exactly one origin — the one the operator typed — plus the single
 * apex/www variant of it, and only when the scheme is not downgraded and the port does not change.
 * A different host, a different scheme, or a different port is another origin and gets nothing.
 *
 * Plain JavaScript, like `doors.mjs` and `webroot.mjs`, so `node --test` pins it without a
 * TypeScript loader. The TypeScript halves import it.
 */

/** The only two schemes this code will follow or trust. */
const SUPPORTED = new Set(['http:', 'https:'])

/**
 * Parse a URL, or `null` — every rule below fails closed on an address it cannot read.
 * @param {string} url
 * @returns {URL | null}
 */
function parse(url) {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * A URL this code is willing to touch at all: an http/https address with no embedded userinfo.
 * `user:pass@host` in a redirect target is a classic way to smuggle credentials onto a request or
 * disguise the real host, so it is refused outright rather than reasoned about.
 * @param {string} url
 * @returns {boolean}
 */
export function isSupportedUrl(url) {
  const u = parse(url)
  if (!u) return false
  if (!SUPPORTED.has(u.protocol)) return false
  if (u.username !== '' || u.password !== '') return false
  return true
}

/**
 * Two hostnames are the same host, case-insensitively — DNS does not distinguish case.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameHost(a, b) {
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * The explicit apex/www variant of a hostname, and nothing wider: `example.test` pairs with
 * `www.example.test` and the reverse, but never `alice.co.uk` with `bob.co.uk`. This is the single
 * cross-host exception the import relies on (a bare admin address 301s apex→www), stated as a
 * concrete pair rather than a suffix guess.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function apexWwwPair(a, b) {
  const la = a.toLowerCase()
  const lb = b.toLowerCase()
  if (la === lb) return false
  return la === `www.${lb}` || lb === `www.${la}`
}

/**
 * The next absolute URL to follow for a redirect `Location`, with https preserved across same-host
 * hops. Returns `null` when `Location` is not a resolvable, supported URL — the caller then stops
 * on the response it already has.
 *
 * A same-host http downgrade of an https flow is rewritten back to https rather than followed down,
 * but ONLY when the port does not change: the current https origin (its hostname AND its port) is
 * preserved, and the target's http port is never blindly reused as an https port. A changed port is
 * another origin, so a same-host downgrade that also names a different port is refused (`null`).
 * Every other hop passes through untouched — an ordinary http→https upgrade, an apex→www move, a
 * language-prefix path change, a cross-host redirect — so the legitimate redirects the import
 * already relied on keep working. Whether a credential may ride the returned hop is a separate
 * question answered by `isTrustedHop`.
 * @param {string} currentUrl The URL that produced this redirect.
 * @param {string} location The `Location` header, absolute or relative.
 * @returns {string | null}
 */
export function nextRedirectUrl(currentUrl, location) {
  const current = parse(currentUrl)
  if (!current) return null
  let next
  try {
    next = new URL(location, current)
  } catch {
    return null
  }
  if (!SUPPORTED.has(next.protocol)) return null
  if (next.username !== '' || next.password !== '') return null
  if (
    current.protocol === 'https:' &&
    next.protocol === 'http:' &&
    sameHost(current.hostname, next.hostname)
  ) {
    // Same-host downgrade: keep the https origin we already have. Only when the ports match (both
    // default, or the same explicit port) — an unexpected port is a different origin, not this one
    // over https, so it is refused rather than rewritten.
    if (next.port !== current.port) return null
    next.protocol = 'https:'
  }
  return next.toString()
}

/**
 * May a credential — a cookie or a Basic `Authorization` header — ride a hop from the flow's
 * `anchorUrl` to `toUrl`? The anchor is fixed for the whole flow: the address the operator typed,
 * NOT the last URL seen, so a post-login `Location` cannot reset the trust boundary and lead the
 * credential to a new host.
 *
 * Trusted means all of:
 *   - both ends are supported (http/https, no userinfo);
 *   - the scheme is not downgraded: once the flow is on https (`secure`) or the anchor is https,
 *     the destination must be https too — an http destination is refused, even cross-host, even if
 *     the flow started on http;
 *   - the hostname is the anchor's, or its single apex/www variant;
 *   - the port is unchanged (a changed port is another origin).
 *
 * A genuinely all-http site (a local or intranet host that never had https to lose) still carries
 * its Basic auth, because `secure` is false and the anchor is http.
 * @param {string} anchorUrl Where the flow started — the trust boundary.
 * @param {string} toUrl Where this hop leads.
 * @param {{ secure?: boolean }} [opts] `secure`: the flow has already been on https.
 * @returns {boolean}
 */
export function isTrustedHop(anchorUrl, toUrl, opts = {}) {
  const anchor = parse(anchorUrl)
  const to = parse(toUrl)
  if (!anchor || !to) return false
  if (!isSupportedUrl(anchorUrl) || !isSupportedUrl(toUrl)) return false
  const secured = opts.secure === true || anchor.protocol === 'https:'
  if (secured && to.protocol !== 'https:') return false
  const sameName = sameHost(anchor.hostname, to.hostname)
  if (!sameName && !apexWwwPair(anchor.hostname, to.hostname)) return false
  return portsCompatible(anchor, to)
}

/**
 * Are two URLs on compatible ports? Both on their scheme default (no explicit port) count as
 * compatible even across an http→https upgrade — that upgrade is the whole point, and 80→443 is
 * not a "port change" in the sense that matters. Otherwise an explicit port must match exactly: a
 * different, explicitly named port is another origin.
 * @param {URL} a
 * @param {URL} b
 * @returns {boolean}
 */
function portsCompatible(a, b) {
  if (a.port === '' && b.port === '') return true
  return a.port === b.port
}

/**
 * `https://host/path/` → `/path`; trailing slashes dropped so `/office` and `/office/` compare equal.
 * @param {URL} u
 * @returns {string}
 */
function pathNoTrail(u) {
  return u.pathname.replace(/\/+$/, '')
}

/**
 * The https webroot to trust for a retry, given an operator's explicit intent and the source
 * webroot a downgraded earlier run saved. Accepted ONLY when the intent names the same source
 * identity — same hostname and same path — and differs solely by being https. Returns the
 * normalized https webroot to verify, or `null` when there is no trustworthy secure intent (the
 * caller then reports the limitation instead of inventing a secure address).
 *
 * This never rewrites the source's identity: it will not move a token to a different host or a
 * different path under the banner of "upgrading" it. It only raises http to https on the very
 * address the run already used.
 * @param {string} intentUrl The https adminUrl or webRootUrl the operator supplied on retry.
 * @param {string} sourceWebRootUrl The webroot the earlier (possibly downgraded) run recorded.
 * @returns {string | null}
 */
export function secureRetryWebRoot(intentUrl, sourceWebRootUrl) {
  const intent = parse(intentUrl)
  const source = parse(sourceWebRootUrl)
  if (!intent || !source) return null
  if (!isSupportedUrl(intentUrl)) return null
  if (intent.protocol !== 'https:') return null
  if (!sameHost(intent.hostname, source.hostname)) return null
  if (pathNoTrail(intent) !== pathNoTrail(source)) return null
  if (!portsCompatible(intent, source)) return null
  return `${intent.origin}${pathNoTrail(intent)}`
}
