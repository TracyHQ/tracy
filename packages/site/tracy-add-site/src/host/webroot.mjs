/**
 * The webroot as the site itself spells it — host redirects followed, path redirects not.
 *
 * The token path of an import has no admin session to learn the webroot from: it takes the site
 * key, and the site key has `www.` stripped. A site whose canonical host is `www.` answers the
 * apex with a 301 — and `fetch` turns a redirected POST into a GET with no body, so the engine
 * sees no token and refuses. A correct token failed on joomlart.com that way on 2026-09-06, and it
 * fails the same way on every www-canonical site. The admin path never had the problem: it derives
 * the webroot from the login URL after redirects.
 *
 * Only redirects that keep the path are followed. A site that sends `/` to `/en/` or `/home` has
 * not moved its webroot — the component still answers under the root — and following that hop
 * would put `index.php?option=…` under a language prefix the engine was never asked to answer on.
 *
 * A same-host hop that only drops https→http is a downgrade of an origin the site just served
 * over https, not a new webroot; `nextRedirectUrl` (`url-policy.mjs`) rewrites it back to https so
 * the token path derives an https webroot the seat book will accept. An ordinary http→https
 * upgrade, an apex→www move, and a genuinely-http local site all pass through as before.
 *
 * Only a TRUSTED hop is followed — the same origin as the address given, or its apex/www variant,
 * without a scheme downgrade (`isTrustedHop`). This matters because the caller POSTs the source
 * token to whatever webroot this returns: an untrusted host, or a downgrade of an https flow, must
 * never become the address the token is sent to. A network error or a redirect cycle on an https
 * address returns that https address unchanged — never a silent fall back to an insecure one.
 *
 * Plain JavaScript, like `doors.mjs`, so `node --test` pins it without a TypeScript loader. The
 * TypeScript half imports it.
 */

import { isTrustedHop, nextRedirectUrl } from './url-policy.mjs'

const USER_AGENT = 'Tracy/1.0 (+https://tracy.ai)'
const MAX_HOPS = 5
const TIMEOUT_MS = 15_000

/** `https://host/path/` → `https://host/path` — the shape `apiDoors` and `apiEndpoint` build on. */
const trimRoot = (/** @type {string} */ url) => url.replace(/\/+$/, '')

/** The path of a URL with any trailing slashes removed, so `/office` and `/office/` compare equal. */
const pathOf = (/** @type {URL} */ url) => url.pathname.replace(/\/+$/, '')

/**
 * Where the site really answers, starting from the webroot the token path was given.
 * @param {string} webRootUrl The webroot as typed or derived, with or without a trailing slash.
 * @param {typeof fetch} [fetchImpl] The fetch to use — injected by the tests.
 * @returns {Promise<string>} The resolved webroot, or the given one when the site never redirected or never answered.
 */
export async function resolveWebRoot(webRootUrl, fetchImpl = fetch, headers = {}) {
  const anchor = `${trimRoot(webRootUrl)}/`
  const anchorOrigin = new URL(anchor).origin
  let current = new URL(anchor)
  // The scheme floor: once a hop has been on https, no later hop may step down to http.
  let secure = current.protocol === 'https:'
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    /** @type {{ status: number; headers: { get(name: string): string | null } }} */
    let response
    try {
      response = await fetchImpl(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        // Keep caller credentials on the origin the customer supplied. An http→https hop changes
        // origin even on the same host, so it must not carry Authorization either.
        headers: {
          ...(current.origin === anchorOrigin ? headers : {}),
          'user-agent': USER_AGENT
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch {
      // A network error keeps the last address that answered — an https anchor stays https rather
      // than falling back to anything insecure.
      break
    }
    if (current.protocol === 'https:') secure = true
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
    if (!location) break
    const resolved = nextRedirectUrl(current.toString(), location)
    if (!resolved) break
    let next
    try {
      next = new URL(resolved)
    } catch {
      break
    }
    // Only a trusted hop is followed: the token this webroot will receive must not be sent to
    // another host or to a downgraded origin. An untrusted redirect stops here, on the last
    // trusted address.
    if (!isTrustedHop(anchor, resolved, { secure })) break
    // A hop that moves the path is a landing page or a language prefix, not a new webroot.
    if (pathOf(next) !== pathOf(current)) break
    current = next
  }
  return trimRoot(`${current.origin}${current.pathname}`)
}
