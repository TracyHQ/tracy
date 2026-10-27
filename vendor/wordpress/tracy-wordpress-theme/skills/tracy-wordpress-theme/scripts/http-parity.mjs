#!/usr/bin/env node
// Content parity between a source site and its WordPress port, route by route.
//
//   node scripts/http-parity.mjs --source <base-url> --target <base-url> --routes <page-map.json|list>
//        [--map <redirects.json>] [--accept <accepted.json>] [--out <file>] [--min-words 4] [--ignore <regex>]
//        [--render source|target|both] [--pairs <pairs.json>] [--runs elements|leaf]
//        [--source-snapshot <spec dir | rendered dir>] [--media-map <media.json>] [--cache <dir>] [--no-cache]
//        [--concurrency 4] [--framework T4|T3|<classification> | --provenance <spec>/provenance.json]
//
// Chrome is dropped by the source framework's selector profile (lib/framework-selectors.mjs, #66):
// `--framework` names the classification, `--provenance` reads it from the spec-pack's provenance.json
// (`source.template.css.framework`). A classification without a profile drops the generic landmarks
// only, and a run that names none keeps the T4 list, assumed; the report's `selectors` says which,
// with the gap. The profile is part of every cache key.
//
// `--pairs` also takes an html spec's page-map.json (each page: source `/<file>` -> its `path`, its declared
// status kept). A page-map given as --routes next to any --pairs lists WordPress paths, each read as the source
// route of its pair. `--pages /a,/b` keeps only the pages whose WordPress path is listed.
// `--map` is for RENAMED routes of the same site (the old path must 301 to the new); `--pairs`
// is for a source whose routes are files (`/About.html`) that the port serves at another path
// (`/about`) — the pair is compared, and no redirect is expected.
//
// Ported in spirit from the Joomla release's http-parity.py, which compared a site with its own
// restored copy and could demand equal text. A Joomla site and its WordPress port share content,
// not chrome, so the bar here is containment: every substantive text run of the source page
// (headings, and any run of at least --min-words words, outside nav/header/footer; a sidebar counts) must
// appear on the target page; images are compared by basename, or through --media-map (below). Each
// route reports what is missing and what the target added, so a review reads named deltas rather
// than a bare fail.
//
// Routes whose path changed on the port (redirects.json `from` → `to`) are compared at the new
// path, and the old path must answer 301 to it. Exit 1 if any route is not 200 on both sides or
// has a missing source run; the JSON report carries the full picture either way. Two answers other
// than 200 are compared as answers: a route whose pair declares a status (a 404 page) passes when
// source and target both give it, and a source that redirects passes when the target serves the
// page at the mapped path or redirects to where the source's redirect lands (mapped the same way)
// — read as the redirect, never as the page it leads to, with or without a browser.
//
// A route's expected status comes from the pair (`status`) first, then from the --routes page-map
// entry (`status`, or 404 for `view: "404"` — the port's error page), else 200. A declared status
// is met only when BOTH sides give it, and the text is still compared. The one exception is a
// static export's error page: a declared 4xx whose source is read from a --source-snapshot
// reference.json of kind "html" that names the page's static file. A file answers 200 whatever it
// holds, so that status is checked on the target alone, and noted. A path ending in `.html` is not
// that proof, and a declared redirect is never met by a file.
//
// A source run is a heading or one text element; the port may draw the same words as several
// blocks (Joomla's one `<li>` per team member against a heading and two paragraphs, a price and
// its period in one `<p>` against two). Such a run is not missing: it is reported under
// `contained` when its words appear, in order, in the target page's text as a whole.
//
// `--accept` names deltas a review has decided are not defects — Joomla view chrome with no
// WordPress counterpart ("Written by", hit counts, the search help text), or a route the port
// deliberately answers differently. Each entry is `{ "match": "<regex>", "routes": ["/a", "/b"],
// "reason": "…", "decision": "D-64" }`: the routes are EXACT paths (a wildcard or an omitted list
// is refused) and the decision must exist in `--decisions` and mention what the row accepts; a missing run matching an accepted entry is reported under `accepted`, not
// `missing`, so the gate can go green on named, written-down exceptions and never on silence.
//
// `--source-snapshot` reads each source page from the rendered HTML that from-html already wrote
// (`reference.json` pages[].path, or `<slug>--1440-light.html` under a rendered dir) instead of
// rendering the source again with a browser. A snapshot whose static source file is newer (or
// whose recorded hash no longer matches) is stale: that route is rendered live and the report
// says `snapshot stale`; a route with no snapshot is rendered and says `no snapshot`. The browser
// launches only when some route needs it.
//
// `--media-map` reads the seeder's media.json (`files: { "<path under the source images dir>":
// { url } }`). WordPress renames an upload whose file name is taken (`item-5.jpg` → `item-5-7.jpg`),
// so by basename every renamed image reads as missing, and a missing image hides behind another
// one of the same name. With the map, a source image whose path ends with a key is present when the
// target shows that key's URL or a generated size of it (`-300x200` before the extension), and is
// reported by its source path when not; a source image no key names is still compared by basename.
//
// Every file a flag names (--routes as a file, --accept, --pairs, --map, --media-map,
// --source-snapshot) must exist and parse: otherwise exit 2 before anything is fetched.
//
// Routes are compared `--concurrency` at a time (lib/browser.mjs) and reported in --routes
// order, so a parallel run writes the same report as a serial one. `--cache <dir>` keeps one
// verdict per (source HTML, target HTML, tool version, options) under <dir>/http-parity/ and
// reuses it, marking the entry `cached: true` and the summary `cached N/M`; `--no-cache` measures
// everything. Bump TOOL_VERSION when the comparison logic changes, or a stale cache lies.
import fs from 'node:fs'
import path from 'node:path'
import { extractRuns, norm } from './lib/parity-extract.mjs'
import { lazyBrowser, withPage, mapLimit, concurrencyFrom } from './lib/browser.mjs'
import { RouteCache, cacheKey, sha256 } from './lib/route-cache.mjs'
import { InputError, exitOnInputError, flagValue, inputFile, inputDir, readJsonInput, readRoutes, declaredStatus } from './lib/routes.mjs'
import { parseDecisions, readSmallFile, rowKeyHolds, validateAcceptRows } from './lib/parity-acceptance.mjs'
import { FRAMEWORK_NAME, readProvenanceFile, selectorProfileFor, selectorsRecord } from './lib/framework-selectors.mjs'

// 6: chrome is the source framework's selector profile (#66); the profile is in the cache key.
// 7: an accepted row names exact routes and a decision that mentions it (lib/parity-acceptance.mjs); the decisions file is in the cache key.
const TOOL_VERSION = 7
// A server that accepts the connection and never answers would otherwise hold the run forever.
const FETCH_TIMEOUT_MS = 60000

const args = process.argv.slice(2)
const opt = (name, def) => exitOnInputError(() => flagValue(args, name)) ?? def
const source = opt('--source')
const target = opt('--target')
const routesArg = opt('--routes')
if (!source || !target || !routesArg) {
  console.error(
    'usage: http-parity.mjs --source <url> --target <url> --routes <page-map.json|list> [--map redirects.json] [--pairs pairs.json|page-map.json] [--pages /a,/b] [--accept accepted.json --decisions DECISIONS.md] [--media-map media.json] [--out file] [--min-words N] [--ignore regex] [--source-snapshot dir] [--cache dir] [--no-cache] [--concurrency N] [--framework <T4|T3|…> | --provenance provenance.json]'
  )
  process.exit(2)
}
// The selector profile: --framework, else --provenance, else the T4 list, assumed and said so.
const profiled = exitOnInputError(() => {
  const fw = flagValue(args, '--framework')
  const prov = flagValue(args, '--provenance')
  if (fw !== undefined && prov !== undefined) throw new InputError('name one of --framework and --provenance')
  if (fw !== undefined) {
    if (!FRAMEWORK_NAME.test(fw)) throw new InputError(`--framework ${JSON.stringify(fw)} is not a framework classification (T4, T3, Helix, other, unknown, …)`)
    return selectorProfileFor(fw, { from: '--framework' })
  }
  if (prov !== undefined) {
    try {
      return readProvenanceFile(prov)
    } catch (e) {
      throw new InputError(`--provenance ${e.message}`)
    }
  }
  return selectorProfileFor(null, { declared: false })
})
const selectors = selectorsRecord(profiled)
if (selectors.gap) console.error(`http-parity: selector profile ${selectors.profile} — ${selectors.gap}`)
const minWords = Number(opt('--min-words', '4'))
// `--runs leaf` also reads div/span text — needed for a design-tool export (see lib/parity-extract).
const runsMode = opt('--runs', 'elements')
const ignore = opt('--ignore') ? new RegExp(opt('--ignore'), 'i') : null
const out = opt('--out', 'http-parity.json')
// `--render` fetches through a real browser instead of `fetch`: a page whose text is written by
// its own script (a Claude Design canvas export renders `{{ }}` bindings with React at load) has
// no content in the HTML the server sends, and comparing that skeleton reports every route as
// missing everything. Rendered fetch waits for network idle, then reads the DOM as HTML.
const render = opt('--render', 'none')
const concurrency = concurrencyFrom(args)
const browser = lazyBrowser()
const samePath = (a, b) => new URL(a).pathname.replace(/\/+$/, '') === new URL(b).pathname.replace(/\/+$/, '')
async function renderedHtml(url) {
  const b = await browser.get()
  return withPage(b, { viewport: { width: 1440, height: 900 } }, async (page) => {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(400)
    // The page's own first answer, not the one the browser lands on: a source that redirects
    // (Joomla sends an anonymous visitor from the account view to login) reads as that redirect,
    // as a plain fetch reads it. A redirect to the same path (a trailing slash) is the same page.
    let first = res?.request() ?? null
    while (first?.redirectedFrom()) first = first.redirectedFrom()
    const hop = first && first !== res.request() ? await first.response() : null
    const location = hop ? new URL(hop.headers().location ?? '', url).toString() : null
    if (hop && !samePath(location, url))
      return { status: hop.status(), url: page.url(), location, html: await page.content() }
    return { status: res?.status() ?? 0, url: page.url(), html: await page.content() }
  })
}

// --- source snapshots -------------------------------------------------------------------------
const slugOf = (name) =>
  name
    .replace(/\.html?$/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
function loadSnapshotIndex(dir) {
  const refFile = path.join(dir, 'reference.json')
  if (fs.existsSync(refFile)) {
    const ref = JSON.parse(fs.readFileSync(refFile, 'utf8'))
    const pages = new Map()
    for (const p of ref.pages ?? []) {
      if (!p.page || !p.path) continue
      pages.set(p.page, {
        rendered: path.resolve(dir, p.path),
        static: p.static ? path.resolve(dir, p.static) : null,
        hash: p.staticSha256 ?? p.sha256 ?? p.hash ?? null,
        kind: p.kind ?? ref.kind ?? null
      })
    }
    return { kind: 'reference', dir, pages }
  }
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return { kind: 'rendered', dir, pages: new Map() }
  throw new Error(`--source-snapshot: ${dir} is neither a spec dir with reference.json nor a rendered dir`)
}
// { html, notes: [] } from the snapshot, or { html: null, notes: ['no snapshot' | 'snapshot stale'] }.
function readSnapshot(index, route) {
  const name = decodeURIComponent(route).replace(/^\/+/, '')
  let entry = index.pages.get(name)
  if (!entry) {
    const candidate = path.join(index.dir, `${slugOf(name)}--1440-light.html`)
    if (fs.existsSync(candidate)) entry = { rendered: candidate, static: null, hash: null }
  }
  if (!entry || !fs.existsSync(entry.rendered)) return { html: null, notes: ['no snapshot'] }
  if (entry.static && fs.existsSync(entry.static)) {
    const stale = entry.hash
      ? sha256(fs.readFileSync(entry.static, 'utf8')) !== entry.hash
      : fs.statSync(entry.static).mtimeMs > fs.statSync(entry.rendered).mtimeMs
    if (stale) return { html: null, notes: ['snapshot stale'] }
  }
  return { html: fs.readFileSync(entry.rendered, 'utf8'), notes: [] }
}
// A route whose source is a file of a static export, by provenance: a reference.json of kind "html"
// (from-html) lists the page with the static file it was rendered from. A file answers 200 whatever it
// holds, so such a route has no status of its own. A path ending in `.html` proves nothing — a live
// site can serve one — and a route no snapshot vouches for is a live route.
function isStaticExport(index, route) {
  if (!index || index.kind !== 'reference') return false
  const entry = index.pages.get(decodeURIComponent(route).replace(/^\/+/, ''))
  return !!entry && entry.kind === 'html' && !!entry.static && fs.existsSync(entry.static)
}

// --- inputs: every file a flag names is read here, before anything is fetched ----------------
// a route without its query string
const pathOnly = (p) => p.split('?')[0]
const inputs = exitOnInputError(() => {
  const routesIsPageMap = (() => {
    try {
      return fs.statSync(routesArg).isFile() && Array.isArray(JSON.parse(fs.readFileSync(routesArg, 'utf8'))?.pages)
    } catch {
      return false
    }
  })()
  const listOf = (j, keys, name, file) => {
    const list = Array.isArray(j) ? j : keys.map((k) => j[k]).find(Array.isArray)
    if (!Array.isArray(list)) throw new InputError(`${name} ${file}: no ${keys.join('/')} list`)
    return list
  }
  const snapshotDir = inputDir(args, '--source-snapshot')
  const r = { routes: readRoutes(routesArg), snapshot: snapshotDir ? loadSnapshotIndex(snapshotDir) : null }
  r.accepted = []
  r.acceptedRaw = ''
  const acceptFile = inputFile(args, '--accept')
  if (acceptFile) {
    const { raw, json } = readJsonInput(acceptFile, '--accept')
    r.acceptedRaw = raw
    const rows = listOf(json, ['accept'], '--accept', acceptFile)
    // A row accepts a difference only with an exact route scope and a decision that is about it
    // (lib/parity-acceptance.mjs): no `*`, no omitted routes, no citation of an unrelated decision.
    const decisionsFile = inputFile(args, '--decisions')
    if (!decisionsFile) throw new InputError('--accept needs --decisions <DECISIONS.md>: every accepted row cites a decision that names it')
    let decisionsRaw
    try {
      decisionsRaw = readSmallFile(decisionsFile, '--decisions')
    } catch (e) {
      throw new InputError(e.message)
    }
    const refusals = validateAcceptRows(rows, parseDecisions(decisionsRaw))
    if (refusals.length) throw new InputError(`--accept ${acceptFile}:\n  ${refusals.join('\n  ')}`)
    r.decisionsRaw = decisionsRaw
    for (const a of rows) r.accepted.push({ re: new RegExp(a.match, 'i'), routes: a.routes, reason: a.reason, decision: a.decision, row: a })
  }
  r.pairs = []
  const pairsFile = inputFile(args, '--pairs')
  if (pairsFile) {
    const pj = readJsonInput(pairsFile, '--pairs').json
    // An html spec's page-map IS the pair list: source `/<file>` -> WordPress `path`, no pairs.json to write.
    if (pj && !Array.isArray(pj) && Array.isArray(pj.pages) && !pj.rules && !pj.pairs)
      r.pairs = pj.pages.filter((p) => p.path).map((p) => ({ from: p.file ? `/${p.file}` : p.path, to: p.path, ...(declaredStatus(p) != null ? { status: declaredStatus(p) } : {}) }))
    else r.pairs = listOf(pj, ['rules', 'pairs'], '--pairs', pairsFile)
    // A page-map as --routes lists WordPress paths: each is read as the source route of its pair.
    // A pair whose target carries a query (a search page read with its term, ja-fresco S-31) is the
    // pair of the page-map path without that query; an exact pair still wins.
    if (routesIsPageMap) {
      const fromOf = new Map(r.pairs.filter((p) => p.from && p.to).map((p) => [p.to, p.from]))
      for (const p of r.pairs) if (p.from && p.to && !fromOf.has(pathOnly(p.to))) fromOf.set(pathOnly(p.to), p.from)
      r.routes = r.routes.map((x) => ({ ...x, path: fromOf.get(x.path) ?? x.path }))
    }
  }
  r.renames = []
  const mapFile = inputFile(args, '--map')
  if (mapFile) r.renames = listOf(readJsonInput(mapFile, '--map').json, ['rules', 'redirects'], '--map', mapFile)
  r.media = null
  const mediaFile = inputFile(args, '--media-map')
  if (mediaFile) {
    const { raw, json } = readJsonInput(mediaFile, '--media-map')
    if (!json || typeof json.files !== 'object' || Array.isArray(json.files))
      throw new InputError(`--media-map ${mediaFile}: no files{} object (the seeder's media.json)`)
    r.media = { raw, files: json.files }
  }
  return r
})
const snapshot = inputs.snapshot
const accepted = inputs.accepted
const acceptedRaw = inputs.acceptedRaw
const acceptedFor = (route, run) =>
  accepted.find((a) => a.re.test(run) && a.routes.includes(route) && rowKeyHolds(a.row, run))

// `--pages /a,/b` keeps the routes whose WordPress path is listed (a page group's pages), after
// --map/--pairs have said where each source route lands; a listed path no route reaches exits 2.
const pagesFilter = exitOnInputError(() => {
  const v = flagValue(args, '--pages')
  if (v === undefined) return null
  const list = v.split(',').filter(Boolean)
  if (!list.length || list.some((p) => !p.startsWith('/'))) throw new InputError(`--pages ${v}: expected a comma list of /paths`)
  return new Set(list)
})
const landsAt = (route) => inputs.renames.find((x) => x.from === route)?.to ?? inputs.pairs.find((x) => x.from === route && x.to)?.to ?? route
// a WordPress path in --pages names its page with or without the query its pair reads it with
const listed = (route) => pagesFilter.has(landsAt(route)) || pagesFilter.has(pathOnly(landsAt(route)))
if (pagesFilter) {
  const reached = new Set(inputs.routes.flatMap((r) => [landsAt(r.path), pathOnly(landsAt(r.path))]))
  const missing = [...pagesFilter].filter((p) => !reached.has(p))
  if (missing.length) {
    console.error(`http-parity: --pages names no route: ${missing.join(', ')}`)
    process.exit(2)
  }
  inputs.routes = inputs.routes.filter((r) => listed(r.path))
}
const routes = inputs.routes.map((r) => r.path)
// A static export's file stands in for an error page (a declared 4xx) only: a redirect is an answer,
// and a file cannot give it, so a declared 3xx is measured on a live source like any other route.
const staticErrorPage = (route, status) => status >= 400 && status < 500 && isStaticExport(snapshot, route)
const renames = new Map()
// A pair may carry `status`: the port's 404 page answers 404 on purpose, and that is the pass. A
// page-map entry declares it too (`view: "404"`); the pair, when it says, wins.
const pairs = new Map()
const expectStatus = new Map()
for (const r of inputs.routes) if (r.status != null) expectStatus.set(r.path, r.status)
for (const r of inputs.pairs) {
  if (!(r.from && r.to)) continue
  pairs.set(r.from, r.to)
  if (r.status) expectStatus.set(r.from, Number(r.status))
}
for (const r of inputs.renames) if (r.from && r.to) renames.set(r.from, r.to)
const mediaMatch = inputs.media ? mediaMatcher(inputs.media.files) : null
const cache = new RouteCache(opt('--cache'), { enabled: !args.includes('--no-cache') })

// --- fetch ------------------------------------------------------------------------------------
async function fetchPage(base, p, side = 'target') {
  const url = new URL(p, base).toString()
  try {
    if (side === 'source' && snapshot) {
      // A saved snapshot keeps the page, not the status it was served with. A live route declared to
      // answer something other than 200 (the 404 page) is rendered, so that answer is measured.
      const declared = expectStatus.get(p)
      const snap =
        declared != null && declared !== 200 && !staticErrorPage(p, declared)
          ? { html: null, notes: [`declared ${declared}: rendered live`] }
          : readSnapshot(snapshot, p)
      if (snap.html !== null) return { ...extract(url, 200, snap.html), from: 'snapshot', notes: [] }
      const r = await renderedHtml(url)
      if (r.status >= 300 && r.status < 400)
        return { url, status: r.status, location: r.location ?? r.url, runs: [], images: [], imagePaths: [], html: r.html, from: 'render', notes: snap.notes }
      return { ...extract(url, r.status, r.html), from: 'render', notes: snap.notes }
    }
    if (render === side || render === 'both') {
      const r = await renderedHtml(url)
      if (r.status >= 300 && r.status < 400)
        return { url, status: r.status, location: r.location ?? r.url, runs: [], images: [], imagePaths: [], html: r.html, from: 'render', notes: [] }
      return { ...extract(url, r.status, r.html), from: 'render', notes: [] }
    }
    let res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'tracy-http-parity' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    let status = res.status
    let location = res.headers.get('location')
    // WordPress canonicalises `/x` to `/x/` with a 301; that is the same page, not a rename, so
    // follow it once. Any other redirect (a different path) is reported as such and compared
    // against the rename map by the caller.
    if (status >= 300 && status < 400 && location) {
      const same = new URL(location, base)
      if (same.pathname.replace(/\/+$/, '') === new URL(url).pathname.replace(/\/+$/, '')) {
        res = await fetch(same.toString(), {
          redirect: 'manual',
          headers: { 'user-agent': 'tracy-http-parity' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        })
        status = res.status
        location = res.headers.get('location')
      }
    }
    if (status >= 300 && status < 400) return { url, status, location, runs: [], images: [], imagePaths: [], html: '', from: 'fetch', notes: [] }
    const html = await res.text()
    return { ...extract(url, status, html), from: 'fetch', notes: [] }
  } catch (e) {
    return { url, status: 0, error: String(e.message), runs: [], images: [], imagePaths: [], html: '', from: 'error', notes: [] }
  }
}

function extract(url, status, html) {
  return { url, status, html, ...extractRuns(html, { minWords, ignore, runs: runsMode, chrome: profiled.profile.chrome }) }
}

// --- images -----------------------------------------------------------------------------------
// The media.json key a source image path ends with (the longest), and the URL path it was imported as.
function mediaMatcher(files) {
  const urlPath = (u) => decodeURIComponent(new URL(u, 'http://x/').pathname)
  const byKey = new Map(Object.entries(files).filter(([, v]) => v?.url).map(([k, v]) => [k.replace(/^\/+/, ''), urlPath(v.url)]))
  return (sourcePath) => {
    const segs = sourcePath.split('/').filter(Boolean)
    for (let i = 0; i < segs.length; i++) {
      const hit = byKey.get(segs.slice(i).join('/'))
      if (hit) return hit
    }
    return null
  }
}
// Source images the target does not show. Without a media map: by basename. With one: a mapped
// source image by the URL it was imported as (or a generated size of it), reported by source path.
function missingImagesOf(a, b, match) {
  if (!match) {
    const bImg = new Set(b.images)
    return a.images.filter((i) => !bImg.has(i))
  }
  const shown = new Set()
  for (const p of b.imagePaths) {
    shown.add(p)
    shown.add(p.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1'))
  }
  const bBase = new Set(b.images)
  const out = []
  for (const p of a.imagePaths) {
    const want = match(p)
    if (want ? !shown.has(want) : !bBase.has(path.posix.basename(p))) out.push(want ? p : path.posix.basename(p))
  }
  return [...new Set(out)]
}

// --- compare one route ------------------------------------------------------------------------
async function compareRoute(route) {
  const targetPath = renames.get(route) ?? pairs.get(route) ?? route
  const a = await fetchPage(source, route, 'source')
  const b = await fetchPage(target, targetPath)
  let redirect = null
  if (targetPath !== route && !pairs.has(route)) {
    const r = await fetchPage(target, route)
    const strip = (x) => x.replace(/\/+$/, '')
    redirect = {
      from: route,
      status: r.status,
      location: r.location ?? null,
      ok:
        r.status === 301 && !!r.location && strip(new URL(r.location, target).pathname) === strip(targetPath)
    }
  }
  const wantStatus = expectStatus.get(route) ?? 200
  // A source that redirects, met by a target that redirects too: both must land on the same page —
  // the source's destination, carried through the renames and pairs like any other route.
  let sourceRedirect = null
  if (a.status >= 300 && a.status < 400 && b.status >= 300 && b.status < 400) {
    const strip = (x) => x.replace(/\/+$/, '')
    const from = a.location ? decodeURIComponent(new URL(a.location, source).pathname) : null
    const expected = from === null ? null : (renames.get(from) ?? pairs.get(from) ?? from)
    const got = b.location ? decodeURIComponent(new URL(b.location, target).pathname) : null
    sourceRedirect = { status: a.status, location: a.location ?? null, expected, got, ok: expected !== null && got !== null && strip(got) === strip(expected) }
  }
  // A route declared to give another answer (the port's 404 page answers 404 on purpose) passes only
  // when the source gives that same answer: the source's own error page is what is being ported, and
  // a live source that serves a page there is not an error page. A static export's error page (a
  // declared 4xx, read from a from-html snapshot that names its static file) answers 200 whatever it
  // holds, so for it the declared answer is checked on the target alone, and noted.
  const declaredOther = expectStatus.has(route) && wantStatus !== 200
  const fileSource = declaredOther && a.from === 'snapshot' && staticErrorPage(route, wantStatus)
  const provenance = { sourceFrom: a.from, notes: fileSource ? [...a.notes, `static file: ${wantStatus} checked on the target`] : a.notes }
  const key = cacheKey({
    sourceHtml: a.html,
    targetHtml: b.html,
    toolVersion: TOOL_VERSION,
    extra: {
      route,
      targetPath,
      sourceStatus: a.status,
      targetStatus: b.status,
      wantStatus,
      sourceFrom: a.from,
      fileSource,
      redirect,
      sourceLocation: a.location ?? null,
      targetLocation: b.location ?? null,
      minWords,
      runsMode,
      selectors: profiled.profile.key,
      ignore: ignore ? String(ignore) : null,
      accept: acceptedRaw,
      decisions: inputs.decisionsRaw ? sha256(inputs.decisionsRaw) : null,
      media: inputs.media ? sha256(inputs.media.raw) : null
    }
  })
  const hit = cache.get('http-parity', key)
  if (hit) return { ...hit, ...provenance, cached: true }

  const bRuns = new Set(b.runs.map(norm))
  const aRuns = a.runs.map(norm)
  const containedRuns = []
  const missingAll = a.runs.filter((r, i) => {
    if (bRuns.has(aRuns[i])) return false
    if (aRuns[i] && b.text && b.text.includes(aRuns[i])) {
      containedRuns.push(r)
      return false
    }
    return true
  })
  const acceptedRuns = []
  const missing = missingAll.filter((r) => {
    const acc = acceptedFor(route, r)
    if (acc) acceptedRuns.push({ run: r, reason: acc.reason, decision: acc.decision })
    return !acc
  })
  const aSet = new Set(aRuns)
  const added = b.runs.filter((r) => !aSet.has(norm(r)))
  const missingImages = missingImagesOf(a, b, mediaMatch)
  // A source that redirects (Joomla sends an anonymous visitor from /account/profile to the login
  // view) has no page to compare; the target answering 200 at the mapped path is the whole check.
  const sourceOk = declaredOther
    ? a.status === wantStatus || fileSource
    : a.status === 200 || (a.status >= 300 && a.status < 400)
  const ok =
    sourceOk && b.status === wantStatus && !b.fatal && missing.length === 0 && (!redirect || redirect.ok) && (!sourceRedirect || sourceRedirect.ok)
  const entry = {
    route,
    targetPath,
    sourceStatus: a.status,
    targetStatus: b.status,
    fatal: !!b.fatal,
    sourceRuns: a.runs.length,
    matched: a.runs.length - missingAll.length,
    contained: containedRuns,
    missing,
    accepted: acceptedRuns,
    added,
    missingImages,
    redirect,
    sourceRedirect,
    ok
  }
  cache.put('http-parity', key, entry)
  return { ...entry, ...provenance, cached: false }
}

const line = (r) =>
  `${r.ok ? 'ok  ' : 'FAIL'} ${r.sourceStatus}/${r.targetStatus} ${r.route}${r.targetPath !== r.route ? ` → ${r.targetPath}` : ''}  runs ${r.matched}/${r.sourceRuns}${r.missing.length ? `  missing ${r.missing.length}` : ''}${r.accepted.length ? `  accepted ${r.accepted.length}` : ''}${r.missingImages.length ? `  images-missing ${r.missingImages.length}` : ''}${r.cached ? '  (cached)' : ''}${r.notes.length ? `  [${r.notes.join(', ')}]` : ''}`

let report
try {
  report = await mapLimit(routes, concurrency, compareRoute, { onDone: (_i, r) => console.log(line(r)) })
} finally {
  await browser.close()
}
const bad = report.filter((r) => !r.ok)
const count = (from) => report.filter((r) => r.sourceFrom === from).length
const summary = {
  routes: report.length,
  ok: report.length - bad.length,
  failing: bad.length,
  cached: report.filter((r) => r.cached).length,
  sourceSnapshot: count('snapshot'),
  sourceRendered: count('render'),
  sourceFetched: count('fetch')
}
fs.writeFileSync(
  out,
  JSON.stringify({ source, target, generatedAt: new Date().toISOString(), toolVersion: TOOL_VERSION, inputs: { acceptHash: acceptedRaw ? `sha256:${sha256(acceptedRaw)}` : null, decisionsHash: inputs.decisionsRaw ? `sha256:${sha256(inputs.decisionsRaw)}` : null }, selectors, summary, routes: report }, null, 2)
)
console.log(
  `http-parity: ${summary.routes} routes, ${summary.ok} ok, ${summary.failing} failing, cached ${summary.cached}/${summary.routes}, source snapshot ${summary.sourceSnapshot} · rendered ${summary.sourceRendered} · fetched ${summary.sourceFetched} → ${out}`
)
process.exit(bad.length ? 1 : 0)
