/**
 * Pure request classification for the QA gate: which site a request targets, which door it is,
 * and which QA-only credentials it carries. No I/O.
 *
 * Exports:
 *   QA_HEADERS: string[]                                   // every header the gate consumes and drops
 *   HUMAN_COOKIE = 'qa_human', SESSION_COOKIE = 'tracy_sess'
 *   hostnameOf(hostHeader: string | undefined): string     // lower case, port removed
 *   siteOf({ hostname, path, mainHost, siteDomain, apiHost? }): string | null
 *   isChatPath(path: string): boolean                      // dsh session.prompt / session.updateQueue
 *   isImportDoor(method, path): boolean
 *   createDoor(method, path): 'claim' | 'create' | null
 *   deleteDoor(method, path): string | null                // the siteKey a site delete names
 *   readCookie(cookieHeader, name): string | null
 *   withoutCookie(cookieHeader, name): string              // '' when nothing is left
 *   emailFromSessionToken(token): string | null            // payload only, signature NOT checked
 */

export const QA_HEADERS = ['x-qa-lane', 'x-qa-admin', 'x-qa-pr', 'x-qa-for-lane']
export const HUMAN_COOKIE = 'qa_human'
export const SESSION_COOKIE = 'tracy_sess'

export function hostnameOf(hostHeader) {
  const h = String(hostHeader ?? '')
    .trim()
    .toLowerCase()
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1)
  return h.split(':')[0]
}

function pathOnly(path) {
  const q = path.indexOf('?')
  return q === -1 ? path : path.slice(0, q)
}

function segments(path) {
  return pathOnly(path)
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s).toLowerCase()
      } catch {
        return s.toLowerCase()
      }
    })
}

const looksLikeSiteKey = (s, siteDomain) =>
  s.includes('.') && (s === siteDomain || s.endsWith(`.${siteDomain}`))

/**
 * The site a request reaches: its own hostname (`qa-x.qa.tracy.test`), the dsh mount `/<siteKey>/…`,
 * a site door `/api/sites/<siteKey>/…`, or a `?site=<siteKey>` parameter. Null = no site.
 *
 * The API host (`apiHost`, the hostname of the stand's `API_ORIGIN`) sits under the site domain
 * but is not a site: tracy-web tells it apart by an exact hostname match before any site routing
 * (`apps/tracy-web/src/lib/api-host.js` `isApiHost`, `app.js`). There the site is the one
 * the public API path names, `/v1/sites/<siteKey>/…` (`lib/v1-routes.js`), so the lane's reach is
 * still checked against it.
 */
export function siteOf({ hostname, path, mainHost, siteDomain, apiHost = null }) {
  const seg = segments(path)
  if (apiHost && hostname === apiHost) {
    return seg[0] === 'v1' && seg[1] === 'sites' && seg[2]?.includes('.') ? seg[2] : null
  }
  if (hostname !== mainHost && hostname.endsWith(`.${siteDomain}`)) return hostname
  if (seg[0] && looksLikeSiteKey(seg[0], siteDomain) && seg[0] !== mainHost) return seg[0]
  if (seg[0] === 'api' && seg[1] === 'sites' && seg[2] && seg[2].includes('.')) return seg[2]
  const q = path.indexOf('?')
  if (q !== -1) {
    const site = new URLSearchParams(path.slice(q + 1)).get('site')
    if (site?.includes('.')) return site.toLowerCase()
  }
  return null
}

/** `session.prompt` and `session.updateQueue`, in either RPC spelling (`/api/session/x`, `/api/session.x`). */
export function isChatPath(path) {
  return /\/api\/session[./](prompt|updatequeue)$/i.test(pathOnly(path))
}

export function isImportDoor(method, path) {
  const seg = segments(path)
  if (seg[0] !== 'api') return false
  return seg.some((s) => s === 'import' || s === 'import-result' || s.startsWith('import-'))
}

export function createDoor(method, path) {
  if (method !== 'POST') return null
  const p = pathOnly(path).replace(/\/+$/, '')
  if (p === '/api/sites/claim') return 'claim'
  if (p === '/api/sites') return 'create'
  return null
}

export function deleteDoor(method, path) {
  if (method !== 'DELETE') return null
  const seg = segments(path)
  if (seg[0] === 'api' && seg[1] === 'sites' && seg[2]?.includes('.')) {
    if (seg.length === 3 || (seg.length === 4 && seg[3] === 'claim')) return seg[2]
  }
  return null
}

export function readCookie(cookieHeader, name) {
  for (const part of String(cookieHeader ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

export function withoutCookie(cookieHeader, name) {
  return String(cookieHeader ?? '')
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p && p.slice(0, p.indexOf('=') === -1 ? p.length : p.indexOf('=')).trim() !== name)
    .join('; ')
}

export function emailFromSessionToken(token) {
  if (typeof token !== 'string') return null
  const [v, payload] = token.split('.')
  if (v !== 'v1' || !payload) return null
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof body.email === 'string' ? body.email.toLowerCase() : null
  } catch {
    return null
  }
}
