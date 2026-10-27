/**
 * CSS triangles the system flattened (Akemi's eye check of JA Tour, 17/10/2026). The menu's dropdown
 * caret is a pseudo-element of no size drawn by its borders: one coloured side, the two beside it
 * transparent, which makes a triangle. Under a system the carets turned into flat dashes: a slot rule
 * gave every side of the border a colour. Nothing read a shape drawn by borders (shape-fill reads SVG
 * and filled pseudo-elements, pseudo-colour reads their colour only).
 *
 * In the page: every small element and ::before/::after (outer box at most `maxOuter` px) with at least
 * two bordered sides: how many sides show (a width, a style, a colour of some alpha), how many bordered
 * sides are transparent (`cut`), its content box and outer size. A finding is a shape the template cuts
 * with transparent sides (a triangle or arrow; JA Tour's i.item-caret::before, an 8 × 4 px box with only its
 * top border coloured) whose showing sides changed worn (Notion coloured its left and right too: a bar),
 * whose content box grew past `maxCore` where it drew by borders alone, or whose outer box turned flat
 * (one side below `flat` of the other where it was not).
 */
import { PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'caret-shape'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

export const CARET_LIMITS = Object.freeze({ maxCore: 2, maxOuter: 40, flat: 0.4 })

export const probe = `(() => {${PAGE_HELPERS}
  const SIDES = ['Top', 'Right', 'Bottom', 'Left']
  const shapeOf = (cs) => {
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null
    const wide = SIDES.filter((k) => (parseFloat(cs['border' + k + 'Width']) || 0) > 0 && !/none|hidden/.test(cs['border' + k + 'Style']))
    if (wide.length < 2) return null
    const core = Math.round(Math.max(parseFloat(cs.width) || 0, parseFloat(cs.height) || 0) * 10) / 10
    const shows = wide.filter((k) => { const c = ch(cs['border' + k + 'Color']); return c && c.a > 0.1 })
    if (!shows.length) return null
    const w = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0) + (parseFloat(cs.width) || 0)
    const h = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0) + (parseFloat(cs.height) || 0)
    if (w > ${CARET_LIMITS.maxOuter} || h > ${CARET_LIMITS.maxOuter}) return null
    return { shows: shows.map((k) => k.toLowerCase()).join(','), cut: wide.length - shows.length, core, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 }
  }
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 400) break
    const cs = getComputedStyle(e)
    if (cs.display === 'none') continue
    const parts = [['', cs]]
    for (const p of ['::before', '::after']) { const s = getComputedStyle(e, p); if (s.content && s.content !== 'none' && s.content !== 'normal') parts.push([p, s]) }
    for (const [p, s] of parts) {
      if (!p && e.children.length) continue
      const sh = shapeOf(s)
      if (sh) out.push({ path: pathOf(e) + p, at: label(e) + p, ...sh })
    }
  }
  return out
})()`

const flat = (/** @type {any} */ s, t = CARET_LIMITS) => Math.min(s.w, s.h) < t.flat * Math.max(s.w, s.h)

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, t = CARET_LIMITS) {
  const wornOf = new Map((worn?.data ?? []).map((/** @type {any} */ x) => [x.path, x]))
  const findings = []
  for (const was of plain?.data ?? []) {
    const now = wornOf.get(was.path)
    // a shape the template cuts with transparent border sides (a triangle, an arrow): the cut is the shape
    if (!now || !(was.cut > 0)) continue
    // a triangle is one showing side (or two at a corner); a bar or a box shows three or four
    const changed =
      now.shows.split(',').length !== was.shows.split(',').length ||
      (was.core <= t.maxCore && now.core > t.maxCore)
    if (!changed && !(flat(now, t) && !flat(was, t))) continue
    findings.push({
      at: was.at,
      why: `border sides shown: ${was.shows} on the template, ${now.shows} worn (${was.w}×${was.h} → ${now.w}×${now.h}px)`,
      by: 'system'
    })
  }
  return { count: findings.length, findings }
}
