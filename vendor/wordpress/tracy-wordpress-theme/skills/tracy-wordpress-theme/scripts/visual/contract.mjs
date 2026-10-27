#!/usr/bin/env node
// visual.contract.json — the acceptance contract of the visual review (Phase 8b), on the EmDash
// standard (tracy-emdash-template references/qa-contract.md, visual-review-method.md) adapted to a
// WordPress site built by this skill. Everything the runner (visual-qa.mjs) measures is named here
// first: the four axes, the stage order, how the theme is observed, which template each page is
// drawn by, which page stands for that layout in a picture, which pictures exist and who looks at
// them, what the machine may not leave unclassified, and which findings a written decision has
// accepted. A contract with anything `pending` is not measured.
//
//   node scripts/visual/contract.mjs init --run-root <dossier dir> --spec <spec dir> --config review.config.json
//        --theme <overlay dir> --site <origin> --built-theme <built theme dir> [--routes <seed report.json>] [--artifact <theme zip>] [--site-id <id>] [--attempt <id>]
//        [--group <id> --pages /a,/b]   # a page group's own contract: its pages, its stand, its dossier
//        [--pairs <pairs.json> --source-site <origin> [--source-light-hook cookie:<name>=<value>]
//         [--source-dark-request-hook cookie:<name>=dark]]   # a live source
//   node scripts/visual/contract.mjs --run-root <dir> [--spec <dir>] [--routes <json>] [--artifact <zip>] [--built-theme <dir>]   # validate the canonical
//   node scripts/visual/contract.mjs --contract <file> [--spec <dir>] …                                     # validate one file
//
// One run-root, one canonical `visual.contract.json` (scripts/lib/canonical.mjs): `init` writes it
// there and supersedes the previous one into attempts/superseded-<stamp>/ (never deleted);
// `--attempt <id>` writes to attempts/<id>/ instead — an experiment, never a gate input. The
// contract records `bindings` (spec-pack, page-map, seed report, artifact hashes); validation
// against the inputs as they are now reports it STALE when any moved, and a stale contract fails.
//
// Where the fields come from, so nothing is typed twice:
//   variants / stages     fixed: 1440×900 and 390×844 × light/dark; light-desktop → light-responsive → dark-desktop → dark-responsive
//   interactions.mega     review.config.json `mega` ({ items, trigger, panel }; false = none) — the runner walks exactly these
//   design.theme          review.config.json (hook attribute + cookie/localStorage persistence) — the scanners read the same file
//                         (+ `default: "dark"` when the config declares `defaultTheme` — a site dark with no stored choice)
//   layouts               page-map `view` × the template WordPress SERVES each page (read from the site's body class through the
//                         template hierarchy against the BUILT theme's templates/ — `init --site <origin> --built-theme <src dir>` —
//                         or declared in review.config.json `templates` { "<route>": "<template slug>" }); one view served by two
//                         templates is two layouts (`<view>--<slug>`). A page whose template is neither is `pending`, never
//                         guessed from the view; the representative is the first page of the layout in the default locale
//   pages                 page-map pages; `path` is the REAL path after seeding when a seed report is given (a Russian page lives at
//                         /ru/<cyrillic-slug>/, not at the page-map's /ru/about); identity = body class + h1 (the body class of a
//                         route the seed report marks `served: "page"` is the page kind); source = the rendered snapshot
//                         — or, for a live source (reference `kind: url`, no rendered `path`), `sourceRoute` = the `from` of the run's
//                         pair for that page, read on `source.site` (`--pairs`, `--source-site`, the pairs http-parity.mjs takes)
//   design.parity         the theme's patterns.map.json: every `metadata.name` field a pattern fills is a two-sided pair (site vs source)
//   design.coverage       the visible content elements of <main> — a rule or a parity pair must measure each, else `unclassified-element`
//   design.parity.body    the body's text rendering (`-webkit-font-smoothing`, `text-rendering`), both sides, every axis with a source
//   design.containers     review.config.json `containers`: the SOURCE's container breakpoints (with the evidence they were read from)
//                         and the container selectors on both sides — measured on each layout's representative at every breakpoint
//                         (containerProbes); `{ none: "<why>" }` says the source has no container grid. Undeclared is `pending`
//   design.menus          review.config.json `visual.menuPairs`: header-menu pairs declared by hand, a selector a side
//                         ([{ site, source, label?, reason, decision }]) — for triggers neither words nor drawer markup pair (menu-open.mjs)
//   source.hash           sha256 over the spec-pack's page-map + sections + content — the contract is bound to one spec-pack
//   source.darkDerived    true when the page-map declares the source has no dark of its own (`theme.darkDerived`, the port derives
//                         its dark in Phase 6) and the source has no dark switch: a dark cell with nothing on the source to be
//                         compared with is then closed by this declaration (group-verdict.mjs, site-sweep.mjs), never left owed
//   source.framework      the spec-pack's provenance.json `source.template.css.framework` (the inventory classifier's T4 | T3 |
//                         Helix | other | … ; null when the provenance names none): the selector profile every tool reads the
//                         source with (lib/framework-selectors.mjs, #66). A framework with no profile reads generic landmarks
//                         and the reports say so; a contract written before #66 has no key and keeps the T4 lists, assumed
import { citationErrors, validateExceptionRows } from '../lib/parity-acceptance.mjs'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { ATTEMPTS_DIR, CANONICAL, bindingsFrom, resolveContract, specHash, stalenessOf, supersede } from '../lib/canonical.mjs'
import { routeIndex, routeKey } from '../lib/route-index.mjs'
import { deriveShots } from './fast-gate.mjs'
import { SECTIONS, readEvidence } from './evidence.mjs'
import { patternEntries, patternSlugsOf, patternSnapshot } from './pattern-registry.mjs'
import { bindReferenceKinds, checkApplicability } from './applicability.mjs'
import { readProvenanceFile } from '../lib/framework-selectors.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCHEMA_VERSION = 1
/** The origin of a site URL; a value that is not an http(s) URL is refused. */
export function originOf(url) {
  let u
  try {
    u = new URL(String(url))
  } catch {
    throw new Error(`--site ${JSON.stringify(url)} is not a URL`)
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`--site ${url}: only http(s) origins`)
  return u.origin
}
/** A page group's id: it names the group's dossier, stand and contract. */
export const GROUP_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i
export const VARIANTS = Object.freeze([
  { id: '1440-light', width: 1440, height: 900, theme: 'light' },
  { id: '1440-dark', width: 1440, height: 900, theme: 'dark' },
  { id: '390-light', width: 390, height: 844, theme: 'light' },
  { id: '390-dark', width: 390, height: 844, theme: 'dark' }
])
export const STAGES = Object.freeze([
  { id: 'light-desktop', variants: ['1440-light'] },
  { id: 'light-responsive', variants: ['390-light'] },
  { id: 'dark-desktop', variants: ['1440-dark'] },
  { id: 'dark-responsive', variants: ['390-dark'] }
])
export const LENSES = Object.freeze(['layout', 'typography', 'color', 'images', 'interaction'])
/**
 * The body's text rendering, compared two-sided on every axis that reads a source. Each changes
 * the weight every line of text is drawn at on every page, and no per-element `font-*` pair sees
 * it: the JA Vega source draws `antialiased` / `geometricPrecision`, the site drew `auto` / `auto`,
 * and its titles read heavier with not one finding (M6-13).
 */
export const BODY_RENDERING = Object.freeze(['-webkit-font-smoothing', 'text-rendering'])
/** The viewport height of a container probe; the width is the breakpoint. */
export const CONTAINER_PROBE_HEIGHT = 900
/**
 * Findings that say a measurement was not taken. No exception accepts one: an accepted
 * "not measured" would close the gate on a width, a property or a header menu nobody read (#37
 * review, #50).
 */
export const UNMEASURED_KINDS = Object.freeze(['container-not-measured', 'parity-body-not-measured', 'menu-open-not-measured'])
const BREAKPOINT_RANGE = [240, 3840]

/** page-map `view` → the body class the theme's tracy_page_kind() prints. */
export const KIND_OF_VIEW = Object.freeze({
  'front-page': 'home',
  home: 'listing',
  category: 'listing',
  archive: 'listing',
  search: 'listing',
  single: 'article',
  404: 'page'
})
const kindOf = (view) => KIND_OF_VIEW[view] ?? 'page'

/** A JSON input of the contract; one that is missing, empty or not JSON is an Error naming the file. */
const readJson = (p) => {
  let text
  try {
    text = readFileSync(p, 'utf8')
  } catch (e) {
    throw new Error(`${p}: cannot be read (${e.code ?? e.message})`)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`${p}: not JSON (${String(e.message).split('\n')[0]})`)
  }
}

export { specHash }

/**
 * The contract pages a caller named (`--pages`, visual-qa.mjs and round.mjs), as page ids in the order
 * given, each once. An entry is a page id or a route: the page's `path` (what the site serves) or its
 * `pagemapPath` (what the page-map wrote), a trailing slash no difference unless it tells two pages
 * apart. An entry that names no page, one that names two, and an empty list are refused: `--pages
 * /error-page` against a contract keyed `en-error-page` selected nothing, measured nothing and read
 * as a converged recheck (JA Vega M4d, #27 item 10).
 */
export function resolvePageSelection(contract, list) {
  const asked = (list ?? []).map((s) => String(s).trim()).filter(Boolean)
  if (!asked.length) throw new Error('--pages names no page: give page ids or paths the contract has')
  const pages = contract?.pages ?? []
  const bare = (p) => String(p ?? '').replace(/\/+$/, '') || '/'
  const ids = []
  const unknown = []
  const ambiguous = []
  for (const a of asked) {
    let hit = pages.filter((p) => p.id === a)
    if (!hit.length) hit = pages.filter((p) => p.path === a || p.pagemapPath === a)
    if (!hit.length) hit = pages.filter((p) => bare(p.path) === bare(a) || (p.pagemapPath != null && bare(p.pagemapPath) === bare(a)))
    const found = [...new Set(hit.map((p) => p.id))]
    if (!found.length) unknown.push(a)
    else if (found.length > 1) ambiguous.push(`${a} (${found.join(', ')})`)
    else if (!ids.includes(found[0])) ids.push(found[0])
  }
  const errors = []
  if (unknown.length) errors.push(`unknown page${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')} — not an id or a path of the contract`)
  if (ambiguous.length) errors.push(`ambiguous: ${ambiguous.join('; ')} — name the page by its id`)
  if (errors.length) throw new Error(`--pages: ${errors.join('; ')}`)
  return ids
}

const slugId = (p) => {
  const tail = p.path.replace(/^\/(ru|[a-z]{2})\//, '/').replace(/^\/|\/$/g, '') || 'home'
  return `${p.locale}-${tail.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
}

/**
 * Build the contract from the spec-pack and the theme. Pure: everything comes in as data.
 * @param {object} args
 * @param {object} args.pageMap        spec page-map.json
 * @param {object} args.reference      spec reference.json (rendered snapshot per source page)
 * @param {object} args.reviewConfig   review.config.json of the run
 * @param {object} [args.patternsMap]  the theme overlay's patterns.map.json (parity pairs)
 * @param {Record<string,string>} [args.patternFiles]  type → pattern PHP source (class per named block)
 * @param {object} [args.seedReport]   seed report (real paths per page-map path)
 * @param {string} args.specHash       from specHash()
 * @param {string} [args.id]
 */

/** The source export's own dark switch, as the runner's `--source-dark-hook` spelling. */
const list = (v) => (Array.isArray(v) ? v : [])

function darkHookOf(hook) {
  if (!hook?.darkValue) return null
  if (hook.attribute) return `attr:${hook.attribute}=${hook.darkValue}`
  if (hook.className) return `class:${hook.className}`
  return null
}

/**
 * The run's source→target route pairs (`http-parity.mjs --pairs`, `{ rules: [{ from, to, status? }] }`) matched to
 * a page: its target path, the page-map path it was written against, or — for the 404 view — the pair that declares
 * status 404. A live source (reference.json `kind: url`, no rendered `path`) is read at `from` on `source.site`.
 */
const trimSlash = (s) => (s.length > 1 ? s.replace(/\/+$/, '') : s)
export function pairFor(pairs, page, realPath = null) {
  if (!pairs?.length) return null
  const keys = new Set([page.path, realPath].filter(Boolean).map(trimSlash))
  // A pair's target matches by its exact form. Only a SEARCH view may be matched by a target that carries `?s=`: the
  // query is dropped there and nowhere else, so `/?s=x` is never the home page's pair.
  const noQuery = (x) => trimSlash(String(x).split('?')[0])
  const toKey = (r) => (page.view === 'search' ? noQuery(r.to) : trimSlash(r.to))
  // …and by its source: the route a live source is read at (the page-map path) or the exported file an html source is read at (`/<file>`)
  const fromKeys = new Set([...keys, ...(page.file ? [trimSlash(`/${page.file}`)] : [])])
  return pairs.find((r) => keys.has(toKey(r)) || fromKeys.has(trimSlash(r.from))) ?? (page.view === '404' ? pairs.find((r) => Number(r.status) === 404) : null) ?? null
}

/**
 * The template WordPress serves a page, from the page's served body class and the built theme's
 * `templates/` — the block-template hierarchy (wp-includes/template.php): an assigned custom
 * template (`page-template-<slug>`), then page-<slug>, page-<id>, page, singular; single-<type>-<slug>,
 * single-<type>, single, singular; category/tag/author-<slug|id>, then the kind, then archive;
 * front-page before anything else on the front page; 404; search; home for the posts page; index
 * last. Returns `{ template, tried }`, or `{ error }` — an assigned template the built theme does
 * not have, or a body class that names no view the hierarchy knows. Templates edited in the Site
 * Editor (stored in the database) are not visible here: the file is what is named.
 */
export function templateFromBody({ bodyClass, path: route = '/', templates }) {
  const cls = String(bodyClass ?? '').split(/\s+/).filter(Boolean)
  const has = (c) => cls.includes(c)
  const tail = (prefix) => cls.filter((c) => c.startsWith(prefix) && c.length > prefix.length).map((c) => c.slice(prefix.length))
  const set = new Set(templates ?? [])
  let slug = ''
  try {
    slug = decodeURIComponent(String(route).split('?')[0].replace(/\/+$/, '').split('/').pop() ?? '')
  } catch {
    slug = ''
  }
  const assigned = (prefix) => {
    const x = tail(prefix).filter((t) => t !== 'default')
    if (x.length && !set.has(x[0])) return { error: `the page is assigned template ${x[0]}, which is not in the built theme's templates/` }
    return { chain: x.slice(0, 1) }
  }
  const page = () => {
    const a = assigned('page-template-')
    if (a.error) return a
    return { chain: [...a.chain, ...(slug ? [`page-${slug}`] : []), ...tail('page-id-').map((id) => `page-${id}`), 'page', 'singular'] }
  }
  let r
  if (has('error404')) r = { chain: ['404'] }
  else if (has('search')) r = { chain: ['search'] }
  else if (has('home')) {
    const rest = has('page') ? page() : { chain: ['home'] }
    r = rest.error ? rest : { chain: ['front-page', ...rest.chain] }
  } else if (has('blog')) r = { chain: ['home'] }
  else if (has('attachment')) r = { error: 'an attachment page: its template is not resolved here' }
  else if (has('page') && tail('page-id-').length) r = page()
  else if (has('single')) {
    const type = tail('single-').find((t) => !t.startsWith('format-')) ?? 'post'
    const a = assigned(`${type}-template-`)
    r = a.error ? a : { chain: [...a.chain, ...(slug ? [`single-${type}-${slug}`] : []), `single-${type}`, 'single', 'singular'] }
  } else if (has('category')) r = { chain: [...tail('category-').map((t) => `category-${t}`), 'category', 'archive'] }
  else if (has('tag')) r = { chain: [...tail('tag-').map((t) => `tag-${t}`), 'tag', 'archive'] }
  else if (has('author')) r = { chain: [...tail('author-').map((t) => `author-${t}`), 'author', 'archive'] }
  else if (tail('tax-').length) {
    const tax = tail('tax-')[0]
    r = { chain: [...tail('term-').map((t) => `taxonomy-${tax}-${t}`), `taxonomy-${tax}`, 'taxonomy', 'archive'] }
  } else if (has('post-type-archive')) r = { chain: [...tail('post-type-archive-').map((t) => `archive-${t}`), 'archive'] }
  else if (has('date')) r = { chain: ['date', 'archive'] }
  else if (has('archive')) r = { chain: ['archive'] }
  else r = { error: `the body class names no view the template hierarchy knows (${cls.slice(0, 8).join(' ') || 'no body class'})` }
  if (r.error) return r
  const tried = [...r.chain, 'index']
  const template = tried.find((t) => set.has(t))
  return template ? { template, tried } : { error: `none of ${tried.join(', ')} is in the built theme's templates/`, tried }
}

/** Template slugs of a built theme (`<dir>/templates/*.html`). A theme without templates/ is an Error. */
function themeTemplatesOf(themeDir) {
  const dir = path.join(themeDir, 'templates')
  if (!existsSync(dir)) throw new Error(`${themeDir} has no templates/ — --built-theme is the BUILT theme (src/<theme>), not the overlay`)
  return new Set(readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)))
}

/**
 * The template each page is served by, read from the site: the page is fetched (redirects followed),
 * its `<body class>` resolved through templateFromBody. `{ [page id]: { template, from: 'site',
 * evidence } | { error } }` — a page that does not answer, answers another status than the contract
 * declares, or prints no body class is an error, never a guess.
 */
export async function servedTemplates({ site, pages, templates, fetchImpl = fetch }) {
  const out = {}
  for (const p of pages) {
    try {
      const res = await fetchImpl(new URL(p.path, site).href, { redirect: 'follow', signal: AbortSignal.timeout(30000) })
      const html = await res.text()
      const expected = p.status ?? 200
      if (res.status !== expected && !(expected === 200 && res.ok)) {
        out[p.id] = { error: `${p.path} answered ${res.status} (expected ${expected})` }
        continue
      }
      const m = /<body\b[^>]*\sclass\s*=\s*(["'])([^"']*)\1/i.exec(html)
      if (!m) {
        out[p.id] = { error: `${p.path} printed no <body class>` }
        continue
      }
      const finalPath = res.url ? new URL(res.url).pathname : p.path
      const r = templateFromBody({ bodyClass: m[2], path: finalPath, templates })
      out[p.id] = r.error ? { error: `${p.path}: ${r.error}` } : { template: r.template, from: 'site', evidence: m[2].replace(/\s+/g, ' ').trim().slice(0, 240) }
    } catch (err) {
      out[p.id] = { error: `${p.path} did not answer (${String(err.message).split('\n')[0]})` }
    }
  }
  return out
}

export function buildContract({ pageMap, reference, reviewConfig, patternsMap = null, patternFiles = {}, seedReport = null, specHash: hash, bindings = null, id = 'site', pairs = null, sourceSite = null, sourceLightHook = null, sourceDarkRequestHook = null, templates = null, themeTemplates = null, framework = undefined, unresolvedPatterns = [], group = null, targetSite = null, sections = null }) {
  for (const field of ['exceptions', 'menuPairs']) {
    if (reviewConfig?.visual && Object.hasOwn(reviewConfig.visual, field) && !Array.isArray(reviewConfig.visual[field])) {
      throw new Error(`review.config.json visual.${field} must be a list`)
    }
  }
  const locales = pageMap.locales ?? [pageMap.defaultLocale ?? 'en']
  const defaultLocale = pageMap.defaultLocale ?? locales[0]
  const routeByPagemap = new Map()
  // Seeded routes carry `pagemapPath` for a page that moved (a Polylang translation); a redirect
  // row (single view → first post) is keyed by its own path. First row wins.
  for (const r of seedReport?.routes ?? []) {
    const k = r.pagemapPath ?? r.path
    if (!routeByPagemap.has(k)) routeByPagemap.set(k, r)
  }
  const renderedOf = new Map((reference?.pages ?? []).map((p) => [p.page, p]))
  const hook = reviewConfig?.hook ?? { type: 'attribute', name: 'data-theme' }
  const persistence = reviewConfig?.persistence ?? null

  // A page-map page with no `locale` (a single-language from-joomla pack) is in the default locale.
  // With the run's pairs, a synthetic page is measured when a pair names its route (the article a
  // Joomla source serves, its 404), and a pair that names no page-map page brings its own `view`.
  const used = new Set()
  let entries = pageMap.pages
    .map((p) => ({ p: p.locale ? p : { ...p, locale: defaultLocale }, pair: pairFor(pairs, p, routeByPagemap.get(p.path)?.path) }))
  // A synthetic page with no source pair is not measured (nothing to compare it with), and that is
  // REPORTED, not dropped quietly: `unpairedSynthetic` lists it, `init` prints it, and it is never
  // counted as covered — a source that serves such a page (its 404) needs a rule in --pairs.
  const unpairedSynthetic = entries
    .filter(({ p, pair }) => p.synthetic && !pair)
    .map(({ p }) => ({ path: p.path, view: p.view ?? null, reason: 'synthetic page with no source pair — not measured (give --pairs a rule for it)' }))
  entries = entries.filter(({ p, pair }) => !p.synthetic || pair)
  for (const { pair } of entries) if (pair) used.add(pair)
  for (const r of pairs ?? []) {
    if (used.has(r)) continue
    if (!r.view) throw new Error(`pair ${r.from} → ${r.to} names no page-map page; give it a "view" (and a "title") to measure it`)
    entries.push({ p: { file: null, view: r.view, title: r.title ?? null, path: r.to, locale: defaultLocale }, pair: r })
  }
  // Where a page is measured. A 301 means the seeded site serves this view somewhere else, and the contract measures
  // where the visitor lands — `/article` at the first post. The SEARCH view is the one place where that is not the
  // whole story: it is measured with its term (`?s=`, site content: the dossier's review config), at the path the
  // seeded site serves the ported view — the pair's, the seed report's or the page-map's — and only when the seed
  // report records a redirect (WordPress's native search: `/search` → the locale root) at the redirect's destination.
  // exactly one `s` parameter: the configured term, or none (a search view with no term must fail validation even when the
  // route evidence already carries `?s=`). `&` and `#` in a term would end the parameter, so they are escaped.
  const withSearchTerm = (base, term) => {
    const [route, ...rest] = String(base).split('?')
    const query = rest.join('?').split('&').filter((x) => x && !/^s(=|$)/.test(x))
    if (term) query.push(`s=${String(term).replace(/[&#]/g, encodeURIComponent)}`)
    return query.length ? `${route}?${query.join('&')}` : route
  }
  const measuredPath = (p, pair) => {
    const real = routeByPagemap.get(p.path)
    const redirected = real?.status === 301 && real.location ? new URL(real.location).pathname : null
    const term = p.view === 'search' ? (reviewConfig?.search?.[p.locale] ?? reviewConfig?.search?.default ?? null) : null
    const base = term ? (redirected ?? pair?.to ?? real?.path ?? p.path) : (pair?.to ?? redirected ?? real?.path ?? p.path)
    if (p.view !== 'search') return { redirected, path: base, search: false }
    return { redirected, path: withSearchTerm(base, term), search: Boolean(term) }
  }
  // A page group's contract holds ONLY its pages (`group.pages`: WordPress paths, the page-map's or the seeded
  // route's). A path no page answers to is refused — a typo would otherwise shrink the group silently.
  if (group) {
    const keyOf = routeKey
    const wanted = new Set(group.pages.map(keyOf))
    const seen = new Set()
    const claimedBy = new Map()
    entries = entries.filter(({ p, pair }) => {
      const mine = [p.path, routeByPagemap.get(p.path)?.path, pair?.to, measuredPath(p, pair).path].filter(Boolean).map(keyOf).filter((k) => wanted.has(k))
      for (const k of mine) {
        seen.add(k)
        // one requested route, one page: two pages answering to it is refused, never settled by order
        if (claimedBy.has(k) && claimedBy.get(k) !== p) throw new Error(`group ${group.id}: --pages ${k} is ambiguous — page-map paths ${claimedBy.get(k).path} and ${p.path} both answer to it`)
        claimedBy.set(k, p)
      }
      return mine.length > 0
    })
    const missing = [...wanted].filter((k) => !seen.has(k))
    if (missing.length) throw new Error(`group ${group.id}: --pages ${missing.join(', ')} is not a page of the page-map (or of the seeded routes)`)
  }
  // A page-map lists MODULE ids (the source's, `111`); the contract's `sections` are section TYPES (`type:style`, a custom
  // module's `sectionType`) — the keys of patterns.map.json. With the dossier's sections.json every id is resolved here,
  // once, and every reader of `page.sections` gets types. An id the dossier does not hold (or holds without a type) is
  // named in `pending` and left out — never looked up as a type. A module that already IS a type (a page-map written
  // with `type:style` keys, or one the patterns map or the dossier declares) is kept.
  const sectionPending = []
  const typeOfModule = new Map()
  if (sections) {
    for (const r of sections.acm ?? []) typeOfModule.set(String(r.id), r.type ? (r.style ? `${r.type}:${r.style}` : r.type) : null)
    for (const r of [...(sections.custom ?? []), ...(sections.other ?? [])]) if (!typeOfModule.has(String(r.id))) typeOfModule.set(String(r.id), r.sectionType ?? null)
  }
  const knownTypes = new Set([...typeOfModule.values()].filter(Boolean))
  const typesOf = (p) => {
    const out = []
    for (const m of (p.sections ?? []).flatMap((x) => x.modules ?? [])) {
      if (!sections) {
        out.push(m)
        continue
      }
      const id = String(m)
      if (typeOfModule.has(id)) {
        const t = typeOfModule.get(id)
        if (t) out.push(t)
        else sectionPending.push({ what: 'section', page: slugId(p), module: id, why: `module ${id} has no section type in sections.json (a non-page module, or a custom module with sectionType null)` })
      } else if (knownTypes.has(id) || /^[^:\s]+:[^:\s]+$/.test(id)) out.push(id)
      else sectionPending.push({ what: 'section', page: slugId(p), module: id, why: `module ${id} is not in sections.json — its section type is unknown` })
    }
    return out
  }
  const pages = entries
    .map(({ p, pair }) => {
      const real = routeByPagemap.get(p.path)
      const ref = p.file ? renderedOf.get(p.file) : null
      // No rendered snapshot: a live source is read at the pair's source route (`source.site` + `from`).
      // A url page with no pair is read at the same path on `source.site` (the identity route).
      const effKind = ref?.kind ?? reference?.kind ?? null
      const sourceRoute = ref?.path ? null : pair ? pair.from : effKind === 'url' && sourceSite ? p.path : null
      const isSingle = p.view === 'single'
      const status = p.view === '404' ? 404 : 200
      const { path: measured } = measuredPath(p, pair)
      return {
        id: slugId(p),
        pagemapPath: p.path,
        path: measured,
        locale: p.locale,
        status,
        view: p.view,
        layout: p.view,
        // The body class is what WordPress serves at the route: a category route the seeder built
        // as a page (seed report `served: 'page'`) prints the page kind, while `layout` stays the
        // view (the template, coverage and representative are still the listing's).
        identity: { body: `tracy-page-${real?.served === 'page' ? 'page' : kindOf(p.view)}`, h1: isSingle ? null : (p.title ?? null), lang: p.locale },
        source: [p.file ?? pair?.from ?? p.path],
        ...(effKind ? { referenceKind: effKind } : {}),
        sourceRendered: ref?.path ?? null,
        ...(sourceRoute ? { sourceRoute } : {}),
        variants: VARIANTS.map((v) => v.id),
        states: ['default', ...(hasMega(reviewConfig) ? ['mega'] : [])],
        sections: typesOf(p)
      }
    })
  if (group) routeIndex(pages)
  // The template each page is SERVED by: declared (review.config.json `templates`, keyed by route)
  // or read from the site (`templates`, from servedTemplates). Never `templates/<view>.html`: JA Vega
  // M4b named six files the theme does not have and one `page` layout over three templates.
  const pending = [...sectionPending]
  const declaredOf = reviewConfig?.templates ?? {}
  for (const pg of pages) {
    const pick = (map) => map?.[pg.id] ?? map?.[pg.pagemapPath] ?? map?.[pg.path] ?? null
    const declared = pick(declaredOf)
    const raw = pick(templates)
    const measured = typeof raw === 'string' ? { template: raw, from: 'site' } : raw
    const why = []
    let chosen = null
    if (declared && measured?.template && declared !== measured.template) why.push(`review.config.json declares ${declared}, the site serves ${measured.template} (${measured.evidence ?? 'body class'})`)
    else if (declared) chosen = { template: declared, from: 'config' }
    else if (measured?.template) chosen = { template: measured.template, from: measured.from ?? 'site' }
    else why.push(`the template WordPress serves here is not known${measured?.error ? ` (${measured.error})` : ''} — init with --site <origin> --built-theme <built theme dir>, or declare it in review.config.json "templates"`)
    if (chosen && themeTemplates && !themeTemplates.has(chosen.template)) {
      why.push(`template ${chosen.template} (${chosen.from}) is not in the built theme's templates/`)
      chosen = null
    }
    pg.template = chosen ? `templates/${chosen.template}.html` : null
    pg.templateFrom = chosen?.from ?? null
    // Declared or read, a template is only known once the built theme is seen to have the file.
    pg.templateChecked = Boolean(chosen && themeTemplates)
    if (why.length) pending.push({ what: 'template', page: pg.id, why: why.join('; ') })
  }
  // A layout is a view AND a template: one view served by two templates is two layouts, each with
  // its own representative; the one on the view's own template (or the only one) keeps the view's id.
  const slugOf = (t) => (t ? t.replace(/^templates\//, '').replace(/\.html$/, '') : 'unknown')
  const layouts = []
  for (const pg of pages) {
    const siblings = new Set(pages.filter((x) => x.view === pg.view).map((x) => x.template))
    const layoutId = siblings.size === 1 || slugOf(pg.template) === pg.view ? pg.view : `${pg.view}--${slugOf(pg.template)}`
    pg.layout = layoutId
    let l = layouts.find((x) => x.id === layoutId)
    if (!l) layouts.push((l = { id: layoutId, view: pg.view, template: pg.template, templateFrom: null, templateChecked: false, pages: [], representative: null }))
    l.pages.push(pg.id)
  }
  for (const l of layouts) {
    const mine = pages.filter((p) => p.layout === l.id)
    l.representative = (mine.find((p) => p.locale === defaultLocale) ?? mine[0]).id
    l.templateFrom = l.template ? [...new Set(mine.map((p) => p.templateFrom))].sort().join('+') : null
    l.templateChecked = Boolean(l.template) && mine.every((p) => p.templateChecked)
  }
  const containers = containersFrom(reviewConfig?.containers, layouts, { partial: Boolean(group) })
  for (const why of containers.pending) pending.push({ what: 'containers', why })
  const unpairedFields = [...unresolvedPatterns]
  const parityPairs = patternsMap ? parityFromPatterns(patternsMap, patternFiles, unpairedFields) : []
  // A section type a page uses that the map does not declare (or declares without a pattern) has no pattern to measure.
  if (patternsMap) {
    const { unmapped } = patternSlugsOf(pages.flatMap((p) => p.sections ?? []), patternsMap)
    for (const t of unmapped) if (!unpairedFields.some((u) => u.startsWith(`${t} (`) || u.startsWith(`${t}.`))) unpairedFields.push(`${t} (a page uses this section type; the patterns map declares no pattern for it)`)
  }
  unresolvedPatterns = unpairedFields
  const c = {
    schemaVersion: SCHEMA_VERSION,
    id,
    ...(group ? { group: { id: group.id, pages: [...group.pages], ...(group.dossier ? { dossier: group.dossier } : {}) } } : {}),
    // The stand the contract was written for (its origin): a group's evidence is only its own on that stand.
    ...(targetSite ? { target: { site: targetSite } } : {}),
    revision: 1,
    pending,
    ...(unpairedSynthetic.length ? { unpairedSynthetic } : {}),
    ...(unresolvedPatterns.length ? { unresolvedPatterns } : {}),
    locales,
    defaultLocale,
    // `darkHook` is how the SOURCE snapshot is put into dark — the export carries its own
    // `html[data-theme=dark]` rules, and without telling the runner it renders the source in light
    // while the site is dark, so every colour "mismatches" (444 such findings on the first dark
    // run, 15/09). Null when the export has no dark of its own: then dark parity is not measured
    // rather than measured against the wrong page.
    source: {
      kind: pageMap.source?.kind ?? 'spec-pack',
      hash,
      reference: 'reference/rendered',
      darkHook: darkHookOf(pageMap.theme?.hook),
      // The page-map's declaration that the source has no dark of its own (spec-pack `theme.darkDerived`), kept only when
      // nothing puts the source into dark: a dark switch on the source means its dark is measured, whatever the page-map says.
      ...(pageMap.theme?.darkDerived === true && !darkHookOf(pageMap.theme?.hook) && !sourceDarkRequestHook ? { darkDerived: true } : {}),
      // A live source (pages with `sourceRoute`): its origin, and the switch that puts a dark-by-default
      // source into light (lib/browser.mjs `lightHook`, a request cookie the server reads).
      ...(sourceSite ? { site: sourceSite } : {}),
      ...(sourceLightHook ? { lightHook: sourceLightHook } : {}),
      // …and the request cookie that puts a light-by-default page of it into dark (lib/browser.mjs `darkRequestHook`).
      ...(sourceDarkRequestHook ? { darkRequestHook: sourceDarkRequestHook } : {}),
      // The framework the source was built on, as the spec-pack's provenance records it: the selector
      // profile of every tool that reads the source (lib/framework-selectors.mjs, #66).
      ...(framework !== undefined ? { framework } : {})
    },
    bindings: bindings ?? { specHash: hash },
    variants: VARIANTS.map((v) => ({ ...v })),
    visual: {
      stages: STAGES.map((s) => ({ ...s, variants: [...s.variants] })),
      shots: [
        { side: 'site', stages: ['light-desktop'], locales: [defaultLocale], consumers: [...LENSES] },
        { side: 'source', stages: ['light-desktop'], locales: [defaultLocale], consumers: ['layout', 'typography', 'images'] },
        { side: 'site', stages: ['light-responsive'], locales, consumers: ['layout', 'typography', 'images'] },
        { side: 'site', stages: ['dark-desktop'], locales: [defaultLocale], consumers: ['color', 'layout'] },
        { side: 'site', stages: ['dark-responsive'], locales: [defaultLocale], consumers: ['layout', 'color'] }
      ]
    },
    design: {
      theme: {
        selector: 'html',
        attribute: hook.name ?? 'data-theme',
        values: { light: null, dark: 'dark' },
        storage: persistence ? { type: persistence.type, key: persistence.key } : null,
        // A site that is dark with no stored choice (review.config.json `defaultTheme: "dark"`): the light
        // axis has to store "light" to see light at all — see visual-qa.mjs siteLightHookOf.
        ...(reviewConfig?.defaultTheme ? { default: reviewConfig.defaultTheme } : {})
      },
      // Site decisions live in the dossier's review.config.json (`visual.rules`, `visual.exceptions`,
      // `visual.coverageExclude`), not in this generated file: `init` supersedes the canonical
      // contract, and a hand-edited exception would be gone with it (the D23 exceptions were, 15/09).
      rules: list(reviewConfig?.visual?.rules),
      coverage: [
        {
          // Breadcrumbs and the loop's "Read more" are the theme's chrome, not the source's words.
          selector:
            'main :is(h1, h2, h3, p, li, a, button, .wp-block-button__link, img):not(.tracy-crumbs *):not(.wp-block-breadcrumbs *):not(.wp-block-post-excerpt__more-text):not(.wp-block-post-excerpt__more-link)' +
            list(reviewConfig?.visual?.coverageExclude)
              .map((sel) => `:not(${sel})`)
              .join(''),
          properties: ['color', 'background-color', 'font-family', 'font-size']
        }
      ],
      parity: { properties: ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'padding-top', 'padding-bottom'], hexTolerance: 8, pxTolerance: 1, pairs: parityPairs, body: { selector: 'body', properties: [...BODY_RENDERING] } },
      containers: containers.value,
      images: { scope: 'main', sourceSlot: 'image-slot[src]', placeholder: '.photo-placeholder' },
      exceptions: list(reviewConfig?.visual?.exceptions),
      ...(list(reviewConfig?.visual?.menuPairs).length ? { menus: { pairs: list(reviewConfig.visual.menuPairs) } } : {})
    },
    interactions: hasMega(reviewConfig) ? { mega: megaOf(reviewConfig) } : {},
    layouts,
    pages
  }
  c.visual.shots = deriveShots(c)
  return c
}

const hasMega = (reviewConfig) => !reviewConfig || reviewConfig.mega !== false

/**
 * The container widths the contract compares, from review.config.json `containers`:
 *
 *   { "breakpoints": [576, 768, 992, 1200, 1400],   the SOURCE's container breakpoints (min-width, px)
 *     "evidence": "template.css: .container max-width 540/720/960/1140/1320 from 576/768/992/1200/1400",
 *     "themes": ["light"],                          optional; the themes the widths are compared in
 *     "tolerance": 1,                               optional px; else the parity pxTolerance
 *     "items": [{ "id": "page", "source": ".container", "site": ".jv-container", "layouts": ["page", "single"] }] }
 *
 * or `{ "none": "<why the source has no container grid>" }`. The four axes stop at 1440 and 390, so
 * a source whose `.container` steps 540 / 720 / 960 / 1140 / 1320 and a site whose container only
 * caps at 1320 agree at both and differ at every width between (JA Vega D-48, M6-14). Each item is
 * measured on the representative of each of its layouts (every layout when it names none) — one
 * page a layout, not every page. The breakpoints are the source's, read from its CSS and cited in
 * `evidence`; the tool knows no framework's list. Returns `{ value, pending }`: a declaration that is
 * missing or wrong is pending (the contract is then not measured), never guessed.
 */
export function containersFrom(decl, layouts, { partial = false } = {}) {
  const pending = []
  const P = (m) => pending.push(m)
  if (decl === undefined || decl === null) {
    P('review.config.json declares no "containers": the container widths between the 1440 and 390 axes are compared at the source\'s breakpoints — declare { "breakpoints", "evidence", "items": [{ "id", "source", "site", "layouts"? }] }, or { "none": "<why>" } for a source without a container grid')
    return { value: null, pending }
  }
  if (typeof decl !== 'object' || Array.isArray(decl)) {
    P(`review.config.json "containers" must be an object, got ${JSON.stringify(decl)}`)
    return { value: null, pending }
  }
  if ('none' in decl) {
    const extra = Object.keys(decl).filter((k) => k !== 'none')
    if (typeof decl.none !== 'string' || !decl.none.trim()) P('"containers": { "none" } needs the reason the source has no container grid')
    if (extra.length) P(`"containers": "none" cannot stand beside ${extra.join(', ')}`)
    return { value: pending.length ? null : { none: decl.none.trim() }, pending }
  }
  const known = new Set(['breakpoints', 'evidence', 'themes', 'tolerance', 'items'])
  const unknown = Object.keys(decl).filter((k) => !known.has(k))
  if (unknown.length) P(`"containers": unknown key${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}`)
  const bps = decl.breakpoints
  if (!Array.isArray(bps) || !bps.length) P('"containers.breakpoints" must be a non-empty list of the source\'s breakpoints in px')
  else {
    const bad = bps.filter((w) => !Number.isInteger(w) || w < BREAKPOINT_RANGE[0] || w > BREAKPOINT_RANGE[1])
    if (bad.length) P(`"containers.breakpoints": ${bad.map((w) => JSON.stringify(w)).join(', ')} — each must be a whole number of px from ${BREAKPOINT_RANGE[0]} to ${BREAKPOINT_RANGE[1]}`)
    const dup = bps.filter((w, i) => bps.indexOf(w) !== i)
    if (dup.length) P(`"containers.breakpoints": ${[...new Set(dup)].join(', ')} listed twice`)
  }
  if (typeof decl.evidence !== 'string' || !decl.evidence.trim()) P('"containers.evidence" must say where the breakpoints were read in the source (file and rule)')
  const themes = decl.themes ?? ['light']
  if (!Array.isArray(themes) || !themes.length || themes.some((t) => !['light', 'dark'].includes(t)) || new Set(themes).size !== themes.length)
    P(`"containers.themes" must be a list of light and/or dark, each once, got ${JSON.stringify(decl.themes)}`)
  if (decl.tolerance !== undefined && !(typeof decl.tolerance === 'number' && Number.isFinite(decl.tolerance) && decl.tolerance >= 0 && decl.tolerance <= 16))
    P(`"containers.tolerance" must be px from 0 to 16, got ${JSON.stringify(decl.tolerance)}`)
  const items = []
  if (!Array.isArray(decl.items) || !decl.items.length) P('"containers.items" must list at least one container: { "id", "source", "site" }')
  else
    decl.items.forEach((it, i) => {
      const where = `"containers.items[${i}]"`
      if (!it || typeof it !== 'object') return P(`${where} must be an object`)
      const id = typeof it.id === 'string' ? it.id : ''
      if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) P(`${where}.id must be a name of letters, digits, - and _, got ${JSON.stringify(it.id)}`)
      else if (items.some((x) => x.id === id)) P(`${where}.id ${id} is used twice`)
      for (const side of ['source', 'site']) if (typeof it[side] !== 'string' || !it[side].trim()) P(`${where}.${side} must be the ${side} container's CSS selector`)
      const named = it.layouts ?? null
      if (named !== null && (!Array.isArray(named) || !named.length || named.some((l) => typeof l !== 'string'))) return P(`${where}.layouts must be a non-empty list of layout ids (or left out for every layout)`)
      // A group's contract holds some of the site's layouts: an item whose layouts are all elsewhere is another group's
      const present = partial && named ? named.filter((l) => layouts.some((x) => x.id === l)) : named
      if (partial && named && !present.length) return
      const missing = (present ?? []).filter((l) => !layouts.some((x) => x.id === l))
      if (missing.length) return P(`${where}.layouts names ${missing.join(', ')}, not a layout of the contract (${layouts.map((l) => l.id).join(', ')})`)
      const mine = present ? layouts.filter((l) => present.includes(l.id)) : layouts
      items.push({ id, source: String(it.source ?? '').trim(), site: String(it.site ?? '').trim(), layouts: mine.map((l) => l.id), pages: [...new Set(mine.map((l) => l.representative))] })
    })
  if (pending.length) return { value: null, pending }
  return { value: { breakpoints: [...bps].sort((a, b) => a - b), evidence: decl.evidence.trim(), themes: [...themes], tolerance: decl.tolerance ?? null, height: CONTAINER_PROBE_HEIGHT, items }, pending }
}

/**
 * The container probes a page owes on an axis: every item whose layouts this page represents, at
 * every breakpoint — on the page's NARROWEST axis of a theme the declaration names (390-light,
 * the responsive stage). `[{ item, source, site, width, theme }]`; empty for any other axis and page.
 */
export function containerProbes(contract, page, variant) {
  const c = contract?.design?.containers
  if (!c?.items || !c.themes?.includes(variant.theme)) return []
  const mine = (page.variants ?? []).map((id) => contract.variants?.find((v) => v.id === id)).filter((v) => v && v.theme === variant.theme)
  if (!mine.length || Math.min(...mine.map((v) => v.width)) !== variant.width) return []
  return c.items.filter((it) => it.pages.includes(page.id)).flatMap((it) => c.breakpoints.map((width) => ({ item: it.id, source: it.source, site: it.site, width, theme: variant.theme })))
}

/** The identity of the container declaration: a measurement made under another one is not evidence for this one. */
export const containersKey = (contract) => `sha256:${createHash('sha256').update(JSON.stringify(contract?.design?.containers ?? null)).digest('hex')}`

/**
 * The mega menu the runner walks (visual-qa.mjs → review/mega-hover.mjs `--items/--trigger/--panel`),
 * from review.config.json `mega`: `{ items, trigger, panel, link?, open? }`, or Tracy's own
 * `.tracy-mega` when the config says nothing. The contract used to carry Tracy's classes whatever
 * the theme, while the runner walked its own `--mega-items` — on JA Vega (`.jv-mega`) the contract
 * said one thing and the run measured another (M4, 26/09). What is not named is not filled in with
 * another theme's classes: a partial object stays partial and the validator names it.
 */
const TRACY_MEGA = Object.freeze({ items: '.tracy-mega', trigger: '.tracy-mega__trigger', panel: '.tracy-mega__panel' })
function megaOf(reviewConfig) {
  const m = reviewConfig?.mega && typeof reviewConfig.mega === 'object' ? reviewConfig.mega : TRACY_MEGA
  const panel = m.panel ?? null
  return { items: m.items ?? null, trigger: m.trigger ?? null, panel, link: m.link ?? (panel ? `${panel} a` : null), open: m.open ?? 'hover' }
}

/**
 * Parity pairs from a patterns map plus the pattern files: a field the pattern fills by
 * `metadata.name` (`hero.heading`) has a className on that block (`wtb-hero__heading`) — that,
 * under the type's root, is the site selector; the source side is a ROLE the runner resolves inside
 * the section's own HTML (heading → first h1–h3, intro → first p, eyebrow → the eyebrow, cta.<n> →
 * nth link/button, item.<n>.title → nth card's heading…). metadata.name is not printed on the
 * front end, so the class is the only handle a browser has.
 * @param {object} patternsMap  patterns.map.json
 * @param {Record<string,string>} patternFiles  type → pattern PHP source
 */
export function parityFromPatterns(patternsMap, patternFiles = {}, unresolved = []) {
  const pairs = []
  for (const [type, def] of Object.entries(patternsMap.types ?? {})) {
    const php = patternFiles[type] ?? ''
    const before = pairs.length
    const named = (u) => u.startsWith(`${type} (`) || u.startsWith(`${type}.`)
    // A declared type with no registered file has nothing to measure (the resolver already said why when it ran).
    if (!(type in patternFiles) && !unresolved.some(named)) unresolved.push(`${type} (no registered pattern file)`)
    const classOf = (name) => {
      const re = new RegExp(`<!-- wp:[\\w/-]+ (\\{[^\\n]*"metadata":\\{[^}]*"name":"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^\\n]*\\}) -->`)
      const m = re.exec(php)
      if (!m) return null
      try {
        return JSON.parse(m[1]).className?.split(/\s+/)[0] ?? null
      } catch {
        return null
      }
    }
    for (const [field, spec] of Object.entries(def.fields ?? {})) {
      if (!spec?.path || spec.attr === 'level') continue
      const name = spec.path.replace('<n>', '1')
      const cls = classOf(name)
      // A registered pattern whose declared field has no named block is a measurement that cannot be paired.
      if (!cls) {
        if (type in patternFiles) unresolved.push(`${type}.${field} (no block named "${name}" with a className in the registered pattern)`)
        continue
      }
      pairs.push({ key: `${type}.${field}`, site: `${def.root ?? ''} .${cls}`.trim(), sourceRole: field, type })
    }
    // Every declared type owes at least one measurement; none is a gap, not a pass.
    if (pairs.length === before && !unresolved.some(named)) unresolved.push(`${type} (declares no measurable field)`)
  }
  return pairs
}

/** Validate a contract; returns the list of errors (empty = valid). `spec` binds the source hash. */
export function validateContract(c, { specDir = null, seedReportPath = null, artifactPath = null, themeDir = null, decisions } = {}) {
  const errors = []
  const E = (m) => errors.push(m)
  // A page or a pattern the contract could not pair is a gap in the parity coverage, not a valid contract.
  for (const u of c.unpairedSynthetic ?? []) E(`unpaired synthetic page ${u.path} (${u.view ?? '?'}) has no source pair — give --pairs a rule for it`)
  for (const m of c.unresolvedPatterns ?? []) E(`pattern coverage is incomplete: ${m} — the type has no parity pairs`)
  if (c.schemaVersion !== SCHEMA_VERSION) E(`schemaVersion must be ${SCHEMA_VERSION}`)
  if (!c.id) E('id is empty')
  if (!(Number.isInteger(c.revision) && c.revision > 0)) E('revision must be a positive integer')
  if (!Array.isArray(c.pending) || c.pending.length)
    E(`pending must be empty (${(c.pending ?? []).length} open decisions${(c.pending ?? []).length ? `: ${c.pending.slice(0, 3).map((x) => (typeof x === 'string' ? x : [x.page, x.why ?? x.what].filter(Boolean).join(' — '))).join('; ')}${c.pending.length > 3 ? '; …' : ''}` : ''})`)
  const locales = c.locales ?? []
  if (new Set(locales).size !== locales.length || !locales.length) E('locales must be a non-empty list without duplicates')
  if (!locales.includes(c.defaultLocale)) E('defaultLocale is not in locales')
  const variantIds = new Set()
  for (const v of c.variants ?? []) {
    if (!(v.id && v.width > 0 && v.height > 0 && ['light', 'dark'].includes(v.theme))) E(`variant ${v.id ?? '?'} needs id, width, height, theme`)
    variantIds.add(v.id)
  }
  const stages = c.visual?.stages ?? []
  if (stages.map((s) => s.id).join(',') !== STAGES.map((s) => s.id).join(','))
    E(`visual.stages must be ${STAGES.map((s) => s.id).join(' → ')} in that order`)
  for (const s of stages) for (const v of s.variants ?? []) if (!variantIds.has(v)) E(`stage ${s.id} names unknown variant ${v}`)
  for (const sh of c.visual?.shots ?? []) {
    if (!['site', 'source'].includes(sh.side)) E('visual.shots[].side must be site|source')
    if (!sh.consumers?.length) E(`visual.shots (${sh.side}, ${sh.stages?.join(',')}) has no consumers — a picture nobody looks at is not evidence`)
    for (const l of sh.consumers ?? []) if (!LENSES.includes(l)) E(`unknown lens ${l}`)
  }
  const t = c.design?.theme
  if (!t?.attribute || !t.values || !('light' in t.values) || !('dark' in t.values)) E('design.theme needs attribute and values for light and dark')
  if (!c.design?.coverage?.length) E('design.coverage is empty — every visible component must be classifiable')
  for (const r of c.design?.rules ?? []) {
    if (!r.selector || !r.source) E(`rule ${r.id ?? '?'} needs selector and source`)
    for (const v of variantIds) if (r.styles && !r.styles[v] && !r.optional) E(`rule ${r.id ?? r.selector} has no styles for variant ${v}`)
  }
  for (const x of c.design?.exceptions ?? []) {
    if (!(x.kind && x.match && x.reason && x.decision)) E(`exception ${x.kind ?? '?'} needs kind, match, reason and a cited decision`)
    if (UNMEASURED_KINDS.includes(x.kind)) E(`exception ${x.kind}: a measurement that was not taken cannot be accepted — fix the selector, the source or the property`)
  }
  // `decisions` (lib/parity-acceptance.mjs parseDecisions, or null when the dossier has none): every exception and every
  // declared menu pair cites ONE existing decision that names what it accepts, and a style exception names its routes and
  // selector. Left undefined, only the legacy shape above is checked.
  if (decisions !== undefined) {
    for (const m of validateExceptionRows(c.design?.exceptions, decisions, { surface: 'design.exceptions' })) E(m)
    for (const [n, x] of (Array.isArray(c.design?.menus?.pairs) ? c.design.menus.pairs : []).entries())
      for (const m of citationErrors(x?.decision, [x?.site, x?.source].filter((v) => typeof v === 'string'), decisions)) E(`design.menus.pairs[${n}]: ${m}`)
  }
  // A header-menu pair declared by hand pairs what its selectors name (menu-open.mjs pairMenus): each
  // side's selector, and why, as an exception is cited.
  const menus = c.design?.menus
  if (menus != null && !Array.isArray(menus.pairs)) E('design.menus.pairs must be a list — set review.config.json "visual.menuPairs"')
  for (const [n, x] of (Array.isArray(menus?.pairs) ? menus.pairs : []).entries()) {
    const sel = (v) => typeof v === 'string' && v.trim() && v.length <= 500
    if (!x || !sel(x.site) || !sel(x.source)) E(`design.menus.pairs[${n}] needs a site and a source selector (a string of at most 500 characters)`)
    else if (!(x.reason && x.decision)) E(`design.menus.pairs[${n}] needs a reason and a cited decision`)
    else if (x.label != null && (typeof x.label !== 'string' || x.label.length > 120)) E(`design.menus.pairs[${n}].label must be a string of at most 120 characters`)
  }
  if (c.group !== undefined) {
    const g = c.group
    if (typeof c.target?.site !== 'string' || !/^https?:\/\/[^/]+$/.test(c.target.site)) E('a group contract records the origin of its own stand (target.site) — re-init with --site <origin>')
    if (!g || typeof g !== 'object' || !GROUP_ID.test(g.id ?? '')) E(`group.id must be a name of letters, digits, - and _ (got ${JSON.stringify(g?.id)})`)
    else if (!Array.isArray(g.pages) || !g.pages.length || g.pages.some((x) => typeof x !== 'string' || !x.startsWith('/')) || new Set(g.pages).size !== g.pages.length)
      E(`group ${g.id}: pages must be a non-empty list of WordPress paths, each once`)
    if (typeof g?.dossier !== 'string' || !path.isAbsolute(g.dossier)) E('a group contract names its dossier (group.dossier, an absolute path): evidence is only the dossier\'s own — re-init with --run-root <group dossier>')
  }
  const layoutById = new Map((c.layouts ?? []).map((l) => [l.id, l]))
  const pageIds = new Set()
  const paths = new Set()
  for (const l of c.layouts ?? []) {
    if (!l.template) E(`layout ${l.id} has no template — the template WordPress serves its pages is not known`)
    // A contract written before 26/09 named templates/<view>.html from the view alone.
    else if (!l.templateFrom) E(`layout ${l.id}: template ${l.template} was not verified against the site nor declared — re-init with --site <origin> --built-theme <dir>`)
    else if (themeDir) {
      if (!existsSync(path.join(themeDir, l.template))) E(`layout ${l.id}: ${l.template} is not in the built theme ${themeDir}`)
    }
    // Declared in review.config.json and never looked for: a name typed by hand is not a file.
    else if (l.templateChecked !== true) E(`layout ${l.id}: template ${l.template} (${l.templateFrom}) was never checked against the built theme — init with --built-theme <dir>, or validate with --built-theme <dir>`)
    if (!l.pages?.includes(l.representative)) E(`layout ${l.id}: representative ${l.representative} is not one of its pages`)
  }
  const cont = c.design?.containers
  if (cont == null) {
    if (!(c.pending ?? []).some((x) => x?.what === 'containers')) E('design.containers is not declared — a contract written before container breakpoints were compared: re-init with review.config.json "containers"')
  } else if ('none' in cont) {
    if (typeof cont.none !== 'string' || !cont.none.trim()) E('design.containers.none needs the reason the source has no container grid')
  } else {
    const bps = cont.breakpoints
    if (!Array.isArray(bps) || !bps.length || bps.some((w, i) => !Number.isInteger(w) || w < BREAKPOINT_RANGE[0] || w > BREAKPOINT_RANGE[1] || (i && w <= bps[i - 1])))
      E(`design.containers.breakpoints must be ascending whole px from ${BREAKPOINT_RANGE[0]} to ${BREAKPOINT_RANGE[1]}, each once`)
    if (!cont.evidence) E('design.containers.evidence is empty — where in the source were the breakpoints read?')
    if (!Array.isArray(cont.themes) || !cont.themes.length || cont.themes.some((t) => !['light', 'dark'].includes(t))) E('design.containers.themes must be light and/or dark')
    if (!(Number.isInteger(cont.height) && cont.height > 0)) E('design.containers.height must be a positive integer')
    if (!Array.isArray(cont.items) || (!cont.items.length && !c.group)) E('design.containers.items is empty')
    for (const it of cont.items ?? []) {
      if (!it.id || !it.source || !it.site) E(`design.containers item ${it.id ?? '?'} needs id, source and site`)
      if (!it.pages?.length) E(`design.containers item ${it.id ?? '?'} measures no page`)
      for (const l of it.layouts ?? []) if (!layoutById.has(l)) E(`design.containers item ${it.id}: layout ${l} not declared`)
      for (const id of it.pages ?? []) if (!(it.layouts ?? []).some((l) => layoutById.get(l)?.representative === id)) E(`design.containers item ${it.id}: page ${id} is not the representative of one of its layouts`)
    }
  }
  const mega = c.interactions?.mega
  // `items` is optional only for a contract written before it was recorded (the runner then takes
  // `--mega-items`); one that names it must name the trigger and the panel too.
  if (mega && (!mega.trigger || !mega.panel || ('items' in mega && !mega.items)))
    E('interactions.mega needs items, trigger and panel — set review.config.json "mega": { "items", "trigger", "panel" } (or false)')
  const states = new Set(['default', ...Object.keys(c.interactions ?? {})])
  for (const p of c.pages ?? []) {
    if (p.referenceKind !== undefined) {
      if (!['html', 'url', 'image', 'none'].includes(p.referenceKind)) E(`page ${p.id}: referenceKind must be html|url|image|none`)
      const carriesSource = Boolean(p.sourceRendered || p.sourceRoute)
      if (p.referenceKind === 'none' && carriesSource) E(`page ${p.id}: reference.kind=none cannot carry a source`)
    }
    if (pageIds.has(p.id)) E(`duplicate page id ${p.id}`)
    pageIds.add(p.id)
    if (paths.has(`${p.locale}:${p.path}`)) E(`duplicate route ${p.path}`)
    // A search view measured at a plain path is measuring whatever the redirect landed on — the
    // locale root. Without a query there are no results on the page, and whether that also trips
    // `duplicate route` depends on a trailing slash, which is not a thing to rely on.
    if ((p.view ?? p.layout) === 'search' && !/[?&]s=/.test(p.path))
      E(`page ${p.id}: a search view is a QUERY — give review.config.json a "search" term for locale ${p.locale} (or search.default)`)
    paths.add(`${p.locale}:${p.path}`)
    if (!locales.includes(p.locale)) E(`page ${p.id}: locale ${p.locale} not declared`)
    const lay = layoutById.get(p.layout)
    if (!lay) E(`page ${p.id}: layout ${p.layout} not declared`)
    // A page is drawn by its layout's template: Fast Gate reads the layout's, page-hash the page's —
    // two answers would select one file and hash another.
    else {
      if ((p.template ?? null) !== (lay.template ?? null)) E(`page ${p.id}: template ${p.template ?? 'none'} is not its layout ${lay.id}'s ${lay.template ?? 'none'}`)
      if (lay.view && (p.view ?? p.layout) !== lay.view) E(`page ${p.id}: view ${p.view ?? p.layout} is not its layout ${lay.id}'s view ${lay.view}`)
    }
    if (p.template && !p.templateFrom) E(`page ${p.id}: template ${p.template} was not verified against the site nor declared`)
    if (!p.identity?.body) E(`page ${p.id}: identity.body missing`)
    if (!p.states?.includes('default')) E(`page ${p.id}: states must include default`)
    for (const s of p.states ?? []) if (!states.has(s)) E(`page ${p.id}: state ${s} not declared in interactions`)
    for (const v of p.variants ?? []) if (!variantIds.has(v)) E(`page ${p.id}: unknown variant ${v}`)
    if (!p.source?.length) E(`page ${p.id}: source is empty`)
    if (specDir && p.sourceRendered && !existsSync(path.join(specDir, p.sourceRendered))) E(`page ${p.id}: rendered source ${p.sourceRendered} not found in spec`)
    if (p.sourceRoute && !c.source?.site) E(`page ${p.id}: source route ${p.sourceRoute} but no source.site — init with --source-site`)
  }
  if (c.source && Object.hasOwn(c.source, 'framework') && c.source.framework !== null && (typeof c.source.framework !== 'string' || !c.source.framework.trim()))
    E(`source.framework ${JSON.stringify(c.source.framework)} is not a framework classification (a name such as T4 or T3, or null) — re-init from the spec-pack's provenance.json`)
  if (c.source && Object.hasOwn(c.source, 'darkDerived')) {
    if (c.source.darkDerived !== true) E(`source.darkDerived ${JSON.stringify(c.source.darkDerived)} is not true — it is written by init from page-map theme.darkDerived, or absent`)
    else if (c.source.darkHook || c.source.darkRequestHook) E('source.darkDerived says the source has no dark of its own, but source.darkHook/darkRequestHook names a dark switch for it — re-init the contract')
  }
  for (const l of c.layouts ?? []) for (const id of l.pages ?? []) if (!pageIds.has(id)) E(`layout ${l.id} lists unknown page ${id}`)
  if (specDir || seedReportPath || artifactPath) {
    const current = bindingsFrom({ specDir, seedReportPath, artifactPath })
    if (specDir) {
      const pageMap = readJson(path.join(specDir, 'page-map.json'))
      const reference = existsSync(path.join(specDir, 'reference.json')) ? readJson(path.join(specDir, 'reference.json')) : { pages: [] }
      for (const error of bindReferenceKinds(c.pages, pageMap, reference).errors) E(error)
    }
    if (specDir && c.source?.hash && c.source.hash !== current.specHash) E(`source.hash ${c.source.hash} does not match the spec-pack (${current.specHash}) — regenerate the contract`)
    for (const r of stalenessOf(c, current)) E(`stale — ${r}`)
  }
  return errors
}

/**
 * The pattern file of each patterns.map.json type, found by the `Slug:` its header REGISTERS
 * (`Slug: tracy/section-hero`), not by file name — a theme names files `acm-hero.php` and registers
 * `section-hero`. A header slug matches the map's `pattern` exactly, or by its last segment when the
 * map gives none; two files registering it are `ambiguous`, none is `missing` — a file name is never a
 * registration. Never guesses between candidates.
 * @returns {{ files: Record<string,string>, missing: string[], ambiguous: string[] }}
 */
export function resolvePatternFiles(themeDir, patternsMap) {
  const snapshot = patternSnapshot(themeDir)
  const files = {}, missing = [], ambiguous = []
  for (const [type, def] of Object.entries(patternsMap.types ?? {})) {
    const want = String(def.pattern ?? '')
    if (!want) {
      missing.push(`${type} (the map declares no "pattern" slug)`)
      continue
    }
    const hits = patternEntries(snapshot, want)
    if (hits.length > 1) ambiguous.push(`${type}: ${want} is registered by ${hits.map((h) => h.name).join(', ')}`)
    else if (!hits.length) missing.push(`${type} (${want})`)
    else if (!hits[0].bytes) missing.push(`${type} (${want}: ${hits[0].name} is too large to read whole)`)
    else files[type] = hits[0].bytes.toString('utf8')
  }
  return { files, missing, ambiguous }
}

export async function initContract({ specDir, configFile, themeDir = null, routesFile = null, artifactPath = null, id = 'site', pairsFile = null, sourceSite = null, sourceLightHook = null, sourceDarkRequestHook = null, site = null, builtTheme = null, group = null, fetchImpl = fetch, templates: knownTemplates = null }) {
  if (group && (!GROUP_ID.test(group.id ?? '') || !Array.isArray(group.pages) || !group.pages.length || group.pages.some((x) => typeof x !== 'string' || !x.startsWith('/'))))
    throw new Error('--group <id> needs --pages /a,/b (WordPress paths): a group contract holds exactly its own pages')
  if (group && !(typeof group.dossier === 'string' && path.isAbsolute(group.dossier))) throw new Error('--group needs --run-root <the group dossier>: the contract is canonical only there')
  const targetSite = site ? originOf(site) : null
  if (group && !targetSite) throw new Error('--group needs --site <origin>: a group contract is bound to its own stand')
  // Every template — read from the site or declared in review.config.json — is checked in the built theme.
  if (!builtTheme) throw new Error('--built-theme <src/<theme> dir> is required: each page\'s template, read from --site or declared in review.config.json "templates", must be a file of the BUILT theme')
  const pageMap = readJson(path.join(specDir, 'page-map.json'))
  const reference = existsSync(path.join(specDir, 'reference.json')) ? readJson(path.join(specDir, 'reference.json')) : { pages: [] }
  const reviewConfig = configFile ? readJson(configFile) : {}
  // The dossier's sections.json resolves the page-map's module ids to section types (buildContract).
  const sectionsFile = path.join(specDir, 'sections.json')
  const sections = existsSync(sectionsFile) ? readEvidence(sectionsFile, SECTIONS, { what: 'sections.json', max: 8 * 1024 * 1024 }) : null
  const patternsMap = themeDir && existsSync(path.join(themeDir, 'patterns.map.json')) ? readJson(path.join(themeDir, 'patterns.map.json')) : null
  const patternFiles = {}
  let unresolvedPatterns = []
  if (patternsMap && themeDir) {
    const found = resolvePatternFiles(themeDir, patternsMap)
    if (found.ambiguous.length) throw new Error(`patterns.map.json: ${found.ambiguous.join('; ')}`)
    Object.assign(patternFiles, found.files)
    unresolvedPatterns = found.missing
    for (const m of found.missing) console.error(`contract: pattern coverage is incomplete: ${m} — the type has no parity pairs`)
  }
  const seedReport = routesFile ? readJson(routesFile) : null
  const bindings = bindingsFrom({ specDir, seedReportPath: routesFile, artifactPath, configPath: configFile })
  const pairsJson = pairsFile ? readJson(pairsFile) : null
  const pairs = pairsJson ? (pairsJson.rules ?? pairsJson.pairs ?? pairsJson).filter((r) => r.from && r.to) : null
  const themeTemplates = themeTemplatesOf(builtTheme)
  // The source framework, from the spec-pack's provenance.json (every adapter writes one); a pack
  // without it, or one whose provenance names no framework, measures with generic landmarks and says so.
  // A provenance.json that is there but a symlink (dangling or not), not a regular file or not JSON is
  // refused (readProvenanceFile), never read through or taken for absent.
  const provFile = path.join(specDir, 'provenance.json')
  let hasProv = true
  try {
    lstatSync(provFile)
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    hasProv = false
  }
  const framework = hasProv ? (readProvenanceFile(provFile).framework ?? null) : null
  const args = { pageMap, reference, reviewConfig, patternsMap, patternFiles, seedReport, specHash: bindings.specHash, bindings, id, pairs, sourceSite, sourceLightHook, sourceDarkRequestHook, themeTemplates, framework, unresolvedPatterns, group, targetSite, sections }
  // The served template is read on the pages' real paths, so the pages are built first.
  // `templates` is what was read from the site before (migrate-port.mjs replays a contract's own record, offline)
  let templates = knownTemplates
  if (site && !templates) {
    templates = await servedTemplates({ site, pages: buildContract(args).pages, templates: themeTemplates, fetchImpl })
  }
  return buildContract({ ...args, templates })
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const argv = process.argv.slice(2)
  const opt = (n) => {
    const i = argv.indexOf(n)
    return i === -1 ? null : argv[i + 1]
  }
  const usage = 'usage: contract.mjs init --run-root <dir> --spec <dir> --config review.config.json [--theme <overlay>] --site <origin> --built-theme <built theme dir> [--routes <seed report>] [--artifact <zip>] [--site-id <id>] [--attempt <id>] [--group <id> --pages /a,/b] [--pairs <pairs.json> --source-site <origin> [--source-light-hook <hook>] [--source-dark-request-hook <hook>]]  |  contract.mjs --run-root <dir> | --contract <file>  [--spec <dir>] [--routes <json>] [--artifact <zip>] [--built-theme <dir>]'
  const inputs = { specDir: opt('--spec'), seedReportPath: opt('--routes'), artifactPath: opt('--artifact'), themeDir: opt('--built-theme') }
  try {
    if (argv[0] === 'init') {
      const runRoot = opt('--run-root')
      if (!runRoot || !inputs.specDir) throw new Error(usage)
      if (Boolean(opt('--group')) !== Boolean(opt('--pages'))) throw new Error('--group <id> and --pages /a,/b go together: a group contract holds exactly its own pages, and --pages without a group would narrow the site contract')
      if (opt('--group')) mkdirSync(runRoot, { recursive: true })
      // the dossier the group's contract is canonical in: written into the hashed body, compared by every reader
      const group = opt('--group') ? { id: opt('--group'), pages: opt('--pages').split(',').map((x) => x.trim()).filter(Boolean), dossier: realpathSync(runRoot) } : null
      const c = await initContract({ site: opt('--site'), builtTheme: inputs.themeDir, specDir: inputs.specDir, configFile: opt('--config'), themeDir: opt('--theme'), routesFile: inputs.seedReportPath, artifactPath: inputs.artifactPath, id: opt('--site-id') ?? path.basename(path.resolve(runRoot)), pairsFile: opt('--pairs'), sourceSite: opt('--source-site'), sourceLightHook: opt('--source-light-hook'), sourceDarkRequestHook: opt('--source-dark-request-hook'), group })
      const attempt = opt('--attempt')
      let out
      if (attempt) {
        const dir = path.join(runRoot, ATTEMPTS_DIR, attempt)
        mkdirSync(dir, { recursive: true })
        out = path.join(dir, CANONICAL.visual)
      } else {
        const old = supersede({ runRoot, name: CANONICAL.visual, reason: 'contract.mjs init wrote a new canonical' })
        if (old) console.log(`superseded: ${old}`)
        out = path.join(runRoot, CANONICAL.visual)
      }
      writeFileSync(out, JSON.stringify(c, null, 2) + '\n')
      const errors = validateContract(c, inputs)
      for (const u of c.unpairedSynthetic ?? []) console.log(`  ?? ${u.path} (${u.view}): ${u.reason}`)
      console.log(`contract: ${c.pages.length} pages · ${c.layouts.length} layouts · ${c.variants.length} variants · ${c.design.parity.pairs.length} parity pairs → ${out}${group ? ` — group ${group.id}, not a site gate input` : ''}${attempt ? ' (attempt, not a gate input)' : ''}${errors.length ? `\n  !! ${errors.join('\n  !! ')}` : ''}`)
      process.exit(errors.length ? 1 : 0)
    }
    const r = resolveContract({ runRoot: opt('--run-root'), explicit: opt('--contract'), name: CANONICAL.visual })
    const c = readJson(r.path)
    const errors = validateContract(c, inputs)
    for (const e of errors) console.log(`  !! ${e}`)
    console.log(`contract: ${r.path} (${r.canonical ? 'canonical' : 'NOT canonical — not a gate input'}) — ${errors.length ? `${errors.length} error(s)` : 'valid'} — ${c.pages?.length ?? 0} pages × ${c.variants?.length ?? 0} variants`)
    process.exit(errors.length ? 1 : 0)
  } catch (e) {
    console.error(`contract: ${e.message}`)
    process.exit(2)
  }
}
