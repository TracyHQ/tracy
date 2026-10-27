// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/review/border-scan.mjs — WordPress changes:
// a bright border is a defect only when the DESIGN never declared that colour (below).
// Scan a page in DARK mode for visible borders that are too BRIGHT relative to
// the dark page (light mode's borders are subtle #e5e5e5-on-white ≈ 1.2:1).
//
// 🔒 WHAT COUNTS AS A DEFECT. The question is not "is this border bright" but "did anyone MEAN it
// to be". A seam left over from the light theme is bright AND undeclared; a filled brand button in
// dark is bright and declared. So the scan reads the custom properties the root element resolves to
// in dark — every `--wp--preset--color--*` / `--wp--custom--*` (any `--*` whose value is a colour) —
// and a border whose colour is one of them is design, not a leak. The T4 port hard-coded one family
// ("brand red"), which is a palette baked into a tool: measured 15/09 on wp-tracy-business, whose
// brand orange is rgb(218,90,42), that exemption missed every filled button and the scan reported
// 71 findings, all of them the design doing what it says.
//
// 🔒 AND WHAT THE SOURCE DRAWS IS NOT A LEAK EITHER. A port's source can bring bright borders of
// its own that the WordPress palette never declares: JA Vega's Bootstrap 5.3 dark alerts and outline
// buttons (`#997404`, `#087990`, …) came back as 20 `scan:bright-border` a run on /typography, each
// one the source's own value (M4c, #19 item 7). visual-qa.mjs therefore reads the SOURCE in the same
// mode with the same collector and passes it in: a border is dropped only when its counterpart there
// is certain — the same words, and every place on the source that says them drawing that side in the
// colour within tolerance, width and style (sourceCounterpart). Both measured colours are kept in `sourceShared`.
// A class name, a colour the source uses elsewhere, or words said twice with different borders are
// never enough.
//
// 🔒 AND WORDS SAID TWICE STILL PAIR, BY THEIR ORDER. After #24 the scan still left 20 findings a dark
// tier on JA Vega /typography whose borders the source draws in dark too (M4d, #27 item 8), for two
// reasons measured on the live stands: an outline button says "Success" at three places on both sides
// (a solid button, the outline one, a badge) and only two of them draw the border, so "every place"
// never held; and the spinners say "Loading…" on the site (wptexturize) where the source says
// "Loading...". The words are folded as parity folds them, and when both sides say them at the same
// number of places the place in the same order is the counterpart (source-pair.mjs pairWithSource,
// shared with the white-surface and contrast scans). Other counts stay ambiguous, and stay findings.
// Usage: node border-scan.mjs <url> [minLuma=80]
// Reports unique (selector-ish, side, color) tuples with the element chain.
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
import { coloursWithinTolerance, pairWithSource, sourceRefusal } from './source-pair.mjs'

// 4: source counterpart colours use parity's tolerance and both measured borders are retained (#95).
// Words fold like parity's, repeated words pair by order, and the source is refused when read at
// another width or in another mode, motion state classes out of the labels (#27).
export const TOOL_VERSION = 4

/**
 * Every visible bright border of the page as data, in the page. The same collector reads the
 * source (in the mode the site is scanned in) and the site, so the two sides are keyed alike.
 * Each record is one side of one element: colour, width and style as computed, the element's
 * words, and the PLACE it belongs to — an element and a descendant that say the same words are one
 * place (an `.alert` and the `<p>` that carries all of its text). `places` counts, for the words of
 * every record, how many places on the page say exactly them, bordered or not: a counterpart is
 * only certain when every place of those words draws the same border.
 */
export function inPageBorderRecords(MIN) {
  const parse = (c) => {
    const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/)
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
  }
  const luma = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114
  // Typesetting is not content: the fold parity uses (visual-qa inPageSnapshot), so the site's
  // wptexturize "Loading…" is the source's "Loading...".
  const norm = (s) =>
    String(s ?? '')
      .replace(/\u2011/g, '-')
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/\u2014/g, '--')
      .replace(/\u2013/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
  const MOTION_STATE = /^tracy-motion-(?:on|in|bold|done)$/
  const visible = (e) => {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    if (!e.offsetParent && cs.position !== 'fixed') return false
    const r = e.getBoundingClientRect()
    return r.width > 4 && r.height > 4
  }
  // Every word, never a prefix: two elements that share their first N characters are not the same
  // words, and pairing by a cut prefix gave one the other's border (Sol review of #19 item 7).
  const textOf = (e) => norm(e.textContent)
  const placeOf = new Map()
  let places = 0
  const place = (e, text) => {
    if (placeOf.has(e)) return placeOf.get(e)
    const up = e.parentElement
    const p = up && up !== document.body && textOf(up) === text && text ? place(up, text) : ++places
    placeOf.set(e, p)
    return p
  }
  const records = []
  const texts = new Set()
  let i = 0
  for (const e of document.body.querySelectorAll('*')) {
    i++
    if (!visible(e)) continue
    const cs = getComputedStyle(e)
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const width = parseFloat(cs['border' + side + 'Width'])
      if (!width) continue
      const color = cs['border' + side + 'Color']
      const c = parse(color)
      if (!c || c[3] < 0.5 || luma(c) < +MIN) continue
      const text = textOf(e)
      if (text) texts.add(text)
      let chain = [],
        n = e
      for (let k = 0; k < 4 && n; k++) {
        // motion state classes come and go as the page runs; the printed chain is the finding's
        // identity across rounds (visual/rounds.mjs findingKey), so it names structure only
        const own = (n.className || '').toString().trim().split(/\s+/).filter((c) => c && !MOTION_STATE.test(c)).join(' ')
        chain.push((own || n.tagName).slice(0, 35))
        n = n.parentElement
      }
      records.push({
        el: i,
        tag: e.tagName.toLowerCase(),
        cls: (e.className || '').toString().trim().split(/\s+/).filter((c) => c && !MOTION_STATE.test(c)).join('.').slice(0, 40),
        side,
        color,
        width,
        style: cs['border' + side + 'Style'],
        background: cs.backgroundColor,
        text,
        place: text ? place(e, text) : null,
        chain: chain.join(' << ')
      })
    }
  }
  // Places per text, over every visible element that says those words — bordered or not — in
  // document order, so each record also knows the order of its place (`nth`) among them.
  const count = {}
  for (const e of document.body.querySelectorAll('*')) {
    if (!visible(e)) continue
    const t = textOf(e)
    if (!texts.has(t)) continue
    const list = (count[t] ||= [])
    const p = place(e, t)
    if (!list.includes(p)) list.push(p)
  }
  for (const r of records) if (r.text && count[r.text]) Object.assign(r, { nth: count[r.text].indexOf(r.place) + 1, count: count[r.text].length })
  return { width: innerWidth, records, places: Object.fromEntries(Object.entries(count).map(([t, s]) => [t, s.length])) }
}

/**
 * The source counterpart of one site border record, or why there is none. Certain when the source
 * says the same words and EVERY place of them draws a border on the same side in the same colour,
 * width and style — any element of the place may draw it (the `.alert` or its `<p>`) — or when both
 * sides say the words at the same number of places and the source place in the same order draws it
 * (source-pair.mjs pairWithSource). No words, no place, a place without that border, other counts,
 * or a border that differs in any of the four: no counterpart, and the finding stays. A colour the
 * source uses on some OTHER element is not a counterpart; neither is a class name.
 */
function sourceCounterpart(record, source) {
  if (!source?.records) return { match: false, reason: 'no source measured' }
  const same = (r) => r.side === record.side && coloursWithinTolerance(record.color, r.color) && r.width === record.width && r.style === record.style
  const c = pairWithSource(record, source.records, Object.fromEntries(Object.entries(source.places ?? {}).map(([t, n]) => [`t:${t}`, n])), same, { textless: false })
  return c.match ? { match: true, by: c.by, source: `${c.source.tag}${c.source.cls ? '.' + c.source.cls : ''}`, record: c.source } : c
}

/**
 * `source` (optional): what inPageBorderRecords read on the SOURCE page, in the same mode and at
 * the same viewport. A bright border whose counterpart there is certain (sourceCounterpart) is the
 * source's own design and moves to `sourceMatched`, with the source element named; every other
 * one stays a finding. Without `source` the scan is what it always was.
 */
export async function scanBorders(page, url, minLuma = '80', { source = null } = {}) {
  await navigate(page, url)
  await applyTheme(page, 'dark')
  await scrollThrough(page, 30)
  await page.waitForTimeout(400)
  const declared = await page.evaluate(() => {
    const parse = (c) => /rgba?\((\d+), ?(\d+), ?(\d+)/.test(c)
    // Colours the design declares on the root IN THIS THEME, normalised the way computed styles
    // print them (the probe turns #da5a2a into rgb(218, 90, 42)).
    const probe = document.createElement('span')
    probe.style.display = 'none'
    document.body.append(probe)
    const out = new Set()
    const rootStyle = getComputedStyle(document.documentElement)
    for (const name of Array.from(rootStyle)) {
      if (!name.startsWith('--')) continue
      const raw = rootStyle.getPropertyValue(name).trim()
      if (!raw || raw.length > 40) continue
      probe.style.color = ''
      probe.style.color = raw
      const resolved = getComputedStyle(probe).color
      if (resolved && parse(resolved)) out.add(resolved)
    }
    probe.remove()
    return [...out]
  })
  const { records, width } = await page.evaluate(inPageBorderRecords, minLuma)
  // a source read in another mode or width, or that does not say which, is no counterpart of anything here
  const refused = sourceRefusal(source, { width })
  if (refused) source = { ...source, records: null, refused }
  const findings = []
  const sourceMatched = []
  const sourceShared = []
  const seen = new Set()
  const matchedSeen = new Set()
  // 🔒 EVERY ELEMENT IS PAIRED BEFORE ANY IS FOLDED. Two elements of one tag, class, side and colour
  // are one finding line — but only among the elements with no counterpart: folding first let an
  // element that matched the source hide a sibling of the same class whose words or width differ.
  for (const r of records) {
    if (declared.includes(r.color)) continue // a colour the design declares in dark
    if (r.color === r.background) continue // a solid surface, not a seam
    const key = `${r.tag.toUpperCase()}.${r.cls}|${r.side}|${r.color}`
    const line = `${r.color}  ${r.side[0]} ${r.width}px  ${r.chain}`
    const counterpart = source?.records ? sourceCounterpart(r, source) : null
    if (counterpart?.match) {
      // Every border set apart is kept for audit — one line per element's words, never capped.
      // One line per element and side: two elements whose words share their first 40 characters
      // are two lines, never folded by the printed excerpt.
      const at = `${r.el}|${r.side}`
      if (!matchedSeen.has(at)) sourceMatched.push(`${line}  = source ${counterpart.source} "${r.text.slice(0, 40)}"`)
      if (!matchedSeen.has(at)) sourceShared.push({
        component: counterpart.source,
        siteComponent: `${r.tag.toUpperCase()}${r.cls ? '.' + r.cls : ''}`,
        sourceComponent: counterpart.source,
        by: counterpart.by,
        site: { value: r.color, width: r.width, style: r.style },
        source: { value: counterpart.record.color, width: counterpart.record.width, style: counterpart.record.style }
      })
      matchedSeen.add(at)
      continue
    }
    if (seen.has(key) || findings.length > 40) continue
    seen.add(key)
    findings.push(line)
  }
  const examined = await countExamined(page)
  return { findings, examined, url: page.url(), ...(source ? { sourceMatched, sourceShared, ...(source.refused ? { sourceRefused: source.refused } : {}) } : {}) }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain) {
  const [, , url, minLuma = '80'] = process.argv
  await withBrowser(
    (browser) =>
      withPage(browser, SCAN_PAGE, async (page) => {
        try {
          const { findings, examined } = await scanBorders(page, url, minLuma)
          if (examined < COVERAGE_MIN) {
            console.error(coverageError(examined, url))
            process.exitCode = 1
          } else if (!findings.length) console.log(`OK — no bright borders on ${url}  [${examined} elements examined]`)
          else {
            console.log(`# bright borders (luma>${minLuma})  ${url}`)
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
