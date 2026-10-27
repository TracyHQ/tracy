#!/usr/bin/env node
// `visual-qa.mjs findings <run-dir|visual.json> [--page id] [--axis variant] [--open|--accepted] [--limit N]` is a read-only
// one-line-per-finding query of a finished report (findings-query.mjs); it measures nothing.
// The visual review of a WordPress site built by this skill, on the EmDash standard: every page of
// visual.contract.json, on FOUR AXES in fixed stage order (light desktop → light responsive → dark
// desktop → dark responsive), a stage only after the previous one is clean; per axis three checks —
// A. screenshot (site, and the rendered source next to it, only when a lens consumes it), B. real
// pointer (hover must not move boxes; mega-menu travel; theme toggle; every header menu captured
// open and compared with the source's — menu-open.mjs), C. computed px (identity,
// overflow, theme observed, two-sided parity of every visible content element against the SAME
// WORDS on the rendered source, coverage → `unclassified-element`, image census, and on dark axes
// the port's scanners: white surfaces, dark-on-dark text, contrast, bright borders, seams).
//
//   node scripts/visual/visual-qa.mjs --contract visual.contract.json --site <origin> --out <new dir>
//        --spec <spec dir> [--source-site <origin serving the source dir>] [--theme <built theme dir>]
//        [--patterns-map <patterns.map.json>] [--pages id,id] [--stage id[,id]] [--all-stages]
//        [--reuse <earlier out dir>[,…]] [--concurrency N] [--mega-items <must equal the contract's>] [--tile-height 1200]
//        [--scope full|fast-gate] [--fast-gate <fast-gate run dir>] [--light-hook cookie:<key>=light]
//        [--source-dark-request-hook cookie:<name>=dark] [--axis-retries 1]
//        [--tier-concurrency N] [--priority id,id]
//
// Concurrency: `--concurrency N` page-axis jobs at once inside a stage (each its own browser
// context); with the stages NAMED (`--stage a,b`, `--all-stages`) up to `--tier-concurrency N`
// stages run at once (default 1), so at most N × M jobs are in flight. The report is the same
// whatever ran first: results are placed in the contract's order, axes by variant. Each page is
// also published to <out>/pages.jsonl the moment its axes of a stage are final (round.mjs --watch
// reads it). `--priority` measures the named pages first; it changes no result.
//
// Scopes (visual.json `scope.kind`, index.json `scope`):
//   full            every page (default). May cite `--fast-gate <run>`: that run must hold a passing
//                   FAST-GATE.json (fast-gate.mjs verdict) for this contract and these page hashes,
//                   else the run stops. Without it the run only says so.
//   fast-gate       the cases fast-gate.mjs resolves from the contract (shared parts/patterns/
//                   sections, families, states, home, 404, risky locales), every stage; writes
//                   FAST-GATE-PLAN.md. --theme makes parts and patterns visible to the resolver.
//   targeted-debug  `--pages`: a hand-picked subset for debugging, by page id or path (an unknown
//                   page stops the run), measured now — never taken from --reuse. Neither subset
//                   ever passes the visual gate; only `full` does.
//
// Tiles: every picture a lens consumes is also cut into ≤ --tile-height px strips under
// shots/<page>--<variant>[--source]/<n>.png, listed in index.json `tiles`. A reader downsamples a
// 7 000 px full-page file past legibility; the lens opens the tiles, and notes.mjs counts a picture
// as opened only when every tile was. The full-page file stays for the record.
// Lens sampling: after a stage, a page whose findings are not all on its layout's representative
// (lens-work.mjs lensSample) is shot too — for the layout and colour lenses only — so `notes.mjs plan`
// can hand those lenses every page that fails in its own way. A shot that fails leaves the axis
// without pictures and `axis.lensShot.error`; the plan then refuses the stage rather than skip it.
//
// The source side: the page's rendered snapshot (spec/reference/rendered/<slug>--1440-light.html)
// served by --source-site when given (images and fonts resolve), else loaded from the file; or, for
// a live source (contract page `sourceRoute`), that route on `contract.source.site` (sourceUrlOf). Parity
// is by TEXT: a site element's words are looked up on the source page and the computed properties
// compared with tolerances (±8/255 per colour channel, ±1 px) — no hand-written expectations, and
// an untyped core/html section is measured exactly like a pattern.
//
// Evidence (scripts/visual/report.mjs): visual.json · VISUAL.md · index.json · notes/machine.{json,md}.
// A page whose hash (page-hash.mjs) is unchanged since an earlier run in --reuse takes that run's
// axes and points at its pictures — when those axes were clean. A failing axis is measured again:
// the page hash covers the page, not the tool or the accepted exceptions, and both change between
// runs (fast-13 on wp-tracy-business reused a failure the classifier had just been fixed for).
// An axis that ends in `axis-error` (the browser died, or the axis passed AXIS_TIMEOUT_MS) is measured
// again in the same run on a restarted browser, up to --axis-retries times (default 1); the axis
// carries `retry: {attempts, recovered, errors}` and the summary counts them (`retried`,
// `retryRecovered`), so a recovered page is visible as one, not silently equal to a clean pass.
// Exit 1 on any finding, any unclassified element, or a page that examined too little.
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runChild } from '../lib/child.mjs'
import { resolveSourceRoutes } from '../lib/source-routes.mjs'
// `pngjs` decodes the full-page shot once so every tile is a crop of the same pixels; see tilePage.
import { PNG } from 'pngjs'
import { LAUNCH_ARGS, browserIdentity, isAlive, lazyBrowser, withPage, withTimeout, mapLimit, concurrencyFrom } from '../lib/browser.mjs'
import { freezeMotion } from '../lib/motion.mjs'
import { platformFonts } from '../lib/platform-fonts.mjs'
import { inPageBorderRecords } from '../review/border-scan.mjs'
import { inPageDarkRecords } from '../review/source-pair.mjs'
import { BODY_RENDERING, CONTAINER_PROBE_HEIGHT, STAGES, UNMEASURED_KINDS, containerProbes, containersKey, resolvePageSelection, validateContract } from './contract.mjs'
import { CANONICAL, darkDerivedProblems, identityOf, resolveContract } from '../lib/canonical.mjs'
import { UsageError, parseStrict } from '../lib/cli-args.mjs'
import { findingsCli } from './findings-query.mjs'
import { PAGE_LEVEL_EXCEPTION_KINDS, parseDecisions, readSmallFile, validateExceptionRows } from '../lib/parity-acceptance.mjs'
import { pageHash, TOOL_VERSION } from './page-hash.mjs'
import { loadPatternsMap, patternSlugsOf, readJsonFile } from './pattern-registry.mjs'
import { MAX_SMALL_EVIDENCE_BYTES, RECEIPT, VISUAL_PRIOR, readEvidence, receiptAgainstPlan } from './evidence.mjs'
import { contentPages, measureIntrinsic, INTRINSIC_WIDTHS } from './intrinsic-mobile.mjs'
import { measureInteractions } from './interaction-parity.mjs'
import { INTERACTION_FILE, interactionClaimOf, validateInteractionRecord } from './interaction-report.mjs'
import { INTRINSIC_FILE, intrinsicClaimOf, summaryClaimOf, validateIntrinsicReport } from './intrinsic-report.mjs'
import { withBrowser } from '../lib/browser.mjs'
import { exitCodeOf, writeRun } from './report.mjs'
import { SAMPLED_LENSES, findingRows, lensSample, routeOf } from './lens-work.mjs'
import { resolveFastGate, planMarkdown } from './fast-gate.mjs'
import { MENU_BUDGET_MS, headerCensus, measureMenus } from './menu-open.mjs'
import { selectorProfileOfContract, selectorsRecord } from '../lib/framework-selectors.mjs'
import { checkApplicability, imageReferenceReason, noReferenceReason, notApplicableChecks } from './applicability.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const CLI_VALUES = ['--probes-from', '--contract', '--run-root', '--artifact', '--seed-report', '--site', '--out', '--spec', '--source-site', '--theme', '--pages', '--stage', '--reuse', '--concurrency', '--tier-concurrency', '--priority', '--patterns-map', '--mega-items', '--tile-height', '--source-dark-hook', '--source-light-hook', '--source-dark-request-hook', '--light-hook', '--scope', '--fast-gate', '--axis-retries', '--decisions']
const CLI_FLAGS = ['--allow-stale', '--all-stages']
// The CLI's argument list is validated in full before anything is measured (see the `isMain` block):
// unknown or repeated options and options without a value are usage errors. Imported as a module,
// the list is the importer's and nothing is parsed.
let cli = { opt: (_n, d = null) => d, flag: () => false, has: () => false }
const opt = (n, d = null) => cli.opt(n, d)
const flag = (n) => cli.flag(n)
/** A positive integer flag value, or an Error naming the flag — a bound is never guessed. */
export function positiveInt(raw, name) {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer, got ${raw}`)
  return n
}

const AXIS_TIMEOUT_MS = 180000
/**
 * 🔒 NO PAGE OF A RUN IS A BACKGROUND TAB. Axes run side by side (`--concurrency`), and the site page
 * of an axis waits while its source is read in another page. Chromium slows the timers of every page
 * but the newest although each still reads `visible`: a header panel a script keeps moving read as
 * still and was captured mid-motion (menu-open.mjs, measured on its fixture), and the same holds for
 * anything a page moves by timer while it is measured. The run's Chromium keeps every page at full
 * speed.
 */
export const RUN_LAUNCH_ARGS = Object.freeze([...LAUNCH_ARGS, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'])
/** The mega-menu walk of one page (review/mega-hover.mjs, its own Chromium). Counted inside AXIS_TIMEOUT_MS. */
const MEGA_TIMEOUT_MS = 120000
/** How many more times an axis that ended in `axis-error` is measured within the same run (`--axis-retries`). */
const AXIS_RETRIES = 1
// Include labels explicitly: CDP reports the font painted for the selected node, not for child text.
export const FONT_SAMPLE_SELECTORS = Object.freeze({ site: ['main h1, main h2', 'main p', 'main p label, main label', 'main a, main .wp-block-button__link'], source: ['h1, h2', 'p', 'p label, label', 'a'] })

/**
 * The mega selectors the walk uses: the contract's `interactions.mega` (review.config.json `mega`,
 * contract.mjs). A `--mega-items` that names something else is refused — the contract and the run
 * would disagree about what was measured (JA Vega M4: the contract said `.tracy-mega__*`, the run
 * walked `.jv-mega`). A contract written before `items` was recorded takes the flag, else Tracy's
 * `.tracy-mega`, and leaves trigger and panel to mega-hover's own defaults (its classes were
 * written in whatever the theme).
 */
export function megaSelectorsOf(contract, flagItems = null) {
  const m = contract?.interactions?.mega
  if (!m) return null
  if (!m.items) return { items: flagItems ?? '.tracy-mega', trigger: null, panel: null }
  if (flagItems && flagItems !== m.items)
    throw new Error(`--mega-items ${flagItems} differs from the contract's interactions.mega.items ${m.items} — set review.config.json "mega" and re-init the contract, or drop the flag`)
  return { items: m.items, trigger: m.trigger ?? null, panel: m.panel ?? null }
}

/**
 * What a mega-hover run says, for `axis.scans.mega` and the `mega-menu` finding. The tail keeps
 * every FAIL row and the summary line; a run that did not pass also keeps its exit status and the
 * end of its stderr, whatever it printed first — JA Vega M4 recorded `output: ""` on 31 of 31 pages
 * while the child had died with "Execution context was destroyed" on stderr, and a child that
 * printed "0 FAIL" and then exited non-zero read as "0 FAIL". The exit part is never cut by the
 * length bound. Of stderr it keeps the first line (the error; a stack under it is longer than any
 * fixed tail) and the last lines, the stack cut in the middle.
 */
export function megaScanOf(r) {
  const lines = (r.stdout ?? '').trim().split('\n').filter(Boolean)
  const summary = lines.find((l) => /item\(s\) tested at/.test(l)) ?? null
  const ok = !r.timedOut && r.status === 0 && /\b0 FAIL\b/.test(summary ?? '')
  const parts = lines.filter((l) => /^FAIL/.test(l))
  if (summary) parts.push(summary)
  else if (lines.length) parts.push(lines.at(-1))
  if (ok) return { ok, ms: r.ms, exit: r.status, tail: parts.join(' | ').slice(0, 900) }
  const err = (r.stderr ?? '').trim().split('\n').filter(Boolean)
  const how = r.timedOut ? `killed after ${MEGA_TIMEOUT_MS} ms` : `exit ${r.status ?? r.signal ?? 'none'}`
  const exit = `${how}${r.error ? ` (${r.error})` : ''}${err.length ? `: ${(err.length > 6 ? [err[0], '…', ...err.slice(-5)] : err).join(' ⏎ ')}` : parts.length ? '' : ': no output'}`.slice(0, 600)
  const head = parts.join(' | ').slice(0, 900 - exit.length - 3)
  return { ok, ms: r.ms, ...(r.timedOut ? { timedOut: MEGA_TIMEOUT_MS } : {}), exit: r.status ?? null, tail: head ? `${head} | ${exit}` : exit }
}

// 🔒 AN INTERACTION THAT COULD NOT BE MEASURED IS MEASURED ONCE MORE BEFORE IT IS A FINDING. On a
// shared machine (load 50–110) the same unchanged header gave `scan:hover-not-measured` "the pointer
// could not reach it" on one page in one run and on three others in the next, and a mega walk FAILed
// `reopens:false` on one page and `clickNavigates:false` on another between two runs of the same
// theme (JA Vega M4d, #27 item 3). A pointer step is a real-time event: one attempt answers "did it
// work this time", not "does it work". So each is tried twice, and only the second answer counts:
//   · a hover target that was not measured (rest not settled, the pointer could not reach it, the
//     hover did not settle, the page scrolled) is measured again from rest — the pointer parked, the
//     rest box read again, the hover and the second read again. Every attempt's outcome is kept
//     (`attempts`); a jump measured on the first attempt is a finding at once, never re-rolled.
//   · a mega walk that ran to its summary and FAILed is walked again; a walk killed at its timeout,
//     or one that crashed before its summary, is not — that is the evidence, kept as it is.
// Nothing sleeps between the attempts: the retry starts from a parked pointer and the settle reads,
// which already wait for motion to stop.
const INTERACTION_ATTEMPTS = 2

async function hoverOnce(p, t, settleMs) {
  // The pointer is still on the PREVIOUS target, and a hover rule does not have to act on the
  // element under the pointer: `.card:hover .secondary { width: 140px }` is ordinary. Reading a
  // rest state in that condition reads an already-hovered box, and the two reads then agree.
  // Measured 2026-09-17 on a card holding two links: the second read `rest w=156, hover w=156`
  // and produced no finding, hiding an 80 px change. Park the pointer first; the settle inside
  // the rest read then waits for whatever the previous hover started to unwind.
  await p.mouse.move(0, 0)
  const rest = await p.evaluate(inPageSettledRect, [t.i, settleMs, { scrollIntoView: true }])
  if (!rest.settled) return { measured: false, reason: rest.reason }
  try {
    await p.locator(`[data-vqa-hover="${t.i}"]`).first().hover({ timeout: 2000, force: true })
  } catch {
    return { measured: false, reason: 'the pointer could not reach it' }
  }
  // A floor for the element with no animation at all — the hover style lands at the next style
  // pass and a JS handler runs in the event task — then the settle waits for whatever is really
  // moving. `force` skips the actionability checks, not the scroll, so `hover()` may still
  // scroll; the two reads are only comparable at one offset, and a shift between them is an
  // element this scan did not measure rather than a jump of exactly the scroll delta.
  await p.waitForTimeout(60)
  const hov = await p.evaluate(inPageSettledRect, [t.i, settleMs, {}])
  if (!hov.settled) return { measured: false, reason: hov.reason }
  if (hov.scroll.x !== rest.scroll.x || hov.scroll.y !== rest.scroll.y)
    return { measured: false, reason: `the page scrolled between the two reads (${rest.scroll.x},${rest.scroll.y} → ${hov.scroll.x},${hov.scroll.y})` }
  return { measured: true, rest, hov }
}

/**
 * One hover target of the hover scan (inPageHoverJump tagged it `data-vqa-hover`), read at rest and
 * hovered, up to INTERACTION_ATTEMPTS times while it could not be measured. Returns `{ measured,
 * rest, hov }` or `{ measured: false, reason }` (the last attempt's reason), with `attempts`: each
 * attempt's outcome, `measured` or its reason.
 */
export async function hoverTarget(p, t, { settleMs = HOVER_SETTLE_MS, attempts = INTERACTION_ATTEMPTS } = {}) {
  const tried = []
  let r = null
  for (let n = 0; n < attempts; n++) {
    r = await hoverOnce(p, t, settleMs)
    tried.push(r.measured ? 'measured' : r.reason)
    if (r.measured) break
  }
  return { ...r, attempts: tried }
}

/**
 * The mega walk (review/mega-hover.mjs) through `run` (lib/child.mjs runChild, or a test's), walked
 * again once when it ran to its summary and FAILed. Returns megaScanOf of the last walk, with
 * `attempts`: `ok`, or each failed walk's tail.
 */
export async function walkMega(run, argv, { timeoutMs = MEGA_TIMEOUT_MS, attempts = INTERACTION_ATTEMPTS } = {}) {
  const tried = []
  let scan = null
  for (let n = 0; n < attempts; n++) {
    const r = await run(process.execPath, argv, { timeoutMs })
    scan = megaScanOf(r)
    tried.push(scan.ok ? 'ok' : scan.tail)
    const walkedToFail = !r.timedOut && r.status === 1 && /item\(s\) tested at/.test(r.stdout ?? '') && /^FAIL/m.test(r.stdout ?? '')
    if (scan.ok || !walkedToFail) break
  }
  return { ...scan, attempts: tried }
}

/**
 * Where the runner reads a page's source. A rendered snapshot (`sourceRendered`, from-html) is the
 * file itself, served by `--source-site` when given (images and fonts resolve); a from-url pack keeps
 * this snapshot even though its reference kind is `url`. A live source (`sourceRoute`, a from-joomla
 * pack whose reference has no captured path) is the route on the source's own origin —
 * `contract.source.site`, the address the run's pairs are read against. Neither → null, and the axis
 * has no source side.
 */
/**
 * The switch that puts the SITE into light on a light axis. Most ports are light (or `auto`) with no
 * stored choice, and the light axis sets nothing; a site that is dark by default (contract
 * `design.theme.default: "dark"`, from the run's review config) stays dark unless its stored choice
 * says light — a cookie the runner sets before the first request (lib/browser.mjs `lightHook`).
 * `--light-hook` names it explicitly. Null → the light axis sets nothing, as before.
 */
export function siteLightHookOf(contract, flag = null) {
  if (flag) return flag
  const t = contract?.design?.theme
  if (t?.default !== 'dark') return null
  return t.storage?.type === 'cookie' && t.storage.key ? `cookie:${t.storage.key}=light` : null
}

export function sourceUrlOf(page, { spec = null, sourceSite = null, contract = null } = {}) {
  if (page.sourceRendered) {
    if (!spec) return null
    const file = path.join(spec, page.sourceRendered)
    if (!existsSync(file)) return null
    return sourceSite ? new URL(path.relative(path.join(spec, 'reference'), file).split(path.sep).map(encodeURIComponent).join('/'), sourceSite.replace(/\/?$/, '/')).href : pathToFileURL(file).href
  }
  // The address given on THIS run wins over the one the contract was initialised with: a source
  // site is where the source runs today, and the contract's is the machine it was built on (JA
  // Kinetic's contract named 127.0.0.1:52002, a stand that exists on one machine; every axis of a
  // run elsewhere went to it and died as a misleading "execution context destroyed").
  const site = sourceSite ?? contract?.source?.site
  return page.sourceRoute && site ? new URL(page.sourceRoute, site).href : null
}
const DEFAULT_TILE_HEIGHT = 1200
/**
 * Cut what `p` shows into ≤ tileHeight px strips next to `rel` (shots/<name>/<n>.png); relative paths.
 *
 * The strips are cut from the buffer the full-page screenshot already produced, not asked of the
 * browser one clip at a time. Two reasons, and the second is the one that matters: each clip used
 * to be its own RENDER, so nothing guaranteed a tile was a crop of the picture printed beside it —
 * an animation, a lazy image arriving, a font swapping between renders puts different pixels in the
 * two files while the report says they are the same page. Decoding once and cropping makes that
 * identity hold by construction. The saving is the smaller half: a 1200 px tile height over a tall
 * page is seven extra renders per picture.
 *
 * `png` is the buffer `page.screenshot()` returned. Callers that have it pass it; the fallback
 * takes one more shot rather than failing, because a tile list is evidence a reader opens.
 */
export async function tilePage(p, out, rel, tileHeight = DEFAULT_TILE_HEIGHT, png = null) {
  const { total, width } = await p.evaluate(() => ({
    total: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    width: document.documentElement.clientWidth
  }))
  const rows = PNG.sync.read(png ?? (await p.screenshot({ fullPage: true })))
  const dir = rel.replace(/\.png$/, '')
  mkdirSync(path.join(out, dir), { recursive: true })
  const tiles = []
  for (let y = 0, n = 0; y < Math.min(total, rows.height); y += tileHeight, n++) {
    const h = Math.min(tileHeight, total - y, rows.height - y)
    const w = Math.min(width, rows.width)
    // Bounds are checked, not trusted: a silently short tile reads as a short page to whoever opens it.
    if (y < 0 || h < 1 || y + h > rows.height || w < 1 || w > rows.width)
      throw new Error(`tilePage: ${w}x${h} at y=${y} is outside ${rows.width}x${rows.height}`)
    const tile = new PNG({ width: w, height: h })
    PNG.bitblt(rows, tile, 0, y, w, h, 0, 0)
    const t = `${dir}/${n}.png`
    writeFileSync(path.join(out, t), PNG.sync.write(tile))
    tiles.push(t)
  }
  // 🔒 THE STRIPS ARE CLAMPED TO THE VIEWPORT AND STOP AT THE DOM'S HEIGHT; THE PICTURE IS
  // NEITHER. `w` above is `Math.min(width, rows.width)`, so a page with HORIZONTAL OVERFLOW keeps
  // pixels in the full-page file that no strip carries — and the loop stops at
  // `Math.min(total, rows.height)`, where `total` is read from the DOM AFTER the screenshot, so a
  // page that got SHORTER in between leaves the bottom of the picture untiled. Checking width
  // alone said "covered" in both cases. An empty strip list is never coverage.
  // The strips cover `Math.min(total, rows.height)` — that is literally the loop's bound — so the
  // picture is covered exactly when `total` reaches its height. Counting strips instead
  // (`tiles.length * tileHeight`) rounds UP past the last short strip and says covered when it is
  // not: total 1300, picture 1400, strip 1200 gives two strips, 2400 >= 1400, and 100px of the
  // picture that no strip carries.
  const covered = tiles.length > 0 && rows.width <= width && rows.height <= total
  return { tiles, fullWidthCovered: covered }
}
const PARITY_PROPS = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-transform', 'letter-spacing']

// ─────────────────────────────────────────────── in-page functions (serialised into the browser)
export function inPageSnapshot({ coverageSelectors, properties, scope }) {
  const root = document.querySelector(scope) ?? document.body
  // Typesetting is not content, and BOTH sides are folded to the same plain form before the words
  // are compared. A no-break space folds with `\s`; a non-breaking hyphen (U+2011, "lost‑time") is
  // the hyphen the source wrote.
  //
  // 🔒 AND THE CURLY FORMS `wptexturize` PRODUCES. It is on by default for post content, so the
  // SITE gets `’ “ ” – — …` exactly where the source HTML has `' " -- ---  ...`. Without this fold
  // every paragraph carrying an apostrophe or an ellipsis failed to match its own source text and
  // came back `unclassified-element` — a correct build reported as broken, on the most ordinary
  // prose there is. The sibling parity path in this same skill (`lib/parity-extract.mjs`) has
  // always folded quotes; this one did not.
  //
  // The direction is deliberate: fold TOWARD the plain ASCII the source is written in, and fold the
  // longest sequences first so `---` does not become `--` and then `-`.
  const norm = (s) =>
    s
      .replace(/\u2011/g, '-')
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/\u2026/g, '...')
      // ⚠ NOT `---` AND `--`. `wptexturize` turns a SPACED ` -- ` into an em dash and a SPACED ` - `
      // into an en dash, so the source text behind an em dash is `--` and behind an en dash is `-`.
      // Folding them the other way (em→`---`, en→`--`) left both sides unequal, which is the
      // opposite of the point. Checked against WordPress's own transformation table.
      .replace(/\u2014/g, '--')
      .replace(/\u2013/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
  const visible = (e) => {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.2) return false
    const r = e.getBoundingClientRect()
    return r.width > 2 && r.height > 2
  }
  // 🔒 THE WORDS A READER SEES. WordPress prints words for screen readers alone inside the visible
  // ones — core/read-more is `Learn more<span class="screen-reader-text">: Database Security</span>`
  // — clipped to a 1 px absolute box. Read with `textContent` the link said "Learn more: Database
  // Security", which the source never says, and came back unclassified (JA Vega ld-0, 18 rows). An
  // inline child the page does not show — not displayed, hidden, or the clipped 1 px box — is not
  // part of the words. The same rule runs in inPageTextIndex, so both sides read the same way.
  const INLINE = /^(SPAN|B|I|EM|STRONG|A|SMALL|SUP|SUB|MARK|TIME)$/
  const unseen = (e) => {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') return true
    if (cs.position !== 'absolute' && cs.position !== 'fixed') return false
    const r = e.getBoundingClientRect()
    return r.width <= 1 || r.height <= 1 || /inset\(50%\)/.test(cs.clipPath) || /rect\((0|1)px,? (0|1)px,? (0|1)px,? (0|1)px\)/.test(cs.clip)
  }
  // 🔒 WORDS DRAWN IN NO INK ARE NOT WORDS ON THE PAGE. An icon link keeps its label for screen
  // readers and the editor and draws nothing of it: `font-size: 0; color: transparent`, the icon
  // painted by the background (JA Vega /about-us, `a.jv-play__button` "Play the video"). The box has
  // padding, so the size test above passes, and the link and the paragraph around it came back as two
  // `unclassified-element` a tier (M4d, #27 item 1). A text node is read in the style of the element
  // that holds it: at 0 px, or in a transparent fill with no stroke, no shadow and no
  // `background-clip: text` above it (gradient words are drawn), it is no part of the words. A child
  // that sets a size again is read in its own style. The same rule runs in inPageTextIndex, so both
  // sides read the same way.
  const inked = new Map()
  const inkless = (e) => {
    if (inked.has(e)) return inked.get(e)
    const cs = getComputedStyle(e)
    const clear = (c) => /^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/.test(String(c ?? '').trim())
    let none = parseFloat(cs.fontSize) === 0
    if (!none && clear(cs.webkitTextFillColor || cs.color) && !(parseFloat(cs.webkitTextStrokeWidth) > 0) && cs.textShadow === 'none') {
      none = true
      for (let a = e; a && none; a = a.parentElement) {
        const ac = getComputedStyle(a)
        if (ac.webkitBackgroundClip === 'text' || ac.backgroundClip === 'text') none = false
      }
    }
    inked.set(e, none)
    return none
  }
  const shown = (n) => (n.nodeType === 3 ? (n.parentElement && inkless(n.parentElement) ? '' : n.textContent) : n.nodeType !== 1 ? '' : n.tagName === 'BR' ? ' ' : unseen(n) ? '' : [...n.childNodes].map(shown).join(''))
  const ownText = (e) => {
    let t = ''
    for (const n of e.childNodes) {
      if (n.nodeType === 3) t += inkless(e) ? '' : n.textContent
      else if (n.nodeType === 1 && INLINE.test(n.tagName)) t += shown(n)
      else if (n.nodeType === 1 && n.tagName === 'BR') t += ' '
    }
    return norm(t)
  }
  // 🔒 WHICH ELEMENT DRAWS THE WORDS. A heading whose words sit in one inline span is drawn in the
  // span's type (JA Vega's source: `h3.section-title > span`, a 12 px pill in a 32 px h3), so the
  // text properties are read on the DEEPEST element of that single-child chain, and the fill on the
  // deepest one of it that paints (a button's `<a>` around a bare `<span>` keeps its own). The
  // source side is composed by the same rule from its index (composeStyles).
  const TEXT = new Set(['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-transform', 'letter-spacing'])
  const chainOf = (el) => {
    const chain = [el]
    for (let n = el; ; ) {
      const kids = [...n.childNodes].filter((c) => (c.nodeType === 1 ? !unseen(c) : c.nodeType === 3 && c.textContent.trim()))
      const k = kids.length === 1 && kids[0].nodeType === 1 ? kids[0] : null
      if (!k || !INLINE.test(k.tagName) || norm(shown(k)) !== norm(shown(n))) return chain
      chain.push(k)
      n = k
    }
  }
  const paints = (e) => !/^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/.test(getComputedStyle(e).backgroundColor)
  // Whether an element sits in the page's CHROME — a navigation landmark, or a header/footer that is
  // the page's own (not one inside an article, aside, main, nav or section: that is a banner of its
  // content). The source index records the same (inPageTextIndex), so a pick can keep to the same
  // side of that line (parityByText). Landmarks only: a class name is never what makes chrome.
  const inChrome = (e) => {
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      if (a.matches('nav, [role="navigation"], [role="banner"], [role="contentinfo"]')) return true
      if ((a.tagName === 'HEADER' || a.tagName === 'FOOTER') && !a.parentElement?.closest('article, aside, main, nav, section')) return true
    }
    return false
  }
  const out = []
  const seen = new Set()
  // 🔒 ONE PLACE, HOWEVER MANY ELEMENTS SAY IT. An element inside an element of the same words is
  // the same place on the page: JA Vega's card link is `p.jv-card__link > a`, both in coverage, and
  // the link took a SECOND source occurrence of "Learn more" — a button three sections down, six
  // `parity-mismatch` a run (M4b). The place is what the source index already records (placeOf).
  const placeOf = new Map()
  let places = 0
  for (const el of root.querySelectorAll(coverageSelectors)) {
    if (!visible(el) || seen.has(el)) continue
    seen.add(el)
    const text = el.tagName === 'IMG' ? null : ownText(el)
    if (el.tagName !== 'IMG' && (!text || text.length < 2)) continue
    const chain = el.tagName === 'IMG' ? [el] : chainOf(el)
    const words = getComputedStyle(chain[chain.length - 1])
    const fill = getComputedStyle([...chain].reverse().find(paints) ?? el)
    const styles = {}
    for (const p of properties) styles[p] = (TEXT.has(p) ? words : fill).getPropertyValue(p)
    const r = el.getBoundingClientRect()
    let place = null
    if (text) for (let a = el.parentElement; a && a !== root.parentElement && place === null; a = a.parentElement) if (placeOf.get(a)?.text === text) place = placeOf.get(a).place
    if (place === null) place = ++places
    placeOf.set(el, { text, place })
    out.push({
      tag: el.tagName.toLowerCase(),
      place,
      inChrome: inChrome(el),
      // 🔒 A MOTION STATE IS NO PART OF THE NAME. The motion runtime adds and drops its state classes
      // (`tracy-motion-on` while a loop plays; `-in`, `-bold`, `-done` around a reveal — lib/motion.mjs)
      // as the page runs, so one unchanged link was `a.x.tracy-motion-pulse.tracy-motion-on` in one run
      // and `a.x.tracy-motion-pulse` in the next: a finding closed and the same one opened (M4d, #27
      // item 3). They leave the label before it is cut to three; structural classes stay.
      cls: [...el.classList].filter((c) => !/^tracy-motion-(?:on|in|bold|done)$/.test(c)).slice(0, 3).join('.'),
      // The FULL words: the source index is keyed by them, and a paragraph cut at 120 characters
      // matched nothing — every body paragraph of the article read as unclassified (15/09, 216
      // rows). Labels truncate for display where they are built, not here.
      text: text ?? null,
      src: el.tagName === 'IMG' ? (el.currentSrc || el.getAttribute('src') || '').split('/').pop() : null,
      decoded: el.tagName === 'IMG' ? el.naturalWidth > 0 : null,
      styles,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    })
  }
  const html = document.documentElement
  return {
    elements: out,
    overflow: html.scrollWidth > html.clientWidth + 1 ? { scrollWidth: html.scrollWidth, clientWidth: html.clientWidth } : null,
    lang: html.getAttribute('lang'),
    bodyClass: document.body.className,
    h1: norm(document.querySelector('main h1, h1')?.textContent ?? ''),
    themeAttr: null
  }
}

export function inPageTextIndex({ scope, properties, slot, placeholder, siteScope = null }) {
  const root = document.querySelector(scope) ?? document.body
  // `siteScope` is the selector the SITE side is measured over (`main` by default). The index still
  // covers the whole of `scope` — the site legitimately matches source chrome — but each entry
  // records whether it sits inside that narrower region, because only there are the two sides
  // asking the same question. Without it a reverse check cannot tell a section the build dropped
  // from a footer heading the site was never asked about.
  const siteRoot = siteScope ? document.querySelector(siteScope) : null
  // Typesetting is not content, and BOTH sides are folded to the same plain form before the words
  // are compared. A no-break space folds with `\s`; a non-breaking hyphen (U+2011, "lost‑time") is
  // the hyphen the source wrote.
  //
  // 🔒 AND THE CURLY FORMS `wptexturize` PRODUCES. It is on by default for post content, so the
  // SITE gets `’ “ ” – — …` exactly where the source HTML has `' " -- ---  ...`. Without this fold
  // every paragraph carrying an apostrophe or an ellipsis failed to match its own source text and
  // came back `unclassified-element` — a correct build reported as broken, on the most ordinary
  // prose there is. The sibling parity path in this same skill (`lib/parity-extract.mjs`) has
  // always folded quotes; this one did not.
  //
  // The direction is deliberate: fold TOWARD the plain ASCII the source is written in, and fold the
  // longest sequences first so `---` does not become `--` and then `-`.
  const norm = (s) =>
    s
      .replace(/\u2011/g, '-')
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/\u2026/g, '...')
      // ⚠ NOT `---` AND `--`. `wptexturize` turns a SPACED ` -- ` into an em dash and a SPACED ` - `
      // into an en dash, so the source text behind an em dash is `--` and behind an en dash is `-`.
      // Folding them the other way (em→`---`, en→`--`) left both sides unequal, which is the
      // opposite of the point. Checked against WordPress's own transformation table.
      .replace(/\u2014/g, '--')
      .replace(/\u2013/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
  // The words a reader sees — the same rule as inPageSnapshot (a screen-reader-only span is not
  // part of them), so the two sides are keyed alike.
  const INLINE = /^(SPAN|B|I|EM|STRONG|A|SMALL|SUP|SUB|MARK|TIME)$/
  const unseen = (e) => {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') return true
    if (cs.position !== 'absolute' && cs.position !== 'fixed') return false
    const r = e.getBoundingClientRect()
    return r.width <= 1 || r.height <= 1 || /inset\(50%\)/.test(cs.clipPath) || /rect\((0|1)px,? (0|1)px,? (0|1)px,? (0|1)px\)/.test(cs.clip)
  }
  // Words drawn in no ink (0 px, or a transparent fill nothing else draws) are no part of the words —
  // the same rule as inPageSnapshot.
  const inked = new Map()
  const inkless = (e) => {
    if (inked.has(e)) return inked.get(e)
    const cs = getComputedStyle(e)
    const clear = (c) => /^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/.test(String(c ?? '').trim())
    let none = parseFloat(cs.fontSize) === 0
    if (!none && clear(cs.webkitTextFillColor || cs.color) && !(parseFloat(cs.webkitTextStrokeWidth) > 0) && cs.textShadow === 'none') {
      none = true
      for (let a = e; a && none; a = a.parentElement) {
        const ac = getComputedStyle(a)
        if (ac.webkitBackgroundClip === 'text' || ac.backgroundClip === 'text') none = false
      }
    }
    inked.set(e, none)
    return none
  }
  const shown = (n) => (n.nodeType === 3 ? (n.parentElement && inkless(n.parentElement) ? '' : n.textContent) : n.nodeType !== 1 ? '' : n.tagName === 'BR' ? ' ' : unseen(n) ? '' : [...n.childNodes].map(shown).join(''))
  const ownText = (e) => {
    let t = ''
    for (const n of e.childNodes) {
      if (n.nodeType === 3) t += inkless(e) ? '' : n.textContent
      else if (n.nodeType === 1 && INLINE.test(n.tagName)) t += shown(n)
      else if (n.nodeType === 1 && n.tagName === 'BR') t += ' '
    }
    return norm(t)
  }
  // Chrome by landmark — the same rule as inPageSnapshot.
  const inChrome = (e) => {
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      if (a.matches('nav, [role="navigation"], [role="banner"], [role="contentinfo"]')) return true
      if ((a.tagName === 'HEADER' || a.tagName === 'FOOTER') && !a.parentElement?.closest('article, aside, main, nav, section')) return true
    }
    return false
  }
  const unseenInside = (e) => {
    for (let a = e; a && a !== root; a = a.parentElement) if (unseen(a)) return true
    return false
  }
  // 🔒 `Object.create(null)`, NOT `{}`. The keys here are words off the page, and a page carrying
  // the word `constructor`, `toString`, `valueOf` or `__proto__` finds the INHERITED property
  // truthy at `index[t] ||= []` — so `index[t].push` is `Function.prototype.push`, which does not
  // exist, and the whole axis dies with `TypeError: index[t].push is not a function`. Reproduced on
  // `<p>constructor</p>`. A glossary or a developer page is enough to hit it, and the axis collapses
  // to one `axis-error` carrying no measurement at all.
  const index = Object.create(null)
  // A breadcrumb row is chrome on both sides — the site's is outside coverage (`.tracy-crumbs *`)
  // — and the source draws it as an anonymous div: links and separators, under 120 characters,
  // no heading. Its last crumb repeats the page's eyebrow ("Production building"), and as the
  // first place on the page saying those words it took the eyebrow's pair (full-2 harness).
  // A separator stands alone between words ("Home / News"); a guillemet closing a Russian title
  // («Заволжье-2») is part of the word and no separator (ru-news, fast-16). It stands alone by
  // WHITESPACE in a text node, or by being the whole text of its own element: a canvas export
  // writes `<a>Home</a><span>/</span><a>Projects</a>` with no whitespace at all — the flex gap
  // draws the spacing — so read as one string the row is "Home/Projects/Production building"
  // and the whitespace rule saw no separator; the project-detail crumb row went back into the
  // index and took the eyebrow's pair again (full-3, 8 rows on en/ru-project-detail).
  // Counted at the row's OWN level only: its text nodes, and a child element whose whole text is
  // the separator (the export's `<span>/</span>`), descending only through such inline wrappers.
  // Counting the whole subtree made a job row a crumb row — the roles table on careers carries
  // "Structural engineer (steel / concrete)" and "Moscow / hybrid" two boxes deep, and its six
  // "Apply →" links left the index (full-4).
  const separators = (e) => {
    let n = 0
    for (const c of e.childNodes) {
      if (c.nodeType === 3) n += (c.textContent.match(/(^|\s)[/›»](\s|$)/g) ?? []).length
      else if (c.nodeType === 1 && /^\s*[/›»]\s*$/.test(c.textContent)) n += 1
      else if (c.nodeType === 1 && /^(SPAN|B|I|EM|STRONG|A|SMALL|SUP|SUB|MARK|TIME)$/.test(c.tagName)) n += separators(c)
    }
    return n
  }
  const crumbRows = new Set()
  for (const el of root.querySelectorAll('*')) {
    if (el.querySelector('h1, h2, h3, h4, h5, h6, img, p') || !el.querySelector('a[href]')) continue
    const t = ownText(el)
    // A row with no own text is a container around the real one, not the crumb row itself.
    if (!t || t.length > 120 || separators(el) < 2) continue
    crumbRows.add(el)
  }
  const inCrumbs = (el) => { for (let a = el; a && a !== root; a = a.parentElement) if (crumbRows.has(a)) return true; return false }
  // Every element that carries these words, in document order, each with its document position
  // and the PLACE it belongs to: a wrapper whose own text comes through an inline child and that
  // child are one place on the page (a canvas export writes every run as `<div><span>…</span>
  // </div>`, sometimes with an empty box between). The site side picks among repeated places by
  // where the page is, and within a place by tag (parityByText).
  const placeOf = new Map()
  let order = 0
  let places = 0
  for (const el of root.querySelectorAll('*')) {
    order++
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue
    // Looping carousels duplicate slide content for motion. Those copies are not additional source
    // content for the examined floor or text pairing.
    if (el.closest('.owl-item.cloned, .slick-cloned, .swiper-slide-duplicate')) continue
    if (inCrumbs(el)) continue
    const t = ownText(el)
    if (!t || t.length < 2) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    // the screen-reader-only span itself (": Database Security") is no place on the page
    if (unseenInside(el)) continue
    const styles = {}
    for (const p of properties) styles[p] = cs.getPropertyValue(p)
    let place = null
    for (let a = el.parentElement; a && a !== root && place === null; a = a.parentElement) {
      const seen = placeOf.get(a)
      if (seen && seen.text === t) place = seen.place
    }
    if (place === null) place = ++places
    placeOf.set(el, { text: t, place })
    ;(index[t] ||= []).push({ tag: el.tagName.toLowerCase(), styles, order, place, inSiteScope: siteRoot ? siteRoot.contains(el) : false, inChrome: inChrome(el) })
  }
  // `images` counts what the page is SHOWING, which is what the site is then asked to match. An
  // undecoded picture is therefore not counted -- and that silence is the problem: on the SOURCE
  // side it lowers the number the site is measured against, so a picture the site is really missing
  // cannot produce `image-missing`. The count stays as it is; what is added is the second number,
  // so the caller can say the source was not showing its pictures instead of quietly expecting fewer.
  //
  // A picture the page deliberately does not show is not a picture that failed: an element with no
  // layout box (`display: none`, a dark-only variant of a light logo) is left out of both numbers,
  // because a lazy image behind `display: none` is never even requested and reporting it as broken
  // would name working pictures.
  const laidOut = (e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed'
  let images = 0
  const undecoded = []
  for (const im of root.querySelectorAll('img')) {
    if (!laidOut(im)) continue
    // A looping carousel's clones (Owl `loop`, Slick, Swiper) repeat pictures the page already shows once
    if (im.closest('.owl-item.cloned, .slick-cloned, .swiper-slide-duplicate')) continue // = CLONED_SLIDES (this function runs in the page)
    if (im.naturalWidth > 0) images++
    else undecoded.push(im.getAttribute('src') || '(no src)')
  }
  if (slot) images += root.querySelectorAll(slot).length
  const placeholders = placeholder ? root.querySelectorAll(placeholder).length : 0
  return { index, images, placeholders, undecoded: undecoded.length, undecodedExamples: undecoded.slice(0, 6) }
}

// 🔒 THE WINDOW AND THE CAP ARE PART OF THE VERDICT, SO THEY ARE REPORTED.
// `y < innerHeight * 3` kept only what sat in the first three viewports, and the caller never
// scrolled, so a page taller than that had its lower half silently unexamined; the 40/25 caps cut
// more off the same list. None of that appeared anywhere in the output. The filter stays — hovering
// every control on a long page is not what this scan is for — but what it left out is counted, so
// "clean" means "clean over N of M", not "clean" over an unknown fraction.
// How long a hovered box is given to stop moving before the scan calls it unmeasurable. 2000 ms is
// twice the largest duration utility a theme is likely to use, so every finite hover transition
// finishes well inside it and only pathological motion — a chain that keeps restarting, or a
// page-load animation still running — reaches the bound. Not a tuning knob: lowering it turns real
// settled measurements into skips, raising it only costs time on pages that already fail.
const HOVER_SETTLE_MS = 2000

// 🔒 WHAT THE PAGE DOES NOT SHOW AT REST IS NOT HOVERED. A closed mega panel keeps its links in the
// layout (`visibility: hidden`, the panel parked 8 px down for its opening transition); hovered with
// `force`, one of them "jumped" 8 px when the pointer opened the panel around it — a `scan:hover-jump`
// on a different link on every page (JA Vega ld-*, 15–16 a run). At 390 the links of the closed
// drawer (off-screen by a transform) could not be reached: 217 `scan:hover-not-measured` a stage.
// Hidden = not visible, faded out on itself or an ancestor, outside the viewport sideways, or cut
// away by an ancestor that clips its overflow. They are counted apart (`hidden`), not measured. An
// element the page SHOWS and the pointer cannot reach (under another box) stays a target, and its
// failure a finding.
export function inPageHoverJump(selector) {
  const all = [...document.querySelectorAll(selector)]
  const shownAtRest = (e) => {
    const r = e.getBoundingClientRect()
    if (getComputedStyle(e).visibility !== 'visible') return false
    if (r.right <= 0 || r.left >= innerWidth) return false
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (parseFloat(cs.opacity) < 0.05) return false
      if (a !== e && cs.overflow !== 'visible') {
        const c = a.getBoundingClientRect()
        if (r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) return false
      }
    }
    return true
  }
  const boxed = all.filter((e) => {
    const r = e.getBoundingClientRect()
    return r.width > 4 && r.height > 4
  })
  const shown = boxed.filter(shownAtRest)
  const els = shown.filter((e) => {
    const r = e.getBoundingClientRect()
    return r.y >= 0 && r.y < innerHeight * 3
  })
  const taken = els.slice(0, 40)
  return {
    total: all.length,
    hidden: boxed.length - shown.length,
    skippedOutOfWindow: all.length - boxed.length + shown.length - els.length,
    skippedOverCap: els.length - taken.length,
    targets: taken.map((e, i) => {
      e.setAttribute('data-vqa-hover', String(i))
      const r = e.getBoundingClientRect()
      return { i, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, tag: e.tagName.toLowerCase(), cls: [...e.classList].filter((c) => !/^tracy-motion-(?:on|in|bold|done)$/.test(c)).slice(0, 2).join('.'), text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) }
    })
  }
}

// 🔒 READ THE WHOLE BOX, AND READ IT WHEN IT HAS STOPPED MOVING. This used to return `{w, h}` only,
// so the ordinary hover effect — `transform: translateY(...)` on a card or a button — could not be
// seen at all: the box is the same size, it is somewhere else. Measured 2026-09-17 on a page whose
// only effect is `transition: transform 400ms` / `:hover { translateY(-40px) }`, driven through
// these two functions unchanged: `y` went 24 → -16 and the scan reported nothing.
//
// Timing was the second half of the same defect. The caller sampled a flat 80 ms after moving the
// pointer, and at 80 ms that same `y` still read 24 — the transition had barely started. A fixed
// sample lands mid-motion, so two runs of one page disagree. Wait for the Web Animations on the
// element, its subtree and its ancestors to finish instead, bounded: motion that will not settle is
// reported as unmeasurable, which is a finding, not a silent pass.
function inPageSettledRect([i, boundMs, opts]) {
  const { scrollIntoView = false } = opts ?? {}
  const el = document.querySelector(`[data-vqa-hover="${i}"]`)
  if (!el) return { settled: false, reason: 'the tagged element is gone' }
  if (!el.getClientRects().length) return { settled: false, reason: 'the element has no layout box' }
  // The REST read scrolls first so that `hover()` has nothing left to scroll. `force` skips the
  // actionability checks, not the scroll, and an element below the fold makes Playwright scroll
  // between the two reads -- 0,0 → 0,554 on this kit's own fixture. Both boxes are VIEWPORT rects
  // and only comparable at one offset, so without this the whole travel reads as a scroll and the
  // element is dropped. Both sides centre-if-needed, so the scroll `hover()` would do is a no-op.
  if (scrollIntoView) {
    if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded()
    else el.scrollIntoView({ block: 'center', inline: 'center' })
  }
  const read = () => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }
  const done = () => ({ settled: true, rect: read(), scroll: { x: scrollX, y: scrollY } })
  // Two frames with the same box. It catches what `getAnimations()` cannot see -- movement driven
  // by script, frame by frame -- and it re-checks the element, because a node removed WHILE this
  // was waiting still reads a rect: all zeros, which would otherwise be recorded as a measurement.
  const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
  const holdsStill = () =>
    new Promise((resolve) => {
      let last = null
      const frame = () => {
        if (!el.isConnected || !el.getClientRects().length)
          return resolve({ settled: false, reason: 'it left the layout while being measured' })
        const r = read()
        if (last && same(r, last)) return resolve(done())
        if (performance.now() > deadline)
          return resolve({ settled: false, reason: 'the box kept moving with nothing animating' })
        last = r
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
  const chain = new Set()
  for (let n = el; n; n = n.parentElement) chain.add(n)
  const endless = (a) => a.effect?.getComputedTiming().endTime === Infinity
  const running = () => {
    const seen = new Set(el.getAnimations({ subtree: true }))
    for (let n = el.parentElement; n; n = n.parentElement) for (const a of n.getAnimations()) seen.add(a)
    return [...seen].filter(
      (a) =>
        (a.playState === 'running' || a.playState === 'pending') &&
        // A scroll- or view-timeline animation is driven by the scroll position, not by the clock:
        // it stays `running` for as long as the page can scroll, while the box it drives is
        // perfectly still. Waiting on `finished` there burns the whole bound and reports a settled
        // element as unmeasurable.
        (!a.timeline || a.timeline instanceof DocumentTimeline)
    )
  }
  const deadline = performance.now() + boundMs
  const step = () => {
    const live = running()
    // A spinner inside a button never ends, and blocking on it would report every such button as
    // unmeasurable. Only an endless animation on the element or an ancestor can move THIS box.
    const forever = live.filter((a) => endless(a) && chain.has(a.effect?.target))
    if (forever.length) return { settled: false, reason: 'an animation on it never ends' }
    const finite = live.filter((a) => !endless(a))
    if (!finite.length) return holdsStill()
    const left = deadline - performance.now()
    if (left <= 0) return { settled: false, reason: `still moving after ${boundMs} ms` }
    return Promise.race([
      Promise.all(finite.map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, left))
    ]).then(step)
  }
  return step()
}


/**
 * Whether the page is in dark the way `hook` put it there, read in the page. Two questions, both
 * required:
 *  - the MARK: the parts of a hook that write on the root (`attr:`, `class:`) are read back where
 *    they wrote — a source whose own theme script runs after the init script can undo them;
 *  - the PAINT: a mark the page's CSS never reads is no dark. Colours are read as they show: each
 *    background laid over the one beneath it, down to the white canvas. Either the page paints dark
 *    (`body` over `html` over the canvas has luma < 128), or
 *    taking the root marks off — transitions held, put back at once — changes the background or the
 *    text colour of elements that together cover at least `DARK_PAINT_SHARE` of the page (the dark
 *    is drawn on parts of it: cards, header, text). A border, an outline or a badge alone is not a
 *    dark page: its colours are counted in `observed`, never as the dark. A hook that leaves no mark
 *    (a request `cookie:`, `ls:`) can only be read from the background.
 * Returns `{ holds, checks }`.
 */
export function inPageDarkHolds(hook) {
  const root = document.documentElement
  const checks = []
  const marks = []
  for (const part of String(hook ?? '').split('+').filter(Boolean)) {
    const at = part.indexOf(':')
    const kind = part.slice(0, at)
    const spec = part.slice(at + 1)
    if (kind === 'attr') {
      const [name, value = 'dark'] = spec.split('=')
      checks.push({ part, observed: root.getAttribute(name), holds: root.getAttribute(name) === value })
      marks.push({ off: () => root.removeAttribute(name), on: () => root.setAttribute(name, value) })
    } else if (kind === 'class') {
      checks.push({ part, observed: root.className, holds: root.classList.contains(spec) })
      marks.push({ off: () => root.classList.remove(spec), on: () => root.classList.add(spec) })
    }
  }
  // 🔒 A COLOUR IS WHAT IT SHOWS, NOT WHAT IT DECLARES. A half-transparent grey over a light page
  // shows light; its RGB alone reads dark (Sol review of #19 item 6, round 4). Every background is
  // laid over the one beneath it, down to the white canvas, before its lightness is read.
  const rgbaOf = (c) => {
    const v = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c ?? '')
    return v ? [+v[1], +v[2], +v[3], v[4] === undefined ? 1 : +v[4]] : [0, 0, 0, 0]
  }
  const over = (c, base) => { const [r, g, b, a] = rgbaOf(c); return [0, 1, 2].map((k) => [r, g, b][k] * a + base[k] * (1 - a)) }
  const luma = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114
  const CANVAS = [255, 255, 255]
  // 🔒 OPACITY IS PART OF WHAT SHOWS. A black card at opacity .01 shows near white (Sol review of
  // #19 item 6, round 7). An element with opacity `o` is a group: its content — its background over
  // what its parent's content shows there — is laid at `o` over that parent content, and the result
  // goes through the parent's own group the same way. `layer` keeps, per element, the colour its
  // content shows (`inner`) and the map from its content space to the screen (`shows(x) = a·x + c`).
  // As measured in Chromium: with a transparent `html` the `body` background is the canvas —
  // painted at the root, `body` opacity does not touch it; `html` opacity fades the whole page.
  const layer = (bg, opacity, parent) => {
    const inner = over(bg, parent.inner)
    const back = parent.inner.map((v, k) => parent.a * (1 - opacity) * v + parent.c[k])
    const out = { inner, a: parent.a * opacity, c: back }
    out.shows = out.inner.map((v, k) => out.a * v + out.c[k])
    return out
  }
  const SCREEN = { inner: CANVAS, a: 1, c: [0, 0, 0] }
  const rootCs = getComputedStyle(root)
  const bodyCs = document.body ? getComputedStyle(document.body) : null
  const propagated = rgbaOf(rootCs.backgroundColor)[3] === 0
  const rootLayer = layer(propagated ? bodyCs?.backgroundColor : rootCs.backgroundColor, parseFloat(rootCs.opacity), SCREEN)
  const bodyLayer = bodyCs ? layer(propagated ? 'transparent' : bodyCs.backgroundColor, parseFloat(bodyCs.opacity), rootLayer) : rootLayer
  const shownFill = bodyLayer.shows
  const fill = `rgb(${shownFill.map(Math.round).join(', ')})`
  const darkFill = luma(shownFill) < 128
  if (!marks.length || darkFill) checks.push({ part: 'background', observed: fill, holds: darkFill })
  else if (checks.every((c) => c.holds)) {
    // 🔒 THE DARK IS AN AREA, NOT A COUNT. `changed > 0` took a light page whose one card border
    // turns grey under the mark for a dark source (Sol review of #19 item 6). What counts is the
    // share of the page painted DARK by the mark: an element whose background turns to a dark one,
    // or whose own words change colour over a dark surface, marks its box on a coarse grid of the
    // document. Words whitened over a light page, or a surface turned lighter, paint no dark
    // (Sol review, round 3).
    const SHARE = 0.1 // DARK_PAINT_SHARE
    const els = [root, document.body, ...document.body.querySelectorAll('*')].slice(0, 1500)
    const at = new Map(els.map((e, i) => [e, i]))
    const painted = (c) => rgbaOf(c)[3] > 0
    const ownWords = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    const paint = () => els.map((e) => { const cs = getComputedStyle(e); return { bg: cs.backgroundColor, fg: cs.color, border: cs.borderTopColor, visible: cs.visibility === 'visible', opacity: parseFloat(cs.opacity) } })
    const hold = document.createElement('style')
    hold.textContent = '*,*::before,*::after{transition:none!important}'
    document.head.append(hold)
    const on = paint()
    for (const k of marks) k.off()
    const off = paint()
    for (const k of marks) k.on()
    hold.remove()
    const W = Math.max(1, root.scrollWidth)
    const H = Math.max(1, root.scrollHeight)
    const cols = 40
    const rows = Math.max(1, Math.min(400, Math.round((cols * H) / W)))
    const grid = new Uint8Array(cols * rows)
    let surfaces = 0
    let words = 0
    let borders = 0
    // The surface each element shows, as the mark paints it: its `layer` — its own background over
    // its parent's content, under its opacity — down to the canvas. Parents come before children.
    // 🔒 ONLY WHAT IS DRAWN COUNTS. A box under `visibility: hidden`, or under `opacity: 0` on
    // itself or any ancestor, has its geometry and its colours but paints nothing: a hidden dark
    // panel over a light page is no dark (Sol review of #19 item 6, round 6). Its background adds
    // nothing to the surface its children show, and it marks no area.
    const layers = []
    const seen = []
    els.forEach((e, i) => {
      const p = at.get(e.parentElement)
      seen[i] = on[i].opacity * (p === undefined ? 1 : seen[p])
      if (e === root) layers[i] = rootLayer
      else if (e === document.body) layers[i] = bodyLayer
      else layers[i] = layer(on[i].visible ? on[i].bg : 'transparent', on[i].opacity, layers[p] ?? bodyLayer)
    })
    const drawn = (i) => on[i].visible && seen[i] > 0
    const dark = (i) => luma(layers[i].shows) < 128
    els.forEach((e, i) => {
      const bg = drawn(i) && on[i].bg !== off[i].bg && painted(on[i].bg) && dark(i)
      const fg = drawn(i) && on[i].fg !== off[i].fg && ownWords(e) && dark(i)
      if (on[i].border !== off[i].border) borders++
      if (!bg && !fg) return
      if (bg) surfaces++
      else words++
      const r = e === root ? { left: 0, top: 0, right: W, bottom: H } : e.getBoundingClientRect()
      const dy = e === root ? 0 : scrollY
      const dx = e === root ? 0 : scrollX
      const c0 = Math.max(0, Math.floor(((r.left + dx) / W) * cols))
      const c1 = Math.min(cols, Math.ceil(((r.right + dx) / W) * cols))
      const r0 = Math.max(0, Math.floor(((r.top + dy) / H) * rows))
      const r1 = Math.min(rows, Math.ceil(((r.bottom + dy) / H) * rows))
      for (let y = r0; y < r1; y++) for (let x = c0; x < c1; x++) grid[y * cols + x] = 1
    })
    const share = grid.reduce((a, b) => a + b, 0) / grid.length
    checks.push({
      part: 'paint',
      observed: `background ${fill}; without the hook ${surfaces} surfaces turn dark and ${words} runs of words change colour over dark surfaces, over ${Math.round(share * 100)}% of the page (at least ${SHARE * 100}% is dark), ${borders} borders change`,
      holds: share >= SHARE
    })
  }
  return { holds: checks.every((c) => c.holds), checks }
}

/**
 * Scroll the whole page once and wait for every picture to decode before anything is measured
 * or shot: WordPress marks below-the-fold images `loading="lazy"`, so a full-page screenshot of
 * an unscrolled page shows empty frames and the census counts `naturalWidth 0` — five client
 * logos "vanished" in one run for exactly that reason.
 */
export async function settle(page, { boundMs = 15000 } = {}) {
  await page.evaluate(async (boundMs) => {
    const step = Math.max(400, innerHeight - 100)
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 40))
    }
    scrollTo(0, 0)
    // 🔒 ONLY WHAT THE SCROLL DID NOT BRING IS SWITCHED TO EAGER. `sizes="auto"` (WordPress prints
    // it on every lazy picture) is valid only while the picture is lazy: switching a picture the
    // scroll had already loaded left `auto` invalid, and the next viewport change — the full-page
    // screenshot is one — chose again by the fallback sizes: a second request, `currentSrc` empty
    // while it ran, and another file once it landed. JA Vega M4c (#19 item 3): listing cards drawn
    // in one run and blank in the next, light and dark, every one of them `complete`. A picture
    // switched here is re-selected NOW (its `sizes` written back), so whatever it loads, it loads
    // before the wait below, not during a shot.
    for (const im of document.images) {
      if (im.complete || im.loading !== 'lazy') continue
      im.loading = 'eager'
      if (im.hasAttribute('sizes')) im.setAttribute('sizes', im.getAttribute('sizes'))
    }
    // Bounded, load AND decode by one deadline: `decode()` of a picture whose answer never comes
    // waits as long as its load, so an unbounded decode turned one hung picture into a timed-out
    // `page.evaluate` (an `axis-error`, the page unmeasured). A picture still loading at the deadline
    // is not waited on further; it reads undecoded and the census (`image-broken`,
    // `source-not-rendered`) names it.
    const until = Date.now() + boundMs
    const deadline = () => new Promise((r) => setTimeout(r, Math.max(0, until - Date.now())))
    const arrived = Promise.all([...document.images].map((im) => (im.complete ? null : new Promise((r) => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }) }))))
    await Promise.race([arrived, deadline()])
    await Promise.race([Promise.all([...document.images].map((im) => (im.decode ? im.decode().catch(() => null) : null))), deadline()])
    // 🔒 A SHOT PAINTS EVERY PICTURE IT HAS, DECODED IN THE SAME FRAME. The full-page screenshot
    // resizes the page (a `resize` to 1×1 and back, measured on the JA Vega listing) and a
    // `decoding="async"` picture — WordPress prints it on every one — may then be painted before its
    // bitmap is decoded again, or after the resize chose another file of its srcset: a blank frame
    // in a picture that reads `complete`. Live, /category-blog 1440: with `async`, 2 and then 4 of 6
    // dark runs drew a card blank in one of two consecutive shots; with `sync`, 0 of 12 runs, light
    // and dark, 168 card draws (#19 item 3, round 2). No fixture page reproduces the blank frame.
    for (const im of document.images) im.decoding = 'sync'
    if (document.fonts?.ready) await document.fonts.ready
  }, boundMs)
  // Motion held still (lib/motion.mjs): scroll-in reveals shown, carousels on their first slide,
  // animations at their end — or two reads of the same page differ (JA Vega home: 53 AOS elements,
  // 2.5 % of the full-page pixels apart between two live shots, 0 frozen). What was stopped is
  // returned and kept on the axis: a carousel no library API reaches is `unhandled`, still moving.
  const motion = await freezeMotion(page)
  await page.waitForTimeout(200)
  return motion
}

// ─────────────────────────────────────────────── pure helpers
function parseColor(s) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s ?? '')
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
}
/** The copies a looping carousel makes of its slides: a picture there is one the page shows once elsewhere. */
const CLONED_SLIDES = '.owl-item.cloned, .slick-cloned, .swiper-slide-duplicate'
const DEFAULT_SERIF = new Set(['times', 'times new roman'])
const firstFamily = (f) => String(f ?? '').split(',')[0].replace(/["']/g, '').trim().toLowerCase()


const GENERIC = new Set(['system-ui', 'sans-serif', 'serif', 'monospace', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'inherit'])
/** Findings for nodes whose drawn font is not the family the page asked for. */
export function fontFallbacks(samples, allowed = null) {
  const out = []
  for (const s of samples) {
    const want = firstFamily(s.requested)
    if (!want || GENERIC.has(want)) continue
    const got = String(s.used ?? '').toLowerCase()
    const ok = got.includes(want) || want.includes(got.split(' ')[0]) || (allowed && allowed.some((a) => got.includes(a.toLowerCase())))
    if (!ok) out.push({ selector: s.selector, requested: want, drawn: s.used })
  }
  return out
}

/** Compare one property two-sided; null when within tolerance, else {property, expected, observed}. */
export function diffProperty(property, source, site, { hexTolerance = 8, pxTolerance = 1 } = {}) {
  if (source === site) return null
  // `line-height: normal` is a keyword, not a length; the two sides cannot be compared — but the
  // escape has to be about LINE-HEIGHT, which it was not. Chrome computes an unset `letter-spacing`
  // to the literal string `normal`, so a site that added `letter-spacing: 3px` where the source has
  // none matched `site === 'normal'`... no: `source === 'normal'` — and the mismatch was dropped.
  // Any property whose computed value can be the keyword was exempt from comparison entirely.
  if (property === 'line-height' && (source === 'normal' || site === 'normal')) return null
  // `letter-spacing: normal` IS zero spacing — Chrome computes the keyword, not `0px`, when the
  // property is unset. Narrowing the escape above without this turned the most ordinary pair there
  // is (`normal` against `0px`, the same rendering) into a mismatch on every left-aligned run.
  if (property === 'letter-spacing') {
    const zero = (v) => v === 'normal' || v === '0px' || v === '0'
    if (zero(source) && zero(site)) return null
  }
  if (/color/.test(property)) {
    const a = parseColor(source)
    const b = parseColor(site)
    if (a && b) {
      if (a[3] === 0 && b[3] === 0) return null
      const d = Math.max(...a.slice(0, 3).map((v, i) => Math.abs(v - b[i])))
      return d <= hexTolerance && Math.abs(a[3] - b[3]) < 0.05 ? null : { property, expected: source, observed: site }
    }
  }
  // A page that names no font-family draws the browser default, which Chromium computes as `Times`
  // and, once a full-page capture has resized the viewport, as `"Times New Roman"` — the same face; a
  // side read before the capture and a side read after it must not differ on that alone.
  if (property === 'font-family' && DEFAULT_SERIF.has(firstFamily(source)) && DEFAULT_SERIF.has(firstFamily(site))) return null
  if (property === 'font-family') return firstFamily(source) === firstFamily(site) ? null : { property, expected: source, observed: site }
  // The sign belongs to the number. Without it a negative length fell past this branch to the
  // unconditional mismatch below, so `-0.5px` against `-0.4px` was a finding while `0.5px` against
  // `0.4px` was within tolerance — and negative `letter-spacing` is ordinary in display headings.
  const px = /^(-?[\d.]+)px$/
  if (px.test(source) && px.test(site)) return Math.abs(parseFloat(source) - parseFloat(site)) <= pxTolerance ? null : { property, expected: source, observed: site }
  return { property, expected: source, observed: site }
}

/**
 * The hits of one text grouped into OCCURRENCES — the places on the page that say these words:
 * by the `place` the index assigned (a wrapper and the inline child that holds its words), or,
 * for an index without one, by adjacency in document order.
 */
function sourceOccurrences(hits) {
  const groups = []
  for (const h of [...hits].sort((a, b) => a.order - b.order)) {
    const g = groups[groups.length - 1]
    const samePlace = g && (typeof h.place === 'number' ? h.place === g[0].place : h.order === g[g.length - 1].order + 1)
    if (samePlace) g.push(h)
    else groups.push([h])
  }
  return groups
}

/**
 * The source element a site element pairs with when its words repeat on the source. The site
 * side is read in document order; a site element whose words occur at ONE place on the source
 * is an anchor, and a repeat is resolved from the last anchor: among the occurrences after it and
 * before the next anchor (`until`) — else among all after it — the first that holds the same tag
 * (else the first), skipping occurrences an earlier site element of the same words already
 * took — six "Apply →" links pair with six source rows, in order. Within the occurrence the same tag, else the deepest. A page's chrome is not stripped
 * from the source (a canvas export's header is anonymous divs), so by tag alone the closing
 * call's "Request a quote" met the header button of the same words (green, not the call's
 * orange), the ink call's "Services" met the nav link (14.5px/500 grey), the contact card's
 * values met the footer's links, and the careers stat label "Open roles" — a <p>, no <p> on the
 * source — met the LAST occurrence, the 36px title of the roles list (full-2, 15/09: 68 rows).
 * With the anchor the call's button follows the call's own intro, the label its figure. The
 * next anchor bounds the search from below: JA Vega's card links (`a` on the site, a `div` on the
 * source) paired with the `a.btn` of the same words three sections down, not their own card.
 * An index without positions (an older snapshot) keeps the old rule: same tag, else the last.
 * Returns `{ hit, anchor }` — the new anchor when the words were unique, else the old one;
 * `taken` (a Set of occurrence positions) is updated in place.
 */
function pickSourceHit(hits, tag, anchor = -1, taken = new Set(), until = Infinity) {
  if (!Array.isArray(hits)) return { hit: hits ?? null, anchor }
  if (!hits.length) return { hit: null, anchor }
  const sameTag = hits.filter((h) => h.tag === tag)
  if (!hits.every((h) => typeof h.order === 'number')) return { hit: sameTag.length ? sameTag[0] : hits[hits.length - 1], anchor }
  const occurrences = sourceOccurrences(hits)
  const last = (g) => g[g.length - 1].order
  const after = occurrences.filter((g) => last(g) > anchor)
  // 🔒 THE SECTION BEFORE THE TAG. The place between this anchor and the next one (`until`, the
  // source position of the next site element whose words are unique) is the same stretch of the
  // page on both sides; only when none is left there does the tag reach further. By tag alone the
  // card link "Learn more" (`a` on the site, `div.feature-link` on the source) skipped its own card
  // for the next `a` of those words — a white-on-blue button three sections down (JA Vega M4b).
  const within = after.filter((g) => g[0].order < until && !taken.has(last(g)))
  const scope = within.length ? within : after
  const withTag = scope.filter((g) => g.some((h) => h.tag === tag))
  const pool = withTag.length ? withTag : scope.length ? scope : occurrences.slice(-1)
  const place = pool.find((g) => !taken.has(last(g))) ?? pool[0]
  taken.add(last(place))
  const hit = place.find((h) => h.tag === tag) ?? place[place.length - 1]
  return { hit, place, anchor: occurrences.length === 1 ? last(place) : anchor }
}

/** Properties that belong to the words (read on the element that draws them); the rest belong to the box. */
const TEXT_PROPS = Object.freeze(['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-transform', 'letter-spacing'])
const transparent = (c) => /^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/.test(String(c ?? '').trim())

/**
 * The styles one source place shows, composed the way inPageSnapshot composes the site's: the text
 * properties from the DEEPEST element of the place (the last in document order — the inline child
 * that holds the words), the fill from the deepest one that paints, else from `hit` (the picked
 * element). JA Vega (M4): the source's "What we do" is a 12 px pill span in a 32 px h3, the theme's
 * is an h3 drawn as the pill; picking the h3 by tag compared 32 px with 12 px (16 findings a run).
 * A place without positions is the hit alone.
 */
function composeStyles(place, hit) {
  if (!Array.isArray(place) || place.length < 2) return hit.styles
  const deepest = place[place.length - 1]
  const painted = [...place].reverse().find((h) => h.styles && h.styles['background-color'] !== undefined && !transparent(h.styles['background-color'])) ?? hit
  const out = {}
  for (const k of new Set([...Object.keys(hit.styles ?? {}), ...Object.keys(deepest.styles ?? {})])) out[k] = (TEXT_PROPS.includes(k) ? deepest : painted).styles?.[k]
  return out
}

/**
 * The computed values of `properties` on the first element `selector` matches (the body), in the
 * page: `{ found, values }` — a value the engine does not report is '' (never a default).
 */
function inPageComputed({ selector, properties }) {
  const el = document.querySelector(selector)
  if (!el) return { found: false, values: {} }
  const cs = getComputedStyle(el)
  const values = {}
  for (const p of properties) values[p] = String(cs.getPropertyValue(p) ?? '').trim()
  return { found: true, values }
}

/**
 * The body's text rendering, two-sided: a property whose values differ is `parity-body`
 * (property, expected = the source's, observed = the site's); one a side could not read — no body,
 * a property the engine does not report — is `parity-body-not-measured`, never an equal pair.
 */
export function bodyRenderingFindings(source, site, properties = BODY_RENDERING) {
  const findings = []
  const components = []
  for (const property of properties) {
    const read = { source: source?.found ? source.values?.[property] : null, site: site?.found ? site.values?.[property] : null }
    const blind = Object.entries(read).filter(([, v]) => typeof v !== 'string' || !v).map(([side]) => side)
    if (blind.length) {
      findings.push({ kind: 'parity-body-not-measured', element: 'body', subject: { selector: 'body' }, properties: [property], property, side: blind.join('+'), reason: `${blind.join(' and ')} did not report ${property}` })
      components.push({ rule: 'parity-body', element: 'body', status: 'FAIL', deltas: [{ property, expected: read.source ?? null, observed: read.site ?? null }] })
      continue
    }
    const same = read.source.toLowerCase() === read.site.toLowerCase()
    components.push({ rule: 'parity-body', element: 'body', status: same ? 'ok' : 'FAIL', deltas: same ? [] : [{ property, expected: read.source, observed: read.site }] })
    if (!same) findings.push({ kind: 'parity-body', element: 'body', subject: { selector: 'body' }, properties: [property], property, expected: read.source, observed: read.site })
  }
  return { findings, components }
}

/**
 * The width of the container `selector` names, in the page: the first match that is drawn
 * (displayed, visible, wider than 0). `{ width, matched, viewport }`, or `{ error }` — an invalid
 * selector, no match, nothing drawn, a width that is not a finite number.
 */
function inPageContainerWidth(selector) {
  let els
  try {
    els = [...document.querySelectorAll(selector)]
  } catch (e) {
    return { error: `invalid selector ${selector}: ${String(e.message).split('\n')[0]}` }
  }
  if (!els.length) return { error: `no element matches ${selector}` }
  for (const el of els) {
    const cs = getComputedStyle(el)
    const w = el.getBoundingClientRect().width
    if (cs.display === 'none' || cs.visibility === 'hidden' || !(w > 0)) continue
    if (!Number.isFinite(w)) return { error: `${selector}: width ${w} is not a number` }
    return { width: Math.round(w * 100) / 100, matched: els.length, viewport: document.documentElement.clientWidth }
  }
  return { error: `${els.length} element(s) match ${selector}, none is drawn` }
}

/**
 * Container probes, two-sided: `measured` is `{ source, site }`, each a map `"<item>@<width>"` → the
 * inPageContainerWidth answer (or `{ error }`). A width that differs by more than `tolerance` is
 * `container-width` (expected = the source's width, observed = the site's); a probe either side
 * could not measure is `container-not-measured`. `rows` is one line per probe, whatever happened.
 */
export function containerFindings(probes, measured, tolerance = 1) {
  const findings = []
  const rows = []
  for (const pr of probes) {
    const key = `${pr.item}@${pr.width}`
    const element = `container ${pr.item} @${pr.width}px`
    const got = { source: measured?.source?.[key] ?? { error: 'not measured' }, site: measured?.site?.[key] ?? { error: 'not measured' } }
    const blind = Object.entries(got).filter(([, r]) => !(typeof r?.width === 'number' && Number.isFinite(r.width)))
    if (blind.length) {
      const reason = blind.map(([side, r]) => `${side}: ${r?.error ?? 'no width'}`).join('; ')
      rows.push({ item: pr.item, width: pr.width, theme: pr.theme, status: 'not-measured', reason })
      findings.push({ kind: 'container-not-measured', element, subject: { selector: pr.site }, properties: ['width'], container: pr.item, width: pr.width, theme: pr.theme, side: blind.map(([side]) => side).join('+'), reason })
      continue
    }
    const delta = Math.round((got.site.width - got.source.width) * 100) / 100
    const ok = Math.abs(delta) <= tolerance
    rows.push({ item: pr.item, width: pr.width, theme: pr.theme, status: ok ? 'ok' : 'mismatch', source: got.source.width, site: got.site.width })
    if (!ok) findings.push({ kind: 'container-width', element, subject: { selector: pr.site }, properties: ['width'], container: pr.item, width: pr.width, theme: pr.theme, property: 'width', expected: `${got.source.width}px`, observed: `${got.site.width}px`, selector: { source: pr.source, site: pr.site } })
  }
  return { findings, rows }
}

/**
 * Measure container probes on one side: a FRESH LOAD at each breakpoint (a new page, its viewport
 * that width before the first request), then every selector read. A resize would answer only for a
 * container CSS lays out; one a script sizes at load keeps its first width through a resize (#37
 * review). A load that answers another status than `status` — a 404 page that happens to carry the
 * selector — measures nothing at that width: each of its selectors is `{ error }`.
 */
async function probeContainers(browser, { url, widths, selectors, height, pageOpts, status }) {
  const out = {}
  for (const width of widths) {
    await withPage(browser, { ...pageOpts, viewport: { width, height } }, async (pg) => {
      const res = await pg.goto(url, { waitUntil: 'networkidle' })
      const got = res?.status() ?? 0
      if (got !== status) {
        for (const [item] of selectors) out[`${item}@${width}`] = { error: `${url} answered ${got || 'no response'} at ${width}px, expected ${status}` }
        return
      }
      await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      for (const [item, sel] of selectors) out[`${item}@${width}`] = await pg.evaluate(inPageContainerWidth, sel)
    })
  }
  return out
}

/** Two-sided parity by words: every site element whose text exists on the source is a component. */
export function parityByText(siteElements, sourceIndex, { properties, hexTolerance, pxTolerance }) {
  const components = []
  const findings = []
  let classified = 0
  const unclassified = []
  const unclassifiedFindings = []
  let anchor = -1
  const taken = new Set()
  // 🔒 THE SAME SIDE OF THE CHROME LINE FIRST. The site is measured over its scope (`main`), so its
  // coverage has no header; the source index covers the whole body. On /contact the header button
  // "Contact Us" (16 px, a filled button) comes first on the source and the masthead title (an h3,
  // 36 px) second; the site's title is an h1 — no h1 on the source — so the pick fell to the first
  // occurrence, the button, and read a `parity-mismatch` every tier (JA Vega M4d, #27 item 5). Both
  // sides record whether an element sits in chrome (a navigation landmark, the page's own
  // header/footer); a site element picks among the source places on its own side of that line, and
  // is an anchor when it has one place there. When the source has none on that side — chrome the
  // source writes as anonymous divs, or words the source says only in its header — every place
  // stays a candidate, as before. An index or a snapshot without the flag keeps the old rule.
  const hitsOf = (e) => {
    const hits = sourceIndex[e.text]
    if (!Array.isArray(hits) || typeof e.inChrome !== 'boolean' || !hits.every((h) => typeof h.inChrome === 'boolean')) return hits
    return hits.filter((h) => h.inChrome === e.inChrome)
  }
  // The source position of a site element's words when they are said at ONE place there — an anchor.
  const anchorAt = (e) => {
    const hits = hitsOf(e)
    if (e.tag === 'img' || !Array.isArray(hits) || !hits.length || !hits.every((h) => typeof h.order === 'number')) return null
    const g = sourceOccurrences(hits)
    return g.length === 1 ? g[0][g[0].length - 1].order : null
  }
  // The site place a pick was made for: a link inside a paragraph of the same words is that place.
  const pickedAt = new Map()
  for (const [i, el] of siteElements.entries()) {
    if (el.tag === 'img') continue
    const same = el.place != null ? pickedAt.get(el.place) : null
    let until = Infinity
    if (!same)
      for (const next of siteElements.slice(i + 1)) {
        const at = anchorAt(next)
        if (at !== null && at > anchor) {
          until = at
          break
        }
      }
    const picked = same && same.text === el.text ? { hit: same.place ? (same.place.find((h) => h.tag === el.tag) ?? same.place[same.place.length - 1]) : same.hit, place: same.place, anchor } : pickSourceHit(hitsOf(el), el.tag, anchor, taken, until)
    if (el.place != null && picked.hit && !same) pickedAt.set(el.place, { text: el.text, hit: picked.hit, place: picked.place })
    const src = picked.hit
    const label = `${el.tag}${el.cls ? '.' + el.cls : ''} "${el.text.slice(0, 40)}"`
    if (!src) {
      unclassified.push(label)
      unclassifiedFindings.push({ element: label, subject: { selector: `${el.tag}${el.cls ? '.' + el.cls.split('.').join('.') : ''}`, text: el.text } })
      continue
    }
    anchor = picked.anchor
    classified++
    const srcStyles = composeStyles(picked.place, src)
    const deltas = properties.map((p) => diffProperty(p, srcStyles[p], el.styles[p], { hexTolerance, pxTolerance })).filter(Boolean)
    components.push({ rule: 'parity', element: label, status: deltas.length ? 'FAIL' : 'ok', deltas })
    if (deltas.length) findings.push({ kind: 'parity-mismatch', element: label, subject: { selector: `${el.tag}${el.cls ? '.' + el.cls.split('.').join('.') : ''}`, text: el.text }, properties: deltas.map((d) => d.property), deltas })
  }
  // 🔒 THE OTHER DIRECTION. Everything above walks the SITE. Nothing walked the SOURCE, so text the
  // site simply DROPPED produced no row at all — delete a whole testimonials section and the
  // remaining elements still matched and the axis read `ok`.
  //
  // It is narrow for a reason measured the hard way: a first version reported any unclaimed source
  // HEADING and fired on intact footer headings, because the source is indexed over `body` while
  // the site is measured over `design.images.scope`. Three conditions now, all of them about
  // asking the same question of both sides:
  //   · the heading must sit INSIDE the region the site was measured over (`inSiteScope`) — a
  //     heading outside it is not missing, it was never asked for;
  //   · it must be an h1-h3 — the structural claim of the page, so a dropped one is a dropped
  //     section rather than a reworded line;
  //   · counted PER OCCURRENCE. The source may carry the same heading twice ("Reviews" over two
  //     blocks); the site dropping one of them is a dropped section just as much as dropping the
  //     only one. An earlier version asked whether ANY occurrence was claimed and therefore missed
  //     exactly that case — it is counted here instead, and the count is in the message so a
  //     reader is not left wondering which of two identical headings is meant.
  // An index without `order` (an older snapshot) cannot place occurrences at all, so it is skipped
  // rather than guessed at.
  const droppedHeadings = []
  for (const [text, hits] of Object.entries(sourceIndex)) {
    if (!Array.isArray(hits) || !hits.length) continue
    if (!hits.every((h) => typeof h.order === 'number')) continue
    const groups = sourceOccurrences(hits)
    // Only the occurrences that are themselves a heading inside the site's region are eligible;
    // the same words appearing again as a link elsewhere are not a section.
    const eligible = groups.filter((g) => g.some((h) => /^h[1-3]$/.test(h.tag) && h.inSiteScope))
    if (!eligible.length) continue
    const missing = eligible.filter((g) => !taken.has(g[g.length - 1].order))
    if (!missing.length) continue
    const tag = eligible[0].find((h) => /^h[1-3]$/.test(h.tag)).tag
    droppedHeadings.push({
      element: eligible.length > 1
        ? `${tag} "${text.slice(0, 40)}" (${missing.length} of ${eligible.length} occurrences)`
        : `${tag} "${text.slice(0, 40)}"`,
      subject: { selector: tag, text }
    })
  }
  for (const heading of droppedHeadings) findings.push({ kind: 'parity-not-measured', ...heading, side: 'site' })
  return { components, findings, classified, unclassified, unclassifiedFindings, droppedHeadings: droppedHeadings.length }
}

export function axesFor(contract, page) {
  const vs = page.variants.map((id) => contract.variants.find((v) => v.id === id)).filter(Boolean)
  const widths = [...new Set(vs.map((v) => v.width))].sort((a, b) => b - a)
  return widths.flatMap((w) => ['light', 'dark'].flatMap((t) => vs.filter((v) => v.width === w && v.theme === t)))
}
const stageOf = (contract, variantId) => (contract.visual?.stages ?? STAGES).find((s) => s.variants.includes(variantId))?.id ?? null
const layoutOf = (contract, page) => contract.layouts?.find((l) => l.id === page.layout) ?? null
/**
 * Who consumes the `side` picture of `page` at `variant`: the representative's lenses; `sampled`, the
 * sampled lenses of a page picked for findings its representative does not have — in ANY locale: a
 * shot's `locales` says which representatives are pictured, and a page failing in its own way is read
 * whatever its locale (lens-work.mjs asks for the same picture).
 */
export function consumersFor(contract, page, variant, side, { sampled = false } = {}) {
  const layout = layoutOf(contract, page)
  if (!layout || !contract.visual?.shots) return sampled ? null : ['reviewer']
  if (!sampled && routeOf(page.id) !== routeOf(layout.representative)) return null
  const stage = stageOf(contract, variant.id)
  const out = new Set()
  for (const sh of contract.visual.shots) {
    if (sh.side !== side || !sh.stages.includes(stage)) continue
    if (sh.variants && !sh.variants.includes(variant.id)) continue
    if (!sampled && !sh.locales.includes(page.locale)) continue
    for (const c of sh.consumers) if (!sampled || SAMPLED_LENSES.includes(c)) out.add(c)
  }
  return out.size ? [...out] : null
}

/** Absolute census floor used only when the source page census could not be read. */
export const EXAMINED_FLOOR = 20
/** A page is too short relative to the same in-page census on its source. */
export const examinedTooFew = (siteCount, sourceCount, sourceRead = sourceCount !== null && sourceCount !== undefined) =>
  siteCount < (sourceRead ? Math.ceil(sourceCount / 2) : EXAMINED_FLOOR)

/** Count visible content places, images and controls once on the current page. */
export function inPageExaminedCensus({ html = null } = {}) {
  const cloneSelector = '.owl-item.cloned, .slick-cloned, .swiper-slide-duplicate'
  const controls = 'a, button, input:not([type="hidden"]), select, textarea, [role="button"]'
  const hiddenByTree = (e) => {
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      if (a.hidden || a.inert || a.hasAttribute('inert') || a.getAttribute('aria-hidden') === 'true') return true
      const cs = getComputedStyle(a)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return true
    }
    return false
  }
  const clipped = (e) => {
    const functionArgs = (value, name) => {
      const start = value.toLowerCase().indexOf(`${name}(`)
      if (start < 0) return null
      const open = start + name.length
      let depth = 0
      for (let i = open; i < value.length; i++) {
        if (value[i] === '(') depth++
        else if (value[i] === ')' && --depth === 0) return value.slice(open + 1, i)
      }
      return null
    }
    const splitTerms = (value) => {
      const terms = []
      let token = ''
      let depth = 0
      for (const char of value) {
        if (/\s/.test(char) && depth === 0) {
          if (token) terms.push(token), token = ''
        } else {
          token += char
          if (char === '(') depth++
          else if (char === ')') depth--
        }
      }
      if (token) terms.push(token)
      const round = terms.findIndex((term) => term.toLowerCase() === 'round')
      return round < 0 ? terms : terms.slice(0, round)
    }
    const insetLeavesNoArea = (value, width, height, fontSize) => {
      const args = functionArgs(value, 'inset')
      if (args === null) return false
      const sides = splitTerms(args)
      if (sides.length < 1 || sides.length > 4) return false
      const [top, right = top, bottom = top, left = right] = sides
      const container = document.createElement('div')
      const probe = document.createElement('div')
      container.style.cssText = `position:absolute;left:-100000px;top:0;width:${width}px;height:${height}px;margin:0;padding:0;border:0;overflow:hidden;contain:strict;visibility:hidden;pointer-events:none;font-size:${fontSize}`
      probe.style.cssText = 'position:absolute;left:0;top:0;margin:0;padding:0;border:0;box-sizing:content-box'
      container.appendChild(probe)
      document.documentElement.appendChild(container)
      const resolve = (term, axis) => {
        probe.style.width = '0px'
        probe.style.height = '0px'
        probe.style[axis] = ''
        probe.style[axis] = term
        if (!probe.style[axis]) return null
        const pixels = parseFloat(getComputedStyle(probe)[axis])
        return Number.isFinite(pixels) ? pixels : null
      }
      const t = resolve(top, 'height')
      const b = resolve(bottom, 'height')
      const l = resolve(left, 'width')
      const r = resolve(right, 'width')
      container.remove()
      return t !== null && b !== null && l !== null && r !== null && (t + b >= height || l + r >= width)
    }
    const rectLeavesNoArea = (value, width, height) => {
      const match = /^rect\(([^)]*)\)$/i.exec(value.trim())
      if (!match) return false
      const sides = match[1].split(/[\s,]+/).filter(Boolean)
      if (sides.length !== 4) return false
      const [top, right, bottom, left] = sides
      const length = (side, fallback) => {
        if (side.toLowerCase() === 'auto') return fallback
        const match = /^([+-]?(?:\d+\.?\d*|\.\d+))px$/i.exec(side)
        return match ? parseFloat(match[1]) : null
      }
      const t = length(top, 0)
      const r = length(right, width)
      const b = length(bottom, height)
      const l = length(left, 0)
      return t !== null && r !== null && b !== null && l !== null && (r - l <= 1 || b - t <= 1)
    }
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a)
      const r = a.getBoundingClientRect()
      if ((cs.position === 'absolute' || cs.position === 'fixed') && (
        r.width <= 1 || r.height <= 1 || insetLeavesNoArea(cs.clipPath, r.width, r.height, cs.fontSize) || rectLeavesNoArea(cs.clip, r.width, r.height)
      )) return true
    }
    return false
  }
  const counted = new Set()
  const inChrome = (e) => {
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      if (a.matches('nav, [role="navigation"], [role="banner"], [role="contentinfo"]')) return true
      if ((a.tagName === 'HEADER' || a.tagName === 'FOOTER') && !a.parentElement?.closest('article, aside, main, nav, section')) return true
    }
    return false
  }
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest(cloneSelector) || hiddenByTree(e) || clipped(e) || inChrome(e)) continue
    const tag = e.tagName
    const control = e.matches(controls)
    const image = tag === 'IMG' && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0
    let text = ''
    for (const n of e.childNodes) if (n.nodeType === Node.TEXT_NODE) text += n.textContent
    const hasText = text.trim().length >= 2 && !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(tag)
    if (control || image || hasText) counted.add(e)
  }
  return counted.size
}

/** A targeted-debug run (the fix loop's recheck of a few pages) reads what belongs to those pages; the shared-header checks run in every full and fast-gate run. */
const TARGETED_INTERACTION_CHECKS = Object.freeze(['header', 'form', 'carousel'])

/**
 * The interaction-parity probe (interaction-parity.mjs) is part of every run: what a person does with the drawer, the
 * tablet nav, the dark toggle, the carousels, the forms and the header band, measured with a real pointer on the site and
 * on the source at the same widths. The chrome checks (drawer, contrast, touch, toggle) read the shared header once, on
 * the first page; the header band, the forms and the carousels are read on every page. Its claim goes to visual.json
 * (`interaction`) and the full record to interaction.json; the Fast Gate refuses a run without it.
 * @returns {{claim: object, record: object|null}}
 */
export async function runInteraction(o, { specs, spec, darkHook, lightHook, sourceUrlFor, scopeKind = 'full' }) {
  const notRun = (reason, status = 'not-run') => ({ claim: interactionClaimOf({ status, reason }), record: null })
  if (!o.spec) return notRun('needs --spec')
  if (!specs.length) return notRun('the contract has no page to measure')
  try {
    const pages = specs.map((p) => ({ id: p.id, route: p.path, referenceKind: p.referenceKind, siteUrl: new URL(p.path, o.site).href, sourceUrl: p.referenceKind === 'none' ? null : sourceUrlFor(p), ...(Number.isInteger(p.status) && p.status !== 200 ? { status: p.status } : {}) }))
    const siteHooks = { darkHook, ...(lightHook ? { lightHook } : {}) }
    const sourceHooks = { darkHook: spec.sourceDarkHook, lightHook: spec.sourceLightHook, darkRequestHook: spec.sourceDarkRequestHook }
    const budgetMs = o.interactionBudgetMs ?? Math.max(600000, pages.length * 90000)
    const record = await withBrowser((browser) => measureInteractions({ browser, pages, siteHooks, sourceHooks, chromePages: [pages[0].route], budgetMs, ...(scopeKind === 'targeted-debug' ? { checks: TARGETED_INTERACTION_CHECKS } : {}) }))
    const claim = interactionClaimOf(record)
    const refusals = validateInteractionRecord(record, { claim })
    if (refusals.length) return notRun(`the probe's record is inconsistent — ${refusals.slice(0, 3).join('; ')}`, 'failed')
    mkdirSync(o.out, { recursive: true })
    writeFileSync(path.join(o.out, INTERACTION_FILE), `${JSON.stringify(record, null, 2)}\n`)
    return { claim, record }
  } catch (e) {
    return notRun(`the probe failed: ${String(e.message).split('\n')[0]}`, 'failed')
  }
}

/**
 * The page-map routes the intrinsic probe reads: every one, or — in a targeted-debug run (`--pages`, the pilot's
 * check) — only those of the pages the run measures (`only`: page-map paths). A cadence, not a narrower gate: a full
 * run, a Fast Gate and the release checkpoint read every route (ja-restaurant's two-page pilot read all 29 routes on
 * each of its passes, and their site-only rows kept the pilot open on pages the groups own).
 */
export function intrinsicPages(o, only = null) {
  const pages = contentPages(readJsonFile(path.join(o.spec, 'page-map.json'), 'page-map.json'))
  const bare = (x) => String(x).replace(/(.)\/+$/, '$1')
  return only ? pages.filter((p) => only.some((x) => bare(x) === bare(p.path))) : pages
}

/**
 * The intrinsic mobile probe (#65) is part of every run: every page-map route that renders a page, at the narrow
 * widths, both sides. Its summary goes to visual.json (`intrinsic`) and the full rows to intrinsic.json; the Fast Gate
 * verdict refuses a run without it. It needs the page-map (`--spec`); without `--source-site` only the site is read and every defect is the site's.
 */
export async function runIntrinsic(o, { only = null } = {}) {
  if (!o.spec) return { status: 'not-run', reason: 'needs --spec (its page-map.json)' }
  try {
    const pages = intrinsicPages(o, only)
    if (!pages.length) return { status: 'not-run', reason: only ? 'no page of this targeted run renders a page-map route' : 'the page-map has no route that renders a page' }
    // a page the seed moved is read where the stand serves it (the seed report's route, else the contract's), never at its
    // page-map route: that 404s. The probe covers every page-map route, so a group stand needs the seed report, not its subset.
    const moved = new Map()
    const note = (to, from, status = null) => {
      const bare = (x) => x.replace(/(.)\/+$/, '$1')
      if (typeof to === 'string' && typeof from === 'string' && status !== 301 && !to.includes('?') && bare(to) !== bare(from)) moved.set(from, to)
    }
    for (const [file, key] of [[o.seedReport, 'routes'], [o.contract, 'pages']]) {
      try {
        if (file) for (const r of readJsonFile(file, key).routes ?? readJsonFile(file, key).pages ?? []) if (!moved.has(r.pagemapPath)) note(r.path, r.pagemapPath, r.status)
      } catch {}
    }
    for (const p of pages) if (moved.has(p.path)) p.siteRoute = moved.get(p.path)
    const report = await withBrowser((browser) => measureIntrinsic({ browser, pages, siteOrigin: o.site, sourceOrigin: o.sourceSite ?? null, widths: INTRINSIC_WIDTHS, ...(Number.isInteger(o.concurrency) && o.concurrency > 0 ? { concurrency: o.concurrency } : {}) }))
    const claim = intrinsicClaimOf(report)
    // the run holds its own report to the same validator the verdict uses, BEFORE it is published: a contradictory report is a failed probe, never a clean one
    const refusals = validateIntrinsicReport(report, { claims: { intrinsic: claim, summary: summaryClaimOf(claim) }, owedRoutes: pages.map((p) => p.path), owedWidths: INTRINSIC_WIDTHS, allowFailedReadings: true })
    if (refusals.length) return { status: 'failed', reason: `the probe's report is inconsistent — ${refusals.slice(0, 3).join('; ')}` }
    mkdirSync(o.out, { recursive: true })
    writeFileSync(path.join(o.out, INTRINSIC_FILE), `${JSON.stringify(report, null, 2)}\n`)
    return { ...claim, rows: report.findings.filter((f) => f.class === 'site-only'), errorRows: report.errors }
  } catch (e) {
    return { status: 'failed', reason: `the probe failed: ${String(e.message).split('\n')[0]}` }
  }
}

/** The hash of every route a run's intrinsic and interaction probes read, as served when they were read: what `--probes-from` binds. */
export const PROBES_SERVED_FILE = 'probes-served.json'

/**
 * The two whole-site probes measure the deployment, not a stage: the intrinsic probe reads every page-map route at its own
 * narrow widths, the interaction probe walks its own tiers (TIERS). round.mjs runs one visual-qa per stage, so a checkpoint
 * measured both four times over — on ja-restaurant's restored stand the interaction probe took ~15 of each stage's ~20 min
 * (rc-7, 21/10/2026), and a two-page pilot stage spent ~2 of its ~2.5 min on them. `--probes-from <dir>` takes both from
 * another run of the SAME measurement once that run has written its report: the same site and source, identity (contract,
 * spec, artifact, seed report), scope (kind, plan, pages) and build as served on every route the probes read (each one's
 * hash: served HTML, built theme files, contract, tool; PROBES_SERVED_FILE). Its records are validated again exactly as a run validates its own
 * and copied here byte for byte. A provider that ends without a report (`<dir>.ended`, written by round.mjs when its process
 * exits), that reports something else, or that does not report in time leaves this run to measure them itself; so does a
 * probe the provider ran and failed. The reason is printed. → `{ intrinsic?, interaction?, why? }`: what was taken, and why
 * anything was not.
 */
export async function probesFrom(o, { identity, scope, hashRoutes = null, timeoutMs, pollMs = 2000, intrinsicOnly = null }) {
  const dir = path.resolve(o.probesFrom)
  if (dir === path.resolve(o.out)) return { why: 'it names this run\'s own --out' }
  const report = path.join(dir, 'visual.json')
  const until = Date.now() + timeoutMs
  while (!existsSync(report)) {
    if (existsSync(`${dir}.ended`)) return { why: `the run in ${dir} ended without a report` }
    if (Date.now() > until) return { why: `no report in ${dir} within ${Math.round(timeoutMs / 60000)} min` }
    await new Promise((r) => setTimeout(r, pollMs))
  }
  const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))
  try {
    const v = readJsonFile(report, 'visual.json')
    if (v.site !== o.site) return { why: `it measured ${v.site}, not ${o.site}` }
    if ((v.sourceSite ?? null) !== (o.sourceSite ?? null)) return { why: `it compared with the source ${v.sourceSite ?? 'none'}, not ${o.sourceSite ?? 'none'}` }
    const bound = (x) => ({ ...x, capturedAt: null }) // the moment each run read its identity is not part of it
    if (canon(bound(v.identity)) !== canon(bound(identity))) return { why: 'it measured under another identity (contract, spec, artifact or seed report)' }
    if (canon(v.scope) !== canon(scope)) return { why: `its scope is ${canon(v.scope)}, not ${canon(scope)}` }
    const bytesOf = (file) => readFileSync(path.join(dir, file))
    // 🔒 THE BUILD AS SERVED, ON EVERY PAGE THE PROBES READ. The provider wrote the hash of each route its probes read
    // (PROBES_SERVED_FILE: served HTML, built theme files, contract, tool — page-hash.mjs); each of those routes must hash
    // the same here now. Its report's page list is not enough: a tier measures only the pages with an axis in its stage,
    // the probes read every page of the run (and the intrinsic one every page-map route), so a build that changed only an
    // unmeasured page would have reused records of the old build.
    const read = (file) => (existsSync(path.join(dir, file)) ? JSON.parse(bytesOf(file).toString('utf8')) : null)
    const record = read(INTERACTION_FILE)
    const intrinsicReport = read(INTRINSIC_FILE)
    const routes = [...new Set([...(record?.pages ?? []).filter((r) => typeof r === 'string'), ...(intrinsicReport?.routes ?? [])])]
    if (routes.length) {
      const served = read(PROBES_SERVED_FILE)?.routes ?? null
      if (!served) return { why: `it recorded no hash of the pages its probes read (${PROBES_SERVED_FILE})` }
      if (!hashRoutes) return { why: 'this run cannot hash the pages the probes read' }
      const now = await hashRoutes(routes)
      const moved = routes.filter((r) => typeof served[r] !== 'string' || now.get(r) !== served[r])
      if (moved.length) return { why: `it measured another build: ${moved.length} page(s) its probes read are unhashed there or hash differently now (${moved.slice(0, 5).join(', ')})` }
    }
    const out = {}
    const why = []
    // a probe the provider ran is validated and copied; one it did not run for want of an input (`not-run`: no --spec, no route)
    // would not run here either and is taken as it is; one that failed is measured again here
    if (record) {
      const claim = interactionClaimOf(record)
      const ia = validateInteractionRecord(record, { claim })
      if (ia.length) why.push(`its interaction record is inconsistent — ${ia.slice(0, 3).join('; ')}`)
      else {
        mkdirSync(o.out, { recursive: true })
        writeFileSync(path.join(o.out, INTERACTION_FILE), bytesOf(INTERACTION_FILE))
        out.interaction = { claim, record }
      }
    } else if (v.interaction?.status === 'not-run') out.interaction = { claim: interactionClaimOf({ status: 'not-run', reason: v.interaction.reason }), record: null }
    else why.push(`its interaction probe ${v.interaction?.status ?? 'left no record'}`)
    if (intrinsicReport) {
      const report = intrinsicReport
      const owedRoutes = intrinsicPages(o, intrinsicOnly).map((p) => p.path)
      const claim = intrinsicClaimOf(report)
      const ii = validateIntrinsicReport(report, { claims: { intrinsic: claim, summary: summaryClaimOf(claim) }, owedRoutes, owedWidths: INTRINSIC_WIDTHS, allowFailedReadings: true })
      if (ii.length) why.push(`its intrinsic report is inconsistent — ${ii.slice(0, 3).join('; ')}`)
      else {
        mkdirSync(o.out, { recursive: true })
        writeFileSync(path.join(o.out, INTRINSIC_FILE), bytesOf(INTRINSIC_FILE))
        out.intrinsic = { ...claim, rows: report.findings.filter((f) => f.class === 'site-only'), errorRows: report.errors }
      }
    } else if (v.intrinsic?.status === 'not-run') out.intrinsic = { status: 'not-run', reason: v.intrinsic.reason }
    else why.push(`its intrinsic probe ${v.intrinsic?.status ?? 'left no report'}`)
    return why.length ? { ...out, why: why.join('; ') } : out
  } catch (e) {
    return { why: `its probes cannot be read: ${String(e.message).split('\n')[0]}` }
  }
}

/**
 * The decisions an exception or a menu pair may cite: `--decisions`, else DECISIONS.md next to the contract (the dossier).
 * A contract with nothing to cite reads none; one that cites and has no readable file gets `null`, which validateContract
 * turns into a refusal naming the missing file.
 */
export function decisionsOf(o, contractPath, contract) {
  const cites = (contract.design?.exceptions?.length ?? 0) + (contract.design?.menus?.pairs?.length ?? 0) + (Array.isArray(contract.exceptions) ? contract.exceptions.length : 0) > 0
  const file = o.decisions ?? path.join(o.runRoot ?? path.dirname(contractPath), 'DECISIONS.md')
  if (!cites && !o.decisions) return { decisions: new Map(), duplicates: [] }
  try {
    return parseDecisions(readSmallFile(file, '--decisions'))
  } catch {
    return null
  }
}

// the decisions a contract was validated against (set where the run loads them): accept() then resolves every citation too
const BOUND_DECISIONS = new WeakMap()
/** `decisions` null = the contract cites and no readable DECISIONS.md was found: bound all the same, so every citation is refused. */
export const bindDecisions = (contract, decisions) => { if (contract && typeof contract === 'object') BOUND_DECISIONS.set(contract, { decisions }) }

export function accept(contract, finding, page = null, axis = null) {
  // A measurement that was not taken is never accepted, whatever an exception says (validateContract
  // refuses such an exception; this holds for a contract that reached the runner without it).
  if (UNMEASURED_KINDS.includes(finding.kind)) return null
  for (const x of contract.design?.exceptions ?? []) {
    if (x.kind !== finding.kind || !x.decision) continue
    // once the run has bound its decisions (every real run does, in run()), a row with a universal match, or a citation that does not resolve to
    // ONE existing decision about it, accepts nothing. A contract that never bound decisions keeps the legacy behaviour.
    const bound = BOUND_DECISIONS.get(contract)
    if (x.scope !== undefined) {
      // A structured scope has no legacy fallback: applicability depends on both a validated citation
      // and the dimensions captured from the finding when it was created.
      if (!bound || validateExceptionRows([x], bound.decisions).length) continue
      const scope = x.scope
      if (scope.selector && typeof finding.subject?.selector !== 'string') continue
      if (scope.text && typeof finding.subject?.text !== 'string') continue
      const dims = [
        !scope.pages || scope.pages.includes(page?.id),
        !scope.routes || scope.routes.includes(page?.path),
        !scope.axes || scope.axes.includes(axis),
        !scope.selector || scope.selector === finding.subject?.selector,
        !scope.text || scope.text === finding.subject?.text
      ]
      if (!dims.every(Boolean)) continue
      const properties = finding.properties ?? finding.deltas?.map((d) => d.property).filter((p) => typeof p === 'string') ?? (finding.property ? [finding.property] : [])
      if (scope.properties && !properties.every((p) => scope.properties.includes(p))) continue
      if (x.match && !new RegExp(x.match).test(JSON.stringify({ page: page?.id ?? null, ...(axis ? { axis } : {}), ...finding }))) continue
      return x
    }
    if (bound && validateExceptionRows([x], bound.decisions).length) continue
    // The page id is part of what an exception may match (`match: "en-contact"`), so a finding
    // that carries no element — examined-too-few — can still be scoped to one page.
    // `axis` (the variant id) is part of it too, so an exception scoped to one axis (`"axis":"mobile-dark"`) matches only there
    const legacyFinding = { ...finding }
    delete legacyFinding.subject
    delete legacyFinding.properties
    const hay = JSON.stringify({ page: page?.id ?? null, ...(axis ? { axis } : {}), ...legacyFinding })
    if (new RegExp(x.match).test(hay)) return x
  }
  return null
}

// ─────────────────────────────────────────────── one axis of one page
async function measureAxis({ browser, contract, page, variant, site, sourceUrl, out, darkHook, lightHook = null, mega = null, spec, tileHeight = DEFAULT_TILE_HEIGHT, menuBudgetMs = MENU_BUDGET_MS, signal = null }) {
  const sourceIndependent = checkApplicability(page.referenceKind, 'menu-comparison') === 'not-applicable'
  const axis = { variant: variant.id, width: variant.width, theme: variant.theme, components: [], findings: [], accepted: [], scans: {}, coverage: null }
  const F = (kind, detail) => {
    const finding = { kind, ...detail }
    if (!PAGE_LEVEL_EXCEPTION_KINDS.includes(kind)) {
      if (!finding.subject) {
        const subject = {
          ...(typeof detail.selector === 'string' ? { selector: detail.selector } : {}),
          ...(typeof detail.text === 'string' ? { text: detail.text } : {})
        }
        if (Object.keys(subject).length) finding.subject = subject
      }
      if (!Array.isArray(finding.properties)) {
        const properties = detail.deltas?.map((d) => d.property).filter((property) => typeof property === 'string') ?? (typeof detail.property === 'string' ? [detail.property] : [])
        if (properties.length) finding.properties = properties
      }
    }
    const x = accept(contract, finding, page, variant.id)
    if (x) axis.accepted.push({ ...finding, exception: { reason: x.reason, decision: x.decision } })
    else axis.findings.push(finding)
  }
  const url = new URL(page.path, site).href
  const theme = contract.design.theme
  await withPage(browser, { viewport: { width: variant.width, height: variant.height }, theme: variant.theme, darkHook, ...(lightHook ? { lightHook, hookUrl: url } : {}) }, async (p) => {
    const res = await p.goto(url, { waitUntil: 'networkidle' })
    const status = res?.status() ?? 0
    if (status !== page.status) F('identity-mismatch', { what: 'status', expected: page.status, observed: status })
    axis.motion = await settle(p)
    // theme observed
    const attr = await p.evaluate((a) => document.documentElement.getAttribute(a), theme.attribute)
    const want = theme.values[variant.theme]
    if (variant.theme === 'dark' ? attr !== want : attr !== null && attr !== want && attr !== 'light' && attr !== 'auto') F('theme-not-applied', { attribute: theme.attribute, expected: want, observed: attr })
    // C. snapshot of the site
    const snap = await p.evaluate(inPageSnapshot, { coverageSelectors: contract.design.coverage.map((c) => c.selector).join(', '), properties: PARITY_PROPS, scope: contract.design.images?.scope ?? 'main' })
    if (page.identity?.body && !snap.bodyClass.split(/\s+/).includes(page.identity.body)) F('identity-mismatch', { what: 'body', expected: page.identity.body, observed: snap.bodyClass.slice(0, 80) })
    if (page.identity?.lang && !(snap.lang ?? '').toLowerCase().startsWith(page.identity.lang)) F('identity-mismatch', { what: 'lang', expected: page.identity.lang, observed: snap.lang })
    if (snap.overflow) F('horizontal-overflow', snap.overflow)
    const bodySpec = contract.design.parity?.body ?? { selector: 'body', properties: [...BODY_RENDERING] }
    const siteBody = await p.evaluate(inPageComputed, bodySpec)
    const examined = snap.elements.length
    axis.examined = examined
    const siteCensus = await p.evaluate(inPageExaminedCensus)
    // decided after the source is read: a short page is not "rendered almost nothing" (below)
    const fewExamined = page.status === 200
    // C. the font that actually drew the glyphs (once per page, on the desktop light axis)
    if (variant.theme === 'light' && variant.width >= 1024) {
      try {
        const samples = await platformFonts(p, FONT_SAMPLE_SELECTORS.site)
        const allowed = contract.design?.fonts?.allowed?.[page.locale] ?? contract.design?.fonts?.allowed?.['*'] ?? null
        let bad = fontFallbacks(samples, allowed)
        axis.fonts = samples.slice(0, 6)
        // Two-sided: a family the SOURCE itself asks for and cannot draw at this page (Cyrillic on
        // a Latin-only face falls back there too) is parity, not a defect.
        if (bad.length && sourceUrl) {
          await withPage(browser, { viewport: { width: variant.width, height: variant.height }, theme: 'light', lightHook: spec.sourceLightHook, hookUrl: sourceUrl }, async (ref) => {
            await ref.goto(sourceUrl, { waitUntil: 'networkidle' }).catch(() => null)
            const src = await platformFonts(ref, FONT_SAMPLE_SELECTORS.source).catch(() => [])
            // Families the source asked for and could not draw either: the same fallback on both sides.
            const sourceFellBack = new Set(fontFallbacks(src).map((x) => x.requested))
            bad = bad.filter((b) => !sourceFellBack.has(b.requested))
          })
        }
        const seen = new Set()
        for (const b of bad) {
          const key = `${b.requested}→${b.drawn}`
          if (seen.has(key)) continue
          seen.add(key)
          F('font-not-loaded', { requested: b.requested, drawn: b.drawn, selector: b.selector, subject: { selector: b.selector }, properties: ['font-family'] })
        }
      } catch (e) {
        axis.fonts = { error: String(e.message).slice(0, 120) }
      }
    }
    // A. site screenshot
    axis.layout = page.layout
    axis.shotConsumers = consumersFor(contract, page, variant, 'site')
    axis.screenshot = axis.shotConsumers ? `shots/${page.id}--${variant.id}.png` : null
    if (axis.screenshot) {
      // One render: the buffer written to the file is the one the tiles are cut from.
      const png = await p.screenshot({ path: path.join(out, axis.screenshot), fullPage: true })
      const cut = await tilePage(p, out, axis.screenshot, tileHeight, png)
      axis.tiles = cut.tiles
      axis.tilesCoverPicture = cut.fullWidthCovered
    }
    // B. hover must not move boxes (real pointer)
    const hoverable = await p.evaluate(inPageHoverJump, 'main a, main button, main .wp-block-button__link, header a, header button')
    const targets = hoverable.targets.slice(0, 25)
    const overCap = hoverable.skippedOverCap + Math.max(0, hoverable.targets.length - targets.length)
    let measured = 0
    let retried = 0
    for (const t of targets) {
      const where = { element: `${t.tag}.${t.cls} "${t.text}"` }
      const subject = { selector: t.cls ? `${t.tag}.${t.cls.split('.').join('.')}` : t.tag, text: t.text }
      const h = await hoverTarget(p, t)
      if (h.attempts.length > 1) retried++
      if (!h.measured) {
        F('scan:hover-not-measured', { ...where, subject, reason: h.reason, attempts: h.attempts })
        continue
      }
      measured++
      const { rest, hov } = h
      const moved = ['x', 'y', 'w', 'h'].filter((k) => Math.abs(rest.rect[k] - hov.rect[k]) > 1)
      if (moved.length) F('scan:hover-jump', { ...where, subject, moved: Object.fromEntries(moved.map((k) => [k, `${+rest.rect[k].toFixed(1)} → ${+hov.rect[k].toFixed(1)}`])) })
    }
    await p.mouse.move(0, 0)
    // What the scan actually covered, so "clean" can be read against it rather than against the
    // whole page. Elements dropped by the window or the cap are not findings — the scan is not
    // meant to hover every control on a long page — but a reader signing off on this number has to
    // be able to see that it is not `total`.
    axis.scans.hover = { total: hoverable.total, measured, hidden: hoverable.hidden, outOfWindow: hoverable.skippedOutOfWindow, overCap, retried }
    // C. two-sided parity against the rendered source, by words
    const parity = contract.design.parity ?? {}
    // 🔒 A dark axis needs the source IN DARK. The rendered snapshot is one file per page (the
    // export's light DOM); it goes dark only through the export's own hook. Without that hook the
    // comparison is dark-site against light-source and every colour differs — noise that buries
    // the findings that are real (444 of 626 on the first dark run, 15/09). Say it was not
    // measured instead.
    // A live source put into dark by a request cookie (`darkRequestHook`) has a dark of its own too.
    const sourceDarkHook = [spec.sourceDarkHook, spec.sourceDarkRequestHook].filter(Boolean).join('+')
    const darkWithoutSource = variant.theme === 'dark' && !sourceDarkHook
    if (darkWithoutSource) axis.parity = { measured: false, reason: 'the source export has no dark of its own (contract.source.darkHook is null)' }
    // The source picture this axis owes its lenses (contract `visual.shots`, side source). When the
    // rules ask for one and none can be written, the axis says why (`sourceShotMissing`, index.json
    // `missing`) and it is a finding (`source-shot-missing`) — a dark lens is never left to take the
    // light source picture for the dark one, and a stage without it does not pass (JA Vega M4c, #19
    // item 6). A page that declares no source at all owes none.
    const owedSource = consumersFor(contract, page, variant, 'source')
    const owes = Boolean(contract.visual?.shots && owedSource && (page.sourceRendered || page.sourceRoute))
    const shotMissing = (reason, finding = true) => {
      if (!owes) return
      axis.sourceShotMissing = reason
      if (finding) F('source-shot-missing', { reason })
    }
    if (!sourceUrl) shotMissing(`the source the page declares (${page.sourceRendered ?? page.sourceRoute}) is not there to shoot`)
    else if (darkWithoutSource) shotMissing(axis.parity.reason)
    // The source's bright borders, and its white surfaces, dark text and low contrast, read in dark
    // for the dark scans (review/border-scan.mjs, review/source-pair.mjs) — only once the source was
    // read back dark, at this axis's viewport; stamped `mode: 'dark'` so a scan can refuse anything else.
    let sourceBorders = null
    let sourceDark = null
    let srcIndex = null
    let sourceCensus = null
    let sourceBody = null
    let siteImageCount = 0
    if (sourceUrl && !darkWithoutSource) {
      await withPage(browser, { viewport: { width: variant.width, height: variant.height }, theme: variant.theme, darkHook: variant.theme === 'dark' ? spec.sourceDarkHook : null, lightHook: variant.theme === 'light' ? spec.sourceLightHook : null, darkRequestHook: variant.theme === 'dark' ? spec.sourceDarkRequestHook : null, hookUrl: sourceUrl }, async (ref) => {
        const gone = await ref.goto(sourceUrl, { waitUntil: 'networkidle' }).then(
          () => null,
          (e) => e
        )
        // A source that does not answer is named, not left to fail later inside `settle` as a
        // navigation error that points nowhere near the cause.
        if (gone && /ERR_CONNECTION|ERR_NAME|ECONNREFUSED/.test(String(gone.message)))
          throw new Error(`source ${sourceUrl} unreachable (${String(gone.message).split('\n')[0]}) — pass --source-site for this machine`)
        axis.sourceMotion = await settle(ref)
        // 🔒 A DARK SOURCE IS READ BACK BEFORE IT IS EVIDENCE. The hook was applied; whether the
        // source stayed dark is what the page shows now. A source that did not is no dark source:
        // no picture, no parity, no border counterparts — and a finding, because the hook the
        // contract names does not work (the light source compared as the dark one is the noise
        // `darkHook` exists to prevent).
        if (variant.theme === 'dark') {
          axis.sourceTheme = { expected: 'dark', hook: sourceDarkHook, ...(await ref.evaluate(inPageDarkHolds, sourceDarkHook)) }
          if (!axis.sourceTheme.holds) {
            F('source-theme-not-applied', { hook: sourceDarkHook, observed: axis.sourceTheme.checks })
            axis.parity = { measured: false, reason: `the source did not stay dark with ${sourceDarkHook}` }
            shotMissing(axis.parity.reason, false) // named once, by source-theme-not-applied
            return
          }
        }
        axis.sourceConsumers = owedSource
        axis.sourceScreenshot = axis.sourceConsumers ? `shots/${page.id}--${variant.id}--source.png` : null
        let sourcePng = null
        if (axis.sourceScreenshot)
          sourcePng = await ref
            .screenshot({ path: path.join(out, axis.sourceScreenshot), fullPage: true })
            .catch((e) => {
              // named, not dropped: the lens work plan refuses an axis whose source picture is missing
              const reason = `the source screenshot failed: ${String(e.message).split('\n')[0].slice(0, 160)}`
              if (owes) shotMissing(reason)
              else F('source-shot-missing', { reason })
              axis.sourceScreenshot = null
              axis.sourceShotError = String(e.message).slice(0, 300)
              return null
            })
        if (axis.sourceScreenshot)
          {
            const cut = await tilePage(ref, out, axis.sourceScreenshot, tileHeight, sourcePng)
            axis.sourceTiles = cut.tiles
            axis.sourceTilesCoverPicture = cut.fullWidthCovered
          }
        sourceBody = await ref.evaluate(inPageComputed, bodySpec)
        srcIndex = await ref.evaluate(inPageTextIndex, { scope: 'body', properties: PARITY_PROPS, slot: contract.design.images?.sourceSlot ?? null, placeholder: null, siteScope: contract.design.images?.scope ?? 'main' })
        sourceCensus = await ref.evaluate(inPageExaminedCensus)
        siteImageCount = await p.evaluate((cloned) => [...document.querySelectorAll('img')].filter((im) => im.naturalWidth > 0 && !im.closest(cloned)).length, CLONED_SLIDES)
        if (variant.theme === 'dark') {
          sourceBorders = { ...(await ref.evaluate(inPageBorderRecords, '80')), mode: 'dark' }
          sourceDark = { ...(await ref.evaluate(inPageDarkRecords, {})), mode: 'dark' }
        }
      })
    }
    if (fewExamined) {
      // Relative to the source's own census whenever it was read (half of its content — non-chrome — text
      // elements, so 20 of 300 is too few); the absolute floor only when
      // there is no census. A page that is short at the source too (a contact form: 11 elements) rendered
      // fully, not "almost nothing".
      if (examinedTooFew(siteCensus, sourceCensus, sourceCensus !== null)) F('examined-too-few', { examined, basis: 'census', siteCount: siteCensus, sourceCount: sourceCensus })
    }
    if (sourceUrl && !darkWithoutSource && srcIndex) {
      const r = parityByText(snap.elements, srcIndex.index, { properties: parity.properties ?? PARITY_PROPS, hexTolerance: parity.hexTolerance ?? 8, pxTolerance: parity.pxTolerance ?? 1 })
      axis.components.push(...r.components)
      for (const f of r.findings) F(f.kind, { element: f.element, subject: f.subject, properties: f.properties ?? f.deltas?.map((d) => d.property), deltas: f.deltas })
      axis.coverage = { examined, classified: r.classified, unclassified: r.unclassified }
      for (const u of r.unclassifiedFindings) F('unclassified-element', u)
      // the body's text rendering: one pair a page and axis, on the properties the contract names
      const body = bodyRenderingFindings(sourceBody, siteBody, bodySpec.properties)
      axis.body = { source: sourceBody?.values ?? null, site: siteBody?.values ?? null }
      axis.components.push(...body.components)
      for (const f of body.findings) F(f.kind, f)
      // images: decoded pictures on the site vs the source's slots
      // The SOURCE was not showing everything it has. `settle()` already scrolled and decoded, so
      // reaching here means waiting did not fix it -- and every undecoded picture lowers
      // `srcIndex.images`, which is the number the site is judged against, so a site genuinely
      // missing that picture would pass. Say it rather than quietly expect less.
      if (srcIndex.undecoded)
        F('source-not-rendered', { undecoded: srcIndex.undecoded, showing: srcIndex.images, examples: srcIndex.undecodedExamples })
      if (page.status === 200 && srcIndex.images > siteImageCount) F('image-missing', { source: srcIndex.images, site: siteImageCount })
    } else {
      axis.coverage = { examined, classified: 0, unclassified: [] }
    }
    const undecoded = snap.elements.filter((e) => e.tag === 'img' && e.decoded === false).map((e) => e.src)
    if (undecoded.length) F('image-broken', { files: undecoded.slice(0, 10) })
    const notApplicable = notApplicableChecks(page.referenceKind)
    if (notApplicable.length) axis.notApplicable = notApplicable
    // placeholders on the site
    if (contract.design.images?.placeholder) {
      const n = await p.evaluate((sel) => document.querySelectorAll(sel).length, contract.design.images.placeholder)
      if (n) F('image-placeholder', { count: n })
    }
    // dark-axis scanners (the port's own, on this page)
    if (variant.theme === 'dark') {
      const [{ scanLeaks }, { scanContrast }, { scanBorders }, { scanSeams }, runtime] = await Promise.all([
        import('../review/leak-scan.mjs'),
        import('../review/contrast-audit.mjs'),
        import('../review/border-scan.mjs'),
        import('../review/seam-scan.mjs'),
        import('../review/runtime.mjs')
      ])
      // the scanners navigate on their own and demand the runtime's expected status (200): a 404
      // page is a page of the contract too, and its dark theme is measured like any other. The
      // expectation is set PER PAGE — pages are scanned concurrently (see runtime.expectStatus).
      runtime.expectStatus(p, page.status)
      for (const [name, fn] of [
        ['white-surface', (pg) => scanLeaks(pg, url, 'white', { source: sourceDark })],
        ['dark-on-dark', (pg) => scanLeaks(pg, url, 'darktext', { source: sourceDark })],
        ['contrast', (pg) => scanContrast(pg, url, '3.0', { source: sourceDark })],
        ['bright-border', (pg) => scanBorders(pg, url, '80', { source: sourceBorders })],
        ['doubled-seam', (pg) => scanSeams(pg, url)]
      ]) {
        try {
          const r = await fn(p)
          axis.scans[name] = { examined: r.examined, findings: r.findings?.length ?? 0 }
          // What the source draws itself, set apart and kept (`sourceShared` has both measurements;
          // `sourceMatched` is the readable legacy line): border-scan, and the
          // white-surface, dark-on-dark and contrast scans through source-pair.mjs); null = no dark
          // source was read. A source the scan could not compare says why (`sourceRefused`).
          if (name !== 'doubled-seam') axis.scans[name].sourceMatched = r.sourceMatched ?? null
          if (name !== 'doubled-seam') axis.scans[name].sourceShared = r.sourceShared ?? null
          if (r.sourceRefused) axis.scans[name].sourceRefused = r.sourceRefused
          for (const f of (r.findings ?? []).slice(0, 20)) F(`scan:${name}`, typeof f === 'string' ? { what: f } : f)
        } catch (e) {
          axis.scans[name] = { error: String(e.message).slice(0, 200) }
          F(`scan:${name}`, { error: String(e.message).slice(0, 200) })
        }
      }
    } else if (variant.width >= 1024) {
      const [{ scanSeams }, runtime] = await Promise.all([import('../review/seam-scan.mjs'), import('../review/runtime.mjs')])
      runtime.expectStatus(p, page.status)
      try {
        const r = await scanSeams(p, url)
        axis.scans['doubled-seam'] = { examined: r.examined, findings: r.findings?.length ?? 0 }
        for (const f of (r.findings ?? []).slice(0, 20)) F('scan:doubled-seam', typeof f === 'string' ? { what: f } : f)
      } catch (e) {
        axis.scans['doubled-seam'] = { error: String(e.message).slice(0, 200) }
      }
    }
  })
  // D. container widths at the source's breakpoints — a layout representative's narrowest axis of
  // each declared theme (containerProbes). A fresh load a side at each width.
  const probes = containerProbes(contract, page, variant)
  if (probes.length) {
    const cont = contract.design.containers
    const widths = [...new Set(probes.map((x) => x.width))]
    const selectorsOf = (side) => [...new Map(probes.map((x) => [x.item, x[side]])).entries()]
    const height = cont.height ?? CONTAINER_PROBE_HEIGHT
    const sourceDarkHook = [spec.sourceDarkHook, spec.sourceDarkRequestHook].filter(Boolean).join('+')
    const measured = { site: {}, source: {} }
    let navigations = 0
    const started = Date.now()
    const blind = (side, error) => {
      for (const x of probes) measured[side][`${x.item}@${x.width}`] = { error }
    }
    try {
      navigations += widths.length
      measured.site = await probeContainers(browser, { url, widths, selectors: selectorsOf('site'), height, status: page.status, pageOpts: { theme: variant.theme, darkHook, ...(lightHook ? { lightHook, hookUrl: url } : {}) } })
    } catch (e) {
      blind('site', `the site did not load: ${String(e.message).split('\n')[0].slice(0, 160)}`)
    }
    if (sourceIndependent) blind('source', noReferenceReason)
    else if (!sourceUrl) blind('source', `the page declares no source to measure (${page.sourceRendered ?? page.sourceRoute ?? 'none'})`)
    else if (variant.theme === 'dark' && !sourceDarkHook) blind('source', 'the source export has no dark of its own (contract.source.darkHook is null)')
    else
      try {
        navigations += widths.length
        measured.source = await probeContainers(browser, {
          url: sourceUrl,
          widths,
          selectors: selectorsOf('source'),
          height,
          // A rendered export is a file the source wrote for this page: it answers 200 whatever the
          // page is. A live route answers what the source serves there — the status the site owes.
          status: page.sourceRendered ? 200 : page.status,
          pageOpts: { theme: variant.theme, darkHook: variant.theme === 'dark' ? spec.sourceDarkHook : null, lightHook: variant.theme === 'light' ? spec.sourceLightHook : null, darkRequestHook: variant.theme === 'dark' ? spec.sourceDarkRequestHook : null, hookUrl: sourceUrl }
        })
      } catch (e) {
        blind('source', `the source did not load: ${String(e.message).split('\n')[0].slice(0, 160)}`)
      }
    if (sourceIndependent) {
      // The comparison is N/A, but target probes are still required. Feed each successful target
      // width as its own comparison baseline so containerFindings reports target load/selector
      // failures without inventing a source-side failure.
      measured.source = Object.fromEntries(Object.entries(measured.site).map(([key, row]) => [key, Number.isFinite(row?.width) ? row : { width: 0 }]))
      const r = containerFindings(probes, measured, cont.tolerance ?? contract.design.parity?.pxTolerance ?? 1)
      axis.containers = { key: containersKey(contract), probes: probes.length, navigations, ms: Date.now() - started, rows: r.rows.map((row) => ({ item: row.item, width: row.width, theme: row.theme, ...(row.status === 'not-measured' ? row : { status: 'not-applicable', reason: noReferenceReason }) })) }
      for (const f of r.findings) F(f.kind, f)
    } else {
      const r = containerFindings(probes, measured, cont.tolerance ?? contract.design.parity?.pxTolerance ?? 1)
      axis.containers = { key: containersKey(contract), probes: probes.length, navigations, ms: Date.now() - started, rows: r.rows }
      for (const f of r.findings) F(f.kind, f)
    }
  }
  // E. the header's menus captured open (menu-open.mjs, #50). At rest every panel is closed, so the
  // page's picture and parity never saw one: each trigger is opened for real on both sides, captured
  // (boxes, words with their styles, a picture) and compared. The same sides as the page's parity —
  // no source, or a dark axis without a dark source, says why and measures nothing. On EVERY page run:
  // a page's header is not proven the same as another page's by its template, and a run of pages
  // that are not a layout's representative would otherwise open no menu at all.
  {
    const sourceDarkHook = [spec.sourceDarkHook, spec.sourceDarkRequestHook].filter(Boolean).join('+')
    if (sourceIndependent) {
      const parity = contract.design.parity ?? {}
      const r = await measureMenus({
        browser, url, sourceUrl: null,
        siteOpts: { viewport: { width: variant.width, height: variant.height }, theme: variant.theme, darkHook, ...(lightHook ? { lightHook, hookUrl: url } : {}) },
        sourceOpts: null, pageId: page.id, variantId: variant.id, out, settle,
        props: parity.properties ?? PARITY_PROPS, textProps: TEXT_PROPS, diffProperty,
        tolerance: { hexTolerance: parity.hexTolerance ?? 8, pxTolerance: parity.pxTolerance ?? 1 },
        budgetMs: menuBudgetMs, declared: contract.design.menus?.pairs ?? [],
        status: { site: page.status },
        profile: selectorProfileOfContract(contract).profile, assumed: selectorProfileOfContract(contract).assumed,
        targetOnly: true, signal
      })
      axis.menus = { ...r.record, comparison: { check: 'menu-comparison', status: checkApplicability(page.referenceKind, 'menu-comparison'), reason: noReferenceReason } }
      for (const f of r.findings) F(f.kind, f)
    }
    else if (!sourceUrl && page.referenceKind === 'image') axis.menus = { measured: false, reason: imageReferenceReason, comparison: { check: 'menu-comparison', status: checkApplicability(page.referenceKind, 'menu-comparison'), reason: imageReferenceReason } }
    else if (!sourceUrl) axis.menus = { measured: false, reason: `the page declares no source to open its menus on (${page.sourceRendered ?? page.sourceRoute ?? 'none'})` }
    else if (variant.theme === 'dark' && !sourceDarkHook) axis.menus = { measured: false, reason: 'the source export has no dark of its own (contract.source.darkHook is null)' }
    else if (axis.sourceTheme && !axis.sourceTheme.holds) axis.menus = { measured: false, reason: `the source did not stay dark with ${sourceDarkHook}` }
    else {
      const parity = contract.design.parity ?? {}
      const r = await measureMenus({
        browser,
        url,
        sourceUrl,
        siteOpts: { viewport: { width: variant.width, height: variant.height }, theme: variant.theme, darkHook, ...(lightHook ? { lightHook, hookUrl: url } : {}) },
        sourceOpts: { viewport: { width: variant.width, height: variant.height }, theme: variant.theme, darkHook: variant.theme === 'dark' ? spec.sourceDarkHook : null, lightHook: variant.theme === 'light' ? spec.sourceLightHook : null, darkRequestHook: variant.theme === 'dark' ? spec.sourceDarkRequestHook : null, hookUrl: sourceUrl },
        pageId: page.id,
        variantId: variant.id,
        out,
        settle,
        props: parity.properties ?? PARITY_PROPS,
        textProps: TEXT_PROPS,
        diffProperty,
        tolerance: { hexTolerance: parity.hexTolerance ?? 8, pxTolerance: parity.pxTolerance ?? 1, geometry: contract.design.containers?.tolerance ?? parity.pxTolerance ?? 1 },
        budgetMs: menuBudgetMs,
        declared: contract.design.menus?.pairs ?? [],
        // the status each side owes, as the container probe reads it: a rendered export answers 200
        status: { site: page.status, source: page.sourceRendered ? 200 : page.status },
        // the source framework's selector profile (contract source.framework, #66): which header
        // controls are triggers
        profile: selectorProfileOfContract(contract).profile,
        // an undeclared framework (T4 assumed, reported as the run's selector gap) may read a page
        // with no header as one without menus; a declared one may not
        assumed: selectorProfileOfContract(contract).assumed,
        signal
      })
      axis.menus = r.record
      for (const f of r.findings) F(f.kind, f)
    }
  }
  // B. mega-menu travel and the theme toggle — desktop axes, the CLIs that already prove them
  if (variant.width >= 1024 && mega && page.states?.includes('mega')) {
    // Awaited, not spawnSync: a synchronous spawn froze every other axis in flight for the whole
    // walk (16.9 s a page on Tracy Base wp7; the full 38-page run went 776 s → 402 s, same verdicts
    // on every deterministic page — lib/child.mjs). The child is bounded by this axis job (so by
    // --concurrency) and killed at MEGA_TIMEOUT_MS; a killed walk is a finding, not a pass.
    const args = ['--viewport', String(variant.width), '--items', mega.items, ...(mega.trigger ? ['--trigger', mega.trigger] : []), ...(mega.panel ? ['--panel', mega.panel] : [])]
    // The tail keeps the summary line and every FAIL row: the last two lines alone are the blank
    // line and the count, and a failing step could not be read back from the evidence (full-1).
    axis.scans.mega = await walkMega(runChild, [path.join(HERE, '..', 'review', 'mega-hover.mjs'), url, ...args])
    // A walk that found no item on a page where NEITHER side's header has a menu (the source's error page draws no header,
    // and the port keeps its shape) owes no mega walk: measured, with the two censuses as its evidence (ja-restaurant S-31).
    const none = !axis.scans.mega.ok && /^NO ITEMS\b/.test(axis.scans.mega.tail ?? '') ? await megaNotOwed({ browser, contract, page, variant, url, sourceUrl, darkHook, lightHook, spec, axis }) : null
    if (none) axis.scans.mega = { ...axis.scans.mega, ok: true, notOwed: none.reason, evidence: none.evidence }
    else if (!axis.scans.mega.ok) F('mega-menu', { output: axis.scans.mega.tail, attempts: axis.scans.mega.attempts.length })
  }
  return axis
}

/**
 * Whether a mega walk that found no item is owed at all: only on a page the contract declares with an error status (the 404 page:
 * a 2xx page owes its header whatever a census reads), where the source page shows no header and neither side's header has a menu
 * trigger, as measured — the open-state axis's census of both sides when it read them, else (a dark axis whose source has no dark
 * of its own: `spec.sourceDarkDerived`, the contract's `source.darkDerived` checked fresh for the spec-pack by run()) the site's
 * census in this axis and the source's in light. An undeclared framework (the T4 lists assumed) may read a header as none: never.
 * → `{ reason, evidence }` or null (the walk's finding stands).
 */
export async function megaNotOwed({ browser, contract, page, variant, url, sourceUrl, darkHook, lightHook = null, spec, axis, census = headerCensus }) {
  const { profile, assumed } = selectorProfileOfContract(contract)
  if (assumed || !sourceUrl || !(Number.isInteger(page.status) && page.status >= 400)) return null
  let site = null
  let source = null
  let read = null
  if (axis.menus?.measured === true && axis.menus.site && axis.menus.source) {
    site = axis.menus.site
    source = axis.menus.source
    read = 'the open-state census of this axis'
  } else if (variant.theme === 'dark' && spec.sourceDarkDerived === true && !spec.sourceDarkHook && !spec.sourceDarkRequestHook) {
    const declared = contract.design?.menus?.pairs ?? []
    const at = { width: variant.width, height: variant.height }
    try {
      site = await census(browser, { url, settle, status: page.status ?? null, profile, declared: declared.map((d) => d.site), opts: { viewport: at, theme: variant.theme, darkHook, ...(lightHook ? { lightHook, hookUrl: url } : {}) } })
      source = await census(browser, { url: sourceUrl, settle, status: page.sourceRendered ? 200 : (page.status ?? null), profile, declared: declared.map((d) => d.source), opts: { viewport: at, theme: 'light', lightHook: spec.sourceLightHook ?? null, hookUrl: sourceUrl } })
    } catch {
      return null
    }
    read = 'the header census of the site in this axis and of the source in light (the contract declares the source has no dark of its own)'
  } else return null
  if (!(source.headers === 0 && source.triggers === 0 && site.triggers === 0)) return null
  return {
    reason: `the source page shows no header and neither side's header has a menu to open (${read}): there is no mega menu to walk on this page`,
    evidence: { site: { headers: site.headers, triggers: site.triggers }, source: { headers: source.headers, triggers: source.triggers } }
  }
}

// ─────────────────────────────────────────────── static source pages (menu-open.mjs `sourceStatic`)
/**
 * A source page whose menus cannot open is a measured fact, not a finding — provided the header is
 * measured open on the source somewhere else. Settles every axis of `axes` (`[{ page, axis }]`, one
 * stage's, measured now or reused) that carries such facts: a fact is covered by ANOTHER page's axis of
 * the same variant (same width and theme) whose menu record was read and holds a row of the same key with a
 * source picture. Anything else — no such page in this run, a page that is static there too, an axis lost
 * to an error — leaves the fact uncovered, and an uncovered fact is `menu-open-not-measured`. Decided once
 * per stage from the final axes, so page order and concurrency do not matter.
 */
export function settleStaticSource(axes) {
  for (const { page, axis } of axes) {
    const facts = axis.menus?.sourceStatic
    if (!facts?.length) continue
    // an earlier settlement (a reused axis) is undone: its covering page may not be in this run
    axis.findings = axis.findings.filter((f) => !f.staticSource)
    for (const fact of facts) {
      fact.covered = null
      const by = axes.find((o) => o.axis !== axis && o.page.id !== page.id && o.axis.variant === axis.variant && o.axis.menus?.measured === true && (o.axis.menus.menus ?? []).some((r) => r.key === fact.key && r.source?.opened === true && r.source.screenshot && !r.source.static))
      if (by) fact.covered = { page: by.page.id, variant: by.axis.variant }
      else axis.findings.push({ kind: 'menu-open-not-measured', element: `header menu "${fact.trigger}"`, trigger: fact.trigger, side: 'source', staticSource: true, reason: `the source page cannot open this menu (${fact.scripts} script(s); ${fact.toggle}: hover ${fact.outcome.hover}, click ${fact.outcome.click}), and no other page of this run opened it on the source at ${axis.variant}` })
    }
  }
}

// ─────────────────────────────────────────────── pictures of a sampled page
/** Shoot and tile an already measured axis for the sampled lenses (site, and the source when there is one to compare). */
async function shootSampled({ browser, contract, page, variant, axis, site, sourceUrl, out, darkHook, lightHook = null, spec, tileHeight = DEFAULT_TILE_HEIGHT }) {
  const url = new URL(page.path, site).href
  const siteConsumers = consumersFor(contract, page, variant, 'site', { sampled: true })
  if (siteConsumers)
    await withPage(browser, { viewport: { width: variant.width, height: variant.height }, theme: variant.theme, darkHook, ...(lightHook ? { lightHook, hookUrl: url } : {}) }, async (p) => {
      await p.goto(url, { waitUntil: 'networkidle' })
      await settle(p)
      const rel = `shots/${page.id}--${variant.id}.png`
      const png = await p.screenshot({ path: path.join(out, rel), fullPage: true })
      const cut = await tilePage(p, out, rel, tileHeight, png)
      Object.assign(axis, { shotConsumers: siteConsumers, screenshot: rel, tiles: cut.tiles, tilesCoverPicture: cut.fullWidthCovered })
    })
  const sourceConsumers = consumersFor(contract, page, variant, 'source', { sampled: true })
  if (!sourceConsumers || !(page.sourceRendered || page.sourceRoute)) return
  // The same rules as the measured source (measureAxis): the dark is the export's hook or the live
  // source's request cookie; a source picture that cannot be written is `sourceShotMissing` (index.json
  // `missing`), never a light picture filed as the dark one (Sol review of #19 item 6, round 6).
  const sourceDarkHook = [spec.sourceDarkHook, spec.sourceDarkRequestHook].filter(Boolean).join('+')
  const missing = (reason) => { axis.sourceShotMissing = reason }
  if (!sourceUrl) return missing(`the source the page declares (${page.sourceRendered ?? page.sourceRoute}) is not there to shoot`)
  if (variant.theme === 'dark' && !sourceDarkHook) return missing('the source export has no dark of its own (contract.source.darkHook is null)')
  if (axis.sourceTheme && !axis.sourceTheme.holds) return missing(`the source did not stay dark with ${sourceDarkHook}`)
  await withPage(browser, { viewport: { width: variant.width, height: variant.height }, theme: variant.theme, darkHook: variant.theme === 'dark' ? spec.sourceDarkHook : null, lightHook: variant.theme === 'light' ? spec.sourceLightHook : null, darkRequestHook: variant.theme === 'dark' ? spec.sourceDarkRequestHook : null, hookUrl: sourceUrl }, async (ref) => {
    await ref.goto(sourceUrl, { waitUntil: 'networkidle' })
    await settle(ref)
    // read back in THIS page before it is pictured: the measured pass held, this one may not
    if (variant.theme === 'dark') {
      axis.sampledSourceTheme = { expected: 'dark', hook: sourceDarkHook, ...(await ref.evaluate(inPageDarkHolds, sourceDarkHook)) }
      if (!axis.sampledSourceTheme.holds) return missing(`the source did not stay dark with ${sourceDarkHook} when shot for the sampled lenses`)
    }
    const rel = `shots/${page.id}--${variant.id}--source.png`
    const png = await ref.screenshot({ path: path.join(out, rel), fullPage: true })
    const cut = await tilePage(ref, out, rel, tileHeight, png)
    Object.assign(axis, { sourceConsumers, sourceScreenshot: rel, sourceTiles: cut.tiles, sourceTilesCoverPicture: cut.fullWidthCovered })
  })
}

// ─────────────────────────────────────────────── main
export async function run(o) {
  // Exactly one contract, by path or the run-root's canonical — never picked from a directory.
  const resolved = resolveContract({ runRoot: o.runRoot ?? null, explicit: o.contract ?? null, name: CANONICAL.visual })
  const contract = readJsonFile(resolved.path, 'contract')
  // --allow-stale skips the binding checks of the validator (structure still must hold); identity records why it is stale.
  // With --theme (the BUILT theme) every layout's served template must be in it (contract.mjs).
  const decisions = decisionsOf(o, resolved.path, contract)
  bindDecisions(contract, decisions)
  const errors = validateContract(contract, { specDir: o.allowStale ? null : (o.spec ?? null), themeDir: o.theme ?? null, decisions })
  if (errors.length) throw new Error(`contract invalid:\n  ${errors.join('\n  ')}`)
  const identity = identityOf({ contractPath: resolved.path, contract, specDir: o.spec ?? null, artifactPath: o.artifact ?? null, seedReportPath: o.seedReport ?? null })
  if (identity.stale.length && !o.allowStale) throw new Error(`contract is stale — ${identity.stale.join('; ')} — regenerate it (contract.mjs init) or pass --allow-stale to explore (the run then cannot pass)`)
  o = { ...o, contract: resolved.path }
  if (existsSync(o.out) && !o.reuseInPlace) {
    const entries = existsSync(path.join(o.out, 'visual.json'))
    if (entries) throw new Error(`--out ${o.out} already holds a run; evidence of one run never overwrites another`)
  }
  // The run's directory is a real directory, never a symlink: every picture and record of the run is
  // written under it, and a linked one would carry them somewhere else (menu-open.mjs writeShot checks
  // it again, with every directory below it, before each capture).
  mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true })
  let outStat
  try {
    outStat = lstatSync(o.out)
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    mkdirSync(o.out)
    outStat = lstatSync(o.out)
  }
  if (outStat.isSymbolicLink() || !outStat.isDirectory()) throw new Error(`--out ${o.out} is ${outStat.isSymbolicLink() ? 'a symlink' : 'not a directory'}; a run is written only into a real directory`)
  mkdirSync(path.join(o.out, 'shots'), { recursive: true })
  if (lstatSync(path.join(o.out, 'shots')).isSymbolicLink()) throw new Error(`--out ${o.out} holds shots/ as a symlink; a run is written only into a real directory`)
  const stagesAll = contract.visual?.stages ?? STAGES
  const stageArg = (o.stage ?? '').split(',').filter(Boolean)
  for (const id of stageArg) if (!stagesAll.some((s) => s.id === id)) throw new Error(`unknown stage ${id}`)
  const stagesToRun = stageArg.length ? stagesAll.filter((s) => stageArg.includes(s.id)) : stagesAll
  // ── verdict inputs that live in no file ──────────────────────────────────────────────────────
  // `pageHash` covers everything a checkout can recompute: the contract slice, the served HTML, the
  // theme, the spec, the tool version. The values below reach findings too but exist only for the
  // length of one process — the source, the dark hook, the mega selector, the binary that drew the
  // pixels — so the only way two runs can be compared on them is for each run to WRITE them down
  // (`visual.json` `inputs`) and for `--reuse` to read them back. Anything that moves no verdict —
  // `--out`, `--tile-height`, `--pages`, `--concurrency`, timestamps — is left out ON PURPOSE: put
  // it in and reuse never fires, and the fix loop pays full price for a change that alters nothing.
  // Computed here rather than at its old place further down, because `verdictInputs` needs it and a
  // `const` cannot be read above its declaration -- the first version of this block did exactly that
  // and every browser-backed test failed with `Cannot access 'darkHook' before initialization`.
  const darkHook =
    contract.design.theme.storage?.type === 'cookie'
      ? `cookie:${contract.design.theme.storage.key}=dark`
      : `attr:${contract.design.theme.attribute}=dark`
  const lightHook = siteLightHookOf(contract, o.lightHook)
  const mega = megaSelectorsOf(contract, o.megaItems ?? null)
  const patternsMapRun = loadPatternsMap(o.patternsMap, o.patternsMap != null)
  const verdictInputs = {
    // parity-*, image and font findings exist only when a source is cited
    source: { site: Boolean(o.sourceSite), spec: Boolean(o.spec) },
    // seeds every dark axis; how the theme is reached decides what a dark axis even measures
    darkHook,
    // seeds every light axis of a site that is dark by default; absent for every other site
    ...(lightHook ? { lightHook } : {}),
    // decides which panels the mega-hover check opens, so it decides which findings can exist
    megaItems: mega?.items ?? null,
    ...(mega?.trigger || mega?.panel ? { mega: { trigger: mega.trigger, panel: mega.panel } } : {}),
    // 🔒 WITHOUT `--theme` NO THEME FILE IS HASHED AT ALL (page-hash.mjs skips assets/css, theme.json,
    // functions.php, inc/*.php). A run that passed the flag and one that did not produce the same
    // page hash for the same page, so a CSS-only regression after a clean run was served from
    // `--reuse` as still clean. Recording it here is what lets the drift check see the difference.
    theme: Boolean(o.theme),
    // the map file and its content: a verdict recomputes the page hashes from this record, not from a flag given again
    patternsMap: patternsMapRun ? { file: patternsMapRun.file, sha256: patternsMapRun.sha256 } : false
  }
  // Read once the run is over, from the browser that actually drew the pixels rather than from the
  // manifest. `lazyBrowser` may never launch — a fast gate whose pages all reuse does no browser
  // work at all — and `null` then says exactly that.
  let renderer = null
  /** What differs between a prior run's recorded inputs and this run's — one line per key. */
  const inputDrift = (prior, current) => {
    if (!prior) return ['that run recorded no verdict inputs (older visual-qa); measure again']
    return Object.keys(current)
      .filter((k) => JSON.stringify(prior[k]) !== JSON.stringify(current[k]))
      .map((k) => `${k}: ${JSON.stringify(prior[k])} → ${JSON.stringify(current[k])}`)
  }
  const priors = (o.reuse ?? []).map((dir) => {
    const f = path.join(dir, 'visual.json')
    if (!existsSync(f)) throw new Error(`--reuse ${dir}: no visual.json there`)
    const report = readEvidence(f, VISUAL_PRIOR, { what: `--reuse ${dir}: visual.json` })
    // A prior whose inputs differ is declined for EVERY page and says so once, here. Declining is
    // not an error — the fix loop passes --reuse routinely — but a silent decline looks exactly
    // like a slow run, so the reason is printed and kept.
    const stale = inputDrift(report.inputs, verdictInputs)
    // a run that recorded itself stale (--allow-stale: its contract or inputs moved) supplies no axis to anyone
    for (const [where, list] of [['identity.stale', report.identity.stale], ['summary.stale', report.summary.stale]]) if (list?.length) stale.push(`the run recorded ${where}: ${list.slice(0, 3).join('; ')}`)
    if (stale.length) console.error(`--reuse ${dir}: declined — ${stale.join('; ')}`)
    return { dir: path.resolve(dir), report, stale }
  })
  // Pages named with --pages, by id or path; one the contract does not have is refused, never
  // silently dropped (resolvePageSelection).
  const only = o.pages == null ? [] : resolvePageSelection(contract, String(o.pages).split(','))
  // ── scope: full (default) · fast-gate (resolved cases) · targeted-debug (--pages)
  const scopeArg = o.scope ?? 'full'
  if (!['full', 'fast-gate'].includes(scopeArg)) throw new Error(`scope must be full or fast-gate (got ${scopeArg}); --pages is the targeted-debug scope`)
  if (scopeArg === 'fast-gate' && only.length) throw new Error('--scope fast-gate resolves its own cases from the contract; --pages is targeted-debug, not a fast gate')
  const scope = { kind: only.length ? 'targeted-debug' : scopeArg, plan: null }
  if (scope.kind === 'targeted-debug') scope.pages = only
  if (scope.kind === 'fast-gate') {
    scope.plan = resolveFastGate(contract, { themeDir: o.theme ?? null })
    if (scope.plan.errors.length) throw new Error(`fast gate cannot be resolved from this contract:\n  ${scope.plan.errors.join('\n  ')}`)
  }
  const caseVariants = new Map(scope.plan ? scope.plan.cases.map((c) => [c.page, c.variants]) : [])
  const specs = contract.pages.filter((p) => (scope.kind === 'fast-gate' ? caseVariants.has(p.id) : !only.length || only.includes(p.id)))
  // Named pages that have no axis in the stages this run measures would measure nothing, and a run
  // that measures nothing is not a clean one.
  if (only.length) {
    const idle = specs.filter((p) => !axesFor(contract, p).some((v) => stagesToRun.some((st) => st.variants.includes(v.id)))).map((p) => p.id)
    if (idle.length) throw new Error(`--pages: ${idle.join(', ')} ha${idle.length > 1 ? 've' : 's'} no axis in the stage(s) run (${stagesToRun.map((st) => st.id).join(', ')}) — nothing would be measured`)
  }
  // 🔒 A PAGE THE CALLER NAMED IS MEASURED NOW. --pages is asked to see those pages measured — a
  // suspected flake, a fix on a page whose served HTML did not move (JA Vega M4d: a `mega-menu`
  // finding on an unchanged theme). Taking the axes of an earlier run with the same hash answers a
  // different question, so --reuse is not consulted for a targeted run.
  if (only.length && priors.length) console.error('--reuse: not consulted — the pages named with --pages are measured now')
  // a full run standing on a fast gate: the verdict must be pass, for this contract; page hashes are checked below
  let fastGate = null
  let fastGateVerdict = null
  if (o.fastGate) {
    if (scope.kind !== 'full') throw new Error('--fast-gate names the fast gate a FULL run stands on; it makes no sense with another scope')
    const file = path.join(o.fastGate, 'FAST-GATE.json')
    if (!existsSync(file)) throw new Error(`fast gate ${o.fastGate} has no verdict (run fast-gate.mjs verdict first)`)
    fastGateVerdict = readEvidence(file, RECEIPT, { what: 'FAST-GATE.json', max: MAX_SMALL_EVIDENCE_BYTES })
    const stale = []
    if (fastGateVerdict.status !== 'pass') stale.push(`verdict is ${fastGateVerdict.status}`)
    if (fastGateVerdict.contractHash !== identity.contractHash) stale.push('contract changed since the verdict')
    // the receipt must be the plan this contract resolves to now, case for case and stage for stage
    if (fastGateVerdict.status === 'pass') {
      const owed = resolveFastGate(contract, { themeDir: o.theme ?? null })
      if (owed.errors.length) stale.push(`the current fast-gate plan cannot be resolved (${owed.errors[0]})`)
      else stale.push(...receiptAgainstPlan(fastGateVerdict, owed))
    }
    if (stale.length) throw new Error(`fast gate ${o.fastGate} is stale or not clean: ${stale.join('; ')}`)
    fastGate = { run: path.resolve(o.fastGate), verdictAt: fastGateVerdict.at ?? null, contractHash: fastGateVerdict.contractHash }
  } else if (scope.kind === 'full') console.error('note: no --fast-gate cited; the workflow expects a clean fast gate before a full run')
  // The source's dark switch: the flag wins, else what the contract recorded from the export
  // (contract.source.darkHook). Without one, a dark axis has no source to compare against. The
  // light switch is the same for a source that is dark by default (lib/browser.mjs withPage).
  const spec = {
    sourceDarkHook: o.sourceDarkHook ?? contract.source?.darkHook ?? null,
    sourceLightHook: o.sourceLightHook ?? contract.source?.lightHook ?? null,
    // A light-by-default source whose server reads the theme from a cookie: the dark pass sends it.
    sourceDarkRequestHook: o.sourceDarkRequestHook ?? contract.source?.darkRequestHook ?? null,
    // the contract's declaration that the source has no dark of its own, taken only fresh for --spec (lib/canonical.mjs)
    sourceDarkDerived: !o.sourceDarkHook && !o.sourceDarkRequestHook && darkDerivedProblems(contract, { specDir: o.spec ?? null }).length === 0
  }
  // A live source without URL rewrite answers under /index.php: each page's `sourceRoute` is resolved once
  // (as given, under /index.php, the source's own hrefs) before any axis reads it.
  const liveSourceSite = o.sourceSite ?? contract.source?.site ?? null
  const liveRoutes = liveSourceSite && !o.noSourceRouteProbe ? [...new Set(specs.filter((p) => !p.sourceRendered && p.sourceRoute).map((p) => p.sourceRoute))] : []
  const routedSource = new Map()
  if (liveRoutes.length) {
    const origin = new URL(liveSourceSite).origin
    // a page the map declares as not-found answers its declared status on the source too
    const expect = Object.fromEntries(specs.filter((p) => !p.sourceRendered && p.sourceRoute && p.status !== 200).map((p) => [p.sourceRoute, p.status]))
    const res = await resolveSourceRoutes(origin, liveRoutes, { fetchPage: o.fetchSourcePage, expect })
    for (const r of liveRoutes) if (res.results[r].url) routedSource.set(r, res.results[r].url)
    // a reachable host with an unresolvable route is a tool failure: the run stops now, it does not fall back to the unresolved address
    if (res.failed.length) throw new Error(`${res.failed.length} source route(s) unresolved although ${origin} answers 200 on /: ${res.failed.map((f) => f.route).join(', ')} (${res.failed[0].reason})`)
  }
  const sourceUrlFor = (page) => (!page.sourceRendered && routedSource.has(page.sourceRoute) ? routedSource.get(page.sourceRoute) : sourceUrlOf(page, { spec: o.spec, sourceSite: o.sourceSite, contract }))
  // A page's pattern files come from the caller's own resolver when it supplies one (the tests do),
  // otherwise from `--patterns-map`, read in the shape this repository actually writes:
  // `{ types: { <module type>: { pattern: "<namespace>/<slug>" } } }` (see `parityFromPatterns`).
  // A page's module types are its `sections`. `themeFilesFor` resolves each slug to the file whose
  // header REGISTERS it (`patterns/acm-hero.php` may register `section-hero`) — the first version of this read `{pageId: [slug]}`, a shape
  // nothing in the repository produces, and selected zero patterns from a map declaring 13 types.
  // A named file that does not exist is an error, not an empty list: the flag was passed for a
  // reason, and silently hashing no patterns is the behaviour this change exists to end.
  const patternsMap = patternsMapRun?.map ?? null
  const patternSlugsFor = (page) => {
    if (o.patternSlugsFor) return o.patternSlugsFor(page)
    if (!patternsMap) {
      if (page.sections?.length) throw new Error(`page ${page.id}: it has sections and no --patterns-map was given — the page hash cannot cover its patterns`)
      return []
    }
    const { slugs, unmapped } = patternSlugsOf(page.sections, patternsMap)
    if (unmapped.length) throw new Error(`page ${page.id}: section type(s) ${unmapped.join(', ')} have no pattern in ${o.patternsMap} — the page hash cannot cover them`)
    return slugs
  }
  // `o.launch` lets a test hand in the browser (and kill it); a real run launches Chromium.
  const browser = lazyBrowser(o.launch ? { launch: o.launch } : { launchOptions: { args: [...RUN_LAUNCH_ARGS] } })
  const pageReports = new Map()
  const stageReports = []
  // the hash needs the served HTML: one fetch per page, before any browser work
  for (const page of specs) {
    let html = ''
    try {
      html = await (await fetch(new URL(page.path, o.site).href, { signal: AbortSignal.timeout(30000) })).text()
    } catch {
      html = ''
    }
    const { hash, parts } = pageHash({ contract, page, themeDir: o.theme ?? null, specDir: o.spec ?? null, targetHtml: html, patternSlugs: patternSlugsFor(page) })
    pageReports.set(page.id, { id: page.id, path: page.path, layout: page.layout, referenceKind: page.referenceKind ?? null, hash, hashParts: parts, axes: [], findings: [] })
  }
  if (fastGateVerdict) {
    const recorded = fastGateVerdict.pageHashes // a passing receipt always records at least one (evidence.mjs RECEIPT)
    const moved = Object.entries(recorded).filter(([id, h]) => pageReports.get(id)?.hash !== h).map(([id]) => id)
    if (moved.length) throw new Error(`fast gate ${o.fastGate} is stale: ${moved.length} page(s) changed since the verdict — ${moved.slice(0, 8).join(', ')}`)
  }
  // ── page events: a page's result, as soon as its axes of one stage are final ─────────────────
  // The report is written once the run ends; a fix loop that waits for it waits for the slowest
  // page of the slowest stage (JA Vega M4c: 13 rounds, 1–5 min each, every fix waited for all).
  // Each page is also one line of <out>/pages.jsonl (and `o.onPage`) the moment its axes of a
  // stage — retries included — are done, so the agent fixes it while the others are measured.
  // The line is evidence of that page only; the verdict is still the report.
  const pagesLog = path.join(o.out, 'pages.jsonl')
  const emitPage = (stage, page, axes, measured) => {
    const ev = {
      stage: stage.id,
      page: page.id,
      path: page.path,
      layout: page.layout,
      hash: pageReports.get(page.id).hash,
      measured,
      findings: axes.flatMap((a) => a.findings.map((f) => ({ ...f, axis: a.variant }))),
      unclassified: axes.reduce((n, a) => n + (a.coverage?.unclassified?.length ?? 0), 0),
      axes: axes.map((a) => ({ variant: a.variant, findings: a.findings.length, unclassified: a.coverage?.unclassified?.length ?? 0, screenshot: a.screenshot ?? null, sourceScreenshot: a.sourceScreenshot ?? null, ...(a.retry ? { retry: a.retry } : {}) })),
      at: new Date().toISOString()
    }
    appendFileSync(pagesLog, JSON.stringify(ev) + '\n')
    o.onPage?.(ev)
    console.log(`PAGE ${stage.id} ${page.id} findings=${ev.findings.length} unclassified=${ev.unclassified}`)
  }
  // Jobs run in `--priority` order first (the pages a fix touched, the pages never measured), then
  // the contract's; the report's order is the contract's whatever ran first.
  const priority = new Map((o.priority ?? []).map((id, i) => [id, i]))
  const rank = (id) => priority.get(id) ?? priority.size
  // Stages run one after another, a later one only once the earlier ones are clean (the staged
  // default) — unless the stages are named (`--stage a,b`, `--all-stages`): then every named stage
  // runs, and up to `--tier-concurrency` of them at once, each with its own `--concurrency` page
  // jobs, every job in its own browser context. A failing stage then hides nothing in another.
  const gated = !o.allStages && !stageArg.length
  const tierLimit = gated ? 1 : o.tierConcurrency ?? 1
  const runStage = async (stage, st) => {
    const jobs = []
    // pages with an axis whose source is static: their findings and events wait for the stage's coverage
    const deferred = []
    for (const page of [...specs].sort((x, y) => rank(x.id) - rank(y.id))) {
      const pr = pageReports.get(page.id)
      const variants = axesFor(contract, page).filter((v) => stage.variants.includes(v.id) && (!caseVariants.has(page.id) || caseVariants.get(page.id).includes(v.id)))
      if (!variants.length) continue
      st.pages++
      let prev = null
      let reuseDir = null
      for (const { dir, report, stale } of only.length ? [] : priors) {
        if (stale.length) continue // inputs differ — said once above, for the whole run
        const p = report.pages?.find((x) => x.id === page.id && x.hash === pr.hash)
        const axes = p ? variants.map((v) => p.axes.find((a) => a.variant === v.id)) : null
        // An axis measured before the header menus were captured open (no `menus` record) has not
        // measured what this run owes, whatever its findings say.
        const clean = (a) => a && ['now', 'reused'].includes(a.measured) && !a.findings.length && a.coverage && !a.coverage.unclassified.length && a.menus
        if (axes && axes.every(clean)) {
          prev = axes
          reuseDir = dir
          break
        }
      }
      if (prev) {
        const reused = []
        for (const a of prev) {
          const axis = { ...a, measured: 'reused', reusedFrom: a.reusedFrom ?? reuseDir, stage: stage.id }
          // copies: the coverage of a static source is decided again below, against THIS run's pages
          if (axis.menus?.sourceStatic?.length) Object.assign(axis, { findings: [...axis.findings], menus: { ...axis.menus, sourceStatic: axis.menus.sourceStatic.map((f) => ({ ...f })) } })
          pr.axes.push(axis)
          reused.push(axis)
          st.axes++
          st.reused++
          console.log(`same ${page.id} ${axis.variant} (reused from ${reuseDir}) findings=${axis.findings.length}`)
        }
        // counted and published once the static sources are settled (below) when an axis owes that
        if (reused.some((a) => a.menus?.sourceStatic?.length)) deferred.push({ page, axes: reused, how: 'reused' })
        else {
          st.findings += reused.reduce((n, a) => n + a.findings.length, 0)
          emitPage(stage, page, reused, 'reused')
        }
        continue
      }
      for (const variant of variants) jobs.push({ page, variant, pr })
    }
    // One attempt at one axis. A browser found dead before the attempt is replaced first; one
    // that died DURING it is replaced after, so the jobs still queued get a live one.
    const measureOnce = async ({ page, variant }) => {
      let b = await browser.get()
      if (!isAlive(b)) b = await browser.restart(b)
      // An attempt that ran past its timeout keeps running behind the race; aborting it stops its
      // header-menu captures from writing under the names the next attempt writes (menu-open.mjs).
      const given = new AbortController()
      try {
        return await withTimeout(measureAxis({ browser: b, contract, page, variant, site: o.site, sourceUrl: sourceUrlFor(page), out: o.out, darkHook, lightHook, mega, spec, tileHeight: o.tileHeight ?? DEFAULT_TILE_HEIGHT, menuBudgetMs: o.menuBudgetMs ?? MENU_BUDGET_MS, signal: given.signal }), o.axisTimeoutMs ?? AXIS_TIMEOUT_MS, `${page.id} ${variant.id}`)
      } catch (e) {
        given.abort()
        const died = !isAlive(b)
        if (died) await browser.restart(b)
        const notApplicable = notApplicableChecks(page.referenceKind)
        return { variant: variant.id, width: variant.width, theme: variant.theme, components: [], accepted: [], scans: {}, ...(notApplicable.length ? { notApplicable } : {}), findings: [{ kind: 'axis-error', error: String(e.message).slice(0, 300), ...(died ? { browserDied: true } : {}) }] }
      }
    }
    const axisError = (axis) => axis.findings.find((f) => f.kind === 'axis-error') ?? null
    const logAxis = (page, axis, tag = '') =>
      console.log(`${axis.findings.length ? 'FAIL' : 'ok  '} ${page.id} ${axis.variant} components=${axis.components.length} unclassified=${axis.coverage?.unclassified?.length ?? '-'} findings=${axis.findings.length}${tag}`)
    // An axis that ended in axis-error (the browser died, or the axis ran past its timeout) is
    // measured again IN THIS RUN, on a live browser — at most --axis-retries times, right after the
    // failed attempt so its page's result is final (and published) without waiting for the pass.
    // Its evidence says so (`axis.retry`, `summary.retried`), and an axis that still fails keeps
    // its axis-error. Before this, a retry was a second run by hand whose results lived beside the
    // report, not in it (Tracy Base lab 25/09: 3/3 recovered, equal to a full run).
    const retries = Math.max(0, o.axisRetries ?? AXIS_RETRIES)
    const left = new Map()
    for (const j of jobs) left.set(j.page.id, (left.get(j.page.id) ?? 0) + 1)
    const done = new Map()
    await mapLimit(jobs, o.concurrency ?? 2, async (job) => {
      let axis = await measureOnce(job)
      logAxis(job.page, axis)
      if (axisError(axis) && retries) {
        const errors = [axisError(axis).error]
        let attempts = 0
        while (axisError(axis) && attempts < retries) {
          attempts++
          axis = await measureOnce(job)
          if (axisError(axis)) errors.push(axisError(axis).error)
        }
        axis.retry = { attempts, recovered: !axisError(axis), errors }
        logAxis(job.page, axis, ` (retry ${attempts}: ${axis.retry.recovered ? 'recovered' : 'still axis-error'})`)
      }
      axis.measured = 'now'
      axis.stage = stage.id
      job.pr.axes.push(axis)
      st.axes++
      const mine = [...(done.get(job.page.id) ?? []), axis]
      done.set(job.page.id, mine)
      // an axis whose source is static is counted and published after the stage's coverage is settled
      if (!axis.menus?.sourceStatic?.length) st.findings += axis.findings.length
      if (mine.length === left.get(job.page.id)) {
        mine.sort((x, y) => (x.variant < y.variant ? -1 : 1))
        if (mine.some((a) => a.menus?.sourceStatic?.length)) deferred.push({ page: job.page, axes: mine, how: 'now' })
        else emitPage(stage, job.page, mine, 'now')
      }
      return axis
    })
    // Static sources: settled from the stage's final axes (reused ones too), then counted and published.
    const stageAll = specs.flatMap((pg) => pageReports.get(pg.id).axes.filter((a) => stage.variants.includes(a.variant) && a.stage === stage.id).map((axis) => ({ page: pg, axis })))
    settleStaticSource(stageAll)
    for (const d of deferred) {
      st.findings += d.axes.filter((a) => d.how === 'reused' || a.menus?.sourceStatic?.length).reduce((n, a) => n + a.findings.length, 0)
      emitPage(stage, d.page, d.axes, d.how)
    }
    // Lens sampling: pages whose findings their layout's representative does not also have are
    // shot for the sampled lenses (lens-work.mjs). Pictures only — no finding, no verdict moves.
    // Axes are read in variant order, not completion order, so the pick is the same at any concurrency.
    const stageAxes = (id) => pageReports.get(id).axes.filter((a) => stage.variants.includes(a.variant)).sort((x, y) => (x.variant < y.variant ? -1 : 1))
    const stageRows = findingRows(
      specs.map((pg) => ({ id: pg.id, axes: stageAxes(pg.id) })),
      (v) => stageOf(contract, v)
    )
    const shoot = lensSample(contract, stage.id, stageRows).extras.flatMap((x) =>
      stageAxes(x.page)
        .filter((a) => a.measured === 'now' && !a.screenshot)
        .map((axis) => ({ page: specs.find((pg) => pg.id === x.page), axis, variant: contract.variants.find((v) => v.id === axis.variant), representative: x.representative }))
    )
    await mapLimit(shoot, o.concurrency ?? 2, async ({ page, axis, variant, representative }) => {
      axis.lensShot = { representative }
      let b = await browser.get()
      if (!isAlive(b)) b = await browser.restart(b)
      try {
        await withTimeout(shootSampled({ browser: b, contract, page, variant, axis, site: o.site, sourceUrl: sourceUrlFor(page), out: o.out, darkHook, lightHook, spec, tileHeight: o.tileHeight ?? DEFAULT_TILE_HEIGHT }), o.axisTimeoutMs ?? AXIS_TIMEOUT_MS, `${page.id} ${variant.id} (lens picture)`)
        console.log(`shot ${page.id} ${variant.id} for ${axis.shotConsumers?.join(', ') ?? 'no lens'} (findings ${representative} does not have)`)
      } catch (e) {
        if (!isAlive(b)) await browser.restart(b)
        axis.lensShot.error = String(e.message).slice(0, 300)
        console.error(`lens picture ${page.id} ${variant.id} failed: ${axis.lensShot.error}`)
      }
    })
    st.status = st.findings ? 'fail' : 'pass'
    console.log(`== stage ${st.id}: ${st.status} (pages ${st.pages}, axes ${st.axes}, reused ${st.reused}, findings ${st.findings})`)
  }
  try {
    // Every stage has its row, in the fixed stage order, before any of them runs.
    const rows = stagesAll.map((stage) => {
      const st = { id: stage.id, variants: stage.variants, pages: 0, axes: 0, findings: 0, reused: 0, status: 'not-run' }
      stageReports.push(st)
      if (!stagesToRun.includes(stage)) st.status = 'skipped'
      return { stage, st }
    })
    const selected = rows.filter((r) => r.st.status !== 'skipped')
    if (gated) {
      for (const { stage, st } of selected) {
        if (stageReports.some((x) => x !== st && x.status === 'fail')) {
          st.reason = 'an earlier stage failed; fix it and run again'
          continue
        }
        await runStage(stage, st)
      }
    } else await mapLimit(selected, tierLimit, ({ stage, st }) => runStage(stage, st))
  } finally {
    if (browser.launched()) renderer = browserIdentity(await browser.get())
    await browser.close()
  }
  // a targeted-debug run reads the intrinsic probe on its own pages only (intrinsicPages)
  const intrinsicOnly = scope.kind === 'targeted-debug' ? specs.map((p) => p.pagemapPath ?? p.path) : null
  // route → the page hash of what the site serves there now (a contract page), or of the served HTML alone (a route no page has);
  // null when it cannot be read or hashed — never equal to anything
  const bare = (x) => String(x ?? '').replace(/(.)\/+$/, '$1')
  const hashRoutes = async (routes) => {
    const out = new Map()
    for (const route of routes) {
      const page = contract.pages.find((p) => bare(p.path) === bare(route) || (p.pagemapPath != null && bare(p.pagemapPath) === bare(route)))
      try {
        const res = await fetch(new URL(page?.path ?? route, o.site).href, { signal: AbortSignal.timeout(30000) })
        const html = await res.text()
        out.set(route, page ? pageHash({ contract, page, themeDir: o.theme ?? null, specDir: o.spec ?? null, targetHtml: html, patternSlugs: patternSlugsFor(page) }).hash : `html:${res.status}:${createHash('sha256').update(html).digest('hex')}`)
      } catch {
        out.set(route, null)
      }
    }
    return out
  }
  let shared = null
  if (o.probesFrom && o.spec) {
    shared = await probesFrom(o, { identity, scope, intrinsicOnly, hashRoutes, timeoutMs: o.probesWaitMs ?? Math.max(600000, specs.length * 90000) + 1800000 })
    if (shared.why) console.log(`note: --probes-from: ${shared.why} — this run measures ${shared.intrinsic || shared.interaction ? 'that probe' : 'the intrinsic and interaction probes'} itself`)
  }
  const intrinsic = shared?.intrinsic ?? (await (o.intrinsic ?? runIntrinsic)(o, { only: intrinsicOnly }))
  const interaction = shared?.interaction ?? (await (o.interaction ?? runInteraction)(o, { specs, spec, darkHook, lightHook, sourceUrlFor, scopeKind: scope.kind }))
  // the routes the probes read, hashed as served now: what a later --probes-from binds them to
  const probeRoutes = [...new Set([...(interaction?.record?.pages ?? []).filter((r) => typeof r === 'string'), ...(intrinsic?.status === 'run' && o.spec ? intrinsicPages(o, intrinsicOnly).map((p) => p.path) : [])])]
  if (probeRoutes.length) {
    mkdirSync(o.out, { recursive: true })
    writeFileSync(path.join(o.out, PROBES_SERVED_FILE), `${JSON.stringify({ schema: 1, routes: Object.fromEntries(await hashRoutes(probeRoutes)) }, null, 2)}\n`)
  }
  const pages = [...pageReports.values()].filter((p) => p.axes.length)
  for (const p of pages) {
    p.axes.sort((a, b) => (a.variant < b.variant ? -1 : 1))
    p.findings = p.axes.flatMap((a) => a.findings.map((f) => ({ ...f, axis: a.variant })))
  }
  const report = writeRun({
    out: o.out,
    site: o.site,
    sourceSite: o.sourceSite ?? null,
    contractFile: o.contract,
    identity,
    stageReports,
    pages,
    stageOf: (v) => stageOf(contract, v),
    scope,
    fastGate,
    method: `${TOOL_VERSION}: screenshot + real pointer + computed px, staged; parity by words against the rendered source; header menus captured open, paired by their words (the sole drawer toggle by its markup, a declared pair by its selectors) and compared by boxes, styles and pictures; a page whose hash is unchanged reuses its earlier evidence`,
    inputs: verdictInputs,
    browser: renderer,
    selectors: selectorsRecord(selectorProfileOfContract(contract)),
    intrinsic,
    interaction
  })
  return report
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain && argv[0] === 'findings') process.exit(findingsCli(argv.slice(1)))
else if (isMain) {
  try {
    cli = parseStrict(argv, { values: CLI_VALUES, flags: CLI_FLAGS })
  } catch (e) {
    if (!(e instanceof UsageError)) throw e
    console.error(`visual-qa: ${e.message}`)
    process.exit(2)
  }
  const o = {
    contract: opt('--contract'),
    runRoot: opt('--run-root'),
    decisions: opt('--decisions'),
    artifact: opt('--artifact'),
    seedReport: opt('--seed-report'),
    allowStale: flag('--allow-stale'),
    site: opt('--site'),
    out: opt('--out'),
    spec: opt('--spec'),
    sourceSite: opt('--source-site'),
    theme: opt('--theme'),
    pages: opt('--pages'),
    stage: opt('--stage'),
    allStages: flag('--all-stages'),
    reuse: (opt('--reuse', '') || '').split(',').filter(Boolean),
    concurrency: concurrencyFrom(argv),
    tierConcurrency: positiveInt(opt('--tier-concurrency', '1'), '--tier-concurrency'),
    priority: (opt('--priority', '') || '').split(',').filter(Boolean),
    // 🔒 `--patterns-map` was in the usage banner and parsed NOWHERE, so `patternSlugsFor` was
    // always undefined and `pageHash` hashed zero pattern files. Editing `patterns/section-*.php`
    // — the fix the report's own hints send you to — therefore did not move the page hash, and the
    // next `--reuse` run republished the pre-fix evidence for a page that had just been fixed.
    patternsMap: flag('--patterns-map') ? opt('--patterns-map') : null,
    // null unless given: the contract's interactions.mega decides (megaSelectorsOf)
    megaItems: opt('--mega-items'),
    tileHeight: Math.max(10, Number(opt('--tile-height', DEFAULT_TILE_HEIGHT)) || DEFAULT_TILE_HEIGHT),
    sourceDarkHook: opt('--source-dark-hook'),
    sourceLightHook: opt('--source-light-hook'),
    sourceDarkRequestHook: opt('--source-dark-request-hook'),
    lightHook: opt('--light-hook'),
    scope: opt('--scope', 'full'),
    fastGate: opt('--fast-gate'),
    axisRetries: Math.max(0, Number(opt('--axis-retries', AXIS_RETRIES)) || 0),
    probesFrom: opt('--probes-from')
  }
  if (!(o.contract || o.runRoot) || !o.site || !o.out) {
    console.error('usage: visual-qa.mjs (--contract visual.contract.json | --run-root <dir>) --site <origin> --out <new dir> --spec <spec dir> [--artifact <theme zip>] [--seed-report <json>] [--source-site <origin>] [--theme <dir>] [--stage a,b] [--all-stages] [--reuse <dir,…>] [--pages id,…] [--allow-stale] [--light-hook <hook>] [--concurrency N] [--tier-concurrency N] [--priority id,…] [--probes-from <dir of a run of the same measurement>]')
    process.exit(2)
  }
  // A cancel (round.mjs --watch cuts a checkpoint at a deploy boundary with SIGTERM to the process
  // group) ends this run HERE, with nothing more written: no report, no further pages.jsonl line.
  // Without this handler Playwright's own SIGTERM handler only closes Chromium and Node runs on —
  // the page in flight became an axis-error ("browser has been closed"), its retry could fail as
  // fast, and a cut run wrote a whole visual.json in the seconds before SIGKILL (the rolling test
  // failed 4 times in 14 runs on it, 27/09). Registered before any browser starts, so it runs first;
  // Playwright's exit handler then kills the Chromium it launched.
  for (const sig of ['SIGTERM', 'SIGINT'])
    process.on(sig, () => {
      console.error(`visual-qa: ${sig}: cancelled — no report is written`)
      process.exit(sig === 'SIGINT' ? 130 : 143)
    })
  run(o)
    .then((report) => {
      console.log(JSON.stringify(report.summary))
      process.exit(exitCodeOf(report.summary))
    })
    .catch((e) => {
      console.error(`visual-qa: ${e.message}`)
      process.exit(1)
    })
}
