// Mapping a site route to the route of a live source, for a source that may serve without URL rewriting.
//
// A Joomla site without SEF rewrite answers its pages under /index.php/<path> (`/contact` → 404,
// `/index.php/contact` → 200). Every live step that reads a source route resolves it here: the
// route as given, the same route under /index.php, and the real hrefs the source's own home page
// links to. A pair of hosts that both answer 200 on `/` but whose routes cannot be resolved is a
// failure of the tool (`resolveSourceRoutes` reports it as `failed`), never a pass or a note.
// A route the page map declares as not-found (a 404 page pair) is resolved to the status it is declared
// to answer (`expect`), on the source as on the port; every other route must answer 200.
export const NO_REWRITE_PREFIX = '/index.php'
const FETCH_MS = 25000

/** One GET: { status, html, url }. Never throws; a network error is status 0 with `error`. */
export async function defaultFetchPage(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_MS), headers: { 'user-agent': 'tracy-source-routes' } })
    return { status: res.status, html: await res.text(), url: res.url }
  } catch (e) {
    return { status: 0, html: '', url, error: String(e.message).split('\n')[0] }
  }
}

const trimSlash = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p)

/** The pathnames (same origin) of the <a href> of a page: the menu's real hrefs. */
export function pageHrefs(html, origin) {
  const out = new Set()
  for (const m of String(html ?? '').matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    try {
      const u = new URL((m[1] ?? m[2]).replace(/&amp;/g, '&'), `${origin}/`)
      if (u.origin === origin && (u.protocol === 'http:' || u.protocol === 'https:')) out.add(u.pathname + u.search)
    } catch {
      /* not a URL */
    }
  }
  return [...out]
}

/** The ordered candidate paths for `route`: as given, under the no-rewrite prefix, and any real href of the source that ends in it. */
export function routeCandidates(route, { hrefs = [], prefix = '' } = {}) {
  if (typeof route !== 'string' || !route.startsWith('/')) throw new Error(`route ${JSON.stringify(route)} must be a path starting with /`)
  const bare = trimSlash(route)
  const out = []
  const add = (p) => { if (!out.includes(p)) out.push(p) }
  const withPrefix = (pre) => (route === '/' ? `${pre}/` : `${pre}${bare}`)
  if (prefix) add(withPrefix(prefix))
  add(route)
  if (route !== '/') add(`${bare}/`)
  add(withPrefix(NO_REWRITE_PREFIX))
  if (route !== '/') add(`${NO_REWRITE_PREFIX}${bare}/`)
  for (const h of hrefs) {
    const p = h.split('?')[0]
    if (route !== '/' && (trimSlash(p) === bare || trimSlash(p) === `${NO_REWRITE_PREFIX}${bare}`)) add(h)
  }
  return out
}

/**
 * Resolve one route on `origin`: the first candidate that answers `status` (200 unless the page map declares
 * the route to answer otherwise) on the same origin.
 * → { url, html, via, tried[] } with `url` null when none answered. `via` is 'direct', 'prefix' or 'href'.
 */
export async function resolveSourceRoute(origin, route, { fetchPage = defaultFetchPage, hrefs = [], prefix = '', status = 200 } = {}) {
  const tried = []
  for (const cand of routeCandidates(route, { hrefs, prefix })) {
    const url = new URL(cand, `${origin}/`).href
    const p = await fetchPage(url)
    tried.push(`${url} → ${p.status || p.error || 'no answer'}`)
    if (p.status === status && new URL(p.url ?? url).origin === origin) {
      const path = new URL(p.url ?? url).pathname
      const via = hrefs.includes(cand) && !cand.startsWith(NO_REWRITE_PREFIX) && cand !== route ? 'href' : path.startsWith(`${NO_REWRITE_PREFIX}/`) && !route.startsWith(NO_REWRITE_PREFIX) ? 'prefix' : 'direct'
      return { url: p.url ?? url, html: p.html, via, tried }
    }
  }
  return { url: null, html: null, via: null, tried }
}

/**
 * Resolve every route of a pair of hosts. Reads the source's `/` first (the menu's hrefs). When the host answers
 * 200 on `/` and a route cannot be resolved, `failed` names it: a tool failure, not an environment note.
 * `expect` maps a route to the status the page map declares it to answer (a 404 page pair): that status is what
 * resolves it. → { prefix, results: Map-like object route → resolution, failed: [{ route, reason }], homeStatus }
 */
export async function resolveSourceRoutes(origin, routes, { fetchPage = defaultFetchPage, expect = {} } = {}) {
  const home = await fetchPage(`${origin}/`)
  const hrefs = home.status === 200 ? pageHrefs(home.html, origin) : []
  const results = {}
  const failed = []
  let prefix = ''
  for (const route of routes) {
    // the host did not answer at all: nothing to resolve against, and no per-route timeouts to wait out
    if (home.status === 0) {
      results[route] = { url: null, html: null, via: null, tried: [`${origin}/ → ${home.error || 'no answer'}`] }
      continue
    }
    if (route === '/') {
      results[route] = home.status === 200 ? { url: home.url ?? `${origin}/`, html: home.html, via: 'direct', tried: [`${origin}/ → 200`] } : { url: null, html: null, via: null, tried: [`${origin}/ → ${home.status || home.error || 'no answer'}`] }
    } else {
      results[route] = await resolveSourceRoute(origin, route, { fetchPage, hrefs, prefix, status: expect[route] ?? 200 })
      if (results[route].via === 'prefix' && !prefix) prefix = NO_REWRITE_PREFIX
    }
    if (!results[route].url && home.status === 200) failed.push({ route, reason: `${origin} answers 200 on / but ${route} cannot be resolved${expect[route] ? ` to its declared ${expect[route]}` : ''} (${results[route].tried.slice(-4).join('; ')})` })
  }
  return { prefix, results, failed, homeStatus: home.status }
}

/**
 * Whether ONE prefix ('' or '/index.php') describes how a source answers every route: every route is probed (not a sample).
 * → { prefix, mixed: boolean, unresolved: [route] }. A source whose routes answer some directly and some only under /index.php is
 * `mixed`: no single prefix is right for it, and a caller that builds URLs from one prefix must stop.
 */
export async function sourcePrefixPlan(origin, routes, { fetchPage = defaultFetchPage } = {}) {
  const probe = [...new Set(routes.filter((r) => r !== '/'))]
  if (!probe.length) return { prefix: '', mixed: false, unresolved: [] }
  const { results, homeStatus } = await resolveSourceRoutes(origin, probe, { fetchPage })
  const vias = probe.map((r) => results[r].via)
  const unresolved = homeStatus === 200 ? probe.filter((r) => !results[r].via) : []
  const prefixed = vias.filter((v) => v === 'prefix').length
  const resolved = vias.filter(Boolean).length
  const mixed = prefixed > 0 && prefixed < resolved
  return { prefix: prefixed && prefixed === resolved ? NO_REWRITE_PREFIX : '', mixed, unresolved }
}

/** The source prefix every route shares ('' when none, or when the source is mixed): for the tools that build URLs themselves. */
export async function detectSourcePrefix(origin, routes, opts = {}) {
  return (await sourcePrefixPlan(origin, routes, opts)).prefix
}
