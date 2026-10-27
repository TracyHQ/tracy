/**
 * Words the template highlighted that the system made quieter than the text around them (E1 of PR 2,
 * 14/10/2026). A heading or a paragraph marks a few words (a span, strong, em, mark or an accent class)
 * that stand out on the template's own page by colour or weight; the system paints them with its muted
 * text role, so on the worn page the highlighted words read dimmer than the plain words beside them and
 * the hierarchy is inverted. Seen under Moxie on JA Nova, Phio, Prodex and Podcast Joomla: "We make",
 * "Start building", "1200+" went from the template's green or purple to khaki next to cream text.
 *
 * The probe reads every highlight with words of its own inside a heading or paragraph that has words of
 * its own too (the surrounding text, the nearest box between the two with words of its own), with both
 * colours, weights and the first opaque fill under them.
 *
 * `detect` pairs a worn highlight with its twin on the plain page. A finding is a highlight that stood
 * out on the plain page (a brand colour or a stronger contrast than its surrounding text, or a heavier
 * weight) and on the worn page reads at under `QUIET` of its surrounding text's contrast, in a colour
 * with no hue to stand out with. A template's own quiet span (a grey sub-line in a heading) is not one, nor
 * a chip: a highlight on a fill of its own (a badge), whose fill carries the emphasis.
 */
import { byPath, chroma, DETECTOR_LIMITS, dist, hex, PAGE_HELPERS, ratio } from './lib/colour.mjs'

export const kind = 'muted-highlight'

export const HIGHLIGHT_LIMITS = Object.freeze({
  /** a highlight is quieter when its contrast is under this share of its surrounding text's */
  quiet: 0.8,
  /** a weight this much heavier than the surrounding text stands out on its own */
  weight: 200
})

/** A heading or a paragraph, by tag or by the class a template gives a heading (`span.h2.main-title`). */
const BLOCK =
  'h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, dt, dd, .h1, .h2, .h3, .h4, .h5, .h6, .lead, [class*="title"], [class*="heading"]'
const MARK =
  ':is(span, strong, b, em, i, mark, [class*="accent"], [class*="highlight"], [class*="text-primary"]):not(a, button, svg *)'

export const probe = `(() => {${PAGE_HELPERS}
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\\s+/g, ' ').trim()
  // the first opaque fill under the words; a picture or gradient on the way is passed (its colours are
  // unknown, the fill under it is the page the words were chosen for)
  const groundOf = (e) => { for (let x = e; x; x = x.parentElement) { const c = ch(getComputedStyle(x).backgroundColor); if (c && c.a > 0.9) return c } return ch(getComputedStyle(document.documentElement).backgroundColor) }
  // a chip: the highlight, or a box between it and its surrounding text, paints an opaque fill of its own
  const chipOf = (m, around) => { for (let x = m; x && x !== around; x = x.parentElement) { const c = ch(getComputedStyle(x).backgroundColor); if (c && c.a > 0.9) return true } return false }
  const out = []
  for (const m of document.querySelectorAll(${JSON.stringify(MARK)})) {
    if (out.length >= 300) break
    if (m.matches(${JSON.stringify(BLOCK)}) || m.closest('a, button, nav')) continue
    const block = m.parentElement && m.parentElement.closest(${JSON.stringify(BLOCK)})
    if (!block) continue
    const text = own(m)
    if (text.length < 2) continue
    // the surrounding text: the nearest box between the highlight and its block with words of its own
    let around = null
    for (let x = m.parentElement; x; x = x.parentElement) { if (own(x).length >= 2) { around = x; break } if (x === block) break }
    if (!around) continue
    const cs = getComputedStyle(m)
    if (!seen(m, cs)) continue
    const acs = getComputedStyle(around)
    out.push({ path: pathOf(m), at: label(m), text: text.slice(0, 40), fg: ch(cs.color), weight: +cs.fontWeight || 400,
      around: ch(acs.color), aroundWeight: +acs.fontWeight || 400, block: label(block), ground: groundOf(m), chip: chipOf(m, around) })
  }
  return out
})()`

/** Did a highlight stand out on its page? @param {any} x */
export function standsOut(x, t = HIGHLIGHT_LIMITS, d = DETECTOR_LIMITS) {
  if (!x?.fg || !x.around || !x.ground) return false
  if (x.weight - x.aroundWeight >= t.weight) return true
  if (dist(x.fg, x.around) <= d.systemTolerance) return false
  return chroma(x.fg) >= d.brandChroma || ratio(x.fg, x.ground) >= ratio(x.around, x.ground)
}

/** Why a worn highlight reads quieter than its surrounding text, or null. @param {any} x */
export function quieter(x, t = HIGHLIGHT_LIMITS, d = DETECTOR_LIMITS) {
  if (!x?.fg || !x.around || !x.ground) return null
  if (chroma(x.fg) >= d.brandChroma) return null
  const mine = ratio(x.fg, x.ground)
  const theirs = ratio(x.around, x.ground)
  if (mine >= t.quiet * theirs) return null
  return `${hex(x.fg)} reads ${mine.toFixed(2)}:1 where the text around it (${hex(x.around)}) reads ${theirs.toFixed(2)}:1`
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const was = byPath(plain?.data)
  const findings = []
  for (const x of worn?.data ?? []) {
    const p = was.get(x.path)
    if (!p || p.text !== x.text || !standsOut(p)) continue
    // a chip: the highlight paints a fill of its own (a badge in a heading, JA Vogue 1.0.7's typography page);
    // the chip carries the emphasis, and its words are read on it (CON-2)
    if (x.chip) continue
    const why = quieter(x)
    if (!why) continue
    findings.push({
      at: `${x.at} "${x.text.slice(0, 32)}"`,
      text: x.text,
      in: x.block,
      why,
      was: hex(p.fg)
    })
  }
  return { count: findings.length, findings }
}
