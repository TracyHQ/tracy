#!/usr/bin/env node
// site-sweep.mjs — the cheap whole-site sweep of plain properties, port against source, read-only.
//
//   node scripts/visual/site-sweep.mjs --site <port origin> --source <source origin> --run-root <dossier>
//        [--spec <spec-pack>] [--widths 320,390,768,1024,1180,1440] [--schemes light,dark]
//        [--only <checks; default: all eleven — overflow,scheme,background,header,chips,fixed-widgets,icons,forms,text,first-interaction,heights>] [--pages /a,/b] [--concurrency N] [--deadline-ms N]
//        [--zip <theme.zip>] [--baseline <earlier output>] [--baseline-version <v>] [--settle-ms N] [--reload] [--no-source-cache] [--verbose]
//        [--full --reason "<text>"] --out <dir>
//   node scripts/visual/site-sweep.mjs --site <port origin> --source <source origin> --run-root <dossier> --only heights --explain <route>@<width> [--spec <spec-pack>] [--settle-ms N]
//   a baseline run needs --zip <the previous version's theme zip> (it names the version), or --baseline-version <v>.
//
// WHY. Defects of released ports were found only by measurement scripts written by hand for one port each,
// after release: sideways overflow at one width on some routes; a page half dark for a visitor whose system
// is dark and who has made no choice; page backgrounds that differ on some variants; category chips with the
// wrong colours on whole families of pages; a header taller or narrower at tablet widths. Each is "the same
// measurement on every route × width × scheme, port against source". This is that measurement.
//
// WHAT COUNTS. A DEFECT is a difference between port and source that a visitor can see (or that changes
// behaviour), counted ONCE per cause — same property, same landmark/selector, same delta — with the routes,
// widths and schemes it occurs on; the raw rows stay in the JSON. A difference nobody can see is LISTED, never
// counted; a pairing the tool is not sure of is NOT-MEASURED, never a defect.
//
// CHECKS:
//   overflow    document scroll width past the viewport by more than 1 px on the port where the source has none
//   scheme      for each state a visitor can be in — system light/dark × no saved choice / saved light / saved
//               dark — the page canvas and the landmark surfaces (header, main, first card, sidebar, footer) with
//               their text colours, paired by landmark: a surface on the other side of the scheme, or a colour
//               beyond the tolerance, is a defect; a root attribute that differs with nothing visible is listed
//   background  the page background a person sees (from the main content up, and at the left edge)
//   header      height, and the inset of each control paired BY ROLE (logo, menu button, search, theme toggle, call
//               to action), within 2 px; the type (size, weight, letter-spacing, case) of the site name, the call to
//               action and the menu words; a control only one side has is its own kind of defect; a header
//               box that differs while the content below starts at the same y is LISTED, not counted
//   chips       small painted labels (headings drawn as pills included) paired only when sure (same region, section
//               heading and text; a label standing as often on both sides is paired by order): background, text
//               colour, radius, font, box size; a size that differs only with the text's own width is listed; a chip
//               only one side has is its own kind of defect; chips that cannot be paired are `not-measured`, each
//               with its cause
//   heights            the page height and the top-level bands (header, each band of main, footer) with y and height, on a fresh load per route × width
//                      (the widths plus 576 and 992), after fonts, pictures and a quiet layout: bands paired by landmark and heading, an unpaired band
//                      is missing/extra/doubled, a band beyond 8 px is taken apart to the first child that differs (column count, padding/spacing
//                      step, font/line-height step, picture ratio, element missing, text wrap), counted once per CAUSE (site-sweep-heights*.mjs)
// BEHAVIOUR CHECKS (site-sweep-behaviour*.mjs; the default run is all eleven with `heights`, `--only` narrows it): what a visitor does or looks at
// that no box property shows —
//   fixed-widgets      back-to-top, floating buttons, cookie bars after scrolling: present on both sides, box, place, and a mark a visitor can
//                      SEE (a photograph of the widget against the paint behind it: a white chevron on a white tab has no ink)
//   icons              icon controls of the header and footer paired by link host / name / order: box, mark, place in the row; a different
//                      mark of the same size counts only when the pixels differ strongly, else it is listed
//   forms              forms paired by purpose: fields, types, required, focus on load, placeholder, label, box, links of the region on one
//                      side only, the focus look of a text field before and after focus
//   text               text blocks that end in another place (server-side cut against a CSS clamp), and case, size, weight, letter-spacing of
//                      nav and button labels
//   first-interaction  the theme switch on the FIRST click in each state (no saved choice, saved light, saved dark, an old "auto" value) at
//                      390/768/1440; the first touch tap on a parent menu item at 1024/1180; the mobile drawer (opens, rows, back row, close)
//                      A control that cannot be found is not-measured with the reason; review.config.json `sweep.behaviour` may name one.
// A fault of the SOURCE is not a port defect: both sides overflow, or the source swaps a header picture for a
// file that answers 404. Those go to `notDefects` with the evidence. Any other fault of the source, or a difference the
// port keeps by decision, is recorded by the dossier in review.config.json `sweep.accept` (site-sweep-accept.mjs): one row per
// group with explicit routes, ONE decision of DECISIONS.md and evidence; a row that matches nothing is an error.
//
// PAIRS AND HOOKS come from the dossier, as every other tool reads them: the run's visual.contract.json pages
// (port `path`, `sourceRoute`, declared `status`; a source with no URL rewrite is resolved through
// lib/source-routes.mjs), else the spec-pack's page-map.json; the dark/light switches through layout-boxes.mjs
// `hooksOf` (contract `design.theme` / `source.*Hook`, else review.config.json). review.config.json may add
// `"sweep": {"header": "<sel>"|{"site","source"}, "main": …, "chips": …}` for a port whose landmarks are unusual.
// A source the contract declares has no dark of its own (`source.darkDerived`, from page-map `theme.darkDerived`) has nothing to
// compare the port's dark with: its dark cells are NOT OWED — listed in `notOwed` with that reason, never counted as measured
// (the port's own dark is Visual QA's dark tiers). A side with no dark switch and no such declaration stays owed.
//
// SOURCE CACHE (site-sweep-source-cache.mjs). The source is frozen while the port is fixed: its readings (plain, scheme states, behaviour, heights, confirmation)
// are kept under <run-root>/source-cache/ and reused while the source's documents and resources answer byte for byte as when they were read; any other key
// difference (page, width, scheme, probe configuration, probe version) measures live. The port is always live. --no-source-cache and --reload measure the source live;
// --explain is a live diagnosis and never writes the cache. site-sweep.json `sourceCache` says per cell whether the source came from the cache.
//
// SPEED. One page per route and side and scheme: it is loaded once and RESIZED through the widths (largest
// first), not reloaded (`--reload` reloads at every width, to compare); the chips of the other chip width are always read on a fresh load. Routes run concurrently.
//
// RE-RUNS (site-sweep-scope.mjs). A run with no --only, --pages and --widths keeps a history in <run-root>/site-sweep-state.json, per site, source and
// dossier inputs. The first such run is full. A later one measures only what was unresolved in the history — the checks, routes, widths and schemes of the
// open groups, of what was owed and of the sweep.accept errors — and says so on stdout; what it does not measure is CARRIED with the run that measured it and
// keeps failing the run; a group open before and clean on every cell measured again is FIXED. A full run with a history needs `--full --reason "<text>"` (the
// reason is recorded); `--full` without a reason narrows. A scoped re-run writes no fix-measure.json.
// A group confirmed before and absent now is INTERMITTENT (counted, failing) until it is absent from 2 consecutive runs that measured every cell of it. The history is bound to a
// fingerprint of the source's served home page (lib/source-fingerprint.mjs), not only to its URL: another source is another history (--full --reason), and the fingerprint is
// written to site-sweep.json and fix-measure.json beside the run's `coverage` (lib/sweep-coverage.mjs), which `release.mjs --patch` holds the measure to. --only, --pages or --widths: the history is not used.
// The reports of --out, the snapshot the history cites and the history entry are published as one transaction (site-sweep-publish.mjs).
//
// OUTPUT in --out: summary.md and summary.json (the one file to read: per check the groups, most cells first, with examples, accept row, baseline state
// and evidence, and the not-measured causes once; see site-sweep-summary.mjs), site-sweep.json (every row), site-sweep.md (the long report), and with --zip fix-measure.json
// (tracy-fix-measure/v1 via lib/fix-measure.mjs — what `release.mjs --patch --measure` takes).
// STDOUT: one line per check (verdict, groups, cases, not measured) and the path of summary.md; `--verbose` prints site-sweep.md and a line per check on stderr.
// EXIT 0 no defect and nothing owed unmeasured; 1 a defect; 3 something owed was not measured (a route or a
// scheme that could not be read, the deadline, chips that could not be paired) and no defect; 2 usage, or a history that cannot be read;
// 4 the reports or the history could not be written. A partial sweep is never 0; a scoped re-run counts what it carries.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { withBrowser, withPage, mapLimit, withTimeout, DEFAULT_CONCURRENCY, DEFAULT_GOTO_TIMEOUT_MS } from '../lib/browser.mjs'
import { UsageError, parseStrict } from '../lib/cli-args.mjs'
import { declaredStatus } from '../lib/routes.mjs'
import { resolveSourceRoutes } from '../lib/source-routes.mjs'
import { freezeMotion } from '../lib/motion.mjs'
import { carriedEvidence, writeFixMeasure, FIX_MEASURE_SCHEMA, validateFixMeasure } from '../lib/fix-measure.mjs'
import { zipMemberText } from '../lib/zip-index.mjs'
import { coverageOf } from '../lib/sweep-coverage.mjs'
import { differsFrom, homeUrlOf, readSourceFingerprint, templateOf } from '../lib/source-fingerprint.mjs'
import { hooksOf } from './layout-boxes.mjs'
import { darkDerivedProblems } from '../lib/canonical.mjs'
import { contentPages } from './intrinsic-mobile.mjs'
import { sourceUrlOf } from './visual-qa.mjs'
import { probeInPage } from './site-sweep-probe.mjs'
import { measureBehaviour, judgeBehaviour, readStatic, THEME_WIDTHS, TOUCH_WIDTHS, DRAWER_WIDTHS } from './site-sweep-behaviour.mjs'
import { BEHAVIOUR_ORDER, judgeIcons, judgeTargetBehaviour } from './site-sweep-behaviour-judge.mjs'
import { summarise, summaryLines } from './site-sweep-summary.mjs'
import { acceptContextOf, settleVerdict } from './site-sweep-verdict.mjs'
import { createSourceCache, readSide } from './site-sweep-source-cache.mjs'
import { HEIGHTS_ID, heightsWidths, measureHeights } from './site-sweep-heights.mjs'
import { armDeadline, parseExplain, readDossierJson, runExplain } from './site-sweep-explain.mjs'
import { FULL_HINT, HistoryError, INTERMITTENT_ABSENT, applyHistory, coversOf, dossierName, dossierPath, effectiveExit, entryAfter, exitOfChecks, fullCoverage, identityOf, mergeRun, readState, recordsOf, regularOrAbsent, rejudgeChecks, resolveEntry, runRecord, scopeLine, scopeOf } from './site-sweep-scope.mjs'
import { EVIDENCE_DIR, OUTPUT_NAMES, PublishError, publish, settleOutput } from './site-sweep-publish.mjs'
import { HEIGHTS_TITLE, judgeHeights } from './site-sweep-heights-judge.mjs'
import { CHECK_ORDER, CHECK_TITLES, DARK_DERIVED_REASON, darkPassGap, exitCodeOf, groupDefects, judgeBackground, judgeChips, judgeHeader, judgeOverflow, judgeScheme, notDefectsForMeasure, fontWarnings, shownScheme } from './site-sweep-judge.mjs'
import { bindReferenceKinds, SWEEP_APPLICABILITY_VERSION, SWEEP_TARGET_CHECKS, sweepComparisonNotApplicable } from './applicability.mjs'

export const SWEEP_SCHEMA = 'tracy-site-sweep/v1'
export const DEFAULT_WIDTHS = [320, 390, 768, 1024, 1180, 1440]
export const DEFAULT_SCHEMES = ['light', 'dark']
const SIDE_TIMEOUT_MS = 180000
const SETTLE_MS = 500
const RESIZE_SETTLE_MS = 120
const HEIGHT = 900
const SCOPE_FLAGS = ['--only', '--pages', '--widths', '--schemes']
export const ALL_CHECKS = Object.freeze([...CHECK_ORDER, ...BEHAVIOUR_ORDER, HEIGHTS_ID])
const SYSTEMS = ['light', 'dark']
const SAVED = ['none', 'light', 'dark']

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const bySide = (v, side) => (v == null ? null : typeof v === 'string' ? v : (v[side] ?? null))
const stored = (st, value) => (!st ? null : st.type === 'cookie' ? `cookie:${st.key}=${value}` : st.type === 'localStorage' ? `ls:${st.key}=${value}` : null)

/** Explicit comparison obligations for every scheduled cell of a spec-bound none page. */
export function noneComparisonEvidence({ pairs, widths, heightsWidths = widths, schemes, only, anchorWidths = null, themeWidths = null }) {
  const out = []
  const anchors = anchorWidths ?? [...new Set([widths.includes(1440) ? 1440 : Math.max(...widths), widths.includes(390) ? 390 : Math.min(...widths)])]
  const themes = themeWidths ?? (widths.some((w) => THEME_WIDTHS.includes(w)) ? THEME_WIDTHS.filter((w) => widths.includes(w)) : anchors)
  const add = (check, route, width = null, scheme = null, state = null) => {
    const evidence = sweepComparisonNotApplicable('none', check)
    out.push({ ...evidence, route, ...(width != null ? { width } : {}), ...(scheme ? { scheme } : {}), ...(state ? { state } : {}) })
  }
  for (const p of pairs.filter((x) => x.referenceKind === 'none')) {
    for (const check of ['overflow', 'background', 'header', 'chips']) if (only.includes(check))
      for (const width of widths) for (const scheme of schemes) add(check, p.path, width, scheme)
    if (only.includes('scheme')) for (const sys of schemes) for (const saved of ['none', 'light', 'dark'])
      add('scheme', p.path, widths.includes(1440) ? 1440 : Math.max(...widths), null, `os-${sys}/${saved === 'none' ? 'no-choice' : `saved-${saved}`}`)
    for (const check of ['fixed-widgets']) if (only.includes(check)) for (const width of anchors) for (const scheme of schemes) add(check, p.path, width, scheme)
    for (const check of ['icons', 'forms', 'text']) if (only.includes(check)) for (const width of anchors) add(check, p.path, width, schemes[0])
    if (only.includes('first-interaction') && (p.path === '/' || p.path === (pairs.find((x) => x.path === '/')?.path ?? pairs[0]?.path))) {
      for (const width of themes) for (const sys of schemes) for (const saved of ['none', 'light', 'dark', 'auto']) add('first-interaction', p.path, width, null, `theme:${sys}/${saved}`)
      for (const width of TOUCH_WIDTHS.filter((w) => widths.includes(w))) add('first-interaction', p.path, width, null, 'touch')
      for (const width of DRAWER_WIDTHS.filter((w) => widths.includes(w))) add('first-interaction', p.path, width, null, 'drawer')
    }
    if (only.includes(HEIGHTS_ID)) for (const width of heightsWidths) add(HEIGHTS_ID, p.path, width)
  }
  return out
}

/**
 * The dossier's pairs and switches. `contract` is visual.contract.json, `config` review.config.json, `pageMap` the
 * spec-pack's page-map.json; any may be null, but one of contract/pageMap must give the pages.
 * → { pages: [{id, path, pagemapPath, status, view, sourceRoute, sourceRendered, referenceKind}], hooks, marks, selectors, hookError }
 */
export function dossierPlan({ contract = null, config = null, pageMap = null, specDir = null }) {
  let pages
  if (contract?.pages?.length) pages = contract.pages.map((p) => ({ id: p.id ?? p.path, path: p.path, pagemapPath: p.pagemapPath ?? null, status: p.status ?? null, view: p.view ?? null, sourceRoute: p.sourceRoute ?? null, sourceRendered: p.sourceRendered ?? null, referenceKind: p.referenceKind }))
  else if (pageMap) pages = contentPages(pageMap).map((p) => ({ id: p.path, path: p.path, pagemapPath: p.pagemapPath ?? p.path, status: declaredStatus(p), view: p.view ?? null, sourceRoute: p.path, sourceRendered: null, referenceKind: p.referenceKind }))
  else throw new UsageError('the dossier gives no pages: --run-root needs a visual.contract.json, or pass --spec <spec-pack> with a page-map.json')
  // a declared 3xx is the route's answer, not a page
  pages = pages.filter((p) => !(p.status >= 300 && p.status < 400))
  if (!contract && !config) throw new UsageError('the dossier gives no dark hook: --run-root needs a visual.contract.json or a review.config.json')
  const plan = { pages, hooks: { light: null, dark: null }, errors: [] }
  const get = (theme) => {
    try {
      return hooksOf({ theme, contract, config })
    } catch (e) {
      plan.errors.push(`${theme}: ${String(e.message).split('\n')[0]}`)
      return null
    }
  }
  // A source the contract declares has no dark of its own (source.darkDerived, page-map theme.darkDerived): the site's dark switch
  // still stands, the source has none, and that is a declaration rather than an error (darkPassGap) — only on a contract fresh for
  // the spec-pack read here (lib/canonical.mjs darkDerivedProblems, the freshness release.mjs reads); otherwise it closes nothing
  const untrusted = contract?.source?.darkDerived === true ? darkDerivedProblems(contract, { specDir }) : []
  for (const why of untrusted) plan.errors.push(`dark: source.darkDerived is not taken: ${why}`)
  const derived = contract?.source?.darkDerived === true && !untrusted.length
  const dark = derived ? derivedDarkHooks(contract, plan.errors) : get('dark')
  const light = get('light')
  const t = contract?.design?.theme
  const storage = t?.storage ?? config?.persistence ?? null
  const attribute = t?.attribute ?? config?.hook?.name ?? 'data-theme'
  const siteSavedLight = stored(storage, 'light') ?? (t ? `attr:${attribute}=${t.values?.light ?? 'light'}` : null)
  plan.hooks = {
    site: { dark: dark?.hooks.site.dark ?? null, light: siteSavedLight },
    source: { dark: dark?.hooks.source.dark ?? null, light: (contract ? contract.source?.lightHook : siteSavedLight) ?? null, ...(derived ? { darkDerived: true } : {}) },
    // the default light pass of a side that is dark by default (hooksOf: only then is there a light switch to apply)
    lightPass: { site: light?.hooks.site.light ?? null, source: light?.hooks.source.light ?? null }
  }
  const checks = (derived ? light : (dark ?? light))?.checks
  const marksOf = (check, lightValue) =>
    String(check ?? '')
      .split('+')
      .filter(Boolean)
      .map((part) => {
        const [kind, spec] = part.split(':')
        if (kind === 'class') return { kind: 'class', name: spec }
        const [name, value] = spec.split('=')
        return { kind: 'attr', name, dark: value ?? 'dark', light: lightValue }
      })
  const srcLightValue = /attr:[^=]+=([^+]+)/.exec(contract?.source?.lightHook ?? '')?.[1] ?? 'light'
  plan.marks = { site: marksOf(checks?.site, t?.values?.light ?? 'light'), source: marksOf(checks?.source, srcLightValue) }
  const sel = config?.sweep ?? {}
  plan.accept = sel.accept ?? []
  plan.behaviour = sel.behaviour ?? {}
  plan.selectors = { site: { header: bySide(sel.header, 'site'), main: bySide(sel.main, 'site'), footer: bySide(sel.footer, 'site'), chips: bySide(sel.chips, 'site') }, source: { header: bySide(sel.header, 'source'), main: bySide(sel.main, 'source'), footer: bySide(sel.footer, 'source'), chips: bySide(sel.chips, 'source') } }
  return plan
}

/** The site's dark switch for a source with no dark of its own: hooksOf with the source left out (its dark is null, not an error). */
function derivedDarkHooks(contract, errors) {
  try {
    const h = hooksOf({ theme: 'dark', contract, flags: { sourceDarkHook: 'attr:data-sweep-source-has-no-dark=1' } })
    return { ...h, hooks: { site: h.hooks.site, source: { dark: null } } }
  } catch (e) {
    errors.push(`dark: ${String(e.message).split('\n')[0]}`)
    return null
  }
}

/** A none kind is authority only when the page-map and reference.json bind the contract route. */
export function bindSweepKinds(plan, pageMap, reference) {
  const wantsNone = plan.pages.some((p) => p.referenceKind === 'none')
  if (!pageMap || !reference) {
    if (wantsNone) throw new UsageError('reference.kind=none requires --spec with page-map.json and reference.json to bind the page')
    return { referenceKinds: {}, errors: [] }
  }
  const bound = bindReferenceKinds(plan.pages, pageMap, reference)
  if (wantsNone || bound.errors.length) {
    if (bound.errors.length) throw new UsageError(bound.errors.join('\n'))
  }
  for (const p of plan.pages) {
    const kind = bound.referenceKinds[p.id] ?? bound.referenceKinds[p.path] ?? null
    if (kind != null) p.referenceKind = kind
  }
  return bound
}

/** The states a visitor can be in: system scheme × saved choice. `hooks` from dossierPlan; a state a side has no switch for is `unavailable` with the reason. */
export function schemeStates(hooks, schemes = DEFAULT_SCHEMES, referenceKind = null) {
  const states = []
  for (const sys of SYSTEMS) {
    if (!schemes.includes(sys)) continue
    for (const saved of SAVED) {
      const state = { id: `os-${sys}/${saved === 'none' ? 'no-choice' : `saved-${saved}`}`, sys, saved, hook: {}, unavailable: null }
      for (const side of (referenceKind === 'none' ? ['site'] : ['site', 'source'])) {
        const h = saved === 'none' ? null : hooks[side][saved]
        if (saved !== 'none' && !h) state.unavailable = `the dossier names no ${saved} switch for the ${side === 'site' ? 'port' : 'source'}`
        state.hook[side] = h
      }
      states.push(state)
    }
  }
  return states
}

/** Context options for one side in one scheme pass or state. `side` is 'site'|'source'; the saved choice rides as a request cookie (lib/browser.mjs) or an init script. */
export function contextFor({ side, origin, width = 1440, system, saved = null, hooks }) {
  const hook = saved === 'dark' || saved === 'light' ? hooks[side][saved] : null
  return {
    viewport: { width, height: HEIGHT },
    colorScheme: system,
    theme: saved === 'dark' ? 'dark' : 'light',
    darkRequestHook: saved === 'dark' ? hook : null,
    lightHook: saved === 'light' ? hook : null,
    hookUrl: origin
  }
}

/** The scheme passes of the sweep: light/dark as the toolchain defines them (visual-qa): system scheme + the side's own switch for it. */
export function passContext({ side, origin, width, scheme, hooks }) {
  const dark = scheme === 'dark'
  return {
    viewport: { width, height: HEIGHT },
    colorScheme: scheme,
    theme: scheme,
    darkRequestHook: dark ? hooks[side].dark : null,
    lightHook: dark ? null : (hooks.lightPass[side] ?? null),
    hookUrl: origin
  }
}

const settleFrames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

async function load(page, url, expect, settleMs) {
  let response
  // a transient failure (the demo host answering 502/503/504 under load, a timeout) is retried twice before the route is owed
  for (let attempt = 0; ; attempt++) {
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: DEFAULT_GOTO_TIMEOUT_MS })
      if (response && [502, 503, 504].includes(response.status()) && attempt < 2) {
        await page.waitForTimeout(1500 * (attempt + 1))
        continue
      }
      break
    } catch (e) {
      if (attempt >= 2) throw new Error(`${url}: ${String(e.message).split('\n')[0]}`)
    }
  }
  const status = response ? response.status() : 0
  // a page the dossier declares an error page (404) is measured as the page it is; any other must answer 2xx
  const ok = expect.error ? status > 0 : status >= 200 && status < 300
  if (!ok) throw new Error(`${url} answered ${status || 'nothing'}${expect.status ? `, declared ${expect.status}` : ', expected 2xx'}`)
  if (expect.onlyOrigin && new URL(page.url()).origin !== expect.onlyOrigin) throw new Error(`${url} ended on another origin (${new URL(page.url()).origin})`)
  await page.evaluate(() => document.fonts?.ready).catch(() => {})
  await page.waitForTimeout(settleMs)
  // a page that scrolled itself while loading (an autofocused field below the fold: the source's login form) is read from its top, as
  // every box the probes read is in viewport coordinates — its header otherwise measured -411px (ja-restaurant /your-profile)
  if (await page.evaluate(() => window.scrollY !== 0 || window.scrollX !== 0)) {
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
    await settleFrames(page)
  }
  await page.evaluate(() => (window.__sweepBare = document.querySelectorAll('link[rel~="stylesheet"], style').length === 0))
  await freezeMotion(page)
  return status
}

/**
 * Measure one route: both sides, every scheme, every width. Returns { rows, stateRows, owed, ms }.
 * rows: [{route, width, scheme, source: probe, port: probe}]; stateRows: [{route, state, source, port}].
 */
export async function sweepRoute(o) {
  const { browser, page: pg, plan, widths, schemes, only, deadlineAt, settleMs = SETTLE_MS, reload = false, log = () => {} } = o
  const started = Date.now()
  const rows = new Map()
  const stateRows = []
  const owed = []
  const notOwed = []
  const isError = pg.status >= 400
  const sides = [
    { name: 'port', side: 'site', origin: new URL(o.site).origin, url: new URL(pg.path, o.site).href, expect: { status: pg.status, error: isError, onlyOrigin: new URL(o.site).origin } },
    ...(pg.referenceKind === 'none' ? [] : [{ name: 'source', side: 'source', origin: new URL(pg.sourceUrl).origin, url: pg.sourceUrl, expect: { status: pg.status, error: isError } }])
  ]
  const wantSweep = ['overflow', 'background', 'header', 'chips'].some((c) => only.has(c))
  // a scoped re-run reads the chips and the scheme states at the widths the full run read them at (site-sweep-scope.mjs)
  const chipWidths = o.anchorWidths ?? [...new Set([widths.includes(1440) ? 1440 : Math.max(...widths), widths.includes(390) ? 390 : Math.min(...widths)])]
  const partsAt = (width) => ({ overflow: only.has('overflow'), bg: only.has('background'), header: only.has('header'), chips: only.has('chips') && chipWidths.includes(width) })
  const desc = [...widths].sort((a, b) => b - a)
  const cfgFor = (s, parts) => ({ parts, marks: plan.marks[s.side], selectors: plan.selectors[s.side] })
  const late = () => deadlineAt != null && Date.now() > deadlineAt

  const sweepStart = Date.now()
  if (wantSweep) {
    for (const scheme of schemes) {
      if (late()) {
        owed.push({ route: pg.path, scheme, reason: 'the deadline was reached before this scheme was measured' })
        continue
      }
      // a page with no reference (referenceKind none) has the port as its only side: only the port's dark switch is needed
      const gap = scheme !== 'dark' || sides.every((s) => plan.hooks[s.side].dark) ? null : darkPassGap(plan.hooks, schemes)
      if (gap === 'derived') {
        notOwed.push({ route: pg.path, scheme, checks: [...only].filter((c) => c !== 'scheme'), reason: DARK_DERIVED_REASON })
        continue
      }
      if (gap === 'owed') {
        owed.push({ route: pg.path, scheme, reason: `no dark switch for the ${sides.find((s) => !plan.hooks[s.side].dark).name}${plan.errors.length ? ` (${plan.errors.join('; ')})` : ''}` })
        continue
      }
      const results = await Promise.all(
        sides.map(async (s) => {
          let got = new Map()
          try {
            got = new Map(
              await withTimeout(
                // the source side's whole sequence (the resize through the widths and the fresh chip loads) is one cached reading
                readSide(
                  o,
                  { s, kind: 'plain', ctx: passContext({ side: s.side, origin: s.origin, width: desc[0], scheme, hooks: plan.hooks }), extra: { desc, parts: desc.map(partsAt), chipWidths, reload, resize: RESIZE_SETTLE_MS, marks: plan.marks[s.side], selectors: plan.selectors[s.side], settleMs }, label: desc.map((width) => ({ route: pg.path, scheme, width, check: 'plain' })) },
                  async (b) => {
                    const read = new Map()
                    if (reload) {
                      for (const width of desc) {
                        await withPage(b, passContext({ side: s.side, origin: s.origin, width, scheme, hooks: plan.hooks }), async (page) => {
                          await load(page, s.url, s.expect, settleMs)
                          read.set(width, await page.evaluate(probeInPage, cfgFor(s, partsAt(width))))
                        })
                      }
                    } else
                      await withPage(b, passContext({ side: s.side, origin: s.origin, width: desc[0], scheme, hooks: plan.hooks }), async (page) => {
                        await load(page, s.url, s.expect, settleMs)
                        for (const width of desc) {
                          await page.setViewportSize({ width, height: HEIGHT })
                          await settleFrames(page)
                          await page.waitForTimeout(RESIZE_SETTLE_MS)
                          read.set(width, await page.evaluate(probeInPage, cfgFor(s, partsAt(width))))
                        }
                      })
                    // chips are paired by the words and sections a page shows: a page that was resized shows other ones than the same page loaded at that width
                    // (a carousel re-cloned, a list re-flowed), so each chip width but the first is read on a fresh load, as a visitor's page is
                    if (!reload && only.has('chips'))
                      for (const width of chipWidths.filter((w) => w !== desc[0])) {
                        await withPage(b, passContext({ side: s.side, origin: s.origin, width, scheme, hooks: plan.hooks }), async (page) => {
                          await load(page, s.url, s.expect, settleMs)
                          const fresh = await page.evaluate(probeInPage, cfgFor(s, { chips: true }))
                          if (read.get(width) && fresh.chips) read.get(width).chips = fresh.chips
                        })
                      }
                    return [...read]
                  }
                ),
                SIDE_TIMEOUT_MS,
                `${pg.path} ${s.name} ${scheme}`
              )
            )
            return { s, got }
          } catch (e) {
            return { s, got, error: String(e.message).split('\n')[0] }
          }
        })
      )
      const failed = results.find((r) => r.error)
      if (failed) {
        owed.push({ route: pg.path, scheme, reason: `${failed.s.name}: ${failed.error}` })
        continue
      }
      for (const width of desc) rows.set(`${scheme}|${width}`, { route: pg.path, ...(pg.referenceKind === 'none' ? { referenceKind: 'none' } : {}), width, scheme, source: results.find((r) => r.s.name === 'source')?.got.get(width) ?? null, port: results.find((r) => r.s.name === 'port').got.get(width) })
    }
  }

  const sweepMs = Date.now() - sweepStart
  const schemeStart = Date.now()
  if (only.has('scheme')) {
    const sw = o.schemeWidth ?? (widths.includes(1440) ? 1440 : Math.max(...widths))
    for (const st of schemeStates(plan.hooks, schemes, pg.referenceKind)) {
      if (st.unavailable) {
        stateRows.push({ route: pg.path, ...(pg.referenceKind === 'none' ? { referenceKind: 'none' } : {}), state: st.id, sys: st.sys, saved: st.saved, unavailable: st.unavailable })
        continue
      }
      if (late()) {
        owed.push({ route: pg.path, state: st.id, reason: 'the deadline was reached before this state was measured' })
        continue
      }
      try {
        const got = await Promise.all(
          sides.map((s) =>
            withTimeout(
              (() => {
                const ctx = contextFor({ side: s.side, origin: s.origin, width: sw, system: st.sys, saved: st.saved, hooks: plan.hooks })
                return readSide(
                  o,
                  { s, kind: 'scheme-state', ctx, extra: { parts: { bg: true, root: true }, marks: plan.marks[s.side], selectors: plan.selectors[s.side], settleMs }, label: { route: pg.path, state: st.id, width: sw, check: 'scheme' } },
                  (b) =>
                    withPage(b, ctx, async (page) => {
                      await load(page, s.url, s.expect, settleMs)
                      return page.evaluate(probeInPage, cfgFor(s, { bg: true, root: true }))
                    })
                )
              })(),
              SIDE_TIMEOUT_MS,
              `${pg.path} ${s.name} ${st.id}`
            )
          )
        )
        stateRows.push({ route: pg.path, ...(pg.referenceKind === 'none' ? { referenceKind: 'none' } : {}), state: st.id, sys: st.sys, saved: st.saved, width: sw, ...(pg.referenceKind === 'none' ? { source: null } : { source: got[1] }), port: got[0] })
      } catch (e) {
        owed.push({ route: pg.path, state: st.id, reason: String(e.message).split('\n')[0] })
      }
    }
  }
  const schemeMs = Date.now() - schemeStart
  const ms = Date.now() - started
  log(`${pg.path}  ${(ms / 1000).toFixed(1)}s${owed.length ? `  OWED ${owed.length}` : ''}`)
  return { route: pg.path, sourceUrl: pg.sourceUrl, rows: [...rows.values()], stateRows, owed, notOwed, ms, sweepMs, schemeMs }
}

const imageStatusCache = new Map()
/** The status a picture URL answers (GET, redirects followed): 0 when it did not answer. */
export async function imageStatus(url) {
  if (!imageStatusCache.has(url)) {
    imageStatusCache.set(
      url,
      fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'tracy-site-sweep' } })
        .then((r) => {
          r.body?.cancel().catch(() => {})
          return r.status
        })
        .catch(() => 0)
    )
  }
  return imageStatusCache.get(url)
}

/** Judge everything the routes returned into checks. `statusOf` maps a picture URL to its status (injectable). */
export async function judgeAll({ routes, only, statusOf = imageStatus }) {
  // a source route that answers a page with no stylesheet (the web server's own 404) has no page to compare the port with:
  // the route is taken out of every check and named, with what the source answered, as not a defect
  const bare = []
  const usable = (list) => list.filter((x) => !(x.source?.bare === true && x.port?.bare === false))
  for (const r of routes) {
    const hit = [...r.rows, ...r.stateRows].find((x) => x.source?.bare === true && x.port?.bare === false)
    if (hit) bare.push({ route: r.route, what: 'bare-source-page', title: hit.source.title, sourceUrl: r.sourceUrl })
  }
  const allRows = routes.flatMap((r) => usable(r.rows))
  const allStateRows = routes.flatMap((r) => usable(r.stateRows.filter((x) => !x.unavailable)))
  const targetRows = allRows.filter((x) => x.referenceKind === 'none')
  const targetStateRows = allStateRows.filter((x) => x.referenceKind === 'none')
  const rows = allRows.filter((x) => x.referenceKind !== 'none')
  const stateRows = allStateRows.filter((x) => x.referenceKind !== 'none')
  const unavailable = routes.flatMap((r) => r.stateRows.filter((x) => x.unavailable))
  // a header height that differs may be the source's own missing picture: ask the files, so "404" is evidence and not a guess
  const fetchStatus = {}
  if (only.has('header')) {
    const urls = new Set()
    for (const r of rows) {
      const s = r.source?.header
      const p = r.port?.header
      // every header picture of the source that did not load: its height, and the inset of the control that holds it, may be its fault
      if (s && p) for (const b of s.broken ?? []) urls.add(b.src)
    }
    await Promise.all([...urls].map(async (u) => (fetchStatus[u] = await statusOf(u))))
  }
  const judged = {
    overflow: only.has('overflow') ? judgeOverflow(rows) : null,
    scheme: only.has('scheme') ? judgeScheme(stateRows) : null,
    background: only.has('background') ? judgeBackground(rows) : null,
    header: only.has('header') ? judgeHeader(rows, { fetchStatus }) : null,
    chips: only.has('chips') ? judgeChips(rows) : null
  }
  const owed = routes.flatMap((r) => r.owed)
  const probeMs = {}
  const partOf = { overflow: 'overflow', background: 'bg', header: 'header', chips: 'chips', scheme: 'root' }
  for (const r of rows) for (const side of [r.source, r.port]) for (const [c, part] of Object.entries(partOf)) probeMs[c] = (probeMs[c] ?? 0) + (side?.timing?.[part] ?? 0)
  for (const r of stateRows) for (const side of [r.source, r.port]) probeMs.scheme = (probeMs.scheme ?? 0) + (side?.timing?.root ?? 0) + (side?.timing?.bg ?? 0)
  const owedOf = (id) => owed.filter((o) => (id === 'scheme' ? o.state : !o.state))
  const checks = CHECK_ORDER.filter((id) => judged[id]).map((id) => {
    const j = judged[id]
    const owedHere = owedOf(id)
    return {
      id,
      title: CHECK_TITLES[id],
      cases: j.cases,
      // a defect is a CAUSE (same property, landmark and delta), not a row: the rows are in `defects[id]` of the report
      defects: groupDefects(j.defects).length,
      defectRows: j.defects.length,
      listed: j.listed.length,
      notDefects: j.notDefects.length,
      notMeasured: j.notMeasured.length + owedHere.length,
      pass: j.defects.length === 0 && j.notMeasured.length === 0 && owedHere.length === 0 && j.cases > 0,
      probeMs: Math.round(probeMs[id] ?? 0),
      ...(id === 'scheme' ? { statesUnavailable: statesUnavailable(unavailable, j.unhonoured ?? []) } : {}),
      ...(id === 'chips' ? { pages: j.pages, notMeasuredCauses: causeTally(j.notMeasured) } : {})
    }
  })
  const targetOutcomes = []
  const targetDefects = { overflow: [], scheme: [] }
  if (only.has('overflow')) for (const r of targetRows) {
    const value = r.port?.over
    const status = Number.isFinite(value) ? (value <= 1 ? 'pass' : 'fail') : 'not-measured'
    targetOutcomes.push({ check: 'overflow', route: r.route, width: r.width, scheme: r.scheme, status, ...(Number.isFinite(value) ? { observed: value, limit: 1 } : { reason: 'port overflow probe returned no finite scroll measurement' }) })
    if (status === 'fail') {
      const defect = { route: r.route, width: r.width, scheme: r.scheme, what: 'target-overflow', cause: 'target-overflow|port', source: null, port: value, culprit: r.port?.culprit?.selector ?? null }
      judged.overflow.defects.push(defect)
      targetDefects.overflow.push(defect)
    }
    if (status === 'not-measured') owed.push({ route: r.route, width: r.width, scheme: r.scheme, check: 'overflow', reason: 'port overflow probe returned no finite scroll measurement' })
  }
  if (only.has('scheme')) for (const r of targetStateRows) {
    const expected = r.saved === 'light' || r.saved === 'dark' ? r.saved : r.sys
    const shown = r.port ? shownScheme(r.port) : null
    const status = shown === null ? 'not-measured' : shown === expected ? 'pass' : 'fail'
    targetOutcomes.push({ check: 'scheme', route: r.route, width: r.width, state: r.state, status, expected, observed: shown })
    if (status === 'fail') {
      const defect = { route: r.route, state: r.state, what: 'target-scheme-state', expected, port: shown, cause: `target-scheme-state|${expected}` }
      judged.scheme.defects.push(defect)
      targetDefects.scheme.push(defect)
    }
    if (status === 'not-measured') owed.push({ route: r.route, state: r.state, check: 'scheme', reason: 'port scheme could not be determined from the probe' })
  }
  if (only.has('scheme')) for (const r of unavailable.filter((x) => x.referenceKind === 'none')) {
    targetOutcomes.push({ check: 'scheme', route: r.route, width: r.width, state: r.state, status: 'not-measured', reason: r.unavailable })
    owed.push({ route: r.route, state: r.state, check: 'scheme', reason: r.unavailable })
  }
  return { checks, judged, owed, rows: [...rows, ...targetRows], sourceRows: rows, stateRows: [...stateRows, ...targetStateRows], unavailable, bare, targetOutcomes, targetDefects, warnings: fontWarnings(rows).map((w) => ({ what: 'source-fonts-missing', ...w, note: `the source renders in ${w.source} (not a loaded web font) where the port loads ${w.port}: header insets, header height and chip sizes that depend on text width differ for a reason that is the source's` })), unhonoured: judged.scheme?.unhonoured ?? [] }
}

/** The chips that could not be paired, counted per cause (chips, pages) — what the output says the owed cases are and how each closes. */
function causeTally(notMeasured) {
  const out = {}
  for (const n of notMeasured) for (const c of n.causes ?? []) out[c.cause] = { chips: (out[c.cause]?.chips ?? 0) + c.chips, pages: (out[c.cause]?.pages ?? 0) + 1, why: c.why, example: out[c.cause]?.example ?? `${n.route} @${n.width} ${n.scheme}: ${c.detail[0]}` }
  return out
}

/** States the dossier cannot put a side in: no switch named, or the source did not take it (with the number of routes it was seen on). */
function statesUnavailable(unavailable, unhonoured) {
  const out = new Map()
  for (const u of unavailable) out.set(u.state, { state: u.state, reason: u.unavailable, routes: (out.get(u.state)?.routes ?? 0) + 1 })
  for (const u of unhonoured) out.set(u.state, { state: u.state, reason: u.reason, routes: (out.get(u.state)?.routes ?? 0) + 1 })
  return [...out.values()]
}

/** How each not-measured cause is closed: by the tool where it can be, else by a fix, or a decision through sweep.accept. */
const CLOSES = {
  'repeated-label': 'Closes when the two sides show the label the same number of times in the section (then they are paired by order); a different count is a difference of content to look at.',
  'nested-painted-boxes': 'Closes with `sweep.chips` naming the one element that is the chip on both sides.',
  'no-counterpart-section': 'Closes when the label sits under the same section heading on both sides, or with `sweep.chips` naming the elements.'
}

const pad = (n) => String(n).padStart(2, '0')
function formatDuration(ms) {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${pad(s % 60)}s` : `${s}s`
}

/** The Markdown summary: counts per check, two examples each, what was listed, what is not a defect, what is owed, the time. */
export function formatSummary(report) {
  const L = []
  L.push(`# Site sweep — ${report.site} against ${report.source}`, '')
  L.push(`Ran ${report.ranAt}. ${report.routesMeasured}/${report.routesTotal} route(s) measured; widths ${report.widths.join(', ')}; schemes ${report.schemes.join(', ')}; ${report.timing.concurrency} routes in parallel; **${formatDuration(report.timing.totalMs)}** wall; summed over routes, the width/scheme pass took ${formatDuration(report.timing.sweepPassSumMs)} and the scheme-state pass ${formatDuration(report.timing.schemePassSumMs)}.`, '')
  if (report.applicability?.comparisonFamilies) L.push(`${report.applicability.targetChecks?.passed ?? 0} target checks passed; ${report.checks.filter((c) => c.status === 'not-applicable').length} checks not-applicable; ${report.applicability.comparisonFamilies} comparison families not-applicable.`, '')
  if (report.run) L.push(...runLines(report), '')
  L.push('| check | cases | defects (causes) | rows | listed | not defects | accepted | not measured | in-page time |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const c of report.checks) L.push(`| ${c.carried ? `${c.id} (carried)` : c.id} | ${c.cases} | ${c.defects} | ${c.defectRows} | ${c.listed} | ${c.notDefects} | ${c.accepted ?? 0} | ${c.notMeasured} | ${(c.probeMs / 1000).toFixed(1)} s |`)
  L.push('', 'In-page time is the sum of the probes of that check over all pages (the page loads are shared by the checks of one pass and are in the wall time above).', '')
  for (const w of report.warnings ?? []) L.push(`> **Warning:** ${w.note} (${w.routes} route(s)).`, '')
  const val = (v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))
  for (const c of report.checks) {
    const defects = report.defects[c.id] ?? []
    const kept = report.carried?.[c.id]
    L.push(`## ${c.id}${c.carried ? ' — carried' : c.status === 'not-applicable' ? ' — not-applicable' : c.pass ? (c.scoped ? ' — clean in scope' : ' — clean') : ''}`, '')
    if (kept) L.push(...carriedLines(c, kept))
    for (const k of report.fixed?.[c.id] ?? []) L.push(`- fixed: \`${k}\` — confirmed in an earlier run, then absent from ${INTERMITTENT_ABSENT} consecutive runs that measured every cell of it`)
    for (const g of report.intermittent?.[c.id] ?? []) L.push(`- INTERMITTENT: \`${g.cause}\` — confirmed (last seen ${g.lastSeen.ranAt}), absent from ${g.absent} of ${g.needs} consecutive covering run(s) needed to count as fixed; it fails the check until then`)
    for (const d of (report.confirmationDemotions ?? []).filter((x) => x.check === c.id)) L.push(`- demoted by the fresh-load confirmation: \`${d.cause}\` — ${d.rows} row(s) on ${d.cells.length} cell(s); ${d.reason}`)
    if (report.fixed?.[c.id]?.length || report.intermittent?.[c.id]?.length || (report.confirmationDemotions ?? []).some((x) => x.check === c.id)) L.push('')
    if (c.carried) continue
    if (c.status === 'not-applicable') { L.push(`No source comparison applies to ${c.notApplicable} scheduled case(s) because the page binds to reference.kind=none.`, ''); continue }
    if (c.id === HEIGHTS_ID && report.heights) L.push(...formatHeights(report, c))
    if (!defects.length && !c.notMeasured) L.push(`No defect in ${c.cases} case(s)${c.scoped ? ' measured in this run' : ''}.`, '')
    if (defects.length && c.id !== HEIGHTS_ID) {
      const groups = report.groups[c.id]
      const carriedCells = groups.reduce((n, g) => n + (g.carriedCells ?? 0), 0)
      L.push(`${groups.length} defect(s) by cause (${defects.length} row(s) on ${new Set(defects.map((d) => d.route)).size} route(s)${carriedCells ? ` measured in this run; ${carriedCells} more cell(s) of these causes carried from earlier runs, not measured in this run` : ''}):`, '')
      for (const g of groups.slice(0, 16)) {
        const ex = g.example
        L.push(`- ${g.what} — ${g.occurrences} occurrence(s) on ${g.routes.length} route(s)${g.widths.length ? `, widths ${g.widths.join('/')}` : ''}${g.schemes.length ? `, ${g.schemes.join(' ')}` : ''}: source ${val(ex.source)}, port ${val(ex.port)}${g.culprit ? `, culprit \`${g.culprit}\`` : ''}${ex.rootNote ? ` (${ex.rootNote})` : ''}${g.carriedCells ? `; ${g.carriedCells} of its cell(s) carried from the run of ${g.carriedFrom.map((x) => x.ranAt).join(', ')}, not measured in this run` : ''}; cause \`${g.cause}\`; e.g. ${g.routes.slice(0, 3).map((x) => `\`${x}\``).join(', ')}`)
      }
      if (groups.length > 16) L.push(`- … ${groups.length - 16} more group(s), all in site-sweep.json`)
      L.push('')
    }
    if (BEHAVIOUR_ORDER.includes(c.id)) {
      for (const what of [...new Set((report.listed[c.id] ?? []).map((l) => l.what))]) {
        const list = report.listed[c.id].filter((l) => l.what === what)
        L.push(`Listed, not counted (${what}: ${list[0].why}): ${list.length} case(s); e.g. \`${list[0].route}\` ${list[0].chip}: ${list[0].source} → ${list[0].port}.`, '')
      }
      for (const [cause, x] of Object.entries(c.behaviourCauses ?? {})) L.push(`- not measured, **${cause}** — ${x.cases} case(s): ${x.why}; e.g. ${x.example}${c.notMeasurable?.some((n) => n.cause === cause) ? ' — RECORDED by sweep.accept as measured by hand (see Accepted below)' : ''}`)
      if (Object.keys(c.behaviourCauses ?? {}).length) L.push('')
    }
    if (c.id === 'scheme' && report.listed.scheme?.length) L.push(`Listed, not counted (the root attribute differs, nothing visible differs): ${report.listed.scheme.length} case(s); e.g. \`${report.listed.scheme[0].route}\` ${report.listed.scheme[0].state}: source ${report.listed.scheme[0].source}, port ${report.listed.scheme[0].port}.`, '')
    if (c.id === 'chips' && report.listed.chips?.length) {
      for (const what of [...new Set(report.listed.chips.map((l) => l.what))]) {
        const list = report.listed.chips.filter((l) => l.what === what)
        L.push(`Listed, not counted (${what}: ${list[0].why}): ${list.length} case(s); e.g. \`${list[0].route}\` ${list[0].chip}: ${list[0].source} → ${list[0].port}.`, '')
      }
    }
    if (c.id === 'header' && report.listed.header?.length) L.push(`Listed, not counted (header box differs while the content below starts at the same y — the hand script's rule): ${report.listed.header.length} case(s); e.g. \`${report.listed.header[0].route}\` @${report.listed.header[0].width} ${report.listed.header[0].scheme}: source ${report.listed.header[0].source}px, port ${report.listed.header[0].port}px, content top ${val(report.listed.header[0].contentTop)}.`, '')
    if (c.statesUnavailable?.length) L.push(`States not compared (the dossier cannot put the source in them), not counted as measured: ${c.statesUnavailable.map((u) => `${u.state} on ${u.routes} route(s) — ${u.reason}`).join('; ')}`, '')
    if (c.id === 'chips') {
      const pages = c.pages ?? []
      const n = (s) => pages.filter((p) => p.status === s).length
      L.push(`Chip pages: ${n('measured')} measured, ${n('none')} without chips on either side, ${n('not-measured')} NOT MEASURED (chips with no sure partner).`, '')
      for (const [cause, x] of Object.entries(c.notMeasuredCauses ?? {})) L.push(`- not measured, **${cause}** — ${x.chips != null ? `${x.chips} chip(s) on ` : ''}${x.pages} page case(s): ${x.why}; e.g. ${x.example}. ${c.notMeasurable?.some((n) => n.cause === cause) ? 'RECORDED by sweep.accept as measured by hand (see Accepted below).' : (CLOSES[cause] ?? '')}`)
      if ((c.notMeasuredCauses && Object.keys(c.notMeasuredCauses).length) || false) L.push('')
    }
  }
  if (report.accepted?.length) {
    L.push(`## Accepted by the dossier (${report.accepted.length} group(s), not counted; ${report.accepted.filter((a) => a.kind === 'not-measurable').length} of them a not-measured cause recorded as measured by hand)`, '')
    for (const a of report.accepted)
      if (a.kind === 'not-measurable') L.push(`- ${a.check}: not measured **${a.cause}** — ${a.occurrences} case(s), recorded ${a.recordedCases}; the tool cannot read it (${a.reason}); measured by hand: ${a.measurement}; evidence ${a.evidence}`)
      else L.push(`- ${a.check}: ${a.what} — ${a.kind} under ${a.decision}, ${a.occurrences} occurrence(s) on ${a.routes.length} route(s)${a.widths.length ? `, widths ${a.widths.join('/')}` : ''}${a.schemes.length ? `, ${a.schemes.join(' ')}` : ''}; cause \`${a.cause}\`; evidence ${a.evidence}${a.notCovered ? `; ${a.notCovered} more row(s) of the cause are not covered and stay defects` : ''}`)
    L.push('')
  }
  if (report.acceptErrors?.length) {
    L.push(`## sweep.accept rows in ERROR (${report.acceptErrors.length})`, '')
    for (const e of report.acceptErrors) L.push(`- ${e.message}`)
    L.push('')
  }
  if (report.notDefects.length) {
    L.push('## Not port defects (the source\'s own fault)', '')
    for (const n of report.notDefects) L.push(`- ${n.what} — ${n.why}. Evidence: ${n.evidence}`)
    L.push('')
  }
  if (report.notOwed?.length) {
    L.push(`## Not owed (${report.notOwed.length}): closed by a declaration, not measured`, '')
    for (const o of report.notOwed.slice(0, 20)) L.push(`- \`${o.route}\`${o.width != null ? ` @${o.width}` : ''}${o.scheme ? ` ${o.scheme}` : ''} (${(o.checks ?? [o.check]).join(', ')}): ${o.reason}`)
    if (report.notOwed.length > 20) L.push(`- … ${report.notOwed.length - 20} more in site-sweep.json`)
    L.push('')
  }
  if (report.owed.length) {
    L.push(`## Owed and not measured (${report.owed.length})`, '')
    for (const o of report.owed.slice(0, 20)) L.push(`- \`${o.route}\`${o.width != null && o.check === HEIGHTS_ID ? ` @${o.width}` : ''}${o.scheme ? ` ${o.scheme}` : ''}${o.state ? ` ${o.state}` : ''}: ${o.reason}`)
    if (report.owed.length > 20) L.push(`- … ${report.owed.length - 20} more in site-sweep.json`)
    L.push('')
  }
  L.push(`Exit ${report.exit}: ${report.exit === 0 ? 'no defect and nothing owed unmeasured' : report.exit === 1 ? 'defects found' : 'nothing found, but something owed was not measured — this is not a clean sweep'}.`, '')
  return L.join('\n')
}

/** What kind of run the report is, and what it stands on. */
function runLines(report) {
  const r = report.run
  if (r.mode === 'full') return [`Full run${r.reason ? ` — reason: ${r.reason}` : r.previous ? '' : ' (the first of this site, source and dossier)'}.`]
  const s = r.scope
  return [
    `**Scoped re-run**${r.fullWithoutReason ? ' (`--full` without `--reason` narrows)' : ''}: ${s.checks.length ? `checks ${s.checks.join(', ')}; ${s.routes.length} route(s); widths ${s.widths.join(', ') || '—'}${s.heightsWidths.length ? `; heights widths ${s.heightsWidths.join(', ')}` : ''}; schemes ${s.schemes.join(', ')}` : 'nothing was unresolved, nothing was measured'}. Everything else is carried from the run of ${r.previous.ranAt} (\`${r.previous.out}\`), on the full run of ${r.full.ranAt}${r.full.reason ? ` (${r.full.reason})` : ''}; a carried check or group is not measured here and is not a pass. ${FULL_HINT[0].toUpperCase()}${FULL_HINT.slice(1)}.`
  ]
}

/** What a check carries from earlier runs: the whole check, groups, owed cases, sweep.accept errors. */
function carriedLines(c, kept) {
  const L = []
  if (kept.whole) L.push(`Carried from the run of ${c.carriedFrom.ranAt} (\`${c.carriedFrom.out}\`): not measured in this run. ${kept.open.length} open group(s), ${kept.debt.length} case(s) owed, ${kept.acceptErrors.length} sweep.accept error(s) then.`, '')
  for (const g of kept.open) L.push(`- CARRIED ${g.what} — ${g.occurrences} cell(s) on ${g.routes.length} route(s)${g.widths.length ? `, widths ${g.widths.join('/')}` : ''}${g.schemes.length ? `, ${g.schemes.join(' ')}` : ''}; cause \`${g.cause}\`; measured ${g.measured.ranAt}, evidence \`${g.measured.out}\` ${g.evidence}${g.parts?.length > 1 ? ` (its cells come from the runs of ${g.parts.map((x) => `${x.ranAt}: ${x.cells}`).join(', ')})` : ''}; e.g. ${g.routes.slice(0, 3).map((x) => `\`${x}\``).join(', ')}`)
  for (const [cause, cells] of Object.entries(kept.cells)) L.push(`- \`${cause}\`: ${cells.length} more cell(s) of this group were not measured in this run and are carried`)
  if (kept.debt.length) L.push(`- CARRIED not measured: ${kept.debt.length} case(s) owed since ${kept.debt[0].measured.ranAt}; e.g. \`${kept.debt[0].route ?? '(every route)'}\`: ${kept.debt[0].cause} — ${kept.debt[0].reason}`)
  for (const e of kept.acceptErrors) L.push(`- CARRIED sweep.accept error (${e.measured.ranAt}): ${e.message}`)
  if (kept.open.length || Object.keys(kept.cells).length || kept.debt.length || kept.acceptErrors.length) L.push('')
  return L
}

/** The heights section: the table (port − source, in px) and the causes, each with what differs in plain terms. */
export function formatHeights(report, check) {
  const L = []
  const h = report.heights
  const tol = h.tolerance
  const widths = [...new Set(h.cells.map((x) => x.width))].sort((a, b) => a - b)
  const routes = [...new Set(h.cells.map((x) => x.route))]
  const cell = (r, w) => {
    const x = h.cells.find((y) => y.route === r && y.width === w)
    if (!x) return ''
    const sym = x.status === 'ok' ? '·' : x.status === 'not-measured' ? '?' : x.status === 'accepted' ? `(${x.delta})` : `${x.net > 0 ? '+' : ''}${x.net}`
    return sym
  }
  const bad = routes.filter((r) => h.cells.some((x) => x.route === r && x.status !== 'ok'))
  L.push(`Port − source page height in px, one fresh load per cell, widths ${widths.join('/')} (tolerance ±${tol} px; · within, (n) beyond but explained by an accepted cause, ? not measured). ${h.cells.length} cell(s), ${h.cells.filter((x) => x.status === 'defect').length} beyond tolerance, ${h.cells.filter((x) => x.status === 'accepted').length} explained by accepted causes${h.cells.some((x) => x.systemFace && x.status === 'defect') ? `; ${h.cells.filter((x) => x.systemFace && x.status === 'defect').length} of the cells beyond are on a source that draws in a system face (its web font did not load)` : ''}.`, '')
  if (bad.length) {
    L.push(`| route | ${widths.join(' | ')} |`, `|---|${widths.map(() => '---:').join('|')}|`)
    for (const r of bad.slice(0, 40)) L.push(`| \`${r}\` | ${widths.map((w) => cell(r, w)).join(' | ')} |`)
    if (bad.length > 40) L.push(`| … ${bad.length - 40} more route(s) in site-sweep.json | |`)
    L.push('')
  }
  if (routes.length - bad.length) L.push(`${routes.length - bad.length} route(s) within tolerance at every width.`, '')
  const groups = report.groups[HEIGHTS_ID] ?? []
  if (groups.length) {
    L.push(`${groups.length} cause(s) (${report.defects[HEIGHTS_ID].length} row(s) on ${new Set(report.defects[HEIGHTS_ID].map((d) => d.route)).size} route(s)):`, '')
    for (const g of groups.slice(0, 24)) {
      const ex = g.example
      const deltas = report.defects[HEIGHTS_ID].filter((d) => d.cause === g.cause).map((d) => d.delta)
      L.push(`- **${g.cause}** — ${ex.detail}; ${g.occurrences} cell(s) on ${g.routes.length} route(s), widths ${g.widths.join('/')}, ${Math.min(...deltas)}…${Math.max(...deltas)} px; culprit \`${ex.culprit}\`; e.g. ${g.routes.slice(0, 3).map((x) => `\`${x}\``).join(', ')}`)
    }
    if (groups.length > 24) L.push(`- … ${groups.length - 24} more cause(s), all in site-sweep.json`)
    L.push('')
  }
  const owedCauses = {}
  for (const n of report.notMeasured[HEIGHTS_ID] ?? []) owedCauses[n.cause] = { n: (owedCauses[n.cause]?.n ?? 0) + 1, why: n.why, e: owedCauses[n.cause]?.e ?? `${n.route} @${n.width}: ${n.detail}` }
  for (const [cause, x] of Object.entries(owedCauses)) L.push(`- not measured, **${cause}** — ${x.n} cell(s): ${x.why}; e.g. ${x.e}`)
  if (Object.keys(owedCauses).length) L.push('')
  return L
}

/** The theme version from a zip's style.css header, or null. */
export function themeVersionOf(zipBytes) {
  const css = zipMemberText(zipBytes, (n) => /^[^/]+\/style\.css$/.test(n) || n === 'style.css')
  return css ? (/^\s*Version:\s*(.+?)\s*$/im.exec(css)?.[1] ?? null) : null
}

/**
 * Why a baseline that ran other checks than this run is refused, and the fixes. A baseline from before `heights` ran ten checks: the same
 * theme zip's baseline is run again with all eleven, or this run is narrowed to the ten, or the check is declared `new` when the measures are merged.
 */
export function baselineMismatch(baselineIds, ours) {
  const lacking = ours.filter((c) => !baselineIds.includes(c))
  const hint = baselineIds.length === ALL_CHECKS.length - 1 && lacking.join() === HEIGHTS_ID ? ` The baseline is from before the ${HEIGHTS_ID} check existed (ten checks): run the baseline again with the same zip so that it runs all eleven (no --only), or run the ten with --only ${baselineIds.join(',')} and the new check on its own (--only ${HEIGHTS_ID}), then \`fix-measure.mjs merge <ten> <heights> --new ${HEIGHTS_ID}='<why it never ran on the previous version>'\` (references/quickstart.md).` : ''
  return `--baseline ran ${baselineIds.length} check(s) (${baselineIds.join(',')}), this run ${ours.length} (${ours.join(',')}): not the same checks. The default run is all eleven checks: run the baseline again with the same checks (no --only, or the same --only), or give this run --only ${baselineIds.join(',')}.${hint}`
}

export const BASELINE_NEEDS = 'a baseline run needs --zip <the previous version\'s theme zip> (that is what names the version it measured), or --baseline-version <v> when the earlier run had none'

/**
 * An earlier output (a site-sweep.json — with or without --zip — a fix-measure.json, or the directory holding one) → the baseline of
 * a fix-measure. The checks come from the earlier run's `checks` (a run without --zip has no fix-measure, but it has its checks);
 * the theme version comes from `--baseline-version`, else from the zip the earlier run was given.
 */
export function readBaseline(file, versionFlag = null) {
  let f = file
  if (existsSync(f) && statSync(f).isDirectory()) f = existsSync(path.join(f, 'site-sweep.json')) ? path.join(f, 'site-sweep.json') : path.join(f, 'fix-measure.json')
  try {
    settleOutput(path.dirname(f))
  } catch (e) {
    throw new UsageError(`--baseline ${file}: ${e.message}`)
  }
  if (!existsSync(f)) throw new UsageError(`--baseline ${file}: no such file`)
  let doc
  try {
    doc = readJson(f)
  } catch (e) {
    throw new UsageError(`--baseline ${file}: not valid JSON (${e.message})`)
  }
  const carriedWhy = carriedEvidence(doc)
  if (carriedWhy) throw new UsageError(`--baseline ${file}: ${carriedWhy} is not a baseline; give the output of a full run`)
  const m = doc.schema === FIX_MEASURE_SCHEMA ? doc : (doc.fixMeasure ?? (doc.schema === SWEEP_SCHEMA && Array.isArray(doc.checks) ? doc : null))
  if (!m?.checks?.length) throw new UsageError(`--baseline ${file}: neither a ${SWEEP_SCHEMA} site-sweep.json nor a ${FIX_MEASURE_SCHEMA} document`)
  const version = versionFlag ?? doc.theme?.version ?? null
  if (!version) throw new UsageError(`--baseline ${file}: the earlier output does not say which theme version it measured — ${BASELINE_NEEDS}`)
  // the group keys of a site-sweep.json (defect groups and accepted ones), per check; a fix-measure.json has none
  const groups = doc.schema === SWEEP_SCHEMA && doc.groups ? Object.fromEntries(m.checks.map((c) => [c.id, [...new Set([...(doc.groups[c.id] ?? []).map((g) => g.cause), ...(doc.accepted ?? []).filter((a) => a.check === c.id).map((a) => a.cause), ...(doc.carried?.[c.id]?.open ?? []).map((g) => g.cause), ...(doc.carried?.[c.id]?.accepted ?? []).map((a) => a.cause)])]])) : null
  const sourceFingerprint = m.sourceFingerprint ?? doc.sourceFingerprint ?? null
  const checks = m.checks.map((c) => c.status === 'not-applicable' ? { id: c.id, status: 'not-applicable' } : { id: c.id, ...(c.status ? { status: c.status } : {}), pass: c.pass === true })
  return { sha256: createHash('sha256').update(readFileSync(f)).digest('hex'), version, sourceFingerprint, applicability: m.applicability ?? doc.applicability ?? null, passed: checks.filter((c) => c.pass === true).length, total: m.checks.length, ranAt: m.ranAt ?? doc.ranAt, ids: m.checks.map((c) => c.id), checks, groups }
}

export const INPUTS_SCHEMA = 'tracy-sweep-inputs/v1'

const MAX_INPUT_FILES = 20000
const MAX_INPUT_BYTES = 1024 * 1024 * 1024

/** sha256 over every file under `dir` (path and bytes); null when it cannot be read whole, holds a link or a special file, or is too large. */
function digestDir(dir) {
  const h = createHash('sha256')
  let files = 0
  let bytes = 0
  const walk = (d, rel) => {
    for (const name of readdirSync(d).sort()) {
      const full = path.join(d, name)
      const at = rel ? `${rel}/${name}` : name
      const st = lstatSync(full)
      // a link is not bound: the bytes it reaches can change with the link as it is, so a spec-pack that holds one is not hashed whole
      if (st.isSymbolicLink()) throw new Error('symbolic link')
      else if (st.isDirectory()) walk(full, at)
      else if (st.isFile()) {
        if (++files > MAX_INPUT_FILES || (bytes += st.size) > MAX_INPUT_BYTES) throw new Error('too much')
        h.update(`file\0${at}\0${st.size}\0`).update(readFileSync(full))
      } else throw new Error('special file')
    }
  }
  try {
    walk(dir, '')
    return h.digest('hex')
  } catch {
    return null
  }
}

/**
 * What the dossier gave a sweep: the hash of every file whose content decides what is measured and how a group is judged (the contract,
 * review.config.json with its sweep.accept rows, DECISIONS.md) and of the WHOLE spec directory (the page map, sections, content and every
 * rendered source snapshot the pages name). A sweep records it (`inputs` of site-sweep.json) so that a later tool can tell that a measure was
 * taken on the dossier it holds now; the producer and the consumer compute it with this function. An input that cannot be hashed leaves `hash` null:
 * no measure is taken for one of this dossier then.
 */
export function sweepInputs(runRoot, specDir = null) {
  const hashOf = (file) => {
    try {
      return statSync(file).isFile() ? createHash('sha256').update(readFileSync(file)).digest('hex') : null
    } catch {
      return null
    }
  }
  const spec = specDir ? path.resolve(specDir) : null
  const files = { contract: hashOf(path.join(runRoot, 'visual.contract.json')), config: hashOf(path.join(runRoot, 'review.config.json')), decisions: hashOf(path.join(runRoot, 'DECISIONS.md')), spec: spec ? digestDir(spec) : null }
  const whole = !spec || files.spec !== null
  return { schema: INPUTS_SCHEMA, specDir: spec, files, hash: whole ? createHash('sha256').update(JSON.stringify({ spec, files })).digest('hex') : null }
}

/** The tracy-fix-measure/v1 checks of a judged sweep. */
export function fixChecks(checks) {
  return checks.map((c) => ({
    id: c.id,
    title: c.title,
    ...(c.status === 'not-applicable' ? { status: 'not-applicable' } : { pass: c.pass, ...(c.status ? { status: c.status } : {}) }),
    cases: c.cases,
    defects: c.defects,
    ...(c.intermittent ? { intermittent: c.intermittent } : {}),
    ...(c.notMeasurable?.length ? { notMeasurable: c.notMeasurable } : {}),
    ...(c.notApplicable ? { notApplicable: c.notApplicable } : {}),
    ...(c.target ? { target: c.target } : {}),
    ...(c.intermittent ? { note: `${c.intermittent} group(s) confirmed in an earlier run were not seen in this one and have not stayed absent long enough: intermittent, not fixed` } : c.notMeasured ? { note: `${c.notMeasured} case(s) owed were not measured` } : c.acceptErrors ? { note: `${c.acceptErrors} sweep.accept row(s) in error` } : c.accepted || c.notMeasurable?.length ? { note: `${[c.accepted ? `${c.accepted} group(s) accepted by the dossier (decision and evidence in notDefects)` : '', c.notMeasurable?.length ? `${c.notMeasurable.length} not-measured cause(s) recorded as measured by hand (${c.notMeasurable.map((n) => `${n.cause} ${n.cases} case(s)`).join(', ')}; reason, measurement and evidence in notMeasurable)` : ''].filter(Boolean).join('; ')}${c.listed ? `, ${c.listed} difference(s) listed, not counted` : ''}` } : c.listed ? { note: `${c.listed} difference(s) listed, not counted` } : {})
  }))
}

const JUDGES = { overflow: judgeOverflow, background: judgeBackground, header: (rows) => judgeHeader(rows), chips: judgeChips }
const PART_OF = { overflow: 'overflow', background: 'bg', header: 'header', chips: 'chips' }
const CONFIRM_CELLS = 3
// the painted marks of the icons (their size, ink and drawn glyph) are photographed once, after a scroll: a reading that no fresh load shows again (a mark read before it settled) is not a defect;
// the other icon groups (a missing icon, a different place in the row) are structure, read the same on every load, and are not re-measured
const CONFIRM_ICONS = {
  judge: judgeIcons,
  read: (page) => readStatic(page, { icons: true }),
  confirmable: (g) => /^icon-(mark-size|pixels|mark-invisible|glyph)$/.test(g.what),
  same: (d, g) => d.cause === g.cause
}

/**
 * A page is measured once and RESIZED through the widths, which a visitor never does: a layout that was sized by script at the
 * first width and not re-flowed (a carousel, a measured grid) shows a defect at the last width that a page LOADED at that width
 * does not have. So every defect group is confirmed on a fresh load: up to three of its cells (route × width × scheme, on
 * different routes) are loaded again at their own width, both sides, and measured again. A group that reproduces in none of
 * them is not a defect a visitor sees: its rows move to `listed` with that reason. → { kept, demoted } group counts per check;
 * every demoted group is also pushed to `demotions` with its cells, the cells re-measured and the reason, so a demotion is never silent.
 */
export async function confirmGroups({ browser, o, judged, routes, settleMs = SETTLE_MS, demotions = [] }) {
  const stat = {}
  const byRoute = new Map(o.pairs.map((p) => [p.path, p]))
  for (const id of [...Object.keys(JUDGES), 'icons']) {
    const j = judged[id]
    if (!j || !j.defects.length) continue
    stat[id] = { kept: 0, demoted: 0 }
    const stay = []
    for (const g of groupDefects(j.defects)) {
      if (id === 'icons' && !CONFIRM_ICONS.confirmable(g)) {
        stay.push(...j.defects.filter((d) => (d.cause ?? `${d.what}|${d.culprit ?? ''}`) === g.cause))
        stat[id].kept++
        continue
      }
      const rowsOf = j.defects.filter((d) => (d.cause ?? `${d.what}|${d.culprit ?? ''}`) === g.cause)
      const cells = []
      for (const d of rowsOf) if (!cells.some((c) => c.route === d.route && c.width === d.width && c.scheme === d.scheme) && cells.length < 40) cells.push(d)
      const pick = []
      for (const c of cells) if (!pick.some((x) => x.route === c.route) && pick.length < CONFIRM_CELLS) pick.push(c)
      for (const c of cells) if (pick.length < CONFIRM_CELLS && !pick.includes(c)) pick.push(c)
      let reproduced = false
      let ran = 0
      for (const c of pick) {
        const pg = byRoute.get(c.route)
        if (!pg?.sourceUrl && pg?.referenceKind !== 'none') continue
        try {
          if (pg.referenceKind === 'none') {
            if (id !== 'overflow') { reproduced = true; ran = 0; break }
            const s = { side: 'site', origin: new URL(o.site).origin, url: new URL(pg.path, o.site).href, expect: { status: pg.status, error: pg.status >= 400, onlyOrigin: new URL(o.site).origin } }
            const ctx = passContext({ side: s.side, origin: s.origin, width: c.width, scheme: c.scheme, hooks: o.plan.hooks })
            const port = await readSide({ browser, sourceCache: o.sourceCache }, { s, kind: `confirm-target-${id}`, ctx, extra: { parts: { overflow: true }, settleMs }, label: { route: c.route, width: c.width, scheme: c.scheme, check: `confirm:${id}` } }, (b) => withPage(b, ctx, async (page) => {
              await load(page, s.url, s.expect, settleMs)
              return page.evaluate(probeInPage, { parts: { overflow: true } })
            }))
            ran++
            const value = port?.over
            if (!Number.isFinite(value) || value > 1) { reproduced = true; break }
            continue
          }
          const read = async (s) => {
            const ctx = passContext({ side: s.side, origin: s.origin, width: c.width, scheme: c.scheme, hooks: o.plan.hooks })
            return readSide(
              { browser, sourceCache: o.sourceCache },
              { s, kind: `confirm-${id}`, ctx, extra: { parts: id === 'icons' ? { icons: true } : { [PART_OF[id]]: true }, marks: o.plan.marks[s.side], selectors: o.plan.selectors[s.side], settleMs }, label: { route: c.route, width: c.width, scheme: c.scheme, check: `confirm:${id}` } },
              (b) =>
                withPage(b, ctx, async (page) => {
                  await load(page, s.url, s.expect, settleMs)
                  return id === 'icons' ? CONFIRM_ICONS.read(page) : page.evaluate(probeInPage, { parts: { [PART_OF[id]]: true }, marks: o.plan.marks[s.side], selectors: o.plan.selectors[s.side] })
                })
            )
          }
          const isError = pg.status >= 400
          const [port, source] = await Promise.all([
            read({ side: 'site', origin: new URL(o.site).origin, url: new URL(pg.path, o.site).href, expect: { status: pg.status, error: isError, onlyOrigin: new URL(o.site).origin } }),
            read({ side: 'source', origin: new URL(pg.sourceUrl).origin, url: pg.sourceUrl, expect: { status: pg.status, error: isError } })
          ])
          ran++
          const again = (id === 'icons' ? CONFIRM_ICONS.judge : JUDGES[id])([{ route: c.route, width: c.width, scheme: c.scheme, source, port }])
          if (again.defects.some((d) => (id === 'icons' ? CONFIRM_ICONS.same(d, g) : d.what === g.what))) {
            reproduced = true
            break
          }
        } catch {
          // an unreachable page on the re-check says nothing: the group stays as measured
          ran = 0
          reproduced = true
          break
        }
      }
      if (reproduced || !ran) {
        stay.push(...rowsOf)
        stat[id].kept++
      } else {
        stat[id].demoted++
        const reason = `${id === 'icons' ? 'the mark was photographed before it settled; a fresh load draws it as the other side does' : 'it appears only after the page is resized, which a visitor does not do'}`
        demotions.push({ check: id, cause: g.cause, what: g.what, rows: rowsOf.length, cells: cells.map((c) => [c.route, c.width, c.scheme]), remeasured: pick.map((c) => [c.route, c.width, c.scheme]), reason: `does not reproduce on a fresh load (${ran} cell(s) re-measured): ${reason}` })
        for (const d of rowsOf) j.listed.push({ ...d, why: `does not reproduce on a fresh load at ${d.width}px (${ran} cell(s) re-measured): ${reason}` })
      }
    }
    j.defects = stay
  }
  return stat
}

/**
 * The whole sweep. `o`: { browser, site, source, plan, pairs: [{path, status, sourceUrl}], widths, schemes, only, concurrency,
 * deadlineAt, reload, settleMs, log, statusOf }. Returns the report object (not yet written).
 * A scoped re-run adds `anchorWidths`, `schemeWidth`, `themeWidths`, `homePath` (what the full run read) and `acceptPartial`.
 */
export async function runSweep(o) {
  const started = Date.now()
  const only = new Set(o.only)
  const log = o.log ?? (() => {})
  const owedRoutes = []
  const measurable = []
  for (const p of o.pairs) {
    if (p.sourceUrl || p.referenceKind === 'none') measurable.push(p)
    else owedRoutes.push({ route: p.path, reason: p.owedReason ?? 'no source route to pair this page with' })
  }
  const t0 = Date.now()
  // the behaviour checks (site-sweep-behaviour.mjs) run after the five plain-property checks and add their own checks to the same report
  const plainOnly = new Set(CHECK_ORDER.filter((c) => only.has(c)))
  const wantBehaviour = BEHAVIOUR_ORDER.some((c) => only.has(c))
  const wantHeights = only.has(HEIGHTS_ID)
  const routes = await mapLimit(plainOnly.size ? measurable : [], o.concurrency ?? DEFAULT_CONCURRENCY, async (pg) => {
    try {
      return await sweepRoute({ ...o, page: pg, only: plainOnly, log })
    } catch (e) {
      return { route: pg.path, rows: [], stateRows: [], owed: [{ route: pg.path, reason: String(e.message).split('\n')[0] }], ms: 0 }
    }
  })
  const wallMs = Date.now() - t0
  for (const r of owedRoutes) routes.push({ route: r.route, rows: [], stateRows: [], owed: [{ route: r.route, reason: r.reason }], ms: 0 })
  const j = await judgeAll({ routes, only: plainOnly, statusOf: o.statusOf })
  const comparisonOutcomes = noneComparisonEvidence({ pairs: o.pairs, widths: o.widths, heightsWidths: o.heightsWidths ?? o.widths, schemes: o.schemes, only: [...only], anchorWidths: o.anchorWidths, themeWidths: o.themeWidths })
  const targetOutcomes = [...j.targetOutcomes, ...comparisonOutcomes]
  const targetDefects = Object.fromEntries(Object.entries(j.targetDefects ?? {}).map(([id, rows]) => [id, [...rows]]))
  // every owed entry names the checks it is owed by: a route with no source is owed by every check of the run
  for (const x of j.owed) x.checks = x.state ? ['scheme'] : x.scheme ? [...plainOnly].filter((c) => c !== 'scheme') : [...only]
  // dark cells closed by the contract's declaration that the source has no dark of its own (darkPassGap): listed, never owed
  const notOwed = routes.flatMap((r) => r.notOwed ?? [])
  if (wantBehaviour) {
    const measured = await measureBehaviour({ ...o, only, load, passContext, settleMs: o.settleMs ?? SETTLE_MS })
    notOwed.push(...(measured.notOwed ?? []))
    const jb = judgeBehaviour(measured)
    j.checks.push(...jb.checks)
    Object.assign(j.judged, jb.judged)
    j.owed.push(...measured.owed.map((x) => ({ ...x, checks: x.checks ?? measured.want.filter((c) => (c === 'first-interaction') === Boolean(x.state)) })))
    j.behaviourRows = measured.rows
    for (const id of ['fixed-widgets', 'icons', 'forms', 'first-interaction']) {
      const targetRows = (measured.rows[id] ?? []).filter((r) => r.referenceKind === 'none')
      if (!targetRows.length) continue
      const jt = judgeTargetBehaviour(id, targetRows)
      targetOutcomes.push(...jt.outcomes)
      j.owed.push(...jt.owed.map((x) => ({ route: x.route, width: x.width, state: x.state, check: id, reason: x.reason })))
      j.judged[id] ??= { cases: 0, defects: [], listed: [], notMeasured: [], notDefects: [] }
      targetDefects[id] = jt.defects
      j.judged[id].defects.push(...jt.defects)
    }
  }
  if (wantHeights) {
    const t1 = Date.now()
    const hw = o.heightsWidths ?? o.widths
    const hm = await measureHeights({ ...o, only, load, passContext, heightsWidths: hw, settleMs: o.settleMs ?? SETTLE_MS })
    const jh = judgeHeights(hm.rows)
    j.owed.push(...hm.owed)
    notOwed.push(...(hm.notOwed ?? []))
    const owedHere = hm.owed.length
    j.judged[HEIGHTS_ID] = jh
    j.checks.push({
      id: HEIGHTS_ID,
      title: HEIGHTS_TITLE,
      cases: jh.cases,
      defects: groupDefects(jh.defects).length,
      defectRows: jh.defects.length,
      listed: jh.listed.length,
      notDefects: jh.notDefects.length,
      notMeasured: jh.notMeasured.length + owedHere,
      pass: jh.defects.length === 0 && jh.notMeasured.length === 0 && owedHere === 0 && jh.cases > 0,
      probeMs: Date.now() - t1,
      heightsOwed: owedHere,
      heightsWidths: hw
    })
    j.heightsRead = { widths: hw, rows: hm.rows.length, ms: Date.now() - t1 }
  }
  // what the dossier records as the source's fault or a decision moves out of the defects (before the confirmation: it is not re-measured)
  const rowsOfAccept = o.accept?.rows ?? o.plan?.accept ?? []
  // An exception about the reference cannot waive a target invariant. Exclude target-only failures
  // from accept matching, then restore them so they remain in the verdict and report.
  for (const [id, rows] of Object.entries(targetDefects)) if (rows.length) {
    const targets = new Set(rows)
    j.judged[id].defects = j.judged[id].defects.filter((d) => !targets.has(d))
  }
  const accept = settleVerdict(j.judged, { rows: rowsOfAccept, decisions: o.accept?.decisions ?? null, runRoot: o.accept?.runRoot ?? process.cwd() }, { routes: o.pairs.map((p) => p.path), widths: o.widths, heightsWidths: wantHeights ? (o.heightsWidths ?? o.widths) : null, partial: Boolean(o.acceptPartial) })
  for (const [id, rows] of Object.entries(targetDefects)) if (rows.length) j.judged[id].defects.push(...rows)
  const demotions = []
  const confirmed = o.confirm === false ? null : await confirmGroups({ browser: o.browser, o, judged: j.judged, routes, settleMs: o.settleMs, demotions })
  // the checks were counted before the accept rows and the confirmation: count them again
  for (const c of j.checks) {
    const x = j.judged[c.id]
    if (!x) continue
    const errs = accept.errors.filter((e) => e.check === c.id).length
    const acc = accept.accepted.filter((a) => a.check === c.id)
    // a not-measured cause the dossier measured by hand (kind `not-measurable`) no longer fails the check; it stays listed with its count
    const closed = acc.filter((a) => a.kind === 'not-measurable')
    c.notMeasured -= accept.closedItems?.[c.id] ?? 0
    Object.assign(c, {
      defects: groupDefects(x.defects).length,
      defectRows: x.defects.length,
      listed: x.listed.length,
      notDefects: x.notDefects.length,
      accepted: acc.length - closed.length,
      acceptErrors: errs,
      ...(closed.length ? { notMeasurable: closed.map((a) => ({ cause: a.cause, cases: a.occurrences, recordedCases: a.recordedCases, reason: a.reason, measurement: a.measurement, evidence: a.evidence })) } : {}),
      pass: x.defects.length === 0 && c.notMeasured === 0 && errs === 0 && x.cases > 0
    })
  }
  for (const c of j.checks) {
    if (!targetOutcomes.length) continue
    const target = targetOutcomes.filter((x) => x.check === c.id && x.status !== 'not-applicable')
    const defects = target.filter((x) => x.status === 'fail').length
    const debt = target.filter((x) => x.status === 'not-measured').length
    c.notApplicable = targetOutcomes.filter((x) => x.check === `sweep-${c.id}-comparison` && x.status === 'not-applicable').length
    if (target.length) c.target = { cases: target.length - debt, passed: target.filter((x) => x.status === 'pass').length, defects, notMeasured: debt }
    if (target.length) {
      c.cases += target.length - debt
      c.notMeasured += debt
      c.pass = c.defects === 0 && c.notMeasured === 0 && (c.cases > 0 || c.notApplicable > 0)
      c.status = c.pass ? 'pass' : 'fail'
    } else if (c.notApplicable > 0 && c.cases === 0 && c.defects === 0 && c.notMeasured === 0) {
      c.status = 'not-applicable'
      delete c.pass
    } else if (c.notApplicable > 0 && c.cases === 0 && c.defects === 0 && c.notMeasured > 0) {
      c.status = 'not-measured'
      c.pass = false
    }
  }
  const defects = {}
  const listed = {}
  const notDefects = [...j.bare]
  const notMeasured = {}
  for (const [id, x] of Object.entries(j.judged)) {
    if (!x) continue
    defects[id] = x.defects
    listed[id] = x.listed
    notMeasured[id] = x.notMeasured
    notDefects.push(...x.notDefects)
  }
  // the cells this run read on both sides: a run that read none (no route, every cell owed, or closed unread) never exits 0
  const measuredCells = j.rows.length + j.stateRows.length + new Set(Object.values(j.behaviourRows ?? {}).flat()).size + (j.heightsRead?.rows ?? 0)
  const exit = Math.max(exitCodeOf(j.checks, j.owed), measuredCells ? 0 : 3)
  const routesMeasured = plainOnly.size ? routes.filter((r) => !r.owed.length).length : measurable.length - new Set(j.owed.map((x) => x.route)).size
  return {
    schema: SWEEP_SCHEMA,
    tool: 'site-sweep.mjs',
    ranAt: new Date(started).toISOString(),
    site: o.site,
    source: o.source,
    widths: o.widths,
    schemes: o.schemes,
    only: [...only],
    reload: Boolean(o.reload),
    sourceCache: o.sourceCache ? o.sourceCache.summary() : { enabled: false, bypass: o.pairs.length && o.pairs.every((p) => p.referenceKind === 'none') ? 'not-applicable: all renderable pages bind to reference.kind=none' : 'no source cache was given', cached: 0, live: 0, cells: [] },
    routesTotal: o.pairs.length,
    routesMeasured,
    checks: j.checks,
    ...(targetOutcomes.length ? { applicability: {
      version: SWEEP_APPLICABILITY_VERSION,
      outcomes: targetOutcomes,
      comparisonNotApplicable: targetOutcomes.filter((x) => x.status === 'not-applicable').length,
      comparisonFamilies: [...new Set(targetOutcomes.filter((x) => x.status === 'not-applicable').map((x) => x.check))].length,
      target: Object.fromEntries(['pass', 'fail', 'not-measured'].map((status) => [status, targetOutcomes.filter((x) => x.status === status).length])),
      targetChecks: (() => {
        const groups = new Map()
        for (const x of targetOutcomes.filter((r) => r.status !== 'not-applicable')) groups.set(x.check, [...(groups.get(x.check) ?? []), x.status])
        return { passed: [...groups.values()].filter((xs) => xs.length && xs.every((x) => x === 'pass')).length, failed: [...groups.values()].filter((xs) => xs.some((x) => x !== 'pass')).length }
      })()
    } } : {}),
    defects,
    groups: Object.fromEntries(Object.entries(defects).map(([id, rows]) => [id, groupDefects(rows)])),
    listed,
    notMeasured,
    notDefects: [
      ...notDefectsForMeasure(notDefects),
      ...accept.accepted.filter((a) => a.kind === 'not-measurable').map((a) => ({ what: `${a.check}: ${a.cause} not measurable by the tool, ${a.occurrences} case(s) (recorded ${a.recordedCases})`, why: `${a.reason} — measured by hand: ${a.measurement}`, evidence: a.evidence }))
    ],
    notDefectCases: notDefects,
    closedNotMeasured: Object.fromEntries(Object.entries(j.judged).filter(([, x]) => x?.closedNotMeasured?.length).map(([id, x]) => [id, x.closedNotMeasured])),
    accepted: accept.accepted,
    acceptErrors: accept.errors,
    acceptSkipped: accept.skipped,
    warnings: j.warnings,
    confirmation: confirmed,
    confirmationDemotions: demotions,
    owed: j.owed,
    notOwed,
    measuredCells,
    exit,
    timing: { concurrency: o.concurrency ?? DEFAULT_CONCURRENCY, totalMs: Date.now() - started, routesWallMs: wallMs, sweepPassSumMs: routes.reduce((n, r) => n + (r.sweepMs ?? 0), 0), schemePassSumMs: routes.reduce((n, r) => n + (r.schemeMs ?? 0), 0), perRouteMs: routes.map((r) => ({ route: r.route, ms: r.ms })) },
    rows: j.rows,
    behaviourRows: j.behaviourRows ?? undefined,
    heights: j.judged[HEIGHTS_ID] ? { tolerance: j.judged[HEIGHTS_ID].tolerance, ...j.heightsRead, cells: j.judged[HEIGHTS_ID].cells } : undefined,
    stateRows: [...j.stateRows, ...j.unavailable]
  }
}


/** The report of a scoped re-run that had nothing to measure: no check ran, every check is carried (site-sweep-scope.mjs applyHistory). */
export function emptyReport({ site, source, concurrency = DEFAULT_CONCURRENCY, started = Date.now() }) {
  return { schema: SWEEP_SCHEMA, tool: 'site-sweep.mjs', ranAt: new Date(started).toISOString(), site, source, widths: [], schemes: [], only: [], reload: false, routesTotal: 0, routesMeasured: 0, checks: [], defects: {}, groups: {}, listed: {}, notMeasured: {}, notDefects: [], notDefectCases: [], accepted: [], acceptErrors: [], acceptSkipped: [], warnings: [], confirmation: null, owed: [], notOwed: [], exit: 0, timing: { concurrency, totalMs: Date.now() - started, routesWallMs: 0, sweepPassSumMs: 0, schemePassSumMs: 0, perRouteMs: [] }, rows: [], stateRows: [] }
}

// ---- command line ---------------------------------------------------------------------------------------------------

/** `--only heights --explain <route>@<width>`: the walk of one page at one width (site-sweep-explain.mjs). Reads the dossier, writes nothing, always ends the process. */
async function explainMain(argv) {
  const USAGE = 'usage: site-sweep.mjs --site <port origin> --source <source origin> --run-root <dossier> --only heights --explain <route>@<width> [--spec <spec-pack>] [--settle-ms N]'
  let args
  let target
  let cfg
  try {
    args = parseStrict(argv, { values: ['--site', '--source', '--run-root', '--spec', '--only', '--settle-ms', '--explain'] })
    target = parseExplain(args.opt('--explain'))
    if (target.error) throw new UsageError(target.error)
    if (args.opt('--only') !== 'heights') throw new UsageError('--explain is a mode of the heights check: --only heights --explain <route>@<width>')
    for (const n of ['--site', '--run-root']) if (!args.opt(n)) throw new UsageError(`${n} is required`)
    const origin = (n) => {
      try {
        const u = new URL(args.opt(n))
        if (!/^https?:$/.test(u.protocol)) throw new Error('scheme')
        return u.origin
      } catch {
        throw new UsageError(`${n} ${args.opt(n)} is not an http(s) origin`)
      }
    }
    const settle = args.opt('--settle-ms') ? Number(args.opt('--settle-ms')) : SETTLE_MS
    if (!Number.isInteger(settle) || settle < 0) throw new UsageError('--settle-ms must be an integer ≥ 0')
    cfg = { site: origin('--site'), source: args.opt('--source') ? origin('--source') : null, runRoot: path.resolve(args.opt('--run-root')), settleMs: settle }
    if (!existsSync(cfg.runRoot)) throw new UsageError(`--run-root ${cfg.runRoot}: no such directory`)
    if (args.opt('--spec') && !existsSync(path.join(args.opt('--spec'), 'page-map.json'))) throw new UsageError(`--spec ${args.opt('--spec')}: no page-map.json in it`)
  } catch (e) {
    if (!(e instanceof UsageError)) throw e
    console.error(`site-sweep: ${e.message}\n${USAGE}`)
    process.exit(2)
  }
  // the one deadline of the command starts before the dossier is read
  const disarm = armDeadline({ label: `${target.route} @${target.width}` })
  let code
  try {
    const file = (n) => path.join(cfg.runRoot, n)
    const contract = readDossierJson(file('visual.contract.json'), 'visual.contract.json')
    const config = readDossierJson(file('review.config.json'), 'review.config.json')
    const specDir = args.opt('--spec') ?? (existsSync(path.join(cfg.runRoot, 'spec', 'page-map.json')) ? path.join(cfg.runRoot, 'spec') : null)
    const pageMap = specDir ? readDossierJson(path.join(specDir, 'page-map.json'), 'page-map.json') : null
    const reference = specDir ? readDossierJson(path.join(specDir, 'reference.json'), 'reference.json') : null
    const plan = dossierPlan({ contract, config, pageMap, specDir })
    bindSweepKinds(plan, pageMap, reference)
    plan.contract = contract
    plan.specDir = specDir
    const pg = plan.pages.find((p) => p.path === target.route)
    if (!pg) throw new UsageError(`--explain: ${target.route} is not a route of the dossier`)
    if (pg.referenceKind === 'none') {
      console.log(`explain ${target.route} @${target.width}: heights comparison not-applicable — reference.kind=none (bound by page-map.json and reference.json)`)
      code = 0
    } else if (!cfg.source) throw new UsageError('--source is required for a page not bound to reference.kind=none')
    else {
    const resolve = async () => {
      const live = !pg.sourceRendered && pg.sourceRoute && pg.status < 400
      const resolved = live ? await resolveSourceRoutes(cfg.source, [pg.sourceRoute]) : { results: {}, failed: [] }
      const routed = live && resolved.results[pg.sourceRoute]?.url
      const sourceUrl = routed || sourceUrlOf(pg, { spec: plan.specDir, sourceSite: cfg.source, contract: plan.contract ?? { source: { site: cfg.source } } })
      const unresolved = !sourceUrl || (live && !routed && resolved.failed.some((f) => f.route === pg.sourceRoute))
      return { ...pg, sourceUrl: unresolved ? null : sourceUrl, owedReason: unresolved ? `the source route ${pg.sourceRoute ?? '(none)'} cannot be resolved on ${cfg.source}` : undefined }
    }
    const measure = (browser, pair) => measureHeights({ browser, site: cfg.site, source: cfg.source, plan, pairs: [pair], widths: [target.width], heightsWidths: [target.width], schemes: DEFAULT_SCHEMES, concurrency: 1, settleMs: cfg.settleMs, load, passContext })
    code = await runExplain({ route: target.route, width: target.width, resolve, withBrowser, measure, accept: acceptContextOf(plan.accept, cfg.runRoot) })
    }
  } catch (e) {
    console.error(`site-sweep: ${String(e.message).split('\n')[0]}\n${USAGE}`)
    code = 2
  }
  disarm()
  process.exit(code)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain && process.argv.includes('--explain')) await explainMain(process.argv.slice(2))
if (isMain) {
  const USAGE =
    'usage: site-sweep.mjs --site <port origin> --source <source origin> --run-root <dossier> [--spec <spec-pack>] [--widths 320,390,768,1024,1180,1440] [--schemes light,dark] [--only <checks; default: all eleven — overflow,scheme,background,header,chips,fixed-widgets,icons,forms,text,first-interaction,heights>] [--pages /a,/b] [--concurrency N] [--deadline-ms N] [--zip <theme.zip>] [--baseline <earlier site-sweep output>] [--baseline-version <v>] [--settle-ms N] [--reload] [--no-source-cache] [--verbose] [--full --reason "<text>"] --out <dir>\n  --no-source-cache  measure the source live (the default reuses its readings from <run-root>/source-cache/ while the source is unchanged; --reload bypasses it too)\n  --full       with no --only, --pages and --widths a run after the first measures only what was unresolved in <run-root>/site-sweep-state.json; --full --reason "<text>" measures everything and records the reason; --full without a reason narrows\n  --zip        binds fix-measure.json to the theme zip and names its version; a baseline run needs --zip <the previous version\'s theme zip> (or --baseline-version <v>)\n  --baseline   an earlier site-sweep output (a directory or its site-sweep.json, run with or without --zip) or a fix-measure.json; it must have run the same checks (the default is all eleven)\n  sweep.accept in review.config.json records the source\'s faults and decisions (references/visual-qa.md)'
  let args
  let cfg
  try {
    args = parseStrict(process.argv.slice(2), { values: ['--site', '--source', '--run-root', '--spec', '--widths', '--schemes', '--only', '--pages', '--concurrency', '--deadline-ms', '--zip', '--baseline', '--baseline-version', '--settle-ms', '--reason', '--out'], flags: ['--reload', '--verbose', '--full', '--no-source-cache'] })
    if (args.has('--reason') && !args.flag('--full')) throw new UsageError('--reason goes with --full')
    for (const n of ['--site', '--run-root', '--out']) if (!args.opt(n)) throw new UsageError(`${n} is required`)
    const list = (n, fallback, ok) => {
      const v = args.opt(n) ? args.opt(n).split(',').filter(Boolean) : fallback
      for (const x of v) if (!ok(x)) throw new UsageError(`${n}: ${JSON.stringify(x)} is not allowed`)
      if (!v.length) throw new UsageError(`${n} is empty`)
      return v
    }
    const int = (n, fallback, min) => {
      if (!args.opt(n)) return fallback
      const v = Number(args.opt(n))
      if (!Number.isInteger(v) || v < min) throw new UsageError(`${n} must be an integer ≥ ${min}`)
      return v
    }
    const origin = (n) => {
      try {
        const u = new URL(args.opt(n))
        if (!/^https?:$/.test(u.protocol)) throw new Error('scheme')
        return u.origin
      } catch {
        throw new UsageError(`${n} ${args.opt(n)} is not an http(s) origin`)
      }
    }
    cfg = {
      site: origin('--site'),
      source: args.opt('--source') ? origin('--source') : null,
      widths: list('--widths', DEFAULT_WIDTHS.map(String), (x) => Number.isInteger(Number(x)) && Number(x) >= 200 && Number(x) <= 3000).map(Number),
      schemes: list('--schemes', DEFAULT_SCHEMES, (x) => DEFAULT_SCHEMES.includes(x)),
      only: list('--only', ALL_CHECKS, (x) => ALL_CHECKS.includes(x)),
      pages: args.opt('--pages') ? list('--pages', [], (x) => x.startsWith('/')) : null,
      concurrency: int('--concurrency', DEFAULT_CONCURRENCY, 1),
      deadlineMs: int('--deadline-ms', null, 1000),
      settleMs: int('--settle-ms', SETTLE_MS, 0),
      heightsWidths: null,
      // a scope the caller names is the caller's: the history is neither read nor written
      explicitScope: ['--only', '--pages', '--widths'].some((n) => args.has(n)),
      reason: String(args.opt('--reason') ?? '').trim(),
      out: path.resolve(args.opt('--out')),
      runRoot: path.resolve(args.opt('--run-root'))
    }
    cfg.heightsWidths = heightsWidths(cfg.widths, Boolean(args.opt('--widths')))
    if (!existsSync(cfg.runRoot)) throw new UsageError(`--run-root ${cfg.runRoot}: no such directory`)
    if (existsSync(cfg.out) && !statSync(cfg.out).isDirectory()) throw new UsageError(`--out ${cfg.out}: not a directory`)
    if (args.opt('--spec') && !existsSync(path.join(args.opt('--spec'), 'page-map.json'))) throw new UsageError(`--spec ${args.opt('--spec')}: no page-map.json in it`)
    if (args.opt('--zip') && !existsSync(args.opt('--zip'))) throw new UsageError(`--zip ${args.opt('--zip')}: no such file`)
  } catch (e) {
    if (!(e instanceof UsageError)) throw e
    console.error(`site-sweep: ${e.message}\n${USAGE}`)
    process.exit(2)
  }

  let plan
  let baseline = null
  let zip = null
  // the history of this dossier's sweeps (site-sweep-scope.mjs): read only by a run with no --only, --pages and --widths
  let run = null
  let scope = null
  let previous = null
  let identity = null
  let allPages = []
  let fullRoutes = []
  let sourceFp = null
  let sourceHome = null
  let sourceTemplate = null
  let sourceSame = true
  try {
    const file = (n) => path.join(cfg.runRoot, n)
    const contract = existsSync(file('visual.contract.json')) ? readJson(file('visual.contract.json')) : null
    const config = existsSync(file('review.config.json')) ? readJson(file('review.config.json')) : null
    const specDir = args.opt('--spec') ?? (existsSync(path.join(cfg.runRoot, 'spec', 'page-map.json')) ? path.join(cfg.runRoot, 'spec') : null)
    const pageMap = specDir ? readJson(path.join(specDir, 'page-map.json')) : null
    const reference = specDir && existsSync(path.join(specDir, 'reference.json')) ? readJson(path.join(specDir, 'reference.json')) : null
    plan = dossierPlan({ contract, config, pageMap, specDir })
    bindSweepKinds(plan, pageMap, reference)
    plan.applicabilityVersion = SWEEP_APPLICABILITY_VERSION
    const hasSourcePages = plan.pages.some((p) => p.referenceKind !== 'none')
    if (hasSourcePages && !cfg.source) throw new UsageError('--source is required for every page not bound to reference.kind=none')
    if (!hasSourcePages) cfg.source = null
    // the rows that record the source's faults and the port's decisions are refused before a browser starts
    const acceptContext = acceptContextOf(plan.accept, cfg.runRoot)
    if (acceptContext) plan.acceptContext = acceptContext
    plan.contract = contract
    plan.specDir = specDir
    fullRoutes = plan.pages.map((p) => p.path)
    // which source this run measures against: its served home page and declared template identity, read before the history is chosen
    if (hasSourcePages) {
      sourceHome = homeUrlOf({ source: cfg.source, contract })
      sourceTemplate = templateOf(specDir)
      const fp = await readSourceFingerprint({ url: sourceHome, template: sourceTemplate })
      if (!fp.ok) throw new UsageError(`the source cannot be fingerprinted: ${fp.error}`)
      sourceFp = fp.fingerprint
    }
    if (cfg.pages) {
      const known = new Set(plan.pages.map((p) => p.path))
      const unknown = cfg.pages.filter((p) => !known.has(p))
      if (unknown.length) throw new UsageError(`--pages: ${unknown.join(', ')} is not a route of the dossier`)
      plan.pages = plan.pages.filter((p) => cfg.pages.includes(p.path))
    }
    if (args.opt('--zip')) {
      const bytes = readFileSync(args.opt('--zip'))
      zip = { sha256: createHash('sha256').update(bytes).digest('hex'), version: themeVersionOf(bytes) }
    }
    for (const n of OUTPUT_NAMES) regularOrAbsent(path.join(cfg.out, n), 'the output file')
    if (!cfg.explicitScope) {
      identity = identityOf({ site: cfg.site, source: cfg.source, plan, specDir })
      const state = readState(cfg.runRoot)
      previous = resolveEntry(state.doc?.runs[identity.key] ?? null)
      // the accept rows are not part of the identity: what the history carries is judged again by the rows of now, before the scope is taken
      if (previous) {
        const checks = rejudgeChecks(previous.effective.checks, plan.accept ?? [], { fullScope: previous.full.scope })
        previous = { ...previous, effective: { exit: exitOfChecks(Object.values(checks)), checks } }
      }
      allPages = plan.pages.map((p) => p.path)
      // the history is of one source: a rebuilt or different source at the same URL is a new source (identityOf keys on the URL alone)
      const sourceWhy = previous && hasSourcePages ? (previous.sourceFingerprint ? differsFrom(previous.sourceFingerprint, sourceFp) : 'the history records no source fingerprint') : null
      sourceSame = !sourceWhy
      if (sourceWhy && !(args.flag('--full') && cfg.reason)) throw new HistoryError(`the sweep history was not taken on this source (${sourceWhy}), so it is not reused; ${FULL_HINT}, which measures everything and starts the history again on this source`)
      const stands = previous ? { previous: { ranAt: previous.latest.ranAt, out: previous.latest.out, mode: previous.latest.mode, exit: previous.latest.exit }, full: { ranAt: previous.full.ranAt, out: previous.full.out, reason: previous.full.reason } } : { previous: null, full: null }
      if (previous && !(args.flag('--full') && cfg.reason)) {
        scope = scopeOf(previous, { schemes: cfg.schemes, pages: allPages })
        run = { mode: 'scoped', reason: null, fullWithoutReason: args.flag('--full'), scope: { checks: scope.checks, routes: scope.routes, widths: scope.widths, heightsWidths: scope.heightsWidths, schemes: scope.schemes }, excluded: scope.excluded, ...stands, history: dossierPath(cfg.runRoot, state.file) }
        cfg.only = scope.checks
        cfg.widths = scope.widths
        cfg.heightsWidths = scope.heightsWidths
        cfg.schemes = scope.schemes
        plan.pages = plan.pages.filter((p) => scope.routes.includes(p.path))
      } else run = { mode: 'full', reason: cfg.reason || null, scope: { checks: [...ALL_CHECKS], routes: allPages, widths: cfg.widths, heightsWidths: cfg.heightsWidths, schemes: cfg.schemes }, ...stands, history: dossierPath(cfg.runRoot, state.file), source: sourceSame ? (previous ? 'same' : 'new') : 'changed' }
    }
    if (args.opt('--baseline')) {
      baseline = readBaseline(args.opt('--baseline'), args.opt('--baseline-version'))
      // a scoped re-run reports every check of the full run it stands on
      const ran = run?.mode === 'scoped' ? previous.full.scope.checks : cfg.only
      if (baseline.ids.slice().sort().join() !== ran.slice().sort().join()) throw new UsageError(baselineMismatch(baseline.ids, ran))
      const baseWhy = sourceFp && baseline.sourceFingerprint ? differsFrom(baseline.sourceFingerprint, sourceFp) : null
      if (baseWhy) throw new UsageError(`--baseline ${args.opt('--baseline')} was measured against another source (${baseWhy}): a baseline is taken on the same source as the run`)
      if (sourceFp && !baseline.sourceFingerprint) console.error('site-sweep: --baseline records no source fingerprint; a patch release refuses it — run the baseline again')
      if (!sourceFp) {
        const binding = baseline.applicability?.binding
        const currentInputs = sweepInputs(cfg.runRoot, specDir)
        const currentKinds = Object.fromEntries(plan.pages.map((p) => [p.path, p.referenceKind ?? null]))
        if (!binding || JSON.stringify(binding.kinds) !== JSON.stringify(currentKinds) || binding.specHash !== currentInputs.files.spec || binding.contractHash !== currentInputs.files.contract)
          throw new UsageError(`--baseline ${args.opt('--baseline')} has no matching all-none applicability binding for this spec and contract`)
      }
    }
  } catch (e) {
    if (e instanceof HistoryError) {
      console.error(`site-sweep: ${e.message}`)
      process.exit(2)
    }
    if (!(e instanceof UsageError)) {
      console.error(`site-sweep: ${String(e.message).split('\n')[0]}\n${USAGE}`)
      process.exit(2)
    }
    console.error(`site-sweep: ${e.message}\n${USAGE}`)
    process.exit(2)
  }

  const started = Date.now()
  const log = (m) => console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${m}`)
  const scoped = run?.mode === 'scoped'
  const first = run ? scopeLine(run, allPages.length) : null
  if (first) console.log(first)
  let report
  if (scoped && scope.empty) report = emptyReport({ site: cfg.site, source: cfg.source, concurrency: cfg.concurrency, started })
  else {
    // pair each page with its source address: the same rule as every other tool (a source without URL rewrite is resolved once)
    const live = plan.pages.filter((p) => p.referenceKind !== 'none' && !p.sourceRendered && p.sourceRoute && p.status < 400)
    const resolved = live.length ? await resolveSourceRoutes(cfg.source, [...new Set(live.map((p) => p.sourceRoute))]) : { results: {}, failed: [] }
    const pairs = plan.pages.map((p) => {
      if (p.referenceKind === 'none') return { ...p, sourceUrl: null, owedReason: undefined }
      const routed = !p.sourceRendered && resolved.results[p.sourceRoute]?.url
      const sourceUrl = routed || sourceUrlOf(p, { spec: plan.specDir, sourceSite: cfg.source, contract: plan.contract ?? { source: { site: cfg.source } } })
      const unresolved = !sourceUrl || (live.includes(p) && !routed && resolved.failed.some((f) => f.route === p.sourceRoute))
      return { ...p, sourceUrl: unresolved ? null : sourceUrl, owedReason: unresolved ? `the source route ${p.sourceRoute ?? '(none)'} cannot be resolved on ${cfg.source}` : undefined }
    })
    log(`${pairs.length} route(s) × ${cfg.widths.length} width(s) × ${cfg.schemes.length} scheme(s), checks ${cfg.only.join(',')}, ${cfg.concurrency} in parallel`)
    const asFull = scoped ? { anchorWidths: scope.anchorWidths, schemeWidth: scope.schemeWidth, themeWidths: scope.themeWidths, homePath: scope.homePath, acceptPartial: true } : {}
    const sourceCache = sourceFp ? createSourceCache({ dir: path.join(cfg.runRoot, 'source-cache'), enabled: !args.flag('--no-source-cache') && !args.flag('--reload'), reason: args.flag('--no-source-cache') ? '--no-source-cache' : '--reload', sourceId: sourceFp.id }) : null
    report = await withBrowser((browser) =>
      runSweep({ browser, sourceCache, site: cfg.site, source: cfg.source, plan, pairs, widths: cfg.widths, heightsWidths: cfg.heightsWidths, schemes: cfg.schemes, only: cfg.only, concurrency: cfg.concurrency, deadlineAt: cfg.deadlineMs ? started + cfg.deadlineMs : null, reload: args.flag('--reload'), settleMs: cfg.settleMs, log, accept: plan.acceptContext, ...asFull })
    )
  }
  report.theme = { version: zip?.version ?? null, zipSha256: zip?.sha256 ?? null }
  report.inputs = sweepInputs(cfg.runRoot, plan.specDir)
  if (plan.pages.some((p) => p.referenceKind === 'none')) report.applicability.binding = {
    version: SWEEP_APPLICABILITY_VERSION,
    kinds: Object.fromEntries(plan.pages.map((p) => [p.path, p.referenceKind ?? null])),
    specHash: report.inputs.files.spec,
    contractHash: report.inputs.files.contract
  }
  // the baseline the verdict was compared with: the bytes of the file that was read, and the version it was read as
  report.baselineInput = baseline ? { sha256: baseline.sha256, version: baseline.version } : null
  report.sourceFingerprint = sourceFp
  if (sourceFp === null && plan.pages.length && plan.pages.every((p) => p.referenceKind === 'none')) report.sourceFingerprintApplicability = { status: 'not-applicable', reason: 'all renderable pages bind to reference.kind=none' }
  report.coverage = coverageOfRun()
  report.dossier = { runRoot: dossierName(cfg.runRoot), pairsFrom: plan.contract ? 'visual.contract.json' : 'page-map.json', hookErrors: plan.errors }
  let fixNote = 'fix-measure.json not written: no --zip (the evidence is bound to a theme zip)'
  let merged = null
  let md
  let summary
  // a run that keeps a history stands on its own copy of the reports (the history points there), so a later run into the same --out cannot overwrite what it carries
  const evidenceName = run ? `${new Date(started).toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}` : null
  const evidence = run ? path.join(cfg.runRoot, EVIDENCE_DIR, identity.key, evidenceName) : null
  let stage = null
  let entry = null
  // what this run covered, for the measure a patch release is held to (lib/sweep-coverage.mjs): narrowed by any option that is not the standard scope
  function coverageOfRun() {
    // a scope the caller named is the caller's, whatever its value: `--only` listing every check is still an explicit scope
    const explicit = SCOPE_FLAGS.filter((n) => args.has(n))
    return coverageOf({ mode: scoped || explicit.length ? 'scoped' : 'full', explicit, carried: scoped, checks: cfg.only, routes: plan.pages.map((p) => p.path), widths: cfg.widths, heightsWidths: cfg.heightsWidths, schemes: cfg.schemes })
  }
  try {
    if (run) {
      const fullScope = scoped ? previous.full.scope : run.scope
      const fresh = recordsOf(report, { out: evidence, runRoot: cfg.runRoot, mode: run.mode, acceptRows: plan.accept, fullScope })
      const covers = scoped ? coversOf(scope, { pages: allPages, fullSchemes: fullCoverage(previous.full, allPages).schemes }) : () => true
      merged = mergeRun({ prev: previous && sourceSame ? previous.effective.checks : null, fresh, covers, full: !scoped, acceptRows: plan.accept, order: ALL_CHECKS, fullScope: scoped ? fullScope : null })
      applyHistory(report, { merged, run, order: ALL_CHECKS, acceptRows: plan.accept })
    }
    mkdirSync(cfg.out, { recursive: true })
    stage = mkdtempSync(path.join(cfg.out, '.sweep-stage-'))
    if (zip && scoped) fixNote = `fix-measure.json not written: a scoped re-run is not the measure of a theme zip (${FULL_HINT})`
    else if (zip) {
      const fix = writeFixMeasure(path.join(stage, 'fix-measure.json'), {
        tool: 'site-sweep.mjs',
        site: cfg.site,
        source: cfg.source,
        themeZipSha256: zip.sha256,
        checks: fixChecks(report.checks),
        baseline: baseline ? { version: baseline.version, passed: baseline.passed, total: baseline.total, ranAt: baseline.ranAt, checks: baseline.checks, ...(baseline.sourceFingerprint ? { sourceFingerprint: baseline.sourceFingerprint } : {}), ...(baseline.applicability ? { applicability: baseline.applicability } : {}) } : null,
        notDefects: report.notDefects,
        ranAt: report.ranAt,
        coverage: coverageOfRun(),
        sourceFingerprint: sourceFp,
        ...(report.applicability ? { applicability: report.applicability } : {})
      })
      const problems = validateFixMeasure(fix)
      if (problems.length) throw new Error(`fix-measure.json does not validate: ${problems.join('; ')}`)
      report.fixMeasure = fix
      fixNote = `fix-measure.json written (${fix.passed}/${fix.total} checks pass)`
    }
    report.timing.totalMs = Date.now() - started
    writeFileSync(path.join(stage, 'site-sweep.json'), JSON.stringify(report, null, 2) + '\n')
    md = formatSummary(report)
    writeFileSync(path.join(stage, 'site-sweep.md'), md + '\n')
    const s = summarise(report, { baseline })
    summary = s.summary
    writeFileSync(path.join(stage, 'summary.md'), s.md + '\n')
    writeFileSync(path.join(stage, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
    if (run) entry = entryAfter({ previous: sourceSame ? previous : null, revision: previous?.revision ?? 0, identity, record: runRecord({ report, mode: run.mode, reason: run.reason, out: evidence, runRoot: cfg.runRoot, scope: run.scope, exit: report.exit }), merged, exit: effectiveExit(merged.checks, report.ownExit), sourceFingerprint: sourceFp })
  } catch (e) {
    if (stage) rmSync(stage, { recursive: true, force: true })
    console.error(`site-sweep: the reports could not be written to ${cfg.out}: ${String(e.message).split('\n')[0]}${run ? '; the history is unchanged' : ''}`)
    process.exit(4)
  }
  // the source must still be the one the run started on, or the measurement belongs to neither
  const again = sourceFp ? await readSourceFingerprint({ url: sourceHome, template: sourceTemplate }) : null
  const movedWhy = !sourceFp ? null : again.ok ? differsFrom(sourceFp, again.fingerprint) : `the source cannot be read again: ${again.error}`
  if (movedWhy) {
    rmSync(stage, { recursive: true, force: true })
    console.error(`site-sweep: the source changed while the sweep ran (${movedWhy}); nothing was published${run ? '; the history is unchanged' : ''}`)
    process.exit(4)
  }
  // one transaction (site-sweep-publish.mjs): the reports of --out, the snapshot the history points at and the history entry are all new or all as they were
  try {
    const done = publish({ out: cfg.out, stage, drop: existsSync(path.join(stage, 'fix-measure.json')) ? [] : ['fix-measure.json'], history: run ? { runRoot: cfg.runRoot, key: identity.key, expectedRevision: previous?.revision ?? 0, entry } : null, evidence: evidenceName, runRoot: cfg.runRoot })
    for (const w of done.warnings) console.error(`site-sweep: published; ${w}`)
  } catch (e) {
    rmSync(stage, { recursive: true, force: true })
    if (!(e instanceof HistoryError || e instanceof PublishError)) throw e
    console.error(`site-sweep: ${e.message}`)
    process.exit(4)
  }
  if (args.flag('--verbose')) console.log(md)
  else console.log(summaryLines(summary, path.join(cfg.out, 'summary.md')).join('\n'))
  if (args.flag('--verbose')) for (const c of report.checks) console.error(c.carried ? `check ${c.id}: carried, not measured in this run` : `check ${c.id}: ${c.cases} case(s), ${c.defects} defect(s), ${c.notMeasured} not measured, in-page ${(c.probeMs / 1000).toFixed(1)}s`)
  if (report.sourceCache) console.error(`source cache: ${report.sourceCache.enabled ? `${report.sourceCache.cached} source reading(s) reused, ${report.sourceCache.live} measured live` : `bypassed (${report.sourceCache.bypass})`}`)
  console.error(`total ${formatDuration(report.timing.totalMs)}; ${fixNote}`)
  process.exit(report.exit)
}
