/**
 * Where this host half calls Tracy back — the artifact doors and the component-credential door.
 *
 * 🔒 THE BROWSER'S ADDRESS IS NOT AN ADDRESS THIS CONTAINER CAN DIAL. `x-forwarded-host` is what
 * the viewer typed, and on a laptop that is `tracy.test:51710`: the name resolves to tracy-web
 * through the local dnsmasq, but 51710 is the HOST publish, and nothing listens on it inside
 * tracy-dsh. Measured 14/09: an import signed in and installed the extension, then died at
 * `reading_content` with `TypeError: fetch failed` while every service reported healthy.
 *
 * `MCP_TRACY_ORIGIN` is the dsh's own answer to "where does Tracy answer me" — the password gate
 * and `tracy-site-tools`' Apply relay already read it, and `deploy/compose.macos.yml` points it at
 * `http://tracy-web:8080`. On a server it IS the public origin, so preferring it changes nothing
 * there. A value that is not an http(s) URL is ignored rather than dialled.
 *
 * @param {{configured?: string|null, forwardedHost?: string, forwardedProto?: string, host?: string}} input
 * @returns {string} an origin with no trailing slash, or '' when nothing names one
 */
export function callbackOrigin({ configured, forwardedHost, forwardedProto, host } = {}) {
  const set = typeof configured === 'string' ? configured.trim() : ''
  if (/^https?:\/\/[^/\s]+/i.test(set)) return set.replace(/\/+$/, '')
  const where = forwardedHost || host || ''
  return where ? `${forwardedProto || 'http'}://${where}` : ''
}
