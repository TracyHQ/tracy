// Intrinsic mobile defects (#65): a cheap DOM probe (no screenshots) on every page-map route at the
// narrow widths, on BOTH sides. Visual QA compares the site with the source, so a defect both share is
// "equal" there and never reported; this probe reports it and says whose it is.
//
//   node scripts/visual/intrinsic-mobile.mjs --page-map page-map.json --site <origin> --source-site <origin>
//        [--widths 320,360,375,390,414] [--out report.json]
//
// Per route and width it measures, in the page:
//   control-wrap     a button / link / CTA whose visible label is ≤ 3 words and still wraps to 2+ lines
//   text-clipped     a box that clips its text (overflow hidden/clip, no ellipsis) narrower than the text
//   page-overflow    the document is wider than the viewport (a horizontal scrollbar)
// Findings are classed by comparing the two sides at the same route and width:
//   shared-source-defect  the source has it too (and the site is no worse) — the port may fix it; that is
//                         a decision to record, not a parity difference
//   site-only             the source does not have it, or the site is worse (more lines, wider overflow)
// `source-fixed` rows (the source has it, the site does not) are listed but are not findings.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { withBrowser, withPage, mapLimit, DEFAULT_GOTO_TIMEOUT_MS } from '../lib/browser.mjs'
import { UsageError, parseStrict } from '../lib/cli-args.mjs'
import { declaredStatus } from '../lib/routes.mjs'
import { pageList } from './preflight.mjs'
import { readJsonFile } from './pattern-registry.mjs'
import { INTRINSIC_WIDTHS, MAX_WRAP_WORDS, buildIntrinsicReport, isWorse, validateIntrinsicReport } from './intrinsic-report.mjs'

export { INTRINSIC_WIDTHS, MAX_WRAP_WORDS }

/** Runs in the page. Returns plain data only. */
export function inPageIntrinsic(maxWords) {
  const visible = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    // visually hidden, the screen-reader way (WordPress `.screen-reader-text`, Bootstrap `.visually-hidden`): a box of
    // one pixel or one clipped away entirely shows no label, so nothing in it can wrap or be cut for a reader
    if (r.width <= 1 || r.height <= 1) return false
    if (/^inset\(\s*(50|100)%/.test(cs.clipPath)) return false
    const rect = /^rect\(([^)]*)\)$/.exec(cs.clip)
    if (rect && ['absolute', 'fixed'].includes(cs.position)) {
      const [top, right, bottom, left] = rect[1].split(/[\s,]+/).map((v) => parseFloat(v) || 0)
      if (right - left <= 1 || bottom - top <= 1) return false
    }
    return true
  }
  const nameOf = (el) => {
    const parts = []
    for (let n = el; n && n.nodeType === 1 && parts.length < 3; n = n.parentElement) {
      parts.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : n.classList.length ? `.${[...n.classList].slice(0, 2).join('.')}` : ''))
      if (n.id) break
    }
    return parts.join(' > ')
  }
  const linesOf = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const tops = []
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue
      const t = Math.round(r.top)
      if (!tops.some((x) => Math.abs(x - t) <= 3)) tops.push(t)
    }
    return tops.length
  }
  const words = (s) => s.split(/\s+/).filter(Boolean)
  // identity of a defect: what it is, its words, the landmark it sits in and its order among the same — two
  // "Contact Us" controls (header, footer) are two rows, and each is paired with the same one on the other side.
  // Only page chrome is a region: header, navigation, footer. Content landmarks (`main`, `aside`, sections) are
  // not, because a Joomla source draws them as plain divs while the WordPress port uses the semantic tag — the same
  // control would get two keys and be read as site-only (#90 for `main`, S-ji-15 for a sidebar `aside`).
  const seen = new Map()
  const identify = (kind, label, el) => {
    const chrome = el.closest('header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"]')
    const region = chrome ? (chrome.getAttribute('role') || chrome.tagName.toLowerCase()) : 'body'
    const base = `${kind}|${label}|${region}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return `${base}|${n}`
  }
  const out = []
  const scroll = document.scrollingElement || document.documentElement
  if (scroll.scrollWidth > window.innerWidth + 1) out.push({ kind: 'page-overflow', label: '', key: 'page-overflow', selector: 'html', over: scroll.scrollWidth - window.innerWidth })
  for (const el of document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]')) {
    if (!visible(el)) continue
    const label = (el instanceof HTMLInputElement ? el.value : el.textContent || '').replace(/\s+/g, ' ').trim()
    const n = words(label).length
    if (!n || n > maxWords) continue
    // numbered BEFORE the defect test: the n-th "Contact Us" of a landmark is the n-th on both sides, whichever wraps
    const key = identify('control-wrap', label, el)
    const lines = linesOf(el)
    if (lines > 1) out.push({ kind: 'control-wrap', label, key, selector: nameOf(el), lines, boxWidth: Math.round(el.getBoundingClientRect().width) })
  }
  // a box that clips (overflow hidden/clip, no ellipsis or line clamp): the text of ANY descendant that starts inside
  // the box and runs past its right or bottom edge. Text that starts outside the box (an off-screen slide) is hidden by
  // design and is not a clipped label. Every text of a clipping box is numbered, cut or not.
  // Every visible text is numbered first, whether or not any box clips it: an outer overflow:hidden box that
  // clips nothing must not hide a nested box that does.
  const keys = new Map()
  const walkAll = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let t = walkAll.nextNode(); t; t = walkAll.nextNode()) {
    const text = t.textContent.replace(/\s+/g, ' ').trim()
    if (!text || !t.parentElement || !visible(t.parentElement)) continue
    keys.set(t, { text, key: identify('text-clipped', text.slice(0, 60), t.parentElement) })
  }
  const reported = new Set()
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    const hidX = ['hidden', 'clip'].includes(cs.overflowX) && cs.textOverflow !== 'ellipsis'
    const hidY = ['hidden', 'clip'].includes(cs.overflowY) && !(cs.webkitLineClamp && cs.webkitLineClamp !== 'none')
    if ((!hidX && !hidY) || !visible(el)) continue
    const clipX = hidX && el.scrollWidth > el.clientWidth + 1
    const clipY = hidY && el.scrollHeight > el.clientHeight + 1
    if (!clipX && !clipY) continue
    const box = el.getBoundingClientRect()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const k = keys.get(t)
      if (!k || reported.has(t)) continue
      const range = document.createRange()
      range.selectNodeContents(t)
      const rects = [...range.getClientRects()].filter((r) => r.width >= 1 && r.height >= 1)
      const insideX = (r) => r.left >= box.left - 1 && r.left < box.right - 1
      const insideY = (r) => r.top >= box.top - 1 && r.top < box.bottom - 1
      // the text starts inside the box (some line does); a line that starts at or past the bottom edge is cut too
      const anchored = rects.some((r) => insideX(r) && insideY(r))
      const cutX = clipX && anchored && rects.find((r) => insideX(r) && insideY(r) && r.right > box.right + 1)
      const cutY = clipY && anchored && rects.find((r) => insideX(r) && r.bottom > box.bottom + 1)
      if (cutX || cutY) {
        reported.add(t)
        out.push({ kind: 'text-clipped', label: k.text.slice(0, 60), key: k.key, selector: nameOf(t.parentElement), over: Math.round(Math.max(cutX ? cutX.right - box.right : 0, cutY ? cutY.bottom - box.bottom : 0)) })
      }
    }
  }
  return out
}

const keyOf = (d) => d.key ?? `${d.kind}|${d.label}`
/**
 * Class the defects of one route × width. `site`/`source` are the arrays `inPageIntrinsic` returned.
 */
export function classify(site, source) {
  const bySource = new Map(source.map((d) => [keyOf(d), d]))
  const bySite = new Map(site.map((d) => [keyOf(d), d]))
  const rows = []
  for (const [k, d] of bySite) {
    const s = bySource.get(k)
    const worse = s && isWorse(d, s)
    rows.push({ ...d, class: !s || worse ? 'site-only' : 'shared-source-defect', ...(s ? { source: d.kind === 'control-wrap' ? { lines: s.lines } : { over: s.over } } : {}) })
  }
  for (const [k, d] of bySource) if (!bySite.has(k)) rows.push({ ...d, class: 'source-fixed' })
  return rows
}

/** The route's own answer must be the page: the declared status (any 2xx when none is declared) and no redirect away from the route. */
export function checkAnswer(p, requested, response) {
  const status = response ? response.status() : 0
  const want = declaredStatus(p)
  if (want === null ? status < 200 || status > 299 : status !== want) throw new Error(`${requested.pathname} answered ${String(status)}, ${want === null ? 'expected 2xx' : `declared ${String(want)}`}`)
  // every hop of the chain stays on the requested origin and route: a redirect to another origin (or out and back) is not the route's own document
  const norm = (u) => `${u.origin}${u.pathname.replace(/(.)\/+$/, '$1')}${u.search}`
  const hops = []
  for (let r = response.request(); r; r = r.redirectedFrom()) hops.push(new URL(r.url()))
  const off = hops.find((u) => norm(u) !== norm(requested))
  if (off) throw new Error(`${requested.pathname} ended on ${off.origin === requested.origin ? '' : off.origin}${off.pathname}${off.search} — another document`)
}

export async function measureIntrinsic({ browser, pages, siteOrigin, sourceOrigin = null, widths = INTRINSIC_WIDTHS, concurrency = 4 }) {
  const jobs = pages.flatMap((p) => widths.map((width) => ({ p, width })))
  // `siteRoute` (optional): where the stand SERVES a page the seed moved (`/team` → `/our-team/`); the report keeps the page-map route
  const probe = (origin, p, width, route = p.path) =>
    withPage(browser, { viewport: { width, height: 800 } }, async (page) => {
      const requested = new URL(route, origin)
      const response = await page.goto(requested.href, { waitUntil: 'load', timeout: DEFAULT_GOTO_TIMEOUT_MS })
      checkAnswer(p, requested, response)
      return page.evaluate(inPageIntrinsic, MAX_WRAP_WORDS)
    })
  const measured = await mapLimit(jobs, concurrency, async ({ p, width }) => {
    try {
      // without a source origin only the site is read: every defect is then the site's, unclassed against the source
      const [site, source] = await Promise.all([probe(siteOrigin, p, width, p.siteRoute ?? p.path), sourceOrigin ? probe(sourceOrigin, p, width) : []])
      return { route: p.path, width, rows: classify(site, source) }
    } catch (e) {
      return { route: p.path, width, error: e.message, rows: [] }
    }
  })
  // settled before anything is built: a late result cannot change a report that was already assembled
  return buildIntrinsicReport({ widths, sourceRead: Boolean(sourceOrigin), routes: pages.map((p) => p.path), readings: measured })
}

/** Routes of a page-map that render a page: every one but a declared 3xx (its answer is another route's page). An error page is a page. */
export const contentPages = (pageMap) => pageList(pageMap).filter((p) => declaredStatus(p) === null || declaredStatus(p) < 300 || declaredStatus(p) >= 400)

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const USAGE = 'usage: intrinsic-mobile.mjs --page-map f --site <origin> --source-site <origin> [--widths 320,360,…] [--out report.json]'
  let args
  let widths = INTRINSIC_WIDTHS
  try {
    args = parseStrict(process.argv.slice(2), { values: ['--page-map', '--site', '--source-site', '--widths', '--out'] })
    for (const n of ['--page-map', '--site', '--source-site']) if (!args.opt(n)) throw new UsageError(`${n} is required`)
    if (args.opt('--widths')) {
      widths = args.opt('--widths').split(',').map(Number)
      if (!widths.length || widths.some((w) => !Number.isInteger(w) || w < 200 || w > 1000)) throw new UsageError('--widths must be integers between 200 and 1000')
    }
  } catch (e) {
    if (!(e instanceof UsageError)) throw e
    console.error(`intrinsic-mobile: ${e.message}\n${USAGE}`)
    process.exit(2)
  }
  let pages
  try {
    pages = contentPages(readJsonFile(args.opt('--page-map'), '--page-map'))
  } catch (e) {
    console.error(`intrinsic-mobile: ${e.message}`)
    process.exit(2)
  }
  const report = await withBrowser((browser) => measureIntrinsic({ browser, pages, siteOrigin: args.opt('--site'), sourceOrigin: args.opt('--source-site'), widths }))
  // the standalone probe holds its own report to the same validator the verdict uses
  const refusals = validateIntrinsicReport(report, { owedRoutes: pages.map((p) => p.path), owedWidths: widths, allowFailedReadings: true })
  if (args.opt('--out')) writeFileSync(args.opt('--out'), JSON.stringify(report, null, 2) + '\n')
  if (refusals.length) {
    console.error(`intrinsic-mobile: the report is inconsistent — ${refusals.slice(0, 3).join('; ')}`)
    process.exit(1)
  }
  console.log(JSON.stringify(report.summary))
  process.exit(report.summary.siteOnly || report.summary.errors ? 1 : 0)
}
