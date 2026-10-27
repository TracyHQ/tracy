/**
 * Headings the template paints alike that take different colours under a system (HIER-2, Akemi
 * 14/10/2026). Under Toggl Track light every section heading of JA Kinetic Joomla took the system's
 * plum heading colour except the timeline's ("From alert to resolved in four moves"), near-black: its
 * own rule was read off the template's page as the text colour (the hex its --heading resolves to) and
 * recoloured as text, while the others follow --heading. Both colours are the system's, so no
 * leftover or contrast rule read it.
 *
 * The probe reads every heading (h1 to h3 and their classes) with words of its own, outside the header,
 * footer and navigation: its colour and the ground under it. `detect` groups the template's headings
 * of one level by colour (within `same`), pairs each with its twin on the worn page, and reports a
 * heading that left the colour most of its group took, when that colour would read on the heading's
 * own ground too (`readable`): a heading recoloured because its band changed ground is right, and one
 * on a picture or a gradient (JA Kinetic WordPress's call-to-action card, whose title takes the text
 * colour to read on its glow) is not judged.
 */
import { byPath, dist, hex, PAGE_HELPERS, ratio } from './lib/colour.mjs'

export const kind = 'heading-split'

export const SPLIT = Object.freeze({ same: 6, apart: 24, readable: 3, minGroup: 3 })

export const probe = `(() => {${PAGE_HELPERS}
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\\s+/g, ' ').trim()
  // the first opaque fill under the words; a picture or a gradient on the way (a card's glow) leaves
  // the ground unknown: a heading recoloured to read on it is not judged
  const groundOf = (e) => { for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.backgroundImage !== 'none') return null; const c = ch(cs.backgroundColor); if (c && c.a > 0.9) return c } return ch(getComputedStyle(document.documentElement).backgroundColor) }
  const headings = []
  for (const e of document.querySelectorAll('h1, h2, h3, .h1, .h2, .h3')) {
    if (headings.length >= 200) break
    const text = own(e)
    if (text.length < 2 || e.closest('header, footer, nav, a, button')) continue
    const cs = getComputedStyle(e)
    if (!seen(e, cs)) continue
    const fg = ch(cs.color)
    const ground = groundOf(e)
    if (!fg || !ground) continue
    const level = (/^h([1-3])$/i.exec(e.tagName) || /(?:^|\\s)h([1-3])(?:\\s|$)/.exec(e.className) || [])[1] || '0'
    headings.push({ path: pathOf(e), at: label(e), text: text.slice(0, 40), level, fg, ground })
  }
  return { headings }
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const now = byPath(worn?.data?.headings)
  // the template's headings of one level, grouped by colour
  /** @type {{ level: string, c: any, items: any[] }[]} */
  const groups = []
  for (const h of plain?.data?.headings ?? []) {
    const g = groups.find((x) => x.level === h.level && dist(x.c, h.fg) <= SPLIT.same)
    if (g) g.items.push(h)
    else groups.push({ level: h.level, c: h.fg, items: [h] })
  }
  const findings = []
  for (const g of groups) {
    const pairs = g.items
      .map((h) => ({ was: h, is: now.get(h.path) }))
      .filter((p) => p.is && p.is.text === p.was.text)
    if (pairs.length < SPLIT.minGroup) continue
    // the colour most of the group took under the system
    const tally = new Map()
    for (const p of pairs) {
      const key = [...tally.keys()].find((k) => dist(tally.get(k).c, p.is.fg) <= SPLIT.same)
      if (key) tally.get(key).n++
      else tally.set(hex(p.is.fg), { c: p.is.fg, n: 1 })
    }
    const main = [...tally.values()].sort((a, b) => b.n - a.n)[0]
    if (main.n * 2 <= pairs.length) continue
    for (const p of pairs) {
      if (dist(p.is.fg, main.c) <= SPLIT.apart) continue
      if (ratio(main.c, p.is.ground) < SPLIT.readable) continue
      findings.push({
        at: `${p.is.at} "${p.is.text.slice(0, 32)}"`,
        why: `${hex(p.is.fg)} where ${main.n} of its ${pairs.length} sibling headings (one colour on the template's page) take ${hex(main.c)}, which reads ${ratio(main.c, p.is.ground).toFixed(2)}:1 on its ground`
      })
    }
  }
  return { count: findings.length, findings }
}
