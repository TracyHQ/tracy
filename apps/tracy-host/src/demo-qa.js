import { qaDeadlineError } from './demo-qa-deadline.js'
/**
 * The demo QA gate's judge — what `POST /_host/demo-qa` decides about a demo an agent was handed
 * (tasks/plan-wo-qa-gate-and-fb-photos.md §3 as amended by the council in §6).
 *
 * The browser half (`demo-qa-browser.js`) reads each page into a plain object; every check here is a
 * pure function of those reads, so each one is tested without a browser and the regression case can
 * replay a fixture through the very same judge.
 *
 * 🔒 A CHECK REPORTS, IT NEVER REPAIRS. Each answers `{id, pass, measured, expected, detail}`;
 * `detail` names the page, the file and the selector so tracy-web can hand the agent coordinates, and
 * nothing here writes to a site.
 *
 * 🔒 CSS IS JUDGED PER STYLESHEET, NOT BY A TOTAL (council §6b). A template's own stylesheet may not
 * lose a rule nor its last rule (the sentinel) against the baseline taken before the agent's turn;
 * every same-origin stylesheet must keep its braces balanced and carry no SCSS/LESS source or merge
 * markers. lumorahoian (18/10/2026): the agent recompiled `template.css` into raw SCSS with a stray
 * `}`, and the browser read 2,223 of its 3,701 rules.
 *
 * 🔒 NO LIST PER TEMPLATE OR PER CMS (18/10/2026). What counts as "demo" is measured, not
 * named: a picture or a block of text the site showed BEFORE the agent's turn (the baseline taken at
 * hand-off) that is still shown after it — pictures matched by file and by the sha256 of their bytes,
 * minus what Tracy's own build placed; text minus what the brief says. Facts a visitor acts on (hours,
 * prices, phones, a founding year) must be values the brief holds. Every input is a URL and a baseline,
 * so the same gate judges Joomla, WordPress and EmDash.
 */
import { createHash } from 'node:crypto'
import { captureTarget } from './capture.js'
import { ownPublicOrigin } from './public-origin.js'
import { SAFE_LABEL } from './provision.js'
import { probeSiteProxy } from './site-proxy-probe.js'
import { checkFacesNamed, checkPhotosMatchSlots, slotPhotosBody } from './demo-qa-slot-photos.js'

/** A page's `load` must fire within this long (council §6, "load ceiling 12 s"). */
export const DEMO_QA_LOAD_CAP_MS = 12_000

/** The most pages one QA run reads: home plus six from the nav — a run stays inside ~2 minutes. */
export const DEMO_QA_MAX_PAGES = 7

/** The most kept pages of a build's page plan read each run, on top of `DEMO_QA_MAX_PAGES`; the run's
 * `budgetMs` still stops it starting a page late. */
export const DEMO_QA_MAX_PLAN = 8

/**
 * 🔒 EVERY ROUTE IS JUDGED FOR ITS CONTENT (product owner, 25/10/2026): the build's frozen inventory names every
 * route a visitor reaches; they are read after the pages, in the same browser, for the checks that judge what a
 * page says and shows (`no-demo-pictures`, `no-demo-words`) and for the residue the sweep clears. At most this many a run.
 */
export const DEMO_QA_MAX_ROUTES = 150

/** The phone width a page must not scroll sideways at. */
export const PHONE_WIDTH = 390

/** Hosts a template's demo reaches that a finished site must not (ja-restaurant's OpenTable widget). */
export const DEFAULT_DEMO_HOSTS = Object.freeze(['opentable.com', 'html5shim.googlecode.com'])

/** The least WCAG contrast a nav link or a heading may have against what is painted behind it. */
const MIN_CONTRAST = 2

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const PORT = (value) => Number.isInteger(value) && value > 0 && value < 65536
/** At most this many findings per check travel back: enough for a repair prompt, never a page dump. */
const DETAIL_MAX = 20
/** How many template categories one check lists for the sweep. */
const CATEGORIES_MAX = 50
/**
 * 🔒 THE SWEEP SEES EVERY TEMPLATE PICTURE, NOT THE REPAIR PROMPT'S TWENTY (lrsweep rig round 6, 24/10/2026): 42
 * pictures shown, the first 20 all ones no door writes, so the rest — the blog sidebar's banner among them — never
 * reached the sweep, round after round, not even as unresolved. `pictures` carries them up to this bound; tracy-web
 * plans from it and drops it before the agent reads the check (`client-demo.js`).
 */
const PICTURES_MAX = 400

const CHECK_IDS = Object.freeze([
  'pages-load',
  'css-intact',
  'look-kept',
  'no-demo-pictures',
  'no-demo-words',
  'facts-from-brief',
  'cta-real',
  'no-horizontal-scroll',
  'content-reachable',
  'no-third-party-demo',
  'contrast-readable',
  'no-text-overlap',
  'no-broken-assets-and-links',
  'no-cms-error-leak',
  'no-raw-placeholders',
  'no-empty-picture-slots',
  'no-empty-boxes',
  'photos-fit',
  'placed-pictures-visible',
  'no-google-review-quoted',
  'structure-kept',
  'collected-used',
  'withheld-not-shown',
  'header-brand',
  'no-copied-reviews',
  'picture-frames-kept',
  'photos-match-slots',
  'faces-named'
])
export { CHECK_IDS }

/**
 * An on-site path the browser may open: absolute, never protocol-relative (`//evil.test/` would leave
 * the demo's origin), no backslash, no whitespace.
 * @param {unknown} p
 */
export function isSitePath(p) {
  return typeof p === 'string' && /^\/(?![/\\])[^\s\\]*$/.test(p) && p.length <= 400
}

const strings = (value, max, each) =>
  Array.isArray(value)
    ? value.filter((v) => typeof v === 'string' && v !== '' && v.length <= each).slice(0, max)
    : []

/**
 * A page plan's path as the site serves it: Joomla answers `/index.php/<route>` with or without URL
 * rewriting, and a plan names the bare route.
 * @param {string} platform @param {string} p
 */
function planPath(platform, p) {
  return platform === 'joomla' && !/^\/index\.php(?=\/|$)/.test(p) && p !== '/' ? `/index.php${p}` : p
}

/** One key for `/index.php/x` and `/x`, so a page nav and the plan both name is read once. */
const routeKey = (p) => p.replace(/^\/index\.php(?=\/|$)/, '') || '/'

/** The kept pictures a request names: `{file, kind, reason}` each, anything else dropped. */
function keptOf(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((k) => k && typeof k.file === 'string' && k.file && k.file.length <= 400)
    .slice(0, 500)
    .map((k) => ({
      file: k.file.replace(/^\/+/, ''),
      kind: typeof k.kind === 'string' ? k.kind.slice(0, 40) : 'keep',
      reason: typeof k.reason === 'string' ? k.reason.slice(0, 300) : 'kept by the template'
    }))
}

/**
 * Read the request into what a QA run needs, or the first thing wrong with it. Same target grammar as
 * `captureBody`: a label held to `SAFE_LABEL`, at most a hostname and a port; never a URL.
 * @param {any} body
 */
export function demoQaBody(body) {
  const fail = (error) => ({ error })
  if (!body || typeof body !== 'object') return fail('not an object')
  if (typeof body.label !== 'string' || !SAFE_LABEL.test(body.label)) return fail('refused label')
  if (typeof body.platform !== 'string' || body.platform === '') return fail('refused platform')
  if (
    body.workflow === 'agent-demo/1' &&
    typeof body.briefText === 'string' &&
    body.briefText.length > 400_000
  )
    return fail('fact evidence exceeds 400000 characters; complete evidence is required')
  if (typeof body.collected?.sourced === 'string' && body.collected.sourced.length > 400_000)
    return fail('collected evidence exceeds 400000 characters; complete evidence is required')
  const pages = body.pages === undefined ? ['/'] : body.pages
  if (!Array.isArray(pages) || pages.length === 0) return fail('need at least one page')
  if (!pages.every(isSitePath)) return fail('refused page path')
  const plan = body.plan === undefined ? [] : body.plan
  if (!Array.isArray(plan) || !plan.every(isSitePath)) return fail('refused plan path')
  const planned = [...new Set(plan.map((p) => planPath(body.platform, p)))].slice(0, DEMO_QA_MAX_PLAN)
  const baseline = body.baseline && typeof body.baseline === 'object' ? body.baseline : null
  if (baseline && (typeof baseline.cssRules !== 'object' || baseline.cssRules === null))
    return fail('baseline needs cssRules')
  const publicOrigin = ownPublicOrigin(body.publicOrigin, body.host)
  if (publicOrigin === undefined) return fail('refused public origin')
  const demoHosts = strings(body.demoHosts, 50, 253).filter((h) => HOSTNAME.test(h))
  return {
    error: null,
    publicOrigin,
    label: body.label,
    platform: body.platform,
    port: PORT(body.port) ? body.port : null,
    host: typeof body.host === 'string' && HOSTNAME.test(body.host) ? body.host : null,
    pages: [...new Set(pages)].slice(0, DEMO_QA_MAX_PAGES),
    discover: body.discover === true,
    // A check after the first: pages whose document did not change keep their last read (`readDemoPage` `previous`).
    incremental: body.incremental === true,
    measureFrames: body.measureFrames === true,
    plan: planned,
    routes: [
      ...new Set(
        strings(body.routes, DEMO_QA_MAX_ROUTES * 2, 400)
          .filter(isSitePath)
          .map((p) => planPath(body.platform, p))
      )
    ].slice(0, DEMO_QA_MAX_ROUTES),
    // Each template post's frozen route and the route it answers at now, null when none was found (`postRoutes`).
    postRoutes: postRoutesOf(body.postRoutes, body.platform),
    // How long the routes may take, on top of `budgetMs`: none unless the caller gives them time.
    routeBudgetMs:
      Number.isInteger(body.routeBudgetMs) && body.routeBudgetMs > 0
        ? Math.min(body.routeBudgetMs, 300_000)
        : 0,
    // The pages the build's plan made the contact page: a booking button leads to one of them (`cta-real`).
    contactPaths: (Array.isArray(body.contactPaths) ? body.contactPaths : []).filter(isSitePath).slice(0, 5),
    maxPages: DEMO_QA_MAX_PAGES + planned.length,
    baseline,
    placed: strings(body.placed, 500, 400),
    // The template pictures no build path replaces, each with why (`agent-demo-slot-fit.js` `keptPictures`).
    kept: keptOf(body.kept),
    // Each placed file's source photo (`agentDemoCollected`): crops of one photo are one photo (`collected-used`).
    placedSources: Object.fromEntries(
      Object.entries(body.placedSources && typeof body.placedSources === 'object' ? body.placedSources : {})
        .filter(([path, source]) => path.length <= 400 && typeof source === 'string' && source.length <= 200)
        .slice(0, 500)
    ),
    // What each source photo shows (`demo-photo-labels.js`): where it may go (`photos-fit`).
    sourceSubjects: Object.fromEntries(
      Object.entries(
        body.sourceSubjects && typeof body.sourceSubjects === 'object' ? body.sourceSubjects : {}
      )
        .filter(([id, subject]) => id.length <= 200 && typeof subject === 'string' && subject.length <= 40)
        .slice(0, 500)
    ),
    briefText: typeof body.briefText === 'string' ? body.briefText.slice(0, 400_000) : '',
    // The template's own post titles, as the build's frozen inventory read them (`residueOf`: a heading holding one).
    templateTitles: strings(body.templateTitles, 300, 300),
    // The brief without the frozen research appended for facts: what template text is judged against (`no-demo-words`).
    briefProse: typeof body.briefProse === 'string' ? body.briefProse.slice(0, 400_000) : null,
    // The domain's fillers and approved neutral words in every site language (`no-demo-words`); absent → English.
    fillers: strings(body.fillers, 500, 200),
    neutralWords: strings(body.neutralWords, 500, 200),
    googleReviews: strings(body.googleReviews, 20, 10_000),
    // The business name a wordmark is drawn from where the template's logo shows (`readInPage` `drawWordmark`).
    wordmark:
      typeof body.wordmark === 'string' && body.wordmark.trim() ? body.wordmark.trim().slice(0, 80) : null,
    // The sweep's brand writer wore the business's own logo (`client-demo.js` `businessLogoDue`): the header logo it
    // uploaded (`tracy-brand/logo-…`, a folder only that writer fills) is the business's.
    logoWorn: body.logoWorn === true,
    // The business's own logo as the build imported it, laid in the template logo's box (`fitLogoInPage`).
    logoPicture:
      typeof body.logoPicture === 'string' &&
      body.logoPicture.length <= 2000 &&
      /^(https?:\/\/|\/)/.test(body.logoPicture)
        ? body.logoPicture
        : null,
    googleReviewTestimonials: (Array.isArray(body.googleReviewTestimonials)
      ? body.googleReviewTestimonials
      : []
    )
      .filter(
        (r) =>
          r && typeof r.text === 'string' && r.text.trim() && typeof r.author === 'string' && r.author.trim()
      )
      .slice(0, 20)
      .map((r) => ({
        text: r.text.slice(0, 10_000),
        author: r.author.slice(0, 500),
        ...(r.provider === 'TripAdvisor'
          ? {
              provider: 'TripAdvisor',
              ...(typeof r.authorUrl === 'string' ? { authorUrl: r.authorUrl.slice(0, 2000) } : {})
            }
          : {}),
        url: typeof r.url === 'string' ? r.url.slice(0, 2000) : null
      })),
    reviewTestimonials: (Array.isArray(body.reviewTestimonials) ? body.reviewTestimonials : [])
      .filter(
        (r) =>
          r && typeof r.text === 'string' && r.text.trim() && typeof r.author === 'string' && r.author.trim()
      )
      .slice(0, 20)
      .map((r) => ({
        provider: typeof r.provider === 'string' ? r.provider.slice(0, 200) : null,
        language: typeof r.language === 'string' ? r.language.slice(0, 50) : null,
        text: r.text.slice(0, 10_000),
        author: r.author.slice(0, 500),
        url: typeof r.url === 'string' ? r.url.slice(0, 2000) : null
      })),
    allowedCta: strings(body.allowedCta, 50, 2000),
    // The brand accent the build gave (#1780, ADR 0023 amended 26/10/2026): only accent role tokens, only plain hex.
    accentTokens: accentTokensOf(body.accentTokens),
    // The WhatsApp link the brief gives (ADR 0037 amended 26/10/2026): a button that may leave the demo.
    whatsappLinks: strings(body.whatsappLinks, 5, 200).filter((href) => WHATSAPP_LINK.test(href)),
    // What the brief says not to show (`withheld-not-shown`): a field the sources disagree on, with every value given.
    withheld: (Array.isArray(body.withheld) ? body.withheld : [])
      .filter((w) => w && typeof w.field === 'string' && w.field !== '' && w.field.length <= 60)
      .slice(0, 20)
      .map((w) => ({ field: w.field, values: strings(w.values, 50, 500) })),
    collected: collectedOf(body.collected),
    // Which brief offering or person each placed photo shows, and which slot it was placed in (`demo-qa-slot-photos.js`).
    ...slotPhotosBody(body),
    demoHosts: [...new Set([...DEFAULT_DEMO_HOSTS, ...demoHosts])],
    // No page is started after this long: a caller with a deadline of its own gets an answer inside it.
    budgetMs:
      Number.isInteger(body.budgetMs) && body.budgetMs > 0 ? Math.min(body.budgetMs, 300_000) : 240_000
  }
}

/** One check's answer. */
function verdict(id, findings, measured, expected) {
  return { id, pass: findings.length === 0, measured, expected, detail: findings.slice(0, DETAIL_MAX) }
}

/**
 * A failing check every finding of which the residue sweep clears says so (`sweepable`), counted over all its
 * findings, not the `detail` cut: the web side then sweeps and checks again without spending an attempt.
 */
function sweepable(result, findings) {
  return !result.pass && findings.every((f) => f.sweep === true) ? { ...result, sweepable: true } : result
}

/** A host is `domain` or one of its subdomains. */
export function hostIn(host, domains) {
  const h = String(host ?? '').toLowerCase()
  return domains.some((d) => h === d || h.endsWith(`.${d}`))
}

const NAV_SKIP = /\.(pdf|jpe?g|png|webp|zip)$/i

const TAG = /<(link|meta|base)\b[^>]*>/gi
const ATTR = /([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

/**
 * The address a site believes it has, from the markers its home page writes — WordPress's
 * `rel="https://api.w.org/"`, a canonical link, `og:url`, a `<base>` — when that address is on one of
 * the site's own hostnames. Null when home writes none (Joomla), or names a host that is not the site's.
 * The macOS stand reads a web container by its docker name while WordPress writes every link and
 * redirect with the published name; the reader then opens pages at that name (`serveFrom`).
 * @param {string} html @param {string[]} siteHosts
 * @returns {string | null} an origin
 */
export function selfOriginIn(html, siteHosts) {
  if (typeof html !== 'string' || !siteHosts?.length) return null
  const found = { api: null, canonical: null, og: null, base: null }
  for (const tag of String(html).slice(0, 200_000).matchAll(TAG)) {
    const a = {}
    for (const m of tag[0].matchAll(ATTR)) a[m[1].toLowerCase()] = m[2] ?? m[3] ?? ''
    if (a.rel === 'https://api.w.org/' && a.href) found.api ??= a.href
    else if (a.rel === 'canonical' && a.href) found.canonical ??= a.href
    else if (a.property === 'og:url' && a.content) found.og ??= a.content
    else if (tag[1].toLowerCase() === 'base' && a.href) found.base ??= a.href
  }
  for (const href of [found.api, found.canonical, found.og, found.base]) {
    if (!href) continue
    try {
      const u = new URL(href)
      if (/^https?:$/.test(u.protocol) && hostIn(u.hostname, siteHosts)) return u.origin
    } catch {
      // not an absolute address: the next marker
    }
  }
  return null
}

/**
 * The home page's text at `base`, for `selfOriginIn`; empty when it does not answer in time.
 * @param {string} base @param {{fetchImpl?: typeof fetch, timeoutMs?: number, signal?: AbortSignal}} [options]
 */
export async function homeHtml(base, { fetchImpl = fetch, timeoutMs = 8000, signal } = {}) {
  signal?.throwIfAborted()
  try {
    const res = await fetchImpl(base, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])])
    })
    return res.ok ? (await res.text()).slice(0, 200_000) : ''
  } catch {
    signal?.throwIfAborted()
    return ''
  }
}

/**
 * The pages home's nav links to, as site paths: links on the page's own origin or on the site's
 * published hostname (WordPress writes its menu as absolute links to `siteurl`, which is not the
 * address the reader opened), never home itself, a file, or a link off the site.
 * @param {string[]} hrefs - absolute addresses, in page order
 * @param {string} pageUrl
 * @param {string[]} [siteHosts]
 */
export function navPathsOf(hrefs, pageUrl, siteHosts = [], max = 6) {
  const origin = new URL(pageUrl).origin
  const paths = []
  for (const href of hrefs) {
    let to
    try {
      to = new URL(href)
    } catch {
      continue
    }
    if (!(to.origin === origin || hostIn(to.hostname, siteHosts)) || NAV_SKIP.test(to.pathname)) continue
    const p = to.pathname + to.search
    if (p === '/' || p === '/index.php' || paths.includes(p)) continue
    paths.push(p)
    if (paths.length >= max) break
  }
  return paths
}

// ── pages-load ─────────────────────────────────────────────────────────────────────────────────

/**
 * 🔒 A TEMPLATE POST IS CHECKED WHERE IT ANSWERS NOW (product owner, 26/10/2026): a rewritten post takes a slug from
 * its new title, so the frozen inventory's route for it is the old one. The web side sends each template post route
 * with the route it found for the post on the live site (`post-routes.js` `currentPostRoutes`): `was`, `route` (null
 * when none was found), the post, its template title and what was tried.
 * @param {unknown} list @param {string} platform
 * @returns {Array<{was: string, route: string | null, post: Record<string, string | number | null> | null, title: string | null, tried: string[]}>}
 */
function postRoutesOf(list, platform) {
  const out = []
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || typeof p !== 'object' || typeof p.was !== 'string' || !isSitePath(p.was)) continue
    if (p.route !== null && (typeof p.route !== 'string' || !isSitePath(p.route))) continue
    const post =
      p.post && typeof p.post === 'object'
        ? Object.fromEntries(
            ['kind', 'collection', 'id', 'locale']
              .filter((k) => ['string', 'number'].includes(typeof p.post[k]))
              .map((k) => [k, typeof p.post[k] === 'string' ? p.post[k].slice(0, 200) : p.post[k]])
          )
        : null
    out.push({
      was: planPath(platform, p.was),
      route: p.route === null ? null : planPath(platform, p.route),
      post,
      title: typeof p.title === 'string' ? p.title.slice(0, 300) : null,
      tried: strings(p.tried, 10, 300)
    })
    if (out.length >= DEMO_QA_MAX_ROUTES) break
  }
  return out
}

/** Which template post a finding is about: its frozen route, the post and its template title. */
const postNamed = (p) => ({
  was: p.was,
  ...(p.post ? { post: p.post } : {}),
  ...(p.title ? { title: p.title } : {})
})

/**
 * Each template post the run could not open where it answers now, named: its current route answered 404 or 410, or
 * no current route was found. Never a silent skip (product owner, 26/10/2026). A post route a page read already
 * judges (`checkPagesLoad`) and one the route budget left unread are not counted twice.
 * @param {ReturnType<typeof postRoutesOf>} postRoutes
 * @param {Array<{path: string, status: number | null}>} visited @param {PageRead[]} reads
 */
function postRouteFindings(postRoutes, visited, reads) {
  const findings = []
  const named = postNamed
  for (const p of postRoutes) {
    if (p.route === null) {
      findings.push({
        page: p.was,
        ...named(p),
        problem: "the template post's current route was not found on the site",
        tried: p.tried
      })
      continue
    }
    if (reads.some((r) => routeKey(r.path) === routeKey(p.route))) continue
    // Read as a route (no page judged it): a 404 or 410, another failing answer, no answer, or a landing on home.
    const v = visited.find((x) => routeKey(x.path) === routeKey(p.route))
    if (!v) continue
    const problem =
      v.skipped === 'redirected home'
        ? 'the template post redirected home from its current route'
        : v.status === null || v.status === undefined
          ? 'the template post did not open at its current route'
          : v.status >= 200 && v.status < 400
            ? null
            : `the template post answered ${v.status} at its current route`
    if (problem)
      findings.push({ page: p.route, ...named(p), problem, tried: [...p.tried, `read ${p.route}`] })
  }
  return findings
}

/**
 * Every page answered under 400 and fired `load` within the cap, and asked no demo host for anything:
 * a visitor's browser does not abort OpenTable's parser-blocking script the way this one does, so a
 * blocked request is a page that would have hung for them. A template post that does not open where it answers
 * now is named here too (`postRouteFindings`).
 * @param {PageRead[]} reads
 */
export function checkPagesLoad(reads, { loadCapMs = DEMO_QA_LOAD_CAP_MS, posts = [], postRoutes = [] } = {}) {
  const findings = []
  for (const r of reads) {
    if (r.error) findings.push({ page: r.path, problem: 'did not open', error: r.error })
    else if (!(r.status >= 200 && r.status < 400))
      findings.push({ page: r.path, problem: `answered ${r.status}` })
    else if (r.loadMs === null || r.loadMs === undefined || r.loadMs > loadCapMs)
      findings.push({
        page: r.path,
        problem: `load did not fire within ${loadCapMs} ms`,
        pending: (r.pending ?? []).slice(0, 10)
      })
    else if ((r.blocked ?? []).length)
      findings.push({
        page: r.path,
        problem: 'requests a demo host that holds the page',
        blocked: r.blocked.slice(0, 10)
      })
  }
  // 🔒 A POST ROUTE'S FAILURE NAMES ITS POST, WHICHEVER LIST READ IT (review 26/10/2026): a template post's current
  // route the run read as a page (nav, `pages`, the baseline's post) and found failing carries the post, its old
  // route and what was tried, like one only the route reads met (`postRouteFindings`).
  for (const f of findings) {
    const p = postRoutes.find((x) => x.route !== null && routeKey(x.route) === routeKey(f.page))
    if (p) Object.assign(f, postNamed(p), { tried: [...p.tried, `read ${p.route}`] })
  }
  const failed = findings.length
  findings.push(...posts)
  return verdict(
    'pages-load',
    findings,
    `${reads.length - failed}/${reads.length} pages loaded` +
      (posts.length > 0 ? `; ${posts.length} template posts not open at their current route` : ''),
    `every page loads within ${loadCapMs / 1000} s`
  )
}

// ── css-intact ─────────────────────────────────────────────────────────────────────────────────

/**
 * What is wrong in a stylesheet's TEXT, regardless of what the browser made of it: unbalanced braces
 * (comments and strings skipped), SCSS/LESS source, merge markers, an unclosed comment.
 * @param {string} text
 * @returns {string[]}
 */
export function cssTextProblems(text) {
  const problems = []
  let depth = 0
  let line = 1
  let strayAt = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n') line++
    else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end === -1) {
        problems.push(`an unclosed /* comment at line ${line}`)
        break
      }
      for (let j = i; j < end; j++) if (text[j] === '\n') line++
      i = end + 1
    } else if ((ch === '"' || ch === "'") && text[i - 1] !== '\\') {
      // A quote after a backslash is part of a selector, not a string: Tailwind escapes class names
      // like `.\[\&_svg\:not\(\[class\*\=\'size-\'\]\)\]` (em-lumora1, 18/10/2026), and reading
      // that `\'` as a string start swallowed the next `{` and reported "1 { never closed".
      let j = i + 1
      while (j < text.length && text[j] !== ch && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
      i = j
    } else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth < 0) {
        strayAt ??= line
        depth = 0
      }
    }
  }
  if (strayAt !== null) problems.push(`a } with no { at line ${strayAt}`)
  if (depth > 0) problems.push(`${depth} { never closed`)
  const scss = /(^|[;{}\s])\$[a-z_][\w-]*\s*:/im.exec(text)
  if (scss) problems.push(`SCSS variable ${scss[0].trim().replace(/^[;{}]/, '')}`)
  const directive = /@(include|mixin|extend|use|forward|function|each|if)\s/.exec(
    text.replace(/\/\*[\s\S]*?\*\//g, '')
  )
  if (directive) problems.push(`SCSS directive @${directive[1]}`)
  if (/^(<<<<<<<|>>>>>>>|=======)(\s|$)/m.test(text)) problems.push('a merge-conflict marker')
  return problems
}

/** A stylesheet the template owns, held to the baseline; a site's own `custom.css` grows freely. */
const strictSheet = (path) => !/(^|\/)custom[\w.-]*\.css$/i.test(path)

/**
 * A T3/T4 "optimize CSS" bundle: hashed by its contents, so unpublishing one module renames every
 * bundle on the page. Held to the baseline as ONE pool of rules, never by name — by name, the first
 * agent turn on both 18/10/2026 demos lost "4 stylesheets" that had merely been re-bundled. T4 writes
 * them under `t4-assets/css/` or, since T4 2.x, `media/t4/optimize/css/<md5>.css` (opal-moon-bistro-j6b,
 * 19/10/2026: six bundles re-bundled into one new hash read as 20 new paint rules and 6 lost sheets).
 */
const OPTIMIZE_BUNDLE = /(^|\/)(?:t[34]-assets\/css\/[\w-]+|media\/t[34]\/optimize\/css\/[0-9a-f]{32})\.css$/i
/** The share of its rules the bundle pool may lose to re-bundling before it counts as broken. */
const BUNDLE_POOL_FLOOR = 0.5

/**
 * A stylesheet named by its contents' hash — Astro `_astro/Base.BNyaLx3F.css`, Vite
 * `assets/index-C3k9aQ2x.css` — is renamed by every rebuild, and EmDash's hand-off rule 8 rebuilds
 * the site. Held to the baseline by its STEM (`_astro/Base.css`), so a rebuild that keeps the rules is
 * not "no longer loaded" (em-lumora1, 18/10/2026: 205 → 206 rules, reported as a lost sheet).
 * @param {string} path
 * @returns {string | null} the stem, or null when the name carries no content hash
 */
export function hashedStem(path) {
  const astro = /^((?:.*\/)?_astro\/[\w.-]+?)\.[A-Za-z0-9_-]{8}\.css$/.exec(path)
  if (astro) return `${astro[1]}.css`
  const vite = /^((?:.*\/)?assets\/[\w.-]+?)-[A-Za-z0-9_-]{8}\.css$/.exec(path)
  if (vite) return `${vite[1]}.css`
  return null
}

/** A CMS's per-block stylesheet (`wp-includes/blocks/<name>/…`, a theme's `blocks/<name>/…`): it loads only with that block. */
const BLOCK_SHEET = /(?:^|\/)blocks\/([\w-]+)\/[\w.-]+\.css$/i

/**
 * What a stylesheet no longer loaded asks for: it was not edited, so restoring a file fixes nothing. A block's
 * sheet means the page lost that block (Copper Wire, 24/10/2026: `site-title/style.min.css` — the header's name was
 * deleted); any other means what linked it is gone from the page or the template's head.
 * @param {string} path
 */
function unloadedFix(path) {
  const block = BLOCK_SHEET.exec(path)?.[1]
  return block
    ? `the page no longer has a ${block} block, and this stylesheet loads only with it: put the ${block} block back where the template had it (in the header for a site title or logo) instead of touching any CSS file`
    : 'nothing on the page links this stylesheet any more: put back the element, module or template part that loaded it, or its link in the template’s head; do not copy the file elsewhere'
}

/**
 * @param {PageRead[]} reads
 * @param {{cssRules: Record<string, {rules: number, sentinel: string | null}>} | null} baseline
 */
export function checkCssIntact(reads, baseline) {
  const findings = []
  /** @type {Map<string, {path: string, rules: number, sentinelFound: boolean | null, text: string | null, page: string}>} */
  const sheets = new Map()
  for (const r of reads)
    for (const s of r.sheets ?? []) if (!sheets.has(s.path)) sheets.set(s.path, { ...s, page: r.path })
  const before = baseline?.cssRules ?? {}
  const pool = { before: 0, after: 0, named: 0 }
  /** Sheets read this run by stem, for the baseline entries whose name a rebuild changed. */
  const byStem = new Map()
  for (const s of sheets.values()) {
    const stem = hashedStem(s.path)
    if (stem && !byStem.has(stem)) byStem.set(stem, s)
  }
  for (const [path, was] of Object.entries(before)) {
    if (!strictSheet(path)) continue
    if (OPTIMIZE_BUNDLE.test(path)) {
      if (!was.page || reads.some((r) => r.path === was.page)) {
        pool.before += was.rules ?? 0
        pool.named++
      }
      continue
    }
    const stem = hashedStem(path)
    const now = sheets.get(path) ?? (stem ? byStem.get(stem) : undefined)
    if (!now) {
      // A sheet read on a page this run did not open says nothing; only a page both runs read counts.
      if (was.page && !reads.some((r) => r.path === was.page)) continue
      findings.push({ file: path, problem: 'no longer loaded', before: was.rules, fix: unloadedFix(path) })
      continue
    }
    if (now.rules < was.rules)
      findings.push({
        file: now.path === path ? path : `${path} (now ${now.path})`,
        problem: `the browser reads ${now.rules} of its ${was.rules} rules`,
        before: was.rules,
        after: now.rules
      })
    else if (was.sentinel && now.sentinelFound === false)
      findings.push({ file: now.path, problem: 'its last rule is gone', sentinel: was.sentinel })
  }
  for (const s of sheets.values()) if (OPTIMIZE_BUNDLE.test(s.path)) pool.after += s.rules ?? 0
  if (pool.named && pool.after < pool.before * BUNDLE_POOL_FLOOR)
    findings.push({
      file: 'optimize bundles',
      problem: `the browser reads ${pool.after} of the ${pool.before} rules the template's css bundles held`,
      before: pool.before,
      after: pool.after
    })
  for (const s of sheets.values()) {
    if (typeof s.text !== 'string') continue
    for (const problem of cssTextProblems(s.text)) findings.push({ file: s.path, page: s.page, problem })
  }
  const total = [...sheets.values()].reduce((n, s) => n + (s.rules ?? 0), 0)
  return verdict(
    'css-intact',
    findings,
    `${sheets.size} stylesheets, ${total} rules`,
    'no template stylesheet loses a rule or its last rule; every stylesheet is plain CSS'
  )
}

/** Blocks of words a baseline keeps of one page, and the pages it keeps them of (`baselineOf` `pageBlocks`). */
const PAGE_BLOCKS_MAX = 150
const PAGE_BLOCKS_PAGES = 30

/**
 * What the next run compares against, read off the site as Tracy handed it over: each same-origin
 * stylesheet's rule count and last rule (and the page it was first read on), every visible picture by
 * file and bytes except those Tracy placed, and every block of text by `textKey`.
 * @param {PageRead[]} reads
 * @param {string[]} [placed]
 */
/** A frame as a page names it, without the ids a template numbers (a WordPress attachment class, a module's `#acm-…-112`). */
export const frameKey = (selector) =>
  String(selector ?? '')
    .replace(/\.wp-image-\d+/g, '')
    .replace(/#[\w-]*\d[\w-]*/g, '')

/** A picture file a template names as its mark (`logo.png`, `brand-badge.svg`). */
const MARK_FILE = /(?:^|[/_.-])(?:logo|brand)/i

/**
 * 🔒 WHAT THE TEMPLATE ITSELF REPEATS IS ITS DESIGN (local round 35, 26/10/2026). The happy-hours cards of JA Restaurant
 * (WordPress) and JA Fresco (Joomla) each carry one badge picture; the build put the business's logo or one photo in
 * all three, and photos-fit and collected-used failed what the template does. Per page: each picture the template
 * shows in two frames or more (`repeats`, by `frameKey`), and the frames showing a mark file beyond the header and
 * footer (`marks`). Pages with neither are left out.
 * @param {PageRead[]} reads
 */
function designRepeats(reads) {
  /** @type {Record<string, string[][]>} */
  const repeats = {}
  /** @type {Record<string, number>} */
  const marks = {}
  for (const r of reads) {
    if (r.error) continue
    /** @type {Map<string, string[]>} */
    const byFile = new Map()
    let markFrames = 0
    for (const img of r.images ?? []) {
      if (img.broken || img.clone) continue
      const file = fileOf(img.src)
      if (!file) continue
      if (MARK_FILE.test(file)) markFrames++
      if ((img.width ?? 0) >= REPEAT_MIN.width && (img.height ?? 0) >= REPEAT_MIN.height)
        byFile.set(file, [...(byFile.get(file) ?? []), frameKey(img.selector)])
    }
    const groups = [...byFile.values()].filter((at) => at.length > 1).slice(0, 10)
    if (groups.length) repeats[r.path] = groups.map((at) => at.slice(0, 12))
    if (markFrames > LOGO_FRAMES) marks[r.path] = markFrames
  }
  return { repeats, marks }
}

export function baselineOf(reads, placed = [], { frames = false, routes = [] } = {}) {
  // The routes' words and pictures are the template's too (`no-demo-pictures`, `no-demo-words`); their sheets, look and sections are
  // judged on the pages only, so a route that did not open never makes the baseline untrusted.
  const content = [...reads, ...routes]
  /** @type {Record<string, {rules: number, sentinel: string | null, page: string}>} */
  const cssRules = {}
  for (const r of reads)
    for (const s of r.sheets ?? [])
      if (!(s.path in cssRules))
        cssRules[s.path] = { rules: s.rules, sentinel: s.sentinel ?? null, page: r.path }
  const texts = new Set()
  for (const r of content) for (const b of r.blocks ?? []) texts.add(textKey(b.text))
  const labels = new Set()
  for (const r of content) for (const l of r.labels ?? []) labels.add(textKey(l.text))
  const read = []
  // 🔒 EACH PAGE'S WORDS, AS A VISITOR READS THEM (plan "10/10" §7 S5, 26/10/2026): the build's words are written page
  // by page in small structured tasks (`demo-copy.js`, tracy-web) and put back with content.replace, which finds words
  // as the page shows them. Texts and buttons in page order, nav buttons left out (the menu is its own), at most
  // `PAGE_BLOCKS_MAX` a page and `PAGE_BLOCKS_PAGES` pages, each read once.
  /** @type {Record<string, {text: string, kind: 'text' | 'heading' | 'button', to?: string}[]>} */
  const pageBlocks = {}
  for (const r of reads) {
    if (unreadWhy(r, r === reads[0]) || Object.keys(pageBlocks).length >= PAGE_BLOCKS_PAGES) continue
    const seenHere = new Set()
    const list = []
    const keep = (text, kind, to = null) => {
      const t = String(text ?? '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!t || seenHere.has(t) || list.length >= PAGE_BLOCKS_MAX) return
      seenHere.add(t)
      list.push({ text: t, kind, ...(to ? { to } : {}) })
    }
    // Where a button goes, so its words can say so: a path of this site, or the kind of link (local round 36,
    // 26/10/2026: an EmDash home's buttons to the template's /investors page were written "Order a cake").
    const toOf = (/** @type {string} */ href) => {
      if (/^tel:/i.test(href)) return 'phone'
      if (/^mailto:/i.test(href)) return 'email'
      try {
        const url = new URL(href, r.url)
        return url.origin === new URL(r.url).origin ? url.pathname : 'another site'
      } catch {
        return null
      }
    }
    for (const b of r.blocks ?? []) {
      if (b.form) continue
      keep(b.text, /(?:^|[\s>])h[1-6](?:[.#\s]|$)/i.test(b.selector ?? '') ? 'heading' : 'text')
    }
    for (const c of r.ctas ?? []) if (!c.nav) keep(c.text, 'button', toOf(String(c.href ?? '')))
    if (list.length) pageBlocks[r.path] = list
  }
  const unread = []
  reads.forEach((r, i) => {
    const why = unreadWhy(r, i === 0)
    if (why) unread.push({ path: r.path, why })
    else read.push(r.path)
  })
  return {
    cssRules,
    pageBlocks,
    pictureFrames: reads.flatMap((r) =>
      (r.images ?? [])
        .filter((i) => !i.clone && !i.broken && !decoration(i, fileOf(i.src)))
        .map((i) => ({
          frameId: JSON.stringify([r.path, i.selector, i.src]),
          page: r.path,
          width: i.width,
          height: i.height,
          kind: MARK_FILE.test(fileOf(i.src)) ? 'logo' : i.kind,
          underWords: i.underWords === true,
          path: fileOf(i.src),
          selector: i.selector
        }))
    ),
    ...(frames
      ? {
          imageFrames: reads.flatMap((r) =>
            (r.images ?? []).map((i) => ({
              path: fileOf(i.src),
              width: i.width,
              height: i.height,
              route: r.path,
              selector: i.selector
            }))
          )
        }
      : {}),
    pictures: baselinePictures(content, placed),
    ...designRepeats(content),
    texts: [...texts].sort(),
    ledger: residueLedgerOf(content),
    labels: [...labels].sort(),
    unreadable: unreadableOf(reads),
    look: lookOf(reads),
    sections: sectionsOf(reads),
    // What this baseline is worth: an empty one read off a home that never opened is not "a site with no
    // template words". The web side keeps a baseline only with pages in `read` and none in `unread`.
    read,
    unread
  }
}

/**
 * Why a page's read cannot stand in a baseline: it never opened, or the server failed it. Home must also
 * answer 2xx/3xx; another page may be a 404 a visitor sees (that is what it shows).
 * @param {PageRead} r @param {boolean} home
 * @returns {string | null}
 */
function unreadWhy(r, home) {
  if (r.error) return 'did not open'
  if (r.status === null || r.status === undefined) return 'no answer'
  if (r.status >= 500 || (home && !(r.status >= 200 && r.status < 400))) return `answered ${r.status}`
  return null
}

// ── look-kept ─────────────────────────────────────────────────────────────────────────────────

/** `--name: value` pairs a stylesheet or a <style> block declares (the first value of each name wins). */
const TOKEN_DECL = /(?:^|[;{\s])(--[\w-]+)\s*:\s*([^;}]+)/g
/** A declaration that paints: a colour, a background or a font; `var()`-only values use the system and pass. */
const PAINT_DECL =
  /(?:^|[;{\s])(color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?-color|fill|stroke|font(?:-family)?)\s*:\s*([^;}]+)/gi
const USES_SYSTEM =
  /^\s*(?:var\([^)]*\)|inherit|initial|unset|revert|currentcolor|transparent|none)\s*(?:!important)?\s*$/i
/** A literal colour or a named font family: the only things a declaration can paint with on its own. */
const LITERAL_PAINT = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|["']/i
/**
 * A value derived from the system — `color-mix(in srgb, var(--x) 88%, transparent)`, `calc(var(--y) * 2)` — paints
 * nothing of its own: it reads var() and names no literal colour or family (opal-moon-bistro-j6b round 3, 19/10/2026).
 */
const derivedFromSystem = (value) =>
  /var\(/.test(value) && !LITERAL_PAINT.test(value.replace(/var\([^)]*\)/g, ''))
/** A design-system slot token: only ever set by the Design system door, never by hand (`@tracy/ds-slot`). */
const SLOT_TOKEN = /^--ds-c-/
/**
 * The accent role tokens a build's brand accent may set (`opportunities-build/brand-on-site.js` `ACCENT_TOKENS`), and
 * its link tokens where the accent reads on the template's page grounds (`ACCENT_LINK_TOKENS`).
 */
const ACCENT_TOKEN = /^--ds-c-accent(?:-hover|-active|-on|-text|-text-hover)?$/
/** A WhatsApp chat link as the brief builds it: wa.me and the number's digits, nothing else. */
const WHATSAPP_LINK = /^https:\/\/wa\.me\/\d{8,15}$/

/**
 * The brand accent a body sends: accent role tokens with a plain hex value, at most six.
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function accentTokensOf(value) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [token, hex] of Object.entries(value).slice(0, 6))
    if (ACCENT_TOKEN.test(token) && typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex)) out[token] = hex
  return out
}
const LOOK_DECLS_MAX = 400

/** A computed value as one spelling: case, spaces and a short hex (`#fff` ⇒ `#ffffff`) never count as a change. */
export function sameSpelling(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s*([(),])\s*/g, '$1')
      .replace(/\s+/g, ' ')
      // A minifier writes 0.5 as .5 (T4's optimised bundle, dev 24/10/2026): one value.
      .replace(/(^|[^\d.])0+\.(\d)/g, '$1.$2')
      .replace(
        /#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?\b/g,
        (_, r, g, b, a) => `#${r}${r}${g}${g}${b}${b}${a ? a + a : ''}`
      )
  )
}

const squashCss = (text) =>
  String(text ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
const shaOf = (text) =>
  createHash('sha256')
    .update(String(text ?? ''))
    .digest('hex')
    .slice(0, 16)

/** @param {string | null | undefined} text @returns {Record<string, string>} */
export function tokensInCss(text) {
  /** @type {Record<string, string>} */
  const out = {}
  const css = squashCss(text)
  for (const m of css.matchAll(TOKEN_DECL)) if (!(m[1] in out)) out[m[1]] = m[2].trim()
  return out
}

/** The painting declarations of a stylesheet, as `name:value`, deduplicated and in order. */
export function paintIn(text) {
  const out = new Set()
  for (const m of squashCss(text).matchAll(PAINT_DECL)) {
    const value = m[2].trim()
    if (!USES_SYSTEM.test(value) && !derivedFromSystem(value))
      out.add(`${m[1].toLowerCase()}:${value.replace(/\s+/g, '')}`)
    if (out.size >= LOOK_DECLS_MAX) break
  }
  return [...out]
}

/**
 * The look of the site as read: every token declared (first file wins) and what the browser computes for it on
 * <html> (`computed`, where the page report carries one), each same-origin sheet's painting declarations, and the
 * <style> blocks and inline styles that paint, each by hash.
 * @param {PageRead[]} reads
 */
export function lookOf(reads) {
  /** @type {Record<string, string>} */
  const tokens = {}
  /** @type {Record<string, string>} */
  const computed = {}
  /** @type {Record<string, string[]>} */
  const sheets = {}
  const styles = new Set()
  const inline = new Set()
  for (const r of reads) {
    for (const [k, v] of Object.entries(r.computed ?? {})) if (!(k in computed)) computed[k] = v
    for (const s of r.sheets ?? []) {
      if (typeof s.text !== 'string') continue
      for (const [k, v] of Object.entries(tokensInCss(s.text))) if (!(k in tokens)) tokens[k] = v
      const key = hashedStem(s.path) ?? s.path
      if (!(key in sheets)) sheets[key] = paintIn(s.text)
    }
    for (const st of r.styles ?? []) {
      for (const [k, v] of Object.entries(tokensInCss(st.text))) if (!(k in tokens)) tokens[k] = v
      styles.add(shaOf(squashCss(st.text)))
    }
    for (const el of r.inline ?? []) inline.add(shaOf(`${el.selector}|${squashCss(el.style)}`))
  }
  return { tokens, computed, sheets, styles: [...styles].sort(), inline: [...inline].sort() }
}

/**
 * The look Tracy handed over is the template's design system (ADR 0023); the agent changes words, pictures
 * and layout. Held to the baseline taken at hand-off: no token the site declared may change value, no
 * design-system slot token (`--ds-c-*`) may appear by hand, and nothing added since — a rule in a stylesheet,
 * a <style> block, an inline style — may paint a colour or a font. A content-hashed bundle (EmDash rebuilds
 * one on every content change) is held by its stem, so only its tokens and its NEW painting rules count.
 * A token's value is what the browser computes for it on <html> when both sides carry that reading; the declared
 * text decides only without one. Measured 19/10/2026: on stand wo2 every Tracy Base demo came back with custom.css
 * redefining every slot token; on stand wodsft a Joomla repair rewrote base.css so 602 tokens read
 * `var(--ds-c-…, <old value>)` — other text, same colours — which the text alone would call a restyle.
 * The one exception is the build's brand accent (`accentTokens`, ADR 0023 amended 26/10/2026): an accent role token set
 * to exactly the value the build gave is the accent, not a restyle; any other value or token is still judged.
 * @param {PageRead[]} reads
 * @param {{look?: ReturnType<typeof lookOf>} | null} baseline
 * @param {{accentTokens?: Record<string, string>}} [allowed]
 */
export function checkLookKept(reads, baseline, { accentTokens = {} } = {}) {
  const was = baseline?.look
  const expected =
    'no token changes value, no --ds-c-* token is set by hand, nothing added since hand-off paints a colour or a font'
  if (!was) return verdict('look-kept', [], 'no look baseline to hold to', expected)
  const findings = []
  // Every declaration counts, whichever sheet carries it: custom.css redefining a token the template declared
  // wins the cascade, so it is judged beside the template's own value, not hidden behind it.
  /** @type {Set<string>} */
  const seenTokens = new Set()
  const tokenFindings = (text, where, computedNow) => {
    for (const [token, after] of Object.entries(tokensInCss(text))) {
      if (seenTokens.has(`${token}|${after}`)) continue
      const given = Object.hasOwn(accentTokens, token) ? accentTokens[token] : null
      if (given !== null && sameSpelling(given) === sameSpelling(after)) continue
      seenTokens.add(`${token}|${after}`)
      const before = was.tokens[token]
      if (before !== undefined && sameSpelling(before) !== sameSpelling(after)) {
        const computedBefore = was.computed?.[token]
        const computedAfter = computedNow?.[token]
        const bothRead = typeof computedBefore === 'string' && typeof computedAfter === 'string'
        if (bothRead && sameSpelling(computedBefore) === sameSpelling(computedAfter)) continue
        findings.push({
          ...where,
          token,
          before,
          after,
          ...(bothRead ? { computedBefore, computedAfter } : {})
        })
      } else if (before === undefined && SLOT_TOKEN.test(token))
        findings.push({ ...where, token, after, problem: 'a design-system slot token set by hand' })
    }
  }
  const seenSheets = new Set()
  for (const r of reads) {
    for (const s of r.sheets ?? []) {
      if (typeof s.text !== 'string') continue
      const key = hashedStem(s.path) ?? s.path
      if (seenSheets.has(key)) continue
      seenSheets.add(key)
      tokenFindings(s.text, { page: r.path, file: s.path }, r.computed)
      // A rebuilt bundle (Tailwind emits classes for new content; T4 re-bundles on an unpublish) paints with
      // the template's own rules: only its tokens are judged, never its new declarations.
      if (hashedStem(s.path) || OPTIMIZE_BUNDLE.test(s.path)) continue
      const before = new Set(was.sheets[key] ?? [])
      for (const declaration of paintIn(s.text))
        if (!before.has(declaration)) findings.push({ page: r.path, file: s.path, declaration })
    }
    for (const st of r.styles ?? []) {
      if (was.styles.includes(shaOf(squashCss(st.text)))) continue
      tokenFindings(st.text, { page: r.path, style: st.selector }, r.computed)
      for (const declaration of paintIn(st.text))
        findings.push({ page: r.path, style: st.selector, declaration })
    }
    for (const el of r.inline ?? []) {
      if (was.inline.includes(shaOf(`${el.selector}|${squashCss(el.style)}`))) continue
      if (paintIn(`{${el.style}}`).length)
        findings.push({ page: r.path, selector: el.selector, style: el.style })
    }
  }
  return verdict(
    'look-kept',
    findings,
    `${Object.keys(was.tokens).length} tokens held, ${seenSheets.size} stylesheets read`,
    expected
  )
}

// ── no-demo-pictures ───────────────────────────────────────────────────────────────────────────

/** A picture URL as the file path the site stores it under (`images/joomlart/x.jpg`). */
export function fileOf(src) {
  try {
    return decodeURIComponent(new URL(src, 'http://x.invalid/').pathname).replace(/^\/+/, '')
  } catch {
    return ''
  }
}

const matchesFile = (file, list) =>
  list.some((f) => file === f || file.endsWith(`/${f}`) || f.endsWith(`/${file}`))

/** A WordPress size rendition (`<name>-<W>x<H>.<ext>`) named as the file it was cut from. */
const uncut = (file) => file.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, '')

/** A picture Tracy's own build put on the site — its own folder, or a path the build reported. */
const placedByTracy = (file, placed) =>
  /(^|\/)tracy-(?:content|brand)\//.test(file) || matchesFile(file, placed)

/**
 * The pictures the template showed before the agent's turn — every visible one but those Tracy's build
 * placed — by file AND by the sha256 of their bytes, so a demo picture copied under a new name is still
 * that picture.
 * @param {PageRead[]} reads
 * @param {string[]} placed
 */
function baselinePictures(reads, placed) {
  const files = new Set()
  const shas = new Set()
  for (const r of reads)
    for (const img of r.images ?? []) {
      const file = fileOf(img.src)
      if (!file || placedByTracy(file, placed)) continue
      files.add(file)
      if (img.sha256) shas.add(img.sha256)
    }
  return { files: [...files].sort(), shas: [...shas].sort() }
}

/**
 * No VISIBLE picture (an `<img>` at any size, `srcset`/`<picture>` through `currentSrc`, a CSS
 * background) is one the template already showed before the agent's turn, unless Tracy's own build
 * placed it. Not per template, not per CMS: the difference against the site's own baseline. The template's
 * logo is not exempt — it states a fact about another business (pic-hill6: a "RES est 1982" logo).
 * 🔒 A PICTURE THE TEMPLATE KEEPS STAYS (Slot fit, 27/10/2026): an icon, an avatar strip, a signature, a cut-out and a
 * slot the contract keeps (`kept`, or an avatar or signature by its file's name) are never photos to replace; asking
 * for them put a single portrait in a strip of faces. Each is named `unresolved` as kept, never a finding.
 * @param {PageRead[]} reads
 */
/** Pixels under which a picture is an icon on both sides: part of the template's design, never a photo. */
const ICON_PX = 120

/**
 * The template's own design, not a photo the business's would replace (pilot 24/10/2026: of a dental build's 38
 * "template pictures", 12 were 61–73 px icons and 6 decorative PNG masks, textures and a map): a small picture the
 * template files or frames as an icon, or a background drawn as PNG, SVG or GIF. A thumbnail or a cut-out is
 * still a fact about another business (it is no icon), and so is a logo and every photo.
 * @param {{ kind?: string, width?: number, height?: number, selector?: string | null }} img @param {string} file
 */
export function decoration(img, file) {
  const small = Number(img.width) > 0 && Number(img.height) > 0 && img.width < ICON_PX && img.height < ICON_PX
  if (small && /icon/i.test(`${file} ${img.selector ?? ''}`)) return true
  if (img.kind !== 'background') return false
  // 🔒 A BACKGROUND THE THEME SHIPS IS ITS DESIGN (product owner, 26/10/2026): a masthead photo drawn from a file of
  // the theme itself (`bg-masthead.jpg`) is in no record, so no door changes it, and failing the build on it only
  // spent the agent's attempts. It is left and named unresolved, as a stamp is; an `<img>` of the theme still counts.
  return /\.(png|svg|gif)$/i.test(file) || THEME_FILE.test(file)
}

/** A file of the theme or template itself: WordPress `wp-content/themes/…`, Joomla `templates/…`. */
const THEME_FILE = /(?:^|\/)(?:wp-content\/themes|templates)\//

/** A theme picture made to carry words (a badge, a stamp, a label): JA Diner's `decor_orange.png` reads "Since 1832". */
const WORDED_DECOR = /(?:^|[/_-])(?:decor|badge|stamp|label|seal|sticker)[^/]*$/i

/**
 * Why a template picture passing as the theme's design stays, as the unresolved list names it. 🔒 A DECOR PICTURE WITH
 * THE TEMPLATE'S WORDS DRAWN IN IT IS REPORTED, NEVER REDRAWN (product owner, 25/10/2026): no text replace reaches
 * words in a picture, and Tracy draws no new one.
 */
function designWhy(file) {
  const name = file.split('/').at(-1)
  if (WORDED_DECOR.test(file))
    return `the template picture ${name} passes as the theme's design; it is a decor picture that may carry the template's words drawn in it, which no text replace reaches, and no new picture is drawn: it stays until the owner decides`
  return `the template picture ${name} passes as the theme's design; it stays until the owner decides`
}

/**
 * A picture of WordPress's own Media Library, filed by the month it was added (`wp-content/uploads/2026/10/news-1.jpg`).
 * 🔒 A LIBRARY UPLOAD THE HAND-OFF NEVER SHOWED IS STILL THE TEMPLATE'S (The Living Room local, build 13, 25/10/2026):
 * the blog grid showed eight posts' card pictures (`news-1.jpg`…, kept in the theme's `jd_intro_image` meta) that the
 * template's home had not shown before the agent reordered its posts, so no baseline named them and the check passed
 * them. Tracy's own doors never file there (`tracy-content/`, `tracy-brand/`), so such a file came with the template.
 */
const LIBRARY_UPLOAD = /^wp-content\/uploads\/\d{4}\/\d{2}\//

/** A picture the template keeps by its file's name alone: a face or a hand of somebody's (`slot-map.mjs` NEVER). */
const KEPT_BY_NAME = /(?:avatars?|author-img|signature)[^/]*$/i

/** Why a template file is kept, or null: the request's kept list first, then its name. */
function keptWhy(file, kept) {
  const hit = kept.find((k) => matchesFile(file, [k.file]))
  if (hit) return `the template picture ${file.split('/').at(-1)} is kept: ${hit.reason}`
  if (KEPT_BY_NAME.test(file))
    return `the template picture ${file.split('/').at(-1)} is kept: a face or a signature`
  return null
}

export function checkNoDemoPictures(reads, { baseline = null, placed = [], kept = [] } = {}) {
  const before = baseline?.pictures
  // Unknown is not a pass: without the pictures the template showed, nothing here can be judged.
  if (!before)
    return {
      ...verdict('no-demo-pictures', [], 'no baseline', 'no picture of the template left'),
      pass: false,
      skipped: 'no baseline'
    }
  const files = new Set(before.files ?? [])
  const shas = new Set(before.shas ?? [])
  const findings = []
  const seen = new Set()
  // 🔒 A TEMPLATE PICTURE PASSED AS DESIGN IS STILL NAMED (product owner, round 5, 24/10/2026): `decoration` lets
  // a theme's PNG stamp ("decor_orange.png") pass, and whether it should is the owner's call; until then each such
  // file is listed `unresolved` by name, once, so a reviewer sees it rather than a silent pass.
  const exempt = new Map()
  for (const r of reads)
    for (const img of r.images ?? []) {
      const file = fileOf(img.src)
      if (!file || placedByTracy(file, placed)) continue
      const byName = files.has(file)
      const byBytes = Boolean(img.sha256 && shas.has(img.sha256))
      const unshown = !byName && !byBytes && LIBRARY_UPLOAD.test(file)
      if (!byName && !byBytes && !unshown) continue
      const keep = keptWhy(file, kept)
      if (keep) {
        if (!exempt.has(file))
          exempt.set(file, {
            page: r.path,
            file,
            kind: img.kind,
            size: `${img.width}×${img.height}`,
            selector: img.selector ?? null,
            why: keep
          })
        continue
      }
      if (decoration(img, file)) {
        if (!exempt.has(file))
          exempt.set(file, {
            page: r.path,
            file,
            kind: img.kind,
            size: `${img.width}×${img.height}`,
            selector: img.selector ?? null,
            why: designWhy(file)
          })
        continue
      }
      // Per page and per post it leads to: one template file two cards show is two posts' to change.
      const key = `${r.path} ${file} ${img.link ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({
        page: r.path,
        file,
        kind: img.kind,
        size: `${img.width}×${img.height}`,
        selector: img.selector ?? null,
        ...(typeof img.link === 'string' ? { link: img.link } : {}),
        ...(byName ? {} : unshown ? { unshown: true } : { copyOf: 'the same bytes as a template picture' })
      })
    }
  const result = {
    ...verdict(
      'no-demo-pictures',
      findings,
      `${findings.length} template pictures still shown`,
      'no picture the template showed before the agent, except those Tracy placed'
    ),
    ...(findings.length > 0 ? { pictures: findings.slice(0, PICTURES_MAX) } : {})
  }
  if (exempt.size === 0) return result
  const unresolved = [...exempt.values()]
  return {
    ...result,
    measured: `${result.measured}; ${unresolved.length} passed as the theme's design, unresolved: ${unresolved
      .map((u) => u.file.split('/').at(-1))
      .join(', ')}`,
    unresolved: unresolved.slice(0, DETAIL_MAX)
  }
}

// ── picture-frames-kept ────────────────────────────────────────────────────────────────────────

/** How far a frame's shape may move, relative, before it is another shape (a rounding pixel or two is not). */
const FRAME_TOLERANCE = 0.05
/** Boxes smaller than this on a side are not judged: a spacer, a tracking pixel. */
const FRAME_MIN_PX = 24

/**
 * 🔒 EVERY TEMPLATE PICTURE KEEPS ITS FRAME'S SHAPE (Slot fit, 27/10/2026): a built sports club placed phone portraits
 * whole into wide class cards and square trainer cards, and every box grew with its photo (sections up to 133% taller),
 * while each picture check passed. Each picture box the baseline measured before the agent's turn (`imageFrames`) is
 * found again by its page, its selector and its place among boxes of that selector: its width / height may move at most
 * `FRAME_TOLERANCE`, and a picture the template keeps (`kept`, an avatar or a signature by name) must still be its file.
 * @param {PageRead[]} reads
 * @param {{baseline?: any, kept?: Array<{file: string, reason: string}>}} asked
 */
export function checkPictureFramesKept(reads, { baseline = null, kept = [] } = {}) {
  const id = 'picture-frames-kept'
  const expected = "every picture box keeps the template's shape, and the pictures the template keeps stay"
  const frames = Array.isArray(baseline?.imageFrames) ? baseline.imageFrames : []
  if (frames.length === 0)
    return { ...verdict(id, [], 'no measured frames', expected), skipped: 'no measured frames' }
  const key = (route, selector) => `${routeKey(String(route ?? '/'))} ${selector ?? ''}`
  const was = new Map()
  for (const f of frames) was.set(key(f.route, f.selector), [...(was.get(key(f.route, f.selector)) ?? []), f])
  const findings = []
  let judged = 0
  for (const r of reads) {
    const now = new Map()
    for (const i of r.images ?? [])
      now.set(key(r.path, i.selector), [...(now.get(key(r.path, i.selector)) ?? []), i])
    for (const [k, list] of now) {
      const before = was.get(k) ?? []
      for (let n = 0; n < Math.min(before.length, list.length); n += 1) {
        const b = before[n]
        const a = list[n]
        if (!(b.width >= FRAME_MIN_PX && b.height >= FRAME_MIN_PX && a.width > 0 && a.height > 0)) continue
        judged += 1
        const file = fileOf(a.src)
        const keep = keptWhy(String(b.path ?? ''), kept)
        if (keep && b.path && file !== b.path) {
          findings.push({
            page: r.path,
            selector: a.selector ?? null,
            was: b.path,
            now: file,
            why: `${keep}; it was replaced`
          })
          continue
        }
        const change = a.width / a.height / (b.width / b.height)
        if (Math.abs(change - 1) > FRAME_TOLERANCE)
          findings.push({
            page: r.path,
            selector: a.selector ?? null,
            was: b.path,
            now: file,
            why: `its frame was ${b.width}×${b.height} and is now ${a.width}×${a.height}`
          })
      }
    }
  }
  return verdict(
    id,
    findings,
    `${findings.length} of ${judged} picture frames changed shape or lost a kept picture`,
    expected
  )
}

// ── no-demo-words ──────────────────────────────────────────────────────────────────────────────

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** A text block's identity across two reads: its words, case and spacing aside. */
export function textKey(text) {
  return createHash('sha256').update(squash(text)).digest('hex').slice(0, 16)
}

const words = (s) => squash(s).match(/[\p{L}\p{N}]{4,}/gu) ?? []

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `copyright © 2020–2026 <holder>. all rights reserved.` (squashed), the holder captured. */
const COPYRIGHT =
  /^(?:copyright\s*(?:©|\(c\))?|©|\(c\))\s*(?:\d{4}(?:\s*[-–]\s*\d{4})?\s*)?(?:by\s+)?(.+?)\s*[.,]?\s*(?:all rights reserved\.?)?$/

/**
 * The approved neutral words a slot with no source may hold (`neutral-copy/en.json` of the Website Opportunities domain,
 * kept in step by a test): neither the template's text, nor a fact. The build sends them in every site language
 * (`neutralWords`); these English ones are what a request without them is judged by.
 */
export const DEMO_NEUTRAL_WORDS = Object.freeze([
  'Menu item',
  'Service',
  'Product',
  'Contact',
  'Call',
  'Step',
  '—',
  'Team',
  'Overview'
])
/**
 * 🔒 The fillers no demo shows unless the research holds that wording (plan §7, 26/10/2026; `neutral-copy/forbidden.json`
 * `en`, kept in step by a test). The build sends every language's (`fillers`).
 */
export const DEMO_FILLERS = Object.freeze([
  'Coming soon',
  "Chef's selection",
  'Seasonal special',
  'House favourite',
  'House favorite',
  'Market price'
])
/** One of `phrases` as a whole phrase (WordPress prints "Chef's" with a typographic apostrophe). */
const phrasesRe = (phrases) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${phrases
      .filter((w) => typeof w === 'string' && w.trim())
      .map((w) => escapeRe(w.trim().toLowerCase()).replace(/'/g, "['’]"))
      .join('|')})(?![\\p{L}\\p{N}])`,
    'gu'
  )
const NEUTRAL_WORDS = phrasesRe(DEMO_NEUTRAL_WORDS)

/**
 * 🔒 FILLER IS NEVER A FACT NOR A STAND-IN, WHOEVER WROTE IT (product owner, 25/10/2026): a line that only tells the
 * visitor to ask ("Ask at the counter", six times on The Living Room's home), says it is a sample, or is one or more of
 * the fillers (`DEMO_FILLERS`: "Chef's selection Market price") stands where a fact is missing. The sweep empties it, a
 * dish's name taking its neutral item name (plan §7, product owner 27/10/2026). Judged on a short line as a whole, so a template's section
 * heading ("Menu changes frequently, here is a sample…") is not filler; a line of twelve words at most.
 */
/** One filler (`DEMO_FILLERS`) as the page writes it, typographic apostrophe and all. */
const FILLER_WORDS = `(?:${DEMO_FILLERS.map((w) => escapeRe(w.toLowerCase()).replace(/'/g, "['’]")).join('|')})`
const FILLER_LINE = new RegExp(
  `^(?:${[
    // "Ask", "Ask us", "Ask at the counter", "Ask our staff for today's price".
    // A question the visitor is invited to send ("Ask us a question", "Ask us anything") is a call to action, not filler.
    "ask(?!\\s+(?:us\\s+)?(?:a\\s+question|questions|anything)\\b)(?:\\s+(?:us|at|the|our|your|for|a|staff|server|team|waiter|bar|counter|today['’]?s?|price|prices|about|in|store|house)\\b.*)?",
    // "Sample", "Sample dish", "Sample text".
    'sample(?:\\s+\\S+){0,2}',
    '(?:price|prices|menu|details)\\s+on\\s+request',
    'to be (?:confirmed|announced|decided)',
    'tb[acd]',
    '.*\\b(?:for owner review|not a confirmed|to be confirmed by the owner)\\b.*',
    // Fillers alone or run together ("Chef's selection Market price", "Coming soon").
    `${FILLER_WORDS}(?:\\s*[·|,-]?\\s*${FILLER_WORDS})*`
  ].join('|')})[.!…]*$`,
  'u'
)
/**
 * `FILLER_LINE` for the page read (`readResidueInPage` `filler`), which runs in the browser and imports nothing: a
 * short line it matches is read as a unit though no price sits beside it, or the agent's write leaves it a lone heading.
 */
export const FILLER_SOURCE = FILLER_LINE.source
/** Whether a line is filler (`FILLER_LINE`). */
export const isFiller = (text) => {
  const t = squash(text)
  return t !== '' && t.split(' ').length <= 12 && FILLER_LINE.test(t)
}

/**
 * Whether a block's words come from the brief: verbatim, or most of its longer words found there (Tracy's
 * own build writes the brief's facts in its own sentences before the baseline is taken).
 */
export function fromBrief(text, briefWords, briefText, { share = true, neutral = NEUTRAL_WORDS } = {}) {
  const t = squash(text)
  if (briefText.includes(t)) return true
  // A copyright line is the holder's name in boilerplate: it is the brief's when that name is, word for word
  // (the-ridge-house, 22/10/2026: "Copyright © 2026 The Ridge House. All Rights Reserved." read as template
  // text, its boilerplate words outnumbering the name). The template's own holder is not in the brief.
  const holder = COPYRIGHT.exec(t)?.[1]?.trim()
  if (
    holder &&
    words(holder).length > 0 &&
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(holder)}(?![\\p{L}\\p{N}])`, 'u').test(briefText)
  )
    return true
  // What is left once the neutral words are taken out: a block saying only "Menu item" is the demo's stand-in, never
  // the template's words.
  const w = words(t.replace(neutral, ' '))
  if (w.length === 0) return true
  return share && w.filter((x) => briefWords.has(x)).length / w.length >= 0.6
}

/**
 * The words a site's own furniture is made of — sections every business has and names alike ("Our menu", "Opening
 * hours", "Latest news"). A short template heading made only of these and of the brief's words is the template's
 * frame, not another business's copy; one with any other word ("Selected projects") is copy left behind.
 */
const UI_WORDS = new Set(
  (
    'about all and any archive archives at award awards back blog book booking call card cards categories category ' +
    'close closed come comments contact contacts daily day days deals details discover email events explore faq ' +
    'featured find follow for from gallery get gift gifts hello help here history home hour hours how info ' +
    'information instagram join latest learn links location locations map media meet menu menus mission more ' +
    'new news newsletter next now offer offers on open opening order orders our page pages partners phone photo ' +
    'photos popular press previous privacy questions quick read recent related reservation reservations result results reviews ' +
    'say says search see services share shop showing sign social sort special specials story subscribe support tags team terms ' +
    'testimonials the this to today top us useful values video videos view visit we week welcome what where who why with ' +
    'you your'
  ).split(' ')
)
/** Words a short label is set with, not what it says: function words, and days and months as a timetable writes them. */
const SMALL_WORDS = new Set(
  'are but can has its not off one own per two via was mon tue wed thu fri sat sun jan feb mar apr may jun jul aug sep oct nov dec'.split(
    ' '
  )
)
/**
 * A short block is the brief's only when every word of three letters or more is: "Bar & Restaurant" under a bakery's
 * name is the template's, whichever research page says "restaurant" (local round 31, 25/10/2026, Levain). What a
 * neutral word says is left out, as `fromBrief` leaves it.
 */
const foreignWord = (text, briefShort, neutral = NEUTRAL_WORDS) =>
  (
    squash(text)
      .replace(neutral, ' ')
      .match(/[\p{L}\p{N}]{3,}/gu) ?? []
  ).some((w) => !briefShort.has(w) && !UI_WORDS.has(w) && !SMALL_WORDS.has(w))

/** Words every vendor's demo prints and no restaurant writes about itself. */
const VENDOR_CREDITS = [
  /\bdesigned by\b/i,
  /\bpowered by\b/i,
  /\bjoomlart\b/i,
  /\bt3 framework\b/i,
  /\bt4 framework\b/i,
  /\bproudly powered by wordpress\b/i,
  /\bbuilt with emdash\b/i,
  /\blorem ipsum\b|\bdolor sit amet\b/i
]

/** The most routes a check names, past the `detail` cut. */
const ROUTES_MAX = 500
/** The most passages a check lists with their routes. */
const PASSAGES_MAX = 200

/**
 * One finding per passage for the message, with every page that shows it (`pages`; `page` stays the first). The
 * sweep's mark holds only when the sweep clears it on every one of them.
 */
function byPassage(findings) {
  const groups = new Map()
  for (const f of findings) {
    const key = `${f.credit ? 'credit' : f.filler ? `filler ${f.filler}` : (f.residue ?? f.category ?? 'text')}\u0000${f.words}`
    const group = groups.get(key)
    if (!group) groups.set(key, { ...f, pages: [f.page] })
    else {
      if (!group.pages.includes(f.page)) group.pages.push(f.page)
      if (group.sweep && f.sweep !== true) delete group.sweep
    }
  }
  return [...groups.values()]
}

/**
 * No block of text (p, h1–h6, li, td, figcaption…; four words or more) the template showed before the
 * agent's turn is still there unless its words are the brief's, no category or tag the template named is still
 * named unless the brief names it, no vendor credit anywhere, and no filler (`fillers`) the brief does not hold.
 * An empty field, or one holding an approved neutral word (`neutralWords`), is never a finding.
 * @param {PageRead[]} reads
 */
/**
 * How a template's category or tag is renamed on each CMS, said once with the first label left (local round 35,
 * 26/10/2026: an EmDash build read "no taxonomy door", hid the template's sector chips in its /app code and rebuilt
 * seven times; a WordPress build guessed its term ids for four checks).
 */
const LABEL_DOOR = {
  emdash:
    'rename it, never hide it: tracy_emdash taxonomy_list_terms {taxonomy}, then taxonomy_update_term {taxonomy, termSlug, label}',
  wordpress:
    'rename the term, never hide it: content.update {kind:"term", key:"category" or "post_tag", id, fields:{name, slug}} (its id is in the link’s term or a post list’s taxQuery)',
  joomla:
    'rename the category or tag, never hide it: content.update {kind:"category" or "tag", id, fields:{title}}'
}

export function checkNoDemoWords(
  reads,
  {
    baseline = null,
    briefText = '',
    briefProse = null,
    platform = null,
    fillers = DEMO_FILLERS,
    neutralWords = DEMO_NEUTRAL_WORDS,
    residue = null
  } = {}
) {
  // The research's pages hold most everyday words ("website", "with", "updates"): judged against them, 25 of 30
  // agency blocks read as the brief's (NookHaus, 24/10/2026). A caller sending no prose is judged as before.
  const brief = squash(briefProse ?? briefText)
  const items = residue?.items ?? []
  const frame = new Set(residue?.frame ?? [])
  const neutral = phrasesRe([...DEMO_NEUTRAL_WORDS, ...neutralWords])
  // A filler the research itself holds ("Coming soon: our terrace") is the business's words.
  const banned = [...new Set([...DEMO_FILLERS, ...fillers])].filter(
    (f) => !phrasesRe([f]).test(squash(briefText))
  )
  const fillerRe = banned.length ? phrasesRe(banned) : null
  const briefWords = new Set(words(brief))
  const briefShort = new Set(brief.match(/[\p{L}\p{N}]{3,}/gu) ?? [])
  const before = new Set(baseline?.texts ?? [])
  const priorLabels = new Set(baseline?.labels ?? [])
  const findings = []
  // A passage is counted on every route that shows it: the template repeats one lorem body on each of its posts,
  // and build 13 (The Living Room, 25/10/2026) named it on the first post read only. Labels are named once.
  const seen = new Set()
  const seenOn = new Set()
  for (const r of reads) {
    // 🔒 NUMBERED TITLES ARE PLACEHOLDERS (local round 36, 26/10/2026): JA Fresco's offer page kept "Happy Hour 1",
    // "Happy Hour 2" and "Happy Hour 3" over the bar's own cards — its research spoke of happy hour, so each read as the
    // brief's. A template title shown with its siblings, differing only by a trailing number, is the template's.
    const stems = new Map()
    for (const block of r.blocks ?? []) {
      const m = /^(.*\p{L}.*?)\s*#?\d{1,2}$/u.exec(String(block.text ?? '').trim())
      if (m && before.has(textKey(block.text)))
        stems.set(m[1].toLowerCase(), (stems.get(m[1].toLowerCase()) ?? 0) + 1)
    }
    const numbered = (/** @type {string} */ text) => {
      const m = /^(.*\p{L}.*?)\s*#?\d{1,2}$/u.exec(String(text ?? '').trim())
      return m !== null && (stems.get(m[1].toLowerCase()) ?? 0) >= 2
    }
    for (const block of r.blocks ?? []) {
      const key = textKey(block.text)
      const at = `${r.path}\u0000${key}`
      if (block.form || !before.has(key) || seenOn.has(at)) continue
      // A short block is judged by each of its words, never by how many it shares with the brief.
      if (!numbered(block.text) && fromBrief(block.text, briefWords, brief, { share: !block.short, neutral }))
        continue
      if (block.short && !numbered(block.text) && !foreignWord(block.text, briefShort, neutral)) continue
      seenOn.add(at)
      const said = squash(block.text).slice(0, 160)
      // A section's heading the template frames the page with stays, by the residue's own rule (`residueOf`);
      // a numbered title is a placeholder whatever frames it.
      if (!numbered(block.text) && frame.has(`${r.path}\u0000${said}`)) continue
      findings.push({
        page: r.path,
        words: said,
        selector: block.selector ?? null,
        ...(items.some(
          (i) =>
            i.page === r.path &&
            ((i.field === 'text' && i.block === said) || (i.field === 'title' && squash(i.text) === said))
        )
          ? { sweep: true }
          : {})
      })
    }
    // The ledger's residue a block of four words never shows: a dish's name, price and description, a template
    // price or date, a passage in a hidden tab. Each is cleared by the sweep (`residueOf`).
    for (const i of items)
      if (i.page === r.path && i.field !== 'link' && (i.field !== 'text' || i.hidden || i.filler || i.short))
        findings.push({
          page: r.path,
          words: squash(i.text).slice(0, 160),
          selector: i.selector,
          residue: i.field,
          sweep: true
        })
    // A category or tag the template named and the page still names, unless the brief names it too.
    for (const label of r.labels ?? []) {
      const key = textKey(label.text)
      const name = squash(label.text)
      if (!priorLabels.has(key) || seen.has(key)) continue
      if (new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, 'u').test(brief)) continue
      seen.add(key)
      const door = LABEL_DOOR[/** @type {keyof typeof LABEL_DOOR} */ (platform)]
      // `name`: the label as the page writes it, case kept, for the sweep's replace to find (`planSweep`).
      const shown = String(label.text ?? '')
        .replace(/\s+/g, ' ')
        .trim()
      findings.push({
        page: r.path,
        words: name.slice(0, 160),
        name: shown.slice(0, 160),
        category: label.href,
        ...(door && !findings.some((f) => f.category) ? { fix: door } : {})
      })
    }
    // 🔒 No filler stands in for a fact, wherever it is written (plan §7, 26/10/2026).
    if (fillerRe)
      for (const m of String(r.text ?? '').matchAll(new RegExp(fillerRe.source, 'giu'))) {
        const key = `${r.path} filler ${squash(m[0])}`
        if (seen.has(key)) continue
        seen.add(key)
        findings.push({
          page: r.path,
          words: String(r.text)
            .slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)
            .replace(/\s+/g, ' ')
            .trim(),
          filler: m[0]
        })
      }
    for (const re of VENDOR_CREDITS) {
      const m = re.exec(String(r.text ?? ''))
      if (m && !brief.includes(m[0].toLowerCase()))
        findings.push({
          page: r.path,
          words: String(r.text)
            .slice(Math.max(0, m.index - 30), m.index + 60)
            .replace(/\s+/g, ' ')
            .trim(),
          credit: true
        })
    }
  }
  // Every route still showing template text, uncut: posts-written counts a post as written by its route (web side).
  const routes = [...new Set(findings.map((f) => f.page))]
  const shown = byPassage(findings)
  const result = sweepable(
    verdict(
      'no-demo-words',
      shown,
      `${findings.length} template passages left on ${routes.length} routes (${shown.length} different)`,
      'no text of the template and no vendor credit; no template dish, price or date'
    ),
    findings
  )
  if (routes.length > 0) result.routes = routes.slice(0, ROUTES_MAX)
  // Each template passage with every route showing it: a post whose page shows one no other kind of page shows still
  // has the template's body (`postsWritten`, web side), while the footer every route shares does not make it so.
  const passages = shown
    .filter((f) => !f.credit && typeof f.category !== 'string')
    .slice(0, PASSAGES_MAX)
    .map((f) => ({ words: f.words, pages: f.pages.slice(0, ROUTES_MAX) }))
  if (passages.length > 0) result.passages = passages
  // Every category the page still names, past the `detail` cut: the sweep renames each (`planSweep` `categories`).
  const categories = findings.filter((f) => typeof f.category === 'string').slice(0, CATEGORIES_MAX)
  if (categories.length > 0) result.categories = categories
  // Without the texts the template showed, only the vendor credits were judged: unknown, never a pass.
  return Array.isArray(baseline?.texts) ? result : { ...result, pass: false, skipped: 'no baseline' }
}

// ── residue ledger ─────────────────────────────────────────────────────────────────────────────

/** How many ledger units and residue items one baseline or one run carries. */
const LEDGER_MAX = 3000
/** The longest words a ledger unit keeps: the reader's own cut, so a long passage is recognised whole. */
const LEDGER_TEXT = 500
const ledgerKey = (text) => squash(String(text ?? '').slice(0, LEDGER_TEXT))
const RESIDUE_MAX = 1500

/**
 * The template's demo material as Tracy handed the site over, from each page's residue read
 * (`demo-residue-page.js`): its text nodes (dishes, prices, dates and passages of four words or more,
 * hidden tabs included) and its buttons and off-site links, each with the page it was on.
 * @param {PageRead[]} reads
 */
export function residueLedgerOf(reads) {
  const units = []
  const links = []
  const seen = new Set()
  for (const r of reads) {
    for (const u of r.residue?.units ?? []) {
      const key = `${r.path} ${u.kind} ${squash(u.text)}`
      if (seen.has(key) || units.length >= LEDGER_MAX) continue
      seen.add(key)
      units.push({
        page: r.path,
        kind: u.kind,
        text: String(u.text).slice(0, LEDGER_TEXT),
        // A page's lead names where it is, so the agent is told which line to write (`agent-demo.js`).
        ...(u.lead ? { lead: true, selector: u.selector ?? null } : {})
      })
    }
    for (const l of r.residue?.links ?? [])
      if (links.length < LEDGER_MAX)
        links.push({
          page: r.path,
          href: l.href,
          text: l.text,
          ...(l.off ? { off: true } : {}),
          ...(l.button ? { button: true } : {})
        })
  }
  // The single post read beside the pages (`runDemoQa`), so every later run reads the same one.
  const post = reads.find((r) => r.post)?.path
  return { units, links, ...(post ? { post } : {}) }
}

/** A phone, an e-mail or a web address, the reader's own test (`demo-residue-page.js`): a fact on its own. */
/** "… Style 1", "Layout 2", "Variant B": the label a template gives one of its demo blocks. */
const TEMPLATE_VARIANT =
  /\b(?:style|layout|version|variant|variation|demo|option|skin)\s*(?:\d{1,2}|[a-d])\s*$/i

const CONTACT_FACT = /^(?:\+?\(?\d[\d\s().-]{6,}\d|[^\s@]+@[^\s@]+\.\w+|(?:https?:\/\/|www\.)\S+)$/i

/**
 * Whether a heading names something: a capital inside a sentence ("…nestled in Hogsmeade Village"), in a heading
 * not written in Title Case, or a phone, an e-mail or a web address shown as a heading ("413-305-7497").
 * "Menu changes frequently, here is a sample" names nothing; "Discover Our Menu" says nothing either way and is kept.
 * @param {string} text
 */
export function namesSomething(text, names = []) {
  if (CONTACT_FACT.test(squash(text))) return true
  // 🔒 A HEADING LABELLING THE TEMPLATE'S OWN VARIANT NAMES THE TEMPLATE (round 5, 24/10/2026): ja-diner's /offers
  // shows "HAPPY HOURS STYLE 1", "… STYLE 2": three words, so it read as the page's frame and stayed. A heading
  // ending in "Style 1", "Layout 2", "Version 3" names a demo block, never a business's heading.
  if (TEMPLATE_VARIANT.test(squash(text))) return true
  // 🔒 A HEADING HOLDING A NAME THE TEMPLATE'S SENTENCES USE NAMES IT (lrsweep rig, 24/10/2026): ja-diner's "Meet
  // Three Broomsticks." is three words in Title Case, so it read as the frame and the template's name stayed on Home.
  if (templateNameIn(text, names)) return true
  const ws = String(text ?? '')
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w))
  if (ws.length < 4) return false
  const caps = ws.map((w) => /^\P{L}*\p{Lu}/u.test(w) && w.replace(/\P{L}/gu, '').length > 1)
  if (caps.filter(Boolean).length * 2 > ws.length) return false
  return ws.some((w, i) => i > 0 && caps[i] && !/[.!?:]$/.test(ws[i - 1]))
}

/** The first of the template's names a text holds as whole words, case aside; null when it holds none. */
export function templateNameIn(text, names = []) {
  const said = ` ${squash(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  return names.find((name) => said.includes(` ${name} `)) ?? null
}

/** Words in a run a title can be met in: one case, letters and digits only. @param {unknown} text */
const runOf = (text) => wordsOf(text).join(' ')
/** The fewest words a heading must share in a row with a template post's title to be that title. */
const TITLE_RUN = 4

/**
 * 🔒 A HEADING THAT REPEATS A TEMPLATE POST'S TITLE IS THE TEMPLATE'S DEMO POST, NEVER THE PAGE'S FRAME (lrsweep
 * rig round 6, 24/10/2026): ja-diner's About shows "Efforts to curb soda consumption bring results on both
 * coasts", the title of one of its demo posts, as a section heading, and Reservation's heading ends "… efforts to
 * curb soda consumption". Ten words in sentence case with no name in them, so `namesSomething` passed both as
 * frame, no-demo-words skipped them and the sweep never planned them. A section's heading that holds four or
 * more words in a row of a template post's title (the build's frozen inventory, `templateTitles`) is a passage.
 * "Menu changes frequently, here is a sample…" holds no post's title and stays the frame.
 * @param {unknown} text @param {string[]} titles
 */
export function holdsTitle(text, titles = []) {
  const heading = ` ${runOf(text)} `
  return titles.some((title) => {
    const ws = wordsOf(title)
    for (let i = 0; i + TITLE_RUN <= ws.length; i++)
      if (heading.includes(` ${ws.slice(i, i + TITLE_RUN).join(' ')} `)) return true
    return false
  })
}

/**
 * The names a template's sentences hold: two or more capitalised words inside a sentence ("The Three Broomsticks is a
 * cafe … in Hogsmeade Village" → "three broomsticks", "hogsmeade village"), lower-cased, one space apart. A line in
 * Title Case ("Discover Our Menu") holds none: its capitals are its style, not a name.
 * @param {string[]} texts
 */
export function templateNamesOf(texts) {
  const names = new Set()
  for (const text of texts) {
    const ws = String(text ?? '')
      .split(/\s+/)
      .filter((w) => /\p{L}/u.test(w))
    const caps = ws.map((w) => /^\P{L}*\p{Lu}/u.test(w) && w.replace(/\P{L}/gu, '').length > 1)
    if (ws.length < 4 || caps.filter(Boolean).length * 2 > ws.length) continue
    let run = []
    const close = () => {
      if (run.length >= 2) names.add(run.join(' ').toLowerCase())
      run = []
    }
    ws.forEach((w, i) => {
      const inside = i > 0 && !/[.!?:]$/.test(ws[i - 1])
      if (caps[i] && (inside || run.length > 0)) run.push(w.replace(/[^\p{L}\p{N}]+/gu, ''))
      else close()
      if (/[.!?:,;]$/.test(w)) close()
    })
    close()
  }
  return [...names]
}

/** A button's words naming the menu, and a page's address that is one. */
const MENU_WORD = /(?<![\p{L}])menus?(?![\p{L}])/u
const MENU_SLUG = /(?:^|-)menus?(?:-|$)/

/** Words that are only approved neutral words ("Menu item"), or no word at all. */
const standIn = (t) => !/[\p{L}\p{N}]/u.test(squash(t).replace(NEUTRAL_WORDS, ' '))

/**
 * 🔒 WHAT THE SWEEP MUST CLEAR, JUDGED THE SAME ON EVERY TEMPLATE AND CMS (product owner, 24/10/2026): no
 * template demo material on a page a visitor reaches. Each item names the page, the words shown, and the
 * field they fill, so the web side plans one replace per item (`residue-sweep.js`):
 * - `dish-name`, `dish-price`, `dish-desc`: a field of a template dish (its words in the ledger) the research
 *   does not hold. A price is the research's only by a price fact of the brief (`briefPricesOf`); words the
 *   agent wrote are never residue;
 * - `text`/`text-rest`: a text node of a passage the template showed (in the ledger) whose words are not the
 *   brief's; the first node of a passage is its one placeholder, the rest say it too (`text-rest`), never emptied. A passage
 *   whose every node is the template's, with no link in it, says so (`whole`, with its words as `passage`), so
 *   it is replaced as one;
 * - `title`: an item's own heading (a post card's title, with the post it links as `post`);
 * - 🔒 A SECTION'S HEADING IS THE TEMPLATE'S FRAME, NEVER A FACT (product owner, 24/10/2026; `placeholderFor`
 *   answers null for it): "Menu changes frequently, here is a sample…" stays. Only a heading that names
 *   something (`namesSomething`: "The Three Broomsticks is a café nestled in Hogsmeade Village") is a passage;
 * - `price`: a template price outside a dish item; `date`: a template date, with the post it dates when
 *   the page links one (`post`); a date on a post's own page is that page's post (`residue-sweep.js`);
 * - `link`: a button that left the page it names (`to`: that page), a booking button off the Contact page
 *   (`to: 'contact'`), or a template link off the site (`to: 'contact'`).
 * Null without a ledger: nothing is known, so nothing is planned.
 * @param {PageRead[]} reads
 * @param {{baseline?: any, briefText?: string, contactPaths?: string[], publicOrigin?: string | null, host?: string | null, templateTitles?: string[]}} [asked]
 */
export function residueOf(
  reads,
  {
    baseline = null,
    briefText = '',
    contactPaths = [],
    publicOrigin = null,
    host = null,
    templateTitles = []
  } = {}
) {
  const ledger = baseline?.ledger
  if (!ledger) return null
  const brief = squash(briefText)
  const briefWords = new Set(words(brief))
  // A dish's price is sourced by a price the brief states, never by a bound of the place's price range.
  const briefPrices = briefPricesOf(briefText, { ranges: false })
  const sourced = (t) => brief.includes(squash(t)) || (words(t).length > 0 && fromBrief(t, briefWords, brief))
  // 🔒 A LONG PASSAGE IS THE TEMPLATE'S WHOLE (lrsweep rig, 24/10/2026): a ledger that kept 200 characters missed
  // every passage longer than that, so About's and Contact's lorem stayed and no-demo-words still failed.
  const template = new Set((ledger.units ?? []).map((u) => `${u.kind} ${ledgerKey(u.text)}`))
  const isTemplate = (kind, text) => template.has(`${kind} ${ledgerKey(text)}`)
  const templateText = new Set((ledger.units ?? []).map((u) => ledgerKey(u.text)))
  const templateLinks = new Set((ledger.links ?? []).filter((l) => l.off).map((l) => l.href))
  const contacts = new Set(contactPaths.map(pathKey))
  const items = []
  const push = (item) => items.length < RESIDUE_MAX && items.push(item)
  // 🔒 THE SAME TEMPLATE WORDS TAKE THE SAME STAND-IN EVERYWHERE (lrsweep rig, 24/10/2026): a dish shown on three
  // tabs is one neutral name, numbered by its words, not by where it was met.
  const names = new Map()
  // The template's frame left as it is: a section's heading, by page and words (`checkNoDemoWords` skips it).
  const frame = new Set()
  const isTemplateText = (u) => isTemplate('text', u.text)
  const templateNames = templateNamesOf(
    (ledger.units ?? []).filter((u) => u.kind === 'text').map((u) => u.text)
  )
  // 🔒 "VIEW FULL MENU" LEADS TO THE MENU A VISITOR CAN READ (product owner, 25/10/2026): JA Diner's menu is the home
  // page's tabs block, while its buttons led to /reservation, /about-us and /contact-us. The page that shows the most
  // dishes (three or more) is the menu, at the anchor of the block holding them (`demo-residue-page.js` `menu`).
  const shown = reads
    .filter((r) => (r.residue?.menu?.dishes ?? 0) >= 3)
    .sort((a, b) => b.residue.menu.dishes - a.residue.menu.dishes)[0]
  const menuShown = shown
    ? `${pathKey(shown.path)}${shown.residue.menu.anchor ? `#${shown.residue.menu.anchor}` : ''}`
    : null
  for (const r of reads) {
    const units = r.residue?.units ?? []
    const passages = new Set()
    // A passage's nodes, by the block the reader numbered (`b`); older reads key it by its words.
    const blockOf = (u) => (u.b !== undefined ? `#${u.b}` : `${u.block ?? u.text}`)
    const nodes = new Map()
    for (const u of units) {
      if (u.kind !== 'text') continue
      const k = blockOf(u)
      nodes.set(k, [...(nodes.get(k) ?? []), u])
    }
    for (const u of units) {
      const at = {
        page: r.path,
        text: String(u.text),
        selector: u.selector ?? null,
        // The block the words sit in and the tags holding them, past the selector's two, for every kind alike: the
        // sweep reads the slot from them (`slotOf`), so filler in `h2 > span` is the heading's, whole.
        ...(typeof u.block === 'string' ? { block: squash(u.block).slice(0, 160) } : {}),
        ...(Array.isArray(u.holder) ? { holder: u.holder.slice(0, 8).map(String) } : {}),
        ...(u.hidden ? { hidden: true } : {})
      }
      const t = squash(u.text)
      // Filler, the template's or the agent's: replaced like the template's own words (`isFiller`).
      if (
        (u.kind === 'dish' || u.kind === 'text' || u.kind === 'price') &&
        isFiller(t) &&
        !brief.includes(t)
      ) {
        const field =
          u.kind === 'price' || u.field === 'price'
            ? 'dish-price'
            : u.kind === 'dish' && u.field === 'name'
              ? 'dish-name'
              : u.kind === 'dish'
                ? 'dish-desc'
                : 'text'
        if (field === 'dish-name' && !names.has(t)) names.set(t, names.size)
        push({
          ...at,
          field,
          filler: true,
          ...(field === 'dish-name' ? { n: names.get(t) } : {})
        })
        continue
      }
      if (u.kind === 'dish') {
        // 🔒 ONLY THE TEMPLATE'S OWN WORDS (review 24/10/2026): a dish field the agent wrote ("Espresso coffee" for
        // the brief's "Espresso") is never residue, sourced or not; whether it holds is facts-from-brief's call,
        // and the sweep never rewrites it.
        if (!templateText.has(ledgerKey(u.text))) continue
        if (u.field === 'price') {
          const n = digits(t)
          if (standIn(t) || (n && briefPrices.has(n))) continue
          push({ ...at, field: 'dish-price' })
        } else if (u.field === 'name') {
          // Numbered among the names replaced, so the neutral names take turns from the first.
          if (!standIn(t) && !sourced(t)) {
            if (!names.has(t)) names.set(t, names.size)
            push({ ...at, field: 'dish-name', n: names.get(t) })
          }
        } else if (!standIn(t) && !sourced(t)) push({ ...at, field: 'dish-desc' })
      } else if (u.kind === 'text') {
        if (!isTemplateText(u) || sourced(u.block ?? t)) continue
        // A short heading is residue only by the template's name it holds: the sweep puts the business's in its place.
        if (u.short) {
          const templateName = templateNameIn(u.text, templateNames)
          if (templateName)
            push({
              ...at,
              field: 'text',
              block: squash(u.block ?? t).slice(0, 160),
              short: true,
              templateName
            })
          continue
        }
        if (
          u.heading &&
          !u.card &&
          !namesSomething(u.block ?? u.text, templateNames) &&
          !holdsTitle(u.block ?? u.text, templateTitles)
        ) {
          frame.add(`${r.path}\u0000${squash(u.block ?? t).slice(0, 160)}`)
          continue
        }
        // A card's heading, or a list's link that is all its line holds ("More Articles …"): a post's title.
        // A link back to the page it sits on names that page, never a post: its title is not this line's to change.
        const self =
          u.post &&
          URL.canParse(u.post, 'https://site.invalid') &&
          pathKey(new URL(u.post, 'https://site.invalid').pathname) === pathKey(r.path)
        if ((u.heading && u.card) || (u.post && !u.heading && !self)) {
          // A single post's own heading is its post's title; any other names the post it links, if any.
          const post = u.post ?? (r.post ? r.path : null)
          push({ ...at, field: 'title', ...(post ? { post } : {}) })
          continue
        }
        const key = blockOf(u)
        const own = nodes.get(key) ?? [u]
        const whole =
          !u.linked &&
          typeof u.block === 'string' &&
          u.block.length < 500 &&
          own.every(isTemplateText) &&
          squash(own.map((x) => x.text).join(' ')) === squash(u.block)
        push({
          ...at,
          field: passages.has(key) && !u.label ? 'text-rest' : 'text',
          block: squash(u.block ?? t).slice(0, 160),
          ...(u.lead ? { lead: true } : {}),
          ...(whole ? { whole: true, passage: u.block } : {})
        })
        passages.add(key)
      } else if (u.kind === 'date') {
        if (isTemplate('date', u.text)) push({ ...at, field: 'date', ...(u.post ? { post: u.post } : {}) })
      } else if (u.kind === 'price') {
        if (isTemplate('price', u.text) && !briefPrices.has(digits(t))) push({ ...at, field: 'price' })
      }
    }
    // The site's own pages a button can name: what the nav links and the pages read.
    const pages = [...new Set([...(r.navLinks ?? []), ...reads.map((x) => x.path)].map(pathKey))]
    const named = (text) => {
      const said = squash(text)
      return pages.find((p) => {
        const slug = p.split('/').filter(Boolean).at(-1)
        return (
          slug &&
          !slug.startsWith('contact') &&
          new RegExp(`(?<![\\p{L}])${escapeRe(slug.replace(/-/g, ' '))}(?![\\p{L}])`, 'u').test(said)
        )
      })
    }
    // The site's own menu page, by its address ("/menu", "/food-menu", "/our-menus").
    const menuPage =
      pages.find((p) => p !== pathKey(r.path) && MENU_SLUG.test(p.split('/').filter(Boolean).at(-1) ?? '')) ??
      null
    for (const l of r.residue?.links ?? []) {
      const href = String(l.href ?? '').trim()
      if (/^(tel|mailto):/i.test(href)) continue
      let url = null
      try {
        url = new URL(href, r.url ?? 'https://site.invalid')
      } catch {}
      const own =
        url !== null &&
        (!l.off ||
          (publicOrigin !== null && url.origin === publicOrigin) ||
          (host !== null && url.hostname.toLowerCase() === host.toLowerCase()))
      const at = { page: r.path, field: 'link', href, text: l.text, selector: l.selector ?? null }
      const isContact =
        own &&
        (contacts.size > 0
          ? contacts.has(pathKey(url.pathname))
          : CONTACT_SLUG.test(pathKey(url.pathname).split('/').filter(Boolean).at(-1) ?? ''))
      if (l.booking) {
        if (!isContact) push({ ...at, to: 'contact' })
        continue
      }
      if (!own) {
        if (templateLinks.has(l.href)) push({ ...at, to: 'contact' })
        continue
      }
      if (!l.button || l.nav) continue
      // A button naming the menu goes to the menu shown (above), else to a page named "menu", even where the
      // template's own button led elsewhere; only a site with no menu at all keeps the template's target. The page
      // the button is on, with no block to lead to, is no better than the page named "menu".
      const menu = MENU_WORD.test(squash(l.text))
        ? menuShown !== null && menuShown !== pathKey(r.path)
          ? menuShown
          : menuPage
        : null
      if (menu) {
        const here = menu.includes('#') ? `${pathKey(url.pathname)}${url.hash}` : pathKey(url.pathname)
        if (here !== menu) push({ ...at, to: menu })
        continue
      }
      // The page the template's own button led to, when it led to one of the site's, else the page its words name.
      // 🔒 WORDS SHARED BY MANY BUTTONS NAME NONE OF THEM (lrsweep rig, 24/10/2026): nine "Read more" cards each
      // lead to their own post, so a button still leading where one of its words' template buttons led stays.
      const same = (ledger.links ?? []).filter(
        (b) => b.page === r.path && b.button && !b.off && squash(b.text) === squash(l.text)
      )
      if (same.some((b) => String(b.href).trim() === href)) continue
      const before = same[0]
      let was = null
      try {
        was =
          before && !/^(#|javascript:|tel:|mailto:)|^$/i.test(String(before.href).trim())
            ? pathKey(new URL(before.href, r.url ?? 'https://site.invalid').pathname)
            : null
      } catch {}
      const page = was ?? named(l.text)
      if (page && pathKey(url.pathname) !== page) push({ ...at, to: page })
    }
  }
  return { items, read: reads.map((r) => r.path), frame: [...frame] }
}

// ── facts-from-brief ───────────────────────────────────────────────────────────────────────────

/** Minutes after midnight of `7`, `7:30`, with `am`/`pm` when given. */
function minutesOf(h, m, ampm) {
  let hour = Number(h)
  const min = Number(m ?? 0)
  if (hour > 24 || min > 59) return null
  const half = String(ampm ?? '').toLowerCase()
  if (half === 'pm' && hour < 12) hour += 12
  if (half === 'am' && hour === 12) hour = 0
  return hour * 60 + min
}

const TIME_12 = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/gi
const TIME_24 = /\b([01]?\d|2[0-4])[:h](\d{2})\b/gi
// 🔒 A UNIT IS A WHOLE WORD IN ANY SCRIPT (The Living Room local, build 13, 25/10/2026): JavaScript's `\b` knows
// ASCII letters only, so "1454 København", a postcode before its town, read as a price of 1454k; a letter after the
// unit, any letter, makes it part of a word.
const PRICE =
  /(?:[$€£₫]|\b(?:usd|vnd|eur)(?!\p{L}))\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:[$€£₫]|(?:đ|usd|vnd|eur|k)(?!\p{L}))/giu
// A phone's groups sit on one line: "2024.\n2026" in a timeline is two lines, not a number (dev 24/10/2026); and a
// dot is part of it only between digits, so a sentence ends it ("415.555.0170. 04 Pick up", local round 20).
const PHONE = /(?:\+|\b)\d(?:[\d()-]|\.(?=\d)|[^\S\r\n]){6,}\d\b/g
/** A postal code right after its region ("CA 94115 2794 Maple St."): the code is no part of a phone. */
const AFTER_REGION = /\b\p{Lu}{2}[^\S\r\n]*$/u
/** A date, year first or last: `2013-01-01`, `10.09.2021`. */
const DATE_IN = /\b(?:(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2})\b/
/** Years alone, however joined ("2019 - 2024", "© 2024 2025"): a timeline, never a phone. */
const YEARS_ONLY = /^(?:19|20)\d{2}(?:[\s./-]+(?:19|20)\d{2})*$/
const FOUNDED = /\b(?:est\.?|established|since)\s*((?:19|20)\d{2})\b/gi

/** Every time of day a text names, as minutes after midnight. */
export function timesIn(text) {
  const out = new Set()
  for (const m of String(text).matchAll(TIME_12)) {
    const v = minutesOf(m[1], m[2], m[3])
    if (v !== null) out.add(v)
  }
  for (const m of String(text).matchAll(TIME_24)) {
    const v = minutesOf(m[1], m[2], null)
    if (v !== null) out.add(v)
  }
  return out
}

const digits = (s) => String(s).replace(/\D/g, '')

/** A price field of the brief or its research: a menu item's `price`, a price range, a Google `priceRange` bound. */
const PRICE_FIELD =
  /"(?:price|prices|priceRange|price_range|minPrice|maxPrice)"\s*:\s*("(?:[^"\\]|\\.)*"|\d[\d.,]*)|"currencyCode"\s*:\s*"[A-Z]{3}"\s*,\s*"units"\s*:\s*"?(\d+)/g
/** Currency codes and words a price is written with; a list, so "2 PCS" or "for" is never read as one. */
const CURRENCY = '(?:usd|eur|gbp|dkk|sek|nok|chf|aed|sar|vnd|jpy|cny|krw|thb|sgd|myr|idr|inr|aud|cad|nzd|kr)'
/** An amount marked as money, a range's second bound with it: `$12`, `€10–20`, `45 AED`, `95 kr`. */
const MONEY = new RegExp(
  `(?:[$€£₫¥]|\\b${CURRENCY}\\b\\.?)\\s*(\\d[\\d.,]*)(?:\\s*[-–]\\s*(\\d[\\d.,]*))?|(\\d[\\d.,]*)(?:\\s*[-–]\\s*(\\d[\\d.,]*))?\\s*(?:[$€£₫¥]|\\u0111(?!\\p{L})|\\b${CURRENCY}\\b)`,
  'giu'
)
/** A menu line of the brief's markdown (`brief.mjs`): `"Flat white" (large): "45 AED" — <where>`. */
const PRICE_LINE = /^\s*(?:-\s*)?"[^"\n]*"(?: \([^)\n]*\))?: "([^"\n]*\d[^"\n]*)" —/gm

/**
 * 🔒 A PRICE IS SOURCED ONLY BY A PRICE FACT OF THE BRIEF (review 24/10/2026): a menu item's price, a price range,
 * or an amount the research's own text marks as money ("$12", "45 AED"). Any number used to count, so the
 * template's `$147` passed on a brief whose only "147" was the street address.
 * `ranges: false` leaves out a price range's bounds (a `priceRange` field, Google's start and end prices, "10–20 kr"):
 * they say what the place's prices span, never what one dish costs, so a template dish's "$33" stays residue on a
 * brief whose range is "33–350 kr" (The Living Room build 8c, 25/10/2026).
 * @param {string} text
 * @param {{ranges?: boolean}} [options]
 * @returns {Set<string>} each amount's digits
 */
export function briefPricesOf(text, { ranges = true } = {}) {
  const out = new Set()
  // A field's whole value when it is a bare amount ("45", 45), else only the amounts it marks as money: "2 for
  // 147 USD" states 147, never the quantity 2 (review 24/10/2026).
  const add = (s) => {
    const value = String(s).replace(/^"|"$/g, '').trim()
    if (/^\d[\d.,]*$/.test(value)) out.add(digits(value))
    else
      for (const m of value.matchAll(MONEY)) {
        if (!ranges && (m[2] || m[4])) continue
        for (const n of m.slice(1)) if (n && digits(n)) out.add(digits(n))
      }
  }
  for (const m of String(text).matchAll(PRICE_FIELD)) {
    if (!ranges && (m[2] !== undefined || !/^"(?:price|prices)"/.test(m[0]))) continue
    add(m[1] ?? m[2])
  }
  for (const m of String(text).matchAll(PRICE_LINE)) add(m[1])
  for (const f of factsIn(text)) if (f.kind === 'price') out.add(f.value)
  return out
}

/**
 * The facts a page states that a visitor would act on — hours, prices, phone numbers, a founding year —
 * each as `{kind, value, words}`.
 * @param {string} text
 */
export function factsIn(text) {
  const facts = []
  const at = (m) =>
    String(text)
      .slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)
      .replace(/\s+/g, ' ')
      .trim()
  for (const re of [TIME_12, TIME_24])
    for (const m of String(text).matchAll(re)) {
      const v = minutesOf(m[1], m[2], re === TIME_12 ? m[3] : null)
      if (v !== null) facts.push({ kind: 'hour', value: v, shown: m[0], words: at(m) })
    }
  for (const m of String(text).matchAll(PRICE)) {
    const amount = digits(m[1] ?? m[2])
    if (amount) facts.push({ kind: 'price', value: amount, shown: m[0], words: at(m) })
  }
  for (const m of String(text).matchAll(PHONE)) {
    // A date or a run of years is no phone ("since 2013. 2013-01-01", dev 24/10/2026); nor a post's "10.09.2021",
    // which stayed a phone the brief lacks after the sweep dated it the build day (review 24/10/2026); nor years after
    // a timeline's step number ("03 2014-2017", local round 26, 25/10/2026).
    const years = m[0].trim().replace(/^\d{1,2}[^\S\r\n]+/, '')
    if (DATE_IN.test(m[0]) || YEARS_ONLY.test(years)) continue
    let run = m[0]
    if (AFTER_REGION.test(String(text).slice(Math.max(0, m.index - 6), m.index)))
      run = run.replace(/^\d{5}(?:-\d{4})?[^\S\r\n]+/, '')
    const d = digits(run)
    // A street number right after a phone joins its run ("(720) 330-2660 818 E. 3rd", pilot 24/10/2026): the run
    // without its last short group is read too, and either reading may be the brief's.
    const short = run.trim().match(/^(.*\d)\s+\d{1,5}$/)
    const trimmed = short ? digits(short[1]) : ''
    if (d.length >= 8 && d.length <= 15)
      facts.push({
        kind: 'phone',
        value: d.slice(-8),
        ...(trimmed.length >= 8 ? { also: trimmed.slice(-8) } : {}),
        shown: run.trim(),
        words: at(m)
      })
  }
  for (const m of String(text).matchAll(FOUNDED))
    facts.push({ kind: 'founded', value: m[1], shown: m[0], words: at(m) })
  return facts
}

const ADDRESS_TEXT = /"(?:address|streetAddress)"\s*:\s*"[^"]*\d|\baddress:\s*"?\d/i
/** A street address's first two words, its number and the street's first word ("167 West"), as a map query writes it. */
const STREET_START = /^\s*(\d{1,6})[,\s]+([\p{L}\d]+)/u
const foldWords = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\d]+/gu, ' ')

/**
 * Every hour, price, phone number and founding year a page states is the brief's when the brief holds one of
 * that kind (hours, a phone, a founding year): anything else contradicts the research and fails. A price is the
 * dish's, which this check cannot pair, so any price the research holds passes; one it holds nowhere is made up and
 * fails. 🔒 No sample content (plan §7, 26/10/2026): where the brief holds no hours, phone or founding year, a value
 * of that kind is made up too, and fails.
 * Its value, not its wording: "7AM" on the page is the brief's "07:00". ⚠ A value the brief has, put in a
 * sentence the brief does not support ("happy hour 7AM to 10PM" from opening hours 7 AM–10 PM), passes.
 * @param {PageRead[]} reads
 */
export function checkFactsFromBrief(
  reads,
  { briefText = '', googleReviewTestimonials = [], reviewTestimonials = [], residue = null } = {}
) {
  const brief = String(briefText)
  const times = timesIn(brief)
  const briefDigits = brief.replace(/[\s().+-]/g, '')
  const prices = briefPricesOf(brief)
  // A template price still shown is residue the sweep clears: its finding says so (`sweepable`).
  const residuePrices = (residue?.items ?? []).filter((i) => i.field === 'dish-price' || i.field === 'price')
  const years = new Set([...brief.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => m[0]))
  const findings = []
  const seen = new Set()
  let stated = 0
  for (const r of reads)
    for (const f of factsIn(
      withoutAttributedTestimonials(r, [
        ...googleReviewTestimonials.map((review) => ({ ...review, provider: review.provider ?? 'Google' })),
        ...reviewTestimonials
      ])
    )) {
      stated++
      const ok =
        f.kind === 'hour'
          ? times.has(f.value)
          : f.kind === 'price'
            ? prices.has(f.value)
            : f.kind === 'phone'
              ? briefDigits.includes(f.value) || (f.also !== undefined && briefDigits.includes(f.also))
              : years.has(f.value)
      const key = `${r.path} ${f.kind} ${f.value}`
      if (ok || seen.has(key)) continue
      seen.add(key)
      // A price is the dish's, which this check cannot pair; but one the research holds nowhere is made up, and made-up
      // data is worse than none (local round 22, 25/10/2026: $16.85 and $25.75 on a WordPress bakery's cards).
      findings.push({
        page: r.path,
        kind: f.kind,
        shown: f.shown,
        words: f.words,
        ...(f.kind === 'price' && residuePrices.some((i) => i.page === r.path && digits(i.text) === f.value)
          ? { sweep: true }
          : {})
      })
    }
  // A map link searches the business's street, whatever the words beside it say (local round 27, 25/10/2026).
  if (ADDRESS_TEXT.test(brief)) {
    const held = ` ${foldWords(brief)} `
    for (const r of reads)
      for (const m of r.maps ?? []) {
        const start = String(m?.query ?? '').match(STREET_START)
        if (!start) continue
        stated++
        const key = `${r.path} map ${foldWords(m.query)}`
        if (held.includes(` ${foldWords(`${start[1]} ${start[2]}`)} `) || seen.has(key)) continue
        seen.add(key)
        findings.push({
          page: r.path,
          kind: 'map',
          shown: m.query,
          words: m.text,
          ...(m.selector ? { selector: m.selector } : {})
        })
      }
  }
  return sweepable(
    verdict(
      'facts-from-brief',
      findings,
      `${findings.length} of ${stated} facts contradict the brief`,
      'every hour, price, phone number and founding year shown is one the brief holds'
    ),
    findings
  )
}

// ── withheld-not-shown ─────────────────────────────────────────────────────────────────────────

/** Times as other languages write them, beside `timesIn`'s: "11 Uhr", "11h"/"11h30", "11時30分", "11시", "9 p.m.". */
const TIME_MORE = [
  [/\b(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.\s?m\.?/giu, (m) => minutesOf(m[1], m[2], `${m[3]}m`)],
  [/\b([01]?\d|2[0-4])\s*Uhr\b/giu, (m) => minutesOf(m[1], 0, null)],
  [/\b([01]?\d|2[0-4])h(\d{2})?(?![\p{L}\p{N}])/giu, (m) => minutesOf(m[1], m[2], null)],
  [/([01]?\d|2[0-4])\s*[時时](?:\s*(\d{1,2})\s*分)?/gu, (m) => minutesOf(m[1], m[2], null)],
  [/([01]?\d|2[0-4])\s*시(?:\s*(\d{1,2})\s*분)?/gu, (m) => minutesOf(m[1], m[2], null)]
]

/** Every time of day a text names, with how it was written: `timesIn`'s formats and `TIME_MORE`'s. */
function clockTimesShown(text) {
  const out = []
  const t = String(text)
  const formats = [
    [TIME_12, (m) => minutesOf(m[1], m[2], m[3])],
    [TIME_24, (m) => minutesOf(m[1], m[2], null)],
    ...TIME_MORE
  ]
  // The first format to read a stretch of text owns it: "11:30 AM" is one time, not also "11:30".
  for (const [re, value] of formats)
    for (const m of t.matchAll(re)) {
      const v = value(m)
      if (
        v !== null &&
        !out.some((o) => o.index < m.index + m[0].length && m.index < o.index + o.shown.length)
      )
        out.push({ value: v, shown: m[0], index: m.index })
    }
  return out.sort((a, b) => a.index - b.index)
}

/** Every time of day a text names, as minutes after midnight, in any of the formats `clockTimesShown` reads. */
export function clockTimesIn(text) {
  return new Set(clockTimesShown(text).map((t) => t.value))
}

/** A machine timestamp (`2026-10-24T18:56:17Z`) names no time a visitor reads. */
const TIMESTAMP = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g

/**
 * Opening hours that name no clock time: "Open 24 hours", "open 24/7", "24 hours a day", "round the clock". When a
 * brief withholds the hours, none of these may stand for them either (a footer said "Open 24 hours, every day" on
 * every page of a demo whose brief withheld exactly that, dev 27/10/2026). A bare "24 hours" (a cancellation rule)
 * is no opening time.
 */
const ALL_DAY = [
  /\bopen\s+(?:24\s*(?:hours|hrs|h)\b|24\s*\/\s*7\b|24\s*x\s*7\b|(?:a)?round[- ]the[- ]clock\b|all\s+day\s+and\s+(?:all\s+)?night\b)/giu,
  /\b24\s*[/x]\s*7\b/giu,
  /\b24\s*(?:hours|hrs)\s+a\s+day\b/giu,
  /\b(?:a)?round[- ]the[- ]clock\b/giu
]

/** Each stretch of `text` the patterns read, the first pattern owning a stretch, in page order. */
function stretchesShown(text, patterns, keep = () => true) {
  const out = []
  for (const re of patterns)
    for (const m of String(text).matchAll(re))
      if (keep(m) && !out.some((o) => o.index < m.index + m[0].length && m.index < o.index + o.shown.length))
        out.push({ shown: m[0].trim(), index: m.index })
  return out.sort((a, b) => a.index - b.index)
}

/** The words around a stretch of a page's text, for the finding. */
const around = (text, at) =>
  text
    .slice(Math.max(0, at.index - 40), at.index + at.shown.length + 40)
    .replace(/\s+/g, ' ')
    .trim()

const SCORE = String.raw`([1-5](?:[.,]\d)?)`
/** A Google rating written any way, whatever its score: "5 Google rating", "Google rating: 4.8", "rated 5.0 on Google". */
const GOOGLE_RATING = [
  new RegExp(
    String.raw`(?<![\d.,])${SCORE}\s*(?:\/\s*5\s*|out\s+of\s+5\s*)?(?:★\s*)*(?:stars?\s+)?(?:on\s+)?google\s*(?:rating|score|stars?|reviews?)`,
    'giu'
  ),
  new RegExp(String.raw`google\s*(?:rating|score)\s*(?:of\s*)?[:\-–]?\s*${SCORE}(?![\d.,]\d)`, 'giu'),
  new RegExp(
    String.raw`\brated\s+${SCORE}(?![\d.,]\d)\s*(?:\/\s*5\s*|out\s+of\s+5\s*|stars?\s*)?on\s+google`,
    'giu'
  )
]

/** The score a withheld rating's forms carry ("5.0 ★", "★ 5.0", "5.0/5"), as a number; null without one. */
function withheldScoreOf(values) {
  for (const v of values) {
    const m = /(?:★\s*([1-5](?:[.,]\d)?))|(?:([1-5](?:[.,]\d)?)\s*(?:★|\/\s*5|out of 5))/u.exec(v)
    if (m) return Number((m[1] ?? m[2]).replace(',', '.'))
  }
  return null
}

/**
 * Google's rating as a page may write it: any score beside Google's name, and the withheld score itself beside a
 * star or the word rating ("5,0 stars", "rating 5"), in any of its spellings (5, 5.0, 5,0). A single review's stars
 * are not the rating.
 */
function ratingShown(text, values) {
  const score = withheldScoreOf(values)
  const patterns = [...GOOGLE_RATING]
  if (score !== null)
    patterns.push(
      new RegExp(
        String.raw`(?<![\d.,])${SCORE}(?![\d.,]\d)\s*(?:★|stars?\b|(?:\/\s*5|out\s+of\s+5)\b)`,
        'giu'
      ),
      new RegExp(String.raw`\b(?:rating|rated)\s*[:\-–]?\s*${SCORE}(?![\d.,]\d)`, 'giu')
    )
  return stretchesShown(text, patterns, (m) => {
    const n = Number(String(m[1]).replace(',', '.'))
    if (!(n >= 1 && n <= 5)) return false
    // One review's own stars ("Google review, 5 stars" under a testimonial) are that review's, not the place's rating.
    if (/\breview\W*$/iu.test(m.input.slice(Math.max(0, m.index - 20), m.index))) return false
    return /google/i.test(m[0]) || n === score
  })
}

const WITHHELD_FIX = {
  name: "remove this business name from the page's text, its title and its meta description (header, hero, footer, a module or widget, structured data): the name waits for the owner to confirm it. The logo picture may stay as it is.",
  googleRating:
    'remove Google\'s star rating and review count from this page, in any wording ("5 Google rating", "5.0 ★", "rated 5 on Google"), wherever it shows (hero, badges, testimonials heading, header, footer, a module or widget, structured data): the site leaves Google\'s rating off, so show none, not even a sample one. Collected reviews may stay, each with its author.',
  hours:
    'remove every opening time from this page, a time or a phrase such as "Open 24 hours" or "24/7", wherever it shows (hero, header, footer, a module or widget, contact, structured data); the site shows no hours until the owner confirms them, not even sample hours. A time of an event the brief holds may stay.'
}

/**
 * Nothing the brief withholds is shown. A field the sources disagree on (`missing[].conflicting`) is sent as
 * `withheld: [{field, values}]`. Opening hours are judged by value, in any language's way of writing a time: a
 * time on a page passes only when the brief holds it outside the withheld values (an event's time); a disputed
 * time or a sample one fails. Any other field fails where one of its values is shown.
 * @param {PageRead[]} reads
 */
export function checkWithheldNotShown(
  reads,
  { withheld = [], briefText = '', googleReviewTestimonials = [], reviewTestimonials = [] } = {}
) {
  const expected =
    'nothing the brief withholds (a fact its sources disagree on) is shown, not even as a sample'
  if (!withheld.length) return verdict('withheld-not-shown', [], 'nothing withheld', expected)
  let held = String(briefText).replace(TIMESTAMP, ' ')
  for (const w of withheld) for (const v of w.values) held = held.split(v).join(' ')
  const allowedTimes = clockTimesIn(held)
  const testimonials = [
    ...googleReviewTestimonials.map((review) => ({ ...review, provider: review.provider ?? 'Google' })),
    ...reviewTestimonials
  ]
  const findings = []
  const seen = new Set()
  for (const r of reads) {
    if (typeof r.text !== 'string') continue
    // A guest's review may name a time: it is their words, credited, not the site's claim. 🔒 Only the page's TEXT is
    // read, with its title and meta description: a withheld name inside the logo picture (or any image) is no finding.
    const text = [
      withoutAttributedTestimonials(r, testimonials),
      typeof r.title === 'string' ? r.title : '',
      typeof r.metaDescription === 'string' ? r.metaDescription : ''
    ]
      .filter(Boolean)
      .join('\n')
    const flat = reviewText(text)
    for (const w of withheld) {
      const fix =
        WITHHELD_FIX[w.field] ??
        `remove the ${w.field} from this page: the sources disagree, so the site does not show it until the owner confirms it.`
      const shown =
        w.field === 'hours'
          ? [
              ...clockTimesShown(text).filter((t) => !allowedTimes.has(t.value)),
              ...stretchesShown(text, ALL_DAY)
            ]
              .sort((a, b) => a.index - b.index)
              .map((t) => ({ shown: t.shown, words: around(text, t) }))
          : [
              ...w.values
                .filter((v) => v.length >= 4 && flat.includes(reviewText(v)))
                .map((v) => ({ shown: v, words: v })),
              ...(w.field === 'googleRating'
                ? ratingShown(text, w.values).map((t) => ({ shown: t.shown, words: around(text, t) }))
                : [])
            ]
      for (const s of shown) {
        const key = `${r.path} ${w.field} ${s.shown}`
        if (seen.has(key)) continue
        seen.add(key)
        findings.push({ page: r.path, field: w.field, shown: s.shown, words: s.words, fix })
      }
    }
  }
  return verdict(
    'withheld-not-shown',
    findings,
    `${findings.length} withheld values shown (${withheld.map((w) => w.field).join(', ')})`,
    expected
  )
}

// ── cta-real ───────────────────────────────────────────────────────────────────────────────────

/** A page whose last path segment says contact (`/contact`, `/contact-us/`): the slug the build's own pages use. */
const CONTACT_SLUG = /^contact/i
/**
 * A page of the site made for reservations is where a booking button goes too, whatever the plan names (local round 35,
 * 26/10/2026: JA Restaurant's theme prints its blog sidebar's "Book a table" to `/contact/phone-reservation/`, which no
 * door can change, and the page shows the business's own number to call).
 */
const RESERVATION_SLUG = /^(?:[\w-]*-)?(?:reservations?|booking|book-a-table)(?:-[\w-]*)?$/i

/** One key for a path, whatever its trailing slash or `/index.php` prefix. */
const pathKey = (/** @type {string} */ p) =>
  routeKey(String(p).split(/[?#]/)[0])
    .replace(/(.)\/+$/, '$1')
    .toLowerCase()

/** The query of a CMS's own search: WordPress `s`, Joomla `searchword`/`q`, EmDash `q`. */
const SEARCH_PARAM = /^(?:q|s|search|query|searchword|keyword)$/i

/**
 * Every call to action goes somewhere real: never `#`, empty or `javascript:`, never a demo host.
 * 🔒 A DEMO KEEPS ITS VISITOR ON THE DEMO, JUDGED BY WHERE A LINK GOES, NOT WHAT IT SAYS (product owner,
 * 22/10/2026):
 * - a booking call to action (book, reserve, table, order…) leads to this site's Contact page — a page the
 *   build's plan made the contact page (`contactPaths`), or, when the plan names none, one whose slug says contact. Another page of the
 *   site fails, and so does any address off it, a link the brief verified included;
 * - any button-styled link (`button`: `.btn`, `.wp-block-button__link`, a class saying button or cta) that
 *   leaves the demo site's origin fails, whatever its words: no button leads to the restaurant's live site,
 *   menu or a booking service.
 * `tel:` and `mailto:` stay, and so do links to the site's own public origin or host. A plain link in the
 * body or the nav is not a call to action; a nav link is only held to going somewhere. Every caller of
 * `/_host/demo-qa` judges a Website Opportunities demo, so this is the one rule (`allowedCta` is still read
 * and no longer lets a button out). A read from before `button` was recorded counts every non-booking call
 * to action as a button: only those were collected.
 * @param {PageRead[]} reads
 * The WhatsApp link the brief gives (`whatsappLinks`, exactly as built: `https://wa.me/<digits>`) is the one button
 * that may leave the demo besides `tel:` and `mailto:` (ADR 0037 amended 26/10/2026).
 * @param {{demoHosts?: string[], publicOrigin?: string | null, host?: string | null, contactPaths?: string[],
 *   whatsappLinks?: string[]}} [asked]
 */
export function checkCtaReal(
  reads,
  {
    demoHosts = DEFAULT_DEMO_HOSTS,
    publicOrigin = null,
    host = null,
    contactPaths = [],
    whatsappLinks = [],
    residue = null
  } = {}
) {
  const links = (residue?.items ?? []).filter((i) => i.field === 'link')
  const swept = (page, cta) =>
    links.some(
      (i) =>
        i.page === page && i.href === String(cta.href ?? '').trim() && squash(i.text) === squash(cta.text)
    )
  const contacts = new Set(contactPaths.map(pathKey))
  // The plan's contact pages when it names them; a slug saying contact only when it does not.
  const isContact = (/** @type {URL} */ url) => {
    const slug = pathKey(url.pathname).split('/').filter(Boolean).at(-1) ?? ''
    if (RESERVATION_SLUG.test(slug)) return true
    return contacts.size > 0 ? contacts.has(pathKey(url.pathname)) : CONTACT_SLUG.test(slug)
  }
  const findings = []
  let checkedTargets = 0
  let unknownTargets = 0
  // Keep queries in the identity: a search and its empty parent are different destinations.
  const targetKey = (url) => url.pathname + url.search
  for (const r of reads)
    for (const cta of r.ctas ?? []) {
      const href = String(cta.href ?? '').trim()
      const where = {
        page: r.path,
        text: String(cta.text ?? '').slice(0, 60),
        href: href.slice(0, 200),
        selector: cta.selector ?? null
      }
      if (href === '' || href === '#' || /^javascript:/i.test(href)) {
        // A nav item that opens its own submenu goes somewhere: the submenu (`demo-qa-browser.js` `opens`); a
        // button inside a form submits that form.
        if ((cta.nav && cta.opens) || cta.submits) continue
        findings.push({ ...where, problem: 'goes nowhere' })
        continue
      }
      if (/^(tel|mailto):/i.test(href)) continue
      // The business's WhatsApp, as the brief gives it: a second action beside Call (#1780, ADR 0037 amended).
      if (whatsappLinks.includes(href)) continue
      let url
      try {
        url = new URL(href, r.url)
      } catch {
        findings.push({ ...where, problem: 'not a link' })
        continue
      }
      if (hostIn(url.hostname, demoHosts)) {
        findings.push({ ...where, problem: 'points at a demo service' })
        continue
      }
      if ((cta.nav || cta.navigation) && !cta.toggles) {
        const source = new URL(r.url)
        const own =
          url.origin === source.origin ||
          (publicOrigin !== null && url.origin === publicOrigin) ||
          (host !== null && url.hostname.toLowerCase() === host.toLowerCase())
        if (own && (!url.hash || targetKey(url) !== targetKey(new URL(r.path, r.url)))) {
          const destination = reads.find((read) => {
            if (read.error || read.status !== 200) return false
            try {
              const requested = new URL(read.path, read.url)
              const landed = read.finalUrl ? new URL(read.finalUrl) : null
              if (
                landed &&
                landed.origin !== source.origin &&
                landed.origin !== url.origin &&
                landed.origin !== publicOrigin &&
                !(host !== null && landed.hostname.toLowerCase() === host.toLowerCase())
              )
                return false
              return [requested, landed].some(
                (at) =>
                  at &&
                  targetKey(at) === targetKey(url) &&
                  (at.origin === source.origin || at.origin === url.origin)
              )
            } catch {
              return false
            }
          })
          if (destination?.mainContent?.state === 'empty') {
            checkedTargets++
            findings.push({
              ...where,
              problem: 'navigation leads to a page with no main content',
              target: destination.path,
              fix: 'point this menu item at an existing populated page verified in the current reads; preserve the menu hierarchy'
            })
          } else if (destination?.mainContent?.state === 'present') checkedTargets++
          else unknownTargets++
        }
      }
      if (cta.nav) continue
      // The demo site's own address: the page's, the public name it is published under, or the name it answers to.
      const own =
        url.origin === new URL(r.url).origin ||
        (publicOrigin !== null && url.origin === publicOrigin) ||
        (host !== null && url.hostname.toLowerCase() === host.toLowerCase())
      // A search of this site for "Special orders" is a search suggestion, not a booking button (local round 25,
      // 25/10/2026: an EmDash search page's topic chips): pointed at Contact it would search nothing.
      if (own && [...url.searchParams.keys()].some((k) => SEARCH_PARAM.test(k))) continue
      if (cta.booking) {
        if (!own)
          findings.push({
            ...where,
            problem: "a booking button leaves the demo site: point it at this site's Contact page"
          })
        else if (!isContact(url))
          findings.push({
            ...where,
            problem: "a booking button leads to another page: point it at this site's Contact page"
          })
      } else if (!own && (cta.button ?? true))
        findings.push({ ...where, problem: 'a button leaves the demo site: point it at a page of this site' })
    }
  for (const f of findings) if (swept(f.page, f)) f.sweep = true
  // A button that names a page of the site keeps leading there ("View full menu" → /menu, never /reservation).
  for (const i of links)
    if (
      i.to !== 'contact' &&
      !findings.some((f) => f.page === i.page && f.href === i.href && f.text === i.text)
    )
      findings.push({
        page: i.page,
        text: String(i.text ?? '').slice(0, 60),
        href: i.href,
        selector: i.selector,
        problem: `a button names ${i.to} and leads elsewhere: point it back at ${i.to}`,
        sweep: true
      })
  return {
    ...sweepable(
      verdict(
        'cta-real',
        findings,
        `${findings.length} dead, empty-target, demo or off-site calls to action`,
        'every call to action stays on the demo: booking on its Contact page, every other button on the page it names; inspected navigation targets contain main content'
      ),
      findings
    ),
    navigationTargets: { checked: checkedTargets, unknown: unknownTargets }
  }
}

// ── no-horizontal-scroll ───────────────────────────────────────────────────────────────────────

/** @param {PageRead[]} reads */
export function checkNoHorizontalScroll(reads, { width = PHONE_WIDTH } = {}) {
  const findings = reads
    .filter((r) => typeof r.scrollWidth === 'number' && r.scrollWidth > width + 1)
    .map((r) => ({ page: r.path, scrollWidth: r.scrollWidth, widest: r.widest ?? null }))
  return verdict(
    'no-horizontal-scroll',
    findings,
    findings.length ? `widest ${Math.max(...findings.map((f) => f.scrollWidth))} px` : `fits ${width} px`,
    `page width ≤ ${width} px on a phone`
  )
}

// ── content-reachable ──────────────────────────────────────────────────────────────────────────

/** Content may reach this far past where the document stops scrolling before it counts as clipped. */
const REACH_SLACK_PX = 150

/**
 * Every section is reachable by scrolling: the document scrolls at least as far as its content
 * reaches. An agent that answers a phone overflow with `html, body { overflow-x: hidden }` on a
 * skrollr template leaves a desktop page that shows the hero and nothing under it (The Ridge House,
 * 18/10/2026) — a page every other check reads as fine, because what it cannot reach it skips.
 * @param {PageRead[]} reads
 */
export function checkContentReachable(reads) {
  const findings = []
  for (const r of reads) {
    const reach = r.reach
    if (!reach || typeof reach.documentHeight !== 'number' || typeof reach.contentHeight !== 'number')
      continue
    if (reach.contentHeight - reach.documentHeight > REACH_SLACK_PX)
      findings.push({
        page: r.path,
        documentHeight: reach.documentHeight,
        contentHeight: reach.contentHeight,
        htmlOverflowY: reach.htmlOverflowY ?? null,
        bodyOverflowY: reach.bodyOverflowY ?? null,
        problem: 'the page stops scrolling before its content ends',
        fix: 'remove overflow from html and body; fix the element that overflows instead'
      })
  }
  return verdict(
    'content-reachable',
    findings,
    findings.length ? `${findings.length} pages clip their content` : 'every section reachable',
    'the document scrolls as far as its content reaches'
  )
}

// ── no-third-party-demo ────────────────────────────────────────────────────────────────────────

/** @param {PageRead[]} reads */
export function checkNoThirdPartyDemo(reads) {
  const findings = reads.flatMap((r) =>
    (r.blocked ?? []).map((url) => ({ page: r.path, url: url.slice(0, 200) }))
  )
  return verdict(
    'no-third-party-demo',
    findings,
    `${findings.length} requests to demo hosts`,
    'no request to a demo service'
  )
}

// ── contrast-readable ──────────────────────────────────────────────────────────────────────────

const channel = (v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

/**
 * WCAG contrast ratio of a colour (alpha blended over the background) against that background.
 * @param {number[]} fg [r, g, b, a?]
 * @param {number[]} bg [r, g, b]
 */
export function contrastRatio(fg, bg) {
  const a = fg[3] ?? 1
  const mixed = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a))
  const [hi, lo] = [luminance(mixed), luminance(bg)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** One judged text's identity across reads: where it is and the two colours, whatever its words. */
const contrastKey = (s) => `${s.selector ?? ''}|${JSON.stringify(s.fg)}|${JSON.stringify(s.bg)}`

/**
 * Words over a picture, against the worst of what lies under them (`measureOverImage`): WCAG's 3:1 for large text
 * (24 px, or 18.66 px bold) and 4.5:1 for the rest — the bar a visitor reads at, which a plain background's
 * `MIN_CONTRAST` (2, set below the template's own colours) is not.
 */
const MIN_CONTRAST_OVER_IMAGE = { large: 3, text: 4.5 }
/** The widths a text over a picture is measured at, as the page read keys them. */
const OVER_IMAGE_WIDTHS = /** @type {const} */ ([
  ['under', 'desktop'],
  ['underPhone', 'phone']
])

/**
 * The contrast of words over a picture at one width, or null when that width was not measured: the bright end of
 * what lies under light words (85th percentile), the dark end under dark ones (15th), never the mean — a white
 * heading over a photo with one bright cookie is unreadable on the cookie.
 * @param {{fg?: number[], under?: {p15: number, p50: number, p85: number}, underPhone?: {p15: number, p50: number, p85: number}}} s
 * @param {'under' | 'underPhone'} key
 */
export function overImageRatio(s, key) {
  const under = s[key]
  if (!under || !Array.isArray(s.fg)) return null
  const text = luminance(s.fg.slice(0, 3))
  const ground = text > under.p50 ? under.p85 : under.p15
  const [hi, lo] = [text, ground].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const overImageKey = (s, key) => `${s.selector ?? ''}|${JSON.stringify(s.fg)}|${key}`
const overImageMin = (s) => (s.large ? MIN_CONTRAST_OVER_IMAGE.large : MIN_CONTRAST_OVER_IMAGE.text)

/** All uniform ground luminances that meet every measured text in one painted frame, including passing texts. */
function uniformGround(probes) {
  let ranges = [[0, 1]]
  for (const s of probes) {
    const words = luminance(s.fg.slice(0, 3))
    const need = overImageMin(s)
    const dark = (words + 0.05) / need - 0.05
    const light = need * (words + 0.05) - 0.05
    const allowed = [
      ...(dark >= 0 ? [[0, Math.min(1, dark)]] : []),
      ...(light <= 1 ? [[Math.max(0, light), 1]] : [])
    ]
    ranges = ranges.flatMap(([lo, hi]) =>
      allowed.map(([a, b]) => [Math.max(lo, a), Math.min(hi, b)]).filter(([a, b]) => a <= b)
    )
  }
  return ranges
}

/** A repair constraint, never a promise that toning a particular photograph can satisfy it. */
function groundRepair(read, s, key) {
  const frame = s[`${key}Frame`]
  const probes = frame
    ? (read.contrast ?? []).filter(
        (other) => other.overImage && other[`${key}Frame`] === frame && overImageRatio(other, key) !== null
      )
    : [s]
  const ranges = uniformGround(probes)
  const scope = frame
    ? `This frame's ${probes.length} measured texts`
    : 'The background frame was not identified; this text alone'
  const fix = ranges.length
    ? `${scope} require a uniform ground luminance in ${ranges.map(([a, b]) => `[${a.toFixed(3)}, ${b.toFixed(3)}]`).join(' or ')}. Choose a photo/crop with that ground at the text positions. image.tone is only a candidate, not a guarantee; measure every text again at desktop and phone width, including those currently passing.`
    : `No uniform background luminance meets all ${probes.length} measured texts in this frame. A photo with different light/dark regions at their positions may work; do not alternate whole-image tones or change the template's text colours. Measure every text again at desktop and phone width.`
  return { backgroundFrame: frame ?? null, uniformGround: ranges, fix }
}

/** The texts the template already showed unreadable, as `checkContrastReadable` judges them. */
function unreadableOf(reads) {
  const keys = new Set()
  for (const r of reads)
    for (const s of r.contrast ?? []) {
      if (
        !s.overImage &&
        Array.isArray(s.fg) &&
        Array.isArray(s.bg) &&
        contrastRatio(s.fg, s.bg) < MIN_CONTRAST
      )
        keys.add(contrastKey(s))
      // The template's own words over its own picture, already unreadable as installed, are not the build's.
      if (s.overImage)
        for (const [key] of OVER_IMAGE_WIDTHS) {
          const ratio = overImageRatio(s, key)
          if (ratio !== null && ratio < overImageMin(s)) keys.add(overImageKey(s, key))
        }
    }
  return [...keys].sort()
}

/**
 * Nav links and headings can be read against what is painted behind them. Text over a picture is judged against
 * the picture as shot under it, at desktop and phone width (`overImageRatio`); one the reader could not shoot stays
 * to the eye (`looks-finished`).
 * @param {PageRead[]} reads
 */
export function checkContrastReadable(reads, { baseline = null, placed = [] } = {}) {
  // The template's own unreadable text, its colours unchanged since hand-off, is not the build's (dev 24/10/2026:
  // a JA header's "Book a table" button at 1.59 on every page).
  const before = new Set(baseline?.unreadable ?? [])
  // 🔒 WORDS ON A PHOTO THE BUILD PLACED ARE THE BUILD'S (local round 36, 26/10/2026): JA Restaurant's dark happy-hours
  // line was unreadable over the template's own photo too, so its new 1.3:1 over the bakery's dark cookie went
  // unjudged, while the vision model, reading its white shadow as light words, asked for a darker photo.
  const placedUnder = (/** @type {{ underSrc?: string }} */ s) => {
    const file = fileOf(s.underSrc ?? '')
    return (
      file !== '' && (/(^|\/)tracy-content\//.test(file) || (placed.length > 0 && matchesFile(file, placed)))
    )
  }
  const findings = []
  let judged = 0
  /** Only successful measurements at their actual widths may take over a vision contrast finding. */
  const measuredOver = []
  for (const r of reads)
    for (const s of r.contrast ?? []) {
      if (s.overImage) {
        const viewports = OVER_IMAGE_WIDTHS.filter(([key]) => overImageRatio(s, key) !== null).map(
          ([, viewport]) => viewport
        )
        if (viewports.length && measuredOver.length < 120 && typeof s.text === 'string' && s.text.trim())
          measuredOver.push({
            page: r.path,
            text: s.text.trim().slice(0, 120),
            viewports,
            selector: s.selector ?? null
          })
        for (const [key, viewport] of OVER_IMAGE_WIDTHS) {
          const ratio = overImageRatio(s, key)
          if (ratio === null) continue
          judged++
          if (ratio < overImageMin(s) && (!before.has(overImageKey(s, key)) || placedUnder(s))) {
            findings.push({
              page: r.path,
              where: s.where,
              selector: s.selector ?? null,
              text: s.text ?? null,
              ratio: Number(ratio.toFixed(2)),
              overImage: true,
              viewport,
              needs: overImageMin(s),
              ...groundRepair(r, s, key)
            })
          }
        }
        continue
      }
      if (!Array.isArray(s.fg) || !Array.isArray(s.bg)) continue
      judged++
      const ratio = contrastRatio(s.fg, s.bg)
      if (ratio < MIN_CONTRAST && !before.has(contrastKey(s)))
        findings.push({
          page: r.path,
          where: s.where,
          selector: s.selector ?? null,
          text: s.text ?? null,
          ratio: Number(ratio.toFixed(2))
        })
    }
  return {
    ...verdict(
      'contrast-readable',
      findings,
      `${findings.length} of ${judged} unreadable`,
      `nav and headings contrast ≥ ${MIN_CONTRAST}:1; words over a picture ≥ ${MIN_CONTRAST_OVER_IMAGE.large}:1 large, ${MIN_CONTRAST_OVER_IMAGE.text}:1 other, at desktop and phone width`
    ),
    measuredOver
  }
}

// ── no-text-overlap ────────────────────────────────────────────────────────────────────────────

/**
 * No text is covered by another element — a picture or a block painted over the words (pic-lumora5:
 * the address under a photo). The browser half probes points inside each text's own box and reports
 * what is on top there; fixed and sticky bars are left out, they cover everything while scrolling.
 * @param {PageRead[]} reads
 */
export function checkNoTextOverlap(reads) {
  const findings = reads.flatMap((r) =>
    (r.overlaps ?? []).map((o) => ({
      page: r.path,
      text: String(o.text ?? '').slice(0, 80),
      selector: o.selector ?? null,
      coveredBy: o.coveredBy ?? null
    }))
  )
  return verdict(
    'no-text-overlap',
    findings,
    `${findings.length} texts covered`,
    'no text under a picture or another block'
  )
}

// ── no-broken-assets-and-links ─────────────────────────────────────────────────────────────────

/** @param {PageRead[]} reads */
export function checkNoBrokenAssets(reads) {
  const findings = []
  for (const r of reads) {
    for (const f of r.failed ?? [])
      findings.push({ page: r.path, url: String(f.url).slice(0, 200), status: f.status, type: f.type })
    // A picture of any kind that does not draw — an <img> set as a section's background too (`kind: background`).
    for (const img of r.images ?? [])
      if (img.broken)
        findings.push({
          page: r.path,
          url: String(img.src).slice(0, 200),
          problem: 'picture does not draw',
          selector: img.selector ?? null
        })
  }
  return verdict(
    'no-broken-assets-and-links',
    findings,
    `${findings.length} broken`,
    'every same-origin picture, font, stylesheet and script loads'
  )
}

// ── no-cms-error-leak ──────────────────────────────────────────────────────────────────────────

const CMS_ERROR =
  /\b(?:(?:PHP )?(?:Warning|Fatal error|Deprecated|Notice|Parse error|Strict Standards)\s*:|SQLSTATE\[|You have an error in your SQL syntax|Error establishing a database connection|Table '[^']+' doesn't exist|JDatabaseException|Call to undefined (?:function|method))/

/** @param {PageRead[]} reads */
export function checkNoCmsErrorLeak(reads) {
  const findings = []
  for (const r of reads) {
    const m = CMS_ERROR.exec(String(r.text ?? ''))
    if (m) {
      const at = m.index
      findings.push({
        page: r.path,
        words: String(r.text)
          .slice(Math.max(0, at - 20), at + 140)
          .replace(/\s+/g, ' ')
      })
    }
  }
  return verdict(
    'no-cms-error-leak',
    findings,
    `${findings.length} pages print an error`,
    'no PHP or database error on any page'
  )
}

// ── no-raw-placeholders ────────────────────────────────────────────────────────────────────────

const PLACEHOLDERS = [
  /\{\{[^{}\n]{0,80}\}\}/,
  /\[\/?[a-z][a-z0-9_-]*(?:\s+[a-z_-]+="[^"\]]*")*\]/,
  /\b(?:undefined|NaN)\b/,
  // A JSON escape written as text: `LumoraHoiAn\nHoi An` in a slide title (18/10/2026).
  // Case-insensitive: the browser's innerText carries text-transform, so a slide title reads `CAFÉ\NAND`.
  /\\(?:[ntr]|u[0-9a-f]{4})/i,
  /\b(?:TPL|COM|MOD|PLG|JLIB|JGLOBAL|JERROR|JFIELD|JLOGIN)_[A-Z0-9_]{3,}\b/
]

/** @param {PageRead[]} reads */
export function checkNoRawPlaceholders(reads) {
  const findings = []
  for (const r of reads) {
    const text = String(r.text ?? '')
    for (const re of PLACEHOLDERS) {
      const m = re.exec(text)
      if (m) findings.push({ page: r.path, words: m[0].slice(0, 80) })
    }
  }
  return verdict(
    'no-raw-placeholders',
    findings,
    `${findings.length} raw placeholders`,
    'no {{…}}, [shortcode], undefined, NaN, literal \\n or untranslated language key'
  )
}

// ── no-empty-picture-slots ─────────────────────────────────────────────────────────────────────

/**
 * No frame made to hold a picture (a `<figure>`, a gallery item, a template's "visual" or "media" box)
 * is shown without one: the template's mockup frames read as broken pictures (j6 Opal Moon, 19/10/2026:
 * three empty frames under "A look around the bistro"). The browser half finds them.
 * @param {PageRead[]} reads
 */
export function checkNoEmptyPictureSlots(reads) {
  const findings = []
  for (const r of reads)
    for (const slot of r.emptySlots ?? [])
      findings.push({
        page: r.path,
        selector: slot.selector ?? null,
        size: slot.size ?? null,
        kind: slot.kind ?? null
      })
  return verdict(
    'no-empty-picture-slots',
    findings,
    `${findings.length} empty picture frames`,
    'every picture frame a visitor sees shows a picture'
  )
}

// ── no-empty-boxes ────────────────────────────────────────────────────────────────────────────

/**
 * No box made for a service (a booking or contact form, a feed, a map, a newsletter) shows with nothing in it
 * (plan "10/10" §5, David 26/10/2026: a dead form becomes a real way to reach the business). Local round 31 shipped an
 * empty orange band under the hero: the template's OpenTable form, empty at install. The template's own empty box is
 * the build's too — a visitor sees the band either way. The browser half finds them (`emptyBoxes`).
 * @param {PageRead[]} reads
 */
export function checkNoEmptyBoxes(reads) {
  const findings = []
  for (const r of reads)
    for (const box of r.emptyBoxes ?? [])
      findings.push({ page: r.path, selector: box.selector ?? null, size: box.size ?? null })
  return verdict(
    'no-empty-boxes',
    findings,
    `${findings.length} empty service boxes`,
    'every box made for a form, a feed, a map or a booking shows something a visitor can use'
  )
}

// ── photos-fit ─────────────────────────────────────────────────────────────────────────────────

/** Subjects that never go behind words or fill a section's background (`demo-photo-labels.js` `BACKGROUND_UNFIT`). */
const BACKGROUND_UNFIT = new Set(['people', 'event', 'poster', 'menu-board', 'logo'])
/** A frame this small is a thumbnail or an icon: the same photo there is no repeat a visitor sees. */
const REPEAT_MIN = { width: 120, height: 90 }
/**
 * Two frames this close down the page are seen together (a desktop screen's height): one photo in both is a repeat.
 * Farther apart they are not (local round 36, 26/10/2026: a Joomla bar's photos behind its feature cards and again in
 * its photo strip far below failed five checks, and the build cut its galleries to pass, failing native-structure).
 */
const REPEAT_NEAR_PX = 900

/**
 * Each placed photo sits where its subject fits (plan "10/10" P1, 26/10/2026). Local rounds 31–33 (WordPress) put a
 * selfie behind a section's cards and one photo of flowers on two posts side by side. Read from the photos the build
 * placed (`placedSources`) and what each shows (`sourceSubjects`, labelled once per photo):
 * - a photo of people, an event, a poster, a menu board or a logo in a section's background fails;
 * - one photo filling two frames of a page fails while the research holds photos that page does not show yet
 *   (with fewer photos than frames, using them again is the brief's own rule).
 * A photo with no label is judged on repeats only.
 * @param {PageRead[]} reads
 * @param {{placedSources?: Record<string, string>, sourceSubjects?: Record<string, string>, collected?: {pictures?: number} | null}} [asked]
 */
export function checkPhotosFit(
  reads,
  { placedSources = {}, sourceSubjects = {}, collected = null, baseline = null } = {}
) {
  const sources = Object.entries(placedSources)
  // The frames the template itself filled with one picture on this page: a photo filling those is its design.
  const designed = (path, where) =>
    (baseline?.repeats?.[path] ?? []).some((group) => {
      const left = [...group]
      return where.every((selector) => {
        const i = left.indexOf(frameKey(selector))
        if (i === -1) return false
        left.splice(i, 1)
        return true
      })
    })
  const photoOf = (file) => sources.find(([path]) => matchesFile(file, [path]))?.[1] ?? null
  const available = Number(collected?.pictures) || 0
  const findings = []
  let judged = 0
  for (const r of reads) {
    if (r.error) continue
    /** @type {Map<string, string[]>} */
    const frames = new Map()
    /** @type {Map<string, (number | null)[]>} */
    const tops = new Map()
    for (const img of r.images ?? []) {
      if (img.broken || img.clone) continue
      const photo = photoOf(fileOf(img.src))
      if (!photo || photo === '$logo') continue
      judged++
      const subject = sourceSubjects[photo] ?? null
      // A photo some words lie on is the section's ground whatever holds it (local round 35: a selfie cropped to one
      // face behind the About masthead, set as a WordPress cover block's `<img>`).
      if ((img.kind === 'background' || img.underWords) && subject && BACKGROUND_UNFIT.has(subject))
        findings.push({
          page: r.path,
          selector: img.selector ?? null,
          photo,
          subject,
          problem: 'a photo of this subject behind a section'
        })
      if ((img.width ?? 0) >= REPEAT_MIN.width && (img.height ?? 0) >= REPEAT_MIN.height) {
        frames.set(photo, [...(frames.get(photo) ?? []), img.selector ?? ''])
        tops.set(photo, [...(tops.get(photo) ?? []), Number.isFinite(img.top) ? img.top : null])
      }
    }
    // Seen together: two of its frames within a screen of each other, or a read from before positions were kept.
    const together = (/** @type {string} */ photo) => {
      const at = tops.get(photo) ?? []
      if (at.some((t) => t === null)) return true
      const sorted = /** @type {number[]} */ (at).sort((a, b) => a - b)
      return sorted.some((t, i) => i > 0 && t - sorted[i - 1] < REPEAT_NEAR_PX)
    }
    if (available > frames.size)
      for (const [photo, where] of frames)
        if (where.length > 1 && together(photo) && !designed(r.path, where))
          findings.push({
            page: r.path,
            photo,
            frames: where.length,
            selectors: where.slice(0, 4),
            problem: 'repeat'
          })
  }
  return verdict(
    'photos-fit',
    findings,
    `${findings.length} misplaced or repeated of ${judged} placed photos`,
    'no photo of people, an event, a poster, a menu or a logo behind a section; no photo twice on a page while others are unused'
  )
}

// ── placed-pictures-visible ────────────────────────────────────────────────────────────────────

/**
 * Every picture Tracy placed that a page carries is SEEN somewhere — on any page read, at desktop or
 * phone width. One that sits only in a hidden block (`[hidden]`, a closed `<details>`, `display:none`)
 * was uploaded for nothing (EmDash Opal Moon, 19/10/2026: 3 of 10 hidden on /gallery). Pictures in a
 * carousel are hidden between slides by design and are not judged.
 * @param {PageRead[]} reads
 */
export function checkPlacedPicturesVisible(reads, { placed = [] } = {}) {
  const ours = (file) => file !== '' && placed.length > 0 && matchesFile(file, placed)
  const seen = new Set()
  for (const r of reads) {
    for (const img of r.images ?? []) seen.add(fileOf(img.src))
    for (const src of r.phoneImages ?? []) seen.add(fileOf(src))
  }
  const findings = []
  const told = new Set()
  for (const r of reads)
    for (const img of r.hiddenImages ?? []) {
      const file = fileOf(img.src)
      if (img.carousel || !ours(file) || seen.has(file) || told.has(file)) continue
      told.add(file)
      findings.push({ page: r.path, file, selector: img.selector ?? null })
    }
  return verdict(
    'placed-pictures-visible',
    findings,
    `${findings.length} placed pictures no visitor sees`,
    'every picture Tracy placed on a page is visible there'
  )
}

// ── no-google-review-quoted ────────────────────────────────────────────────────────────────────

/** How many words in a row from a collected review make a quotation. */
export const REVIEW_QUOTE_WORDS = 8

const wordsOf = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? []

/**
 * Whitespace as the browser renders it, and typography as a CMS prints it: WordPress's wptexturize writes "I've" as
 * "I’ve", " - " as " – " and "..." as "…" (local stand 24/10/2026), which is the same quotation. Wording and case
 * remain unchanged.
 */
const reviewText = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/gu, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/gu, '"')
    .replace(/[-\u2010-\u2015\u2212]+/gu, '-')
    .replace(/\u2026/gu, '...')
    .replace(/(\d)\s*\u00d7\s*(?=\d|\s)/gu, '$1x')
    .replace(/\s+/gu, ' ')
    .trim()

/** A supplied review is allowed only with its author, actual provider credit and source link on the page. */
function withoutAttributedTestimonials(read, testimonials) {
  let text = reviewText(read.text)
  for (const review of testimonials) {
    const quote = reviewText(review.text)
    if (quote && !reviewFails(text, review).length) text = text.replaceAll(quote, '')
  }
  return text
}

/** What a quoted testimonial must have on its page: its author's name (`[]` when it does). */
function reviewFails(text, review) {
  return !review.author || !text.includes(reviewText(review.author)) ? ['author'] : []
}

/** Credit a quoted testimonial could add (the platform's name, its links): reported, never a failure. */
function reviewCanAdd(text, links, review) {
  const add = []
  if (!review.provider || !` ${wordsOf(text).join(' ')} `.includes(` ${wordsOf(review.provider).join(' ')} `))
    add.push('provider')
  if (review.url && !links.includes(review.url)) add.push('link')
  if (review.authorUrl && !links.includes(review.authorUrl)) add.push('author link')
  return add
}

const LACK_FIX = {
  wording: 'quote the review word for word as collected (a CMS’s curly quotes and dashes are fine)',
  author: 'print the reviewer’s name beside it'
}

/**
 * 🔒 A collected review is USED, never faked (26/10/2026): a quotation passes when it is a collected review word
 * for word with its author's name on the page. It fails only when its words differ from every collected review, or its
 * author is missing. Platform credit and links the page could add are notes (`canAdd`), never a failure. Business facts
 * are checked separately, without accepting review text as evidence. The historical check id stays for saved QA runs.
 * @param {PageRead[]} reads
 */
export function checkNoGoogleReviewQuoted(
  reads,
  { googleReviews = [], googleReviewTestimonials = [], reviewTestimonials = [] } = {}
) {
  const testimonials = [
    ...googleReviewTestimonials.map((review) => ({ ...review, provider: review.provider ?? 'Google' })),
    ...reviewTestimonials
  ].filter((review) => reviewText(review.text))
  const gramsOf = (text) => {
    const w = wordsOf(text)
    const out = new Set()
    for (let i = 0; i + REVIEW_QUOTE_WORDS <= w.length; i++)
      out.add(w.slice(i, i + REVIEW_QUOTE_WORDS).join(' '))
    return out
  }
  // Reviews known only by their words (no author or link supplied): any eight of them in a row is a quotation.
  const bare = new Set()
  for (const review of googleReviews)
    if (!testimonials.some((t) => reviewText(t.text) === reviewText(review)))
      for (const g of gramsOf(review)) bare.add(g)
  const findings = []
  const notes = []
  for (const r of reads) {
    const text = reviewText(r.text)
    const links = r.reviewLinks ?? []
    const pageWords = ` ${wordsOf(text).join(' ')} `
    for (const review of testimonials) {
      const quote = reviewText(review.text)
      const quoted = text.includes(quote)
      const grams = [...gramsOf(review.text)]
      const piece = quoted ? null : grams.find((g) => pageWords.includes(` ${g} `))
      if (!quoted && !piece) continue
      const missing = quoted ? reviewFails(text, review) : ['wording']
      if (!missing.length) {
        const canAdd = reviewCanAdd(text, links, review)
        if (canAdd.length)
          notes.push({ page: r.path, author: review.author, canAdd, note: 'credit it could add' })
        continue
      }
      findings.push({
        page: r.path,
        code: 'GOOGLE_REVIEW_QUOTED',
        words: quoted ? quote.slice(0, 160) : piece,
        author: review.author ?? null,
        missing,
        fix: missing.map((m) => LACK_FIX[m]).join('; ')
      })
    }
    // A bare review is allowed nowhere: nothing says who wrote it.
    const remaining = withoutAttributedTestimonials(r, testimonials)
    const w = wordsOf(remaining)
    for (let i = 0; i + REVIEW_QUOTE_WORDS <= w.length; i++)
      if (bare.has(w.slice(i, i + REVIEW_QUOTE_WORDS).join(' '))) {
        findings.push({ page: r.path, code: 'GOOGLE_REVIEW_QUOTED', words: w.slice(i, i + 16).join(' ') })
        break
      }
  }
  const pages = new Set(findings.map((f) => f.page)).size
  const result = verdict(
    'no-google-review-quoted',
    findings,
    `${pages} pages have unattributed or altered review quotations`,
    'every review shown is a collected one, word for word, with its author'
  )
  return { ...result, detail: [...findings, ...notes].slice(0, DETAIL_MAX) }
}

// ── collected-used ─────────────────────────────────────────────────────────────────────────────

/** The most collected reviews a run looks for; one shown verbatim is enough. */
const COLLECTED_REVIEWS_MAX = 20

/**
 * What the research collected that a finished demo must show (`collected` of the body), each field
 * optional: a run without it judges nothing. `reviewsWaived` is the reason the build's plan gave for
 * placing no review (a template with no testimonial anywhere); it is reported, never silently passed.
 * @param {unknown} value
 */
export function collectedOf(value) {
  if (!value || typeof value !== 'object') return null
  if (typeof value.sourced === 'string' && value.sourced.length > 400_000)
    throw Object.assign(new Error('Complete collected evidence exceeds its budget'), {
      code: 'DEMO_QA_EVIDENCE_TOO_LARGE'
    })
  const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  const count = (v) => (Number.isInteger(v) && v > 0 ? Math.min(v, 10_000) : 0)
  return {
    name: text(value.name, 300),
    // The research's logo (a media id): the header shows it (`header-brand`).
    logo: text(value.logo, 200),
    phone: text(value.phone, 60),
    // The business's other numbers (the Contact section may list them): collected, never required on the site.
    otherPhones: strings(value.otherPhones, 10, 60),
    email: text(value.email, 320),
    address: text(value.address, 500),
    hours: strings(value.hours, 14, 300),
    reviews: (Array.isArray(value.reviews) ? value.reviews : [])
      .filter((r) => r && typeof r.text === 'string' && r.text.trim())
      .slice(0, COLLECTED_REVIEWS_MAX)
      .map((r) => ({ text: r.text.slice(0, 10_000), author: text(r.author, 500) })),
    reviewsWaived: text(value.reviewsWaived, 500),
    pictures: count(value.pictures),
    // The research's own words (`researchText`): a contact detail found there is collected, wherever it was read.
    sourced: text(value.sourced, 400_000)
  }
}

/** An email address in a page's text: a picture's `logo@2x.png` is not one. */
const EMAIL_TEXT =
  /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?!(?:png|jpe?g|gif|webp|svg|avif)\b)[a-z]{2,}/gi
/** A street line ("245 Main Street") on one line: a house number, up to four capitalised words, then the street's kind. */
const STREET_TEXT =
  /\b\d{1,5}[A-Za-z]?[^\S\r\n]+(?:\p{Lu}[\p{L}'.-]*[^\S\r\n]+){0,4}(?:Street|St\.|Road|Rd\.|Avenue|Ave\.|Boulevard|Blvd\.|Lane|Ln\.|Drive|Dr\.|Way|Place|Square|Court|Highway)(?![\p{L}])/gu
/** A street's kind spelt short or long is one street ("Maple Street" = "Maple St.", local round 30). */
const STREET_SHORT = Object.freeze({
  street: 'st',
  avenue: 'ave',
  road: 'rd',
  boulevard: 'blvd',
  lane: 'ln',
  drive: 'dr',
  place: 'pl',
  square: 'sq',
  court: 'ct',
  highway: 'hwy'
})
/** The words of an address with each street kind in its short form. */
const streetWordsOf = (s) => wordsOf(s).map((w) => STREET_SHORT[w] ?? w)

const phraseIn = (haystack, needle) => {
  const n = wordsOf(needle)
  return n.length > 0 && ` ${haystack} `.includes(` ${n.join(' ')} `)
}

/**
 * Everything the research collected is on the finished demo: the name, phone, email, street address and an
 * opening time somewhere a visitor reads them (text or a `tel:`/`mailto:` link), a collected review quoted
 * verbatim, and the restaurant's own photos — one on home, and as many across the site as were collected
 * up to three. `no-demo-*` and `facts-from-brief` say nothing false is left; this says nothing true was
 * left out. Values, not wording: a phone by its last eight digits, an address by its street line.
 * @param {PageRead[]} reads
 */
/** How many frames of one page the business's own logo may fill: its header's and its footer's. */
const LOGO_FRAMES = 2

export function checkCollectedUsed(
  reads,
  { collected = null, placed = [], placedSources = {}, baseline = null } = {}
) {
  if (!collected) return verdict('collected-used', [], 'nothing collected was named', 'collected facts shown')
  const shown = reads.filter((r) => typeof r.text === 'string')
  const words = shown.map((r) => wordsOf(r.text).join(' ')).join(' \u0000 ')
  const digitText = shown.map((r) => digits(r.text)).join(' ')
  const hrefs = shown.flatMap((r) => (r.ctas ?? []).map((c) => String(c.href ?? '')))
  const findings = []
  const missing = (what, value) => findings.push({ code: 'COLLECTED_NOT_SHOWN', what, value })
  if (collected.name && !phraseIn(words, collected.name)) missing('name', collected.name)
  if (collected.phone) {
    const tail = digits(collected.phone).slice(-8)
    if (
      tail.length >= 7 &&
      !digitText.includes(tail) &&
      !hrefs.some((h) => /^tel:/i.test(h) && digits(h).endsWith(tail))
    )
      missing('phone', collected.phone)
  }
  if (collected.email) {
    const email = collected.email.toLowerCase()
    if (
      !shown.some((r) => r.text.toLowerCase().includes(email)) &&
      !hrefs.some((h) => h.toLowerCase() === `mailto:${email}`)
    )
      missing('email', collected.email)
  }
  if (collected.address) {
    const street = collected.address.split(',')[0]
    const kept = streetWordsOf(street).join(' ')
    const streets = ` ${shown.map((r) => streetWordsOf(r.text).join(' ')).join(' \u0000 ')} `
    if (!kept || !streets.includes(` ${kept} `)) missing('address', street)
  }
  // 🔒 NOTHING SHOWN THAT WAS NOT COLLECTED (24/10/2026; no sample exemption since plan §7, 26/10/2026): an email,
  // phone or street line a visitor would act on is the research's. A detail in the research's own words (`sourced`: the
  // pages it read) is collected too, though the profile left its field empty (local round 18, 25/10/2026).
  const heard =
    typeof collected.sourced === 'string' && collected.sourced
      ? {
          words: ` ${wordsOf(collected.sourced).join(' ')} `,
          streets: ` ${streetWordsOf(collected.sourced).join(' ')} `,
          lower: collected.sourced.toLowerCase(),
          phones: (collected.sourced.match(/[+\d][\d\s().-]{5,}\d/g) ?? []).map(digits)
        }
      : null
  const inResearch = (what, value) => {
    if (heard === null) return false
    if (what === 'email') return heard.lower.includes(value.toLowerCase())
    if (what === 'phone') {
      const tail = digits(value).slice(-8)
      return tail.length >= 7 && heard.phones.some((p) => p.endsWith(tail))
    }
    if (what === 'address') {
      const street = streetWordsOf(value).join(' ')
      return street !== '' && heard.streets.includes(` ${street} `)
    }
    const line = wordsOf(value).join(' ')
    return line !== '' && heard.words.includes(` ${line} `)
  }
  const unsourced = (r, what, value) => {
    if (!inResearch(what, value)) findings.push({ code: 'COLLECTED_UNSOURCED', what, value, page: r.path })
  }
  const phoneTail = collected.phone ? digits(collected.phone).slice(-8) : null
  const otherTails = (collected.otherPhones ?? [])
    .map((p) => digits(p).slice(-8))
    .filter((t) => t.length >= 7)
  const streetWords = collected.address ? streetWordsOf(collected.address).join(' ') : ''
  const seenUnsourced = new Set()
  const once = (r, what, value) => {
    const key = `${what} ${value.toLowerCase()}`
    if (!seenUnsourced.has(key)) {
      seenUnsourced.add(key)
      unsourced(r, what, value)
    }
  }
  for (const r of shown) {
    const mails = [
      ...[...r.text.matchAll(EMAIL_TEXT)].map((m) => m[0]),
      ...(r.ctas ?? [])
        .map((c) => String(c.href ?? ''))
        .filter((h) => /^mailto:/i.test(h))
        .map((h) => decodeURIComponent(h.slice(7).split('?')[0]))
    ]
    for (const mail of mails)
      if (mail.toLowerCase() !== collected.email?.toLowerCase()) once(r, 'email', mail)
    const phones = [
      ...factsIn(r.text)
        .filter((f) => f.kind === 'phone')
        .map((f) => ({ shown: f.shown, tails: [f.value, f.also].filter(Boolean) })),
      ...(r.ctas ?? [])
        .map((c) => String(c.href ?? ''))
        .filter((h) => /^tel:/i.test(h) && digits(h).length >= 7)
        .map((h) => ({ shown: h.slice(4), tails: [digits(h).slice(-8)] }))
    ]
    for (const p of phones)
      if ((!phoneTail || !p.tails.includes(phoneTail)) && !otherTails.some((t) => p.tails.includes(t)))
        once(r, 'phone', p.shown)
    for (const m of r.text.matchAll(STREET_TEXT))
      if (!streetWords || !` ${streetWords} `.includes(` ${streetWordsOf(m[0]).join(' ')} `))
        once(r, 'address', m[0])
  }
  if (collected.hours.length) {
    const want = timesIn(collected.hours.join(' '))
    const seen = new Set(shown.flatMap((r) => [...timesIn(r.text)]))
    if (want.size && ![...want].some((t) => seen.has(t))) missing('hours', collected.hours.join('; '))
  }
  let reviewsShown = 0
  for (const review of collected.reviews) {
    const quote = reviewText(review.text)
    const grams = wordsOf(review.text)
    const piece =
      grams.length > REVIEW_QUOTE_WORDS ? grams.slice(0, REVIEW_QUOTE_WORDS).join(' ') : grams.join(' ')
    if (shown.some((r) => reviewText(r.text).includes(quote)) || (piece && words.includes(piece)))
      reviewsShown++
  }
  if (collected.reviews.length && reviewsShown === 0 && !collected.reviewsWaived)
    findings.push({
      code: 'COLLECTED_NOT_SHOWN',
      what: 'reviews',
      value: `${collected.reviews.length} collected, none quoted`
    })
  const ours = (src) => {
    const file = fileOf(src)
    return (
      file !== '' && (/(^|\/)tracy-content\//.test(file) || (placed.length > 0 && matchesFile(file, placed)))
    )
  }
  // 🔒 PHOTOS ARE COUNTED BY THE PHOTO, NOT THE FILE (pilot 24/10/2026): one burrito-cart photo cropped six ways
  // filled every frame of a WordPress build and passed as six photos of the place.
  const sources = Object.entries(placedSources)
  const photoOf = (file) => sources.find(([path]) => matchesFile(file, [path]))?.[1] ?? file
  const photos = new Set()
  let onHome = false
  shown.forEach((r, i) => {
    let logos = 0
    for (const img of r.images ?? [])
      if (!img.broken && !img.clone && ours(img.src)) {
        const photo = photoOf(fileOf(img.src))
        // The business's logo is no photo of the place (`agentDemoCollected` marks it `$logo`).
        if (photo === '$logo') {
          logos++
          continue
        }
        photos.add(photo)
        if (i === 0) onHome = true
      }
    // 🔒 ITS LOGO SHOWS WHERE A LOGO GOES (local stand 24/10/2026): an EmDash bakery's own marks filled a strip of
    // other organisations' logos. A header and a footer are two; a third on one page fills a frame meant for another.
    // Where the template showed its own mark in more frames (a badge on each card), the business's goes there too.
    if (logos > Math.max(LOGO_FRAMES, Number(baseline?.marks?.[r.path]) || 0))
      findings.push({
        code: 'COLLECTED_MISPLACED',
        what: 'logo',
        value: `the business's logo in ${logos} frames of ${r.path}`,
        page: r.path
      })
  })
  if (collected.pictures > 0) {
    if (!onHome)
      findings.push({
        code: 'COLLECTED_NOT_SHOWN',
        what: 'home-photo',
        value: 'no photo of the place on home'
      })
    const least = Math.min(collected.pictures, 3)
    if (photos.size < least)
      findings.push({
        code: 'COLLECTED_NOT_SHOWN',
        what: 'photos',
        value: `${photos.size} of the place's photos shown, at least ${least} expected`
      })
  }
  return {
    ...verdict(
      'collected-used',
      findings,
      `${findings.length} collected facts or photos missing; ${reviewsShown} reviews quoted; ${photos.size} own photos shown`,
      'the name, phone, email, address, hours, a review and the place’s own photos the research collected are on the site, and no email, phone or street line it did not collect'
    ),
    ...(collected.reviewsWaived && reviewsShown === 0 ? { waived: { reviews: collected.reviewsWaived } } : {})
  }
}

// ── header-brand ───────────────────────────────────────────────────────────────────────────────

/**
 * The header shows whose site this is (`brand` of a read: the header's logo or site-name block, `demo-qa-browser.js`):
 * the logo the research collected when it has one (a file the build placed from it, `$logo` in `placedSources`),
 * else the business's name. A header with no brand block at all fails either way. Judged only when the run names
 * what was collected; a read without `brand` (an older browser half) says nothing.
 * @param {PageRead[]} reads
 */
/**
 * Where a Joomla template keeps its logo, said once with the first finding: a T4 template keeps it in its site
 * settings, which the agent's tool does not reach, so Tracy's sweep has the brand writer put the business's logo there
 * (`client-demo.js` `businessLogoDue`, local measure 28/10/2026: the door this named answered NOT_ON_THIS_PLATFORM and the
 * agent guessed template-style params for six checks); T3 keeps the logo in the template style (local round 35,
 * 26/10/2026: a Death & Co build tried the template style eight ways and then wrote over the template's own `logo.png`).
 */
const JOOMLA_LOGO_PLACE =
  ' — on Joomla T4 Tracy puts the business’s logo in the header itself after this check (the template’s site settings): never edit template files or template-style params for it; if a later check still names it, leave it for the reviewer. On T3 use the template style’s logo setting (content.update {kind:"templateStyle"})'

/** A logo Tracy's brand writer uploaded (`brand-joomla-places.js`, `brand-wordpress.js`): `<role>-<sha 16>-<stamp>.png`. */
const BRAND_WRITER_LOGO = /(?:^|\/)tracy-brand\/logo(?:-light|-dark)?-[0-9a-f]{16}-[\w-]+\.png$/

export function checkHeaderBrand(
  reads,
  { collected = null, placedSources = {}, platform = null, logoWorn = false } = {}
) {
  const expected =
    'the header shows the collected logo, or the business name when no logo was collected; it keeps its brand block'
  const judged = reads.filter((r) => r.brand && typeof r.brand === 'object')
  if (!collected?.name && !collected?.logo)
    return verdict('header-brand', [], 'nothing collected was named', expected)
  if (!judged.length) return verdict('header-brand', [], 'no header read', expected)
  const logoFiles = Object.entries(placedSources)
    .filter(([, source]) => source === '$logo')
    .map(([path]) => path)
  const findings = []
  for (const r of judged) {
    const b = r.brand
    const images = (b.images ?? []).filter((img) => img && typeof img.src === 'string')
    if (!b.found || (!images.length && !String(b.text ?? '').trim())) {
      findings.push({
        page: r.path,
        code: 'BRAND_MISSING',
        fix: `the header has no logo or site name: put the template's brand block back in the header, showing ${collected.logo ? 'the business’s logo' : `“${collected.name}”`}`
      })
      continue
    }
    if (collected.logo) {
      if (!logoFiles.length) {
        findings.push({
          page: r.path,
          code: 'LOGO_NOT_PLACED',
          logo: collected.logo,
          fix: `import the business’s logo (media ${collected.logo}) and set it as the header’s logo, in place of the template’s`
        })
        continue
      }
      // The sweep sets a copy of the logo fitted to the template's logo box; it counts when this page's read
      // matched it to the logo by its pixels.
      const fitted = r.fittedLogo?.matches === true && r.fittedLogo.logo ? [fileOf(r.fittedLogo.logo)] : []
      // The logo the sweep's brand writer wore, fitted to the template's frame under its own name, is the business's
      // (local measure 28/10/2026: worn on a Joomla T4 header, the check still named the template's logo).
      const worn = logoWorn && images.some((img) => BRAND_WRITER_LOGO.test(fileOf(img.src)))
      // WordPress's site-logo block shows its own size cut of the file (`<name>-150x150.png`): the same logo.
      if (!worn && !images.some((img) => matchesFile(uncut(fileOf(img.src)), [...logoFiles, ...fitted])))
        findings.push({
          page: r.path,
          code: 'LOGO_NOT_IN_HEADER',
          logo: collected.logo,
          file: logoFiles[0],
          shown: images.map((img) => fileOf(img.src)).slice(0, 3),
          fix: `set the header’s logo to ${logoFiles[0]} (the business’s logo, already on the site)${
            platform === 'joomla' && !findings.some((f) => f.code === 'LOGO_NOT_IN_HEADER')
              ? JOOMLA_LOGO_PLACE
              : ''
          }`
        })
      continue
    }
    const named = [b.text, ...images.map((img) => img.alt)].some((t) =>
      phraseIn(wordsOf(t).join(' '), collected.name)
    )
    if (!named)
      findings.push({
        page: r.path,
        code: 'BRAND_NAME_MISSING',
        shown: String(b.text ?? '').slice(0, 120),
        fix: `no logo was collected: the header’s logo becomes the business’s name, drawn as a wordmark (the residue sweep), or the template’s logo is cleared so the header shows the site name “${collected.name}”`
      })
  }
  return verdict(
    'header-brand',
    findings,
    `${findings.length} of ${judged.length} headers do not show the business`,
    expected
  )
}

/** Words of six, the run a copied passage keeps: shorter runs are a name or a common phrase. */
const COPY_RUN = 6
/** The share of a post's words that, copied from one review, make the post that review. */
const COPIED_SHARE = 0.5

/**
 * The share of `text`'s words that sit in a run of {@link COPY_RUN} words found in `source` too (0..1).
 * @param {string} text @param {string} source
 */
export function copiedShare(text, source) {
  const words = (t) =>
    String(t ?? '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  const w = words(text)
  const s = words(source)
  if (w.length < COPY_RUN || s.length < COPY_RUN) return 0
  const runs = new Set()
  for (let i = 0; i + COPY_RUN <= s.length; i++) runs.add(s.slice(i, i + COPY_RUN).join(' '))
  const covered = new Uint8Array(w.length)
  for (let i = 0; i + COPY_RUN <= w.length; i++)
    if (runs.has(w.slice(i, i + COPY_RUN).join(' '))) covered.fill(1, i, i + COPY_RUN)
  return covered.reduce((n, c) => n + c, 0) / w.length
}

/**
 * `no-copied-reviews`: a post is written by the business from its research, quoting a review in one short line at
 * most; a post whose body is mostly one review's words fails (product owner, 25/10/2026). The Living Room (lrsweep
 * rig, build 7): twenty template posts became "X's review of The Living Room", each a TripAdvisor or Google review
 * copied whole. The testimonial area that shows a review verbatim is not a post and is not judged here.
 * @param {PageRead[]} reads
 * @param {{collected?: ReturnType<typeof collectedOf>}} asked
 */
export function checkNoCopiedReviews(reads, { collected = null } = {}) {
  const expected =
    "each post is the business's own words from its research; a review is quoted in one short line at most"
  const posts = reads.filter((r) => typeof r.postText === 'string' && r.postText.trim())
  const reviews = (collected?.reviews ?? []).filter((r) => r.text.split(/\s+/).length >= COPY_RUN)
  if (!posts.length || !reviews.length)
    return verdict('no-copied-reviews', [], 'no post or no review to compare', expected)
  const findings = []
  for (const r of posts) {
    const [share, review] = reviews
      .map((rv) => [copiedShare(r.postText, rv.text), rv])
      .sort((a, b) => b[0] - a[0])[0]
    if (share >= COPIED_SHARE)
      findings.push({
        page: r.path,
        code: 'REVIEW_COPIED',
        author: review.author,
        share: `${Math.round(share * 100)}%`,
        fix: `rewrite this post in the business's own words from its research; keep at most one short line of ${review.author ? `${review.author}’s` : 'the'} review, with its author and platform`
      })
  }
  return verdict(
    'no-copied-reviews',
    findings,
    `${findings.length} of ${posts.length} posts are mostly a review's words`,
    expected
  )
}

/** A page's address as the structure is keyed by: `/menu/` and `/index.php/menu` are one page. */
const sectionPage = (p) => routeKey(String(p ?? '')).replace(/(.)\/+$/, '$1')

/**
 * The template's marked sections of each page read (`tracy-sec-<section>`, in page order), or null when no
 * page shows a mark — a site Tracy did not build section by section, which `structure-kept` cannot hold to.
 * @param {PageRead[]} reads
 * @returns {Record<string, {name: string, items: number, text: number}[]> | null}
 */
export function sectionsOf(reads) {
  /** @type {Record<string, {name: string, items: number, text: number}[]>} */
  const out = {}
  for (const r of reads)
    if (!r.error && Array.isArray(r.sections) && r.sections.length > 0)
      out[sectionPage(r.path)] = r.sections.map(({ name, items, text }) => ({ name, items, text }))
  return Object.keys(out).length > 0 ? out : null
}

/**
 * Every section of the template's pages as Tracy built them is still there, with as many items (🔒 a demo
 * replaces, never removes — product owner, 22/10/2026). The nth section of a name on a page is held to the
 * nth of that name at baseline: gone or hidden, or showing fewer items, fails. Shorter text is a note in the
 * detail, never a failure — an emptied field is shorter than the demo's paragraph. A page of the baseline this
 * run did not read fails as unread (`runDemoQa` reads every one); a baseline with no marked section passes and says so.
 * @param {PageRead[]} reads
 * @param {{sections?: Record<string, {name: string, items: number, text: number}[]> | null} | null} baseline
 */
export function checkStructureKept(reads, baseline) {
  const expected = 'every section of each page as Tracy built it is still there, with all its items'
  const held = baseline?.sections ?? null
  if (!held || Object.keys(held).length === 0)
    return {
      ...verdict('structure-kept', [], 'no marked section in the baseline', expected),
      detail: [
        { note: 'the baseline holds no tracy-sec-* section: the site was not built section by section' }
      ]
    }
  const findings = []
  const notes = []
  let compared = 0
  const read = new Set()
  for (const r of reads) {
    const page = sectionPage(r.path)
    const before = held[page]
    if (r.error || !Array.isArray(before)) continue
    compared += 1
    read.add(page)
    /** @type {Map<string, {items: number, text: number}[]>} */
    const now = new Map()
    for (const s of r.sections ?? []) now.set(s.name, [...(now.get(s.name) ?? []), s])
    const seen = new Map()
    const missing = []
    for (const b of before) {
      const nth = seen.get(b.name) ?? 0
      seen.set(b.name, nth + 1)
      const s = now.get(b.name)?.[nth]
      if (!s) {
        missing.push(b.name)
        continue
      }
      if (s.items < b.items)
        findings.push({
          page,
          section: b.name,
          items: `${s.items} of ${b.items}`,
          fix: `restore the missing items of ${b.name}`
        })
      else if (s.text < b.text)
        notes.push({ page, section: b.name, note: `shorter text (${s.text} of ${b.text} characters)` })
    }
    if (missing.length > 0)
      findings.unshift({
        page,
        missing: [...new Set(missing)],
        fix: "restore only these sections' blocks from the page's revision at build time, then fill them per their action; never restore the whole page"
      })
  }
  // A page whose sections the baseline holds and this run did not read cannot be said to keep them.
  for (const [page, before] of Object.entries(held))
    if (Array.isArray(before) && before.length > 0 && !read.has(page))
      findings.push({
        page,
        unread: true,
        missing: [...new Set(before.map((b) => b.name))],
        fix: 'the page did not open in this run: make it answer again with every section it had at build time'
      })
  const result = verdict(
    'structure-kept',
    findings,
    findings.length === 0
      ? `${compared} pages keep every section`
      : `${findings.length} sections or pages lost blocks of the template`,
    expected
  )
  return { ...result, detail: [...findings, ...notes].slice(0, DETAIL_MAX) }
}

/**
 * Every check over one run's reads, in `CHECK_IDS` order.
 * @param {PageRead[]} reads
 * @param {ReturnType<typeof demoQaBody>} asked
 */
export function judge(reads, asked) {
  return judgeWith(reads, { ...asked, residue: residueOf(reads, asked) })
}

/** Every check over the pages; the content checks (`no-demo-pictures`, `no-demo-words`) over the routes too. */
function judgeWith(reads, asked, routeReads = []) {
  const content = [...reads, ...routeReads]
  return [
    checkPagesLoad(reads, { posts: asked.postRouteFindings ?? [], postRoutes: asked.postRoutes ?? [] }),
    checkCssIntact(reads, asked.baseline ?? null),
    checkLookKept(reads, asked.baseline ?? null, { accentTokens: asked.accentTokens }),
    checkNoDemoPictures(content, asked),
    checkNoDemoWords(content, asked),
    checkFactsFromBrief(reads, asked),
    checkCtaReal(reads, asked),
    checkNoHorizontalScroll(reads),
    checkContentReachable(reads),
    checkNoThirdPartyDemo(reads),
    checkContrastReadable(reads, asked),
    checkNoTextOverlap(reads),
    checkNoBrokenAssets(reads),
    checkNoCmsErrorLeak(reads),
    checkNoRawPlaceholders(reads),
    checkNoEmptyPictureSlots(reads),
    checkNoEmptyBoxes(reads),
    checkPhotosFit(reads, asked),
    checkPlacedPicturesVisible(reads, asked),
    checkNoGoogleReviewQuoted(reads, asked),
    checkStructureKept(reads, asked.baseline ?? null),
    checkCollectedUsed(reads, asked),
    checkWithheldNotShown(reads, asked),
    checkHeaderBrand(reads, asked),
    checkNoCopiedReviews(reads, asked),
    checkPictureFramesKept(reads, asked),
    checkPhotosMatchSlots(reads, asked),
    checkFacesNamed(reads, asked)
  ]
}

/**
 * Read every page (home first; with `discover`, then the pages home's nav links to) and judge them.
 * @param {{asked: any, base: string, read: (url: string, path: string, options: object) => Promise<PageRead>}} input
 */
/**
 * Pages a check reads at once after home, each in its own tab (`runDemoQa`), on a small host. A host with more
 * memory reads more at once (`demoQaTabsOf`).
 */
export const READ_AT_ONCE = 1

export async function runDemoQa({ asked, base, read, now = Date.now, readAtOnce = READ_AT_ONCE }) {
  const started = now()
  const origin = new URL(base).origin
  const sentinels = Object.fromEntries(
    Object.entries(asked.baseline?.cssRules ?? {}).flatMap(([path, s]) => {
      const stem = hashedStem(path)
      return stem
        ? [
            [path, s?.sentinel ?? null],
            [stem, s?.sentinel ?? null]
          ]
        : [[path, s?.sentinel ?? null]]
    })
  )
  const options = {
    demoHosts: asked.demoHosts,
    siteHosts: asked.host ? [asked.host] : [],
    sentinels,
    discover: asked.discover,
    wordmark: asked.wordmark ?? null,
    logoPicture: asked.logoPicture ?? null
  }
  const pages = [...asked.pages]
  /** @type {Map<string, 'home' | 'asked' | 'plan' | 'nav' | 'extra'>} */
  const from = new Map(pages.map((p, i) => [p, i === 0 ? 'home' : 'asked']))
  const seen = new Set(pages.map(routeKey))
  // The build's kept pages are read whatever the nav shows: a Joomla alias parent hides its children (ds-7f).
  for (const p of asked.plan ?? [])
    if (!seen.has(routeKey(p))) {
      pages.push(p)
      from.set(p, 'plan')
      seen.add(routeKey(p))
    }
  // So are the pages whose sections the baseline holds: `structure-kept` fails a page of them it did not read.
  let held = 0
  for (const key of Object.keys(asked.baseline?.sections ?? {}).slice(0, DEMO_QA_MAX_PLAN)) {
    const p = planPath(asked.platform, key)
    if (!isSitePath(p) || seen.has(routeKey(p))) continue
    pages.push(p)
    from.set(p, 'plan')
    seen.add(routeKey(p))
    held += 1
  }
  const maxPages = (asked.maxPages ?? DEMO_QA_MAX_PAGES) + held
  const reads = []
  const visited = []
  /** One page read, judged as read (skipped or kept) and, for home, the pages its nav and footer link. */
  const handle = (i, path, r) => {
    const source = from.get(path) ?? 'asked'
    const skipped = notAPage(r, path, source)
    visited.push({
      path,
      status: r.status ?? null,
      finalPath: finalPathOf(r) ?? path,
      from: source,
      ...(skipped ? { skipped } : {})
    })
    if (skipped) return
    reads.push(r)
    if (asked.discover && i === 0) {
      // Nav first (what a visitor clicks), then footer and sitemap, tried in that order until the cap.
      const queue = [
        ...(r.navLinks ?? []).map((p) => [p, 'nav']),
        ...(r.extraLinks ?? []).map((p) => [p, 'extra'])
      ]
      for (const [p, kind] of queue) {
        // A plan page the nav also links is the nav's: a 404 there is a broken link a visitor clicks.
        const planned = (asked.plan ?? []).find((q) => routeKey(q) === routeKey(p))
        if (planned && from.get(planned) === 'plan' && kind === 'nav') from.set(planned, 'nav')
        if (isSitePath(p) && !seen.has(routeKey(p)) && pages.length < maxPages * 2) {
          pages.push(p)
          from.set(p, kind)
          seen.add(routeKey(p))
        }
      }
    }
  }
  // 🔒 HOME ALONE, THEN THE REST A FEW AT ONCE (plan "10/10" §7 S3, 26/10/2026): one check read up to ~15 pages one
  // after another at 2.6–6 s each. Home is read first by itself (it finds the nav's pages); the others are read
  // `readAtOnce` at a time, each in its own tab (`makeDemoQa`), never more than the pages left under the cap, and
  // handled in page order — so the reads, and every verdict judged from them, are the same as one at a time.
  let i = 0
  while (i < pages.length && reads.length < maxPages) {
    if (now() - started > (asked.budgetMs ?? Infinity)) throw qaDeadlineError()
    const wave = i === 0 ? 1 : Math.min(Math.max(1, readAtOnce), maxPages - reads.length)
    const batch = []
    while (batch.length < wave && i < pages.length) {
      const index = i++
      const path = pages[index]
      const url = new URL(path, base)
      // 🔒 The joined address must still be the demo's own origin, whatever the path said.
      if (url.origin !== origin) continue
      batch.push({ index, path, url })
    }
    const results = await Promise.all(
      batch.map(({ index, path, url }) =>
        read(url.href, path, { ...options, discover: asked.discover && index === 0 })
      )
    )
    batch.forEach((b, k) => handle(b.index, b.path, results[k]))
  }
  if (now() - started > (asked.budgetMs ?? Infinity)) throw qaDeadlineError()
  // 🔒 ONE POST, OPENED AS A VISITOR OPENS IT (lrsweep rig, 24/10/2026): a single post's own page shows the
  // template's article, which no list shows whole. The post the baseline read, else the first a card links.
  // A post whose route moved since the baseline is opened where it answers now (`postRoutes`).
  const ledgerPost = asked.baseline?.ledger?.post ?? null
  const moved = ledgerPost
    ? (asked.postRoutes ?? []).find((p) => routeKey(p.was) === routeKey(ledgerPost))
    : null
  const post = (moved ? moved.route : ledgerPost) ?? postPathOf(reads, origin)
  if (
    asked.discover &&
    post &&
    !reads.some((r) => routeKey(r.path) === routeKey(post)) &&
    now() - started <= (asked.budgetMs ?? Infinity)
  ) {
    const r = await read(new URL(post, base).href, post, { ...options, discover: false })
    const skipped = notAPage(r, post, 'post')
    visited.push({
      path: post,
      status: r.status ?? null,
      finalPath: finalPathOf(r) ?? post,
      from: 'post',
      ...(skipped ? { skipped } : {})
    })
    if (!skipped) reads.push({ ...r, post: true })
  }
  // The inventory's other routes, for what they say and show (`no-demo-pictures`, `no-demo-words`).
  const routeReads = []
  const routesUnread = []
  const routeStarted = now()
  // 🔒 ROUTES A FEW AT ONCE TOO (28/10/2026): a WordPress template's ~40 post routes were read one after another,
  // 150–180 s of every read of the site, while its pages already went `readAtOnce` at a time. They go in waves the
  // same way, each wave started only inside `routeBudgetMs`, and are handled in route order, so what is read and every
  // verdict from it are the one-at-a-time run's.
  const routesDue = []
  for (const path of asked.routes ?? []) {
    if (seen.has(routeKey(path)) || reads.some((r) => routeKey(r.path) === routeKey(path))) continue
    seen.add(routeKey(path))
    routesDue.push(path)
  }
  for (let i = 0; i < routesDue.length; ) {
    if (now() - routeStarted > (asked.routeBudgetMs ?? 0)) {
      routesUnread.push(...routesDue.slice(i))
      break
    }
    const wave = routesDue.slice(i, i + Math.max(1, readAtOnce))
    i += wave.length
    const results = await Promise.all(
      wave.map((path) => {
        const url = new URL(path, base)
        return url.origin === origin ? read(url.href, path, { ...options, discover: false }) : null
      })
    )
    for (const [k, path] of wave.entries()) {
      const r = results[k]
      if (!r) continue
      const skipped = notAPage(r, path, 'route')
      visited.push({
        path,
        status: r.status ?? null,
        finalPath: finalPathOf(r) ?? path,
        from: 'route',
        ...(skipped ? { skipped } : {})
      })
      if (!skipped) routeReads.push(r)
    }
  }
  const everyRead = [...reads, ...routeReads]
  const residue = residueOf(everyRead, asked)
  const wordmark = reads.find((r) => r.wordmark)?.wordmark ?? null
  const fittedLogo = reads.find((r) => r.fittedLogo)?.fittedLogo ?? null
  const postFindings = postRouteFindings(asked.postRoutes ?? [], visited, reads)
  return {
    checks: judgeWith(reads, { ...asked, residue, postRouteFindings: postFindings }, routeReads),
    ...(residue ? { residue } : {}),
    ...(wordmark ? { wordmark } : {}),
    ...(fittedLogo ? { fittedLogo } : {}),
    baseline: baselineOf(reads, asked.placed ?? [], { frames: asked.measureFrames, routes: routeReads }),
    pages: reads.map((r) => r.path),
    // Pages and routes whose document had not changed since the last check: their read was kept (`readDemoPage`
    // `previous`). Routes too (#247): a whole read is one that kept none, and a kept route is a kept read.
    reused: everyRead.filter((r) => r.reused === true).map((r) => r.path),
    // …and those whose document, styles and pictures had not changed since the last read of them, kept or read anew
    // (#247), never a page that fetches its content by script: what the look may keep its verdict on (tracy-web
    // `client-demo.js`).
    unchanged: everyRead.filter((r) => r.unchanged === true).map((r) => r.path),
    ...(asked.routes?.length ? { routes: routeReads.map((r) => r.path), routesUnread } : {}),
    visited,
    durationMs: now() - started
  }
}

/** The site's path of the first post a card of these reads links (its title's or its date's), or null. */
export function postPathOf(reads, origin) {
  for (const r of reads)
    for (const u of r.residue?.units ?? []) {
      if (!u.post) continue
      try {
        const url = new URL(u.post, r.url ?? origin)
        if (url.origin === origin && isSitePath(url.pathname)) return url.pathname + url.search
      } catch {}
    }
  return null
}

/** The path a read ended on after redirects (`finalUrl`), or null when it does not say. */
function finalPathOf(r) {
  try {
    const u = new URL(r.finalUrl)
    return u.pathname + u.search
  } catch {
    return null
  }
}

const HOME_PATH = /^\/(index\.php)?$/

/**
 * Why a discovered page is not judged: it redirects to home (WordPress sends a drafted page there — L4,
 * 19/10/2026: home was judged seven times), or a footer/sitemap link or a plan page answers 404/410 (the
 * web side reports a plan page it never reached as PAGE_PLAN_MISSING). A nav link that
 * 404s stays: that is a broken page a visitor clicks.
 */
function notAPage(r, path, source) {
  if (source === 'home') return null
  const landed = finalPathOf(r)
  if (landed !== null && HOME_PATH.test(landed.split('?')[0]) && !HOME_PATH.test(path.split('?')[0]))
    return 'redirected home'
  if (
    (source === 'extra' || source === 'plan' || source === 'route') &&
    (r.status === 404 || r.status === 410)
  )
    return 'not found'
  return null
}

/**
 * One page as the browser half reads it (`demo-qa-browser.js`).
 * @typedef {{
 *   path: string, url: string, status: number | null, error: string | null, loadMs: number | null,
 *   pending?: string[], blocked?: string[], failed?: {url: string, status: number | string, type: string}[],
 *   sheets?: {path: string, rules: number, sentinel: string | null, sentinelFound: boolean | null, text: string | null}[],
 *   styles?: {selector: string, text: string}[], inline?: {selector: string, style: string}[],
 *   images?: {src: string, sha256: string | null, width: number, height: number, broken: boolean, kind: 'img' | 'background', selector?: string, clone?: boolean, underWords?: boolean}[],
 *   blocks?: {text: string, selector?: string, form?: boolean}[], labels?: {text: string, href: string}[], text?: string,
 *   title?: string, metaDescription?: string,
 *   ctas?: {href: string, text: string, booking: boolean, button?: boolean, nav?: boolean, navigation?: boolean, toggles?: boolean, opens?: boolean, submits?: boolean, selector?: string}[],
 *   mainContent?: {state: 'present'|'empty'|'unknown', selector: string | null},
 *   finalUrl?: string,
 *   maps?: {query: string, text: string, selector?: string}[],
 *   sections?: {name: string, items: number, text: number}[],
 *   contrast?: {where: string, fg: number[], bg: number[] | null, overImage: boolean, selector?: string, text?: string}[],
 *   overlaps?: {text: string, selector?: string, coveredBy?: string}[],
 *   scrollWidth?: number | null, widest?: string | null, navLinks?: string[]
 * }} PageRead
 */

/**
 * Every address the demo may answer on, best first: its published hostname, the loopback port
 * `render-compose.sh` published (what a host-networked tracy-host reaches), then the docker-network
 * name of its web container (what a tracy-host inside the compose network reaches — the macOS
 * stand). `/_host/capture` sends only one of these and reached nothing on the stand (18/10/2026).
 * @param {string} label @param {string} platform @param {number|null} [port] @param {string|null} [host]
 * @returns {string[]}
 */
export function baseCandidates(label, platform, port = null, host = null) {
  const out = []
  const push = (u) => {
    if (!out.includes(u)) out.push(u)
  }
  if (host) push(captureTarget(label, platform, null, host))
  if (port) push(captureTarget(label, platform, port, null))
  push(captureTarget(label, platform, null, null))
  return out
}

/**
 * The first candidate that answers HTTP at all (any status below 500), probed in order with a
 * short timeout; none answering returns the first so the run fails with that address in its detail.
 * @param {string[]} candidates
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number, signal?: AbortSignal, fallback?: string | null, acceptHttpErrors?: boolean}} [options]
 */
export async function reachableBase(
  candidates,
  { fetchImpl = fetch, timeoutMs = 4000, signal, fallback = candidates[0], acceptHttpErrors = false } = {}
) {
  for (const base of candidates) {
    signal?.throwIfAborted()
    try {
      const res = await fetchImpl(base, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])])
      })
      try {
        if (res && (res.status < 500 || acceptHttpErrors)) return base
      } finally {
        await res?.body?.cancel().catch(() => {})
      }
    } catch {
      signal?.throwIfAborted()
      // Refused, unresolved or timed out: try the next address.
    }
  }
  return fallback
}

/**
 * Where a browser opens the demo and where it is served from: the first candidate that answers, or — when the site
 * names itself on its own host (`publicOrigin`, or with `discover` the markers its home page writes) and that is
 * not the address that answered (the stand) — pages opened at that name and served from the answering one.
 * @param {{label: string, platform: string, port?: number | null, host?: string | null, publicOrigin?: string | null}} asked
 * @param {{reach?: typeof reachableBase, home?: typeof homeHtml, discover?: boolean, signal?: AbortSignal, proxyOrigin?: string | null, proxyFetch?: typeof probeSiteProxy}} [deps]
 * @returns {Promise<{base: string, serveFrom: string | null, serveFromIsProxy?: boolean, proxySiteLabel?: string}>}
 */
export async function demoAddress(
  asked,
  {
    reach = reachableBase,
    home = homeHtml,
    discover = false,
    signal,
    proxyOrigin = null,
    proxyFetch = probeSiteProxy
  } = {}
) {
  const candidates = baseCandidates(asked.label, asked.platform, asked.port ?? null, asked.host ?? null)
  const direct = await reach(candidates, { signal, fallback: null, acceptHttpErrors: true })
  if (!direct && proxyOrigin && asked.publicOrigin && asked.host) {
    const publicUrl = new URL(asked.publicOrigin)
    let response
    try {
      response = await proxyFetch(`${proxyOrigin}/`, {
        headers: {
          host: publicUrl.host,
          'x-forwarded-host': publicUrl.host,
          'x-forwarded-proto': publicUrl.protocol.slice(0, -1),
          'x-forwarded-port': publicUrl.port || (publicUrl.protocol === 'https:' ? '443' : '80')
        },
        signal: AbortSignal.any([AbortSignal.timeout(4000), ...(signal ? [signal] : [])])
      })
      if (
        response.status >= 200 &&
        response.status < 400 &&
        response.headers.get('x-tracy-site-response') === asked.label
      )
        return {
          base: `${publicUrl.origin}/`,
          serveFrom: `${proxyOrigin}/`,
          serveFromIsProxy: true,
          proxySiteLabel: asked.label
        }
    } catch {
      signal?.throwIfAborted()
    }
  }
  const reachable = direct ?? candidates[0]
  const self =
    asked.publicOrigin ??
    (discover && asked.host ? selfOriginIn(await home(reachable, { signal }), [asked.host]) : null)
  const alias = self && self !== new URL(reachable).origin ? `${self}/` : null
  return { base: alias ?? reachable, serveFrom: alias ? reachable : null }
}
