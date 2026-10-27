#!/usr/bin/env node
// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/review/leak-scan.mjs — WordPress changes: none.
// Leak scanner for a page in DARK mode.
// Usage: node leak-scan.mjs <url> <white|darktext>
//   white    — VISIBLE elements with a near-WHITE background on the dark page
//              (un-themed cards/panels/badges/map widgets, AND pseudo-bars via --body-bg-color).
//   darktext — VISIBLE text that is near-BLACK sitting on a DARK surface
//              (hardcoded #111/#212529 metas, mega headings, off-canvas links, <strong> bylines).
//
// Both report the element + its computed colour so you can probe the source rule and fix.
// `scanLeaks(page, url, mode)` is the scan itself — review/scan.mjs runs it on a shared browser.
// Note: a near-white panel may be CORRECT if it's a frosted glass over a photo with dark text —
// verify before repainting (gotchas §13). And owl-carousel CLONES are filtered out (visible only).

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

// Bump when the scan logic changes: review/scan.mjs caches verdicts under this version.
// 3: source counterparts use the parity colour tolerance and are recorded with both measured values (#95).
// The records come from source-pair.mjs (the same collector reads the source), words drawn at 0 px
// are no dark text, a motion state class is no part of a label, and `{ source }` sets apart what the
// source draws itself in dark (#27).
export const TOOL_VERSION = 3

/**
 * `source` (optional): what `inPageDarkRecords` read on the SOURCE page, in dark, at the same width
 * (visual-qa.mjs passes it with `mode: 'dark'`). A record whose counterpart there draws the same value
 * (source-pair.mjs pairWithSource) moves to `sourceShared` with both measured values; every
 * other one stays a finding. A source read in another mode or at another width, or that does not say
 * its mode and width, is refused whole (`sourceRefused`). Without `source` the scan is what it always was.
 */
export async function scanLeaks(page, url, mode = 'white', { source = null } = {}) {
  await navigate(page, url)
  await applyTheme(page, 'dark')
  await scrollThrough(page, 40)
  await page.waitForTimeout(400)
  const site = await page.evaluate(inPageDarkRecords, {})
  const kind = mode === 'white' ? 'white' : 'darktext'
  const refused = sourceRefusal(source, site)
  const usable = source && !refused
  const findings = []
  const sourceMatched = []
  const sourceShared = []
  const seen = new Set()
  // Every record is paired before any is folded by its label (border-scan does the same): folding
  // first would let a matched element hide a sibling of the same class that the source does not draw.
  for (const r of site[kind]) {
    const c = usable ? pairWithSource(r, source[kind], source.counts, (s) => coloursWithinTolerance(r.value, s.value), { textless: kind === 'white' }) : null
    if (c?.match) {
      sourceMatched.push(`${r.line}  = source ${sourceLabel(c.source)}${c.source.text ? ` "${c.source.text.slice(0, 40)}"` : ''} (${c.by})`)
      sourceShared.push({ component: sourceLabel(c.source), siteComponent: sourceLabel(r), sourceComponent: sourceLabel(c.source), by: c.by, site: { value: r.value }, source: { value: c.source.value } })
      continue
    }
    if (seen.has(r.k) || findings.length > 20) continue
    seen.add(r.k)
    findings.push(r.line)
  }
  const examined = await countExamined(page)
  return { findings, examined, url: page.url(), ...(source ? { sourceMatched, sourceShared, ...(refused ? { sourceRefused: refused } : {}) } : {}) }
}

function printLeaks(url, mode, { findings, examined }) {
  if (examined < COVERAGE_MIN) {
    console.error(coverageError(examined, url))
    process.exitCode = 1
  } else if (!findings.length) console.log(`OK — no ${mode} leaks on ${url}  [${examined} elements examined]`)
  else {
    console.log(`# ${mode} leaks  ${url}`)
    for (const r of findings) console.log('  ' + r)
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain) {
  const [, , url, mode = 'white'] = process.argv
  if (!url) {
    console.error('Usage: node leak-scan.mjs <url> <white|darktext>')
    process.exit(1)
  }
  await withBrowser(
    (browser) =>
      withPage(browser, SCAN_PAGE, async (page) => {
        try {
          const r = await scanLeaks(page, url, mode)
          printLeaks(url, mode, r)
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
