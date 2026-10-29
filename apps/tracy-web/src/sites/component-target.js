/**
 * Which copy of an IMPORTED site the Apply door writes to.
 *
 * 🔒 THE REGISTERED ENDPOINT IS THE CUSTOMER'S LIVE SITE. The import installs the component on the
 * source site and registers it from there (`tracy-add-site/src/host/run.ts`,
 * `registerComponentCredential`) — that is the only place its token can be read. Used as-is, every
 * `tracy_site` call from the site's Tracy workspace landed in production: measured 14/09 on
 * fijitrips.example, an agent asked to remove a banner disabled a plugin on the live site, while
 * the workspace's files, shell and address all showed the fleet copy.
 *
 * The fleet copy carries the same component with the same token — the database was copied with
 * the webroot — so the endpoint keeps its path and query and moves to the copy's own origin, the
 * same address `siteTarget` gives every server-side call to a site.
 */
import { siteTarget } from './resolver.js'

/**
 * @param {string} registered - the endpoint the import registered (the live site's).
 * @param {{label: string, host: string, platform?: string}} site - the site row.
 * @param {{hostName?: string, siteDomain: string}} config
 * @returns {string|null} the same endpoint on the fleet copy, or null when `registered` is not a URL.
 */
export function copyEndpointFor(registered, site, config) {
  let live
  try {
    live = new URL(registered)
  } catch {
    return null
  }
  return new URL(`${live.pathname.replace(/^\/+/, '')}${live.search}`, siteTarget(site, config)).href
}

/**
 * @param {string} endpoint - an endpoint from `site_component`.
 * @param {{label: string, host: string, platform?: string}} site
 * @param {{hostName?: string, siteDomain: string}} config
 * @returns {boolean} true when the endpoint already points at the fleet copy.
 */
export function isOnCopy(endpoint, site, config) {
  try {
    return new URL(endpoint).origin === siteTarget(site, config).origin
  } catch {
    return false
  }
}

/**
 * Every door of the copy that may answer for the registered one, the registered door first. A Joomla
 * site answers Claude Cowork on its front door and on its administrator door (`tracy-add-site`
 * `doors.mjs` `apiDoors`): an import keeps whichever answered the LIVE site, and a front end that was
 * gated there (offline, coming soon, a firewall extension) left the administrator door registered.
 * The copy may answer the other one, so it is asked too — the same component, the same token.
 * Import can place a CMS from a live subdirectory at the copy's webroot. Try the original door(s)
 * first, then the root one(s), Joomla and WordPress alike: every candidate stays on the copy and
 * must pass manifest verification.
 * @param {string} registered - the endpoint the import registered (the live site's).
 * @param {{label: string, host: string, platform?: string}} site
 * @param {{hostName?: string, siteDomain: string}} config
 * @returns {string[]} the endpoints on the copy, in the order to ask; empty when `registered` is not a URL.
 */
export function copyDoorsFor(registered, site, config) {
  const first = copyEndpointFor(registered, site, config)
  if (first === null) return []
  const url = new URL(first)
  // A WordPress copy is pinned to its own root (WP_HOME / WP_SITEURL), so a live `/blog` install
  // answers at the copy's root door.
  if (site.platform === 'wordpress' && url.searchParams.get('action') === 'claude_cowork') {
    const root = new URL(url.href)
    root.pathname = '/wp-admin/admin-ajax.php'
    return [...new Set([first, root.href])]
  }
  if (site.platform !== 'joomla') return [first]
  if (url.searchParams.get('option') !== 'com_claudecowork') return [first]
  const admin = /\/administrator\/index\.php$/.exec(url.pathname)
  const front = !admin && /\/index\.php$/.exec(url.pathname)
  if (!admin && !front) return [first]
  const other = new URL(url.href)
  other.pathname = admin
    ? url.pathname.replace(/administrator\/index\.php$/, 'index.php')
    : url.pathname.replace(/index\.php$/, 'administrator/index.php')
  const root = new URL(url.href)
  root.pathname = admin ? '/administrator/index.php' : '/index.php'
  const rootOther = new URL(other.href)
  rootOther.pathname = admin ? '/index.php' : '/administrator/index.php'
  return [...new Set([first, other.href, root.href, rootOther.href])]
}

/**
 * Why a copy's door was not verified: the ones another door of the same copy may still answer
 * ({@link copyDoorsFor}) — it did not reach the Claude Cowork plugin at all.
 */
export const DOOR_WHYS = new Set(['not_json', 'not_engine', 'redirected'])

/** @param {unknown} error @returns {boolean} */
const cutByTime = (error) =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')

/** @param {unknown} error @returns {string} the network code under a fetch failure, or ''. */
const causeCode = (error) => {
  const cause = /** @type {any} */ (error)?.cause
  return String(cause?.code ?? cause?.message ?? '')
}

/**
 * One `core.manifest` on a copy's door, and what it says: `verified`, or why not.
 *
 * 🔒 ONLY A COPY STILL STARTING IS "WARMING UP" (beta report, 26/10/2026). Every failure that was not
 * a timeout used to read `unreachable`, which the agent tells the customer as "retry in a moment": a
 * re-imported Joomla copy said so for a day. Measured with node's own fetch: a redirect throws
 * `unexpected redirect`, a container that does not exist throws `ENOTFOUND`, a PHP fatal answers 500 —
 * none of them changes by waiting. Those are `redirected`, `no_copy` and `copy_error` now; a refused
 * connection (`ECONNREFUSED`, the web server not up yet) and a gateway's 502/503/504 stay
 * `unreachable`, and a call cut by its budget `timeout`. A door that answers JSON without the
 * engine's `ok` (Joomla's own error for a guest) is `not_engine`, not a wrong token.
 * @param {{ fetchImpl: typeof fetch, endpoint: string, token: string, platform: string, budgetMs: number }} input
 * @returns {Promise<string>} `verified`, or one of the `FleetCopyWhy` reasons.
 */
export async function verifyCopy({ fetchImpl, endpoint, token, platform, budgetMs }) {
  let response
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, action: 'core.manifest', params: {} }),
      redirect: 'error',
      signal: AbortSignal.timeout(budgetMs)
    })
  } catch (error) {
    if (cutByTime(error)) return 'timeout'
    const code = causeCode(error)
    if (/redirect/i.test(code)) return 'redirected'
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'no_copy'
    return 'unreachable'
  }
  let text
  try {
    text = await response.text()
  } catch (error) {
    // The body can be cut by the same signal while it streams in.
    return cutByTime(error) ? 'timeout' : 'unreachable'
  }
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  const engine =
    body !== null && typeof body === 'object' && !Array.isArray(body) && typeof body.ok === 'boolean'
  if (!engine) {
    // A gateway answering for a copy whose web server is not up yet; any other 5xx is the site's own.
    if (response.status === 502 || response.status === 503 || response.status === 504) return 'unreachable'
    if (response.status >= 500) return 'copy_error'
    return body === null ? 'not_json' : 'not_engine'
  }
  if (response.status === 401 || response.status === 403 || body.error === 'unauthorized')
    return 'unauthorized'
  if (response.status >= 500) return 'unreachable'
  if (!response.ok || body.ok !== true) return 'refused'
  if (body.manifest?.platform !== platform) return 'platform_mismatch'
  return 'verified'
}
