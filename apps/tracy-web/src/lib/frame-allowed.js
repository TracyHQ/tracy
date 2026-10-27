/**
 * May a page at `origin` put this demo in an iframe? The browser's own rule, computed here.
 *
 * WHY THE SERVER ANSWERS THIS. A template card wants to show its demo LIVE, scaled into the card,
 * the way a design-system card shows its fixture. But a cross-origin iframe that the demo refuses
 * (`frame-ancestors`, `X-Frame-Options`) still fires `load` and paints Chrome's "refused to
 * connect" page inside the frame — nothing on the client can tell a refusal from a demo. Only a
 * reader of the demo's response headers can, and that is `lib/demo-frame.js`, which hands the
 * headers to this function.
 *
 * THE RULE, as browsers apply it (CSP3 §7.8): when any policy carries `frame-ancestors`, those
 * directives decide and `X-Frame-Options` is ignored; every policy present must allow. Without
 * `frame-ancestors`, `X-Frame-Options` decides (`DENY` never, `SAMEORIGIN` only the demo itself,
 * `ALLOW-FROM` is dead and read as a refusal). No header at all means framable.
 *
 * A source in `frame-ancestors` is `'self'`, `'none'`, `*`, a scheme (`https:`), or a host source
 * (`https://*.tracy.ai`, `http://localhost:*`, `https://cowork.tracy.site`): scheme optional, host
 * with an optional leading `*.` that matches any subdomain (never the bare host), port optional
 * with `*` for any. Pure, so the table in `test/frame-allowed.test.mjs` is the whole contract.
 */

const DEFAULT_PORT = { 'https:': '443', 'http:': '80' }

/** `https://cowork.tracy.site` → parts; anything that is not exactly an origin → null. */
function originParts(value) {
  if (typeof value !== 'string' || value === '') return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.origin !== value || !(url.protocol in DEFAULT_PORT)) return null
  return { scheme: url.protocol, host: url.hostname, port: url.port || DEFAULT_PORT[url.protocol] }
}

/** Every `frame-ancestors` source list on the answer, one array per policy that has the directive. */
function frameAncestorLists(csp) {
  const lists = []
  // `fetch` joins repeated headers with ", " — a CSP directive never contains a comma, so splitting
  // on it gives the policies back one by one.
  for (const policy of String(csp ?? '').split(',')) {
    for (const directive of policy.split(';')) {
      const tokens = directive.trim().split(/\s+/)
      if (tokens[0]?.toLowerCase() === 'frame-ancestors') lists.push(tokens.slice(1))
    }
  }
  return lists
}

/** Does one host-source (`https://*.tracy.ai`, `localhost:*`, `cowork.tracy.site`) match the origin? */
function hostSourceMatches(source, origin) {
  const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:*]+)(?::(\*|\d+))?$/i.exec(source)
  if (!m) return false
  const [, scheme, anySub, host, port] = m
  if (scheme && `${scheme.toLowerCase()}:` !== origin.scheme) return false
  const wantHost = host.toLowerCase()
  const haveHost = origin.host.toLowerCase()
  if (anySub ? !haveHost.endsWith(`.${wantHost}`) : haveHost !== wantHost) return false
  if (port === undefined) return scheme ? origin.port === DEFAULT_PORT[origin.scheme] : true
  return port === '*' || port === origin.port
}

function listAllows(list, origin, demo) {
  for (const raw of list) {
    const source = raw.replace(/^'(.*)'$/, '$1')
    const quoted = raw.startsWith("'")
    if (quoted && source.toLowerCase() === 'none') return false
    if (quoted && source.toLowerCase() === 'self') {
      if (demo && demo.scheme === origin.scheme && demo.host === origin.host && demo.port === origin.port)
        return true
      continue
    }
    if (source === '*') return true
    if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) {
      if (source.toLowerCase() === origin.scheme) return true
      continue
    }
    if (hostSourceMatches(source, origin)) return true
  }
  return false
}

/**
 * @param {{ csp?: string | null, xfo?: string | null, demoOrigin?: string | null }} headers - the
 *   demo's `content-security-policy` and `x-frame-options` values as `fetch` hands them over, and
 *   the demo's own origin (what `'self'` and `SAMEORIGIN` mean).
 * @param {unknown} origin - the page that wants to frame it: exactly an origin, nothing more.
 * @returns {{ allowed: boolean, reason: 'frame-ancestors' | 'x-frame-options' | 'none' | 'bad-origin' }}
 */
export function frameAllowed({ csp = null, xfo = null, demoOrigin = null } = {}, origin) {
  const who = originParts(origin)
  if (!who) return { allowed: false, reason: 'bad-origin' }
  const demo = originParts(demoOrigin)
  const lists = frameAncestorLists(csp)
  if (lists.length > 0)
    return { allowed: lists.every((list) => listAllows(list, who, demo)), reason: 'frame-ancestors' }
  const option = String(xfo ?? '')
    .trim()
    .toUpperCase()
  if (option === '') return { allowed: true, reason: 'none' }
  if (option === 'SAMEORIGIN')
    return {
      allowed: Boolean(
        demo && demo.scheme === who.scheme && demo.host === who.host && demo.port === who.port
      ),
      reason: 'x-frame-options'
    }
  return { allowed: false, reason: 'x-frame-options' }
}
