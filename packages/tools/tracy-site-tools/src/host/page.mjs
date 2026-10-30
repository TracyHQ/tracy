/**
 * ONE PAGE OF THIS SITE AS A VISITOR GETS IT (PLAN v2 D2): the server's own HTML, read by the site
 * container's curl over loopback, and the answers `page.text` and `page.look`'s gate build from it.
 * Shared by `page.text`, `page.look`'s pre-browser gate and the replace job's locator and proof
 * (Wave 2) — one road into a site's pages, not three. Impure only through the injected `run` (the
 * docker-exec transport, `exec.mjs`), so every rule here is testable without a container.
 *
 * 🔒 WHY THIS ROAD EXISTS, MEASURED. r2 (24/09/2026, suite v2, 99 cases): 66 of 66 `page.text` calls
 * on WordPress and Joomla came back `SITE_UNREACHABLE` — the upstream images carry no node and no
 * chromium, so the in-container node probe could not start — with a `next` telling the agent the site
 * was down. It was up. On EmDash (the one image with a browser) the read worked and cost 7.2 s median,
 * 390 s of the 613 s of EmDash tool time, because the browser waits a fixed 5 s to settle. One curl GET
 * of the server's HTML answers in 0.08–0.98 s on all three, and on the EmDash home its text is
 * byte-identical to what the browser returned. The browser stays, as a fallback, for a page whose
 * server HTML is nearly empty (drawn by JavaScript) and only where a browser exists.
 *
 * 🔒 WHERE THE READ STARTS AND WHAT IT FOLLOWS (D4). The only address ever dialled is
 * `127.0.0.1:<the site's own port>` inside the site's own container (#154). The read starts there, as
 * the probe always did, and each redirect is classified HERE, before anything is asked:
 * - the same origin → followed (Joomla `/` → `/en/`, WordPress `/contact` → `/contact/`);
 * - EXACTLY this deployment's public origin for the site (`publicOriginFor`: the label plus two host
 *   settings, never the `Location` header and never the site folder) → followed AS that origin:
 *   public `Host` + `X-Forwarded-Proto`, still over loopback. On the stand WordPress answers its
 *   loopback with `301 → http://<label>.tracy.test:51710/`, and a fleet site with `https://<label>.<domain>/`;
 * - from loopback, the same host name and scheme on another port (WordPress `redirect_canonical`) →
 *   followed as that authority, still over loopback;
 * - anything else → `REDIRECTED_OFF_SITE`, never asked. On the public route a same-host other-port or
 *   other-scheme redirect is off-site too: the public origin is exact or it is not this site;
 * - a `Location` equal to the address just asked stops at once (`READ_FAILED`, a loop).
 */
import { randomUUID } from 'node:crypto'
import { LABEL } from '../../../tracy-subprocess-docker/src/route.mjs'
import {
  FETCH_MAX_BYTES,
  FETCH_MAX_TIME_S,
  PROBE_MAX_HOPS,
  browserArgv,
  fetchArgv,
  hostBrowserTarget,
  looksLikeMissingBinary,
  loopbackUrl,
  parseBrowser,
  parseFetch
} from './exec.mjs'
import { previewKeyFor, renewPreviewKey } from './preview-key.mjs'
import {
  WHERE_REGIONS,
  decodeEntities,
  foldForMatch,
  isNavElement,
  renderedUnits,
  tameMarkup,
  unitLink,
  unitParts,
  unitRuns
} from './html-units.mjs'
import { styleAnswer } from './look-style.mjs'
import { HEAD_DEFAULT_CHARS, HEAD_KEYS, headAnswer } from './page-head.mjs'
import {
  PAGE_TEXT_DEFAULT_CHARS,
  canonicalTarget,
  lookTarget,
  publicOriginOf,
  readablePage,
  redirectStaysOnSite
} from './site.mjs'

/** The whole budget of one page read across its redirects; a hop starts only with ≥ 1 s of it left. */
export const PAGE_READ_BUDGET_MS = 15_000
/** How long a browser render may take end to end, docker client included (`LOOK_TIMEOUT_MS` in index.ts). */
export const BROWSER_EXEC_MS = 30_000
/** The most a caller may raise one answer to with `maxChars` (T8: `maxChars?:≤8000`). */
export const PAGE_TEXT_MAX_CHARS = 8000
/** An outline's own default cap: 13 saved ja-business pages measured 1,200–4,749 chars (median ≈ 3.5k). */
export const OUTLINE_DEFAULT_CHARS = 5000
/** The shared cap of a several-page answer, without `outline` and with it; never under 300 per page. */
export const PAGES_TEXT_CHARS = 4000
export const PAGES_OUTLINE_CHARS = 5000
export const PAGE_MIN_SHARE_CHARS = 300
/** How many paths one call reads; the rest are listed in `notRead`, never refused. */
export const PAGE_TEXT_MAX_PATHS = 8
/**
 * How many of them are read at once. 🔒 Four, not eight: each is one `docker exec` through the socket
 * proxy (47–231 ms of overhead measured from tracy-dsh), and eight at once from one call would crowd
 * every other conversation's exec on the host.
 */
export const PAGE_PATHS_PARALLEL = 4
/** A page whose readable text is shorter than this AND which carries a script is drawn by JavaScript. */
export const THIN_TEXT_CHARS = 200
/**
 * The most markup one page may carry into the two readers (`readablePage`, {@link pageOutline}) once
 * its scripts, styles, svg and comments are gone ({@link tameMarkup}). 🔒 A PARSE BUDGET, NOT A PAGE
 * LIMIT: both readers are linear now, but at about 1 microsecond a character a 4 MiB read still held the one
 * event loop every site on the host shares for seconds, eight pages a call. The 42 saved ja-business
 * pages carry 3–72 KB after taming (raw 6–147 KB); a page past this refuses READ_FAILED, never cut.
 */
export const PAGE_PARSE_MAX_CHARS = 1024 * 1024
/** Items shown on one nav or list line of an outline before `+N more`. */
export const OUTLINE_NAV_ITEMS = 8
/** A line longer than this is shown cut, with its length, unless `match` picked it. */
export const OUTLINE_P_CHARS = 240

// ── Where the site is, and how it is asked ─────────────────────────────────────────────────────────

/**
 * The deployment's own origin, read for the two things every site address shares with it: scheme and
 * port (`bornSiteAddress` in tracy-web builds `<scheme>//<label>.<siteDomain>[:<port>]` from it, and
 * provisioning writes exactly that into WordPress `home`, Joomla `live_site` and `EMDASH_SITE_URL`).
 * Empty = `https` with no port, every fleet host. Malformed = the same, plus a `problem` for the one
 * boot warning — never a guess, never a refusal of every page.
 * @param {unknown} deploymentOrigin - `config.deploymentOrigin`, else `TRACY_DEPLOYMENT_ORIGIN`.
 * @returns {{ scheme: 'http:' | 'https:', port: string, problem: string | null }}
 */
export function deploymentOriginOf(deploymentOrigin) {
  const raw = typeof deploymentOrigin === 'string' ? deploymentOrigin.trim() : ''
  if (raw === '') return { scheme: 'https:', port: '', problem: null }
  /** @type {URL | null} */
  let o = null
  try {
    o = new URL(raw)
  } catch {
    o = null
  }
  if (o === null || (o.protocol !== 'http:' && o.protocol !== 'https:') || o.hostname === '')
    return {
      scheme: 'https:',
      port: '',
      problem: `TRACY_DEPLOYMENT_ORIGIN "${raw.slice(0, 80)}" is not an http(s) origin; site addresses are read as https with no port`
    }
  return { scheme: /** @type {'http:' | 'https:'} */ (o.protocol), port: o.port, problem: null }
}

/**
 * The public origin THIS HOST serves a site at, from the label and the host's own configuration, or
 * null when it was not told its site domain.
 *
 * 🔒 THE AUTHORITY IS THE HOST'S CONFIGURATION, NEVER THE REDIRECT AND NEVER THE SITE FOLDER. The label
 * is what dsh resolved; the domain (`TRACY_SITE_DOMAIN`) and the deployment origin
 * (`TRACY_DEPLOYMENT_ORIGIN`) belong to whoever runs dsh. The domain is validated by `publicOriginOf`
 * (site.mjs), the one reader of it. `https://<label>.<domain>` — the answer on every fleet host — is
 * exactly `publicOriginOf`'s; the deployment origin only adds the local stand's scheme and port
 * (`http://<label>.tracy.test:51710`), which the domain alone cannot say.
 * @param {unknown} label
 * @param {unknown} siteDomain
 * @param {unknown} deploymentOrigin
 * @returns {{ origin: string | null, problem: string | null }}
 */
export function publicOriginFor(label, siteDomain, deploymentOrigin) {
  const dep = deploymentOriginOf(deploymentOrigin)
  const base = publicOriginOf(/** @type {string} */ (label), siteDomain)
  if (base === null) {
    const given = typeof siteDomain === 'string' && siteDomain.trim() !== ''
    const labelOk = typeof label === 'string' && LABEL.test(label)
    return {
      origin: null,
      problem:
        given && labelOk
          ? `TRACY_SITE_DOMAIN "${String(siteDomain).trim().slice(0, 80)}" is not a host name; no site is read at its public address`
          : dep.problem
    }
  }
  const host = new URL(base).hostname
  return { origin: `${dep.scheme}//${host}${dep.port ? `:${dep.port}` : ''}`, problem: dep.problem }
}

/**
 * @typedef {{ kind: 'loopback' | 'canonical' | 'public', origin: string, host: string,
 *   proto: 'http' | 'https', connectPort: number, container: string }} PageRoute
 *   How one page is asked for: AS `origin` (`Host` + `X-Forwarded-Proto`), always CONNECTING to
 *   `127.0.0.1:connectPort` inside `container`.
 */

/**
 * Where every read starts (D4): the container's own loopback service, as the probe always did.
 * @param {unknown} label
 * @param {unknown} internalPort
 * @returns {PageRoute | null}
 */
export function routeStart(label, internalPort) {
  if (typeof label !== 'string' || !LABEL.test(label)) return null
  const connectPort =
    typeof internalPort === 'number' &&
    Number.isInteger(internalPort) &&
    internalPort > 0 &&
    internalPort <= 65535
      ? internalPort
      : 80
  const o = new URL(loopbackUrl(connectPort, '/'))
  return {
    kind: 'loopback',
    origin: o.origin,
    host: o.host,
    proto: 'http',
    connectPort,
    container: `${label}-web-1`
  }
}

/**
 * One redirect, classified by D4 (the module header). Nothing is asked here: the verdict comes first.
 * @param {PageRoute} route - the route the redirecting answer came back on.
 * @param {string} pathAndQuery - the path that was asked.
 * @param {unknown} location - the raw `Location` header.
 * @param {string | null} [publicOrigin] - `publicOriginFor(…).origin`.
 * @returns {{ follow: true, route: PageRoute, pathAndQuery: string }
 *   | { follow: false, why: 'offsite' | 'loop', location: string }}
 */
export function nextHop(route, pathAndQuery, location, publicOrigin = null) {
  const from = `${route.origin}${pathAndQuery}`
  // A 3xx with no `Location` is a misconfigured site, not a same-site redirect.
  if (typeof location !== 'string' || location.trim() === '')
    return { follow: false, why: 'offsite', location: '' }
  /** @type {URL} */
  let to
  try {
    to = new URL(location.trim(), from)
  } catch {
    return { follow: false, why: 'offsite', location: location.slice(0, 200) }
  }
  const next = to.pathname + to.search
  if (to.origin === route.origin) {
    // 🔒 A site that redirects a path to itself would be asked the same thing five times; stop at once.
    if (next === pathAndQuery) return { follow: false, why: 'loop', location: to.href }
    return { follow: true, route, pathAndQuery: next }
  }
  let pub = null
  try {
    pub = typeof publicOrigin === 'string' && publicOrigin !== '' ? new URL(publicOrigin) : null
  } catch {
    pub = null
  }
  // 🔒 A SCHEME UPGRADE OF THE LOOPBACK ADDRESS IS THE SITE FORCING HTTPS, NOT ANOTHER SITE. Joomla
  // with `force_ssl = 2` answers `http://127.0.0.1/` with `301 https://127.0.0.1/` — the request's
  // own Host, only upgraded. Measured 25/09/2026 on dev (fj1823, a3fd68aef): every page.text and
  // page.look of the Joomla site read as REDIRECTED_OFF_SITE, so the agent fell back to menu and
  // module records (66 s, 15 calls for "which sections does the home page have"). Nothing new is
  // trusted here: the page is asked again AS this host's own public origin — the one address the
  // redirect branch below already follows — still connecting to the container's loopback. Only the
  // implicit https port: `https://127.0.0.1:51710/` stays refused (a port the site does not serve).
  if (
    pub !== null &&
    route.kind === 'loopback' &&
    route.proto === 'http' &&
    to.protocol === 'https:' &&
    to.port === '' &&
    pub.protocol === 'https:' &&
    to.hostname === new URL(route.origin).hostname
  )
    return {
      follow: true,
      route: {
        kind: 'public',
        origin: pub.origin,
        host: pub.host,
        proto: 'https',
        connectPort: route.connectPort,
        container: route.container
      },
      pathAndQuery: next
    }
  if (pub !== null && to.origin === pub.origin)
    return {
      follow: true,
      route: {
        kind: 'public',
        origin: pub.origin,
        host: pub.host,
        proto: pub.protocol === 'https:' ? 'https' : 'http',
        connectPort: route.connectPort,
        container: route.container
      },
      pathAndQuery: next
    }
  // 🔒 The public origin is exact or it is not this site: its host on another port or scheme is not
  // where this host serves the site (the pinned rule of the node probe, kept on this road).
  if (route.kind === 'public') return { follow: false, why: 'offsite', location: to.href }
  const verdict = redirectStaysOnSite(from, location.trim()) // same host name AND scheme
  if (!verdict.same) return { follow: false, why: 'offsite', location: to.href }
  const port = to.port === '' ? (to.protocol === 'https:' ? 443 : 80) : Number(to.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    return { follow: false, why: 'offsite', location: to.href }
  return {
    follow: true,
    route: { ...route, kind: 'canonical', origin: to.origin, host: to.host },
    pathAndQuery: next
  }
}

/**
 * The browser target for the page a static read ended on (the fallback and `page.look`): the page is
 * addressed as the route's origin, and the connection stays pinned to this container's loopback
 * service by the same two mechanisms the probe road uses — a public route is served from loopback
 * (`via`) with the public name resolving to NOTHING, a canonical port is the virtual host with the one
 * resolver rule (`canonicalTarget`). Null when the canonical port cannot be pinned.
 * @param {string} label
 * @param {PageRoute} route
 * @param {string} pathAndQuery
 * @param {number} internalPort
 * @returns {{ url: string, origin: string, container: string, resolverRule: string, via: string } | null}
 */
export function browserTargetForRoute(label, route, pathAndQuery, internalPort) {
  if (route.kind === 'public') {
    return {
      url: `${route.origin}${pathAndQuery}`,
      origin: route.origin,
      container: route.container,
      via: `127.0.0.1:${route.connectPort}`,
      resolverRule: `--host-resolver-rules=MAP ${new URL(route.origin).hostname} ~NOTFOUND`
    }
  }
  if (route.kind === 'canonical') {
    const u = new URL(route.origin)
    const ct = canonicalTarget(label, pathAndQuery, internalPort, u.port === '' ? 80 : Number(u.port))
    return ct.ok
      ? { url: ct.url, origin: ct.origin, container: ct.container, resolverRule: ct.resolverRule, via: '' }
      : null
  }
  const url = loopbackUrl(route.connectPort, pathAndQuery)
  return { url, origin: new URL(url).origin, container: route.container, resolverRule: '', via: '' }
}

/**
 * @typedef {{ url: string, origin: string, container: string, resolverRule: string, via: string }} BrowserTarget
 */

/**
 * The browser target to ask again when the browser was sent to EXACTLY this site's public origin: the
 * second rule of D4 (the module header), applied to a redirect only the browser saw. Null when the
 * address is anything else, when the target already was that origin (asking again would loop), or
 * when the target's container port cannot be pinned.
 *
 * 🔒 WHY THE BROWSER NEEDS IT TOO. The static read sees a server redirect only on a hop that answers
 * in time: a home page slower than one hop's budget ends the read as `slow` on the loopback route, and
 * the browser, addressed at loopback, then meets the site's own `301 → https://<label>.<domain>/` and
 * refused it. Reported 26/10/2026 on a fresh WordPress site: `page.look {path:"/"}` answered
 * "/ left this site for https://<label>.<domain>/ in the browser" for its own home page, while
 * /contact read fine. A JavaScript or `<meta refresh>` redirect to the public origin meets the same
 * guard. The new target is the one `nextHop` follows: the public origin served from this container's
 * loopback port, the public name resolving to nothing.
 * @param {BrowserTarget} target - the target the browser was pointed at.
 * @param {unknown} leftFor - the address the browser left for (`parseBrowser`'s `offsite` error).
 * @param {string | null | undefined} publicOrigin - `publicOriginFor(…).origin`.
 * @returns {BrowserTarget | null}
 */
export function publicRetarget(target, leftFor, publicOrigin) {
  if (typeof publicOrigin !== 'string' || publicOrigin === '') return null
  /** @type {URL} */
  let to
  /** @type {URL} */
  let pub
  try {
    to = new URL(String(leftFor))
    pub = new URL(publicOrigin)
  } catch {
    return null
  }
  if (to.origin !== pub.origin || target.origin === pub.origin) return null
  const pinned = hostBrowserTarget(target)
  if (pinned === null) return null
  const connectPort = Number(pinned.via.slice('127.0.0.1:'.length))
  return browserTargetForRoute(
    '',
    {
      kind: 'public',
      origin: pub.origin,
      host: pub.host,
      proto: pub.protocol === 'https:' ? 'https' : 'http',
      connectPort,
      container: target.container
    },
    to.pathname + to.search,
    connectPort
  )
}

/**
 * Run the browser at `target`, and once more AS this site's public origin when it was sent there
 * ({@link publicRetarget}). Every browser road goes through here, so none of them calls the site's
 * own public address "off this site". Only the second run is answered; any other `OFFSITE` stays the
 * refusal it was.
 * @template {{ stdout: string }} R
 * @param {{ target: BrowserTarget, publicOrigin?: string | null, launch: (t: BrowserTarget) => Promise<R> }} input
 * @returns {Promise<{ res: R, target: BrowserTarget }>}
 */
export async function browseAsSite({ target, publicOrigin = null, launch }) {
  const res = await launch(target)
  const b = parseBrowser(res.stdout)
  if (b.ok || b.kind !== 'offsite') return { res, target }
  const again = publicRetarget(target, b.error, publicOrigin)
  return again === null ? { res, target } : { res: await launch(again), target: again }
}

// ── What the read found ────────────────────────────────────────────────────────────────────────────

/**
 * Is this page drawn by JavaScript: almost no readable text, and a script to draw the rest? A
 * maintenance page with no script is NOT thin — its short text is the truth. All 17 saved ja-business
 * pages carry ≥ 1,178 chars of static text; a `<div id="root"></div><script …>` shell carries none.
 * @param {string} html
 * @param {{ text: string }} page - `readablePage(html)`.
 */
export function isThinPage(html, page) {
  return String(page?.text ?? '').length < THIN_TEXT_CHARS && /<script\b/i.test(String(html ?? ''))
}

/**
 * A declared charset other than UTF-8/ASCII (the `Content-Type` header first, as HTTP ranks them, then
 * `<meta charset>`), or null. The transport decodes stdout as UTF-8, so such a page reads garbled here;
 * the browser (which hands back a JS string) reads it right where there is one.
 * @param {unknown} contentType
 * @param {unknown} html
 * @returns {string | null}
 */
export function foreignCharset(contentType, html) {
  const fromHeader = /charset\s*=\s*["']?([\w.:-]+)/i.exec(String(contentType ?? ''))?.[1]
  const fromMeta = /<meta\b[^>]*\bcharset\s*=\s*["']?([\w.:-]+)/i.exec(String(html ?? '').slice(0, 8192))?.[1]
  const cs = String(fromHeader ?? fromMeta ?? '').toLowerCase()
  if (cs === '' || /^(utf-?8|us-ascii|ascii)$/.test(cs)) return null
  return cs
}

/** Is this `Content-Type` a page (or absent, which a CMS page never is but a test stub may be)? */
const HTML_TYPE = /^\s*(text\/html|application\/xhtml\+xml)\b/i
/**
 * A file a site serves as TEXT — `robots.txt`, a sitemap, `llms.txt`, a feed, a stylesheet: read as
 * its lines rather than refused as "not a page" (v6 #3). An image, a PDF or an archive still is.
 */
const TEXT_TYPE = /^\s*(text\/[\w.+-]+|application\/([\w.-]+\+)?(xml|json)|application\/javascript)\s*(;|$)/i

// ── Which pages a call asks for ────────────────────────────────────────────────────────────────────

const BAD_PATH_NEXT = 'Call again with a path on this site starting with one "/", e.g. {path:"/contact"}.'

/**
 * One asked path, validated: `lookTarget`'s rule (one leading `/`, no spaces, never `//`), and the
 * path must stay a path when a URL parser reads it.
 *
 * 🔒 `/\evil.example` PASSES `lookTarget` AND IS A HOST. WHATWG URL reads a backslash as a slash in
 * http, so `new URL('/\\evil.example', base)` is `http://evil.example/`. The read would still dial
 * loopback (the URL is rebuilt from its path), but the asked page would silently become `/`. So a path
 * whose host is not the placeholder's is refused by name.
 * @param {unknown} asked
 * @returns {{ ok: true, path: string } | { ok: false, error: string }}
 */
export function pagePathOf(asked) {
  // `lookTarget` is the one path rule (page.look shares it); the label only names a container there.
  const t = lookTarget('page', asked, 80)
  if (!t.ok) return { ok: false, error: t.error }
  let u
  try {
    u = new URL(t.path, 'http://page.invalid')
  } catch {
    return { ok: false, error: `path "${t.path.slice(0, 80)}" is not a path on this site` }
  }
  if (u.host !== 'page.invalid')
    return { ok: false, error: `path "${t.path.slice(0, 80)}" names another host` }
  return { ok: true, path: t.path }
}

/**
 * `path` and `paths` → the pages to read: merged (path first), deduped, at most eight read and the
 * rest listed in `notRead`. One bad entry refuses the call before any exec, naming it.
 * @param {unknown} label
 * @param {Record<string, unknown>} params
 * @returns {{ ok: true, targets: { path: string }[], notRead: string[], multi: boolean }
 *   | { ok: false, answer: { ok: false, code: 'BAD_PATH', error: string, next: string } }}
 */
export function pagePaths(label, params) {
  const p = params ?? {}
  const bad = (/** @type {string} */ error) => ({
    ok: /** @type {const} */ (false),
    answer: {
      ok: /** @type {const} */ (false),
      code: /** @type {const} */ ('BAD_PATH'),
      error,
      next: BAD_PATH_NEXT
    }
  })
  if (typeof label !== 'string' || !LABEL.test(label)) return bad('no site label to read')
  /** @type {{ asked: unknown, name: string }[]} */
  const asked = []
  if (p.path !== undefined && p.path !== null && p.path !== '') asked.push({ asked: p.path, name: 'path' })
  if (p.paths !== undefined && p.paths !== null) {
    const list = typeof p.paths === 'string' ? [p.paths] : p.paths
    if (!Array.isArray(list)) return bad('paths must be a list of paths, e.g. ["/","/contact"]')
    list.forEach((one, i) => asked.push({ asked: one, name: `paths[${i}]` }))
  }
  if (asked.length === 0) asked.push({ asked: '/', name: 'path' })
  /** @type {string[]} */
  const unique = []
  for (const one of asked) {
    const v = pagePathOf(one.asked)
    if (!v.ok) return bad(`${one.name}: ${v.error}`)
    if (!unique.includes(v.path)) unique.push(v.path)
  }
  const targets = unique.slice(0, PAGE_TEXT_MAX_PATHS).map((path) => ({ path }))
  const notRead = unique.slice(PAGE_TEXT_MAX_PATHS)
  return { ok: true, targets, notRead, multi: targets.length > 1 || notRead.length > 0 }
}

// ── The read itself ────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ code: number | null, stdout: string, stderr: string, timedOut: boolean, spawnError?: string }} ExecResult
 * @typedef {(input: { argv: readonly string[], stdin?: string, timeoutMs: number, maxBuffer: number }) => Promise<ExecResult>} Run
 * @typedef {{ ok: true, route: PageRoute, pathAndQuery: string, url: string, finalUrl: string, status: number,
 *   contentType: string, html: string, hops: number, ms: number }} PageRead
 * @typedef {{ ok: false, why: 'no-curl' | 'unreachable' | 'offsite' | 'slow' | 'too-large' | 'encoded' | 'loop' | 'bad-path',
 *   url: string, detail: string, location?: string, route?: PageRoute, pathAndQuery?: string }} PageReadFailure
 */

/**
 * Why one hop's exec did not answer, in words the model may read. 🔒 Never the raw text: stderr can
 * carry an OCI runtime line or a docker daemon message, which tells the model nothing it can act on
 * (T10: raw runtime text never reaches the model).
 * @param {ExecResult} res
 * @param {number} connectPort
 */
function unreachableReason(res, connectPort) {
  const text = `${res.stderr ?? ''} ${res.spawnError ?? ''}`
  if (/no such container|is not running|container .* not found/i.test(text))
    return "the site's web container is not running"
  if (res.spawnError) return 'the docker transport failed'
  switch (res.code) {
    case 7:
      return `nothing answers on port ${connectPort}`
    case 52:
      return 'the site closed the connection without an answer'
    case 56:
      return 'the connection was reset'
    case 0:
      return 'the site sent no complete answer'
    default:
      return `curl exit ${res.code ?? 'unknown'}`
  }
}

/**
 * Read ONE page's server HTML (F2 §3.3), hop by hop: each hop is one curl GET in the container (never
 * `-L`), and each redirect is classified by {@link nextHop} before the next hop is asked.
 *
 * Order of the checks on one hop's exec result matters, and each was measured:
 * - no closing line AND a missing program (exit 126/127, the OCI line) → `no-curl`: the caller takes
 *   the pre-F2 road (node probe + browser), unchanged;
 * - a `maxBuffer` overflow → `too-large`; a timeout or curl exit 28 → `slow`;
 * - curl exit 63 → `too-large`, read BEFORE the status because the closing line of a refused 5 MiB
 *   body still says `200` (verified with a real curl, `specs/f2/realcurl-check.mjs`);
 * - any other failure, or no closing line → `unreachable` (a cut output is never a page);
 * - a 3xx → the next hop or a refusal; a `Content-Encoding` other than identity → `encoded`;
 * - anything else (1xx/2xx/4xx/5xx, clean exit) → the page, status kept.
 * @param {{ run: Run, label: string, internalPort: number, publicOrigin?: string | null, path: string,
 *   now?: () => number }} input
 * @returns {Promise<PageRead | PageReadFailure>}
 */
export async function readPage(input) {
  // A site a brief build holds on its rebuilding page (#189): every hop is this site's own loopback read (`nextHop`
  // refuses any other), so its preview key goes with each one. A key renewed since it was kept is answered with the
  // offline page (503): the kept key is dropped, a fresh one asked, and the read made once more with it.
  const previewKey = previewKeyFor(input.label)
  const read = await readPageWithKey(input, previewKey)
  if (previewKey === null || !read.ok || read.status !== 503) return read
  const fresh = await renewPreviewKey(input.label)
  return fresh !== null && fresh !== previewKey ? readPageWithKey(input, fresh) : read
}

/**
 * {@link readPage} with one preview key (or none).
 * @param {{ run: Run, label: string, internalPort: number, publicOrigin?: string | null, path: string,
 *   now?: () => number }} input
 * @param {string | null} previewKey
 * @returns {Promise<PageRead | PageReadFailure>}
 */
async function readPageWithKey(
  { run, label, internalPort, publicOrigin = null, path, now = Date.now },
  previewKey
) {
  const start = routeStart(label, internalPort)
  const asked = pagePathOf(path)
  if (start === null || !asked.ok)
    return { ok: false, why: 'bad-path', url: '', detail: asked.ok ? 'no site label to read' : asked.error }
  let route = start
  const u = new URL(asked.path, 'http://page.invalid')
  let pathAndQuery = u.pathname + u.search
  const firstUrl = `${route.origin}${pathAndQuery}`
  const t0 = now()
  for (let hop = 0; hop < PROBE_MAX_HOPS; hop += 1) {
    const url = `${route.origin}${pathAndQuery}`
    const left = PAGE_READ_BUDGET_MS - (now() - t0)
    if (left < 1000)
      return { ok: false, why: 'slow', url, detail: 'too long across its redirects', route, pathAndQuery }
    const maxTimeS = Math.max(1, Math.min(FETCH_MAX_TIME_S, Math.floor(left / 1000)))
    const nonce = `TRACY_FETCH_${randomUUID().replace(/-/g, '')}`
    const res = await run({
      argv: fetchArgv({
        container: route.container,
        connectPort: route.connectPort,
        pathAndQuery,
        host: route.host,
        proto: route.proto,
        nonce,
        maxTimeS,
        previewKey
      }),
      timeoutMs: maxTimeS * 1000 + 4000,
      maxBuffer: FETCH_MAX_BYTES + 256 * 1024
    })
    const got = parseFetch(res.stdout, nonce)
    if (!got.ok && looksLikeMissingBinary(res))
      return { ok: false, why: 'no-curl', url, detail: 'no curl in the container' }
    if (res.spawnError && /maxBuffer/i.test(res.spawnError))
      return { ok: false, why: 'too-large', url, detail: 'larger than 4 MiB', route, pathAndQuery }
    if (res.timedOut || res.code === 28)
      return { ok: false, why: 'slow', url, detail: `longer than ${maxTimeS} s`, route, pathAndQuery }
    if (res.code === 63)
      return { ok: false, why: 'too-large', url, detail: 'larger than 4 MiB', route, pathAndQuery }
    if (!got.ok || res.code !== 0 || res.spawnError)
      return { ok: false, why: 'unreachable', url, detail: unreachableReason(res, route.connectPort) }
    if (got.status >= 300 && got.status < 400) {
      const next = nextHop(route, pathAndQuery, got.location, publicOrigin)
      if (!next.follow)
        return next.why === 'loop'
          ? { ok: false, why: 'loop', url, detail: 'to itself', location: next.location, route, pathAndQuery }
          : { ok: false, why: 'offsite', url, detail: 'redirects off this site', location: next.location }
      route = next.route
      pathAndQuery = next.pathAndQuery
      continue
    }
    if (got.contentEncoding !== '' && !/^identity$/i.test(got.contentEncoding))
      return { ok: false, why: 'encoded', url, detail: got.contentEncoding.slice(0, 40), route, pathAndQuery }
    return {
      ok: true,
      route,
      pathAndQuery,
      url: firstUrl,
      finalUrl: url,
      status: got.status,
      contentType: got.contentType,
      html: got.body,
      hops: hop + 1,
      ms: now() - t0
    }
  }
  return {
    ok: false,
    why: 'loop',
    url: `${route.origin}${pathAndQuery}`,
    detail: `more than ${PROBE_MAX_HOPS} redirects`,
    route,
    pathAndQuery
  }
}

// ── The content door a refusal points at ───────────────────────────────────────────────────────────

/**
 * 🔒 THE EMDASH ROAD TO A PAGE'S WORDS: THE COLLECTION LIST, THEN THE ENTRY — NOT `search` (adversarial
 * review of round 7, RL-1). A page is read by its entry's slug, which a model rarely has, so the first
 * version of this road said "`search` finds the entry by its words". EmDash's `search` tool indexes only a
 * collection that has `search` in its `supports` and fields marked `searchable`, and on Tracy's EmDash
 * templates those are posts, services, projects and pages: a page's own copy (`services_page`, `home`,
 * `about`, every section collection of the SaaS template) is in NO index, so the search answered nothing for
 * exactly the case this road exists for, and the model spent a step and concluded the words were not there.
 * `schema_list_collections` answers every collection's `urlPattern` (a page's is its path: `/services` is
 * the `services_page` collection), and `content_list {collection}` answers that collection's entries with
 * their ids, slugs and short values whole — a page collection holds one entry per language. NOT
 * `content_get {collection, id:"<slug>"}` after the list: the entry's slug is the path's last segment in the
 * business template (`services`) but the collection's own name in the base one (`services_page`,
 * `home_2`), so a slug read off the path is a guess. It is also the identity of the EmDash door in
 * {@link pageRefusal}, which words a slow read differently. (The SaaS template keeps a page's words in
 * section collections its `pages` entries list, with no `urlPattern`: one more hop there.)
 */
const EMDASH_DOOR =
  'tracy_emdash schema_list_collections (urlPattern = the path), then content_list {collection}'

/**
 * What a SLOW read of a page says on EmDash: not to repeat it, and the one-entry read. A picked element's
 * mark holds the collection, the id and the slug (`emdash:<collection>:<id>:<slug>`), so a pick goes straight
 * to `content_get`; a chat that quoted words finds the collection from the list, as {@link EMDASH_DOOR} says.
 */
const EMDASH_SLOW_NEXT =
  'Do not repeat this read. tracy_emdash content_get {collection, id:"<slug>"} from a picked mark (emdash:<collection>:<id>:<slug>); else schema_list_collections, then content_list {collection}.'

/**
 * The read on THIS surface that reaches the same words without reading a page — what every page
 * refusal's `next` names (T10 group G1), so a `next` never names an action this surface lacks (IX1's
 * consistency test). Unknown → both, as T10's G1 rewrite says it.
 * @param {{ platform?: unknown, sealed?: unknown }} [facts]
 * @returns {string}
 */
export function contentDoor(facts = {}) {
  const platform = facts?.platform
  if (platform === 'emdash') return EMDASH_DOOR
  if (platform === 'wordpress') return 'content.get {kind:"post", id}'
  if (platform === 'joomla')
    return facts?.sealed === true
      ? 'content.contract {operation:"inspect", match}'
      : 'content.list {kind:"article"}, then content.get {kind, id}'
  return 'content.get {kind:"post", id} on WordPress, content.contract {operation:"inspect", match} on Joomla'
}

/**
 * The `NO_BROWSER` answer when a site's container cannot read a page at all (T10 G1): no curl for the
 * static read — and, on the pre-F2 road, no node either. 🔒 Its `next` is the content door, never
 * "check the site is running": the site IS running; the reader program is what is missing (70 r2 calls
 * were told otherwise). IX1's legacy `inContainerProbe` answers this when its exec finds no node.
 * @param {string} door - {@link contentDoor}.
 * @param {'curl' | 'both'} [missing]
 */
export function noReaderAnswer(door, missing = 'both') {
  return {
    ok: /** @type {const} */ (false),
    code: /** @type {const} */ ('NO_BROWSER'),
    error:
      missing === 'both'
        ? "this site's container has neither curl nor node, so its pages cannot be read here"
        : "this site's container has no curl, so its pages cannot be read here",
    next: `Read the words through the content door instead: ${door}.`
  }
}

/**
 * `page.look`'s `NO_BROWSER` answer. 🔒 THE FLIP (F2 §3.7): once the curl read has run, `page.text`
 * needs no browser, so it IS the way to the words and the `next` names it — the old "never name
 * page.text" was true only while page.text needed the same browser (4 r2 `page.look` calls on
 * WordPress/Joomla). On the pre-F2 road (no curl) page.text would fail the same way, so the `next`
 * stays the content door.
 * @param {boolean} curlRan
 * @param {string} door
 */
export function lookNoBrowserAnswer(curlRan, door) {
  return {
    ok: /** @type {const} */ (false),
    code: /** @type {const} */ ('NO_BROWSER'),
    error: "this site's container has no browser, so the page cannot be photographed here",
    next: curlRan
      ? 'No picture without a browser. page.text {path} reads the words (it needs none); for how it looks, tell the customer a screenshot is not available on this site.'
      : `No picture without a browser. Read the words through the content door instead: ${door}.`
  }
}

/**
 * A failed read as the answer the model reads (T10: `error` ≤ 160 chars, the rule and the value;
 * `next` ≤ 200, one instruction). `no-curl` is answered only when no pre-F2 road is taken.
 * @param {PageReadFailure} read
 * @param {string} path - the path as asked.
 * @param {string} door
 * @returns {{ ok: false, code: string, error: string, next: string }}
 */
export function pageRefusal(read, path, door) {
  const shown = path.length > 50 ? `${path.slice(0, 50)}…` : path
  const where = String(read.location ?? '').slice(0, 60) || 'another address'
  switch (read.why) {
    case 'bad-path':
      return { ok: false, code: 'BAD_PATH', error: read.detail, next: BAD_PATH_NEXT }
    case 'no-curl':
      return noReaderAnswer(door, 'curl')
    case 'offsite':
      return {
        ok: false,
        code: 'REDIRECTED_OFF_SITE',
        error: `${shown} redirects to ${where}, which is not this site`,
        next: `Read a path this site serves itself; the words behind that page: ${door}.`
      }
    case 'loop':
      return {
        ok: false,
        code: 'READ_FAILED',
        error: `${shown} redirects in a loop (${read.detail})`,
        next: `That path cannot be read as a page; read its words through ${door}.`
      }
    // 🔒 A SLOW SITE IS NOT A READ TO REPEAT. Round 7 (EmDash, a loaded stand): two runs sent the identical
    // `page.text` again after the 8 s timeout and waited another 8 s, and one read words "through
    // content_get {collection, id:<slug>}" with a slug it did not have (`services`: NOT_FOUND). Words the
    // customer quoted need no read at all — `content.replace` finds them itself, with no slug — and the
    // read that is left is the door's, by the entry's own name.
    //
    // 🔒 ON EMDASH THAT SENTENCE POINTED AT ANOTHER SLOW READ (adversarial review of round 7, RL-2).
    // `content.replace` there reads the page AND then the whole entry index, and the index read ran to its
    // 45 s deadline 19 times in 10 runs on the same loaded stand (`replace-emdash.mjs`, `readFailedNext`),
    // while `tracy_emdash`'s one-entry reads answered in 0.9–7 s: a slow `page.text` predicts a slow
    // replace, and the model paid ~55 s for the same refusal it was leaving. So on EmDash the next names the
    // one-entry read and the mark a picked element carries (`emdash:<collection>:<id>:<slug>`, the
    // collection and the slug both in it), and not `content.replace`. WordPress and Joomla keep the shortcut:
    // their replace falls back to the stored words when the page cannot be read.
    case 'slow':
      return {
        ok: false,
        code: 'READ_FAILED',
        error: `the site took ${read.detail} to send ${shown}`,
        next:
          door === EMDASH_DOOR
            ? EMDASH_SLOW_NEXT
            : `Do not repeat this read. Quoted words go straight to content.replace {find, replace}; to read: ${door}.`
      }
    case 'too-large':
      return {
        ok: false,
        code: 'READ_FAILED',
        error: `${shown} is ${read.detail}, too large to read here`,
        next: `Read the words through ${door}.`
      }
    case 'encoded':
      return {
        ok: false,
        code: 'READ_FAILED',
        error: `the site sent ${shown} compressed (${read.detail})`,
        next: `Read the words through ${door}.`
      }
    default:
      return {
        ok: false,
        code: 'SITE_UNREACHABLE',
        error: `${String(read.url).slice(0, 80)} did not answer: ${read.detail}`,
        next: `Its words: ${door}; if the site stays silent, tell the customer it is not answering.`
      }
  }
}

/**
 * ONE page's HTML, or the refusal the model reads — the single page-read road (D2) every consumer
 * takes: `page.text`, `page.look`'s gate, the replace job's locator and proof. `url` is where the read
 * started, `finalUrl` the address the page answered at (the public address and final path after the
 * site's own redirects, when it has one).
 * @param {{ run: Run, label: string, internalPort: number, publicOrigin?: string | null, path: string,
 *   now?: () => number, door?: string }} input
 * @returns {Promise<PageRead | ({ ok: false, code: string, error: string, next: string } & PageReadFailure)>}
 */
export async function fetchPageHtml(input) {
  const read = await readPage(input)
  if (read.ok) return read
  const answer = pageRefusal(read, String(input.path ?? '/'), input.door ?? contentDoor())
  return { ...read, ...answer }
}

// ── The browser fallback ───────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ ok: true, finalUrl: string, dom: string }
 *   | { ok: false, kind: 'offsite' | 'port' | 'nav' | 'no-browser' | 'error', error: string }} BrowserDom
 *   A failure's `error` is Tracy's own words (`offsite`: the address it left for), never the
 *   browser's — a `net::` error or a stack is runtime text, which never reaches the model (T10).
 * @typedef {(input: { route: PageRoute, pathAndQuery: string }) => Promise<BrowserDom>} BrowserDomFn
 */

/**
 * The page's DOM after scripts ran, from the container's own browser, addressed as the route the
 * static read ended on. The same rules as the pre-F2 road: a missing program is `no-browser`; the
 * browser itself refuses an off-site final document; a canonical port that cannot be pinned is
 * `port`; and 🔒 a `TRACY_BROWSER OK` line is a whole document ONLY with a clean exit (code 0, no
 * spawn error, no timeout) — a stdout past `maxBuffer` surfaces as `code: null` + `spawnError` with
 * the OK prefix still readable over half a page.
 * @param {{ run: Run, label: string, internalPort: number, route: PageRoute, pathAndQuery: string,
 *   publicOrigin?: string | null }} input
 * @returns {Promise<BrowserDom>}
 */
export async function browserDom({ run, label, internalPort, route, pathAndQuery, publicOrigin = null }) {
  const t = browserTargetForRoute(label, route, pathAndQuery, internalPort)
  if (t === null) return { ok: false, kind: 'port', error: 'a port this site does not expose here' }
  const { res } = await browseAsSite({
    target: t,
    publicOrigin,
    launch: (at) =>
      run({
        argv: browserArgv({
          container: at.container,
          mode: 'dom',
          url: at.url,
          origin: at.origin,
          resolverRule: at.resolverRule,
          via: at.via
        }),
        timeoutMs: BROWSER_EXEC_MS,
        maxBuffer: 16 * 1024 * 1024
      })
  })
  const b = parseBrowser(res.stdout)
  if (looksLikeMissingBinary(res) || (!b.ok && b.kind === 'no-browser'))
    return { ok: false, kind: 'no-browser', error: 'no browser in this site container' }
  if (!b.ok && b.kind === 'offsite') return { ok: false, kind: 'offsite', error: b.error }
  if (res.timedOut) return { ok: false, kind: 'error', error: 'it ran out of time' }
  if (!b.ok)
    return b.kind === 'nav'
      ? { ok: false, kind: 'nav', error: 'it could not open the page' }
      : { ok: false, kind: 'error', error: 'it returned no whole document' }
  if (!(res.code === 0 && !res.spawnError))
    return { ok: false, kind: 'error', error: 'the document was cut off before it finished' }
  return b
}

// ── Cutting an answer to its budget ────────────────────────────────────────────────────────────────

/**
 * `maxChars` as T8 takes it: a positive integer, at most 8,000; anything else is the default.
 * @param {unknown} asked
 * @param {number} fallback
 */
export function clampChars(asked, fallback) {
  const n = typeof asked === 'string' && /^\d+$/.test(asked.trim()) ? Number(asked) : asked
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? Math.min(n, PAGE_TEXT_MAX_CHARS) : fallback
}

/**
 * `match` as the page read takes it: words (or digits) to narrow to, or null.
 * @param {unknown} asked
 * @returns {string | null}
 */
function matchOf(asked) {
  if (typeof asked === 'number' && Number.isFinite(asked)) return String(asked)
  return typeof asked === 'string' && asked.trim() !== '' ? asked.trim() : null
}

/**
 * Lines cut to a budget at a line boundary. A first line longer than the whole budget is cut inside
 * itself (a page may be one long line), never answered empty.
 * @param {readonly string[]} lines
 * @param {number} cap
 * @returns {{ text: string, shown: number }}
 */
function cutLines(lines, cap) {
  let text = ''
  let shown = 0
  for (const line of lines) {
    const add = shown === 0 ? line : `\n${line}`
    if (text.length + add.length > cap) {
      if (shown === 0) return { text: line.slice(0, cap), shown: 0 }
      break
    }
    text += add
    shown += 1
  }
  return { text, shown }
}

/**
 * The part of a page's text worth sending back (T8). With `match`, ONLY the lines carrying it —
 * compared folded (a customer's "Mon-Fri" finds the page's "Mon–Fri") and case-insensitive — and
 * `matched` counts them. Without it, the top of the page. Cut at a line boundary to `cap`.
 * @param {string} text
 * @param {string | null} match
 * @param {number} cap
 * @returns {{ text: string, truncated: boolean, chars: number, matched: number | null }}
 */
export function textExcerpt(text, match, cap) {
  const all = String(text ?? '').split('\n')
  const needle = match === null ? null : foldForMatch(match)
  const lines = needle === null ? all : all.filter((line) => foldForMatch(line).includes(needle))
  const whole = lines.join('\n')
  const cut = cutLines(lines, cap)
  return {
    text: cut.text,
    truncated: cut.text.length < whole.length,
    chars: whole.length,
    matched: needle === null ? null : lines.length
  }
}

/**
 * An outline's lines as the answer's text: with `match`, the matching lines only, WHOLE; without it,
 * each line whose words run past {@link OUTLINE_P_CHARS} is shown cut with its length. Cut at a line
 * boundary to `cap`, ending with `… +N lines` when lines were left out.
 * @param {readonly string[]} lines - {@link pageOutline}.
 * @param {string | null} match
 * @param {number} cap
 * @returns {{ text: string, truncated: boolean, lines: number, matched: number | null, chars: number }}
 */
export function outlineExcerpt(lines, match, cap) {
  const needle = match === null ? null : foldForMatch(match)
  const picked =
    needle === null
      ? lines.map((line) => {
          const at = line.indexOf(': ')
          const words = at === -1 ? line : line.slice(at + 2)
          return words.length > OUTLINE_P_CHARS
            ? `${line.slice(0, at + 2)}${words.slice(0, OUTLINE_P_CHARS).trimEnd()}… (${words.length} chars)`
            : line
        })
      : lines.filter((line) => foldForMatch(line).includes(needle))
  const whole = picked.join('\n')
  const room = Math.max(0, cap - 16) // leaves room for the `… +N lines` tail
  const cut = whole.length <= cap ? { text: whole, shown: picked.length } : cutLines(picked, room)
  const left = picked.length - cut.shown
  return {
    text: left > 0 && cut.shown > 0 ? `${cut.text}\n… +${left} lines` : cut.text,
    truncated: cut.text.length < whole.length,
    lines: cut.shown,
    matched: needle === null ? null : picked.length,
    chars: whole.length
  }
}

// ── The outline ────────────────────────────────────────────────────────────────────────────────────

/** Every region an outline line can start with: the replace job's `where` values, then `drawer`. */
export const OUTLINE_REGIONS = Object.freeze([...WHERE_REGIONS, 'drawer'])
/** Every kind an outline line can name, after its region. */
export const OUTLINE_KINDS = Object.freeze([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'button',
  'link',
  'nav',
  'list',
  'logo',
  'text'
])
/**
 * The outline's line format as the `page.text` description should state it (T8's format clause),
 * built from the two lists above so it cannot name a region or kind the outline never prints, or
 * miss one it does. 🔒 T8 as placed in PR1 names four regions and six kinds; the outline also prints
 * `title` (a breadcrumb), `drawer` (off-canvas copies, last), `h2`–`h6`, `list` and `link` — a
 * description that disagrees with the tool's output is read as a promise. IX1 places this text in
 * T8 (or records why not) and pins the two against each other.
 */
export const OUTLINE_LINE_FORMAT = `"<${OUTLINE_REGIONS.join('|')}> <h1…h6|${OUTLINE_KINDS.filter((k) => !/^h[1-6]$/.test(k)).join('|')}>: words [href]"`

const BUTTONISH = /(^|[\s_-])(btn|button)([\s_-]|$)/i
/**
 * A logo, a site title or a tagline — as a class name or a BEM block/element (`tb-brand`,
 * `tracy-header__brand`, `navbar-brand`, `logo-text`), never as a BEM MODIFIER: Joomla's footer
 * column `tb-footer__col--brand` is a whole column of paragraphs, and read as a logo it printed the
 * company description as the brand name.
 */
const LOGOISH = /(^|\s|__|(?<!-)-)(brand|logo|site-title|site-tagline|tagline)(?=$|\s|_|-(?!-))/i

/**
 * A link target as an outline shows it: this site's own pages as path+query, another site as its host,
 * `tel:`/`mailto:` as written, and nothing for `#…` and `javascript:`.
 * @param {string | null} href
 * @param {string} base
 * @param {ReadonlySet<string>} own
 */
function shortHref(href, base, own) {
  const h = String(href ?? '').trim()
  if (h === '' || h.startsWith('#') || /^javascript:/i.test(h)) return null
  if (/^(tel|mailto):/i.test(h)) return h.slice(0, 120)
  try {
    const u = new URL(h, base)
    if (own.has(u.origin)) return u.pathname + u.search
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.host : null
  } catch {
    return null
  }
}

/**
 * @typedef {{ region: string, kind: string, text?: string, href?: string | null, breaks?: number,
 *   items?: string[], group?: 'nav' | 'list' | 'logo' }} OutlineEntry
 */

/**
 * The page's parts in document order, one line each (F2 §3.6 on D3's regions), so a request that
 * names a POSITION ("the big headline", "the first button", "the line under the logo") gets the exact
 * current words in one call:
 *
 *   `<region> <kind>[ (N lines)]: <words>[ [<href>]]`
 *
 * - region: `topbar | header | main | footer | title`, the replace job's `where` names; `drawer` lines
 *   (off-canvas, drawer, dropdown, closed dialog) come LAST, and a drawer line that repeats a line
 *   already printed is dropped — a mobile menu is a copy, not a second place.
 * - kinds: `h1`–`h6`; `nav` (one line per navigation, `Label [/path]`, first 8 then `+N more`, an
 *   identical item list printed once); `logo` (a brand/logo/tagline element, or the home link outside
 *   main, its parts joined with ` · `); `list` (a `<ul>/<ol>` outside main as ONE line — the
 *   43-language switcher is one line, not 43); `button` (`<button>`, or a link whose class has a
 *   btn/button token); `link` (`tel:`/`mailto:`); `p` (in main: the first paragraph after each
 *   heading — the lede or card description; elsewhere every paragraph); `text` (outside main: any other
 *   run of words — hours, copyright, an address in a span).
 * - `(N lines)` when a `<br>` splits the element: all three ja-business H1s are `…<br><em>…</em>`;
 *   the words are joined with one space, the way a customer quotes them.
 * - Hidden words are left out: the `hidden` attribute, `aria-hidden="true"`, screen-reader-only
 *   classes, a skip link.
 * - `every` (what `match` asks for): EVERY visible part, not the skeleton — each paragraph in main
 *   (not only the first after a heading), the loose words in main as `main text`, and every item of
 *   a nav or list line.
 *
 * 🔒 WHY `match` NEEDS `every`. The skeleton prints main's first paragraph after each heading and
 * nothing else of main's prose, so a filter over it answered "no line here carries those words" for
 * words on the page: `match:"Head office"` on the WordPress contact page (a label paragraph in the
 * contact card) found nothing, and `match:"550-67-89"` found the top bar's and footer's phone but not
 * the card's — the one the customer means. D15′'s locate road is this call; a missed occurrence sends
 * the model to other pages, or to write one place of three.
 * @param {unknown} html
 * @param {string} [pageUrl] - the address the page answered at, to shorten its own links.
 * @param {{ origins?: readonly (string | null | undefined)[], every?: boolean }} [options] - `origins`:
 *   other origins that are this site (its public origin, when the read ended on loopback).
 * @returns {string[]}
 */
export function pageOutline(html, pageUrl = 'http://page.invalid/', options = {}) {
  const every = options.every === true
  const { units } = renderedUnits(html)
  /** @type {Set<string>} */
  const own = new Set()
  for (const o of [pageUrl, ...(options.origins ?? [])]) {
    try {
      if (typeof o === 'string' && o !== '') own.add(new URL(o).origin)
    } catch {
      // not an origin: this site is only the page's own
    }
  }
  /** @type {OutlineEntry[]} */
  const entries = []
  /** @type {Map<object, Map<string, OutlineEntry>>} */
  const groups = new Map()
  /**
   * @param {object} el
   * @param {string} region
   * @param {'nav' | 'list' | 'logo'} kind
   */
  const groupOf = (el, region, kind) => {
    let byRegion = groups.get(el)
    if (byRegion === undefined) groups.set(el, (byRegion = new Map()))
    let entry = byRegion.get(`${region} ${kind}`)
    if (entry === undefined) {
      entry = { region, kind, items: [], group: kind }
      byRegion.set(`${region} ${kind}`, entry)
      entries.push(entry)
    }
    return /** @type {string[]} */ (entry.items)
  }
  /**
   * @param {readonly import('./html-units.mjs').UnitElement[]} chain
   * @param {(el: import('./html-units.mjs').UnitElement) => boolean} test
   */
  const outermost = (chain, test) => {
    for (let k = chain.length - 1; k >= 0; k -= 1) if (test(chain[k])) return chain[k]
    return null
  }
  let lede = false
  // 🔒 A SECTION WITH NO HEADING STILL OPENS WITH WORDS. The skeleton printed main's paragraphs only
  // after a heading and main's loose words never, so a band titled by an eyebrow `<p>` or `<span>`
  // (every ja-business "Clients we have built for" strip: Joomla `<p class="tb-eyebrow">`, EmDash
  // `<span>`, WordPress `<p>`) was not in the outline at all. Measured 25/09/2026 on the local stand:
  // asked for the home page's sections, the agent answered from this outline on Joomla and EmDash and
  // left the clients section out on both. So the first words of each `<section>` in main are printed.
  /** @type {object | null} */
  let lastSection = null
  /** @param {readonly import('./html-units.mjs').UnitElement[]} chain */
  const sectionOf = (chain) => chain.find((el) => el.tag === 'section') ?? null
  for (const u of units) {
    if (u.attr !== undefined || u.hidden || u.inTitle) continue
    const region = u.region
    const block = u.chain.find((el) => !el.inline)
    const tag = block ? block.tag : ''
    const section = region === 'main' ? sectionOf(u.chain) : null
    const opensSection = section !== null && section !== lastSection
    if (/^h[1-6]$/.test(tag)) {
      entries.push({ region, kind: tag, text: u.shown, breaks: u.breaks })
      lede = region === 'main'
      if (section !== null) lastSection = section
      continue
    }
    const logoEl = region === 'main' ? null : outermost(u.chain, (el) => LOGOISH.test(el.cls))
    if (tag === 'p' && logoEl === null) {
      // A paragraph is a sentence: one line, whatever links it carries — unless it sits in a
      // navigation, where its words are menu items.
      const nav = outermost(u.chain, isNavElement)
      if (nav !== null) {
        const link = unitLink(u)
        const href = link ? shortHref(link.href, pageUrl, own) : null
        groupOf(nav, region, 'nav').push(href ? `${u.shown} [${href}]` : u.shown)
      } else if (region !== 'main' || lede || every || opensSection) {
        if (section !== null) lastSection = section
        const link = unitLink(u)
        const href = link ? shortHref(link.href, pageUrl, own) : null
        entries.push({
          region,
          kind: href && /^(tel|mailto):/i.test(href) ? 'link' : 'p',
          text: u.shown,
          breaks: u.breaks,
          href: href && /^(tel|mailto):/i.test(href) ? href : null
        })
      }
      if (region === 'main') lede = false
      continue
    }
    const parts = unitParts(u)
    for (const part of parts) {
      const text = part.text
      const link = part.link
      const href = link ? shortHref(link.href, pageUrl, own) : null
      const nav = outermost(u.chain, isNavElement)
      if (nav !== null) {
        groupOf(nav, region, 'nav').push(href ? `${text} [${href}]` : text)
        continue
      }
      if (region !== 'main') {
        const list = outermost(u.chain, (el) => el.tag === 'ul' || el.tag === 'ol')
        // The home link is the logo only where a logo lives: not in a list (a language picker's
        // "English" links home too) and not in a drawer.
        const home = link !== null && href === '/' && list === null && region !== 'drawer' ? link : null
        const logo = logoEl ?? home
        if (logo !== null) {
          groupOf(logo, region, 'logo').push(...(parts.length === 1 ? unitRuns(u) : [text]))
          continue
        }
        if (list !== null) {
          groupOf(list, region, 'list').push(
            href && /^(tel|mailto):/i.test(href) ? `${text} [${href}]` : text
          )
          continue
        }
      }
      if (tag === 'button' || (link !== null && BUTTONISH.test(link.cls))) {
        entries.push({ region, kind: 'button', text, href })
        continue
      }
      if (href !== null && /^(tel|mailto):/i.test(href)) {
        entries.push({ region, kind: 'link', text, href })
        continue
      }
      if (region !== 'main' || every || (opensSection && section !== lastSection)) {
        if (section !== null) lastSection = section
        entries.push({ region, kind: 'text', text })
      }
    }
  }

  /** @param {OutlineEntry} e */
  const payloadOf = (e) => {
    if (e.group === 'logo') return [...new Set(e.items)].join(' · ')
    if (e.group !== undefined) {
      const items = /** @type {string[]} */ (e.items)
      if (every) return items.join(' · ')
      const shown = items.slice(0, OUTLINE_NAV_ITEMS).join(' · ')
      return items.length > OUTLINE_NAV_ITEMS ? `${shown} · +${items.length - OUTLINE_NAV_ITEMS} more` : shown
    }
    return `${e.text}${e.href ? ` [${e.href}]` : ''}`
  }
  /** @type {string[]} */
  const lines = []
  const seenPayload = new Set()
  const seenNav = new Set()
  /**
   * 🔒 ONLY TWO KINDS OF REPEAT ARE DROPPED: an item list printed before (a footer menu that is the
   * header's), and a drawer line that repeats a printed line (a mobile menu is a copy). Two cards
   * with the same heading or the same button are two parts of the page — dropping the second made
   * "the second card's button" count and order wrong.
   * @param {OutlineEntry} e
   */
  const emit = (e) => {
    const payload = payloadOf(e)
    if (payload === '') return
    if (e.group === 'nav' || e.group === 'list') {
      const key = /** @type {string[]} */ (e.items).join('|')
      if (seenNav.has(key)) return
      seenNav.add(key)
    }
    if (e.region === 'drawer' && seenPayload.has(`${e.kind}: ${payload}`)) return
    const lines_ = e.breaks ? ` (${e.breaks + 1} lines)` : ''
    seenPayload.add(`${e.kind}: ${payload}`)
    lines.push(`${e.region} ${e.kind}${lines_}: ${payload}`)
  }
  for (const e of entries) if (e.region !== 'drawer') emit(e)
  for (const e of entries) if (e.region === 'drawer') emit(e)
  return lines
}

// ── The pictures beside the words ──────────────────────────────────────────────────────────────────

/** How many pictures one `match` answer names at most. */
export const PICTURES_NEAR_MAX = 6
/** The most pictures one ancestor may hold and still be read as the card the words sit in. */
const CARD_PICTURES_MAX = 2
/** Ancestors that are the page, never a card: the walk stops there. */
const PAGE_LEVEL = new Set(['html', 'body', 'main'])

/**
 * The pictures that sit with the words `match` finds: for each visible run of words carrying them, the
 * nearest ancestor that holds a picture at all — and only if it holds one or two (a card, a figure, a
 * band with its one picture); an ancestor with more is a grid or a page, and says nothing about which
 * picture goes with these words.
 *
 * 🔒 WHY (09/10/2026, bench hb "use the picture of project X, shown lower on this page, as the hero"): the
 * outline and the text carry words only, so every run of this ask on every CMS went looking for the picture
 * beside a title by other roads — the raw page over `curl` and a Python parser in bash (Joomla), each card's
 * module and article record, the contract's image slots, the EmDash entry — 11 to 17 calls where a read that
 * names the picture beside the words is one. A card's picture is often inside an `aria-hidden` link (the
 * card's second link to the same page), so a picture's `hide` is not read: it is the one visitors see.
 * @param {unknown} html - the tamed page.
 * @param {string} match
 * @param {string} [pageUrl] - the address the page answered at, to shorten its own pictures' addresses.
 * @param {readonly (string | null | undefined)[]} [origins] - other origins that are this site.
 * @returns {{ near: string, src: string, alt?: string, background?: true }[]}
 */
export function picturesNear(html, match, pageUrl = 'http://page.invalid/', origins = []) {
  const needle = foldForMatch(match)
  if (needle === '') return []
  const { units, images } = renderedUnits(html)
  if (images.length === 0) return []
  /** @type {Map<object, number[]>} the pictures under each element, by their index */
  const under = new Map()
  images.forEach((img, k) => {
    for (const el of img.chain) {
      const list = under.get(el)
      if (list === undefined) under.set(el, [k])
      else list.push(k)
    }
  })
  /** @type {Set<string>} */
  const own = new Set()
  for (const o of [pageUrl, ...origins]) {
    try {
      if (typeof o === 'string' && o !== '') own.add(new URL(o).origin)
    } catch {
      // not an origin
    }
  }
  /** @param {string} src */
  const shortSrc = (src) => {
    try {
      const u = new URL(src, pageUrl)
      return (own.has(u.origin) ? u.pathname + u.search : u.href).slice(0, 300)
    } catch {
      return src.slice(0, 300)
    }
  }
  /** @type {{ near: string, src: string, alt?: string, background?: true }[]} */
  const out = []
  /** @type {Set<string>} */
  const seen = new Set()
  for (const u of units) {
    if (out.length >= PICTURES_NEAR_MAX) break
    if (u.attr !== undefined || u.hidden || !foldForMatch(u.shown).includes(needle)) continue
    for (const el of u.chain) {
      if (PAGE_LEVEL.has(el.tag)) break
      const list = under.get(el)
      if (list === undefined) continue
      if (list.length <= CARD_PICTURES_MAX)
        for (const k of list) {
          const src = shortSrc(images[k].src)
          if (seen.has(src) || out.length >= PICTURES_NEAR_MAX) continue
          seen.add(src)
          const near = u.shown.length > 80 ? `${u.shown.slice(0, 79)}…` : u.shown
          out.push({
            near,
            src,
            ...(images[k].alt !== '' && { alt: images[k].alt.slice(0, 120) }),
            // painted by the element's style, not an <img>: no image slot holds it
            ...(images[k].background && { background: true })
          })
        }
      break
    }
  }
  return out
}

// ── page.text ──────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ ok: true, url: string, path: string, lang: string | null, title: string | null,
 *   status?: number, rendered?: 'browser', thin?: true, charset?: string, match?: string,
 *   matchedLines?: number, text?: string, outline?: string, truncated?: true, chars?: number,
 *   pictures?: { near: string, src: string, alt?: string }[], next?: string }} PageTextAnswer
 * @typedef {{ ok: false, code: string, error: string, next?: string }} PageTextRefusal
 */

/**
 * One page's answer from the words a read or a render produced (T8's `{url, lang, title, text}`), with
 * the fields that carry information added only when they do — every character is read again on every
 * later step. Shared with the pre-F2 road, so both answer the same shape.
 *
 * `head:true` answers what a crawler reads instead of the words (`page-head.mjs`): description,
 * robots, canonical, Open Graph, hreflang, JSON-LD, headings, pictures without alt — from `raw`, the
 * page before taming, because taming empties the `<script>` bodies JSON-LD lives in. With `match`,
 * `found` names the tags (or script lines) that carry those words.
 * @param {{ lang: string | null, title: string | null, text: string }} page - `readablePage(...)`.
 * @param {{ url: string, path: string, params: Record<string, unknown>, cap?: number, html?: string,
 *   raw?: string, status?: number, pageUrl?: string, origins?: readonly (string | null)[],
 *   extra?: Record<string, unknown>, notes?: string[] }} input
 * @returns {PageTextAnswer}
 */
export function pageAnswer(page, input) {
  const params = input.params ?? {}
  const match = matchOf(params.match)
  const outline = params.outline === true || params.outline === 'true'
  const head = params.head === true || params.head === 'true'
  const status = input.status ?? 200
  /** @type {string[]} */
  const notes = [...(input.notes ?? [])]
  /** @type {PageTextAnswer} */
  const answer = { ok: true, url: input.url, path: input.path, lang: page.lang, title: page.title }
  if (status !== 200) answer.status = status
  Object.assign(answer, input.extra ?? {})
  // 🔒 A missing page reads as missing: r2 C09 `page.text {path:"/warranty"}` returned the not-found
  // page's words as `ok:true`, with nothing saying the page did not exist, and the agent quoted them.
  if (status === 404 || status === 410) {
    if (match !== null) answer.match = match
    answer.text = ''
    answer.next = 'That path does not exist on this site.'
    return answer
  }
  if (status >= 500) notes.unshift(`The site answered this path with an error page (status ${status}).`)
  if (head) {
    if (match !== null) answer.match = match
    const unfound = 'No tag or script of this page carries those words.'
    const cutNote = `Lists are cut to fit: call again with maxChars up to ${PAGE_TEXT_MAX_CHARS} for every heading, picture and JSON-LD value.`
    const got = headAnswer(input.raw ?? input.html ?? '', {
      cap: input.cap ?? clampChars(params.maxChars, HEAD_DEFAULT_CHARS),
      // measured with every note it may still gain, so the answer sent is within the cap
      base: {
        ...answer,
        truncated: true,
        next: [...notes, ...(match === null ? [] : [unfound]), cutNote].join(' ')
      },
      pageUrl: input.pageUrl ?? input.url,
      origins: input.origins,
      match
    })
    Object.assign(answer, got.fields)
    if (got.found !== null && got.found.length === 0) notes.push(unfound)
    if (got.cut) {
      answer.truncated = true
      notes.push(cutNote)
    }
    if (notes.length > 0) answer.next = notes.join(' ')
    return answer
  }
  const cap =
    input.cap ?? clampChars(params.maxChars, outline ? OUTLINE_DEFAULT_CHARS : PAGE_TEXT_DEFAULT_CHARS)
  let part
  /** the outline found nothing and the text did: the text's lines are the answer */
  let fromText = false
  if (outline) {
    const lines = pageOutline(input.html ?? '', input.pageUrl ?? input.url, {
      origins: input.origins,
      every: match !== null
    })
    part = outlineExcerpt(lines, match, cap)
    if (match !== null && part.matched === 0) {
      // 🔒 NEVER "no line here carries those words" FROM THE OUTLINE ALONE: it leaves out hidden
      // words (screen-reader text) that the page's text still carries. When the text has them, its
      // lines are the answer, said as such.
      const t = textExcerpt(page.text, match, cap)
      if (t.matched !== null && t.matched > 0) {
        part = t
        fromText = true
      }
    }
    if (match !== null) answer.match = match
    if (match !== null) answer.matchedLines = /** @type {number} */ (part.matched)
    if (fromText) answer.text = part.text
    else answer.outline = part.text
  } else {
    part = textExcerpt(page.text, match, cap)
    if (match !== null) answer.match = match
    if (match !== null) answer.matchedLines = /** @type {number} */ (part.matched)
    answer.text = part.text
  }
  // The pictures that sit with the words found (`picturesNear`): only when a match found some.
  if (match !== null && (part.matched ?? 0) > 0 && typeof input.html === 'string') {
    const pictures = picturesNear(input.html, match, input.pageUrl ?? input.url, input.origins ?? [])
    if (pictures.length > 0) answer.pictures = pictures
  }
  if (fromText)
    notes.push('No visible part of the page carries those words; the lines of its text that do are in text.')
  if (part.truncated) {
    answer.truncated = true
    answer.chars = part.chars
    notes.push(
      `Only ${part.text.length} of ${part.chars} characters are here: call again with match:"<words>" for just those lines, or maxChars up to ${PAGE_TEXT_MAX_CHARS}.`
    )
  } else if (match !== null && part.matched === 0) {
    notes.push('No line here carries those words; try fewer words, or paths:[…] to check other pages.')
  }
  if (notes.length > 0) answer.next = notes.join(' ')
  return answer
}

/** A path as a refusal quotes it: at most 40 characters. */
const quoted = (/** @type {string} */ path) => (path.length > 40 ? `${path.slice(0, 40)}…` : path)

/**
 * A page read that must not go on to be parsed, as the model reads it (T10: `error` ≤ 160 chars,
 * `next` ≤ 200, Tracy's own words).
 * @param {'too-large' | 'not-a-page'} why
 * @param {string} path
 * @param {string} door
 * @param {string} [contentType]
 * @returns {PageTextRefusal & { next: string }}
 */
export function pageBodyRefusal(why, path, door, contentType = '') {
  if (why === 'not-a-page')
    return {
      ok: false,
      code: 'READ_FAILED',
      error: `${quoted(path)} is a ${contentType.split(';')[0].trim().slice(0, 40)} file, not a page`,
      next: 'page.text reads pages: ask for the path of a page that links to it.'
    }
  return {
    ok: false,
    code: 'READ_FAILED',
    error: `${quoted(path)} carries more than 1 MiB of markup besides its scripts and styles, too large to read here`,
    next: `Read the words through ${door}.`
  }
}

/**
 * The browser fallback's failure as the model reads it. 🔒 ONLY `no-browser` MAY BE ANSWERED WITH THE
 * SERVER'S WORDS (`thin` / `charset`), because only then is "no browser runs here" true. A browser
 * that exists and failed — its navigation guard (`nav`), a timeout, a cut document — is READ_FAILED,
 * as the pre-F2 road answers it: turning its NAV guard into `ok:true` with next "no browser runs
 * here" told the model something false about this image (reproduced on an EmDash-shaped thin page).
 * @param {string} path
 * @param {Extract<BrowserDom, { ok: false }>} b
 * @param {string} door
 * @returns {PageTextRefusal & { next: string }}
 */
export function browserRefusal(path, b, door) {
  const away = `Read a path this site serves itself; the words behind that page: ${door}.`
  if (b.kind === 'port')
    return {
      ok: false,
      code: 'REDIRECTED_OFF_SITE',
      error: `${quoted(path)} asks to be served on a port this site does not expose here`,
      next: away
    }
  if (b.kind === 'offsite')
    return {
      ok: false,
      code: 'REDIRECTED_OFF_SITE',
      error: `${quoted(path)} left this site for ${String(b.error).slice(0, 60)} in the browser`,
      next: away
    }
  return {
    ok: false,
    code: 'READ_FAILED',
    error: `the browser could not read ${quoted(path)}: ${b.error}`,
    next: `Try once more; if it fails again, read the words through ${door}.`
  }
}

/**
 * What `robots.txt` read here is, said where it is read: the SITE's own file. While a site is a draft
 * its public address answers Tracy's own robots.txt instead (`apps/tracy-web/src/bar/route.js`
 * `ROBOTS`, "Disallow: /"), so a crawler — or a `curl` of the public address — reads that one until
 * the site is published; an agent comparing the two must not "fix" the difference.
 */
export const ROBOTS_NOTE =
  "This is the site's own robots.txt: it applies once the site is published. Until then its public address answers Tracy's robots.txt, which keeps every crawler out."

/**
 * The `<loc>` addresses of a sitemap or sitemap index, in order — the lines of it that matter (a
 * WordPress sitemap is one line of markup).
 * @param {string} body
 * @returns {string[]}
 */
export function sitemapLocs(body) {
  return [...body.matchAll(/<loc>([^<]*)<\/loc>/gi)].map((m) => decodeEntities(m[1]).trim())
}

/**
 * A file the site serves as text (`TEXT_TYPE`: robots.txt, a sitemap, llms.txt, a feed) as
 * `page.text` answers it (v6 #3), where it answered "not a page" before: its lines — a sitemap's
 * `<loc>` addresses one per line, with `locs` counting them — cut like a page's text, `match` keeping
 * only the lines that carry it. `head` means nothing here: a text file has no head.
 * @param {PageRead} read
 * @param {{ path: string, params: Record<string, unknown>, cap?: number }} input
 * @returns {Record<string, unknown>}
 */
export function textFileAnswer(read, { path, params, cap }) {
  const type = read.contentType.split(';')[0].trim().toLowerCase()
  const body = String(read.html ?? '')
  const match = matchOf(params.match)
  const locs = /xml/.test(type) ? sitemapLocs(body) : []
  const text =
    locs.length > 0
      ? locs.join('\n')
      : body
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .map((line) => line.trimEnd())
          .join('\n')
          .trim()
  const part = textExcerpt(text, match, cap ?? clampChars(params.maxChars, PAGE_TEXT_DEFAULT_CHARS))
  /** @type {Record<string, unknown>} */
  const answer = { ok: true, url: read.finalUrl, path, type }
  if (read.status !== 200) answer.status = read.status
  if (locs.length > 0) answer.locs = locs.length
  if (match !== null) {
    answer.match = match
    answer.matchedLines = part.matched
  }
  answer.text = part.text
  /** @type {string[]} */
  const notes = []
  if (part.truncated) {
    answer.truncated = true
    answer.chars = part.chars
    notes.push(
      `Only ${part.text.length} of ${part.chars} characters are here: call again with match:"<words>" for just those lines, or maxChars up to ${PAGE_TEXT_MAX_CHARS}.`
    )
  } else if (match !== null && part.matched === 0) notes.push('No line of this file carries those words.')
  if (/^\/robots\.txt$/i.test(path.split('?')[0])) notes.push(ROBOTS_NOTE)
  if (notes.length > 0) answer.next = notes.join(' ')
  return answer
}

/**
 * One page's HTML made safe to read, then read: {@link tameMarkup} (one linear pass), the parse
 * budget ({@link PAGE_PARSE_MAX_CHARS}), and `readablePage` on the result — so the regex reader never
 * sees the raw bytes a crafted page can make it scan quadratically. `html` is the tamed page either
 * way; hand it to {@link pageAnswer} (the outline reads it too). IX1's pre-F2 road reads the
 * browser's DOM through this as well.
 * @param {unknown} html
 * @param {string} path
 * @param {string} door
 * @returns {{ ok: true, html: string, page: { lang: string | null, title: string | null, text: string } }
 *   | { ok: false, html: string, answer: PageTextRefusal & { next: string } }}
 */
export function parsePage(html, path, door) {
  const tamed = tameMarkup(html)
  if (tamed.length > PAGE_PARSE_MAX_CHARS)
    return { ok: false, html: tamed, answer: pageBodyRefusal('too-large', path, door) }
  return { ok: true, html: tamed, page: readablePage(tamed) }
}

/**
 * One page read on the static road, as its `page.text` answer (F2 §3.4–3.5): the server's words, or —
 * for a page drawn by JavaScript, a foreign charset, a body too large or encoded — the browser's,
 * where there is one; where there is none, the server's words said honestly (`thin:true`) or a
 * refusal. Never `NO_BROWSER` and never `SITE_UNREACHABLE` for a site that answered.
 * @param {PageRead | (PageTextRefusal & PageReadFailure)} read - {@link fetchPageHtml}.
 * @param {{ label: string, internalPort: number, path: string, params: Record<string, unknown>, door: string,
 *   browserDom: BrowserDomFn, cap?: number, origins?: readonly (string | null)[] }} input
 * @returns {Promise<PageTextAnswer | PageTextRefusal | Record<string, unknown>>} - the last: a text file's answer.
 */
export async function staticPageText(read, input) {
  const { path, params, door } = input
  const plain = (/** @type {PageTextRefusal} */ r) => ({
    ok: /** @type {const} */ (false),
    code: r.code,
    error: r.error,
    next: r.next
  })
  if (!read.ok) {
    // A body too large or sent compressed may still be read by the browser, which neither limit binds.
    if ((read.why === 'too-large' || read.why === 'encoded') && read.route && read.pathAndQuery) {
      const b = await input.browserDom({ route: read.route, pathAndQuery: read.pathAndQuery })
      if (b.ok) {
        const drawn = parsePage(b.dom, path, door)
        if (!drawn.ok) return drawn.answer
        return pageAnswer(drawn.page, {
          url: read.url,
          path,
          params,
          cap: input.cap,
          html: drawn.html,
          raw: b.dom,
          pageUrl: read.url,
          origins: [...(input.origins ?? []), b.finalUrl],
          extra: { rendered: 'browser' }
        })
      }
      if (b.kind === 'offsite' || b.kind === 'port') return browserRefusal(path, b, door)
    }
    return plain(read)
  }
  if (read.contentType !== '' && !HTML_TYPE.test(read.contentType) && read.status < 400)
    return TEXT_TYPE.test(read.contentType)
      ? textFileAnswer(read, { path, params, cap: input.cap })
      : pageBodyRefusal('not-a-page', path, door, read.contentType)
  const parsed = parsePage(read.html, path, door)
  const base = {
    url: read.finalUrl,
    path,
    params,
    cap: input.cap,
    status: read.status,
    html: parsed.html,
    raw: read.html,
    pageUrl: read.finalUrl,
    origins: input.origins
  }
  // A missing page answers its status and title only: the head of even an oversized one says it.
  if (read.status === 404 || read.status === 410)
    return pageAnswer(
      parsed.ok ? parsed.page : readablePage(parsed.html.slice(0, PAGE_PARSE_MAX_CHARS)),
      base
    )
  if (!parsed.ok) return parsed.answer
  const page = parsed.page
  const charset = foreignCharset(read.contentType, parsed.html)
  const thin = isThinPage(parsed.html, page)
  if (!thin && charset === null) return pageAnswer(page, base)
  const b = await input.browserDom({ route: read.route, pathAndQuery: read.pathAndQuery })
  if (b.ok) {
    const drawn = parsePage(b.dom, path, door)
    if (!drawn.ok) return drawn.answer
    return pageAnswer(drawn.page, {
      ...base,
      html: drawn.html,
      raw: b.dom,
      // the browser may have been addressed by the virtual host of a canonical port: its links are
      // this site's too
      origins: [...(input.origins ?? []), b.finalUrl],
      extra: { rendered: 'browser' }
    })
  }
  if (b.kind !== 'no-browser') return browserRefusal(path, b, door)
  // No browser at all: the server's words are still the truth the server sent — say what they are.
  return thin
    ? pageAnswer(page, {
        ...base,
        extra: { thin: true },
        notes: [
          `Drawn by JavaScript and no browser runs here: only the words the server sent. The rest: ${door}.`
        ]
      })
    : pageAnswer(page, {
        ...base,
        extra: { charset },
        notes: [`The page declares ${charset}, so some letters may read wrongly here. The words: ${door}.`]
      })
}

/**
 * Run `fn` over `items` with at most `limit` running at once, answers in item order.
 * @template T, R
 * @param {readonly T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapLimit(items, limit, fn) {
  const out = /** @type {R[]} */ (Array.from({ length: items.length }))
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next
      next += 1
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * `page.text` whole (T8), with every I/O injected: `run` is the docker-exec transport; `legacy` is the
 * pre-F2 road (node probe + browser, `index.ts`) for a container with no curl — absent, such a page is
 * answered `NO_BROWSER` naming the content door; `browserDom` defaults to {@link browserDom} on `run`.
 *
 * Reads run ≤ {@link PAGE_PATHS_PARALLEL} at a time; everything after them — the browser fallback, the
 * pre-F2 road — runs SERIALLY, one chromium at a time (the reason `page.text` stays in
 * `NOT_CONCURRENT`). One path answers the single shape; several answer `{ok, match?, pages, notRead?}`,
 * `ok:true` when at least one page was read, caps shared evenly (never under 300 per page).
 * @param {{ run: Run, label: string, internalPort: number, publicOrigin?: string | null,
 *   params?: Record<string, unknown>, door?: string, now?: () => number,
 *   legacy?: (path: string, cap: number | undefined) => Promise<unknown>, browserDom?: BrowserDomFn }} input
 * @returns {Promise<unknown>}
 */
export async function pageText(input) {
  const params = input.params ?? {}
  const door = input.door ?? contentDoor()
  const asked = pagePaths(input.label, params)
  if (!asked.ok) return asked.answer
  const outline = params.outline === true || params.outline === 'true'
  const n = asked.targets.length
  const total = clampChars(params.maxChars, outline ? PAGES_OUTLINE_CHARS : PAGES_TEXT_CHARS)
  const cap = asked.multi ? Math.max(PAGE_MIN_SHARE_CHARS, Math.floor(total / n)) : undefined
  const reads = await mapLimit(asked.targets, PAGE_PATHS_PARALLEL, (t) =>
    fetchPageHtml({
      run: input.run,
      label: input.label,
      internalPort: input.internalPort,
      publicOrigin: input.publicOrigin ?? null,
      path: t.path,
      now: input.now,
      door
    })
  )
  const dom =
    input.browserDom ??
    ((/** @type {{ route: PageRoute, pathAndQuery: string }} */ at) =>
      browserDom({
        run: input.run,
        label: input.label,
        internalPort: input.internalPort,
        publicOrigin: input.publicOrigin ?? null,
        ...at
      }))
  /** @type {unknown[]} */
  const answers = []
  for (const [i, read] of reads.entries()) {
    const path = asked.targets[i].path
    if (!read.ok && read.why === 'no-curl') {
      answers.push(input.legacy ? await input.legacy(path, cap) : noReaderAnswer(door, 'curl'))
      continue
    }
    answers.push(
      await staticPageText(read, {
        label: input.label,
        internalPort: input.internalPort,
        path,
        params,
        door,
        browserDom: dom,
        cap,
        origins: [input.publicOrigin ?? null]
      })
    )
  }
  if (!asked.multi) return answers[0]
  return pagesAnswer(asked, answers, params)
}

/**
 * Several pages' answers as one: each page an entry `{path, status?, title, matchedLines?, text |
 * outline, truncated?}` or `{path, ok:false, code, error}`; `notRead` lists the paths past eight.
 * @param {{ targets: { path: string }[], notRead: string[] }} asked
 * @param {readonly unknown[]} answers
 * @param {Record<string, unknown>} params
 */
function pagesAnswer(asked, answers, params) {
  const match = matchOf(params.match)
  /** @type {Record<string, unknown>[]} */
  const pages = []
  let read = 0
  let cut = false
  answers.forEach((raw, i) => {
    const a = /** @type {Record<string, unknown>} */ (raw && typeof raw === 'object' ? raw : {})
    const path = asked.targets[i].path
    if (a.ok !== true) {
      pages.push({
        path,
        ok: false,
        code: a.code ?? 'READ_FAILED',
        error: a.error ?? 'the page could not be read'
      })
      return
    }
    read += 1
    if (a.truncated === true) cut = true
    /** @type {Record<string, unknown>} */
    const entry = { path }
    for (const key of [
      'status',
      'rendered',
      'thin',
      'type',
      'locs',
      'title',
      'matchedLines',
      'text',
      'outline',
      'pictures'
    ])
      if (a[key] !== undefined && a[key] !== null) entry[key] = a[key]
    // A head answer's fields (v6 #3), null ones kept: "no description" is the finding.
    for (const key of HEAD_KEYS) if (a[key] !== undefined) entry[key] = a[key]
    if (a.truncated !== undefined) entry.truncated = a.truncated
    pages.push(entry)
  })
  if (read === 0) {
    const first = /** @type {Record<string, unknown>} */ (answers[0] ?? {})
    return {
      ok: false,
      code: first.code ?? 'READ_FAILED',
      error: first.error ?? 'no page could be read',
      next: first.next,
      pages
    }
  }
  /** @type {string[]} */
  const notes = []
  if (cut)
    notes.push(
      params.head === true || params.head === 'true'
        ? "Some pages' heads are cut: read fewer paths, or one path for its whole head."
        : 'Some pages are cut: add match:"<words>" to get just those lines, or read fewer paths.'
    )
  if (asked.notRead.length > 0)
    notes.push(`${PAGE_TEXT_MAX_PATHS} pages per call: ask for notRead in another call.`)
  return {
    ok: true,
    ...(match === null ? {} : { match }),
    pages,
    ...(asked.notRead.length > 0 ? { notRead: asked.notRead } : {}),
    ...(notes.length > 0 ? { next: notes.join(' ') } : {})
  }
}

// ── page.look's gate ───────────────────────────────────────────────────────────────────────────────

/**
 * `page.look`'s pre-browser gate (F2 §3.7): the SAME read as `page.text`, body discarded — one
 * mechanism and one set of redirect rules, and it works where the node probe does not (the stand's
 * WordPress and Joomla, which carry no node). What it answers:
 * - `{ legacy: true }` — no curl in the container: the caller runs the pre-F2 probe, unchanged;
 * - `{ ok: false, answer }` — refuse as today: unreachable, off-site, a loop, a bad path;
 * - `{ ok: true, target, url, status }` — photograph `target` (the route the read ended on, pinned
 *   to loopback). A slow, too-large, encoded or non-HTML answer still goes on to the browser: a
 *   picture may work where a text read did not.
 * @param {{ run: Run, label: string, internalPort: number, publicOrigin?: string | null, path: string,
 *   now?: () => number, door?: string }} input
 * @returns {Promise<{ legacy: true } | { ok: false, answer: PageTextRefusal }
 *   | { ok: true, target: { url: string, origin: string, container: string, resolverRule: string, via: string },
 *       url: string, status: number | null }>}
 */
export async function pageLookGate(input) {
  const door = input.door ?? contentDoor()
  const read = await fetchPageHtml({ ...input, door })
  if (!read.ok && read.why === 'no-curl') return { legacy: true }
  /** @type {PageRoute | undefined} */
  let route
  /** @type {string | undefined} */
  let pathAndQuery
  if (read.ok) {
    route = read.route
    pathAndQuery = read.pathAndQuery
  } else if ((read.why === 'slow' || read.why === 'too-large' || read.why === 'encoded') && read.route) {
    route = read.route
    pathAndQuery = read.pathAndQuery
  } else {
    return { ok: false, answer: { ok: false, code: read.code, error: read.error, next: read.next } }
  }
  const target = browserTargetForRoute(
    input.label,
    /** @type {PageRoute} */ (route),
    String(pathAndQuery),
    input.internalPort
  )
  if (target === null)
    return {
      ok: false,
      answer: {
        ok: false,
        code: 'REDIRECTED_OFF_SITE',
        error: `${String(input.path).slice(0, 60)} asks to be served on a port this site does not expose here`,
        next: `Photograph a path this site serves itself; the words behind that page: ${door}.`
      }
    }
  return { ok: true, target, url: read.ok ? read.finalUrl : read.url, status: read.ok ? read.status : null }
}

// ── page.look {style} ──────────────────────────────────────────────────────────────────────────────

/**
 * `page.look {style}`'s refusal where the container has no browser: computed styles need one, and
 * nothing here pretends otherwise (T10: the rule, then one instruction).
 */
export const STYLE_NO_BROWSER = Object.freeze({
  ok: false,
  code: 'NO_BROWSER',
  error: "this site's container has no browser, so computed styles cannot be read here",
  next: "No computed style without a browser: find the rule in the theme's stylesheet files instead, or tell the customer."
})

/**
 * `page.look {path, style}` on the browser road (v6 #3): the container's browser in mode `style`
 * (`BROWSER_SCRIPT`, exec.mjs), addressed exactly as the screenshot is — `target` is what
 * `pageLookGate` (or the pre-F2 probe) answered — and its answer made the model's (`styleAnswer`,
 * look-style.mjs). The same clean-exit rule as page.text and page.look: an `OK` line counts only when
 * the exec finished cleanly.
 * @param {{ run: Run, target: { url: string, origin: string, container: string, resolverRule: string, via: string },
 *   req: { text?: string, selector?: string, nth: number, props: string[], viewport: 'desktop' | 'tablet' | 'mobile' },
 *   url: string, path: string, cap?: number, publicOrigin?: string | null }} input
 * @returns {Promise<Record<string, unknown>>}
 */
export async function styleLook({ run, target, req, url, path, cap, publicOrigin = null }) {
  const read = await styleRead({ run, target, req, path, publicOrigin })
  if (read.ok !== true) return read
  return styleAnswer(read.payload, { url, path, viewport: req.viewport, cap })
}

/**
 * The browser's own answer to one style read — `{ok: true, payload}`, payload as `BROWSER_SCRIPT`
 * mode `style` wrote it (`{info, props, loaded}` or `{error}`) — or the refusal the model reads. What
 * `styleLook` makes the page.look answer from, and what `look.set` (`look-set.mjs`) reads its rule,
 * stylesheet and token from before it writes, and its new values from after.
 * @param {{ run: Run, target: { url: string, origin: string, container: string, resolverRule: string, via: string },
 *   req: { text?: string, selector?: string, nth: number, props: string[], viewport: 'desktop' | 'tablet' | 'mobile', set?: boolean },
 *   path: string, publicOrigin?: string | null }} input
 * @returns {Promise<{ ok: true, payload: any } | Record<string, unknown>>}
 */
export async function styleRead({ run, target, req, path, publicOrigin = null }) {
  const { res } = await browseAsSite({
    target,
    publicOrigin,
    launch: (at) =>
      run({
        argv: browserArgv({
          container: at.container,
          mode: 'style',
          url: at.url,
          origin: at.origin,
          file: JSON.stringify(req),
          resolverRule: at.resolverRule,
          via: at.via
        }),
        timeoutMs: BROWSER_EXEC_MS,
        maxBuffer: 4 * 1024 * 1024
      })
  })
  const b = parseBrowser(res.stdout)
  if (looksLikeMissingBinary(res) || (!b.ok && b.kind === 'no-browser')) return { ...STYLE_NO_BROWSER }
  const failed = (/** @type {string} */ why) => ({
    ok: false,
    code: 'LOOK_FAILED',
    error: `the browser could not read the styles of ${quoted(path)}: ${why}`,
    next: 'Try once more; if it fails again, tell the customer the look could not be read.'
  })
  if (!b.ok && b.kind === 'offsite')
    return {
      ok: false,
      code: 'REDIRECTED_OFF_SITE',
      error: `${quoted(path)} left this site for ${String(b.error).slice(0, 60)} in the browser`,
      next: 'Read the styles of a path this site serves itself.'
    }
  if (res.timedOut) return failed('it ran out of time')
  if (!b.ok) return failed(b.kind === 'nav' ? 'it could not open the page' : 'it returned no answer')
  if (!(res.code === 0 && !res.spawnError)) return failed('its answer was cut off')
  let payload
  try {
    payload = JSON.parse(b.dom)
  } catch {
    return failed('its answer was not whole')
  }
  return { ok: true, payload }
}
