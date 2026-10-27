// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/review/seam-scan.mjs — WordPress changes: none.
// Detect "thick" seams in DARK mode: multiple visible 1px lines (borders or
// inset ring edges) drawn within 2px of each other → reads as a fat line.
// Usage: node seam-scan.mjs <url>
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

export const TOOL_VERSION = 1

export async function scanSeams(page, url) {
  await navigate(page, url)
  await applyTheme(page, 'dark')
  await scrollThrough(page, 30)
  await page.waitForTimeout(400)
  const findings = await page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/)
      return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
    }
    const luma = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114
    const vis = (e) => {
      const cs = getComputedStyle(e)
      if (cs.display === 'none' || cs.visibility === 'hidden') return false
      if (!e.offsetParent && cs.position !== 'fixed') return false
      const r = e.getBoundingClientRect()
      return r.width > 40 && r.height > 8
    }
    const lines = [] // {axis:'h'|'v', pos, from, to, label}
    const lbl = (e) => (e.className || e.tagName).toString().trim().slice(0, 42)
    for (const e of document.body.querySelectorAll('*')) {
      if (!vis(e)) continue
      const cs = getComputedStyle(e)
      const r = e.getBoundingClientRect()
      const add = (axis, pos, from, to, what) =>
        lines.push({
          axis,
          pos: Math.round(pos + (axis === 'h' ? scrollY : scrollX)),
          from: Math.round(from),
          to: Math.round(to),
          label: lbl(e) + ':' + what
        })
      for (const [side, axis, pos, f, t] of [
        ['Top', 'h', r.top, r.left, r.right],
        ['Bottom', 'h', r.bottom, r.left, r.right],
        ['Left', 'v', r.left, r.top, r.bottom],
        ['Right', 'v', r.right, r.top, r.bottom]
      ]) {
        const w = parseFloat(cs['border' + side + 'Width'])
        if (w) {
          const c = parse(cs['border' + side + 'Color'])
          if (c && c[3] > 0.4 && luma(c) >= 35) add(axis, pos, f, t, 'b' + side[0])
        }
      }
      // 1px inset rings
      if (
        /inset 0(px)? 0(px)? 0(px)? 1px/.test(cs.boxShadow) ||
        / 0px 0px 0px 1px inset/.test(cs.boxShadow)
      ) {
        const c = parse(cs.boxShadow)
        if (c && luma(c) >= 35) {
          add('h', r.top, r.left, r.right, 'ringT')
          add('h', r.bottom, r.left, r.right, 'ringB')
          add('v', r.left, r.top, r.bottom, 'ringL')
          add('v', r.right, r.top, r.bottom, 'ringR')
        }
      }
    }
    // cluster: same axis, |pos| diff <=2, overlapping range, from DIFFERENT elements
    const out = new Set()
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i],
          b = lines[j]
        if (a.axis !== b.axis || Math.abs(a.pos - b.pos) > 2 || a.pos === 0) continue
        if (a.label === b.label) continue
        const ov = Math.min(a.to, b.to) - Math.max(a.from, b.from)
        if (ov < 60) continue
        out.add(`${a.axis}@${a.pos}: ${a.label}  +  ${b.label}`)
        if (out.size > 25) break
      }
    return [...out]
  })
  const examined = await countExamined(page)
  return { findings, examined, url: page.url() }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain) {
  const [, , url] = process.argv
  await withBrowser(
    (browser) =>
      withPage(browser, SCAN_PAGE, async (page) => {
        try {
          const { findings, examined } = await scanSeams(page, url)
          if (examined < COVERAGE_MIN) {
            console.error(coverageError(examined, url))
            process.exitCode = 1
          } else if (!findings.length) console.log(`OK — no doubled seams on ${url}  [${examined} elements examined]`)
          else {
            console.log(`# doubled seams  ${url}`)
            for (const r of findings) console.log('  ' + r)
          }
          report(page, examined, findings, examined < COVERAGE_MIN)
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
