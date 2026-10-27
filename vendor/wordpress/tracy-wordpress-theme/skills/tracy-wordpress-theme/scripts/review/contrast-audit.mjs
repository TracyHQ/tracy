#!/usr/bin/env node
// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/review/contrast-audit.mjs — WordPress changes: none beyond the by-design note naming block styles instead of Bootstrap badges.
// WCAG contrast audit of a page in DARK mode (or LIGHT with `--mode light`).
// Usage: node contrast-audit.mjs <url> [minRatio=3.0] [--mode dark|light]
// Flags every visible text node whose contrast against its EFFECTIVE (nearest opaque)
// background is below minRatio. This catches dark-on-dark and light-on-light leaks that a
// screenshot pass misses.
//
// IMPORTANT — filter the by-design set yourself before acting (see gotchas §31):
//   brand-accent buttons/links, accent prices, coloured block styles (has-*-background-color).
// They are CORRECT (identical in light); a low ratio there is not a bug.
// `scanContrast(page, url, minRatio)` is the audit itself — review/scan.mjs runs it on a shared browser.
// The whole body is read, the header and footer too: a header painted in the page background colour
// (gotcha 7, a floating nav class on a hero without a cover) is white on white in light and dark on
// dark in dark, so the audit runs in both modes (`mode`).

import path from 'node:path'
import { withBrowser, withPage } from '../lib/browser.mjs'
import {
  launchOptions,
  SCAN_PAGE,
  COVERAGE_MIN,
  coverageError,
  countExamined,
  scrollThrough,
  setTheme as applyTheme,
  navigate,
  report
} from './runtime.mjs'
import { coloursWithinTolerance, inPageDarkRecords, pairWithSource, sourceLabel, sourceRefusal } from './source-pair.mjs'

// Bump when the audit logic changes: review/scan.mjs caches verdicts under this version.
// 3: source counterparts use the parity colour tolerance and are recorded with both measured values (#95).
// The records come from source-pair.mjs (the same collector reads the source), words drawn at 0 px
// are not audited, a motion state class is no part of a label, and `{ source }` sets apart the
// contrast the source draws itself in dark (#27).
export const TOOL_VERSION = 3
const MODES = Object.freeze(['dark', 'light'])

/**
 * `source` (optional): what `inPageDarkRecords` read on the SOURCE page, in dark, at the same width.
 * Text whose counterpart there is drawn in colour within tolerance on the same surface (source-pair.mjs
 * pairWithSource) moves to `sourceShared` with both measured colours and ratios; everything else stays a
 * finding. A source read in another mode or at another width, or that does not say its mode and
 * width, is refused whole (`sourceRefused`).
 */
export async function scanContrast(page, url, minRatio = '3.0', { source = null, mode = 'dark' } = {}) {
  if (!MODES.includes(mode)) throw new Error(`contrast-audit: mode must be ${MODES.join(' or ')}, got ${JSON.stringify(mode)}`)
  await navigate(page, url)
  await applyTheme(page, mode)
  await scrollThrough(page, 40)
  await page.waitForTimeout(400)
  const site = await page.evaluate(inPageDarkRecords, { min: minRatio })
  // The source counterpart (source-pair.mjs) is read in dark only: in light every low pair is a finding.
  const refused = source && mode !== 'dark' ? `the source is paired in dark mode only, the page was read in ${mode}` : sourceRefusal(source, site)
  const usable = source && !refused
  const out = []
  const sourceMatched = []
  const sourceShared = []
  const seen = new Set()
  for (const r of site.contrast) {
    const c = usable ? pairWithSource(r, source.contrast, source.counts, (s) => {
      const [siteFg, siteBg] = r.value.split('|')
      const [sourceFg, sourceBg] = s.value.split('|')
      return coloursWithinTolerance(siteFg, sourceFg) && coloursWithinTolerance(siteBg, sourceBg)
    }, { textless: false }) : null
    if (c?.match) {
      const f = r.finding
      sourceMatched.push(`cr=${f.cr} ${f.k} "${f.txt}" fg=${f.fg} bg=${f.bg}  = source ${sourceLabel(c.source)} "${c.source.text.slice(0, 40)}" (${c.by})`)
      sourceShared.push({ component: sourceLabel(c.source), siteComponent: sourceLabel(r), sourceComponent: sourceLabel(c.source), by: c.by, site: { value: r.value, contrast: f.cr }, source: { value: c.source.value, contrast: c.source.finding.cr } })
      continue
    }
    if (seen.has(r.k)) continue
    seen.add(r.k)
    out.push(r.finding)
  }
  const findings = out.sort((a, b) => a.cr - b.cr).slice(0, 30)
  const examined = await countExamined(page)
  return { findings, examined, url: page.url(), ...(source ? { sourceMatched, sourceShared, ...(refused ? { sourceRefused: refused } : {}) } : {}) }
}

function printContrast(url, minRatio, { findings, examined }, mode = 'dark') {
  if (examined < COVERAGE_MIN) {
    console.error(coverageError(examined, url))
    process.exitCode = 1
  } else if (!findings.length)
    console.log(`OK — no text below contrast ${minRatio} on ${url} (${mode})  [${examined} elements examined]`)
  else {
    console.log(`# contrast < ${minRatio}  ${url} (${mode})  (filter the by-design set!)`)
    for (const r of findings) console.log(`  cr=${r.cr} (AA ${r.need})  ${r.k}  "${r.txt}"  fg=${r.fg} bg=${r.bg}`)
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain) {
  const argv = process.argv.slice(2)
  const m = argv.indexOf('--mode')
  const mode = m < 0 ? 'dark' : argv[m + 1]
  if (m >= 0) argv.splice(m, 2)
  const [url, minRatio = '3.0'] = argv
  if (!url || !MODES.includes(mode)) {
    console.error('Usage: node contrast-audit.mjs <url> [minRatio] [--mode dark|light]')
    process.exit(1)
  }
  await withBrowser(
    (browser) =>
      withPage(browser, SCAN_PAGE, async (page) => {
        try {
          const r = await scanContrast(page, url, minRatio, { mode })
          printContrast(url, minRatio, r, mode)
          report(page, r.examined, r.findings, r.examined < COVERAGE_MIN)
        } catch (e) {
          // Fail LOUDLY. A scanner that prints ERR and exits 0 is indistinguishable from a clean page —
          // exactly the false-confidence trap review.md warns about.
          console.error('ERR', e.message)
          process.exitCode = 1
        }
      }),
    { launchOptions }
  )
}
