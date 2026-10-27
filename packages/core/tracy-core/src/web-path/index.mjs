/**
 * Resolve Tracy HTTP doors explicitly for an authenticated native widget document.
 *
 * Refused: anything but a same-origin absolute path, a backslash or a fragment anywhere, and an encoded dot, slash or
 * backslash in the PATH (a way to climb out of the door under the native widget's backend prefix). The query string is
 * not the path: `URLSearchParams` writes a slash in a value as `%2F` (a quickstart tag such as
 * `quickstart/ja-kinetic/j6`), and refusing that silently broke every door asked with such a value (19/10/2026: the
 * Add site form lost its Design system card because the support door was never asked).
 * @param {string} path
 * @param {{pathname?:string}} [where]
 * @returns {string}
 */
export function tracyWebPath(path, where = globalThis.location) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /\\|#/.test(path))
    throw Error('TRACY_WEB_PATH_INVALID')
  const query = path.indexOf('?')
  const pathname = query === -1 ? path : path.slice(0, query)
  if (/%(?:2e|2f|5c)/i.test(pathname)) throw Error('TRACY_WEB_PATH_INVALID')
  return where?.pathname === '/widget/native' || where?.pathname?.startsWith('/widget/native/')
    ? '/widget/native/backend' + path
    : path
}

/**
 * Explicit module-local fetch adapter; never installs a global fetch interceptor.
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export function tracyWebFetch(path, init) {
  return globalThis.fetch(tracyWebPath(path), init)
}
