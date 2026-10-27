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
