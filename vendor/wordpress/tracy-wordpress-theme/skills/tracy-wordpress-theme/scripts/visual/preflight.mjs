#!/usr/bin/env node
// preflight.mjs — before a full Visual QA pass, a few minutes on at most six pages to learn whether
// the measuring tools READ this site correctly, which capabilities of the site that reading covers,
// and with which tools, renderer, fonts, runtime and source bytes it was taken. A tool that misreads
// a site does not fail: it reports, and the loop fixes the theme against its false positives for hours.
//
//   node scripts/visual/preflight.mjs --routes <page-map.json> --site <origin> [--source <origin>]
//        --contract <visual.contract.json> --spec <spec dir> --out <new dir>
//        [--pages /a[,/b…]] [--max-pages 6] [--discovery-limit 40] [--source-prefix /index.php]
//        [--source-site <origin>] [--tools visual-qa,layout-boxes,motion,http-parity,functional]
//        [--tool-timeout-ms 300000] [--probe-timeout-ms 120000] [--timeout-ms 900000] [--concurrency 3]
//        [--runtime-manifest <runtime.json> | --runtime-containers <name>[,<name>…]] [--prior-lock <lock>]
//        [--pass <tool>:<flag>[=<value>]]…
//   node scripts/visual/preflight.mjs --verify <out dir>
//
// WHY. JA Vega (M4–M4c, 26/09) ran three full Visual QA passes before the tools themselves were
// found wrong: layout-boxes paired one heading of ten on the home page (T4 section headings sat
// outside `main`) and exited 0 with 129 of 129 blocks differing; motion saw 0 reveals on a site that
// had many (Tracy's library was not recognised); the declared 404 page failed in three tools that
// did not know an error page answers 404. Each was visible on ONE page, next to a plain count. Two
// pages were not enough afterwards: container widths stepping at five source breakpoints between the
// 390 and 1440 axes (D-48) and seventeen layouts were outside any sample of the front page and the 404.
//
// CAPABILITIES. Before choosing pages the source is scanned — every page of the page-map it serves,
// contract page or not, up to --discovery-limit, layout representatives first; a page not read leaves
// what it carries unknown: the animation libraries it carries (AOS, WOW,
// animate.css and Tracy are read by motion; anything else — GSAP, ScrollReveal, sal, an unmarked
// IntersectionObserver fade — is named and unrecognised), elements transparent at load, toggles that
// reveal hidden regions, and — through the browser's own CSS parser, cross-origin sheets re-parsed
// from their captured bytes — the media rules that set the width of each container the contract
// declares (`design.containers.items[].source`); an `@container` rule setting one of those widths, a
// stylesheet not read and a scan stopped at its rule bound are gaps of that container, never skipped.
// Page-map paths must stay on the origin they are joined to (no `//host`, dot segments, query or
// fragment). The capabilities to certify are: the declared error
// page's status, one representative per contract layout (every layout; none is dropped to fit the
// bound), the site's dark state through the contract's hook, each animation library, scroll-revealed
// and toggle-revealed content, and each declared container at every observed breakpoint.
//
// SAMPLE. At most --max-pages (≤ 6) pages, chosen deterministically: greedily the page that covers
// the most capabilities still uncovered, ties to the earlier page-map entry. `--pages` names them by
// hand under the same bound and the same accounting. A capability no sampled page covers is listed
// `uncovered`; one the inputs cannot establish (no dark hook, no error page, pages the scan could not
// read) is `unknown`; one the scan shows absent is `not-applicable` with its evidence. Each leaves its
// gate NOT CERTIFIED — never a silent pass.
//
// PROBES, CONTROLS AND DEFECTS. On the sample, in the preflight's own browser, each capability is
// measured with the routine the loop's tools use (layout-boxes measureInPage/compareBlocks,
// lib/motion measureMotion/compareMotion, layout-boxes hookState): source against site (findings,
// kept), the side against itself (the control: must read zero differences), and the side with a
// defect injected into an isolated browser context (a 200 served for the declared 404; a heading 12 px
// larger; the dark mark taken off on the first scroll; a library's markers stripped from one element;
// reveals held transparent; one toggle's region kept hidden; one container narrowed at exactly one
// breakpoint width). The defect must be found by its intended detector at its intended measurement,
// and nothing unrelated may appear. Breakpoints are probed just below, at and just above each boundary.
//
// THE FIVE TOOLS, on that sample, as the loop runs them (each a child process with its own
// timeout, stdout/stderr and report kept under --out):
//   visual-qa     targeted-debug scope (`--pages <contract ids>`), stage light-desktop only
//   layout-boxes  one run per route, so the 404 route cannot hide the content route
//   motion        the content routes (it measures before anything is frozen; it has no notion of a
//                 declared status, so the 404 route is not its to read)
//   http-parity   the sample page-map (declared statuses kept), --no-cache; under --source-prefix it
//                 gets the source paths and a --pairs file to the site's, so it reads the same URLs
//   functional    the sample page-map (declared statuses kept)
// `--pass visual-qa:--theme=/path` hands a flag to one tool (repeatable); the flags that shape the
// reading — source prefix, hooks from --contract, statuses from the page-map, inputs and outputs —
// are passed already and cannot be replaced.
//
// THE CENSUS. Independently of all five, one browser loads each sample route on both sides and
// counts plainly: the status, the visible h1–h3 outside chrome, the visible text elements, the
// internal links, and the elements that are transparent at load and become visible while the page
// is scrolled (a reveal, whatever library draws it). A tool's reading is judged against it:
//   layout-boxes-headings-missed   fewer than half the headings both sides show were paired
//   layout-boxes-self-differs      every paired block differs, and a page compared with ITSELF
//                                  differs too (the control run) — the tool, not the theme
//   layout-boxes-all-differ-unverified  every block differs and the control could not run
//   motion-reveals-missed          0 reveals on a side where the census saw ≥ 3 elements reveal
//   *-status-misread               a tool fails a route on its status while the census reads
//                                  exactly the declared status
//   visual-qa-nothing-paired / -examined-too-few, http-parity-source-empty / -nothing-matched,
//   functional-links-unexamined    a count of 0 (or too few) where the census counts many
//   *-timeout / -crashed / -no-report / -route-missing / -not-measured   the tool gave no reading
//                                  (a sample page no tool could load is not measured, never a pass)
// A difference the census cannot call a misread stays what the tool says it is: a finding, kept
// and counted, never removed to make the preflight pass.
//
// THE LOCK. `measurement-lock.json` names what took the measurement: the tool tree (commit, dirty
// state, sha256 of every measuring file and of package.json/package-lock.json), the browser and
// Playwright that ran, the host, the fonts the pages loaded (families, faces, sha256 of each font
// file), the runtime images (a validated --runtime-manifest, or read-only `docker inspect` of
// --runtime-containers; a digest is never inferred from a tag), and the source and input bytes
// (routes, contract, spec files, source documents and stylesheets). The tool fingerprint (measuring
// files, dependencies, Node, Playwright, browser) is the lock EPOCH: the same fingerprint keeps the
// epoch of --prior-lock, a different one starts the next, and evidence of one epoch never certifies
// another. The lock is written last, atomically, sealed by its own sha256 and listing the sha256 of
// PREFLIGHT.json/.md, census.json and sample.page-map.json. The measuring files and commit are hashed
// before the first measurement and again after the last: a change between is a run of two tools, not
// certified. A source resource that served different bodies to one run (per-request tokens do this)
// has no single identity: it is unresolved, and the run is not certified. `--verify <out>` accepts a
// run only when that seal holds over all four artifacts, the identity is whole, the certification is
// complete, the epoch is the current tools', the input files still hash as recorded and the source
// still serves the recorded bytes (read again, bounded, redirects not followed). Run once per port,
// and again after any tool upgrade.
//
// WHAT A PASS MEANS. Only that the tools read this site's sample correctly and that each capability
// listed was measured, controlled and shown to catch a defect. It is not parity, not the fast gate,
// not a visual verdict, and it changes no tolerance and no coverage of any of them.
//
// Evidence: <out>/PREFLIGHT.json · PREFLIGHT.md · measurement-lock.json · census.json ·
// sample.page-map.json · <tool>/{stdout,stderr}.log and each tool's own report. Exit 0 when every
// tool read the sample correctly AND every gate is certified or evidenced not applicable AND the lock
// has no unresolved identity; 1 otherwise (--verify: 1 when the run is not accepted); 2 on usage.
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, constants as FS, createWriteStream, existsSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, realpathSync, unlinkSync, writeSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserIdentity, lazyBrowser, mapLimit, withPage, withTimeout } from '../lib/browser.mjs'
import { compareMotion, freezeMotion, measureMotion } from '../lib/motion.mjs'
import { declaredStatus } from '../lib/routes.mjs'
import { NO_REWRITE_PREFIX, sourcePrefixPlan } from '../lib/source-routes.mjs'
import { compareBlocks, hookState, hooksOf, MEASURE, measureInPage, measureOf } from './layout-boxes.mjs'
import { selectorProfileOfContract, selectorsRecord } from '../lib/framework-selectors.mjs'
import { bindReferenceKinds, checkApplicability } from './applicability.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS = path.resolve(HERE, '..')
const SKILL_ROOT = path.resolve(SCRIPTS, '..')
export const TOOLS = Object.freeze(['visual-qa', 'layout-boxes', 'motion', 'http-parity', 'functional'])
/** Exit codes that mean "read, with or without findings". */
const READ_EXITS = { 'visual-qa': [0, 1], 'layout-boxes': [0, 1], motion: [0, 1], 'http-parity': [0, 1], functional: [0, 1] }
/** Census thresholds: below these a zero from a tool is not called a misread. */
const CENSUS_MIN = Object.freeze({ headings: 2, reveals: 3, texts: 5, links: 3, examined: 20 })
/** The sample bound: the preflight is minutes on a few pages, never a pass over the site. */
export const MAX_PAGES = 6
/** Bounds of the capability scan and the probes. */
const BOUNDS = Object.freeze({ discoveryPages: 40, maxDiscoveryPages: 200, breakpoints: 8, cssRules: 60000, toggles: 5, scrollSteps: 150, revealSettleMs: 4000, revealElements: 200, resourceBytes: 8 * 1024 * 1024, resources: 400, inputBytes: 64 * 1024 * 1024, lockBytes: 16 * 1024 * 1024 })
/**
 * The gates a preflight certifies, and the tools whose reading each one also depends on. A gate is
 * certified only when every capability of it is covered, measured, controlled and caught its defect,
 * and every tool it names was run and trusted.
 */
export const GATES = Object.freeze({
  status: { tools: ['http-parity', 'functional', 'layout-boxes', 'visual-qa'] },
  layout: { tools: ['layout-boxes', 'visual-qa'] },
  dark: { tools: [] },
  animation: { tools: ['motion'] },
  hidden: { tools: [] },
  containers: { tools: [] }
})
/** Animation libraries lib/motion.mjs reads, with the marker a defect strips from one element. */
const RECOGNISED_LIBRARIES = Object.freeze({
  aos: { selector: '[data-aos]', strip: "for (const a of [...el.attributes]) if (a.name.startsWith('data-aos')) el.removeAttribute(a.name)" },
  wow: { selector: '.wow', strip: "el.classList.remove('wow')" },
  'animate.css': { selector: '.animate__animated', strip: "el.classList.remove('animate__animated')" },
  tracy: { selector: 'main .tracy-motion-reveal', strip: "el.classList.remove('tracy-motion-reveal')" }
})
export const LOCK_SCHEMA = 'tracy.preflight.measurement-lock/1'
export const LOCK_FILE = 'measurement-lock.json'
/** The artifacts every lock seals: a lock without one of them is not a whole run. */
export const SEALED_ARTIFACTS = Object.freeze(['PREFLIGHT.json', 'PREFLIGHT.md', 'census.json', 'sample.page-map.json'])
const CHROME = MEASURE.chrome
const SLIDES = '[class*="carousel"], [class*="swiper"], [class*="slick"], [class*="owl-"], [class*="splide"], [role="tabpanel"], [role="dialog"], [aria-hidden="true"]'
const firstLine = (e) => String(e?.message ?? e).split('\n')[0]
import { sameIdentity, sourceIdentity, volatileStylesheet } from './source-identity.mjs'
const sha256 = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`

// ---- the sample ---------------------------------------------------------------------------------

/**
 * Why a page-map path cannot be measured as written, or null. A path is joined to both origins, so
 * it may not name another host (`//host/x`), climb or stay with dot segments (`..`, `.`, or their
 * `%2e` forms, which the URL parser resolves), or carry a query, a fragment, a backslash (read as
 * `/`), whitespace or control characters: the URL measured would not be the route declared.
 */
export function routeProblem(p) {
  if (typeof p !== 'string' || !p.startsWith('/')) return 'no path starting with /'
  if (p.startsWith('//')) return 'a path starting with // names another host'
  if (/[\s\\?#\u0000-\u001f\u007f]/.test(p)) return 'a query, fragment, backslash, whitespace or control character in the path'
  if (p.split('/').some((seg) => /^(\.|%2e){1,2}$/i.test(seg))) return 'a dot segment in the path'
  return null
}

/** A route's address on an origin, refused when the joined URL leaves that origin or that path. */
export function urlOn(origin, route) {
  const why = routeProblem(route)
  if (why) throw new Error(`${String(route)}: ${why}`)
  const u = new URL(route, origin)
  if (u.origin !== new URL(origin).origin || u.search || u.hash) throw new Error(`${route}: joined to ${origin} it leaves the origin`)
  return u.href
}

/**
 * The page-map's entries, each with a path starting with `/` that stays on the origin it is joined
 * to, no path twice, statuses that are HTTP statuses. A page-map that is not that is an error, never
 * a guessed list.
 */
export function pageList(pageMap) {
  const raw = Array.isArray(pageMap) ? pageMap : (pageMap?.pages ?? pageMap?.routes)
  if (!Array.isArray(raw)) throw new Error('the page-map has no "pages" list')
  if (!raw.length) throw new Error('the page-map has no pages')
  const seen = new Set()
  return raw.map((e, i) => {
    const p = typeof e === 'string' ? { path: e } : e && typeof e === 'object' && !Array.isArray(e) ? { ...e, path: e.path ?? e.route } : null
    if (!p || typeof p.path !== 'string' || !p.path.startsWith('/')) throw new Error(`page-map entry ${String(i)}: no path starting with /`)
    const why = routeProblem(p.path)
    if (why) throw new Error(`page-map entry ${String(i)} ${JSON.stringify(p.path)}: ${why}`)
    if (seen.has(p.path)) throw new Error(`page-map: ${p.path} is listed twice`)
    seen.add(p.path)
    const status = declaredStatus(p)
    if (status !== null && !(Number.isInteger(status) && status >= 100 && status <= 599)) throw new Error(`page-map ${p.path}: status ${JSON.stringify(p.status)} is not an HTTP status`)
    return p
  })
}

// A declared 3xx (Joomla answers an anonymous visitor's /user-profile with a 303 to the login) is the
// route's answer: it is read as that redirect, never as a page — the tools that follow a redirect
// would measure the login form against a source that answered no page.
const roleOf = (e) => {
  const status = declaredStatus(e)
  return status !== null && status >= 400 ? 'error' : status !== null && status >= 300 ? 'redirect' : 'content'
}
/** The contract page a page-map path is measured as (visual-qa measures contract pages by id). */
const contractPageOf = (contract, route) => contract?.pages?.find((p) => p.pagemapPath === route) ?? contract?.pages?.find((p) => p.path === route) ?? null
/** A page the preflight may sample: a real page, or the declared error page (synthetic or not). */
/** A page the source serves: a real page, or the declared error page (synthetic or not). The capability scan reads these. */
const scannable = (e) => roleOf(e) !== 'redirect' && (!e.synthetic || roleOf(e) === 'error')
const eligible = (e, { contract, needContract }) => scannable(e) && (!needContract || Boolean(contractPageOf(contract, e.path)))
const frontFirst = (a, b) => Number(b.view === 'front-page' || b.path === '/') - Number(a.view === 'front-page' || a.path === '/')

/**
 * What the sample must cover, from the page-map, the contract and the source scan. Pure.
 * `requirements`: [{ id, gate, candidates: [path], why }] — capabilities a sampled page can cover;
 * `inventory`: [{ id, gate, state: 'unknown'|'not-applicable', reason, evidence? }] — the rest.
 */
export function requirementsOf({ list, contract = null, discovery = null, darkMark = null, needContract = false, referenceKinds = null }) {
  const referenceKindOf = (route) => referenceKinds?.[route] ?? null
  const pageKindOf = (page) => referenceKinds?.[page?.id] ?? null
  const ok = list.filter((e) => eligible(e, { contract, needContract }))
  const paths = new Set(ok.map((e) => e.path))
  const requirements = []
  const inventory = []
  const req = (id, gate, candidates, why) => requirements.push({ id, gate, candidates: [...new Set(candidates)].filter((p) => paths.has(p)), why })
  const note = (id, gate, state, reason, evidence = null) => inventory.push({ id, gate, state, reason, ...(evidence ? { evidence } : {}) })

  // None pages have no source-side evidence. Keep each such obligation visible while the
  // target status, layout and dark requirements below remain live.
  for (const e of list) {
    if (referenceKindOf(e.path) !== 'none') continue
    for (const [check, gate] of [['preflight-source-census', 'status'], ['preflight-source-layout', 'layout'], ['preflight-source-motion', 'animation'], ['preflight-source-http', 'status'], ['preflight-source-hidden', 'hidden'], ['preflight-source-containers', 'containers']])
      if (checkApplicability('none', check) === 'not-applicable') note(`${check}:${e.path}`, gate, 'not-applicable', `reference.kind=none on ${e.path}: no source-side ${check.replace('preflight-source-', '')} obligation`)
  }

  for (const e of list.filter((x) => roleOf(x) === 'redirect'))
    note(`redirect:${e.path}`, 'status', 'not-applicable', `${e.path} is declared ${String(declaredStatus(e))}: a redirect is the route's answer, not a page to sample — the layout it stands for is covered by another page or reported uncovered`)
  const errors = ok.filter((e) => roleOf(e) === 'error')
  if (errors.length) req('error-status', 'status', errors.map((e) => e.path), `declared status ${String(declaredStatus(errors[0]))}`)
  else note('error-status', 'status', 'unknown', 'the page-map declares no error page (view "404" or a status ≥ 400): how the site answers a missing page is not measured')

  if (contract?.layouts?.length) {
    for (const l of contract.layouts) {
      const ids = [l.representative, ...(l.pages ?? [])].filter(Boolean)
      const resolvedPages = ids.map((id) => contract.pages?.find((p) => p.id === id))
      const pages = resolvedPages.filter((p) => p && pageKindOf(p) !== 'none')
      const cands = pages.map((p) => p.pagemapPath).filter(Boolean)
      if (pages.length || resolvedPages.some((p) => !p)) req(`layout:${l.id}`, 'layout', cands, `contract layout ${l.id} (representative ${String(l.representative)})`)
      else note(`layout-source:${l.id}`, 'layout', 'not-applicable', `contract layout ${l.id}: every representative page has reference.kind=none, so source comparison is not applicable`)
    }
  } else {
    const views = new Map()
    for (const e of ok) views.set(e.view ?? 'page', [...(views.get(e.view ?? 'page') ?? []), e.path])
    for (const [view, cands] of views) req(`layout:${view}`, 'layout', cands, `page-map view ${view} (no contract: a layout is a view)`)
  }
  for (const e of list) if (roleOf(e) === 'content' && referenceKindOf(e.path) === 'none') {
    req(`status:target:${e.path}`, 'status', [e.path], `target-side HTTP status on ${e.path}; no source comparison`)
    req(`layout:target:${e.path}`, 'layout', [e.path], `target-side layout control on ${e.path}; no source comparison`)
  }

  const content = ok.filter((e) => roleOf(e) === 'content').sort(frontFirst)
  if (darkMark) req('dark', 'dark', content.map((e) => e.path), `dark through ${darkMark}`)
  else note('dark', 'dark', 'unknown', 'no dark hook the page can be checked by (contract design.theme or page-map theme.hook, as attr:/class:): the dark state is not measured')

  // what the source scan saw, against every page of the page-map the source serves (contract page
  // or not): a page it did not read — failed, beyond the bound, or never tried — leaves what that
  // page carries unknown
  const scanned = Object.entries(discovery?.pages ?? {})
  const failed = Object.keys(discovery?.failed ?? {})
  const sourceEntries = list.filter((e) => referenceKindOf(e.path) !== 'none')
  const unscanned = sourceEntries.filter((e) => scannable(e) && !Object.hasOwn(discovery?.pages ?? {}, e.path)).map((e) => e.path)
  const complete = Boolean(discovery) && !unscanned.length
  const scanNote = discovery
    ? `${String(scanned.length)} of ${String(scanned.length + unscanned.length)} source page(s) scanned${failed.length ? `, ${String(failed.length)} not read (${failed.slice(0, 5).join(', ')})` : ''}${unscanned.length > failed.length ? `, ${String(unscanned.length - failed.length)} not scanned (${unscanned.filter((p) => !failed.includes(p)).slice(0, 5).join(', ')}${discovery.limit ? `; scan bound ${String(discovery.limit)}` : ''})` : ''}`
    : 'the source was not scanned'
  const byFeature = (pick) => {
    const m = new Map()
    for (const [route, obs] of scanned) for (const k of pick(obs)) m.set(k, [...(m.get(k) ?? []), route])
    return m
  }
  const pageOrder = (routes) => list.map((e) => e.path).filter((p) => routes.includes(p))
  const libs = byFeature((o) => (o.libraries ?? []).map((l) => l.id))
  for (const [id, routes] of [...libs].sort(([a], [b]) => (a < b ? -1 : 1))) req(`animation:${id}`, 'animation', pageOrder(routes), `${RECOGNISED_LIBRARIES[id] ? 'recognised' : 'UNRECOGNISED'} library ${id} on the source`)
  if (!libs.size) note('animation', 'animation', complete ? 'not-applicable' : 'unknown', complete ? 'no animation library and no unexplained reveal on the scanned source pages' : `no library seen, but the scan is incomplete (${scanNote})`, { scan: scanNote })
  else if (!complete) note('animation:unscanned', 'animation', 'unknown', `libraries on pages the scan did not read are not known (${scanNote})`)
  const hidden = byFeature((o) => [...((o.reveals?.hidden ?? 0) > 0 ? ['scroll'] : []), ...((o.toggles ?? 0) > 0 ? ['toggle'] : [])])
  for (const kind of ['scroll', 'toggle'])
    if (hidden.has(kind)) req(`hidden:${kind}`, 'hidden', pageOrder(hidden.get(kind)), kind === 'scroll' ? 'elements transparent at load on the source' : 'toggles revealing hidden regions on the source')
  if (!hidden.size) note('hidden', 'hidden', complete ? 'not-applicable' : 'unknown', complete ? 'no element transparent at load and no toggle over a hidden region on the scanned source pages' : `none seen, but the scan is incomplete (${scanNote})`, { scan: scanNote })
  else if (!complete) note('hidden:unscanned', 'hidden', 'unknown', `hidden content on pages the scan did not read is not known (${scanNote})`)

  const decl = contract?.design?.containers ?? null
  const heuristic = byFeature((o) => (o.css?.targets ?? []).filter((t) => t.heuristic && (t.breakpoints?.length || t.unsupported?.length)).map((t) => `${t.selector} at ${t.breakpoints?.join('/') || 'conditions not read'}`))
  if (decl?.items?.length) {
    for (const it of decl.items) {
      const resolvedPages = (it.pages ?? []).map((id) => contract.pages?.find((p) => p.id === id))
      const pages = resolvedPages.filter((p) => p && pageKindOf(p) !== 'none')
      const cands = pages.map((p) => p.pagemapPath).filter(Boolean)
      if (pages.length || !resolvedPages.length || resolvedPages.some((p) => !p)) req(`containers:${it.id}`, 'containers', cands, `contract container ${it.id}: ${it.source} ↔ ${it.site}`)
      else note(`containers:${it.id}`, 'containers', 'not-applicable', `contract container ${it.id}: every measured page has reference.kind=none, so source breakpoints are not applicable`)
    }
    if (!complete) note('containers:unscanned', 'containers', 'unknown', `container widths the CSS of pages the scan did not read may set are not known (${scanNote})`)
  } else if (heuristic.size) note('containers', 'containers', 'unknown', `the source CSS steps container widths (${[...heuristic.keys()].slice(0, 4).join('; ')}) and ${decl?.none ? `the contract declares none ("${decl.none}")` : 'no contract declares the containers'}: no site selector to measure against`)
  else if (decl?.none && complete) note('containers', 'containers', 'not-applicable', `the contract declares no container grid ("${decl.none}") and no media rule of the scanned source sets a container width`, { scan: scanNote })
  else note('containers', 'containers', 'unknown', decl?.none ? `the contract declares no container grid, but the scan is incomplete (${scanNote})` : 'no contract design.containers: the container widths between the axes are not measured')
  if (discovery?.unreadable?.length) note('containers:unreadable-css', 'containers', 'unknown', `stylesheets the browser could not parse or whose bytes were not captured: ${discovery.unreadable.slice(0, 5).join(', ')}`)
  const cut = scanned.filter(([, o]) => o.css?.truncated).map(([route]) => route)
  if (cut.length) note('containers:css-truncated', 'containers', 'unknown', `the CSS rule scan stopped at its bound on ${cut.slice(0, 5).join(', ')}: rules after it were not read`)
  return { requirements, inventory }
}

/**
 * `--pages`, checked before anything runs: paths of the page-map, each once, at most the bound, at
 * least one content page, and (for visual-qa) each one a contract page.
 */
export function checkManualPages(list, pages, { maxPages = MAX_PAGES, contract = null, needContract = false } = {}) {
  if (pages.length > maxPages) throw new Error(`--pages names ${String(pages.length)} pages; the preflight reads at most ${String(maxPages)}`)
  const dup = pages.filter((p, i) => pages.indexOf(p) !== i)
  if (dup.length) throw new Error(`--pages names ${dup[0]} twice`)
  const chosen = pages.map((p) => {
    const e = list.find((x) => x.path === p)
    if (!e) throw new Error(`--pages ${p}: not a page of the page-map`)
    if (roleOf(e) === 'redirect') throw new Error(`--pages ${p}: declared ${String(declaredStatus(e))} in the page-map — a redirect is not a page to sample (choose the page it leads to)`)
    if (needContract && !contractPageOf(contract, p)) throw new Error(`visual-qa: the contract has no page for ${p} — regenerate it (contract.mjs init) or choose --pages it has`)
    return e
  })
  if (!chosen.some((e) => roleOf(e) === 'content')) throw new Error(`--pages ${pages.join(',')}: no content page — the preflight needs one page that answers 200 (an error page may come with it)`)
  return chosen
}

/**
 * The sample and its coverage. Deterministic: greedy on the capabilities still uncovered, ties to
 * the earlier page-map entry; `pages` replaces the choice under the same bound and accounting.
 * @returns {{ sample: Array<{ path, status, view, role, entry, contractId, layout, covers: string[] }>, coverage: { bound, manual, capabilities: object[], summary: object } }}
 */
export function selectSample(pageMap, { pages = [], contract = null, discovery = null, darkMark = null, maxPages = MAX_PAGES, needContract = false, referenceKinds = null } = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES) throw new Error(`the sample bound must be 1–${String(MAX_PAGES)} pages`)
  const list = pageList(pageMap)
  const index = new Map(list.map((e, i) => [e.path, i]))
  const { requirements, inventory } = requirementsOf({ list, contract, discovery, darkMark, needContract, referenceKinds })
  let chosen
  if (pages.length) chosen = checkManualPages(list, pages, { maxPages, contract, needContract }).map((e) => e.path)
  else {
    chosen = []
    const open = () => requirements.filter((r) => r.candidates.length && !r.candidates.some((c) => chosen.includes(c)))
    while (chosen.length < maxPages && open().length) {
      const score = new Map()
      for (const r of open()) for (const c of r.candidates) score.set(c, (score.get(c) ?? 0) + 1)
      const best = [...score].sort(([a, x], [b, y]) => y - x || index.get(a) - index.get(b))[0][0]
      chosen.push(best)
    }
    const isContent = (p) => roleOf(list[index.get(p)]) === 'content'
    if (!chosen.some(isContent)) {
      const c = list.filter((e) => roleOf(e) === 'content' && eligible(e, { contract, needContract })).sort(frontFirst)[0]
      if (!c) throw new Error('the page-map has no page that answers 200 to read')
      if (chosen.length >= maxPages) chosen.pop()
      chosen.push(c.path)
    }
  }
  chosen.sort((a, b) => index.get(a) - index.get(b))
  const sample = chosen.map((p) => {
    const e = list[index.get(p)]
    const cp = contractPageOf(contract, p)
    const referenceKind = referenceKinds?.[p] ?? (cp?.pagemapPath ? referenceKinds?.[cp.pagemapPath] : null) ?? (cp?.id ? referenceKinds?.[cp.id] : null) ?? null
    return { path: p, status: declaredStatus(e), view: e.view ?? null, role: roleOf(e), entry: e, contractId: cp?.id ?? null, referenceKind, layout: cp?.layout ?? e.view ?? null, covers: [] }
  })
  const capabilities = []
  for (const r of requirements) {
    const at = sample.find((s) => r.candidates.includes(s.path))
    if (at) {
      at.covers.push(r.id)
      capabilities.push({ id: r.id, gate: r.gate, state: 'covered', page: at.path, reason: r.why })
    } else
      capabilities.push({
        id: r.id,
        gate: r.gate,
        state: 'uncovered',
        page: null,
        reason: !r.candidates.length ? `${r.why}: no page of the page-map can show it${needContract ? ' (among the contract pages)' : ''}` : pages.length ? `${r.why}: none of --pages shows it (candidates ${r.candidates.slice(0, 3).join(', ')})` : `${r.why}: the ${String(maxPages)}-page bound is reached (candidates ${r.candidates.slice(0, 3).join(', ')})`
      })
  }
  capabilities.push(...inventory)
  return { sample, coverage: { bound: maxPages, manual: pages.length > 0, capabilities, summary: summarise(capabilities) } }
}

const summarise = (caps) => Object.fromEntries(['covered', 'uncovered', 'unknown', 'not-applicable'].map((k) => [k, caps.filter((c) => c.state === k).map((c) => c.id)]))

/** A source route's path, the convention layout-boxes and motion share (a Joomla source serves under /index.php). */
export const sourcePathOf = (prefix, route) => (route === '/' ? '/' : (prefix ?? '') + route)
/** A source route's address. */
export const sourceUrlOf = (source, prefix, route) => urlOn(source, sourcePathOf(prefix, route))

/**
 * What http-parity reads when the source serves under a prefix: it fetches each page-map path from
 * --source as written, so the page-map it gets names the SOURCE paths and a pair takes each to the
 * site's path (a declared status travels on both). Null when there is no prefix to carry.
 * @returns {{ pageMap: object, pairs: { pairs: Array<{ from: string, to: string, status?: number }> } } | null}
 */
export function httpParityInputs(pageMap, sample, sourcePrefix) {
  if (!sourcePrefix) return null
  const base = Array.isArray(pageMap) ? {} : pageMap
  const pages = sample.map((s) => {
    const { route: _route, ...e } = s.entry
    return { ...e, path: sourcePathOf(sourcePrefix, s.path) }
  })
  const pairs = sample.filter((s) => sourcePathOf(sourcePrefix, s.path) !== s.path).map((s) => ({ from: sourcePathOf(sourcePrefix, s.path), to: s.path, ...(s.status != null ? { status: s.status } : {}) }))
  return { pageMap: { ...base, pages }, pairs: { pairs } }
}

// ---- the commands ---------------------------------------------------------------------------------

/** Flags the preflight sets for each tool: a --pass may add to a tool's reading, never replace these. */
export const PROTECTED_FLAGS = Object.freeze({
  'visual-qa': ['--contract', '--spec', '--site', '--out', '--pages', '--stage', '--source-site'],
  'layout-boxes': ['--source', '--site', '--routes', '--out', '--source-prefix', '--contract', '--config', '--framework', '--provenance'],
  motion: ['--source', '--site', '--routes', '--out', '--source-prefix'],
  'http-parity': ['--source', '--target', '--routes', '--out', '--no-cache', '--framework', '--provenance'],
  functional: ['--routes', '--out', '--concurrency']
})

/**
 * `--pass tool:--flag=value` → { tool: ['--flag', 'value'] }; `tool:--flag` alone is a bare flag.
 * @param {string[]} passes
 */
export function passArgs(passes) {
  const out = Object.fromEntries(TOOLS.map((t) => [t, []]))
  for (const p of passes) {
    const m = /^([a-z-]+):(--[A-Za-z0-9-]+)(?:=(.*))?$/s.exec(p)
    if (!m || !TOOLS.includes(m[1])) throw new Error(`--pass ${p}: expected <tool>:--flag[=value] with tool one of ${TOOLS.join(', ')}`)
    if (PROTECTED_FLAGS[m[1]].includes(m[2])) throw new Error(`--pass ${p}: the preflight sets ${m[2]} for ${m[1]} itself; a --pass may not replace it`)
    out[m[1]].push(m[2], ...(m[3] !== undefined ? [m[3]] : []))
  }
  return out
}

/**
 * The selector-profile flags the preflight hands layout-boxes and http-parity (lib/framework-selectors.mjs,
 * #66): the contract's `source.framework` (a framework it names none of reads generic landmarks, as
 * `unknown`); nothing for a run with no contract or a contract written before #66 — the tools then say
 * the T4 profile was assumed.
 */
export function selectorArgsOf(contract) {
  const r = selectorProfileOfContract(contract)
  return r.assumed ? [] : ['--framework', r.framework ?? 'unknown']
}

/**
 * The child commands of one preflight, by tool. Pure: what runs is decided here, and tested.
 * `selectorArgs` (selectorArgsOf) go to layout-boxes and http-parity.
 * @returns {Record<string, Array<{ key: string, argv: string[], report: string }>>}
 */
export function toolCommands({ sample, samplePageMap, httpParityRoutes = null, httpParityPairs = null, routePageMaps, site, source, sourcePrefix = '', contract = null, spec = null, sourceSite = null, contractPageIds = [], out, tools = TOOLS, pass = {}, selectorArgs = [] }) {
  const node = process.execPath
  const cmds = {}
  const extra = (t) => pass[t] ?? []
  const content = sample.filter((s) => s.role === 'content')
  if (tools.includes('visual-qa')) {
    const dir = path.join(out, 'visual-qa', 'run')
    cmds['visual-qa'] = [
      {
        key: 'run',
        report: path.join(dir, 'visual.json'),
        argv: [node, path.join(SCRIPTS, 'visual', 'visual-qa.mjs'), '--contract', contract, '--spec', spec, '--site', site, '--out', dir, '--pages', contractPageIds.join(','), '--stage', 'light-desktop', ...(sourceSite ? ['--source-site', sourceSite] : []), ...extra('visual-qa')]
      }
    ]
  }
  const pairedSample = sample.map((s) => ({ s, i: sample.indexOf(s) })).filter(({ s }) => s.referenceKind !== 'none')
  if (tools.includes('layout-boxes') && pairedSample.length) {
    cmds['layout-boxes'] = pairedSample.map(({ s, i }) => ({
      key: s.path,
      report: path.join(out, 'layout-boxes', `route-${String(i)}.json`),
      argv: [node, path.join(SCRIPTS, 'visual', 'layout-boxes.mjs'), '--source', source, '--site', site, '--routes', routePageMaps[i], '--out', path.join(out, 'layout-boxes', `route-${String(i)}.json`), ...(sourcePrefix ? ['--source-prefix', sourcePrefix] : []), ...(contract ? ['--contract', contract] : []), ...selectorArgs, ...extra('layout-boxes')]
    }))
  }
  const pairedContent = content.filter((s) => s.referenceKind !== 'none')
  if (tools.includes('motion') && pairedContent.length) {
    const routes = pairedContent.map((s) => s.path).join(',')
    cmds.motion = [
      {
        key: routes,
        report: path.join(out, 'motion', 'motion.json'),
        argv: [node, path.join(SCRIPTS, 'visual', 'motion.mjs'), '--source', source, '--site', site, '--routes', routes, '--out', path.join(out, 'motion', 'motion.json'), ...(sourcePrefix ? ['--source-prefix', sourcePrefix] : []), ...extra('motion')]
      }
    ]
  }
  if (tools.includes('http-parity') && sample.some((s) => s.referenceKind !== 'none')) {
    cmds['http-parity'] = [
      {
        key: 'run',
        report: path.join(out, 'http-parity', 'http-parity.json'),
        argv: [node, path.join(SCRIPTS, 'http-parity.mjs'), '--source', source, '--target', site, '--routes', httpParityRoutes ?? samplePageMap, ...(httpParityPairs ? ['--pairs', httpParityPairs] : []), '--out', path.join(out, 'http-parity', 'http-parity.json'), '--no-cache', ...selectorArgs, ...extra('http-parity')]
      }
    ]
  }
  if (tools.includes('functional')) {
    cmds.functional = [
      {
        key: 'run',
        report: path.join(out, 'functional', 'functional.json'),
        argv: [node, path.join(SCRIPTS, 'review', 'functional.mjs'), site, '--routes', samplePageMap, '--out', path.join(out, 'functional', 'functional.json'), '--concurrency', '2', ...extra('functional')]
      }
    ]
  }
  return cmds
}

/** The layout-boxes control: the same route compared with itself, on one side. */
export function controlCommand({ side, route, index = 0, routePageMap, site, source, sourcePrefix = '', contract = null, out, pass = {}, selectorArgs = [] }) {
  const origin = side === 'site' ? site : route === '/' ? source : `${source}${sourcePrefix}`
  const report = path.join(out, 'layout-boxes', `control-${String(index)}-${side}.json`)
  // Both sides are the same page; the contract's hooks are the site's, so a source control reads
  // its source hooks through the flags of the same file only when --contract says so.
  return {
    key: `control-${String(index)}-${side}`,
    report,
    argv: [process.execPath, path.join(SCRIPTS, 'visual', 'layout-boxes.mjs'), '--source', origin, '--site', origin, '--routes', routePageMap, '--out', report, ...(contract && side === 'site' ? ['--contract', contract] : []), ...selectorArgs, ...(pass['layout-boxes'] ?? [])]
  }
}

// ---- running a child ------------------------------------------------------------------------------

/** Children still running, so an interrupted preflight takes their process groups down with it. */
const LIVE_CHILDREN = new Set()
/** Set when the run is interrupted: no child is started after it (the run goes on while its browser closes). */
const STOP = { now: false }
const killGroup = (child) => {
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      /* already gone */
    }
  }
}

/**
 * Run one child in its own process group (so a timeout also takes down the Chromium it launched),
 * its stdout/stderr streamed to files. Never throws.
 * @returns {Promise<{ status: number|null, signal: string|null, timedOut: boolean, ms: number, error: string|null, stderrTail: string }>}
 */
export function runTool(argv, { timeoutMs, logDir, name }) {
  mkdirSync(logDir, { recursive: true })
  const t0 = performance.now()
  return new Promise((resolve) => {
    let tail = ''
    let timedOut = false
    let settled = false
    const outLog = createWriteStream(path.join(logDir, `${name}.stdout.log`))
    const errLog = createWriteStream(path.join(logDir, `${name}.stderr.log`))
    let child
    if (STOP.now) {
      outLog.end()
      errLog.end()
      resolve({ status: null, signal: null, timedOut: false, ms: 0, error: 'the preflight was interrupted before this tool started', stderrTail: '' })
      return
    }
    const done = (r) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      LIVE_CHILDREN.delete(child)
      outLog.end()
      errLog.end()
      resolve({ status: null, signal: null, error: null, ...r, timedOut, ms: Math.round(performance.now() - t0), stderrTail: tail.slice(-2000) })
    }
    try {
      child = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    } catch (e) {
      outLog.end()
      errLog.end()
      resolve({ status: null, signal: null, timedOut: false, ms: 0, error: String(e.message), stderrTail: '' })
      return
    }
    LIVE_CHILDREN.add(child)
    child.stdout.pipe(outLog)
    child.stderr.on('data', (d) => {
      errLog.write(d)
      tail = (tail + d).slice(-4000)
    })
    const timer = setTimeout(() => {
      timedOut = true
      killGroup(child)
    }, Math.max(1, timeoutMs))
    child.on('error', (e) => done({ error: String(e.message) }))
    child.on('close', (status, signal) => done({ status, signal }))
  })
}

/** A short read-only command (git, docker inspect): bounded in time and output. Never throws. */
export function execBounded(argv, { timeoutMs = 15000, maxBytes = 1024 * 1024, cwd } = {}) {
  return new Promise((resolve) => {
    let out = ''
    let err = ''
    let timedOut = false
    let child
    if (STOP.now) {
      resolve({ status: null, stdout: '', stderr: '', error: 'the preflight was interrupted' })
      return
    }
    try {
      child = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], detached: true, cwd })
    } catch (e) {
      resolve({ status: null, stdout: '', stderr: '', error: firstLine(e) })
      return
    }
    LIVE_CHILDREN.add(child)
    const cap = (s, d) => (s.length < maxBytes ? s + d : s)
    child.stdout.on('data', (d) => (out = cap(out, d)))
    child.stderr.on('data', (d) => (err = cap(err, d)))
    const timer = setTimeout(() => {
      timedOut = true
      killGroup(child)
    }, timeoutMs)
    const finish = (r) => {
      clearTimeout(timer)
      LIVE_CHILDREN.delete(child)
      resolve({ stdout: out.slice(0, maxBytes), stderr: err.slice(0, 4000), timedOut, ...r })
    }
    child.on('error', (e) => finish({ status: null, error: firstLine(e) }))
    child.on('close', (status) => finish({ status, error: timedOut ? `timed out after ${String(timeoutMs)} ms` : null }))
  })
}

// ---- the census -----------------------------------------------------------------------------------

/**
 * Runs in the page: the plain counts a tool's reading is judged against. Scrolls the page once
 * (reveals are what becomes visible while scrolling), so it runs on its own load. The scroll stops
 * after 250 steps: a page that grows while it is scrolled is read to that depth, not forever.
 */
async function censusInPage() {
  const chrome = 'header, nav, footer, aside, [role="banner"], [role="navigation"], [role="contentinfo"]'
  const slides = '[class*="carousel"], [class*="swiper"], [class*="slick"], [class*="owl-"], [class*="splide"], [role="tabpanel"], [role="dialog"], [aria-hidden="true"]'
  const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const shown = (el) => {
    if (!el.getClientRects().length) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  // reveal candidates: transparent at load, drawn, holding words or a picture, not in chrome or a slider
  const hidden = [...document.body.querySelectorAll('*')].filter(
    (el) => !el.closest(chrome) && !el.closest(slides) && shown(el) && box(el) && Number.parseFloat(getComputedStyle(el).opacity) < 0.1 && (clean(el.textContent) || el.querySelector('img, svg, picture'))
  )
  const outer = hidden.filter((el) => !hidden.some((o) => o !== el && o.contains(el)))
  for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 250; y += 400, i += 1) {
    scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 60))
  }
  await new Promise((r) => setTimeout(r, 1200))
  const revealed = outer.filter((el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) if (Number.parseFloat(getComputedStyle(n).opacity) < 0.5) return false
    return true
  }).length
  scrollTo(0, 0)
  const visible = (el) => shown(el) && box(el) && !el.closest(chrome) && Number.parseFloat(getComputedStyle(el).opacity) > 0
  const headings = [...document.querySelectorAll('h1, h2, h3')].filter(visible).map((h) => clean(h.textContent)).filter(Boolean)
  const texts = [...document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, blockquote, figcaption, dt, dd')].filter(visible).map((e) => clean(e.textContent)).filter((t) => t.split(' ').length >= 2)
  const links = new Set(
    [...document.querySelectorAll('a[href]')]
      .map((a) => {
        try {
          const u = new URL(a.href, location.href)
          u.hash = ''
          return u.origin === location.origin && /^https?:$/.test(u.protocol) ? u.href : null
        } catch {
          return null
        }
      })
      .filter(Boolean)
  )
  return { headings, texts: [...new Set(texts)], links: links.size, reveals: { hidden: outer.length, revealed } }
}

/** The census of the sample: each route on both sides, read once. Never throws; a failed read is `error`. */
async function takeCensus(browser, { sample, site, source, sourcePrefix = '', timeoutMs = 90000 }) {
  const read = (url) =>
    withTimeout(
      withPage(browser, { viewport: { width: 1440, height: 900 } }, async (page) => {
        let res
        try {
          res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
        } catch (e) {
          return { url, status: 0, error: String(e.message).split('\n')[0] }
        }
        return { url, status: res?.status() ?? 0, ...(await page.evaluate(censusInPage)) }
      }),
      timeoutMs,
      `census ${url}`
    ).catch((e) => ({ url, status: 0, error: String(e.message).split('\n')[0] }))
  const out = {}
  for (const s of sample) {
    const [src, dst] = s.referenceKind === 'none'
      ? [{ url: null, status: null, notApplicable: true, reason: 'reference.kind=none' }, await read(urlOn(site, s.path))]
      : await Promise.all([read(sourceUrlOf(source, sourcePrefix, s.path)), read(urlOn(site, s.path))])
    const shared = (a, b) => (a && b ? a.filter((t) => b.includes(t)).length : 0)
    out[s.path] = { source: src, site: dst, sharedHeadings: shared(src.headings, dst.headings), sharedTexts: shared(src.texts, dst.texts) }
  }
  return out
}

// ---- in the page: what the capability scan and the probes read -----------------------------------

/** Reveal candidates, the census's rule: transparent at load, drawn, holding words or a picture, outside chrome and sliders. */
function revealCandidatesInPage(chrome, slides) {
  const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim()
  const shown = (el) => {
    if (!el.getClientRects().length) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const hidden = [...document.body.querySelectorAll('*')].filter((el) => !el.closest(chrome) && !el.closest(slides) && shown(el) && box(el) && Number.parseFloat(getComputedStyle(el).opacity) < 0.1 && (clean(el.textContent) || el.querySelector('img, svg, picture')))
  return hidden.filter((el) => !hidden.some((o) => o !== el && o.contains(el)))
}

/** Toggles over a region hidden now: `<details>`, `aria-controls`, Bootstrap collapse/tab. In document order. */
function findTogglesInPage(chrome, max) {
  const out = []
  const seen = new Set()
  const hiddenNow = (el) => !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden' || el.getBoundingClientRect().height === 0
  const push = (trigger, region, key) => {
    if (!region || seen.has(region) || out.length >= max || trigger.closest(chrome) || !trigger.getClientRects().length || !hiddenNow(region)) return
    seen.add(region)
    out.push({ trigger, region, key })
  }
  const all = [...document.querySelectorAll('details:not([open]) > summary, [aria-expanded="false"][aria-controls], [data-bs-toggle="collapse"], [data-bs-toggle="tab"], [data-toggle="collapse"], [data-toggle="tab"]')]
  for (const t of all) {
    if (t.tagName === 'SUMMARY') {
      const d = t.parentElement
      push(t, [...d.children].find((c) => c !== t) ?? null, `details#${String([...document.querySelectorAll('details')].indexOf(d))}`)
      continue
    }
    const id = (t.getAttribute('aria-controls') || t.getAttribute('data-bs-target') || t.getAttribute('data-target') || t.getAttribute('href') || '').replace(/^#/, '')
    if (!/^[A-Za-z][\w:.-]*$/.test(id)) continue
    push(t, document.getElementById(id), `#${id}`)
  }
  return out
}

/** The animation libraries a page carries, and the reveals no recognised library explains. */
function librariesInPage(chrome, slides, revealCandidates) {
  const outside = (el) => !el.closest(chrome)
  const count = (sel) => {
    try {
      return [...document.querySelectorAll(sel)].filter(outside).length
    } catch {
      return 0
    }
  }
  const libraries = []
  const lib = (id, recognised, n, evidence) => {
    if (n > 0 && !libraries.some((l) => l.id === id)) libraries.push({ id, recognised, count: n, evidence })
  }
  const tracyRoot = document.documentElement.classList.contains('tracy-motion')
  lib('aos', true, count('[data-aos]'), '[data-aos]')
  lib('wow', true, count('.wow'), '.wow')
  lib('animate.css', true, count('.animate__animated'), '.animate__animated')
  lib('tracy', true, count('.tracy-motion-reveal') + (tracyRoot ? 1 : 0), tracyRoot ? 'html.tracy-motion' : '.tracy-motion-reveal')
  for (const [g, id] of [['gsap', 'gsap'], ['ScrollTrigger', 'gsap'], ['TweenMax', 'gsap'], ['ScrollReveal', 'scrollreveal'], ['LocomotiveScroll', 'locomotive'], ['anime', 'anime'], ['Waypoint', 'waypoints'], ['skrollr', 'skrollr'], ['lax', 'lax'], ['sal', 'sal']])
    if (window[g]) lib(id, false, 1, `window.${g}`)
  for (const [sel, id] of [['[data-sal]', 'sal'], ['[data-scroll-section], [data-scroll]', 'locomotive'], ['[data-sr-id]', 'scrollreveal'], ['[data-animate]', 'data-animate'], ['[data-animation]', 'data-animation']]) lib(id, false, count(sel), sel)
  const marks = '[data-aos], .wow, .animate__animated, .tracy-motion-reveal'
  const outer = revealCandidates(chrome, slides)
  const explained = (el) => Boolean(el.closest(marks) || el.querySelector(marks) || (tracyRoot && el.closest('main')))
  lib('unrecognised-reveal', false, outer.filter((el) => !explained(el)).length, 'elements transparent at load that no recognised library marks')
  return { libraries, reveals: { hidden: outer.length } }
}

/**
 * The media rules that set the width of each target container, read through the browser's CSS
 * object model (`@import`, `@supports`, `@layer` and nesting walked; a cross-origin sheet the page
 * cannot read is parsed again from its captured bytes with `new CSSStyleSheet().replaceSync`).
 * `@container` rules are listed as unsupported — a container query is not a viewport width — and a
 * width one of them sets on a target is that target's `queries`, so its gate names it. An `@import`
 * whose sheet did not load, and a scan stopped at `maxRules`, are reported (`unreadable`, `truncated`).
 */
export function cssScanInPage(o) {
  const targets = []
  const add = (item, selector, heuristic = false) => {
    let el = null
    try {
      el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length) ?? null
    } catch {
      targets.push({ item, selector, el: null, heuristic, error: 'not a valid selector' })
      return
    }
    targets.push({ item, selector, el, heuristic })
  }
  for (const t of o.targets) add(t.item, t.selector)
  if (o.heuristic) {
    const seen = new Set()
    for (const el of document.querySelectorAll('[class*="container"]')) {
      const c = [...el.classList].find((x) => /^container(-[a-z0-9]+)?$/.test(x))
      if (!c || seen.has(c) || seen.size >= 4 || !el.getClientRects().length || el.closest(o.chrome)) continue
      seen.add(c)
      add(`.${c}`, `.${c}`, true)
    }
  }
  const rules = targets.map(() => [])
  const queries = targets.map(() => [])
  // what a target's lists could not keep is counted, so its gate names it
  const dropped = targets.map(() => ({ rules: 0, queries: 0 }))
  const unsupported = []
  const unreadable = []
  let scanned = 0
  let truncated = false
  const props = ['width', 'max-width', 'min-width']
  // an empty sheet is a failed load when the resource timing of its URL shows no successful answer
  const notLoaded = (list, url) => {
    if (list.length) return false
    const entry = performance.getEntriesByName(url).at(-1)
    return !(entry?.responseStatus >= 200 && entry.responseStatus < 400)
  }
  const abs = (h, base) => {
    try {
      return new URL(h, base && base !== '(inline)' ? base : document.baseURI).href
    } catch {
      return String(h)
    }
  }
  const walk = (list, conds, href, container = null) => {
    for (const r of list) {
      if (scanned >= o.maxRules) {
        truncated = true
        return
      }
      scanned += 1
      if (r instanceof CSSImportRule) {
        const url = abs(r.href, href)
        let list = null
        try {
          list = r.styleSheet ? r.styleSheet.cssRules : null
        } catch {
          list = null
        }
        // an @import whose sheet never loaded (the browser keeps an empty sheet for it) or cannot be
        // read: its rules exist for the site's visitors, not for this scan
        if (!list || notLoaded(list, url)) unreadable.push(url)
        else walk(list, [...conds, ...(r.media?.mediaText ? [r.media.mediaText] : [])], r.styleSheet.href ?? href, container)
        continue
      }
      if (r instanceof CSSMediaRule) {
        walk(r.cssRules, [...conds, r.media.mediaText], href, container)
        continue
      }
      if (typeof CSSContainerRule !== 'undefined' && r instanceof CSSContainerRule) {
        unsupported.push({ kind: 'container-query', condition: r.conditionText, href })
        walk(r.cssRules, conds, href, r.conditionText)
        continue
      }
      if (r instanceof CSSStyleRule) {
        const set = props.filter((p) => r.style.getPropertyValue(p))
        if ((conds.length || container !== null) && set.length)
          targets.forEach((t, i) => {
            if (!t.el) return
            let hit = false
            try {
              hit = t.el.matches(r.selectorText)
            } catch {
              hit = false
            }
            if (!hit) return
            if (container !== null) {
              if (queries[i].length >= 50) dropped[i].queries += 1
              else queries[i].push({ container, conditions: conds, selector: r.selectorText.slice(0, 300), properties: Object.fromEntries(set.map((p) => [p, r.style.getPropertyValue(p)])), href })
            } else if (rules[i].length >= 200) dropped[i].rules += 1
            else rules[i].push({ conditions: conds, selector: r.selectorText.slice(0, 300), properties: Object.fromEntries(set.map((p) => [p, r.style.getPropertyValue(p)])), href })
          })
        if (r.cssRules?.length) walk(r.cssRules, conds, href, container)
        continue
      }
      if (r.cssRules) walk(r.cssRules, conds, href, container)
    }
  }
  for (const s of document.styleSheets) {
    let list
    try {
      list = s.cssRules
    } catch {
      unreadable.push(s.href)
      continue
    }
    if (s.href && notLoaded(list, s.href)) {
      unreadable.push(s.href)
      continue
    }
    walk(list, s.media?.mediaText ? [s.media.mediaText] : [], s.href ?? '(inline)')
  }
  // a <link rel=stylesheet> the browser holds no sheet for did not load
  for (const l of document.querySelectorAll('link[rel~="stylesheet" i]')) if (!l.sheet && !l.disabled && l.href) unreadable.push(l.href)
  for (const x of o.extra ?? []) {
    const at = unreadable.indexOf(x.href)
    if (at < 0) continue
    try {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(x.text)
      walk(sheet.cssRules, [], x.href)
      unreadable.splice(at, 1)
    } catch {
      /* stays unreadable */
    }
  }
  return { targets: targets.map((t, i) => ({ item: t.item, selector: t.selector, found: Boolean(t.el), error: t.error ?? null, heuristic: t.heuristic, rules: rules[i], queries: queries[i], dropped: dropped[i] })), unsupported: unsupported.slice(0, 50), unsupportedTotal: unsupported.length, unreadable: [...new Set(unreadable.filter(Boolean))], scanned, truncated }
}

/** The dark state through `check` (attr:/class: marks) and the colours it paints. */
function darkReadInPage(check, hookStateFn) {
  const cs = getComputedStyle(document.body)
  return { applied: hookStateFn(check), bg: cs.backgroundColor, color: cs.color, rootBg: getComputedStyle(document.documentElement).backgroundColor }
}

async function scrollThroughInPage(step, maxSteps, pauseMs) {
  for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < maxSteps; y += step, i += 1) {
    scrollTo(0, y)
    await new Promise((r) => setTimeout(r, pauseMs))
  }
  scrollTo(0, 0)
}

/**
 * Scroll reveals (the census's count) and toggles clicked open one by one. The count waits for the
 * entrances already playing in the first viewport to end: counted mid-transition, the same page read
 * twice gave 45 and 44 (JA Vega :8262, 28/09). After the scroll it waits again, for the reveals the
 * scroll set off to SETTLE — every candidate's opacity the same over consecutive samples and nothing in
 * it animating, within `revealSettleMs` — so a reveal still fading in (a delayed entrance) is not read
 * half-way on one read and whole on the next. Each candidate is kept by a selector path, its first
 * words, the opacity it ends at (the lowest on its way up to the root) and whether it counts revealed,
 * so a control that differs names the element and its two readings (hiddenFindings).
 */
async function hiddenInPage(o, revealCandidates, findToggles) {
  await new Promise((r) => setTimeout(r, o.settleMs))
  const outer = revealCandidates(o.chrome, o.slides)
  for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < o.maxSteps; y += 400, i += 1) {
    scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 60))
  }
  await new Promise((r) => setTimeout(r, 1200))
  const opacityOf = (el) => {
    let min = 1
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) min = Math.min(min, Number.parseFloat(getComputedStyle(n).opacity))
    return min
  }
  const moving = () => outer.some((el) => el.isConnected && el.getAnimations({ subtree: true }).some((a) => (a.playState === 'running' || a.playState === 'pending') && a.effect?.getComputedTiming().endTime !== Infinity))
  const started = performance.now()
  let last = null
  let settled = false
  for (;;) {
    const now = outer.map(opacityOf).join(',')
    if (now === last && !moving()) {
      settled = true
      break
    }
    if (performance.now() - started >= o.revealSettleMs) break
    last = now
    await new Promise((r) => setTimeout(r, 100))
  }
  const waitedMs = Math.round(performance.now() - started)
  const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim()
  const pathOf = (el) => {
    const parts = []
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n.id && document.querySelectorAll(`#${CSS.escape(n.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(n.id)}`)
        break
      }
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [n]
      parts.unshift(`${n.tagName.toLowerCase()}${same.length > 1 ? `:nth-of-type(${String(same.indexOf(n) + 1)})` : ''}`)
    }
    return parts.join(' > ').slice(-300)
  }
  const elements = outer.slice(0, o.maxElements).map((el) => {
    const opacity = opacityOf(el)
    return { selector: pathOf(el), words: clean(el.textContent).slice(0, 80), opacity: Math.round(opacity * 100) / 100, revealed: opacity >= 0.5 }
  })
  const revealed = outer.filter((el) => opacityOf(el) >= 0.5).length
  scrollTo(0, 0)
  const shownRegion = (el) => el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().height > 0
  const toggles = []
  for (const t of findToggles(o.chrome, o.maxToggles)) {
    t.trigger.click()
    await new Promise((r) => setTimeout(r, 450))
    toggles.push({ key: t.key, revealed: shownRegion(t.region) })
  }
  return { scroll: { hidden: outer.length, revealed, settled, waitedMs, elements, more: Math.max(0, outer.length - elements.length) }, toggles }
}

/** The width of each container, the first visible match of its selector (null: none on the page). */
function containerWidthsInPage(targets) {
  const out = {}
  for (const t of targets) {
    let el = null
    try {
      el = [...document.querySelectorAll(t.selector)].find((e) => e.getClientRects().length) ?? null
    } catch {
      el = null
    }
    out[t.item] = el ? Math.round(el.getBoundingClientRect().width * 100) / 100 : null
  }
  return out
}

/** The heading motion pairs the element marked by a defect with (lib/motion measureMotionInPage's `near`). */
function nearOfDefectInPage() {
  const el = document.querySelector('[data-preflight-defect]')
  if (!el) return null
  const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80)
  let best = null
  for (const h of [...document.querySelectorAll('h1,h2,h3')].filter((x) => !x.closest('header, footer, nav'))) {
    if (h === el || h.contains(el) || el.contains(h)) return clean(h.textContent)
    if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = h
  }
  return best ? clean(best.textContent) : '(top)'
}

/** `page.evaluate` of a function with JSON arguments and helper functions after them. */
const callInPage = (page, fn, args = [], helpers = []) => page.evaluate(`(${String(fn)})(${[...args.map((a) => JSON.stringify(a)), ...helpers.map(String)].join(', ')})`)

// ---- the defects: each injected into one isolated browser context ----------------------------------

const STYLE = (css, mark) => `(() => { const add = () => { const s = document.createElement('style'); s.setAttribute('data-preflight-defect', ${JSON.stringify(mark)}); s.textContent = ${JSON.stringify(css)}; (document.head || document.documentElement).append(s) }; if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add, { once: true }); else add() })();`
export const DEFECTS = Object.freeze({
  /**
   * The heading whose words are `words` drawn 12 px larger (its words carrier too), found by the lists
   * layout-boxes reads (`measure`, measureOf a selector profile; the T4 lists by default).
   */
  layout: (words, measure = MEASURE) =>
    `addEventListener('load', () => { const clean = (t) => t.replace(/\\s+/g, ' ').trim().toLowerCase(); for (const h of document.querySelectorAll(${JSON.stringify(measure.headings)})) { if (h.closest(${JSON.stringify(measure.chrome)}) || clean(h.textContent) !== ${JSON.stringify(words)}) continue; const px = Number.parseFloat(getComputedStyle(h).fontSize) + 12; for (const n of [h, ...h.querySelectorAll('*')]) n.style.setProperty('font-size', px + 'px', 'important'); h.setAttribute('data-preflight-defect', 'layout'); break } })`,
  /** The dark mark taken off the first time the page scrolls, as a theme script that runs late does. */
  dark: (check) =>
    `addEventListener('scroll', () => { for (const part of ${JSON.stringify(check)}.split('+')) { const [kind, spec] = part.split(':'); if (kind === 'attr') document.documentElement.removeAttribute(spec.split('=')[0]); if (kind === 'class') document.documentElement.classList.remove(spec) } document.documentElement.setAttribute('data-preflight-defect', 'dark') }, { once: true, capture: true })`,
  /** One element's library markers stripped before the library starts. */
  motion: (lib) =>
    `addEventListener('DOMContentLoaded', () => { const el = [...document.querySelectorAll(${JSON.stringify(RECOGNISED_LIBRARIES[lib].selector)})].find((e) => !e.closest(${JSON.stringify(CHROME)})); if (!el) return; ${RECOGNISED_LIBRARIES[lib].strip}; el.setAttribute('data-preflight-defect', 'motion') }, { once: true, capture: true })`,
  /** Every element transparent at load held transparent. */
  scroll: () =>
    `addEventListener('load', () => { const outer = (${String(revealCandidatesInPage)})(${JSON.stringify(CHROME)}, ${JSON.stringify(SLIDES)}); for (const el of outer) el.setAttribute('data-preflight-defect', 'hidden'); const s = document.createElement('style'); s.textContent = '[data-preflight-defect="hidden"]{opacity:0!important;transition:none!important;animation:none!important}'; document.head.append(s) })`,
  /** The region of the `index`-th toggle kept hidden when it is opened. */
  toggle: (index) =>
    `addEventListener('load', () => { const t = (${String(findTogglesInPage)})(${JSON.stringify(CHROME)}, ${String(BOUNDS.toggles)})[${String(index)}]; if (!t) return; t.region.setAttribute('data-preflight-defect', 'toggle'); const s = document.createElement('style'); s.textContent = '[data-preflight-defect="toggle"]{display:none!important}'; document.head.append(s) })`,
  /** One container narrowed at exactly one viewport width. */
  container: (selector, width, px) => STYLE(`@media (width: ${String(width)}px) { ${selector} { max-width: ${String(px)}px !important; } }`, 'container')
})

/**
 * What the CSS scan of one page could not establish about one target's width. Pure. A `@container`
 * rule setting its width, a scan stopped at its rule bound, and a stylesheet it could not read each
 * leave widths the probe would not step through: they are named so the target's gate is not certified.
 */
export function targetGaps(target, css, maxRules = BOUNDS.cssRules) {
  const gaps = []
  for (const q of target.queries ?? []) gaps.push(`@container ${q.container}: ${q.selector} sets ${Object.keys(q.properties).join('/')} by a container query, not a viewport width`)
  if (css.truncated) gaps.push(`the rule scan stopped at ${String(maxRules)} rules: a later rule may set this width`)
  if (target.dropped?.rules) gaps.push(`${String(target.dropped.rules)} media rule(s) setting its width beyond the 200 kept for it: their conditions were not read`)
  if (target.dropped?.queries) gaps.push(`${String(target.dropped.queries)} @container rule(s) setting its width beyond the 50 kept for it`)
  if (css.unreadable?.length) gaps.push(`stylesheet(s) not read: ${css.unreadable.slice(0, 3).join(', ')}`)
  return gaps
}

// ---- boundaries of a media condition ----------------------------------------------------------------

/**
 * The viewport widths at which media conditions change truth, from the conditions the CSS object
 * model reports. Pure. `(min-width: 576px)` / `(width >= 576px)` → 576; `(max-width: 767.98px)` /
 * `(width < 768px)` → 768 (the first whole width at which the rule stops applying). Thresholds in
 * em/rem, negated queries, device widths and aspect ratios are returned as `unsupported`, never guessed.
 */
export function boundariesOf(conditions) {
  const boundaries = new Set()
  const unsupported = []
  const LEN = '([\\d.]+)(px|em|rem|[a-z]+)?'
  for (const text of conditions ?? []) {
    for (const q of String(text).split(',')) {
      const t = q.trim().toLowerCase()
      if (!t || t === 'all' || t === 'screen' || t === 'only screen') continue
      if (/^(only\s+)?print\b/.test(t)) continue
      if (/^not\b/.test(t)) {
        if (/width/.test(t)) unsupported.push(`${t}: a negated width query`)
        continue
      }
      if (/device-width|aspect-ratio/.test(t)) {
        unsupported.push(`${t}: a device width or aspect ratio is not a viewport width`)
        continue
      }
      const found = []
      let read = false
      const push = (op, v, unit) => {
        read = true
        if (unit && unit !== 'px') return unsupported.push(`${t}: a threshold in ${unit}`)
        const x = Number(v)
        if (!Number.isFinite(x)) return unsupported.push(`${t}: ${v} is not a number`)
        found.push(op === '>=' || op === '<' ? Math.ceil(x) : Math.floor(x) + 1)
      }
      for (const m of t.matchAll(new RegExp(`\\(\\s*(min-width|max-width)\\s*:\\s*${LEN}\\s*\\)`, 'g'))) push(m[1] === 'min-width' ? '>=' : '<=', m[2], m[3])
      for (const m of t.matchAll(new RegExp(`\\(\\s*width\\s*(>=|<=|>|<)\\s*${LEN}\\s*\\)`, 'g'))) push(m[1], m[2], m[3])
      const flip = { '<=': '>=', '<': '>', '>=': '<=', '>': '<' }
      for (const m of t.matchAll(new RegExp(`\\(\\s*${LEN}\\s*(>=|<=|>|<)\\s*width\\s*\\)`, 'g'))) push(flip[m[3]], m[1], m[2])
      for (const m of t.matchAll(new RegExp(`\\(\\s*${LEN}\\s*(<=|<)\\s*width\\s*(<=|<)\\s*${LEN}\\s*\\)`, 'g'))) {
        push(flip[m[3]], m[1], m[2])
        push(m[4], m[5], m[6])
      }
      if (!read && /\bwidth\b/.test(t)) unsupported.push(`${t}: a width condition the preflight does not read`)
      for (const b of found) boundaries.add(b)
    }
  }
  return { boundaries: [...boundaries].sort((a, b) => a - b), unsupported: [...new Set(unsupported)] }
}

/** Widths just below, at and just above each boundary, inside the widths a browser is driven at. */
export const probeWidths = (boundaries) => [...new Set(boundaries.flatMap((b) => [b - 1, b, b + 1]))].filter((w) => w >= 240 && w <= 3840).sort((a, b) => a - b)

// ---- control and defect verdicts ---------------------------------------------------------------------

/** Bounds of what a certification reason quotes of a finding: its fields, and the findings named. */
export const REASON_BOUNDS = Object.freeze({ field: 600, findings: 3 })

/**
 * Text read from a page or a finding, made safe to quote in a reason: control and line-separator
 * characters become spaces, runs of space one, and it is cut at `max` characters (marked `…`). Not
 * Markdown-escaped — formatMarkdown escapes what it writes.
 */
export function reasonText(v, max = REASON_BOUNDS.field) {
  const t = String(v ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? `${t.slice(0, Math.max(0, max - 1))}…` : t
}

/**
 * The findings a reason names: detector, measurement and — when the finding carries one — its detail
 * (the two readings), at most `REASON_BOUNDS.findings` of them and a count of the rest. A finding
 * that is not an object is named as unreadable, never dropped.
 */
export function namedFindings(findings) {
  const list = Array.isArray(findings) ? findings : []
  const one = (f) => {
    if (!f || typeof f !== 'object') return '(an unreadable finding)'
    const detail = reasonText(f.detail)
    return `${reasonText(f.detector, 80) || '(no detector)'} ${reasonText(f.measurement, 160) || '(no measurement)'}${detail ? ` (${detail})` : ''}`
  }
  const shown = list.slice(0, REASON_BOUNDS.findings).map(one)
  return `${shown.join(', ')}${list.length > shown.length ? `, and ${String(list.length - shown.length)} more` : ''}`
}

/**
 * Whether a capability's controls hold. Pure. `control`: the findings of each side read against
 * itself (must be none); `defect`: `{ injected, findings }` of the side with the defect; `expect`:
 * `{ detector, measurement, related? }` — the finding the defect must produce. A finding of the
 * detector at a `related` measurement is a consequence of the same defect; anything else is unrelated.
 * `page` is the sample page read. A control that is not clean names the page, the side, and each
 * difference with its two readings (namedFindings) — a code alone sends nobody to the element.
 */
export function certifyControl({ control = {}, defect = null, expect = null, page = null }) {
  const reasons = []
  const on = page != null ? ` on ${reasonText(page, 200)}` : ''
  for (const [side, c] of Object.entries(control)) {
    if (!c || c.error) reasons.push(`control-not-measured: the ${side} read against itself did not load${on} (${reasonText(c?.error ?? 'no reading')})`)
    else if (c.unsettled) reasons.push(`control-not-measured: the ${side} read against itself never settled${on} (${reasonText(c.unsettled)})`)
    else if (!Array.isArray(c.findings)) reasons.push(`control-not-measured: the ${side} read against itself gave no readable findings${on}`)
    else if (c.findings.length) reasons.push(`control-not-clean: the ${side} read against itself differs${on} at ${namedFindings(c.findings)}`)
  }
  if (!Object.keys(control).length) reasons.push('control-missing: no self-comparison ran')
  if (!defect) reasons.push('defect-missing: no defect was injected')
  else if (defect.notInjectable) reasons.push(`defect-not-injectable: ${defect.notInjectable}`)
  else if (defect.error) reasons.push(`defect-not-measured: ${defect.error}`)
  else if (!defect.injected) reasons.push('defect-not-injected: the page carried no element to inject into')
  else if (!expect?.detector || expect.measurement == null) reasons.push('defect-unlocated: the injected defect has no measurement to look for')
  else if (!Array.isArray(defect.findings)) reasons.push('defect-not-measured: the reading with the defect gave no readable findings')
  else {
    const hit = (f) => f?.detector === expect.detector && f?.measurement === expect.measurement
    const related = (f) => f?.detector === expect.detector && (expect.related ?? []).includes(f?.measurement)
    if (!defect.findings.some(hit)) reasons.push(`defect-missed: ${expect.detector} did not report ${expect.measurement}${defect.findings.length ? ` (it reported ${namedFindings(defect.findings)})` : ''}`)
    const other = defect.findings.filter((f) => !hit(f) && !related(f))
    if (other.length) reasons.push(`defect-unrelated: besides the defect, ${namedFindings(other)}`)
  }
  return { certified: !reasons.length, reasons }
}

// ---- the probes ---------------------------------------------------------------------------------------

/**
 * A resource log: the documents and stylesheets the source served and the font files either side
 * loaded, each hashed (bounded in size and number). What could not be hashed is listed, never dropped.
 * The size bound holds before a body is read: a declared Content-Length over it, and then the bytes
 * the network actually delivered (`request.sizes()`, known for a chunked response without a
 * Content-Length), stop the read. Those are the bytes of the body only when it was not encoded: a
 * recorded page asks for `Accept-Encoding: identity`, and a body served compressed anyway (whose
 * decoded size nothing bounds before `body()` holds all of it) is never read — it stays unresolved.
 * Each entry keeps the HTTP statuses it was served with next to its hashes.
 */
export function resourceLog({ maxBytes = BOUNDS.resourceBytes, maxEntries = BOUNDS.resources } = {}) {
  const entries = new Map()
  const unresolved = []
  const texts = new Map()
  const faces = { source: new Set(), site: new Set() }
  const families = { source: new Set(), site: new Set() }
  return {
    entries,
    unresolved,
    texts,
    faces,
    families,
    /** Listen on a page; returns `settle()`, which waits for the bodies still being read. */
    attach(page, side) {
      const pending = []
      page.on('response', (r) => {
        const type = r.request().resourceType()
        const wanted = type === 'font' || (side === 'source' && (type === 'stylesheet' || (type === 'document' && r.frame() === page.mainFrame())))
        // a redirect has no body to hash; an error page's document does (the declared 404 is a source page)
        if (!wanted || (r.status() >= 300 && r.status() < 400)) return
        const key = `${side} ${type} ${r.url()}`
        const enc = String(r.headers()['content-encoding'] ?? '').trim().toLowerCase()
        if (enc && enc !== 'identity') return void unresolved.push(`${key}: served ${enc}-encoded although identity was asked — its decoded size is not bounded before the read, so it is not read`)
        const len = Number(r.headers()['content-length'] ?? 0)
        if (len > maxBytes) return void unresolved.push(`${key}: ${String(len)} bytes, beyond the ${String(maxBytes)}-byte bound`)
        const sized = async () => {
          const got = await r.request().sizes()
          if (!Number.isFinite(got?.responseBodySize)) throw new Error('the size of the body is not known')
          if (got.responseBodySize > maxBytes) throw Object.assign(new Error(`${String(got.responseBodySize)} bytes delivered, beyond the ${String(maxBytes)}-byte bound`), { bound: true })
          return r.body()
        }
        pending.push(
          sized().then(
            (buf) => {
              if (buf.length > maxBytes) return void unresolved.push(`${key}: ${String(buf.length)} bytes, beyond the bound`)
              const h = sha256(buf)
              // a source document is identified by policy (source-identity.mjs), the raw digest is kept beside it
              const id = sourceIdentity(buf, { html: side === 'source' && type === 'document' && /\bhtml\b/i.test(String(r.headers()['content-type'] ?? '')) })
              const status = r.status()
              const e = entries.get(key)
              if (e) {
                if (!e.sha256s.includes(h)) e.sha256s.push(h)
                if (!e.identities.some((x) => sameIdentity(x, id))) e.identities.push(id)
                if (!e.statuses.includes(status)) e.statuses.push(status)
                return
              }
              if (entries.size >= maxEntries) return void unresolved.push(`${key}: beyond the ${String(maxEntries)}-resource bound`)
              entries.set(key, { side, type, url: r.url(), sha256s: [h], identities: [id], statuses: [status], bytes: buf.length })
              if (type === 'stylesheet' && buf.length <= 4 * 1024 * 1024) texts.set(r.url(), buf.toString('utf8'))
            },
            (e) => unresolved.push(e.bound ? `${key}: ${firstLine(e)}` : `${key}: body not read (${firstLine(e)})`)
          )
        )
      })
      return () => withTimeout(Promise.allSettled(pending), 15000, 'resource bodies').catch(() => unresolved.push(`${side} ${page.url()}: resource bodies not read within 15 s`))
    },
    async fonts(page, side) {
      const f = await page.evaluate(() => ({
        faces: [...document.fonts].filter((x) => x.status === 'loaded').map((x) => `${x.family.replace(/["']/g, '')}|${x.weight}|${x.style}`),
        families: ['body', 'h1', 'h2', 'h3', 'p', 'a', 'button'].map((s) => document.querySelector(s)).filter(Boolean).map((e) => getComputedStyle(e).fontFamily)
      }))
      for (const x of f.faces) faces[side].add(x)
      for (const x of f.families) families[side].add(x)
    }
  }
}

/**
 * Load one page in its own context and read it. Never throws: a page that did not load, redirected
 * out of its origin, or ran past the deadline is `{ error }`.
 */
async function visit(ctx, url, o, fn) {
  const left = ctx.deadline - Date.now()
  if (left <= 1000) return { error: 'the preflight time budget was spent before this page was read' }
  const { side, theme = 'light', viewport = { width: 1440, height: 900 }, initScripts = [], route = null, record = false } = o
  const h = ctx.hooks
  const opts = { viewport, theme, hookUrl: url, initScripts, ...(theme === 'dark' ? { darkHook: h.dark, darkRequestHook: h.dark } : { lightHook: h.light[side] ?? null }) }
  const mark = { hit: false }
  return withTimeout(
    withPage(ctx.browser, opts, async (page, context) => {
      if (route) await context.route((u) => u.href === url, (r) => route(r, mark))
      // bytes that are hashed are asked for unencoded, so the size the network delivered bounds them
      if (record) await context.setExtraHTTPHeaders({ 'accept-encoding': 'identity' })
      const settle = record ? ctx.log.attach(page, side) : null
      let res
      try {
        res = await page.goto(url, { waitUntil: 'load', timeout: Math.min(60000, left) })
      } catch (e) {
        return { error: firstLine(e) }
      }
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
      const at = new URL(page.url())
      if (at.origin !== new URL(url).origin) return { error: `redirected out of the measured origin, to ${at.origin}`, status: res?.status() ?? 0 }
      // the bytes the page loaded are read before it is measured (the capability scan re-parses
      // cross-origin stylesheets from them), and again after (fonts the measurement made it load)
      if (record) await settle()
      const reading = { status: res?.status() ?? 0, ...(await fn(page)) }
      if (route) reading.injected = mark.hit
      else if (o.marker) reading.injected = await page.evaluate(() => Boolean(document.querySelector('[data-preflight-defect]')))
      if (o.locate) reading.located = await o.locate(page)
      if (record) {
        await ctx.log.fonts(page, side).catch(() => {})
        await settle()
      }
      return reading
    }),
    Math.min(ctx.probeTimeoutMs, left),
    `probe ${url}`
  ).catch((e) => ({ error: firstLine(e) }))
}

/**
 * Real reading, controls and defects of one probe on one sample page. `measure(page)` is the
 * routine; `compare(a, b)` the detector; `real(src, site)` the findings kept for the report.
 * `unsettled(reading)` names why a reading that loaded cannot be trusted (null: it can): a control or
 * a defect compared with such a reading is not measured — counts that agree between two readings that
 * never settled prove nothing.
 */
export async function runProbe(ctx, s, { kind, caps, sides = ['source', 'site'], load = () => ({}), measure, compare, real, controlSides = ['site'], defects = () => [], unsettled = () => null }) {
  const untrusted = (pairs) =>
    pairs
      .map(([which, r]) => [which, unsettled(r)])
      .filter(([, why]) => why)
      .map(([which, why]) => `the ${which} reading ${reasonText(why, 200)}`)
      .join('; ')
  const url = { source: s.referenceKind === 'none' ? null : sourceUrlOf(ctx.source, ctx.sourcePrefix, s.path), site: urlOn(ctx.site, s.path) }
  const read = (side, extra = {}) => visit(ctx, url[side], { side, ...load(side), ...extra }, (page) => measure(page, side))
  const readings = {}
  for (const side of sides) readings[side] = await read(side, { record: true })
  const out = { kind, page: s.path, capabilities: [...caps], real: null, controls: {}, defects: [], certified: {} }
  const bad = sides.filter((side) => readings[side].error)
  out.real = bad.length ? { error: bad.map((side) => `${side}: ${readings[side].error}`).join('; ') } : { findings: real(readings) }
  if (!caps.length) return { out, readings }
  for (const side of controlSides) {
    if (!readings[side] || readings[side].error) {
      out.controls[side] = { error: `the ${side} reading to compare with is missing` }
      continue
    }
    const again = await read(side)
    const why = again.error ? '' : untrusted([['first', readings[side]], ['second', again]])
    out.controls[side] = again.error ? { error: again.error } : why ? { unsettled: why } : { findings: compare(readings[side], again) }
  }
  for (const d of defects(readings)) {
    const base = { capability: d.capability, side: d.side, what: d.what, expect: d.expect ?? null }
    if (d.notInjectable) {
      out.defects.push({ ...base, notInjectable: d.notInjectable })
      continue
    }
    if (!readings[d.side] || readings[d.side].error) {
      out.defects.push({ ...base, error: `the ${d.side} reading to compare with is missing` })
      continue
    }
    const got = await read(d.side, { initScripts: d.initScripts ?? [], route: d.route ?? null, marker: Boolean(d.initScripts?.length), locate: d.locate ?? null, ...(d.load ?? {}) })
    if (got.error) {
      out.defects.push({ ...base, error: got.error })
      continue
    }
    const why = untrusted([['clean', readings[d.side]], ['defect', got]])
    if (why) {
      out.defects.push({ ...base, error: why })
      continue
    }
    const expect = d.locate ? { ...d.expect, measurement: d.expect.measurementOf(got.located) } : d.expect
    out.defects.push({ ...base, expect: { detector: expect.detector, measurement: expect.measurement ?? null, related: expect.related ?? [] }, injected: Boolean(got.injected), findings: compare(readings[d.side], got) })
  }
  for (const cap of caps) {
    const reasons = []
    if (out.real.error) reasons.push(`not-measured: ${out.real.error}`)
    const d = out.defects.find((x) => x.capability === cap) ?? null
    const c = certifyControl({ control: Object.fromEntries(controlSides.map((side) => [side, out.controls[side]])), defect: d, expect: d?.expect, page: s.path })
    reasons.push(...c.reasons)
    reasons.push(...(ctx.extraReasons?.[cap] ?? []))
    out.certified[cap] = { certified: !reasons.length, reasons }
  }
  return { out, readings }
}

const statusFinding = (s) => (readings) =>
  Object.entries(readings)
    .filter(([, r]) => (s.status == null ? r.status < 200 || r.status > 299 : r.status !== s.status))
    .map(([side, r]) => ({ detector: 'status', measurement: side, detail: `${side} answered ${String(r.status)}, declared ${String(s.status ?? '2xx')}` }))

function probeStatus(ctx, s) {
  const caps = s.covers.filter((c) => c === 'error-status' || c.startsWith('status:target:'))
  return runProbe(ctx, s, {
    kind: 'status',
    caps,
    sides: s.referenceKind === 'none' ? ['site'] : ['source', 'site'],
    measure: async () => ({}),
    real: statusFinding(s),
    compare: (a, b) => (a.status !== b.status ? [{ detector: 'status', measurement: 'status', detail: `${String(a.status)} → ${String(b.status)}` }] : []),
    defects: () =>
      caps.map((capability) => ({
        capability,
        side: 'site',
        what: `the site serves ${s.status >= 400 ? 200 : 404} for ${s.path}`,
        route: async (r, mark) => {
          mark.hit = true
          const response = await r.fetch()
          await r.fulfill({ response, status: s.status >= 400 ? 200 : 404 })
        },
        expect: { detector: 'status', measurement: 'status' }
      }))
  })
}

// Each differing property with its two readings (first → second), as layout-boxes reports them: a
// control that differs names what it read, not only which property.
export const layoutFindings = (cmp) => [
  ...cmp.rows.map((r) => ({ detector: 'layout-boxes', measurement: r.text, detail: r.deltas.map(([k, a, b]) => `${String(k)} ${String(a)} → ${String(b)}`).join('; ') })),
  ...cmp.onlySource.map((t) => ({ detector: 'layout-boxes-pairing', measurement: t, detail: 'in the first reading only' })),
  ...cmp.onlySite.map((t) => ({ detector: 'layout-boxes-pairing', measurement: t, detail: 'in the second reading only' }))
]

function probeLayout(ctx, s) {
  const caps = s.covers.filter((c) => c.startsWith('layout:'))
  return runProbe(ctx, s, {
    kind: 'layout',
    caps,
    sides: s.referenceKind === 'none' ? ['site'] : ['source', 'site'],
    measure: async (page) => {
      await freezeMotion(page)
      return { blocks: await page.evaluate(measureInPage, measureOf(ctx.selectors?.profile ?? selectorProfileOfContract(ctx.contract).profile)) }
    },
    real: (r) => r.source ? layoutFindings(compareBlocks(r.source.blocks, r.site.blocks, { width: 1440 })) : [],
    compare: (a, b) => layoutFindings(compareBlocks(a.blocks, b.blocks, { width: 1440 })),
    defects: (r) =>
      caps.map((capability) => {
        const target = r.site?.blocks?.[0]
        if (!target) return { capability, side: 'site', notInjectable: 'the site shows no heading layout-boxes measures on this page' }
        return { capability, side: 'site', what: `heading "${target.words}" drawn 12 px larger`, initScripts: [DEFECTS.layout(target.words, measureOf(ctx.selectors?.profile ?? selectorProfileOfContract(ctx.contract).profile))], expect: { detector: 'layout-boxes', measurement: target.text } }
      })
  })
}

async function probeDark(ctx, s) {
  const check = ctx.hooks.check
  const measure = async (page) => {
    const at = await callInPage(page, darkReadInPage, [check], [hookState])
    await callInPage(page, scrollThroughInPage, [600, BOUNDS.scrollSteps, 40])
    await page.waitForTimeout(1500)
    const later = await callInPage(page, darkReadInPage, [check], [hookState])
    return { applied: at.applied, bg: at.bg, color: at.color, stable: later.applied, bgLater: later.bg, colorLater: later.color }
  }
  const light = await visit(ctx, urlOn(ctx.site, s.path), { side: 'site', theme: 'light' }, async (page) => callInPage(page, darkReadInPage, [check], [hookState]))
  const fields = ['applied', 'stable', 'bg', 'color', 'bgLater', 'colorLater']
  const { out, readings } = await runProbe(ctx, s, {
    kind: 'dark',
    caps: ['dark'],
    sides: ['site'],
    load: () => ({ theme: 'dark' }),
    measure,
    real: (r) => {
      const d = r.site
      const f = []
      if (d.applied !== true) f.push({ detector: 'dark-state', measurement: 'applied', detail: `the dark mark ${check} is not on the page after load` })
      else if (d.stable !== true) f.push({ detector: 'dark-state', measurement: 'stable', detail: `the dark mark ${check} was taken off after load` })
      if (!light.error && d.bgLater === light.bg && d.colorLater === light.color) f.push({ detector: 'dark-state', measurement: 'same-as-light', detail: `dark paints ${d.bgLater} / ${d.colorLater}, as light does` })
      return f
    },
    compare: (a, b) => fields.filter((k) => a[k] !== b[k]).map((k) => ({ detector: 'dark-state', measurement: k, detail: `${String(a[k])} → ${String(b[k])}` })),
    defects: () => [{ capability: 'dark', side: 'site', what: `the dark mark ${check} taken off on the first scroll`, initScripts: [DEFECTS.dark(check)], expect: { detector: 'dark-state', measurement: 'stable', related: ['bgLater', 'colorLater'] } }]
  })
  out.light = light.error ? { error: light.error } : { bg: light.bg, color: light.color, applied: light.applied }
  const d = readings.site
  const observed = !d.error && !light.error && d.applied === true && d.stable === true && !(d.bgLater === light.bg && d.colorLater === light.color) && light.applied !== true
  if (!observed) {
    out.certified.dark.certified = false
    out.certified.dark.reasons.push(`dark-not-observed: ${light.error ? `light reading failed (${light.error})` : d.error ? d.error : light.applied === true ? 'the dark mark is on the page in light too' : 'the site did not show a dark state distinct from light through the hook'}`)
  }
  return { out, readings }
}

const motionFindings = (a, b) => compareMotion(a.motion, b.motion).rows.map((r) => ({ detector: 'motion', measurement: `${r.kind}@${r.near}`, detail: `${r.source} → ${r.site}` }))

async function probeMotion(ctx, s) {
  const assigned = s.covers.filter((c) => c.startsWith('animation:'))
  const measure = async (page) => {
    await callInPage(page, scrollThroughInPage, [600, BOUNDS.scrollSteps, 30])
    await page.waitForTimeout(300)
    const motion = await measureMotion(page)
    const libs = await callInPage(page, librariesInPage, [CHROME, SLIDES], [revealCandidatesInPage])
    return { motion, libraries: libs.libraries }
  }
  // the site's own libraries are known once it is read: read both sides first, then name the capabilities
  const pre = {}
  for (const side of ['source', 'site']) pre[side] = await visit(ctx, side === 'source' ? sourceUrlOf(ctx.source, ctx.sourcePrefix, s.path) : urlOn(ctx.site, s.path), { side }, async (page) => ({ libraries: (await callInPage(page, librariesInPage, [CHROME, SLIDES], [revealCandidatesInPage])).libraries }))
  const siteCaps = (pre.site.libraries ?? []).map((l) => `animation@site:${l.id}`)
  const caps = [...assigned, ...siteCaps]
  const sideOf = (cap) => (cap.startsWith('animation@site:') ? 'site' : 'source')
  const libOf = (cap) => cap.replace(/^animation(@site)?:/, '')
  ctx.extraReasons = { ...ctx.extraReasons, ...Object.fromEntries(caps.filter((c) => !RECOGNISED_LIBRARIES[libOf(c)]).map((c) => [c, [`library-not-recognised: motion reads ${Object.keys(RECOGNISED_LIBRARIES).join(', ')}; ${libOf(c)} is none of them`]])) }
  const res = await runProbe(ctx, s, {
    kind: 'motion',
    caps,
    measure,
    real: (r) => motionFindings(r.source, r.site),
    compare: motionFindings,
    controlSides: [...new Set(caps.map(sideOf))],
    defects: () =>
      caps.map((capability) => {
        const lib = libOf(capability)
        if (!RECOGNISED_LIBRARIES[lib]) return { capability, side: sideOf(capability), notInjectable: `${lib} is not a library motion recognises` }
        return { capability, side: sideOf(capability), what: `${lib} markers stripped from one element`, initScripts: [DEFECTS.motion(lib)], locate: (page) => page.evaluate(nearOfDefectInPage), expect: { detector: 'motion', measurementOf: (near) => (near == null ? null : `reveal@${near}`) } }
      })
  })
  res.out.observed = { source: pre.source.libraries ?? { error: pre.source.error }, site: pre.site.libraries ?? { error: pre.site.error } }
  res.siteCaps = siteCaps
  return res
}

/** Elements a difference of scroll reveals names in its detail; the rest are counted. */
const REVEAL_NAMED = 5

/**
 * The hidden-content detector: two readings of hiddenInPage (first, second) compared. Pure. The
 * counts decide, as before; a count that differs names each element whose reading differs — its
 * selector, first words and the opacity each read ended at, or the reading it was transparent at load
 * in only — and a read whose reveals had not settled says so.
 */
export function hiddenFindings(a, b) {
  const f = []
  const sa = a?.scroll ?? {}
  const sb = b?.scroll ?? {}
  const el = (e) => `${reasonText(e?.selector, 160) || '(no selector)'}${e?.words ? ` "${reasonText(e.words, 60)}"` : ''}`
  const op = (e) => (Number.isFinite(e?.opacity) ? String(e.opacity) : '?')
  const named = () => {
    const second = new Map((Array.isArray(sb.elements) ? sb.elements : []).map((e) => [e?.selector, e]))
    const first = new Map((Array.isArray(sa.elements) ? sa.elements : []).map((e) => [e?.selector, e]))
    const rows = []
    for (const e of first.values()) {
      const o = second.get(e?.selector)
      if (!o) rows.push(`${el(e)} transparent at load in the first reading only`)
      else if (Boolean(e.revealed) !== Boolean(o.revealed)) rows.push(`${el(e)} opacity ${op(e)} → ${op(o)}`)
    }
    for (const o of second.values()) if (!first.has(o?.selector)) rows.push(`${el(o)} transparent at load in the second reading only`)
    const unsettled = [['first', sa], ['second', sb]].filter(([, x]) => x.settled === false).map(([w, x]) => `the ${w} reading's reveals had not settled after ${String(x.waitedMs ?? '?')} ms`)
    const past = (sa.more ?? 0) + (sb.more ?? 0) ? `; elements past the ${String(Array.isArray(sa.elements) ? sa.elements.length : 0)} read are not named` : ''
    const shown = rows.slice(0, REVEAL_NAMED)
    const parts = [...shown, ...(rows.length > shown.length ? [`and ${String(rows.length - shown.length)} more`] : []), ...unsettled]
    return parts.length ? `: ${parts.join('; ')}${past}` : `: no element read differently${past}`
  }
  if (sa.hidden !== sb.hidden) f.push({ detector: 'hidden-content', measurement: 'scroll-hidden', detail: `${String(sa.hidden)} → ${String(sb.hidden)}${named()}` })
  if (sa.revealed !== sb.revealed) f.push({ detector: 'hidden-content', measurement: 'scroll-revealed', detail: `${String(sa.revealed)} → ${String(sb.revealed)}${named()}` })
  const ta = Array.isArray(a?.toggles) ? a.toggles : []
  const tb = Array.isArray(b?.toggles) ? b.toggles : []
  for (const key of new Set([...ta, ...tb].map((t) => t?.key))) {
    const x = ta.find((t) => t?.key === key)?.revealed ?? null
    const y = tb.find((t) => t?.key === key)?.revealed ?? null
    if (x !== y) f.push({ detector: 'hidden-content', measurement: `toggle:${String(key)}`, detail: `${String(x)} → ${String(y)}` })
  }
  return f
}

/**
 * Why a hidden-content reading cannot be trusted (runProbe `unsettled`): its scroll reveals were still
 * changing when the settle bound ran out. Counts that agree between such readings prove nothing — a
 * reveal read half-way on both is the same count as one read whole on both.
 */
export const hiddenUnsettled = (r) => (r?.scroll?.settled === false ? `had scroll reveals still changing after ${String(r.scroll.waitedMs ?? '?')} ms` : null)

export function probeHidden(ctx, s) {
  const caps = s.covers.filter((c) => c.startsWith('hidden:'))
  const opts = { chrome: CHROME, slides: SLIDES, maxSteps: BOUNDS.scrollSteps, maxToggles: BOUNDS.toggles, settleMs: 1500, revealSettleMs: BOUNDS.revealSettleMs, maxElements: BOUNDS.revealElements }
  return runProbe(ctx, s, {
    kind: 'hidden',
    caps,
    measure: async (page) => callInPage(page, hiddenInPage, [opts], [revealCandidatesInPage, findTogglesInPage]),
    real: (r) => {
      const f = []
      if (r.source.scroll.revealed !== r.site.scroll.revealed) f.push({ detector: 'hidden-content', measurement: 'scroll-revealed', detail: `${String(r.source.scroll.revealed)} → ${String(r.site.scroll.revealed)} revealed on scroll` })
      const open = (x) => x.toggles.filter((t) => t.revealed).length
      if (open(r.source) !== open(r.site)) f.push({ detector: 'hidden-content', measurement: 'toggles-revealed', detail: `${String(open(r.source))} → ${String(open(r.site))} toggles revealed their region` })
      return f
    },
    compare: hiddenFindings,
    unsettled: hiddenUnsettled,
    controlSides: ['source', 'site'],
    defects: (r) =>
      caps.map((capability) => {
        const src = r.source
        if (src?.error) return { capability, side: 'source', notInjectable: `the source did not load (${src.error})` }
        if (capability === 'hidden:scroll') {
          if (!(src.scroll.revealed > 0)) return { capability, side: 'source', notInjectable: 'nothing on this page turns visible on scroll to hold back' }
          return { capability, side: 'source', what: 'every element transparent at load held transparent', initScripts: [DEFECTS.scroll()], expect: { detector: 'hidden-content', measurement: 'scroll-revealed', related: ['scroll-hidden'] } }
        }
        const i = src.toggles.findIndex((t) => t.revealed)
        if (i < 0) return { capability, side: 'source', notInjectable: 'no toggle on this page reveals its region to keep hidden' }
        return { capability, side: 'source', what: `the region of toggle ${src.toggles[i].key} kept hidden`, initScripts: [DEFECTS.toggle(i)], expect: { detector: 'hidden-content', measurement: `toggle:${src.toggles[i].key}` } }
      })
  })
}

async function probeContainers(ctx, s) {
  const caps = s.covers.filter((c) => c.startsWith('containers:'))
  const decl = ctx.contract?.design?.containers
  const tol = decl?.tolerance ?? ctx.contract?.design?.parity?.pxTolerance ?? 1
  const items = []
  const extra = {}
  for (const cap of caps) {
    const it = decl.items.find((x) => `containers:${x.id}` === cap)
    const seen = containerObservation(ctx.discovery, it, s.path)
    const why = [...seen.gaps]
    const bps = seen.breakpoints
    if (seen.found && !bps.length) why.push(`no-breakpoint-observed: no media rule of the source CSS of ${s.path} sets the width of ${it.source}`)
    if (bps.length > BOUNDS.breakpoints) why.push(`breakpoints-beyond-bound: ${String(bps.length)} observed, ${String(BOUNDS.breakpoints)} probed`)
    const declared = decl.breakpoints ?? []
    const used = bps.slice(0, BOUNDS.breakpoints)
    extra[cap] = why
    if (used.length) items.push({ cap, id: it.id, source: it.source, site: it.site, boundaries: used, widths: probeWidths(used), declared, observed: bps })
  }
  ctx.extraReasons = { ...ctx.extraReasons, ...extra }
  const widths = [...new Set(items.flatMap((i) => i.widths))].sort((a, b) => a - b)
  const measure = (side) => async (page) => {
    const out = Object.fromEntries(items.map((i) => [i.id, {}]))
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 900 })
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))))
      const got = await page.evaluate(containerWidthsInPage, items.filter((i) => i.widths.includes(w)).map((i) => ({ item: i.id, selector: side === 'source' ? i.source : i.site })))
      for (const [id, px] of Object.entries(got)) out[id][w] = px
    }
    return { widths: out }
  }
  const compare = (a, b) => containerFindings(items, a, b, tol)
  const res = await runProbe(ctx, s, {
    kind: 'containers',
    caps: items.map((i) => i.cap).concat(caps.filter((c) => !items.some((i) => i.cap === c))),
    measure: (page, side) => measure(side)(page),
    real: (r) => compare(r.source, r.site),
    compare,
    controlSides: ['source', 'site'],
    defects: (r) =>
      caps.map((capability) => {
        const i = items.find((x) => x.cap === capability)
        if (!i) return { capability, side: 'site', notInjectable: 'no observed breakpoint to probe' }
        const w = i.boundaries[0]
        const px = r.site?.widths?.[i.id]?.[w]
        if (px == null) return { capability, side: 'site', notInjectable: `the site selector ${i.site} matched nothing at ${String(w)} px` }
        return { capability, side: 'site', what: `${i.site} narrowed to ${String(Math.max(1, Math.round(px) - 40))} px at exactly ${String(w)} px`, initScripts: [DEFECTS.container(i.site, w, Math.max(1, Math.round(px) - 40))], expect: { detector: 'container-width', measurement: `${i.id}@${String(w)}` } }
      })
  })
  res.out.items = items.map(({ cap: _cap, ...i }) => i)
  // every probed width is required on both sides: a container absent at one of them is not measured there
  for (const i of items)
    for (const sd of ['source', 'site']) {
      if (res.readings[sd]?.error) continue
      const missing = i.widths.filter((w) => !Number.isFinite(res.readings[sd]?.widths?.[i.id]?.[w]))
      if (!missing.length) continue
      res.out.certified[i.cap].certified = false
      res.out.certified[i.cap].reasons.push(`selector-not-found: ${sd === 'source' ? i.source : i.site} matched nothing on the ${sd} at ${missing.length === i.widths.length ? 'any probed width' : `${missing.join(', ')} px`}`)
    }
  return res
}

/**
 * What the capability scan established about one declared container for a probe on `route`. Pure.
 * The breakpoints probed are those of the CSS of `route` itself; every scanned page where the source
 * selector is found is read too, and what the probe cannot stand for is a gap: `route` not scanned,
 * breakpoints another page's CSS sets that `route`'s does not (they apply where they were not probed),
 * conditions or rules the scan could not read on any of those pages, and source pages not scanned at
 * all (their CSS may set the width too). Never a fallback to another page's reading.
 */
export function containerObservation(discovery, item, route) {
  const pages = Object.entries(discovery?.pages ?? {})
  const at = (o) => (o.css?.targets ?? []).find((t) => t.item === item.id)
  const here = discovery?.pages?.[route] ? at(discovery.pages[route]) : null
  const gaps = []
  if (!discovery?.pages?.[route]) gaps.push(`page-not-scanned: the source CSS of ${route} was not read by the capability scan`)
  else if (!here?.found) gaps.push(`selector-not-found: the source selector ${item.source} matched nothing the scan could read on ${route}`)
  const breakpoints = here?.found ? (here.breakpoints ?? []) : []
  const elsewhere = new Map()
  const unread = new Map()
  for (const [p, o] of pages) {
    const t = at(o)
    if (!t?.found) continue
    for (const b of t.breakpoints ?? []) if (!breakpoints.includes(b)) elsewhere.set(b, [...(elsewhere.get(b) ?? []), p])
    for (const u of t.unsupported ?? []) unread.set(u, [...(unread.get(u) ?? []), p])
  }
  for (const [b, ps] of [...elsewhere].sort(([a], [b]) => a - b)) gaps.push(`breakpoint-elsewhere: ${String(b)} px is set on ${ps.slice(0, 3).join(', ')}${ps.length > 3 ? ` (+${String(ps.length - 3)})` : ''}, not on ${route} — not probed where it applies`)
  if (unread.size) gaps.push(`unsupported-conditions (${String(unread.size)}): ${[...unread].slice(0, 3).map(([u, ps]) => `${u} (${ps.slice(0, 2).join(', ')})`).join('; ')}`)
  const unscanned = [...Object.keys(discovery?.failed ?? {}), ...(discovery?.skipped ?? [])]
  if (!discovery) gaps.push('css-not-scanned: the source was not scanned')
  else if (unscanned.length) gaps.push(`pages-not-scanned (${String(unscanned.length)}): the CSS of ${unscanned.slice(0, 3).join(', ')} was not read — it may set this width`)
  return { found: Boolean(here?.found), breakpoints, gaps }
}

/**
 * The container-width detector. Pure. At every probed width of every item both readings must hold a
 * finite width: one that does not is `container-missing` (never "equal" because both are missing),
 * and two widths further apart than `tol` are `container-width`.
 */
export function containerFindings(items, a, b, tol) {
  const f = []
  for (const i of items)
    for (const w of i.widths) {
      const x = a.widths?.[i.id]?.[w]
      const y = b.widths?.[i.id]?.[w]
      if (!Number.isFinite(x) || !Number.isFinite(y)) f.push({ detector: 'container-missing', measurement: `${i.id}@${String(w)}`, detail: `${String(x ?? null)} → ${String(y ?? null)}: the container is not on the page at this width` })
      else if (Math.abs(x - y) > tol) f.push({ detector: 'container-width', measurement: `${i.id}@${String(w)}`, detail: `${String(x)} → ${String(y)} px` })
    }
  return f
}

/**
 * The capability scan of the source: at most `limit` pages of the page-map the source serves — every
 * one, contract page or not, since a library or hidden region on a page outside the contract is still
 * the site's — layout representatives and the declared error page first, then the contract's pages,
 * then the rest in page-map order. Never throws; a page it could not read is `failed`, one past the
 * bound `skipped`, and requirementsOf counts both as unknown.
 */
async function discover(ctx, { list, contract, needContract, limit, concurrency }) {
  const ok = list.filter(scannable)
  const reps = new Set((contract?.layouts ?? []).map((l) => contract.pages?.find((p) => p.id === l.representative)?.pagemapPath).filter(Boolean))
  const items = contract?.design?.containers?.items ?? []
  const rank = (e) => (reps.has(e.path) || roleOf(e) === 'error' ? 0 : eligible(e, { contract, needContract }) ? 1 : 2)
  const order = [0, 1, 2].flatMap((r) => ok.filter((e) => rank(e) === r))
  const scan = order.slice(0, limit)
  const pages = {}
  const failed = {}
  const unreadable = new Set()
  const results = await mapLimit(scan, concurrency, async (e) => {
    const url = sourceUrlOf(ctx.source, ctx.sourcePrefix, e.path)
    const r = await visit(ctx, url, { side: 'source', record: true }, async (page) => {
      const libs = await callInPage(page, librariesInPage, [CHROME, SLIDES], [revealCandidatesInPage])
      const toggles = await page.evaluate(`(${String(findTogglesInPage)})(${JSON.stringify(CHROME)}, 50).length`)
      let css = await callInPage(page, cssScanInPage, [{ targets: items.map((i) => ({ item: i.id, selector: i.source })), heuristic: !items.length, chrome: CHROME, maxRules: BOUNDS.cssRules, extra: [] }])
      if (css.unreadable.length) {
        // the bytes of a cross-origin sheet (captured before this ran), parsed by the browser
        const extra = css.unreadable.filter((h) => ctx.log.texts.has(h)).map((href) => ({ href, text: ctx.log.texts.get(href) }))
        if (extra.length) css = await callInPage(page, cssScanInPage, [{ targets: items.map((i) => ({ item: i.id, selector: i.source })), heuristic: !items.length, chrome: CHROME, maxRules: BOUNDS.cssRules, extra }])
      }
      return { ...libs, toggles, css }
    })
    return [e.path, r]
  })
  for (const [route, r] of results) {
    if (r.error) {
      failed[route] = r.error
      continue
    }
    for (const t of r.css.targets) {
      const b = boundariesOf(t.rules.flatMap((x) => x.conditions))
      t.breakpoints = b.boundaries
      t.unsupported = [...b.unsupported, ...targetGaps(t, r.css, BOUNDS.cssRules)]
    }
    for (const h of r.css.unreadable) unreadable.add(h)
    pages[route] = { status: r.status, libraries: r.libraries, reveals: r.reveals, toggles: r.toggles, css: r.css }
  }
  return { pages, failed, skipped: order.slice(limit).map((e) => e.path), unreadable: [...unreadable], limit }
}

// ---- the judgement --------------------------------------------------------------------------------

const readJson = (file) => {
  try {
    return readInput(file, { what: 'report' })
  } catch {
    return null
  }
}

/** Whether a side answered what the sample declares (any 2xx when nothing is declared). */
const statusMet = (observed, declared) => (declared == null ? observed >= 200 && observed < 300 : observed === declared)

/**
 * The verdict of one preflight from what the tools wrote and what the census counted. Pure.
 * `controls`: the layout-boxes self-comparisons, by content route (`{ [route]: { site, source } }`);
 * a bare `{ site, source }` is the first content route's.
 * @param {{ sample: Array<object>, census: Record<string, any>, results: Record<string, Array<{ key: string, run: any, report: any }>>, controls?: object | null, tools?: string[] }} input
 */
export function judge({ sample, census, results, controls = null, tools = TOOLS }) {
  const verdicts = {}
  const contents = sample.filter((s) => s.role === 'content' && s.referenceKind !== 'none')
  const censusOk = (route) => census?.[route] && !census[route].source?.error && !census[route].site?.error
  const bothMet = (route, declared) => censusOk(route) && (sample.find((s) => s.path === route)?.referenceKind === 'none' ? statusMet(census[route].site.status, declared) : statusMet(census[route].source.status, declared) && statusMet(census[route].site.status, declared))
  const siteMet = (route, declared) => census?.[route]?.site && !census[route].site.error && statusMet(census[route].site.status, declared)
  const controlsOf = (route) => controls?.[route] ?? (controls && ('site' in controls || 'source' in controls) && route === contents[0]?.path ? controls : null)
  const CM = CENSUS_MIN
  for (const tool of tools) {
    const v = { verdict: 'trusted', reasons: [], findings: 0, notes: [], runs: [] }
    verdicts[tool] = v
    const add = (kind, code, detail) => {
      v.reasons.push({ kind, code, detail })
      const rank = { trusted: 0, inconclusive: 1, misread: 2, failed: 3 }
      if (rank[kind] > rank[v.verdict]) v.verdict = kind
    }
    const runs = results[tool] ?? []
    if (!runs.length) {
      if (['layout-boxes', 'motion', 'http-parity'].includes(tool) && !sample.some((s) => s.referenceKind !== 'none')) {
        v.notApplicable = { status: 'not-applicable', reason: 'the sample has only reference.kind=none pages; this tool obligation needs a source' }
        continue
      }
      add('failed', `${tool}-not-run`, 'no run of this tool on the sample')
      continue
    }
    // a run that gave no reading: timeout, crash, exit outside "read", or no report
    const reading = (r, { allowTwo = false } = {}) => {
      v.runs.push({ key: r.key, status: r.run.status, signal: r.run.signal, timedOut: r.run.timedOut, ms: r.run.ms })
      if (r.run.timedOut) return add('failed', `${tool}-timeout`, `${r.key}: no answer within ${String(r.run.ms)} ms`), false
      if (r.run.error) return add('failed', `${tool}-crashed`, `${r.key}: ${r.run.error}`), false
      if (allowTwo && r.run.status === 2) return true
      if (!READ_EXITS[tool].includes(r.run.status)) return add('failed', `${tool}-crashed`, `${r.key}: exit ${String(r.run.status)}${r.run.signal ? ` (${r.run.signal})` : ''} — ${String(r.run.stderrTail ?? '').trim().split('\n').slice(-3).join(' | ')}`), false
      if (!r.report) return add('failed', `${tool}-no-report`, `${r.key}: exit ${String(r.run.status)} and no readable report`), false
      return true
    }

    if (tool === 'layout-boxes') {
      for (const r of runs) {
        const s = sample.find((x) => x.path === r.key)
        if (!reading(r, { allowTwo: true })) continue
        const stderr = String(r.run.stderrTail ?? '')
        if (r.run.status === 2) {
          if (/answered|did not load/.test(stderr) && bothMet(s.path, s.status)) add('misread', 'layout-boxes-status-misread', `${s.path}: the tool stopped on the status (${stderr.trim().split('\n').pop()}) but both sides answer ${String(s.status ?? '2xx')} as declared`)
          else if (/is not in (light|dark)/.test(stderr)) add('misread', 'layout-boxes-mode', `${s.path}: ${stderr.trim().split('\n').pop()}`)
          else if (/answered|did not load/.test(stderr)) add('failed', 'layout-boxes-not-measured', `${s.path}: the tool could not load the route (${stderr.trim().split('\n').pop()}) and the census does not read the declared ${String(s.status ?? '2xx')} on both sides — the sample page was not measured`)
          else add('failed', 'layout-boxes-not-measured', `${s.path}: exit 2 — ${stderr.trim().split('\n').pop()}`)
          continue
        }
        if (!r.report) {
          add('failed', 'layout-boxes-no-report', `${s.path}: exit ${String(r.run.status)} and no readable report`)
          continue
        }
        const res = r.report.results?.find((x) => x.route === s.path)
        if (!res) {
          add('failed', 'layout-boxes-route-missing', `${s.path}: not in the report`)
          continue
        }
        v.findings += res.differing ?? 0
        if (s.role !== 'content') continue
        const c = census?.[s.path]
        if (!censusOk(s.path)) {
          add('inconclusive', 'census-failed', `${s.path}: the census could not read the route`)
          continue
        }
        const pairable = c.sharedHeadings
        if (pairable >= CM.headings && res.paired < Math.ceil(pairable / 2))
          add('misread', 'layout-boxes-headings-missed', `${s.path}: ${String(res.paired)} heading(s) paired, the census finds ${String(pairable)} h1–h3 with the same words on both sides (only in the source: ${String(res.onlySource?.length ?? 0)}, only on the site: ${String(res.onlySite?.length ?? 0)})`)
        if (res.paired >= 3 && res.differing === res.paired) {
          const ctl = controlsOf(s.path) ?? {}
          const bad = ['site', 'source'].filter((side) => ctl[side]?.report?.results?.[0]?.differing > 0)
          const missing = ['site', 'source'].filter((side) => !ctl[side]?.report?.results?.[0] || ctl[side].run?.timedOut || ![0, 1].includes(ctl[side].run?.status))
          if (bad.length) add('misread', 'layout-boxes-self-differs', `${s.path}: all ${String(res.paired)} paired blocks differ, and the ${bad.join(' and ')} compared with itself differs in ${bad.map((b) => `${String(ctl[b].report.results[0].differing)}/${String(ctl[b].report.results[0].paired)}`).join(', ')} blocks — the reading is not stable`)
          else if (missing.length) add('inconclusive', 'layout-boxes-all-differ-unverified', `${s.path}: all ${String(res.paired)} paired blocks differ and the control on the ${missing.join(' and ')} did not run — investigate before a full pass`)
          else v.notes.push(`${s.path}: all ${String(res.paired)} paired blocks differ; the page read against itself is clean on both sides, so these are differences of the theme, kept as findings`)
        }
      }
    }

    if (tool === 'motion') {
      const r = runs[0]
      if (!reading(r)) continue
      for (const content of contents) {
        const res = r.report.results?.find((x) => x.route === content.path)
        if (!res) {
          add('failed', 'motion-route-missing', `${content.path}: not in the report`)
          continue
        }
        if (res.error) {
          if (censusOk(content.path) && census[content.path].source.status < 400 && census[content.path].site.status < 400) add('failed', 'motion-not-measured', `${content.path}: ${res.error} — the census loaded both sides`)
          else add('failed', 'motion-not-measured', `${content.path}: ${res.error} — the census could not load it either, so the sample page was not measured`)
          continue
        }
        v.findings += res.rows?.length ?? 0
        if (!censusOk(content.path)) {
          add('inconclusive', 'census-failed', `${content.path}: the census could not read the route`)
          continue
        }
        for (const side of ['source', 'site']) {
          const seen = res[side]?.reveals ?? 0
          const census_ = census[content.path][side].reveals?.revealed ?? 0
          if (seen === 0 && census_ >= CM.reveals) add('misread', 'motion-reveals-missed', `${content.path}: 0 reveals on the ${side}, while ${String(census_)} element(s) there turn visible as the page scrolls`)
        }
      }
    }

    if (tool === 'http-parity') {
      const r = runs[0]
      if (!reading(r)) continue
      for (const s of sample) {
        if (s.referenceKind === 'none') continue
        const e = r.report.routes?.find((x) => x.route === (s.sourcePath ?? s.path))
        if (!e) {
          add('failed', 'http-parity-route-missing', `${s.path}: not in the report`)
          continue
        }
        if (!e.ok) v.findings += 1
        const want = s.status ?? 200
        const statusBad = e.sourceStatus !== want || e.targetStatus !== want
        if (s.role === 'error') {
          // failing a route whose two sides answer what is declared, with no source run missing,
          // is failing it on the status (an older http-parity wanted 200 of every route)
          if (!e.ok && bothMet(s.path, s.status) && (statusBad || !(e.missing?.length ?? 0)))
            add('misread', 'http-parity-status-misread', `${s.path}: failed at ${String(e.sourceStatus)}/${String(e.targetStatus)} with ${String(e.missing?.length ?? 0)} missing run(s); the census reads ${String(census[s.path].source.status)}/${String(census[s.path].site.status)}, the declared ${String(want)}`)
          continue
        }
        if (!censusOk(s.path)) {
          add('inconclusive', 'census-failed', `${s.path}: the census could not read the route`)
          continue
        }
        const c = census[s.path]
        if ((e.sourceRuns ?? 0) === 0 && c.source.texts.length >= CM.texts) add('misread', 'http-parity-source-empty', `${s.path}: 0 source runs read, the census finds ${String(c.source.texts.length)} text elements on the source`)
        else if ((e.sourceRuns ?? 0) > 0 && (e.matched ?? 0) === 0 && c.sharedTexts >= CM.texts) add('misread', 'http-parity-nothing-matched', `${s.path}: 0 of ${String(e.sourceRuns)} source runs matched, while ${String(c.sharedTexts)} text elements carry the same words on both sides`)
      }
    }

    if (tool === 'functional') {
      const r = runs[0]
      if (!reading(r)) continue
      v.findings += r.report.findings ?? 0
      for (const s of sample) {
        const e = r.report.routes?.find((x) => x.route === s.path)
        if (!e) {
          add('failed', 'functional-route-missing', `${s.path}: not in the report`)
          continue
        }
        const ps = (e.findings ?? []).find((f) => f.kind === 'page-status')
        if (ps && siteMet(s.path, s.status)) add('misread', 'functional-status-misread', `${s.path}: page-status ${String(ps.status)}${ps.expected ? ` (expected ${String(ps.expected)})` : ''}, the census reads ${String(census[s.path].site.status)} as declared`)
        if (s.role === 'content' && census?.[s.path]?.site && !census[s.path].site.error && (e.examined?.links ?? 0) === 0 && census[s.path].site.links >= CM.links)
          add('misread', 'functional-links-unexamined', `${s.path}: 0 internal links examined, the census counts ${String(census[s.path].site.links)}`)
      }
    }

    if (tool === 'visual-qa') {
      const r = runs[0]
      if (!reading(r)) continue
      v.findings += (r.report.summary?.findings ?? 0) + (r.report.summary?.unclassified ?? 0)
      for (const s of sample) {
        const page = r.report.pages?.find((p) => p.path === s.path || p.id === s.contractId)
        if (!page) {
          add('failed', 'visual-qa-page-missing', `${s.path}: not in visual.json`)
          continue
        }
        const axes = page.axes ?? []
        if (!axes.length) {
          add('failed', 'visual-qa-no-axes', `${s.path}: no axis was measured`)
          continue
        }
        const all = [...(page.findings ?? []), ...axes.flatMap((a) => a.findings ?? [])]
        const axisError = all.find((f) => f.kind === 'axis-error')
        if (axisError) add('failed', 'visual-qa-axis-error', `${s.path}: ${String(axisError.error ?? '').slice(0, 200)}`)
        const statusF = all.find((f) => f.kind === 'identity-mismatch' && f.what === 'status')
        if (statusF && siteMet(s.path, s.status)) add('misread', 'visual-qa-status-misread', `${s.path}: identity-mismatch status ${String(statusF.observed)} ≠ ${String(statusF.expected)}, the census reads ${String(census[s.path].site.status)} as declared`)
        if (s.role !== 'content') continue
        if (!censusOk(s.path)) {
          add('inconclusive', 'census-failed', `${s.path}: the census could not read the route`)
          continue
        }
        const c = census[s.path]
        const a = axes[0]
        // The census counts prose tags while Visual QA counts its configured coverage selector.
        // A large census cannot prove that a small, correctly examined coverage set is wrong.
        // Call this a misread only when Visual QA itself reports enough examined elements.
        if (isExaminedTooFewMisread(a.examined, all)) add('misread', 'visual-qa-examined-too-few', `${s.path}: ${String(a.examined)} elements are recorded as examined despite an examined-too-few finding`)
        if ((a.components?.length ?? 0) === 0 && c.sharedTexts >= CM.texts) add('misread', 'visual-qa-nothing-paired', `${s.path}: no element paired with the source, while ${String(c.sharedTexts)} text elements carry the same words on both sides`)
      }
    }
  }
  // the census is the control every check above leans on: a sample page it could not read on either
  // side (the error page too) leaves that check undone, whatever the tools wrote
  const reasons = sample
    .filter((s) => !censusOk(s.path))
    .map((s) => {
      const c = census?.[s.path]
      const sides = ['source', 'site'].filter((side) => !c?.[side] || c[side].error)
      return { kind: 'inconclusive', code: 'census-failed', detail: `${s.path}: the census could not read the ${sides.join(' and ') || 'route'}${sides.length ? ` (${sides.map((side) => String(c?.[side]?.error ?? 'no reading')).join('; ')})` : ''} — the tools' reading of this sample page is unconfirmed` }
    })
  const all = Object.values(verdicts)
  const verdict = !reasons.length && all.every((v) => v.verdict === 'trusted') ? 'trusted' : 'not-trusted'
  return { verdict, reasons, tools: verdicts }
}

/** The Visual QA finding is misread only if its own examined count contradicts it. */
export const isExaminedTooFewMisread = (examined, findings) => {
  const finding = findings.find((f) => f.kind === 'examined-too-few')
  const sourceCount = finding?.sourceCount
  const siteCount = finding?.basis === 'census' && Number.isFinite(finding?.siteCount) ? finding.siteCount : examined
  return Number.isFinite(siteCount) && Number.isFinite(sourceCount) && siteCount >= Math.ceil(sourceCount / 2)
}

/**
 * What the preflight certifies. Pure. A gate is `certified` when each of its capabilities is
 * covered and its probe certified, and each tool it depends on ran and is trusted; `not-applicable`
 * when all its capabilities are evidenced absent; otherwise `not-certified` with the reasons. The run
 * is `complete` only when every gate is certified or not applicable, the tools are trusted, nothing
 * of the lock is unresolved, no input changed while it ran and it finished inside its time budget.
 */
export function certify({ capabilities, probeCerts = {}, verdict, tools = TOOLS, unresolved = [], inputsChanged = [], late = false }) {
  const gates = {}
  for (const [gate, def] of Object.entries(GATES)) {
    const caps = capabilities.filter((c) => c.gate === gate)
    const reasons = []
    if (!caps.length) {
      gates[gate] = { status: 'not-certified', reasons: ['no capability of this gate was inventoried'], capabilities: [] }
      continue
    }
    const live = caps.filter((c) => c.state !== 'not-applicable')
    if (!live.length) {
      gates[gate] = { status: 'not-applicable', reasons: caps.map((c) => `${c.id}: ${c.reason}`), capabilities: caps.map((c) => c.id) }
      continue
    }
    for (const c of live) {
      if (c.state !== 'covered') reasons.push(`${c.id}: ${c.state} — ${c.reason}`)
      else {
        const p = probeCerts[c.id]
        if (!p?.certified) reasons.push(`${c.id}: not certified — ${p ? p.reasons.join('; ') : 'no probe measured it'}`)
      }
    }
    for (const t of def.tools) {
      if (!tools.includes(t)) reasons.push(`tool ${t} was left out (--tools): its reading of this gate is not established`)
      else if (verdict?.tools?.[t]?.verdict !== 'trusted') reasons.push(`tool ${t} is ${String(verdict?.tools?.[t]?.verdict ?? 'not judged')}`)
    }
    gates[gate] = { status: reasons.length ? 'not-certified' : 'certified', reasons, capabilities: caps.map((c) => c.id) }
  }
  const reasons = []
  if (verdict?.verdict !== 'trusted') reasons.push('the tools did not read the sample correctly (see the tool verdicts)')
  for (const u of unresolved) reasons.push(`unresolved identity: ${u}`)
  for (const i of inputsChanged) reasons.push(`input changed while the preflight ran: ${i}`)
  if (late) reasons.push('the preflight ran past its time budget: readings after the deadline certify nothing')
  const open = Object.entries(gates).filter(([, g]) => g.status === 'not-certified').map(([g]) => g)
  if (open.length) reasons.push(`gate(s) not certified: ${open.join(', ')}`)
  return { status: reasons.length ? 'partial' : 'complete', gates, reasons }
}

// ---- inputs, identity and the lock ------------------------------------------------------------------

/**
 * A file named on the command line, read only when it is safe to: opened without following a
 * symbolic link and without blocking (a FIFO opens and is then refused), the descriptor itself checked
 * to be a regular file within the bound, and never more than the bound read from it — so a file
 * swapped for a link or a FIFO between a check and the read cannot be read. JSON unless `raw`.
 */
export function readInput(file, { what = file, maxBytes = BOUNDS.inputBytes, raw = false } = {}) {
  let fd
  try {
    fd = openSync(file, FS.O_RDONLY | FS.O_NOFOLLOW | FS.O_NONBLOCK)
  } catch (e) {
    if (e.code === 'ELOOP' || e.code === 'EMLINK') throw new Error(`${what} ${file}: a symbolic link — name the file itself`)
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') throw new Error(`${what} ${file}: no such file`)
    throw new Error(`${what} ${file}: not readable (${String(e.code ?? firstLine(e))})`)
  }
  let buf
  try {
    const st = fstatSync(fd)
    if (!st.isFile()) throw new Error(`${what} ${file}: not a regular file`)
    if (st.size > maxBytes) throw new Error(`${what} ${file}: ${String(st.size)} bytes, beyond the ${String(maxBytes)}-byte bound`)
    const chunks = []
    let total = 0
    for (;;) {
      const chunk = Buffer.alloc(Math.min(1024 * 1024, maxBytes + 1 - total))
      const n = readSync(fd, chunk, 0, chunk.length, null)
      if (!n) break
      total += n
      chunks.push(chunk.subarray(0, n))
      // a file that grows past the bound while it is read is refused, not cut
      if (total > maxBytes) throw new Error(`${what} ${file}: more than ${String(maxBytes)} bytes, beyond the bound`)
    }
    buf = Buffer.concat(chunks)
  } finally {
    closeSync(fd)
  }
  if (raw) return buf
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch (e) {
    throw new Error(`${what} ${file}: not readable JSON (${firstLine(e)})`)
  }
}

/** A directory named on the command line: a real directory, not a link to one. */
function checkDir(dir, what) {
  let st
  try {
    st = lstatSync(dir)
  } catch {
    throw new Error(`${what} ${dir}: no such directory`)
  }
  if (st.isSymbolicLink()) throw new Error(`${what} ${dir}: a symbolic link — name the directory itself`)
  if (!st.isDirectory()) throw new Error(`${what} ${dir}: not a directory`)
}

/** The spec files a run hashes, each inside the spec directory. */
const SPEC_FILES = Object.freeze(['page-map.json', 'sections.json', 'content.json', 'reference.json', 'design-contract.json', 'content-contract.json'])

/** sha256 of each input file (routes, contract, runtime manifest, prior lock, spec files). */
export function hashInputs({ routes, contract = null, spec = null, runtimeManifest = null, priorLock = null }) {
  const files = {}
  const put = (name, file) => {
    try {
      files[name] = { path: path.resolve(file), sha256: sha256(readInput(file, { raw: true })) }
    } catch (e) {
      files[name] = { path: path.resolve(file), error: firstLine(e) }
    }
  }
  put('routes', routes)
  if (contract) put('contract', contract)
  if (runtimeManifest) put('runtime-manifest', runtimeManifest)
  if (priorLock) put('prior-lock', priorLock)
  if (spec) {
    const root = realpathSync(spec)
    for (const f of SPEC_FILES) {
      const p = path.join(spec, f)
      try {
        lstatSync(p)
      } catch {
        continue
      }
      const real = (() => {
        try {
          return realpathSync(p)
        } catch {
          return null
        }
      })()
      if (!real || !real.startsWith(root + path.sep)) files[`spec/${f}`] = { path: p, error: 'outside the spec directory' }
      else put(`spec/${f}`, p)
    }
  }
  return files
}

/** The inputs whose bytes differ between two hashings (or could not be read either time). */
export const changedInputs = (before, after) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k]?.sha256 !== after[k]?.sha256 || before[k]?.error || after[k]?.error).map((k) => `${k} (${String(before[k]?.sha256 ?? before[k]?.error ?? 'absent')} → ${String(after[k]?.sha256 ?? after[k]?.error ?? 'absent')})`)

/** The measuring code: every file the five tools, the preflight and their libraries run from. */
export function toolFiles(root = SKILL_ROOT) {
  const out = {}
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && /\.(mjs|js|json)$/.test(e.name)) out[path.relative(root, p)] = hashOrNull(p)
    }
  }
  for (const d of ['scripts/visual', 'scripts/lib', 'scripts/review']) walk(path.join(root, d))
  for (const f of ['scripts/http-parity.mjs', 'package.json', 'package-lock.json']) out[f] = hashOrNull(path.join(root, f))
  return out
}
function hashOrNull(p) {
  try {
    return sha256(readInput(p, { raw: true }))
  } catch {
    return null
  }
}

/** The tool fingerprint — the lock epoch: measuring files, dependencies, Node, Playwright and browser. */
export function toolFingerprint({ files, node = process.version, playwright = null, browser = null }) {
  return sha256(stableJson({ files, node, playwright, browser: browser ? { engine: browser.engine, version: browser.version } : null }))
}

/** JSON with object keys sorted, so the same content always hashes the same. */
export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}

/**
 * A runtime manifest: `{ images: [{ name, image, digest: "sha256:<64 hex>", provenance }] }`. A
 * digest has to be one; a tag or a URL is not a digest and is refused, never resolved.
 */
export function validateRuntimeManifest(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || !Array.isArray(m.images) || !m.images.length) throw new Error('the runtime manifest must be { "images": [{ "name", "image", "digest", "provenance" }] } with at least one image')
  const names = new Set()
  return m.images.map((x, i) => {
    const where = `runtime manifest images[${String(i)}]`
    if (!x || typeof x !== 'object') throw new Error(`${where} must be an object`)
    for (const k of ['name', 'image', 'provenance']) if (typeof x[k] !== 'string' || !x[k].trim()) throw new Error(`${where}.${k} must be a non-empty string`)
    if (typeof x.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(x.digest)) throw new Error(`${where}.digest must be sha256:<64 hex> as the runtime reports it — not a tag, not inferred`)
    if (names.has(x.name)) throw new Error(`${where}.name ${x.name} is listed twice`)
    names.add(x.name)
    return { name: x.name, image: x.image, digest: x.digest, provenance: x.provenance }
  })
}

/** The images of running containers, read with `docker inspect` (read-only). Never throws. */
export async function inspectContainers(names, exec = execBounded) {
  const images = []
  const unresolved = []
  for (const name of names) {
    const c = await exec(['docker', 'inspect', '--type', 'container', '--format', '{{json .}}', name])
    let info = null
    try {
      info = c.status === 0 ? JSON.parse(c.stdout) : null
    } catch {
      info = null
    }
    if (!info || !/^sha256:[0-9a-f]{64}$/.test(info.Image ?? '')) {
      unresolved.push(`runtime ${name}: docker inspect gave no image id (${String(c.error ?? c.stderr.trim().split('\n')[0] ?? `exit ${String(c.status)}`)})`)
      continue
    }
    const d = await exec(['docker', 'image', 'inspect', '--format', '{{json .RepoDigests}}', info.Image])
    let repoDigests = []
    try {
      repoDigests = d.status === 0 ? (JSON.parse(d.stdout) ?? []) : []
    } catch {
      repoDigests = []
    }
    images.push({ name, image: info.Config?.Image ?? null, digest: info.Image, repoDigests, provenance: `docker inspect ${name} (read-only)` })
  }
  return { images, unresolved }
}

/** The tool tree's commit and whether the measuring files differ from it. */
async function toolCommit(exec = execBounded) {
  const head = await exec(['git', '-C', SKILL_ROOT, 'rev-parse', 'HEAD'])
  if (head.status !== 0 || !/^[0-9a-f]{40,64}$/.test(head.stdout.trim())) return { commit: null, dirty: null, error: `git rev-parse: ${String(head.error ?? head.stderr.trim().split('\n')[0] ?? `exit ${String(head.status)}`)}` }
  const st = await exec(['git', '-C', SKILL_ROOT, 'status', '--porcelain', '--', 'scripts', 'package.json', 'package-lock.json'])
  return { commit: head.stdout.trim(), dirty: st.status === 0 ? st.stdout.trim().length > 0 : null, dirtyFiles: st.status === 0 ? st.stdout.trim().split('\n').filter(Boolean).slice(0, 50) : null }
}

/** The lock's seal: sha256 of its canonical JSON without the seal. */
export const lockDigest = (lock) => {
  const { digest: _digest, ...rest } = lock
  return sha256(stableJson(rest))
}

/** The epoch a new lock starts or continues, against the prior lock of the same port. */
export function epochOf(fingerprint, prior = null) {
  if (!prior) return { fingerprint, sequence: 1, previous: null, changed: null }
  const same = prior.epoch?.fingerprint === fingerprint
  return { fingerprint, sequence: same ? prior.epoch.sequence : prior.epoch.sequence + 1, previous: { fingerprint: prior.epoch.fingerprint, sequence: prior.epoch.sequence, digest: prior.digest }, changed: !same }
}

/** A lock read back: a regular file within bounds, of this schema, complete, its seal intact. Throws otherwise. */
export function readLock(file) {
  const lock = readInput(file, { what: 'lock', maxBytes: BOUNDS.lockBytes })
  if (lock?.schema !== LOCK_SCHEMA) throw new Error(`lock ${file}: schema ${JSON.stringify(lock?.schema)} is not ${LOCK_SCHEMA}`)
  if (lock.complete !== true) throw new Error(`lock ${file}: not marked complete`)
  if (typeof lock.digest !== 'string' || lock.digest !== lockDigest(lock)) throw new Error(`lock ${file}: its seal does not match its content (truncated, edited or partly written)`)
  if (!lock.epoch?.fingerprint || !Number.isInteger(lock.epoch.sequence) || lock.epoch.sequence < 1) throw new Error(`lock ${file}: no epoch`)
  return lock
}

/**
 * The identity problems of the resources one run loaded: a source resource or font file that served
 * more than one body (by identity: a CSRF token alone is not another body, source-identity.mjs) or
 * more than one status. A font-CSS service's stylesheet is exempt — recorded, not compared.
 * @param {Iterable<{ side: string, type: string, url: string, sha256s: string[], identities?: object[], statuses: number[] }>} entries
 * @returns {string[]}
 */
export function variedBodies(entries) {
  const out = []
  for (const e of entries) {
    const bodies = e.identities?.length ?? e.sha256s.length
    if (bodies > 1 && (e.side === 'source' || e.type === 'font') && !(e.type === 'stylesheet' && volatileStylesheet(e.url))) out.push(`${e.side} ${e.type} ${e.url}: ${String(bodies)} different bodies over the loads of this run — not one set of bytes`)
  }
  for (const e of entries) if (e.statuses.length > 1 && e.side === 'source') out.push(`${e.side} ${e.type} ${e.url}: answered ${e.statuses.join(' and ')} over the loads of this run — not one status`)
  return out
}

/** The source resources a lock names — documents and stylesheets — with the hashes it saw of each. */
export const lockedSource = (lock) => [...(lock?.source?.documents ?? []), ...(lock?.source?.stylesheets ?? []).filter((r) => !volatileStylesheet(r.url))].map((r) => ({ url: r.url, sha256s: r.sha256s ?? [], identities: Array.isArray(r.identities) ? r.identities : [], statuses: Array.isArray(r.statuses) ? r.statuses : [] }))

/**
 * Whether a preflight's evidence is accepted. The lock is intact and seals every artifact of a whole
 * run, each still the file on disk; PREFLIGHT.json names the same epoch and certification; the
 * identity is whole (browser, tool commit and files, runtime images, source bytes, no unresolved
 * field, nothing changed while it ran); the certification is complete; the epoch is the current
 * tools' (`fingerprint`); the input files still hash as the lock recorded (re-read here); and the
 * source still serves the bytes the lock recorded (`sourceNow`: `{ [url]: { sha256 } | { error } }`,
 * fetched by the caller — without it the source is not confirmed, and the run is not accepted).
 */
export function verifyRun(out, { fingerprint = null, sourceNow = null } = {}) {
  const reasons = []
  let lock
  try {
    lock = readLock(path.join(out, LOCK_FILE))
  } catch (e) {
    return { ok: false, reasons: [firstLine(e)], lock: null }
  }
  for (const name of SEALED_ARTIFACTS) if (!lock.artifacts?.[name]) reasons.push(`the lock seals no ${name}: not a whole run`)
  for (const [name, want] of Object.entries(lock.artifacts ?? {})) {
    if (path.basename(name) !== name) {
      reasons.push(`${name}: not an artifact of this directory`)
      continue
    }
    try {
      const got = sha256(readInput(path.join(out, name), { raw: true, what: 'artifact' }))
      if (got !== want) reasons.push(`${name}: changed since the lock sealed it`)
    } catch (e) {
      reasons.push(firstLine(e))
    }
  }
  if (lock.artifacts?.['PREFLIGHT.json']) {
    const report = readJson(path.join(out, 'PREFLIGHT.json'))
    if (report?.lock?.fingerprint !== lock.epoch.fingerprint) reasons.push('PREFLIGHT.json names another epoch than the lock')
    if (report?.certification?.status !== lock.certification?.status) reasons.push('PREFLIGHT.json names another certification than the lock')
  }
  // the identity is whole
  if (!Array.isArray(lock.unresolved)) reasons.push('the lock lists no unresolved identity fields')
  else if (lock.unresolved.length) reasons.push(`unresolved identity: ${lock.unresolved.slice(0, 5).join('; ')}`)
  if (!lock.browser?.version || !lock.browser?.engine) reasons.push('the lock names no browser')
  if (!/^[0-9a-f]{40,64}$/.test(String(lock.tool?.commit ?? ''))) reasons.push('the lock names no tool commit')
  if (!lock.tool?.files || !Object.keys(lock.tool.files).length || Object.values(lock.tool.files).some((h) => !h)) reasons.push('the lock does not hash every measuring file')
  if (!lock.runtime?.images?.length || lock.runtime.images.some((i) => !/^sha256:[0-9a-f]{64}$/.test(String(i.digest)))) reasons.push('the lock names no runtime image digests')
  if (!lock.source?.documents?.length) reasons.push('the lock hashes no source document')
  if (lockedSource(lock).some((r) => (r.identities.length || r.sha256s.length) !== 1)) reasons.push('the lock holds a source resource with more than one body')
  for (const r of lockedSource(lock)) if (r.statuses.length !== 1 || !Number.isInteger(r.statuses[0])) reasons.push(`source ${r.url}: the lock records ${r.statuses.length ? `statuses ${r.statuses.join('/')}` : 'no status'}, not one HTTP status`)
  if (lock.inputs?.changedDuringRun?.length || lock.tool?.changedDuringRun?.length) reasons.push('inputs or measuring files changed while the run measured')
  if (lock.certification?.status !== 'complete') reasons.push(`certification is ${String(lock.certification?.status)}: ${(lock.certification?.reasons ?? []).slice(0, 5).join('; ')}`)
  if (fingerprint && fingerprint !== lock.epoch.fingerprint) reasons.push(`stale epoch: the tools changed since this lock (lock ${lock.epoch.fingerprint}, now ${fingerprint}) — run the preflight again`)
  if (!fingerprint) reasons.push('the current tools were not fingerprinted: the epoch is not confirmed')
  // the inputs, as they are now
  const files = lock.inputs?.files ?? {}
  if (!files.routes?.sha256) reasons.push('the lock hashes no --routes input')
  for (const [name, rec] of Object.entries(files)) {
    if (!rec?.sha256) {
      reasons.push(`input ${name}: not hashed when the run measured (${String(rec?.error ?? 'no hash')})`)
      continue
    }
    try {
      if (sha256(readInput(rec.path, { raw: true, what: `input ${name}` })) !== rec.sha256) reasons.push(`input ${name} ${rec.path}: changed since the lock`)
    } catch (e) {
      reasons.push(firstLine(e))
    }
  }
  // the source, as it serves now
  if (!sourceNow) reasons.push('the source was not read again: its bytes are not confirmed')
  else
    for (const r of lockedSource(lock)) {
      const now = sourceNow[r.url]
      if (!now?.sha256) reasons.push(`source ${r.url}: not read again (${String(now?.error ?? 'no reading')})`)
      else if (!r.sha256s.includes(now.sha256) && !r.identities.some((i) => sameIdentity(i, now.identity))) reasons.push(`source ${r.url}: serves other bytes than the lock recorded${r.identities.some((i) => i.normalized) ? ` (identity policy ${r.identities.map((i) => i.policy).join('/')})` : ''}`)
      if (now?.sha256 && !r.statuses.includes(now.status)) reasons.push(`source ${r.url}: answers ${String(now.status)} now, the lock recorded ${r.statuses.join('/') || 'no status'}`)
    }
  // the font files the source loaded stand in for the font-CSS that is not compared: they are re-read and compared
  if (sourceNow)
    for (const f of lockedFonts(lock)) {
      const now = sourceNow[f.url]
      if (!now?.sha256) reasons.push(`source font ${f.url}: not read again (${String(now?.error ?? 'no reading')})`)
      else {
        if (!f.sha256s.includes(now.sha256)) reasons.push(`source font ${f.url}: serves other bytes than the lock recorded`)
        if (!f.statuses.includes(now.status)) reasons.push(`source font ${f.url}: answers ${String(now.status)} now, the lock recorded ${f.statuses.join('/') || 'no status'}`)
      }
    }
  return { ok: !reasons.length, reasons, lock }
}

/** The font files the source loaded (what replaces a volatile font-CSS service): url and recorded digests. */
export const lockedFonts = (lock) => (lock?.fonts?.files ?? []).filter((f) => f.side === 'source' && /^https?:/.test(String(f.url))).map((f) => ({ url: f.url, sha256s: Array.isArray(f.sha256s) ? f.sha256s : [], statuses: Array.isArray(f.statuses) ? f.statuses : [] }))

/**
 * GET one URL and hash its body, reading at most `maxBytes` as it streams; never follows a redirect
 * and never throws. `{ sha256, bytes, status }` or `{ error }`.
 */
export async function fetchHash(url, { maxBytes = BOUNDS.resourceBytes, timeoutMs = 15000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs)
  try {
    const res = await fetch(url, { redirect: 'manual', signal })
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {})
      return { error: `answered ${String(res.status)} (a redirect)` }
    }
    const h = createHash('sha256')
    const chunks = []
    let bytes = 0
    const reader = res.body?.getReader()
    for (;;) {
      const { done, value } = reader ? await reader.read() : { done: true }
      if (done) break
      bytes += value.length
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {})
        return { error: `more than ${String(maxBytes)} bytes, beyond the bound` }
      }
      h.update(value)
      chunks.push(value)
    }
    // the identity the lock compares: the same policy as the capture (source-identity.mjs), a document only
    const html = /\bhtml\b/i.test(res.headers.get('content-type') ?? '')
    return { sha256: `sha256:${h.digest('hex')}`, bytes, status: res.status, identity: sourceIdentity(Buffer.concat(chunks), { html }) }
  } catch (e) {
    return { error: firstLine(e.cause ?? e) }
  }
}

/**
 * Write a file that did not exist, all at once: a temporary file in the same directory, flushed,
 * then hard-linked to its name (which fails when the name exists) — a reader sees nothing or all of it.
 */
export function writeAtomic(file, text) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${String(process.pid)}.${randomBytes(6).toString('hex')}.tmp`)
  const fd = openSync(tmp, 'wx')
  try {
    writeSync(fd, text)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    linkSync(tmp, file)
  } finally {
    unlinkSync(tmp)
  }
}
const writeJson = (file, v) => writeAtomic(file, `${JSON.stringify(v, null, 2)}\n`)

/**
 * Text written into PREFLIGHT.md: reasons quote pages, selectors and the words of elements, so the
 * characters Markdown and a table cell act on are escaped and line breaks folded (reasonText) — a
 * quoted `|`, backtick or `<tag>` cannot end a cell, open code or inject markup.
 */
export const mdText = (v) => reasonText(v, Infinity).replace(/[\\`*_[\]<>|]/g, '\\$&')

export function formatMarkdown(r) {
  const cert = r.certification
  const lines = [
    `# Preflight — ${r.verdict === 'trusted' ? 'TRUSTED: the tools read the sample correctly' : 'NOT TRUSTED: fix the tool or its inputs before a full pass'}${cert ? ` · certification ${cert.status.toUpperCase()}` : ''}`,
    '',
    `Sample: ${r.sample.map((s) => `\`${s.path}\` (${s.role}${s.status ? `, declared ${String(s.status)}` : ''})`).join(', ')} · site ${r.site} · source ${r.source}`,
    '',
    'A pass here says only that the tools read these pages correctly and that the capabilities below were measured, controlled and caught a defect — it is not parity, the fast gate or a visual verdict.',
    '',
    '| Tool | Verdict | Findings kept | Reasons |',
    '|---|---|---|---|'
  ]
  for (const [tool, v] of Object.entries(r.tools)) lines.push(`| ${tool} | ${v.notApplicable ? 'not-applicable' : v.verdict} | ${String(v.findings)} | ${v.notApplicable?.reason ?? (v.reasons.map((x) => `**${x.code}** ${x.detail}`).join('<br>') || '—')} |`)
  if (r.reasons?.length) lines.push('', '## Sample not confirmed', '', ...r.reasons.map((x) => `- **${x.code}** ${x.detail}`))
  const notes = Object.entries(r.tools).flatMap(([tool, v]) => v.notes.map((n) => `- ${tool}: ${n}`))
  if (notes.length) lines.push('', '## Notes', '', ...notes)
  if (cert) {
    lines.push('', '## Certification', '', ...cert.reasons.map((x) => `- ${mdText(x)}`), '', '| Gate | Status | Reasons |', '|---|---|---|')
    for (const [g, x] of Object.entries(cert.gates)) lines.push(`| ${g} | ${x.status} | ${x.reasons.map(mdText).join('<br>') || '—'} |`)
  }
  if (r.coverage) {
    lines.push('', `## Capabilities (sample bound ${String(r.coverage.bound)}${r.coverage.manual ? ', pages chosen by hand' : ''})`, '')
    for (const c of r.coverage.capabilities) lines.push(`- **${c.id}** (${c.gate}) — ${c.state}${c.page ? ` on \`${c.page}\`` : ''}: ${c.reason}${r.probeCerts?.[c.id] ? ` — ${r.probeCerts[c.id].certified ? 'CERTIFIED' : `not certified: ${r.probeCerts[c.id].reasons.map(mdText).join('; ')}`}` : ''}`)
  }
  if (r.lock) lines.push('', '## Measurement lock', '', `\`${LOCK_FILE}\` — epoch ${String(r.lock.sequence)} (${r.lock.fingerprint})${r.lock.changed ? ', a NEW epoch: the tools changed since the prior lock' : ''}${r.lock.unresolved?.length ? `; unresolved: ${r.lock.unresolved.join('; ')}` : ''}`)
  lines.push('', '## Census', '')
  for (const [route, c] of Object.entries(r.census ?? {}))
    for (const side of ['source', 'site']) {
      const x = c[side]
      lines.push(`- \`${route}\` ${side}: ${x.notApplicable ? `NOT APPLICABLE — ${x.reason}` : x.error ? `NOT READ — ${x.error}` : `HTTP ${String(x.status)}, ${String(x.headings.length)} h1–h3, ${String(x.texts.length)} text elements, ${String(x.links)} internal links, ${String(x.reveals.revealed)}/${String(x.reveals.hidden)} revealed on scroll`}`)
    }
  return lines.join('\n') + '\n'
}

// ---- the command ----------------------------------------------------------------------------------

const USAGE =
  'usage: preflight.mjs --routes <page-map.json> --site <origin> [--source <origin> when pages need a source] --contract <visual.contract.json> --spec <spec dir> --out <new dir> [--pages /a[,/b…]] [--max-pages 1–6] [--discovery-limit N] [--source-prefix /index.php] [--source-site <origin>] [--tools a,b] [--tool-timeout-ms N] [--probe-timeout-ms N] [--timeout-ms N] [--concurrency N] [--runtime-manifest <file> | --runtime-containers a,b] [--prior-lock <file>] [--pass tool:--flag[=value]]…\n       preflight.mjs --verify <out dir>'
function usage(why) {
  if (why) console.error(`preflight: ${why}`)
  console.error(USAGE)
  return 2
}

const VALUED = ['--routes', '--site', '--source', '--contract', '--spec', '--out', '--pages', '--max-pages', '--discovery-limit', '--source-prefix', '--source-site', '--tools', '--tool-timeout-ms', '--probe-timeout-ms', '--timeout-ms', '--concurrency', '--runtime-manifest', '--runtime-containers', '--prior-lock', '--pass', '--verify']
const origin = (v, flag) => {
  let u
  try {
    u = new URL(v)
  } catch {
    throw new Error(`${flag} ${v}: not a URL`)
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) throw new Error(`${flag} ${v}: an http(s) origin without path, query or credentials`)
  return u.origin
}
const intIn = (v, flag, lo, hi) => {
  if (!/^\d+$/.test(v) || Number(v) < lo || Number(v) > hi) throw new Error(`${flag} ${v}: a whole number from ${String(lo)} to ${String(hi)}`)
  return Number(v)
}

/** The command line, checked whole before anything is read or launched. Throws with the reason. */
export function parseArgs(argv) {
  const o = { pass: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!VALUED.includes(a)) throw new Error(`unknown argument ${a}`)
    const v = argv[i + 1]
    if (v === undefined || v === '' || (v.startsWith('--') && a !== '--pass')) throw new Error(`${a} needs a value`)
    if (a === '--pass') o.pass.push(v)
    else if (o[a.slice(2)] !== undefined) throw new Error(`${a} is given twice`)
    else o[a.slice(2)] = v
    i += 1
  }
  if (o.verify !== undefined) {
    if (Object.keys(o).some((k) => k !== 'verify' && k !== 'pass') || o.pass.length) throw new Error('--verify stands alone')
    return { verify: o.verify }
  }
  for (const k of ['routes', 'site', 'out']) if (!o[k]) throw new Error(`--${k} is required`)
  const tools = (o.tools ?? TOOLS.join(',')).split(',').filter(Boolean)
  const unknown = tools.filter((t) => !TOOLS.includes(t))
  if (unknown.length || !tools.length) throw new Error(`--tools: unknown ${unknown.join(', ') || '(none named)'}; one or more of ${TOOLS.join(', ')}`)
  if (new Set(tools).size !== tools.length) throw new Error('--tools names a tool twice')
  if (tools.includes('visual-qa') && (!o.contract || !o.spec)) throw new Error('visual-qa reads the visual contract: pass --contract and --spec (or leave visual-qa out of --tools)')
  const prefix = o['source-prefix'] ?? ''
  if (prefix) {
    if (!o.source) throw new Error('--source-prefix needs --source')
    // only the plain form is accepted: named segments of unreserved characters, none a dot segment
    // and nothing percent-encoded, then the same route rules and the same join as every page path
    const why = !/^(\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)+$/.test(prefix) ? 'a path like /index.php, without a trailing slash, of letters, digits and . _ ~ - (no percent-encoding, no dot segment)' : routeProblem(prefix)
    if (why) throw new Error(`--source-prefix ${prefix}: ${why}`)
    const src = origin(o.source, '--source')
    try {
      if (new URL(urlOn(src, `${prefix}/`)).pathname !== `${prefix}/`) throw new Error('the URL parser rewrites it')
    } catch (e) {
      throw new Error(`--source-prefix ${prefix}: ${firstLine(e)}`)
    }
  }
  if (prefix && o.pass.some((p) => p.startsWith('http-parity:--pairs'))) throw new Error('--source-prefix: http-parity carries it as --pairs of its own; a --pass http-parity:--pairs would replace that mapping')
  const pages = (o.pages ?? '').split(',').filter(Boolean)
  if (o.pages !== undefined && (!pages.length || pages.some((p) => routeProblem(p)))) throw new Error(`--pages ${o.pages}: paths starting with /, separated by commas, each staying on the origin (${pages.map(routeProblem).find(Boolean) ?? 'none named'})`)
  const containers = o['runtime-containers'] ? o['runtime-containers'].split(',') : []
  if (containers.some((c) => !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(c)) || containers.length > 16) throw new Error(`--runtime-containers ${o['runtime-containers']}: up to 16 container names`)
  if (o['runtime-manifest'] && containers.length) throw new Error('name the runtime once: --runtime-manifest or --runtime-containers')
  return {
    routes: o.routes,
    site: origin(o.site, '--site'),
    source: o.source ? origin(o.source, '--source') : null,
    sourceSite: o['source-site'] ? origin(o['source-site'], '--source-site') : null,
    contract: o.contract ?? null,
    spec: o.spec ?? null,
    out: o.out,
    pages,
    maxPages: o['max-pages'] ? intIn(o['max-pages'], '--max-pages', 1, MAX_PAGES) : MAX_PAGES,
    discoveryLimit: o['discovery-limit'] ? intIn(o['discovery-limit'], '--discovery-limit', 1, BOUNDS.maxDiscoveryPages) : BOUNDS.discoveryPages,
    sourcePrefix: prefix,
    tools,
    toolTimeout: o['tool-timeout-ms'] ? intIn(o['tool-timeout-ms'], '--tool-timeout-ms', 1000, 3600000) : 300000,
    probeTimeout: o['probe-timeout-ms'] ? intIn(o['probe-timeout-ms'], '--probe-timeout-ms', 1000, 1800000) : 120000,
    total: o['timeout-ms'] ? intIn(o['timeout-ms'], '--timeout-ms', 1000, 14400000) : 900000,
    concurrency: o.concurrency ? intIn(o.concurrency, '--concurrency', 1, 8) : 3,
    runtimeManifest: o['runtime-manifest'] ?? null,
    runtimeContainers: containers,
    priorLock: o['prior-lock'] ?? null,
    pass: o.pass
  }
}

/** Resolve the dark switch and its mark from the contract (or the page-map's hook). Throws on a contract whose theme is wrong. */
function hooksFor(contract, pageMap) {
  if (contract?.design?.theme?.attribute) {
    const light = hooksOf({ theme: 'light', contract })
    // only the site's dark switch is read here: a source without a dark switch of its own does not
    // stop the site's dark from being measured
    const dark = hooksOf({ theme: 'dark', contract, flags: contract.source?.darkHook || contract.source?.darkRequestHook ? {} : { sourceDarkHook: 'attr:data-preflight-unused=1' } })
    return { light: { site: light.hooks.site.light ?? null, source: light.hooks.source.light ?? null }, dark: dark.hooks.site.dark, check: /(^|\+)(attr|class):/.test(dark.checks.site) ? dark.checks.site : null }
  }
  const h = Array.isArray(pageMap) ? null : pageMap?.theme?.hook
  const mark = h?.attribute && h.darkValue ? `attr:${h.attribute}=${h.darkValue}` : h?.className ? `class:${h.className}` : null
  return { light: { site: null, source: null }, dark: mark, check: mark }
}

async function verifyMain(out) {
  const files = toolFiles()
  let identity = null
  try {
    const b = lazyBrowser()
    try {
      identity = browserIdentity(await b.get())
    } finally {
      await b.close()
    }
  } catch (e) {
    console.error(`preflight: the browser did not launch (${firstLine(e)}) — the current epoch cannot be established`)
    return 1
  }
  const fingerprint = toolFingerprint({ files, playwright: identity.playwright, browser: identity })
  let sourceNow = null
  try {
    const lock = readLock(path.join(out, LOCK_FILE))
    const urls = [...new Set([...lockedSource(lock), ...lockedFonts(lock)].map((r) => r.url))].slice(0, BOUNDS.resources)
    sourceNow = Object.fromEntries(await mapLimit(urls, 4, async (u) => [u, await fetchHash(u)]))
  } catch {
    sourceNow = null // verifyRun names what is wrong with the lock
  }
  const v = verifyRun(out, { fingerprint, sourceNow })
  for (const r of v.reasons) console.log(`not accepted — ${r}`)
  console.log(`preflight --verify: ${v.ok ? 'ACCEPTED' : 'NOT ACCEPTED'} ${out}${v.lock ? ` (epoch ${String(v.lock.epoch.sequence)})` : ''}`)
  return v.ok ? 0 : 1
}

export async function main(argv) {
  let o
  try {
    o = parseArgs(argv)
  } catch (e) {
    return usage(e.message)
  }
  if (o.verify) return verifyMain(o.verify)
  let pageMap
  let contract = null
  let referenceKinds = null
  let list
  let pass
  let hooks
  let runtime = null
  let prior = null
  const needContract = o.tools.includes('visual-qa')
  try {
    pageMap = readInput(o.routes, { what: '--routes' })
    list = pageList(pageMap)
    pass = passArgs(o.pass)
    if (o.contract) contract = readInput(o.contract, { what: '--contract' })
    if (contract && (typeof contract !== 'object' || !Array.isArray(contract.pages))) throw new Error(`--contract ${o.contract}: not a visual contract (no "pages")`)
    if (o.spec) checkDir(o.spec, '--spec')
    if (contract?.pages?.some((page) => page.referenceKind === 'none')) {
      if (!o.spec) throw new Error('--spec is required to bind contract referenceKind=none to reference.json before source obligations can be N/A')
      const specPageMap = readInput(path.join(o.spec, 'page-map.json'), { what: '--spec page-map.json' })
      const referenceFile = path.join(o.spec, 'reference.json')
      if (!existsSync(referenceFile)) throw new Error('--spec reference.json is required to bind contract referenceKind=none before source obligations can be N/A')
      const reference = readInput(referenceFile, { what: '--spec reference.json' })
      const bound = bindReferenceKinds(contract?.pages ?? [], specPageMap, reference)
      if (bound.errors.length) throw new Error(bound.errors[0])
      referenceKinds = bound.referenceKinds
    }
    if (o.runtimeManifest) runtime = validateRuntimeManifest(readInput(o.runtimeManifest, { what: '--runtime-manifest' }))
    if (o.priorLock) prior = readLock(o.priorLock)
    const referenceKindOf = (route) => referenceKinds?.[route] ?? null
    const hasSourcePage = list.some((e) => referenceKindOf(e.path) !== 'none')
    if (hasSourcePage && !o.source) throw new Error('--source is required because the page-map includes a page whose reference.json kind needs a source or is not bound')
    if (o.pages.length) checkManualPages(list, o.pages, { maxPages: o.maxPages, contract, needContract })
    else if (!list.some((e) => roleOf(e) === 'content' && eligible(e, { contract, needContract }))) throw new Error(needContract ? 'the page-map has no page that answers 200 among the contract pages' : 'the page-map has no page that answers 200 to read')
    hooks = hooksFor(contract, pageMap)
  } catch (e) {
    return usage(e.message)
  }
  const out = path.resolve(o.out)
  try {
    const st = lstatSync(out)
    if (st.isSymbolicLink() || !st.isDirectory()) return usage(`--out ${o.out}: not a directory`)
    if (readdirSync(out).length) return usage(`--out ${o.out} is not empty; the evidence of one preflight never overwrites another`)
  } catch (e) {
    if (e.code !== 'ENOENT') return usage(`--out ${o.out}: ${firstLine(e)}`)
  }
  mkdirSync(out, { recursive: true })
  // one preflight per --out: a second one started at the same time stops here
  try {
    closeSync(openSync(path.join(out, '.preflight.owner'), 'wx'))
  } catch {
    return usage(`--out ${o.out}: another preflight writes here`)
  }
  const inputsBefore = hashInputs({ routes: o.routes, contract: o.contract, spec: o.spec, runtimeManifest: o.runtimeManifest, priorLock: o.priorLock })
  // the measuring code is fixed before anything measures, and compared again at the end
  const filesBefore = toolFiles()
  const commitBefore = await toolCommit()
  const deadline = Date.now() + o.total
  const left = () => Math.max(1, Math.min(o.toolTimeout, deadline - Date.now()))
  const lazy = lazyBrowser()
  // an interrupted run takes down what it owns — the tool children's process groups and its own
  // browser — before it exits; a browser that does not close in 10 s is left to Playwright's exit hook
  // (and nothing is started after the signal: the run goes on while the browser closes)
  const interrupted = () => {
    if (STOP.now) return
    STOP.now = true
    for (const c of LIVE_CHILDREN) killGroup(c)
    withTimeout(lazy.close(), 10000, 'closing the browser')
      .catch(() => {})
      .finally(() => {
        for (const c of LIVE_CHILDREN) killGroup(c)
        process.exit(130)
      })
  }
  process.on('SIGINT', interrupted)
  process.on('SIGTERM', interrupted)
  try {
    let browser = null
    let launchError = null
    try {
      browser = await lazy.get()
    } catch (e) {
      launchError = firstLine(e)
    }
    const identity = browser ? browserIdentity(browser) : null
    const log = resourceLog()
    // the source framework's selector profile (the contract's source.framework, #66): what the layout
    // probe measures, and what layout-boxes and http-parity are told
    const selectors = selectorProfileOfContract(contract)
    // no --source-prefix: a Joomla source without URL rewrite serves its pages under /index.php; probe once, never guess
    if (!o.sourcePrefix && o.source) {
      const plan = await sourcePrefixPlan(o.source, (Array.isArray(pageMap) ? pageMap : pageMap.pages ?? []).filter((e) => {
        const referenceKind = referenceKinds?.[e.path ?? e.route] ?? null
        const st = declaredStatus(e)
        return referenceKind !== 'none' && (st == null || st === 200)
      }).map((e) => e.path ?? e.route).filter((x) => typeof x === 'string' && x.startsWith('/')))
      // one prefix is applied to every source URL below: a source that answers some routes directly and others only under /index.php, or a
      // reachable route that resolves nowhere, would be read at a wrong address or a 404 — stop instead of measuring that
      if (plan.mixed) return usage(`${o.source} answers some routes directly and others only under ${NO_REWRITE_PREFIX}: no single --source-prefix describes it`)
      if (plan.unresolved.length) return usage(`${o.source} answers 200 on / but ${plan.unresolved.slice(0, 5).join(', ')} cannot be resolved: not measured at an unresolved address`)
      if (plan.prefix) {
        console.error(`preflight: ${o.source} answers its routes under ${plan.prefix} only (no URL rewrite) — reading the source there`)
        o.sourcePrefix = plan.prefix
      }
    }
    const ctx = { browser, hooks, contract, selectors, site: o.site, source: o.source, sourcePrefix: o.sourcePrefix, deadline, probeTimeoutMs: o.probeTimeout, log, discovery: null, extraReasons: {} }
    const sourceList = list.filter((e) => (referenceKinds?.[e.path] ?? null) !== 'none')
    const discovery = browser ? await discover(ctx, { list: sourceList, contract, needContract, limit: o.discoveryLimit, concurrency: o.concurrency }) : null
    ctx.discovery = discovery
    const { sample, coverage } = selectSample(pageMap, { pages: o.pages, contract, discovery, darkMark: hooks.check, maxPages: o.maxPages, needContract, referenceKinds })
    if (launchError) coverage.capabilities.push({ id: 'browser', gate: 'layout', state: 'unknown', reason: `the browser did not launch (${launchError}): nothing was scanned or probed` })

    const base = Array.isArray(pageMap) ? {} : pageMap
    const samplePageMap = path.join(out, 'sample.page-map.json')
    writeJson(samplePageMap, { ...base, pages: sample.map((s) => s.entry) })
    const routePageMaps = sample.map((s, i) => {
      const f = path.join(out, `route-${String(i)}.page-map.json`)
      writeJson(f, { ...base, pages: [s.entry] })
      return f
    })
    const hpSample = sample.filter((s) => s.referenceKind !== 'none')
    const hp = hpSample.length
      ? httpParityInputs(pageMap, hpSample, o.sourcePrefix) ?? { pageMap: { ...base, pages: hpSample.map((s) => s.entry) }, pairs: null }
      : null
    let httpParityRoutes = null
    let httpParityPairs = null
    if (hp) {
      for (const s of hpSample) s.sourcePath = sourcePathOf(o.sourcePrefix, s.path)
      httpParityRoutes = path.join(out, 'http-parity.page-map.json')
      writeJson(httpParityRoutes, hp.pageMap)
      if (hp.pairs) {
        httpParityPairs = path.join(out, 'http-parity.pairs.json')
        writeJson(httpParityPairs, hp.pairs)
      }
    }
    const common = { sample, site: o.site, source: o.source, sourcePrefix: o.sourcePrefix, contract: o.contract, spec: o.spec, sourceSite: o.sourceSite, out, pass, selectorArgs: selectorArgsOf(contract) }
    const commands = toolCommands({ ...common, samplePageMap, httpParityRoutes, httpParityPairs, routePageMaps, contractPageIds: sample.map((s) => s.contractId).filter(Boolean), tools: o.tools })
    const jobs = Object.entries(commands).flatMap(([tool, cmdList]) => cmdList.map((c, i) => ({ tool, i, ...c })))
    console.log(`preflight: ${String(sample.length)} page(s) (${sample.map((s) => s.path).join(', ')}), ${String(jobs.length)} tool run(s), census and capability probes on both sides`)

    const probeCerts = {}
    const probes = []
    const inPage = async () => {
      if (!browser) return Object.fromEntries(sample.map((s) => [s.path, { source: s.referenceKind === 'none' ? { status: null, notApplicable: true, reason: 'reference.kind=none' } : { status: 0, error: launchError }, site: { status: 0, error: launchError }, sharedHeadings: 0, sharedTexts: 0 }]))
      const census = await takeCensus(browser, { sample, site: o.site, source: o.source, sourcePrefix: o.sourcePrefix, timeoutMs: Math.min(120000, left()) }).catch((e) =>
        Object.fromEntries(sample.map((s) => [s.path, { source: s.referenceKind === 'none' ? { status: null, notApplicable: true, reason: 'reference.kind=none' } : { status: 0, error: firstLine(e) }, site: { status: 0, error: firstLine(e) }, sharedHeadings: 0, sharedTexts: 0 }]))
      )
      const perPage = await mapLimit(sample, o.concurrency, async (s) => {
        const got = []
        got.push(await probeStatus(ctx, s))
        got.push(await probeLayout(ctx, s))
        if (s.covers.includes('dark')) got.push(await probeDark(ctx, s))
        if (s.covers.some((c) => c.startsWith('animation:'))) got.push(await probeMotion(ctx, s))
        if (s.covers.some((c) => c.startsWith('hidden:'))) got.push(await probeHidden(ctx, s))
        if (s.covers.some((c) => c.startsWith('containers:'))) got.push(await probeContainers(ctx, s))
        return got
      })
      for (const [i, got] of perPage.entries())
        for (const g of got) {
          probes.push(g.out)
          Object.assign(probeCerts, g.out.certified)
          for (const cap of g.siteCaps ?? []) if (!coverage.capabilities.some((c) => c.id === cap)) coverage.capabilities.push({ id: cap, gate: 'animation', state: 'covered', page: sample[i].path, reason: `library ${cap.split(':')[1]} on the site` })
        }
      return census
    }
    const [runs, census] = await Promise.all([
      mapLimit(jobs, o.concurrency, async (j) => {
        const run = await runTool(j.argv, { timeoutMs: left(), logDir: path.join(out, j.tool), name: j.key === 'run' ? 'run' : `run-${String(j.i)}` })
        console.log(`${run.timedOut ? 'TIMEOUT' : `exit ${String(run.status)}`} ${j.tool} ${j.key} (${String(run.ms)} ms)`)
        return { tool: j.tool, key: j.key, run, report: readJson(j.report) }
      }),
      inPage()
    ])
    // an interrupted run writes no more evidence: what it read after the signal is not a reading
    if (STOP.now) return 130
    coverage.summary = summarise(coverage.capabilities)
    writeJson(path.join(out, 'census.json'), census)
    const results = {}
    for (const r of runs) (results[r.tool] ??= []).push(r)
    // the layout-boxes control: every content route whose paired blocks all differ, read against itself
    let controls = null
    for (const [idx, s] of sample.entries()) {
      if (s.role !== 'content') continue
      const lb = results['layout-boxes']?.find((r) => r.key === s.path)?.report?.results?.find((x) => x.route === s.path)
      if (!(lb && lb.paired >= 3 && lb.differing === lb.paired)) continue
      controls ??= {}
      controls[s.path] = {}
      await Promise.all(
        ['site', 'source'].map(async (side) => {
          const c = controlCommand({ ...common, side, route: s.path, index: idx, routePageMap: routePageMaps[idx] })
          const run = await runTool(c.argv, { timeoutMs: left(), logDir: path.join(out, 'layout-boxes'), name: c.key })
          console.log(`${run.timedOut ? 'TIMEOUT' : `exit ${String(run.status)}`} layout-boxes ${c.key} (${String(run.ms)} ms)`)
          controls[s.path][side] = { run, report: readJson(c.report) }
        })
      )
    }
    const verdict = judge({ sample, census, results, controls, tools: o.tools })

    // identity: the tools as they were when the run started; a file or commit that changed before
    // it ended means the readings came from two different tools
    const files = filesBefore
    const commit = commitBefore
    const toolChanged = [...changedInputs(Object.fromEntries(Object.entries(filesBefore).map(([k, h]) => [k, h ? { sha256: h } : { error: 'not readable' }])), Object.fromEntries(Object.entries(toolFiles()).map(([k, h]) => [k, h ? { sha256: h } : { error: 'not readable' }])))].map((x) => `tool file ${x}`)
    const commitAfter = await toolCommit()
    if (commitAfter.commit !== commitBefore.commit || commitAfter.dirty !== commitBefore.dirty) toolChanged.push(`tool commit (${String(commitBefore.commit)}${commitBefore.dirty ? '+dirty' : ''} → ${String(commitAfter.commit)}${commitAfter.dirty ? '+dirty' : ''})`)
    const fingerprint = identity ? toolFingerprint({ files, playwright: identity.playwright, browser: identity }) : null
    const unresolved = []
    if (!identity) unresolved.push(`browser: did not launch (${launchError})`)
    if (!commit.commit) unresolved.push(`tool commit: ${commit.error}`)
    for (const [f, h] of Object.entries(files)) if (h === null) unresolved.push(`tool file ${f}: not readable`)
    let runtimeIdentity
    if (runtime) runtimeIdentity = { from: 'manifest', manifest: path.resolve(o.runtimeManifest), images: runtime }
    else if (o.runtimeContainers.length) {
      const r = await inspectContainers(o.runtimeContainers)
      runtimeIdentity = { from: 'docker inspect', images: r.images }
      unresolved.push(...r.unresolved)
    } else {
      runtimeIdentity = { from: null, images: [] }
      unresolved.push('runtime images: neither --runtime-manifest nor --runtime-containers named them')
    }
    const loadedFaces = (side) => [...log.faces[side]]
    const fontFiles = [...log.entries.values()].filter((e) => e.type === 'font')
    for (const side of ['source', 'site']) if (loadedFaces(side).length && !fontFiles.some((f) => f.side === side)) unresolved.push(`fonts: ${String(loadedFaces(side).length)} face(s) loaded on the ${side} and no font file captured (an inline data: font or a cached file)`)
    unresolved.push(...log.unresolved.filter((u) => /\bfont\b/.test(u)).map((u) => `font file ${u}`))
    const sourceDocs = [...log.entries.values()].filter((e) => e.side === 'source' && e.type === 'document')
    for (const s of sample) if (s.referenceKind !== 'none' && !sourceDocs.some((d) => d.url === sourceUrlOf(o.source, o.sourcePrefix, s.path))) unresolved.push(`source document ${sourceUrlOf(o.source, o.sourcePrefix, s.path)}: bytes not captured`)
    unresolved.push(...log.unresolved.filter((u) => /^source (document|stylesheet)/.test(u)).map((u) => `source bytes ${u}`))
    // one resource, several bodies: the source (or a font server) did not serve one set of bytes to
    // this run — per-request tokens and form ids do this — so no single identity stands for what was
    // measured, and the run is not certified on it
    unresolved.push(...variedBodies([...log.entries.values()]))
    if (contract && o.spec) {
      const specHashNow = inputsBefore['spec/page-map.json'] ? sha256(Buffer.concat(['page-map.json', 'sections.json', 'content.json'].map((f) => readInputOrEmpty(path.join(o.spec, f))))) : null
      if (contract.source?.hash && specHashNow !== contract.source.hash) unresolved.push(`contract: bound to spec ${String(contract.source.hash)}, the spec now hashes ${String(specHashNow)} — regenerate the contract (contract.mjs init)`)
    }
    const inputsAfter = hashInputs({ routes: o.routes, contract: o.contract, spec: o.spec, runtimeManifest: o.runtimeManifest, priorLock: o.priorLock })
    const inputsChanged = [...changedInputs(inputsBefore, inputsAfter), ...toolChanged]
    const late = Date.now() > deadline
    const certification = certify({ capabilities: coverage.capabilities, probeCerts, verdict, tools: o.tools, unresolved, inputsChanged, late })
    const epoch = fingerprint ? epochOf(fingerprint, prior) : { fingerprint: null, sequence: null, previous: prior ? { fingerprint: prior.epoch.fingerprint, sequence: prior.epoch.sequence } : null, changed: null }

    const report = {
      tool: 'preflight.mjs',
      at: new Date().toISOString(),
      site: o.site,
      source: o.source,
      sample: sample.map(({ entry: _entry, referenceKind, ...s }) => (referenceKind === 'none' ? { ...s, referenceKind } : s)),
      selectors: selectorsRecord(selectors),
      tools: verdict.tools,
      verdict: verdict.verdict,
      reasons: verdict.reasons,
      census,
      controls: controls ? Object.fromEntries(Object.entries(controls).map(([route, sides]) => [route, Object.fromEntries(Object.entries(sides).map(([k, c]) => [k, { status: c.run.status, timedOut: c.run.timedOut, differing: c.report?.results?.[0]?.differing ?? null, paired: c.report?.results?.[0]?.paired ?? null }]))])) : null,
      coverage,
      discovery: discovery ? { limit: discovery.limit, scanned: Object.keys(discovery.pages), failed: discovery.failed, skipped: discovery.skipped, unreadable: discovery.unreadable, pages: discovery.pages } : { error: launchError },
      probes,
      probeCerts,
      certification,
      lock: { file: LOCK_FILE, fingerprint: epoch.fingerprint, sequence: epoch.sequence, changed: epoch.changed, unresolved }
    }
    const reportText = `${JSON.stringify(report, null, 2)}\n`
    const md = formatMarkdown(report)
    if (STOP.now) return 130
    writeAtomic(path.join(out, 'PREFLIGHT.md'), md)
    writeAtomic(path.join(out, 'PREFLIGHT.json'), reportText)
    const artifacts = {}
    for (const name of SEALED_ARTIFACTS) artifacts[name] = sha256(readInput(path.join(out, name), { raw: true, what: 'artifact' }))
    const resources = [...log.entries.values()].sort((a, b) => (`${a.side} ${a.type} ${a.url}` < `${b.side} ${b.type} ${b.url}` ? -1 : 1))
    const lock = {
      schema: LOCK_SCHEMA,
      complete: true,
      createdAt: new Date().toISOString(),
      epoch,
      tool: { root: SKILL_ROOT, ...commit, files, node: process.version, scope: 'hashed before the first measurement and again after the last', changedDuringRun: toolChanged },
      browser: identity,
      host: { platform: os.platform(), release: os.release(), arch: os.arch() },
      fonts: {
        families: { source: [...log.families.source].sort(), site: [...log.families.site].sort() },
        faces: { source: loadedFaces('source').sort(), site: loadedFaces('site').sort() },
        files: fontFiles.map((f) => ({ side: f.side, url: f.url, sha256s: f.sha256s, statuses: f.statuses, bytes: f.bytes })),
        system: 'a family with no loaded face is drawn from the host fonts; the host is named in `host`'
      },
      runtime: runtimeIdentity,
      inputs: { scope: 'the files named on the command line and the spec files, hashed at the start and again at the end of the run', files: inputsBefore, changedDuringRun: inputsChanged },
      source: {
        scope: 'the bytes the source served to this run: the documents of the scanned and sampled routes and their stylesheets (several hashes: the source served different bytes on different loads)',
        origin: o.source,
        prefix: o.sourcePrefix || null,
        documents: resources.filter((r) => r.side === 'source' && r.type === 'document').map(({ side: _s, type: _t, ...r }) => r),
        stylesheets: resources.filter((r) => r.side === 'source' && r.type === 'stylesheet' && !volatileStylesheet(r.url)).map(({ side: _s, type: _t, ...r }) => r),
        thirdPartyStylesheets: {
          scope: 'font-CSS services that answer per user agent and per load (source-identity.mjs VOLATILE_STYLESHEET_HOSTS): recorded, not compared — the font files they load are sealed in `fonts.files`',
          files: resources.filter((r) => r.side === 'source' && r.type === 'stylesheet' && volatileStylesheet(r.url)).map(({ side: _s, type: _t, ...r }) => r)
        }
      },
      site: { origin: o.site },
      sample: sample.map((s) => s.path),
      certification: { status: certification.status, reasons: certification.reasons, gates: Object.fromEntries(Object.entries(certification.gates).map(([g, x]) => [g, x.status])) },
      artifacts,
      unresolved
    }
    lock.digest = lockDigest(lock)
    if (STOP.now) return 130
    writeAtomic(path.join(out, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`)

    for (const [tool, v] of Object.entries(verdict.tools)) console.log(`${v.verdict.padEnd(12)} ${tool}${v.reasons.length ? ` — ${v.reasons.map((x) => x.code).join(', ')}` : ''} (findings kept: ${String(v.findings)})`)
    for (const x of verdict.reasons) console.log(`${x.kind.padEnd(12)} sample — ${x.code}: ${x.detail}`)
    for (const [g, x] of Object.entries(certification.gates)) console.log(`${x.status.padEnd(14)} gate ${g}${x.reasons.length ? ` — ${x.reasons.slice(0, 2).join('; ')}${x.reasons.length > 2 ? ` (+${String(x.reasons.length - 2)})` : ''}` : ''}`)
    console.log(`preflight: ${verdict.verdict}, certification ${certification.status}, lock epoch ${String(epoch.sequence)} → ${path.join(out, 'PREFLIGHT.md')}`)
    return verdict.verdict === 'trusted' && certification.status === 'complete' ? 0 : 1
  } finally {
    await lazy.close().catch(() => {})
    process.removeListener('SIGINT', interrupted)
    process.removeListener('SIGTERM', interrupted)
  }
}

function readInputOrEmpty(file) {
  try {
    return readInput(file, { raw: true })
  } catch {
    return Buffer.alloc(0)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(STOP.now ? 130 : code),
    (e) => {
      console.error(`preflight: ${e.stack ?? e.message}`)
      process.exit(1)
    }
  )
}
