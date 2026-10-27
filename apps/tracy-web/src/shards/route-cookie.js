/**
 * The master's routing cookie (docs/sre/2026-10-15-shard-beta-design.md §1, §2.2; review amendment
 * 1): a browser carrying `__Host-tracy_shard=<name>` that opens one of the master's own PAGES is sent to that
 * shard. An ALLOWLIST, not a blocklist: only a page navigation (`GET`, `Accept: text/html`) to a
 * path a person works on moves. The sign-in doors never do — the shard's `/login` sends a browser to
 * the master's `/login?next=`, and moving that one would bounce it between the two for ever.
 *   signed in here   → `/login?next=<shard URL>`, where the ticket is issued (`sign-in.js`)
 *   signed out       → the same address on the shard (its own session may still hold)
 *   `?stay=1`        → the pointer is dropped and the master answers the same address
 *   `/new/?fresh=1`  → never the pointer: the person's full shard sent them here to start on another (`fresh`)
 */
import { clearShardCookie, parseCookies, shardCookieName } from '../lib/cookies.js'
import { sessionFromCookieHeader } from '../lib/session.js'

const NEVER =
  /^\/(?:login|verify|auth|signin|handoff|invite|ops|api|github|v1|_host|_shard|docs|design-inspiration|health)(?:[/?]|$)/
const STATIC_FILE = /\.(?:js|mjs|css|map|ico|png|jpe?g|gif|svg|webp|json|txt|xml|webmanifest|woff2?)$/i

/** `/`, `/new`, `/new/*`, `/sites*`, `/account*`, and `/<siteKey>[/*]` — a first segment with a dot that is not a file. */
export function isUserPage(pathname) {
  if (NEVER.test(pathname)) return false
  if (pathname === '/' || pathname === '/new' || pathname.startsWith('/new/')) return true
  if (/^\/(?:sites|account)/.test(pathname)) return true
  const first = pathname.split('/')[1] ?? ''
  return first.includes('.') && !STATIC_FILE.test(first)
}

/**
 * @param {{config: object, book: {get: (name: string) => Promise<{origin: string} | null>},
 *   isTracyHost: (c: import('hono').Context) => boolean,
 *   fresh?: ((c: import('hono').Context, email: string) => Promise<Response | null>) | null}} deps
 */
export function routeCookie({ config, book, isTracyHost, fresh = null }) {
  return async (c, next) => {
    if (c.req.method !== 'GET' || !isTracyHost(c)) return next()
    const url = new URL(c.req.url)
    const html = (c.req.header('accept') ?? '').includes('text/html')
    // A full shard sends its person back to start on another (contract §12): never back to the pointer.
    if (fresh && html && url.searchParams.get('fresh') === '1' && /^\/new\/?$/.test(url.pathname)) {
      const email = await sessionFromCookieHeader(c.req.header('cookie') ?? null, config.sessionSecret)
      c.header('cache-control', 'no-store')
      if (!email) return c.redirect(`/login?next=${encodeURIComponent(`${config.origin}/new/?fresh=1`)}`, 302)
      return (await fresh(c, email)) ?? next()
    }
    const pointer = parseCookies(c.req.header('cookie') ?? null).get(shardCookieName(config.secure))
    if (!pointer) return next()
    if (url.searchParams.get('stay') === '1') {
      c.header('set-cookie', clearShardCookie({ secure: config.secure }))
      url.searchParams.delete('stay')
      c.header('cache-control', 'no-store')
      return c.redirect(`${config.origin}${url.pathname}${url.search}`, 302)
    }
    if (!html || !isUserPage(url.pathname)) return next()
    let shard
    try {
      shard = await book.get(pointer)
    } catch (error) {
      // The shard table cannot be read: the page is the master's own, as without a pointer.
      console.warn(`[shards] shard table not read for the routing cookie: ${error?.message ?? error}`)
      return next()
    }
    if (!shard) return next()
    const there = `${shard.origin}${url.pathname}${url.search}`
    const signedIn = await sessionFromCookieHeader(c.req.header('cookie') ?? null, config.sessionSecret)
    c.header('cache-control', 'no-store')
    return c.redirect(signedIn ? `/login?next=${encodeURIComponent(there)}` : there, 302)
  }
}
