#!/usr/bin/env node
// The visual-review pass, run the way the T4 review method runs it: for every page in the contract,
// every component the contract names, on the contract's STAGES IN STRICT ORDER — light desktop →
// light responsive → dark desktop → dark responsive — and per axis three checks: A. screenshot
// (perceptual, for a QA lens), B. interaction (real pointer: hover jump, mega-menu travel,
// Escape/focus), C. computed px (rules, coverage, two-sided diff against the source render). Light
// passing says nothing about dark; desktop nothing about mobile. The report is a per-component table
// plus machine notes in the todo shape; exit 1 on any finding, any unclassified covered element, or a
// page that examined too little. Nobody signs it: `visual-review` passes on conditions qa.mjs checks.
//
//   node tools/visual-qa.mjs --contract qa.contract.json --site <origin> --out <new-dir>
//        [--source-site <origin serving the design source>] [--source-dir <folder of reference frames>]
//        [--scope full|fast-gate] [--pages id,id] [--fast-gate <fast-gate run-dir>] [--config template.config.json]
//        [--scans white,darktext,contrast,border,seam,hover] [--contrast-min 3] [--border-luma 80]
//        [--stage light-desktop[,…]] [--all-stages] [--reuse <earlier out-dir>] [--tile-height 1200]
//
// Tiles: every picture a lens consumes is also cut into ≤ --tile-height px strips under
// shots/<page>--<variant>[--source]/<n>.png, listed in index.json `tiles`. A reader downsamples a
// 7 000 px full-page file past legibility; the lens opens the tiles, and qa-notes.mjs counts a
// picture as opened only when every tile was. The full-page file stays for the record.
// Stages (contract visual.stages, in order): a later stage runs only after the earlier one is clean.
// --stage runs the named stage(s) for the fix loop; --reuse copies a page's earlier evidence when its
// page hash (visual-lib pageHash: render inputs, view + imports, seed slices, criteria, source reference,
// tools) is unchanged, so a rerun after a fix measures only the pages the fix could have touched.
//
// Scopes (visual.json `scope.kind`, and every file of the run):
//   full            every page (default). May cite `--fast-gate <run>`: that run must hold a passing
//                   FAST-GATE.json (fast-gate.mjs verdict) for this contract and this tree, else exit 2.
//   fast-gate       the cases `fast-gate.mjs` resolves from the contract (shared components, families,
//                   states, home, 404, risky locales), on every stage; writes FAST-GATE-PLAN.md.
//   targeted-debug  `--pages`: a hand-picked subset for debugging. Neither subset ever passes the
//                   `visual` gate of qa.mjs; only `full` does.
// Sources: `--source-site` renders an HTML/canvas/URL source for two-sided parity; `--source-dir` holds
// exported frames (source.kind `frames`): a page whose source[0] is an image gets that frame as its
// source picture and `parity.basis: declared` — the numbers in design.rules are the reference.
//
// Contract fields read (all additive to qa.contract.json):
//   design.rules[]       {id, selector, styles{variantId:{prop: value}}} — properties measured per variant
//   design.coverage[]    {selector, properties[]} — every visible match must be classified by some rule
//   design.parity        {selectors{key: css | {site, source}}, properties[]} — two-sided diff per page
//                        (needs --source-site; the page's source[0] is the reference document)
//   interactions{}       states with trigger/panel/link → mega-hover on desktop axes
//   variants[]           width/height/theme — ordered into the four axes automatically
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { contractHash } from './qa-contract.mjs'
import { resolveFastGate, planMarkdown } from './fast-gate.mjs'
import {
  browserIdentity,
  launchBrowser,
  loadConfig,
  themeOf,
  seedTheme,
  readTheme,
  navigate,
  examinedCount,
  captureDesign,
  snapshotOf,
  siteSnapshotOf,
  pngRows,
  cutPng,
  sourcePending,
  diffSnapshots,
  scanWhiteSurfaces,
  scanDarkText,
  scanContrast,
  scanBrightBorders,
  scanSeams,
  tagInteractive,
  settledRect,
  DEFAULT_INTERACTIVE,
  SNAPSHOT_PROPERTIES,
  firstFamily,
  imageCensus,
  findOneSpec,
  pageHash,
  scanOffSystem
} from './visual-lib.mjs'
const execFileP = promisify(execFile)
const HERE = path.dirname(new URL(import.meta.url).pathname)

const argv = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = argv.indexOf(name)
  if (i < 0) return dflt
  const v = argv[i + 1]
  argv.splice(i, 2)
  return v
}
const contractFile = opt('--contract', 'qa.contract.json'),
  site = opt('--site'),
  out = opt('--out'),
  sourceSite = opt('--source-site')
const only = (opt('--pages', '') || '').split(',').filter(Boolean)
const scopeArg = opt('--scope', 'full'),
  fastGateRun = opt('--fast-gate'),
  sourceDir = opt('--source-dir')
const scans = opt('--scans', 'white,darktext,contrast,border,seam,hover,offsystem').split(',').filter(Boolean)
const contrastMin = Number(opt('--contrast-min', 3)),
  borderLuma = Number(opt('--border-luma', 80)),
  tileHeight = Math.max(10, Number(opt('--tile-height', 1200)) || 1200)
// 🔒 READ ONCE, KEEP IT. `opt()` SPLICES the flag out of `argv` (see its body), so a second
// `opt('--config', …)` anywhere below silently returns the DEFAULT, not what the caller passed.
// That is how the mega-hover spawn used to hand `mega-hover.mjs` a config path the operator never
// asked for; `seedTheme` there is wrapped in try/catch, so the theme simply did not get seeded and
// the dark axis was measured in light — with no error.
const configFile = opt('--config', 'template.config.json')
const config = loadConfig(configFile)
if (!site || !out || existsSync(out)) {
  console.error(
    'usage: visual-qa.mjs --contract qa.contract.json --site <origin> --out <new-dir> [--source-site <origin>] [--pages a,b]'
  )
  process.exit(2)
}
const contract = JSON.parse(readFileSync(contractFile, 'utf8'))
const hook = contract.design?.theme ?? themeOf(config)
// ── scope ─────────────────────────────────────────────────────────────────────────────────────────
if (!['full', 'fast-gate'].includes(scopeArg)) {
  console.error(`--scope must be full or fast-gate (got ${scopeArg}); --pages is the targeted-debug scope`)
  process.exit(2)
}
if (scopeArg === 'fast-gate' && only.length) {
  console.error(
    '--scope fast-gate resolves its own cases from the contract; --pages is targeted-debug, not a fast gate'
  )
  process.exit(2)
}
const scope = { kind: only.length ? 'targeted-debug' : scopeArg, plan: null }
if (scope.kind === 'targeted-debug') scope.pages = only
if (scope.kind === 'fast-gate') {
  scope.plan = resolveFastGate(contract)
  if (scope.plan.errors.length) {
    console.error(`fast gate cannot be resolved from this contract:\n- ${scope.plan.errors.join('\n- ')}`)
    process.exit(2)
  }
}
// A full run that cites a fast gate: the verdict must be pass, for this contract, on this tree.
let fastGate = null
if (fastGateRun) {
  if (scope.kind !== 'full') {
    console.error(
      '--fast-gate names the fast gate a FULL run stands on; it makes no sense with another scope'
    )
    process.exit(2)
  }
  const file = path.join(fastGateRun, 'FAST-GATE.json')
  if (!existsSync(file)) {
    console.error(`fast gate ${fastGateRun} has no verdict (run fast-gate.mjs verdict first)`)
    process.exit(2)
  }
  const v = JSON.parse(readFileSync(file, 'utf8'))
  const stale = []
  if (v.status !== 'pass') stale.push(`verdict is ${v.status}`)
  if (v.contractHash !== contractHash(contract)) stale.push('contract changed since the verdict')
  for (const [id, h] of Object.entries(v.pageHashes ?? {})) {
    const spec = contract.pages.find((p) => p.id === id)
    if (!spec || pageHash(contract, spec).hash !== h) stale.push(`page ${id} changed since the verdict`)
  }
  if (stale.length) {
    console.error(`fast gate ${fastGateRun} is stale or not clean: ${stale.join('; ')}`)
    process.exit(2)
  }
  fastGate = { run: path.resolve(fastGateRun), verdictAt: v.at ?? null, contractHash: v.contractHash }
} else if (scope.kind === 'full')
  console.error('note: no --fast-gate cited; the workflow expects a clean fast gate before a full run')
mkdirSync(path.join(out, 'shots'), { recursive: true })

/** The four axes from the contract's variants: desktop first, light before dark, then narrower. */
function axesFor(variantIds) {
  const vs = variantIds.map((id) => contract.variants.find((v) => v.id === id)).filter(Boolean)
  const widths = [...new Set(vs.map((v) => v.width))].sort((a, b) => b - a)
  return widths.flatMap((w) =>
    ['light', 'dark'].flatMap((t) => vs.filter((v) => v.width === w && v.theme === t))
  )
}
// Pictures follow visual.shots: a layout's representative page (or its counterpart in another
// locale), on the stages/variants/locales a rule names, for the lenses that consume it. No rule, no
// picture. Contracts without layouts/shots (older, and the test mocks) keep one picture per axis.
const stageOf = (variantId) => (contract.visual?.stages ?? []).find((s) => s.variants.includes(variantId))?.id
const layoutOf = (spec) =>
  spec.layout
    ? contract.layouts?.find((l) => l.id === spec.layout)
    : contract.layouts?.find((l) => l.pages.includes(spec.id))
function consumersFor(spec, variant, side) {
  if (!contract.visual?.shots || !contract.layouts) return ['reviewer']
  const layout = layoutOf(spec)
  if (!layout) return null
  const route = (id) => id.replace(/^[a-z]{2}-/, '')
  if (route(spec.id) !== route(layout.representative)) return null
  const stage = stageOf(variant.id)
  const out = new Set()
  for (const sh of contract.visual.shots) {
    if (sh.side !== side || !sh.stages.includes(stage)) continue
    if (sh.variants && !sh.variants.includes(variant.id)) continue
    if (!sh.locales.includes(spec.locale)) continue
    if (sh.ownSourceOnly && layout.hasSource === false) continue
    for (const c of sh.consumers) out.add(c)
  }
  return out.size ? [...out] : null
}
const compareStyle = (property, expected, actual) =>
  /font-family/.test(property)
    ? firstFamily(expected) === firstFamily(actual)
    : expected.endsWith('px') && actual.endsWith('px')
      ? Math.abs(parseFloat(expected) - parseFloat(actual)) <= 0.1
      : expected === actual

// How long the hover scan waits for a box to stop moving before it declares the element
// unmeasurable (`scan:hover-not-measured`, reason `unsettled`). 2000 ms is twice Tailwind's largest
// duration utility (`duration-1000`); every finite hover transition finishes well inside it, so the
// bound is hit only by motion that is pathological for a hover check -- chained transitions that keep
// restarting, or a finite animation still running from page load. Not a tuning knob: lowering it
// turns real settled measurements into skips, raising it only costs time on pages that already fail.
const HOVER_SETTLE_MS = 2000
let OFFSYSTEM_ABSENCE_SAID = false
const SOURCE_CACHE = new Map()
const browser = await launchBrowser()
// Recorded in visual.json: a reviewer must be able to see which renderer produced the evidence, and
// two runs are only comparable when this line reads the same in both (qa-browser.mjs says why).
const renderer = browserIdentity(browser)
/**
 * Cut what `page` shows into ≤ tileHeight px strips next to `rel` (shots/<name>/<n>.png); relative
 * paths. `png` is the full-page picture already taken of this page (the buffer `page.screenshot`
 * returns while writing the file); without one, a single full-page shot is taken here.
 *
 * The strips are cut from that one buffer (visual-lib pngRows/cutPng), not screenshotted again:
 * until 2026-09-15 each strip was its own `page.screenshot({ clip })`, i.e. N further renders per
 * axis (~6.4 s of a page's wall time against ~1.6 s for the full-page shot) that were only assumed
 * to show the same pixels as the picture beside them. Now they do by construction.
 *
 * The geometry is still read from the DOM, as before, so names, count and dimensions are what the
 * clip loop produced: measured 15/09 on 18 axes (78 tiles) the DOM's scrollHeight/clientWidth equalled
 * the picture's IHDR on every axis, so the two readings are the same numbers today; keeping the DOM
 * one means a reviewer's tooling that knows the old inventory still finds it. Where they would
 * disagree, a strip is clamped to the picture — a clip beyond the picture was pixels nobody could
 * account for, and a picture wider than the viewport (horizontal overflow) is cut at the viewport,
 * as the clip was.
 */
async function tilePage(page, rel, png) {
  const { total, width } = await page.evaluate(() => ({
    total: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    width: document.documentElement.clientWidth
  }))
  const rows = pngRows(png ?? (await page.screenshot({ fullPage: true })))
  const dir = rel.replace(/\.png$/, '')
  mkdirSync(path.join(out, dir), { recursive: true })
  const tiles = []
  for (let y = 0, n = 0; y < Math.min(total, rows.height); y += tileHeight, n++) {
    const t = `${dir}/${n}.png`
    writeFileSync(
      path.join(out, t),
      cutPng(rows, {
        y,
        height: Math.min(tileHeight, total - y, rows.height - y),
        width: Math.min(width, rows.width)
      })
    )
    tiles.push(t)
  }
  // 🔒 THE STRIPS ARE CLAMPED TO THE VIEWPORT AND STOP AT THE DOM'S HEIGHT; THE PICTURE IS
  // NEITHER. `cutPng` takes `Math.min(width, rows.width)`, so a page with HORIZONTAL OVERFLOW
  // keeps pixels in the full-page file that no strip carries — and the loop above stops at
  // `Math.min(total, rows.height)`, where `total` is read from the DOM AFTER the screenshot was
  // taken, so a page that got SHORTER in between leaves the bottom of the picture untiled.
  // Checking width alone said "covered" in both of those cases; it is checked in both axes here.
  // An empty strip list is never coverage, whatever the dimensions say.
  // The strips cover `Math.min(total, rows.height)` — that is literally the loop's bound — so the
  // picture is covered exactly when `total` reaches its height. Counting strips instead
  // (`tiles.length * tileHeight`) rounds UP past the last short strip and says covered when it is
  // not: total 1300, picture 1400, strip 1200 gives two strips, 2400 >= 1400, and 100px of the
  // picture that no strip carries.
  const covered = tiles.length > 0 && rows.width <= width && rows.height <= total
  return { tiles, fullWidthCovered: covered }
}
/** A frame file (png/jpg) shown at its natural size in a throwaway page, then tiled like a render. */
async function tileFrame(context, file, rel) {
  const p = await context.newPage()
  try {
    await p.goto(pathToFileURL(file).href)
    const size = await p.evaluate(() => {
      const i = document.querySelector('img')
      return i ? { w: i.naturalWidth, h: i.naturalHeight } : null
    })
    // No dimensions means nothing was tiled and nothing is known — `true` here would promise a
    // reader that zero strips carry the whole picture.
    if (!size?.w || !size?.h) return { tiles: [], fullWidthCovered: false }
    await p.setViewportSize({ width: size.w, height: Math.min(size.h, 4000) })
    return await tilePage(p, rel)
  } finally {
    await p.close()
  }
}
/** Measure one page on one axis: A screenshot · B interaction · C computed px. Returns the axis record. */
async function measureAxis(spec, variant) {
  const axis = {
    variant: variant.id,
    width: variant.width,
    theme: variant.theme,
    components: [],
    scans: {},
    findings: []
  }
  const exceptions = contract.design?.exceptions ?? []
  axis.accepted = []
  const F = (kind, detail) => {
    const finding = { ...detail, kind }
    // An exception silences a finding only when it names the kind, matches the element/rule, and
    // cites a decision (a reason alone is not approval): exceptions live in the contract, are
    // listed in the report, and never remove coverage.
    const hit = exceptions.find(
      (x) =>
        x.kind === kind &&
        x.decision &&
        x.reason &&
        [finding.element, finding.rule, finding.selector, finding.state].some(
          (v) => v && new RegExp(x.match ?? x.selector ?? '$^').test(v)
        )
    )
    if (hit) axis.accepted.push({ ...finding, exception: { reason: hit.reason, decision: hit.decision } })
    else axis.findings.push(finding)
  }
  const context = await browser.newContext({
    viewport: { width: variant.width, height: variant.height },
    deviceScaleFactor: 1,
    reducedMotion: variant.reducedMotion ?? 'reduce',
    colorScheme: variant.theme === 'dark' ? 'dark' : 'light'
  })
  await seedTheme(context, hook, variant.theme)
  const page = await context.newPage()
  try {
    await navigate(page, new URL(spec.path, site).href, {
      expectedStatus: spec.status ?? 200,
      identity: spec.identity
    })
    axis.theme_observed = await readTheme(page, hook)
    if (axis.theme_observed !== variant.theme)
      F('theme-not-applied', { expected: variant.theme, observed: axis.theme_observed })
    const examined = await examinedCount(page)
    axis.examined = examined
    if (examined < 20) F('page-did-not-render', { examined })
    // A. screenshot — only when a lens consumes it (visual.shots)
    axis.layout = layoutOf(spec)?.id ?? null
    axis.shotConsumers = consumersFor(spec, variant, 'site')
    axis.screenshot = axis.shotConsumers ? `shots/${spec.id}--${variant.id}.png` : null
    if (axis.screenshot) {
      // One render: the buffer written to the file is the one the tiles are cut from.
      const png = await page.screenshot({ path: path.join(out, axis.screenshot), fullPage: true })
      const cut = await tilePage(page, axis.screenshot, png)
      axis.tiles = cut.tiles
      axis.tilesCoverPicture = cut.fullWidthCovered
    }
    // C. computed px: rules + coverage (+ overflow)
    const ruleSpecs = (spec.rules ?? [])
      .map((id) => contract.design.rules.find((r) => r.id === id))
      .filter(Boolean)
    const measuredRules = []
    for (const r of ruleSpecs) {
      const properties = Object.keys(r.styles?.[variant.id] ?? {})
      // Contract selectors are Playwright locators (they may carry `>> nth=0`), so measure through the
      // locator and mark each element for the coverage pass that follows.
      const elements = await page
        .locator(r.selector)
        .evaluateAll((els, properties) => {
          const css = (p) => (p.startsWith('--') ? p : p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()))
          const pathOf = (e) => {
            const parts = []
            while (e && e.nodeType === 1 && e !== document.body) {
              let n = 1,
                s = e
              while ((s = s.previousElementSibling)) n++
              parts.unshift(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}:nth-child(${n})`)
              e = e.parentElement
            }
            return parts.join(' > ')
          }
          return els
            .filter((e) => e.getClientRects().length)
            .map((e) => {
              e.__vqa = e.__vqa || new Set()
              properties.forEach((p) => e.__vqa.add(p))
              const style = getComputedStyle(e),
                rect = e.getBoundingClientRect()
              return {
                path: pathOf(e),
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                styles: Object.fromEntries(properties.map((p) => [p, style.getPropertyValue(css(p))]))
              }
            })
        }, properties)
        .catch((e) => {
          F('rule-error', { rule: r.id, selector: r.selector, message: e.message.split('\n')[0] })
          return []
        })
      measuredRules.push({ id: r.id, selector: r.selector, elements })
    }
    const cap = { rules: measuredRules }
    for (const r of cap.rules) {
      const expected = contract.design.rules.find((x) => x.id === r.id).styles[variant.id] ?? {}
      if (!r.elements.length) {
        // `optional` rules describe a role a page may not have (chips, h3); a required rule that
        // matches nothing is a finding — the page lost a component or the selector rotted.
        if (!contract.design.rules.find((x) => x.id === r.id)?.optional)
          F('rule-no-visible-match', { rule: r.id, selector: r.selector })
        continue
      }
      for (const el of r.elements) {
        const deltas = Object.entries(expected)
          .filter(([p, v]) => !compareStyle(p, v, el.styles[p]))
          .map(([p, v]) => ({ property: p, expected: v, observed: el.styles[p] }))
        axis.components.push({
          rule: r.id,
          element: el.path,
          rect: el.rect,
          status: deltas.length ? 'FAIL' : 'PASS',
          deltas
        })
        for (const d of deltas) F('rule-mismatch', { rule: r.id, element: el.path, ...d })
      }
    }
    // C. two-sided diff against the source render of this page. A pair is one CSS for both sides,
    // {site, source} CSS, or {content: id}: the site side is that content entry's locator and the
    // source side is found by its `expected` text (attribute `text` only). Site selectors are
    // Playwright locators (they may carry `>> nth=0`), so they are read through the page.
    // Reference basis, said in the report: a rendered source (two-sided numbers), an exported frame
    // (the picture + the numbers declared in design.rules), or nothing but the output requirements and
    // the design system. A page without a reference is still measured — never "not applicable".
    const frame =
      sourceDir && spec.source?.[0] && /\.(png|jpe?g|webp|gif)$/i.test(spec.source[0])
        ? path.resolve(sourceDir, spec.source[0])
        : null
    if (frame) {
      axis.sourceConsumers = consumersFor(spec, variant, 'source')
      if (axis.sourceConsumers && !existsSync(frame)) F('reference-missing', { file: frame })
      axis.sourceScreenshot = axis.sourceConsumers && existsSync(frame) ? frame : null
      if (axis.sourceScreenshot) {
        const cut = await tileFrame(context, frame, `shots/${spec.id}--${variant.id}--source.png`)
        axis.sourceTiles = cut.tiles
        axis.sourceTilesCoverPicture = cut.fullWidthCovered
      }
      axis.parity = { basis: 'declared', reference: spec.source[0] }
    } else axis.parity = { basis: 'requirements-only' }
    if (sourceSite && contract.design?.parity && spec.source?.[0] && !frame) {
      const sel = contract.design.parity.selectors,
        props = contract.design.parity.properties ?? SNAPSHOT_PROPERTIES
      // `pages[].parity` (array of keys) narrows the pairs for a page whose source is a different
      // page type (a detail page measured against its list page shares chrome, not headings).
      //
      // 🔒 A NAME IN THAT LIST THAT `selectors` DOES NOT HAVE IS A CONTRACT ERROR, NOT A NARROWER
      // CHECK. The filter below only ever REMOVES pairs, so an unknown name simply matched nothing
      // and vanished — measured 2026-09-18 on the base template: 13 of its 31 pages narrow to
      // `headerCtaHover`, a key `design.parity.selectors` has never defined, so the header CTA's
      // hover state is parity-checked on no page at all while thirteen narrowing lists say it is.
      for (const k of Array.isArray(spec.parity) ? spec.parity : [])
        if (!(k in sel)) F('parity-selector-undeclared', { selector: k })
      const pairs = Object.entries(sel)
        .filter(([k]) => !Array.isArray(spec.parity) || spec.parity.includes(k))
        .map(([k, v]) => {
          if (typeof v === 'string') return [k, { site: v, source: { css: v } }]
          if (v.content) {
            const c = (spec.content ?? []).find((x) => x.id === v.content)
            if (!c || c.attribute !== 'text') return null
            return [k, { site: c.selector, source: { text: c.expected, tag: v.sourceTag } }]
          }
          return [
            k,
            {
              site: v.site,
              source: typeof v.source === 'string' ? { css: v.source } : v.source,
              hover: Boolean(v.hover)
            }
          ]
        })
        .filter(Boolean)
      const siteSnap = {}
      const unresolved = new Set()
      // One in-page pass for every pair first (`siteSnapshotOf` keeps the locator's element choice;
      // its header carries the reason: on the sibling business template the twelve per-pair locator
      // round trips cost 612 s of a 39-minute matrix, all of it waiting on selectors not on the page).
      // A key absent from `rest` is absent from the page, and absence is an ANSWER here -- the pair
      // is either a role this page does not have, or a real gap that `parity-not-measured` reports
      // below from the two sides disagreeing. Either way nothing is left to wait for.
      const selectorsOf = Object.fromEntries(pairs.map(([k, pr]) => [k, pr.site]))
      const rest = await page.evaluate(siteSnapshotOf, { selectors: selectorsOf, properties: props })
      const take = (k, pair, styles) => {
        if (!styles) return
        // A selector `siteSnapshotOf` cannot resolve is a CONTRACT error, not a missing element:
        // letting it fall through would make it indistinguishable from a role the page does not
        // have, which is the one thing absence must never be confused with here.
        if (styles.__unsupported) {
          F('parity-selector-unsupported', { selector: k, site: styles.__unsupported })
          unresolved.add(k)
          return
        }
        const { __tag, ...values } = styles
        siteSnap[k] = values
        if (pair.source.text && !pair.source.tag) pair.source.tag = __tag
      }
      for (const [k, pair] of pairs) {
        // `hover: true` pairs read the pointer state on both sides (nav items, buttons, links), and
        // only a real pointer produces it -- so those still cost a round trip, but only when the
        // element is actually there. An absent one used to pay `hover()`'s 2 s AND the read's 3 s.
        if (pair.hover && rest[k] && !rest[k].__unsupported) {
          await page
            .locator(pair.site)
            .first()
            .hover({ timeout: 2000 })
            .catch(() => {})
          await page.waitForTimeout(150)
          const hovered = await page.evaluate(siteSnapshotOf, {
            selectors: { [k]: pair.site },
            properties: props
          })
          await page.mouse.move(0, 0)
          take(k, pair, hovered[k])
          continue
        }
        take(k, pair, rest[k])
      }
      // The source is a STATIC document: for one (source file, variant) neither its selector
      // snapshot nor its image census can differ between two site pages that cite it. This contract
      // has 31 pages over 25 source files: of its 178 axes, 28 name a (source file, variant) an
      // earlier axis already measured (counted from qa.contract.json, 2026-09-17). Fewer than 28
      // are served -- the two conditions below are decided per axis at runtime, and a page that
      // wants the source picture or asks a content-keyed question opens the file itself.
      //
      // Two conditions keep a hit honest, and both are checked, not assumed:
      //   · the axis must want no source SCREENSHOT — that is decided per page (`consumersFor`), so
      //     an axis that needs the picture opens the page and takes it;
      //   · no pair may be content-keyed. `h1` and `lede` find the source element by THIS page's
      //     own expected text (`findOneSpec`), so their reading is a property of the page, not of
      //     the file, and an entry filled by another page would answer the wrong question.
      // A hit also has to COVER the keys this page asks for: a narrowed page must not be served an
      // entry that never measured the key it wants -- the runtime check below is what decides it,
      // so a contract whose pages narrow `parity` differently simply gets misses, never a wrong read.
      const cacheKey = `${spec.source[0]}|${variant.id}`
      axis.sourceConsumers = consumersFor(spec, variant, 'source')
      const prior = SOURCE_CACHE.get(cacheKey)
      // `covers` is the whole guard, and it is enough: a content-keyed pair is never written to an
      // entry (see the write below), and a key the contract declares as content-keyed is either
      // content-keyed for this page or dropped from `pairs` altogether when the page has no
      // matching content entry -- so such a key can never be in `prior.keys`. An extra
      // `!contentKeyed` term used to sit here; it could not be false while `covers` was true, and a
      // condition that can never decide anything reads as load-bearing to the next person.
      const served = prior && !axis.sourceConsumers && pairs.every(([k]) => prior.keys.has(k))
      let srcSnap, srcImages
      if (served) {
        // Same shape as a measured axis: `sourceScreenshot` stays a declared null rather than
        // vanishing from the report, because a key that is absent on some axes and null on others
        // is a difference a reader has to explain. And the reading is PROJECTED onto the keys this
        // page asked for -- an entry may hold more than a narrowed page wants, and handing over the
        // extras would put selectors in `parity.source` that this page never declared.
        axis.sourceReused = cacheKey
        axis.sourceScreenshot = null
        srcSnap = Object.fromEntries(
          pairs.map(([k]) => [k, prior.srcSnap[k]]).filter(([, v]) => v !== undefined)
        )
        srcImages = prior.srcImages
      } else {
        const ref = await context.newPage()
        try {
          const srcHook = contract.design.parity.sourceTheme
          const sourceUrl = new URL(spec.source[0].split('/').map(encodeURIComponent).join('/'), sourceSite)
            .href
          const prepare = async () => {
            await ref.goto(sourceUrl, { waitUntil: 'networkidle', timeout: 60000 })
            await ref.evaluate(() => document.fonts.ready).catch(() => {})
            if (srcHook)
              await ref.evaluate(
                (hooks) => {
                  for (const { selector, attribute, value } of hooks) {
                    const el = document.querySelector(selector)
                    if (el) value === null ? el.removeAttribute(attribute) : el.setAttribute(attribute, value)
                  }
                },
                // A source may key its theme off MORE THAN ONE signal, and they can do different work:
                // JA Kinetic colours text from `class` (t4-dark) but paints section surfaces from
                // `data-bs-theme`. Flipping one of them leaves a hybrid render — light page, dark band,
                // dark-on-dark heading — which reads on a tile exactly like a real defect of the site.
                // Declare every signal the source uses; a single object stays valid.
                (Array.isArray(srcHook) ? srcHook : [srcHook]).map((h) => ({
                  selector: h.selector,
                  attribute: h.attribute,
                  value: h.values?.[variant.theme] ?? null
                }))
              )
            // Scroll the whole document once before anything is measured or shot. A full-page
            // screenshot does not scroll, so `loading="lazy"` pictures below the fold are never
            // requested: measured 2026-09-17 on `pages/company/about.html`, 5, 6 and 6 of 11 images
            // were undecoded at this exact point on three loads, and 0 of 11 after this pass every
            // time. Reloading cannot fix that -- lazy stays lazy -- so the pass belongs here, inside
            // what an attempt re-does, rather than in the retry that answers a latched render.
            await ref.evaluate(async () => {
              const step = Math.max(200, innerHeight - 100)
              for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
                scrollTo(0, y)
                await new Promise((r) => setTimeout(r, 40))
              }
              scrollTo(0, 0)
            })
            // Scrolling only STARTS the requests. A flat wait after it decides readiness by the
            // clock rather than by the pictures, so a source served over a slow link reads as
            // broken, gets loaded again, and is reported as `source-not-rendered` -- a finding
            // about the network, printed as a finding about the design. Wait for the requests
            // instead, bounded, then fall through: a picture still undecoded after this is what
            // `sourcePending` is for, and the retry that follows is what answers a latched render.
            await ref.waitForLoadState('networkidle').catch(() => {})
            await ref.waitForTimeout(200)
          }
          // Ask whether the source is actually showing its pictures, and say so when it is not.
          // `prepare()` above already scrolls, which is what this template's lazy images need; the
          // loop is for a render whose end state is decided per LOAD rather than by waiting -- an
          // export whose picture component latches filled or unfilled (the sibling business
          // template does exactly that). Waiting cannot decide such a state, so the only honest
          // options are load again, or say the picture is not the design. Three is small on
          // purpose: a page that needs many tries is telling us something a finding should carry.

          // Plain `<img>` is this template's source shape. Selector and attribute are ONE decision,
          // not two: an export whose picture component marks itself ready declares both in
          // `design.source.rendered`. Taking the selector from `design.images.sourceSlot` while
          // leaving the attribute at its default mixes the two contracts and asks a custom element
          // whether it decoded -- which it never did, so every source page reads as pending.
          const rendered = { selector: 'img', attribute: null, ...contract.design.source?.rendered }
          let state = null
          for (let attempt = 1; attempt <= 3; attempt++) {
            await prepare()
            state = await ref.evaluate(sourcePending, rendered)
            axis.sourceLoads = attempt
            axis.sourceSlots = state.total
            if (!state.pending) break
          }
          // A page with no pictures at all is not a finding -- plenty of pages have none -- but the
          // count goes into the report either way, because "nothing was examined" and "everything
          // examined was ready" are the same silence otherwise.
          if (state?.pending)
            F('source-not-rendered', {
              page: spec.source[0],
              pending: state.pending,
              unmarked: state.unmarked,
              undecoded: state.undecoded,
              of: state.total,
              loads: axis.sourceLoads,
              examples: state.examples
            })
          // A. the source render on the same axis, next to the site's shot — when a lens consumes it
          axis.sourceScreenshot = axis.sourceConsumers ? `shots/${spec.id}--${variant.id}--source.png` : null
          let sourcePng = null
          if (axis.sourceScreenshot)
            sourcePng = await ref
              .screenshot({ path: path.join(out, axis.sourceScreenshot), fullPage: true })
              .catch(() => {
                axis.sourceScreenshot = null
                return null
              })
          if (axis.sourceScreenshot) {
            const cut = await tilePage(ref, axis.sourceScreenshot, sourcePng)
            axis.sourceTiles = cut.tiles
            axis.sourceTilesCoverPicture = cut.fullWidthCovered
          }
          const restSel = Object.fromEntries(
            pairs.filter(([, pr]) => !pr.hover).map(([k, pr]) => [k, pr.source])
          )
          srcSnap = await ref.evaluate(snapshotOf, { selectors: restSel, properties: props })
          for (const [k, pr] of pairs.filter(([, pr]) => pr.hover)) {
            const handle = await ref.evaluateHandle(findOneSpec, { spec: pr.source }).catch(() => null)
            const el = handle?.asElement()
            if (!el) continue
            await el.hover({ timeout: 2000 }).catch(() => {})
            await ref.waitForTimeout(150)
            srcSnap[k] = await el.evaluate((e, props) => {
              const cs = getComputedStyle(e)
              return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p) || '(none)']))
            }, props)
            await ref.mouse.move(0, 0)
          }
          // Pictures: the source page promised N; the site must show N decoded images and no placeholder.
          srcImages = await ref.evaluate(imageCensus, {
            scope: contract.design.images?.scope ?? 'main',
            slot: contract.design.images?.sourceSlot ?? 'image-slot[src]'
          })
          // Only the part taken WITHOUT page-specific input may be reused, but that part is worth
          // keeping even when this page also asked for content-keyed pairs -- and it usually does,
          // because the FIRST page to cite a source file is the unnarrowed one. Storing nothing in
          // that case left the cache empty for exactly the pages meant to hit it (measured on the
          // sibling business template: 32 of its 288 axes served instead of the 84 it allows).
          const shareable = pairs.filter(([, pr]) => pr.source?.text === undefined).map(([k]) => k)
          // A reading taken while the source was still showing placeholders is not something a later
          // axis may inherit: the finding stays on this axis, and a reused entry would carry none of it.
          if (!state?.pending)
            SOURCE_CACHE.set(cacheKey, {
              srcSnap: Object.fromEntries(
                shareable.filter((k) => srcSnap[k] !== undefined).map((k) => [k, srcSnap[k]])
              ),
              srcImages,
              keys: new Set(shareable)
            })
        } finally {
          await ref.close()
        }
      }
      const imgCfg = contract.design.images ?? {}
      const siteImages = await page.evaluate(imageCensus, {
        scope: imgCfg.scope ?? 'main',
        placeholder: imgCfg.placeholder ?? null
      })
      axis.images = {
        source: srcImages.images,
        site: siteImages.images,
        placeholders: siteImages.placeholders.length
      }
      // `pages[].images: 'placeholders'` — a derived page's count is data-driven; placeholders still fail.
      if (spec.images !== 'placeholders' && siteImages.images < srcImages.images)
        F('image-missing', {
          expected: srcImages.images,
          observed: siteImages.images,
          sourceSlots: srcImages.slots.slice(0, 12)
        })
      for (const ph of siteImages.placeholders) F('image-placeholder', ph)
      axis.parity = { basis: 'two-sided', site: siteSnap, source: srcSnap, pairs: pairs.length }
      // a pair absent on BOTH sides is a role this page does not have; absent on one side is a real gap
      // A pair whose site selector could not be RESOLVED is neither: the page was never asked, so
      // calling it a one-sided absence would report the same contract error twice, the second time
      // under a kind that means something else.
      const missing = pairs
        .map(([k]) => k)
        .filter((k) => !unresolved.has(k) && Boolean(siteSnap[k]) !== Boolean(srcSnap[k]))
      for (const k of missing)
        F('parity-not-measured', {
          selector: k,
          site: Boolean(siteSnap[k]),
          source: Boolean(srcSnap[k])
        })
      const both = Object.fromEntries(
        Object.keys(siteSnap)
          .filter((k) => srcSnap[k])
          .map((k) => [k, siteSnap[k]])
      )
      if (!Object.keys(both).length)
        F('parity-nothing-measured', {
          site: Object.keys(siteSnap).length,
          source: Object.keys(srcSnap).length
        })
      else {
        const d = diffSnapshots(both, Object.fromEntries(Object.keys(both).map((k) => [k, srcSnap[k]])), {
          hexTolerance: contract.design.parity.hexTolerance ?? 8,
          pxTolerance: contract.design.parity.pxTolerance ?? 0.1
        })
        axis.parity.checked = d.checked
        for (const m of d.mismatches)
          F('parity-mismatch', {
            selector: m.selector,
            property: m.property,
            site: m.a,
            source: m.b,
            reason: m.reason
          })
      }
    }
    // coverage runs AFTER rules and parity so an element either side measured counts as classified
    Object.assign(
      cap,
      await page.evaluate(captureDesign, {
        rules: [],
        coverage: contract.design.coverage ?? [],
        identity: spec.identity,
        tokens: contract.design.tokens ?? []
      }),
      { rules: measuredRules }
    )
    if (cap.scrollWidth > cap.clientWidth)
      F('horizontal-overflow', { scrollWidth: cap.scrollWidth, clientWidth: cap.clientWidth })
    if (!cap.fontsReady) F('fonts-not-ready', {})
    axis.coverage = { examined: cap.coverageCount, unclassified: cap.unclassified }
    for (const u of cap.unclassified) F('unclassified-element', u)
    // mechanical scanners: dark-only ones on dark axes, contrast/seam/hover everywhere
    const run = async (name, fn, arg) => {
      if (!scans.includes(name)) return
      const r = Array.isArray(arg)
        ? await page.evaluate(new Function('a', `return (${fn.toString()})(...a)`), arg)
        : await page.evaluate(fn, arg)
      axis.scans[name] = r.length
      for (const { kind: k, ...rest } of r) F(`scan:${k ?? name}`, rest)
    }
    if (variant.theme === 'dark') {
      await run('white', scanWhiteSurfaces)
      await run('darktext', scanDarkText)
      await run('border', scanBrightBorders, [borderLuma, contract.design?.accentBorders ?? []])
    }
    await run('contrast', scanContrast, contrastMin)
    await run('seam', scanSeams)
    // design system: colours, text sizes, radii outside the declared sets (elements no rule measured)
    // 🔒 A SCAN THAT DID NOT RUN IS NOT A SCAN THAT PASSED. `designSystem` is the off-system
    // scanner's whole input — palette, type scale, radii, scope — and `build-qa-contract.mjs`
    // writes it on every build. A contract without it therefore predates that, or was hand-edited;
    // either way the scan silently did not happen. Measured 2026-09-18: the base template's
    // contract has no `designSystem`, so `scan:off-system` had never run on any of its 186 axes,
    // and nothing anywhere said so. Said once per run, not once per axis.
    if (contract.designSystem) await run('offsystem', scanOffSystem, [contract.designSystem, variant.theme])
    else if (scans.includes('offsystem') && !OFFSYSTEM_ABSENCE_SAID) {
      OFFSYSTEM_ABSENCE_SAID = true
      console.error(
        'off-system scan: the contract declares no `designSystem`, so colours, text sizes and radii outside the system are NOT checked on any axis of this run. Rebuild the contract (build-qa-contract.mjs) to restore it.'
      )
    }
    // B. interaction: hover must not move the box
    if (scans.includes('hover')) {
      const tagged = await page.evaluate(tagInteractive, DEFAULT_INTERACTIVE)
      // `scans.hover` is the number a reviewer reads as "N interactive elements were hovered", so
      // it counts elements MEASURED -- both rects taken on a settled box -- not elements tagged.
      // It used to be `tagged.length`, set before the loop, while three `continue`s below dropped
      // elements in silence: an element hidden by the time the pointer got there (a
      // dismiss-on-interaction bar), one the pointer could not reach, one whose tag vanished. Each
      // skip is now `scan:hover-not-measured`, the shape `parity-not-measured` has for a pair one
      // side lacks: a plain finding, so it fails the page -- an element the scan could not examine
      // is not a pass, and the contract's exceptions can accept a known one by `element`.
      let measured = 0
      for (const t of tagged) {
        const el = page.locator(`[data-vqa="${t.id}"]`).first()
        const skip = (reason, extra = {}) =>
          F('scan:hover-not-measured', { element: t.selector, text: t.text, reason, ...extra })
        const unsettled = (r) => skip(r.reason, r.animations ? { animations: r.animations } : {})
        // Rest side, one round trip: scroll into view, wait for motion on the element's chain to
        // end, read the box and the scroll offset it was read at. `hover()` scrolls on its own (with
        // `force` it skips the visibility and stability checks, not the scroll), and lands on the
        // same offset because both centre-if-needed -- so the explicit Playwright scroll that used
        // to precede this read only paid for a two-frame stability wait and a CDP round trip
        // (72 ms of a 195 ms element, measured 15/09; see `settledRect` for the numbers and for why
        // reading every rest rect in one batch up front was not the answer).
        // The pointer is still on the PREVIOUS target, and a hover rule does not have to act on the
        // element under the pointer: `.card:hover .secondary { width: 140px }` is ordinary markup.
        // Reading a rest state then reads an already-hovered box and the two reads agree. Measured
        // 2026-09-17 on a card holding two links: the second read `rest w=156, hover w=156` and
        // produced no finding, hiding an 80 px change. Park the pointer first; the settle inside the
        // rest read then waits for whatever the previous hover started to unwind.
        await page.mouse.move(0, 0)
        // The pointer is still on the PREVIOUS target, and a hover rule does not have to act on the
        // element under the pointer: `.card:hover .secondary { width: 140px }` is ordinary markup.
        // Reading a rest state then reads an already-hovered box and the two reads agree. Measured
        // 2026-09-17 on a card holding two links: the second read `rest w=156, hover w=156` and
        // produced no finding, hiding an 80 px change. Park the pointer first; the settle inside the
        // rest read then waits for whatever the previous hover started to unwind.
        await page.mouse.move(0, 0)
        const rest = await page.evaluate(settledRect, [t.id, HOVER_SETTLE_MS, { scrollIntoView: true }])
        if (!rest.settled) {
          unsettled(rest)
          continue
        }
        try {
          await el.hover({ timeout: 1500, force: true })
        } catch {
          skip('hover-failed')
          continue
        }
        // Floor, then settle. The 60 ms floor is what the sample used to be and is kept for the
        // element with no animation at all: the hover style lands at the next style pass, a JS
        // hover handler runs in the event task, and three to four frames at 60 Hz cover both plus a
        // `setTimeout(0)`-deferred one. It is a floor, not the sample: `settledRect` then waits
        // for whatever is still animating on the element, its subtree or its ancestors (the test
        // fixture's 400 ms `translateY` transition costs 400 ms here, and that is the point), and
        // reports a box that will not settle within HOVER_SETTLE_MS instead of measuring mid-motion.
        // Measured 15/09 on the sibling business template's en-home and en-about: none of its 13 hovered
        // per axis starts an animation, so the settle step costs one `evaluate` round trip (2-7 ms)
        // per element and the two pages' wall time is unchanged within run-to-run noise (±4 s).
        await page.waitForTimeout(60)
        let hov = await page.evaluate(settledRect, [t.id, HOVER_SETTLE_MS, {}])
        if (!hov.settled) {
          unsettled(hov)
          continue
        }
        // Both boxes are viewport rects, and they are only comparable at ONE scroll offset: an
        // in-flow box shifts by the scroll delta, a sticky or fixed one does not, and nothing in a
        // rect says which it is. The rest read scrolled first so that `hover()` has nothing left to
        // scroll; if it scrolled anyway (its retries scroll `block: end/center/start` when the box
        // is still not in the viewport -- clipped by an overflow container, taller than the
        // viewport), the two reads are in different frames and the element was not measured. This
        // used to be reported as a hover jump of exactly the scroll delta.
        if (hov.scroll.x !== rest.scroll.x || hov.scroll.y !== rest.scroll.y) {
          skip('scrolled', { scroll: `${rest.scroll.x},${rest.scroll.y} → ${hov.scroll.x},${hov.scroll.y}` })
          continue
        }
        const movedKeys = (h) =>
          ['x', 'y', 'width', 'height'].filter((k) => Math.abs(rest.rect[k] - h.rect[k]) > 1)
        let moved = movedKeys(hov)
        if (moved.length) {
          // A box that differs is either one the hover moved (it now reads the same on two
          // consecutive frames) or one that was moving anyway with nothing in `getAnimations()`
          // to wait on (script-driven, frame by frame). The Playwright scroll's stability wait
          // used to sort those out BEFORE the rest read, at two frames per element for every
          // element; `still` asks the same question only when there is a difference to explain.
          hov = await page.evaluate(settledRect, [t.id, HOVER_SETTLE_MS, { still: true }])
          if (!hov.settled) {
            unsettled(hov)
            continue
          }
          if (hov.scroll.x !== rest.scroll.x || hov.scroll.y !== rest.scroll.y) {
            skip('scrolled', {
              scroll: `${rest.scroll.x},${rest.scroll.y} → ${hov.scroll.x},${hov.scroll.y}`
            })
            continue
          }
          moved = movedKeys(hov)
        }
        measured++
        if (moved.length)
          F('scan:hover-jump', {
            element: t.selector,
            text: t.text,
            moved: Object.fromEntries(
              moved.map((k) => [k, `${+rest.rect[k].toFixed(1)} → ${+hov.rect[k].toFixed(1)}`])
            )
          })
      }
      axis.scans.hover = measured
      await page.mouse.move(0, 0)
    }
  } catch (e) {
    F('axis-error', { message: e.message })
  } finally {
    await context.close()
  }
  // B. interaction: mega-menu travel on the widest axis, per state, with a real pointer
  const states = (spec.states ?? []).filter((s) => s !== 'default' && contract.interactions?.[s])
  if (states.length && variant.width === Math.max(...axesFor(spec.variants).map((v) => v.width))) {
    for (const state of states) {
      // One file per state: mega-hover.mjs writes the whole file, so a shared name would leave only
      // the last state's row and silently hide the others (measured on Tracy Base: 3 states, 1 row).
      const jsonFile = path.join(out, `mega--${spec.id}--${variant.id}--${state}.json`)
      try {
        await execFileP(process.execPath, [
          path.join(HERE, 'mega-hover.mjs'),
          new URL(spec.path, site).href,
          '--contract',
          contractFile,
          '--state',
          state,
          '--viewport',
          String(variant.width),
          '--theme',
          variant.theme,
          '--json',
          jsonFile,
          '--config',
          configFile
        ])
      } catch (e) {
        // Exit 1 is the child's own "I ran and found something", and it writes its JSON in that
        // case. Any other code is a failure to run at all.
        if (e.code !== 1) F('mega-error', { state, message: e.message })
      }
      // 🔒 NO JSON IS NO MEASUREMENT, WHATEVER THE EXIT CODE SAID. mega-hover builds its browser and
      // reads the theme hook BEFORE its own try block, so a bad `qa.theme` throws there: Node exits
      // 1 -- indistinguishable from "ran and found something" -- and nothing was written. The whole
      // interaction check for this page, state and axis then vanished with no finding and no trace.
      if (!existsSync(jsonFile))
        F('mega-error', {
          state,
          message: `mega-hover wrote no ${path.basename(jsonFile)}: it failed before it could measure anything (run it by hand on this page to see why)`
        })
      if (existsSync(jsonFile))
        for (const row of JSON.parse(readFileSync(jsonFile, 'utf8')).rows) {
          axis.mega = axis.mega ?? []
          axis.mega.push(row)
          if (row.verdict !== 'PASS')
            F('mega-menu', { state: row.state, verdict: row.verdict, steps: row.steps })
        }
    }
  }
  return axis
}

// ───────────── stages: light desktop → light responsive → dark desktop → dark responsive ─────────────
// A stage runs only when the previous one is clean (Lee, 2026-09-14): light done well leaves dark
// with little to fix, and nobody reviews 384 pictures at once. `--stage a,b` runs those stages
// regardless of order (the iteration loop); without it every stage runs in order and the run stops
// at the first failing stage unless `--all-stages`.
const stagesAll = contract.visual?.stages ?? [{ id: 'all', variants: contract.variants.map((v) => v.id) }]
const stageArg = (opt('--stage', '') || '').split(',').filter(Boolean)
const allStages = argv.includes('--all-stages')
for (const id of stageArg)
  if (!stagesAll.some((s) => s.id === id)) {
    console.error(`unknown stage ${id}; contract has ${stagesAll.map((s) => s.id).join(', ')}`)
    process.exit(2)
  }
const stagesToRun = stageArg.length ? stagesAll.filter((s) => stageArg.includes(s.id)) : stagesAll
// `--reuse a,b,c`: earlier runs, first match wins — typically the final run of each stage.
const reuseDirs = (opt('--reuse', '') || '')
  .split(',')
  .filter(Boolean)
  .map((d) => path.resolve(d))
// ── verdict inputs that live in no file ───────────────────────────────────────────────────────────
// pageHash covers everything a checkout can recompute: the tree, the seed, the contract, the tools.
// The values below reach findings too but exist only for the length of one process — flags, the
// theme hook a config resolved to, whether a source was cited, which binary drew the pixels — so the
// only way to compare two runs on them is for each run to WRITE them down (visual.json `inputs`) and
// for --reuse to read them back. Measured 2026-09-15: without this, evidence taken with one scan
// threshold, or one Chromium, stood in for a run with another, and nothing in the report said so.
// Each entry names the verdict it moves. Anything that moves none — --tile-height, --out, the site
// origin, --pages/--stage/--scope, timestamps — is left out on purpose: put it in and reuse never
// fires, and the fix loop pays full price for a change that alters no finding (F15 relies on this).
const verdictInputs = {
  // which scanners ran: every `scan:*` kind and the hover-jump probe exist only when named here;
  // sorted, so `a,b` and `b,a` are the same run
  scans: [...new Set(scans)].sort(),
  contrastMin, // scan:contrast threshold
  borderLuma, // scan:bright-border threshold
  // seeds every dark axis (theme-not-applied, and the dark-only scanners read what it produced);
  // contract.design.theme is in pageHash, a hook that came from --config is not
  themeHook: hook,
  // parity-*, image-missing/placeholder and reference-missing exist only when a source is cited.
  // Presence, not the origin: the reference CONTENT is already hashed per page (`page source`).
  source: { site: Boolean(sourceSite), dir: Boolean(sourceDir) },
  // the binary that drew the pixels and the Playwright that drove it (hover, waits, screenshots).
  // `launch`/executablePath/channel say how the binary was chosen — the same version renders the
  // same, and a path is one machine's — so they stay in `browser`, not here.
  renderer: { engine: renderer.engine, version: renderer.version, playwright: renderer.playwright }
}
/** What differs between a prior run's recorded inputs and this run's — one line per key, in the shape the fast-gate stale list uses. */
function inputDrift(prior, current) {
  if (!prior) return ['that run recorded no verdict inputs (older visual-qa); measure again']
  return Object.keys(current)
    .filter((k) => JSON.stringify(prior[k]) !== JSON.stringify(current[k]))
    .map((k) => `${k}: ${JSON.stringify(prior[k])} → ${JSON.stringify(current[k])}`)
}
const priors = reuseDirs.map((dir) => {
  const f = path.join(dir, 'visual.json')
  if (!existsSync(f)) {
    console.error(`--reuse ${dir}: no visual.json there`)
    process.exit(2)
  }
  const report = JSON.parse(readFileSync(f, 'utf8'))
  // A prior whose inputs differ is declined for EVERY page, and says so once, here — the page loop
  // below then measures. Declining is not an error (the fix loop passes --reuse routinely), but a
  // silent decline would look exactly like a slow run, so the reason is printed and kept in the report.
  const stale = inputDrift(report.inputs, verdictInputs)
  if (stale.length) console.error(`--reuse ${dir}: declined — ${stale.join('; ')}`)
  return { dir, report, stale }
})
const caseVariants = new Map(scope.plan ? scope.plan.cases.map((c) => [c.page, c.variants]) : [])
const specs = contract.pages.filter((spec) =>
  scope.kind === 'fast-gate' ? caseVariants.has(spec.id) : !only.length || only.includes(spec.id)
)
const pageReports = new Map()
const stageReports = []
const summary = {
  pages: 0,
  axes: 0,
  components: 0,
  findings: 0,
  distinct: 0,
  unclassified: 0,
  failedPages: [],
  accepted: 0,
  reused: 0
}
// 🔒 `findings` IS A SUM OVER AXES, AND ON ITS OWN IT MISLEADS — in the direction of panic. A defect
// in shared chrome is counted once per axis and once per page: one wrong header link is 48 pages ×
// 4 dark axes = 192 rows. `distinct` counts (kind, element, rule) triples — the thing a fix addresses;
// `axis` is deliberately excluded: the same defect on light and dark is one thing to fix, not two.
const distinctKeys = new Set()
/**
 * What makes two findings the SAME fix, for the `(N distinct)` figure a reviewer reads first.
 *
 * This used to be `${kind}|${f.element}|${f.rule}`, and only five of the twenty-one kinds carry
 * either field. Every other kind — including `parity-mismatch`, the two-sided computed-pixel diff
 * that produces most of the volume — hashed to `kind|undefined|undefined`, so two mismatches on two
 * selectors on two pages counted as ONE distinct fix. The number looked right on `rule-mismatch`
 * and was meaningless everywhere else, which is worse than an obviously broken number.
 *
 * The fields below are the ones the payloads actually carry. `where` is what the finding is about;
 * `what` is which property of it. A kind carrying neither (a whole-page verdict like
 * `page-did-not-render` or `horizontal-overflow`) is correctly one fix per page, and the page id is
 * already in the key the caller builds around this.
 */
const distinctKey = (f) => {
  const where =
    f.element ?? f.selector ?? f.file ?? f.page ?? (Array.isArray(f.elements) ? f.elements.join(' + ') : null)
  const what = f.rule ?? f.property ?? f.reason ?? null
  return `${f.kind}|${where ?? ''}|${what ?? ''}`
}
for (const spec of specs) {
  const { hash, parts } = pageHash(contract, spec)
  pageReports.set(spec.id, { id: spec.id, path: spec.path, hash, hashParts: parts, axes: [], findings: [] })
}
try {
  for (const stage of stagesAll) {
    const st = {
      id: stage.id,
      variants: stage.variants,
      pages: 0,
      axes: 0,
      findings: 0,
      reused: 0,
      status: 'not-run'
    }
    stageReports.push(st)
    if (!stagesToRun.includes(stage)) {
      st.status = 'skipped'
      continue
    }
    const previousFailed = stageReports.some((x) => x !== st && x.status === 'fail')
    if (previousFailed && !allStages && !stageArg.length) {
      st.status = 'not-run'
      st.reason = 'an earlier stage failed; fix it and run again'
      continue
    }
    for (const spec of specs) {
      const pageReport = pageReports.get(spec.id)
      const variants = axesFor(caseVariants.get(spec.id) ?? spec.variants).filter((v) =>
        stage.variants.includes(v.id)
      )
      if (!variants.length) continue
      st.pages++
      // Reuse: the prior run measured this page with the same hash on every axis this stage needs.
      let prevAxes = null,
        reuseDir = null
      for (const { dir, report: pr, stale } of priors) {
        if (stale.length) continue // inputs differ — said once above, for the whole run
        const prev = pr.pages?.find((p) => p.id === spec.id && p.hash === pageReport.hash)
        const axes = prev ? variants.map((v) => prev.axes.find((a) => a.variant === v.id)) : null
        if (axes && axes.every(Boolean)) {
          prevAxes = axes
          reuseDir = dir
          break
        }
      }
      if (prevAxes) {
        for (const a of prevAxes) {
          // Evidence is referenced, not copied: a second copy of the same picture is disk garbage.
          const axis = { ...a, measured: 'reused', reusedFrom: a.reusedFrom ?? reuseDir }
          pageReport.axes.push(axis)
          pageReport.findings.push(...axis.findings.map((f) => ({ ...f, axis: axis.variant })))
          for (const f of axis.findings) distinctKeys.add(distinctKey(f))
          st.axes++
          st.findings += axis.findings.length
          st.reused++
          summary.axes++
          summary.reused++
          summary.accepted += axis.accepted?.length ?? 0
          summary.components += axis.components.length
          summary.findings += axis.findings.length
          summary.unclassified += axis.coverage?.unclassified?.length ?? 0
          console.log(
            `same ${spec.id} ${axis.variant} (reused from ${reuseDir}) findings=${axis.findings.length}`
          )
        }
        continue
      }
      for (const variant of variants) {
        const axis = await measureAxis(spec, variant)
        axis.measured = 'now'
        axis.stage = stage.id
        st.axes++
        st.findings += axis.findings.length
        summary.axes++
        summary.accepted += axis.accepted.length
        summary.components += axis.components.length
        summary.findings += axis.findings.length
        summary.unclassified += axis.coverage?.unclassified?.length ?? 0
        pageReport.axes.push(axis)
        pageReport.findings.push(...axis.findings.map((f) => ({ ...f, axis: variant.id })))
        for (const f of axis.findings) distinctKeys.add(distinctKey(f))
        console.log(
          `${axis.findings.length ? 'FAIL' : 'ok  '} ${spec.id} ${variant.id} components=${axis.components.length} unclassified=${axis.coverage?.unclassified?.length ?? '-'} findings=${axis.findings.length}`
        )
      }
    }
    st.status = st.findings ? 'fail' : 'pass'
    console.log(
      `== stage ${st.id}: ${st.status} (pages ${st.pages}, axes ${st.axes}, reused ${st.reused}, findings ${st.findings})`
    )
  }
} finally {
  await browser.close()
}
const pages = [...pageReports.values()].filter((p) => p.axes.length)
summary.pages = pages.length
summary.failedPages = pages.filter((p) => p.findings.length).map((p) => p.id)
summary.stages = Object.fromEntries(stageReports.map((s) => [s.id, s.status]))
// Settle `distinct` BEFORE the report object is serialised: `report.summary` is this same object by
// reference and visual.json is written below — assigning after that write leaves the artifact saying
// `distinct: 0` for ever while stdout says the truth.
summary.distinct = distinctKeys.size
const report = {
  schemaVersion: 1,
  at: new Date().toISOString(),
  site,
  sourceSite: sourceSite ?? null,
  sourceDir: sourceDir ? path.resolve(sourceDir) : null,
  contract: contractFile,
  contractHash: contractHash(contract),
  inputs: verdictInputs,
  browser: renderer,
  scope,
  fastGate,
  method:
    'screenshot + interaction + computed-px, staged (light desktop → light responsive → dark desktop → dark responsive); a stage runs only after the previous one is clean; a page whose hash is unchanged reuses its earlier evidence',
  stages: stageReports,
  summary,
  pages
}
writeFileSync(path.join(out, 'visual.json'), JSON.stringify(report, null, 2) + '\n')
if (scope.plan) writeFileSync(path.join(out, 'FAST-GATE-PLAN.md'), planMarkdown(scope.plan))
// 🔒 TRIAGE FIRST — 1,302 findings were 17 problems. A finding list is one row per SIGHTING,
// so one undeclared selector arrives as 70 rows that a reader must collapse
// by hand before deciding anything; measured 18/09 on base, 1,302 rows grouped to 17 KEYS — and
// reading those 17 is what showed that nine of them name the same shape of problem (selectors
// listed in pages[].parity that nothing measures). Seventeen keys is not a claim of seventeen
// independent causes; it is a surface small enough that a reader can look for the causes. Accepted findings are grouped
// beside them ON PURPOSE: they are the discrepancies a cited exception is excusing, and a reader
// who never sees them cannot tell whether the exception still excuses what it was written for.
const groupRows = (rows) => {
  const g = new Map()
  for (const { page, finding } of rows) {
    const k = distinctKey(finding)
    if (!g.has(k)) g.set(k, { finding, pages: new Set(), axes: new Set(), n: 0 })
    const e = g.get(k)
    e.n++
    e.pages.add(page)
    if (finding.axis) e.axes.add(finding.axis)
  }
  return [...g.values()].sort((a, b) => b.n - a.n)
}
const whereOf = (f) =>
  f.element ?? f.selector ?? f.file ?? f.page ?? (Array.isArray(f.elements) ? f.elements.join(' + ') : '')
// 🔒 THE TAIL, AND THE SECOND HALF OF THE KEY. Both halves of this line were wrong when first
// written, and the output said so: two `unclassified-element` rows printed IDENTICALLY because a
// CSS path differs at its END and the first 60 characters were being kept (the component table
// above has always used `slice(-60)` for exactly this reason), and four `parity-mismatch` rows
// printed identically because `distinctKey` separates them by `property` — colour, background,
// size, letter-spacing — and the row was dropping it. A triage table whose rows a reader cannot
// tell apart is the same failure as the corpus it replaced, in fewer bytes.
const whatOf = (f) => f.rule ?? f.property ?? f.reason ?? '—'
// Truncating to 60 characters is a readability choice that can make two DIFFERENT groups render
// as one identical row — a CSS path usually differs at its tail, but two siblings can differ at an
// ancestor instead (`.left > … > h2` and `.right > … > h2`). Neither end of the string is safe on
// its own. So the truncation is a default, not a rule: where it would collide, the full `where` is
// printed. Since (kind, where, what) IS the grouping key, printing all three in full cannot leave
// two rows alike — which is the one property this table has to have.
const triageRows = (groups) => {
  const cell = (e) => ({
    kind: e.finding.kind,
    short: String(whereOf(e.finding)).slice(-60),
    full: String(whereOf(e.finding)),
    what: whatOf(e.finding),
    e
  })
  const cells = groups.map(cell)
  const collisions = new Set()
  const seen = new Set()
  for (const c of cells) {
    const k = `${c.kind}|${c.short}|${c.what}`
    if (seen.has(k)) collisions.add(k)
    seen.add(k)
  }
  return cells.map((c) => {
    const where = collisions.has(`${c.kind}|${c.short}|${c.what}`) ? c.full : c.short
    return `| ${c.kind} | \`${where}\` | ${c.what} | ${c.e.n} | ${c.e.pages.size} | ${[...c.e.axes].sort().join(', ')} |`
  })
}
const openGroups = groupRows(pages.flatMap((p) => p.findings.map((f) => ({ page: p.id, finding: f }))))
const acceptedGroups = groupRows(
  pages.flatMap((p) =>
    p.axes.flatMap((a) => (a.accepted ?? []).map((f) => ({ page: p.id, finding: { ...f, axis: a.variant } })))
  )
)
const triage = [
  '',
  '## Triage — every finding grouped; read this before anything else',
  '',
  `${summary.findings} finding(s) in ${openGroups.length} group(s); ${acceptedGroups.length} group(s) of accepted exception.`,
  '',
  '| Kind | Where | What | Sightings | Pages | Axes |',
  '|---|---|---|---:|---:|---|',
  ...(openGroups.length ? triageRows(openGroups) : ['| — | none | — | 0 | 0 | — |']),
  '',
  '### Accepted by a cited exception (still discrepancies — check the citation still fits)',
  '',
  '| Kind | Where | What | Sightings | Pages | Axes |',
  '|---|---|---|---:|---:|---|',
  ...(acceptedGroups.length ? triageRows(acceptedGroups) : ['| — | none | — | 0 | 0 | — |'])
]
const md = [
  `# Visual QA — ${site} — ${report.at}`,
  '',
  `Scope: **${scope.kind}**${scope.kind === 'fast-gate' ? ' — see FAST-GATE-PLAN.md; a fast gate never passes the visual gate' : scope.kind === 'targeted-debug' ? ` — pages ${scope.pages.join(', ')}; a subset never passes the visual gate` : ''}`,
  '',
  `Pages ${summary.pages} · axes ${summary.axes} · components ${summary.components} · unclassified ${summary.unclassified} · findings ${summary.findings} (${summary.distinct} distinct)`,
  ...triage,
  '',
  'Method: stages in order (light desktop → light responsive → dark desktop → dark responsive), a stage only after the previous one is clean; per axis A screenshot (site + source) · B interaction (hover jump, mega travel, Escape/focus) · C computed px (rules, coverage, two-sided diff). Pictures per layout (visual.shots, with consumers) are listed in index.json; each QA lens writes notes/<lens>.md, the machine writes notes/machine.md; `visual-review` passes on machine-checked conditions (qa.mjs), not a signature.',
  '',
  '| Stage | Status | Pages | Axes | Reused | Findings |',
  '|---|---|---:|---:|---:|---:|',
  ...stageReports.map(
    (s) =>
      `| ${s.id} | ${s.status}${s.reason ? ` (${s.reason})` : ''} | ${s.pages} | ${s.axes} | ${s.reused} | ${s.findings} |`
  ),
  '',
  '| Page | Axis | Component | Status | Deltas |',
  '|---|---|---|---|---|'
]
// 🔒 THE COMPONENT TABLE PRINTS EXCEPTIONS, NOT THE CORPUS. Measured 18/09 on base: all 12,898
// rows were `PASS` with no deltas, and printing them made this file 1.79 MB — of which 1.53 MB
// (85%) said only "this was checked and it matched". A digest that large is not read, and a
// digest nobody reads is the same failure as a gate nobody can fail. The rows stay in
// visual.json, which is where `--reuse` and any run-to-run comparison read them from; what
// changes is only what a READER is handed first. The count is kept so "0 exceptions of 12,898"
// cannot be mistaken for "nothing was measured".
// 🔒 A ROW IS NOISE ONLY IF IT SAYS SO IN A WAY THIS WRITER RECOGNISES. These producers write
// `PASS`; the WordPress sibling writes `ok` for the same thing. Matching one spelling and
// swallowing the other is how a filter quietly stops filtering — measured 18/09, the first
// version of this check was written against `PASS` alone and did nothing at all on WordPress,
// which reported "0 further component(s)" while printing its whole corpus. Anything NOT in this
// set is printed, so a status added later arrives in front of a reader instead of vanishing.
const CLEAN_STATUS = new Set(['PASS', 'ok'])
let passRows = 0
for (const p of pages)
  for (const a of p.axes)
    for (const c of a.components) {
      if (CLEAN_STATUS.has(c.status) && !(c.deltas ?? []).length) {
        passRows++
        continue
      }
      md.push(
        `| ${p.id} | ${a.variant} | ${c.rule} · \`${c.element.slice(-60)}\` | ${c.status} | ${c.deltas.map((d) => `${d.property}: ${d.expected} → ${d.observed}`).join('; ') || '—'} |`
      )
    }
md.push(
  '',
  `${passRows} further component(s) matched with no delta and are not printed here; every one of them is in \`visual.json\` under \`pages[].axes[].components\`.`
)
md.push('', '## Accepted exceptions (cited decisions)', '')
for (const p of pages)
  for (const a of p.axes)
    for (const f of a.accepted ?? [])
      md.push(
        `- \`${p.id}\` ${a.variant} — ${f.kind} ${f.element ?? f.rule ?? ''}: ${f.exception.reason} (${f.exception.decision})`
      )
if (!pages.some((p) => p.axes.some((a) => a.accepted?.length))) md.push('none')
md.push('', '## Findings', '')
for (const p of pages)
  for (const f of p.findings)
    md.push(
      `- \`${p.id}\` ${f.axis} — **${f.kind}** ${JSON.stringify(Object.fromEntries(Object.entries(f).filter(([k]) => !['axis', 'kind'].includes(k)))).slice(0, 300)}`
    )
if (!summary.findings) md.push('none')
writeFileSync(path.join(out, 'VISUAL.md'), md.join('\n') + '\n')
// index.json — every picture that exists for this run, with who consumes it. Reused pictures point at
// the run that took them. The orchestrator hands each lens ITS rows; the merge step later checks that
// every row was opened by every consumer (visual-review condition 2).
const index = []
for (const p of pages)
  for (const a of p.axes) {
    const base = a.measured === 'reused' ? a.reusedFrom : out
    const abs = (rel) => path.resolve(base, rel)
    if (a.screenshot)
      index.push({
        layout: a.layout ?? null,
        page: p.id,
        variant: a.variant,
        stage: a.stage ?? stageOf(a.variant) ?? null,
        side: 'site',
        file: abs(a.screenshot),
        tiles: (a.tiles ?? []).map(abs),
        // true: the strips carry every pixel of `file`, so a consumer may read them INSTEAD of it
        // (the strips keep full resolution; the picture is one tall image that a reader which
        // downscales to a 1568px long edge — Claude's vision input rule, measured 18/09 — receives at
        // 157px wide for a 390x3892 page, i.e. with no legible text). false: read `file` too.
        tilesCoverPicture: a.tilesCoverPicture ?? false,
        consumers: a.shotConsumers ?? ['reviewer'],
        hash: p.hash,
        measured: a.measured
      })
    if (a.sourceScreenshot)
      index.push({
        layout: a.layout ?? null,
        page: p.id,
        variant: a.variant,
        stage: a.stage ?? stageOf(a.variant) ?? null,
        side: 'source',
        file: abs(a.sourceScreenshot),
        tiles: (a.sourceTiles ?? []).map(abs),
        tilesCoverPicture: a.sourceTilesCoverPicture ?? false,
        consumers: a.sourceConsumers ?? ['reviewer'],
        hash: p.hash,
        measured: a.measured
      })
  }
writeFileSync(
  path.join(out, 'index.json'),
  JSON.stringify(
    { at: report.at, scope: scope.kind, site, sourceSite: sourceSite ?? null, shots: index },
    null,
    2
  ) + '\n'
)
// notes/machine.md — the machine's findings in the same todo shape the lenses use, so the coding agent
// works from ONE list. Ids are stable within a run (M1…); the merge step re-keys across lenses.
const HINT = {
  'rule-mismatch': "set the property on the rule's selector to the expected value (global.css / tokens.css)",
  'rule-no-visible-match': 'the page lost the component, or the selector rotted — check the view',
  'unclassified-element': 'add a design.rule for this role (or fold it into an existing selector)',
  'parity-mismatch':
    'match the source value on the site side (or fix the pair if it compares wrong elements)',
  // The nine below were emitted with no hint for a long time, and they are disproportionately the
  // INFRASTRUCTURE failures -- the page never rendered, a selector threw, the axis crashed -- which
  // is exactly where the reader opening notes/machine.md has least context and most need of one.
  'page-did-not-render':
    'the page served almost nothing: check the site is up, the route exists, and the seed ran before QA',
  'rule-error':
    'the rule selector threw in the page: fix the selector in design.rules, it is not valid CSS here',
  'parity-selector-unsupported':
    'the batched reader cannot resolve this selector shape: use one plain CSS selector, optionally + one non-negative `nth=`',
  'parity-selector-undeclared':
    'pages[].parity names a key design.parity.selectors does not define: add the selector, or drop the name from the list',
  'parity-nothing-measured':
    'no pair resolved on BOTH sides: usually a source that did not load, or a contract narrowed to keys this page has none of',
  'source-not-rendered':
    'the source is not showing these pictures, so the count the site is judged against is too low: re-render the reference or check the picture is reachable',
  'fonts-not-ready':
    'document.fonts never settled: a webfont 404s, or the page is still loading when it is measured',
  'axis-error':
    'this axis crashed and measured nothing: read the message, the page or the browser died mid-run',
  'mega-error':
    'the mega-hover child process failed before it could write its JSON: run it by hand on this page to see why',
  'parity-not-measured': 'one side lacks the element: add it to the site, or narrow pages[].parity',
  'image-missing': 'register the picture in build-seed.mjs / media-map (or set pages[].images: placeholders)',
  'image-placeholder': 'give the entry its picture in the seed; placeholders are defects',
  'scan:off-system':
    'use a token / a size from designSystem (tokens.css, style guide), or extend the system on purpose',
  'scan:white-surface': 'give the surface a dark-theme token (paper/card) in tokens.css',
  'scan:dark-on-dark': 'text colour must come from an on-dark token',
  'scan:contrast': "raise the text token's contrast (fg-faint/fg-meta) or accept with a cited decision",
  'scan:bright-border': 'border colour from a line token; deliberate accents go to design.accentBorders',
  'scan:doubled-seam': "drop the last row's border (last:border-b-0) or the container's",
  'scan:hover-jump': 'hover must not change box size: keep border/padding constant across states',
  'mega-menu': 'see the steps: pointer travel to the panel must keep it open; Escape returns focus',
  'horizontal-overflow': 'an element wider than the viewport: check fixed widths/images at this width',
  'theme-not-applied': 'the theme hook (data-theme, storage key) did not resolve on this page',
  'reference-missing':
    'the frame named in pages[].source is not under --source-dir; export it or fix the path'
}
const machine = []
for (const p of pages)
  for (const f of p.findings) {
    const { kind, axis, ...detail } = f
    machine.push({
      id: `M${machine.length + 1}`,
      lens: `machine:${kind}`,
      page: p.id,
      layout: p.axes.find((a) => a.variant === axis)?.layout ?? null,
      axis,
      stage: stageOf(axis) ?? null,
      what: JSON.stringify(detail).slice(0, 300),
      fix: HINT[kind] ?? 'see the finding',
      verify: `rerun this stage: ${kind} gone on ${p.id}/${axis}`,
      status: 'open'
    })
  }
mkdirSync(path.join(out, 'notes'), { recursive: true })
writeFileSync(path.join(out, 'notes', 'machine.json'), JSON.stringify(machine, null, 2) + '\n')
writeFileSync(
  path.join(out, 'notes', 'machine.md'),
  [
    `# Machine notes — ${report.at} — scope ${scope.kind}`,
    '',
    'Each row is a todo in the shared shape (see references/qa-lenses.md). The coding agent fills Fix; the machine closes its own rows when the finding is gone on the rerun.',
    '',
    '| Id | Lens | Page | Axis | What | Fix hint | Verify | Status | Fix |',
    '|---|---|---|---|---|---|---|---|---|',
    ...machine.map(
      (m) =>
        `| ${m.id} | ${m.lens} | ${m.page} | ${m.axis} | ${m.what.replace(/\|/g, '\\|')} | ${m.fix} | ${m.verify} | ${m.status} | |`
    ),
    machine.length ? '' : 'none',
    ''
  ].join('\n')
)
console.log(JSON.stringify(summary))
process.exit(summary.findings ? 1 : 0)
