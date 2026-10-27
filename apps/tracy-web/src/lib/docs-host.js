/**
 * Is this request on the documentation host (`DOCS_ORIGIN`, e.g. `docs.tracy.ai`) — the hostname
 * that serves `apps/tracy-docs` at its root and the interactive API reference at `/api/reference/`,
 * and nothing of Tracy's own surface (tasks/todo-desktop-update-policy.md H2).
 *
 * The ONE implementation of that question, as `api-host.js` is for the API host: `bar/route.js`'s
 * `hostKind` answers `{kind: 'docs'}` through it and `app.js`'s docs-host gate calls it directly.
 * Hostnames only — the port and the case of the `Host` header do not matter. `config.js` refuses a
 * `DOCS_ORIGIN` whose hostname is Tracy's own, the API host's or the update host's, so the answer
 * here never competes with theirs.
 */

/** The docs host's hostname, lowercase, or null when this deployment has no docs host. */
export function docsHostname(config) {
  const origin = config?.docsOrigin
  if (typeof origin !== 'string' || origin === '') return null
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    // `readConfig` refuses an unparsable origin at boot; a hand-built config that slips one in
    // reads as "no docs host", never as "every host is the docs host".
    return null
  }
}

/**
 * @param {string|null|undefined} hostHeader - the raw `Host` header, port and all.
 * @param {object} config - `readConfig`'s value (`docsOrigin`).
 * @returns {boolean}
 */
export function isDocsHost(hostHeader, config) {
  const expected = docsHostname(config)
  if (!expected) return false
  const hostname = String(hostHeader ?? '')
    .split(':')[0]
    .toLowerCase()
    .trim()
  return hostname !== '' && hostname === expected
}
