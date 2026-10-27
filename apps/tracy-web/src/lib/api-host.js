/**
 * Is this request on the API host (`API_ORIGIN`, e.g. `api.tracy.ai`) — the one hostname where the
 * public `/v1` API answers and where no session cookie is ever read (tasks/todo-api-public.md Q1, Q5).
 *
 * The ONE implementation of that question. `bar/route.js`'s `hostKind` answers `{kind: 'api'}`
 * through it, `app.js`'s host gate calls it directly, and `sites/route.js` receives it as a
 * dependency (`isApiHost`) to accept a key principal only there — three readers, one comparison, so
 * they cannot drift into "the bar thinks it is the API host, the door does not".
 *
 * Hostnames only: the port and the case of the `Host` header do not matter (a proxy may add or
 * drop the port), and the scheme is `API_ORIGIN`'s business, not the request's. `config.js`
 * already refuses an `API_ORIGIN` whose hostname equals `TRACY_ORIGIN`'s, so the answer here never
 * competes with "Tracy's own hostname".
 */

/** The API host's hostname, lowercase, or null when this deployment has no API host. */
export function apiHostname(config) {
  const origin = config?.apiOrigin
  if (typeof origin !== 'string' || origin === '') return null
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    // `readConfig` refuses an unparsable origin at boot; a hand-built config that slips one in
    // reads as "no API host", never as "every host is the API host".
    return null
  }
}

/**
 * @param {string|null|undefined} hostHeader - the raw `Host` header, port and all.
 * @param {object} config - `readConfig`'s value (`apiOrigin`).
 * @returns {boolean}
 */
export function isApiHost(hostHeader, config) {
  const expected = apiHostname(config)
  if (!expected) return false
  const hostname = String(hostHeader ?? '')
    .split(':')[0]
    .toLowerCase()
    .trim()
  return hostname !== '' && hostname === expected
}
