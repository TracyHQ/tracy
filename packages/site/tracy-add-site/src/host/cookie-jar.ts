/**
 * The cookies of one site, kept across every request of a Joomla sign-in and the installer flow
 * after it.
 *
 * 🔒 MERGE, NEVER REPLACE. The importer used to keep one header string and overwrite it with
 * whatever the last response set: a site that sets two cookies on the login page (a load balancer's
 * sticky cookie beside Joomla's session) lost the first on the login POST, and the installer lost
 * the session itself the moment a page set an unrelated cookie (a language or consent cookie). Both
 * then read as a wrong password or a signed-out installer. A Set-Cookie now updates only the cookie
 * it names, at the path it names.
 *
 * 🔒 ONE SITE ONLY. A cookie belongs to the site that set it, and `www.` and the bare host are the
 * same site (the sign-in routinely redirects between them); any other host gets none of them, even
 * if a caller asks. `Path` and `Secure` are kept the way a browser keeps them.
 */

interface StoredCookie {
  name: string
  value: string
  site: string
  path: string
  secure: boolean
  expiresAt: number
}

/** RFC 6265 cookie-name token: no separators, controls or whitespace. */
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

/** The site a host belongs to: lower case, without a leading `www.` or dot. */
export function siteOf(host: string): string {
  return host
    .toLowerCase()
    .replace(/^\.+/, '')
    .replace(/^www\./, '')
}

function parse(url: string): URL | undefined {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

/** RFC 6265 §5.1.4 default path: the request path up to, not including, its last `/`. */
function defaultPath(pathname: string): string {
  if (!pathname.startsWith('/')) return '/'
  const last = pathname.lastIndexOf('/')
  return last <= 0 ? '/' : pathname.slice(0, last)
}

/** RFC 6265 §5.1.4 path-match. */
function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true
  if (!requestPath.startsWith(cookiePath)) return false
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/'
}

/**
 * When a Set-Cookie stops being valid, in epoch ms; `Infinity` for a session cookie. `Max-Age` wins
 * over `Expires`; an unreadable one counts as expired, never as live.
 */
function expiryOf(maxAge: string | undefined, expires: string | undefined, now: number): number {
  if (maxAge !== undefined) {
    if (!/^-?\d+$/.test(maxAge)) return Number.NEGATIVE_INFINITY
    const seconds = Number(maxAge)
    return seconds <= 0 ? Number.NEGATIVE_INFINITY : now + seconds * 1000
  }
  if (expires !== undefined) {
    const at = Date.parse(expires)
    return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at
  }
  return Number.POSITIVE_INFINITY
}

export class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>()

  /** A jar holding a plain `cookie` header's pairs, scoped to `url`'s site at path `/`. */
  static fromHeader(header: string, url: string): CookieJar {
    const jar = new CookieJar()
    const site = siteOf(parse(url)?.hostname ?? '')
    if (!site) return jar
    for (const pair of header.split(';')) {
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      if (!COOKIE_NAME.test(name)) continue
      jar.put({
        name,
        value: pair.slice(eq + 1).trim(),
        site,
        path: '/',
        secure: false,
        expiresAt: Number.POSITIVE_INFINITY
      })
    }
    return jar
  }

  /** Take every Set-Cookie of `response`, which answered a request to `url`. */
  absorb(response: Response, url: string): void {
    const from = parse(url)
    if (!from) return
    const now = Date.now()
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = raw.split(';')
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      if (!COOKIE_NAME.test(name)) continue
      let path: string | undefined
      let domain: string | undefined
      let maxAge: string | undefined
      let expires: string | undefined
      let secure = false
      for (const attribute of attributes) {
        const at = attribute.indexOf('=')
        const key = (at < 0 ? attribute : attribute.slice(0, at)).trim().toLowerCase()
        const value = at < 0 ? '' : attribute.slice(at + 1).trim()
        if (key === 'path' && value.startsWith('/')) path = value
        else if (key === 'domain' && value) domain = value
        else if (key === 'max-age') maxAge = value
        else if (key === 'expires') expires = value
        else if (key === 'secure') secure = true
      }
      // A Domain attribute naming another site is refused, as a browser refuses it.
      const site = siteOf(from.hostname)
      if (domain !== undefined && siteOf(domain) !== site) continue
      const cookie = {
        name,
        value: pair.slice(eq + 1).trim(),
        site,
        path: path ?? defaultPath(from.pathname),
        secure,
        expiresAt: expiryOf(maxAge, expires, now)
      }
      if (cookie.expiresAt <= now) this.cookies.delete(keyOf(cookie))
      else this.put(cookie)
    }
  }

  /** The `cookie` header for a request to `url`: `''` for another site, or when nothing applies. */
  header(url: string): string {
    const to = parse(url)
    if (!to) return ''
    const site = siteOf(to.hostname)
    const now = Date.now()
    const sent: StoredCookie[] = []
    for (const [key, cookie] of this.cookies) {
      if (cookie.expiresAt <= now) {
        this.cookies.delete(key)
        continue
      }
      if (cookie.site !== site || !pathMatches(to.pathname, cookie.path)) continue
      if (cookie.secure && to.protocol !== 'https:') continue
      sent.push(cookie)
    }
    // Longer paths first, as RFC 6265 §5.4 orders them.
    sent.sort((a, b) => b.path.length - a.path.length)
    return sent.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  }

  private put(cookie: StoredCookie): void {
    const key = keyOf(cookie)
    // Re-inserted so the newest value is also the last one set.
    this.cookies.delete(key)
    this.cookies.set(key, cookie)
  }
}

const keyOf = (cookie: Pick<StoredCookie, 'site' | 'name' | 'path'>): string =>
  `${cookie.site}\n${cookie.path}\n${cookie.name}`
