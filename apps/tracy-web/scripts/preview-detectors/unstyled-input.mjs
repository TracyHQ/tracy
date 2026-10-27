/**
 * Form fields the system does not dress (G3 of PR 2, 14/10/2026): a text field, a select or a text
 * area keeps the browser's or the template's own look while the page around it wears the system. JA
 * Vega WordPress's footer newsletter fields stayed small light boxes on Moxie's dark footer, on the
 * light and the dark visitor scheme alike.
 *
 * A field counts when, wearing the system, (0) it is still the browser's own field (Chrome's inset
 * border on every side: no stylesheet of the template or the slot reached it), (1) it has a fill of its own
 * that is none of the system's ground roles and stands out from its surroundings (`standOut`: a light box on a dark ground or the
 * reverse), (2) its words do not read on its fill (`textFloor`), or (3) it cannot be seen as a field:
 * fill and every border the same as its surroundings, and no box drawn around it (`box`: a search bar's
 * bordered wrapper around a bare input). `by` says whether the template's own page had
 * the same field already broken.
 */
import {
  byPath,
  chroma,
  DETECTOR_LIMITS,
  dist,
  hex,
  PAGE_HELPERS,
  ratio,
  ROLES_IN_PAGE
} from './lib/colour.mjs'
import { groundsOf } from './lib/colour.mjs'

export const kind = 'unstyled-input'

const LIMITS = Object.freeze({ standOut: 3, textFloor: 3, seen: 1.25, minWidth: 40, minHeight: 12 })

export const probe = `(() => {${PAGE_HELPERS}${ROLES_IN_PAGE}
  const opaque = (x) => { const c = ch(getComputedStyle(x).backgroundColor); return c && c.a > 0.9 ? c : null }
  // a ring drawn with box-shadow (no offset, no blur, a spread of 1px or more) is the box's line: Tracy Base's
  // chips draw their outline so (--tracy-ring), the month and limit selects of its archive and category list
  // sit bare inside them (FORM-1, 16/10/2026)
  const rings = (s) => [...String(s.boxShadow).matchAll(/(rgba?\\([^)]*\\))\\s+0px\\s+0px\\s+0px\\s+([\\d.]+)px/g)].filter((m) => parseFloat(m[2]) >= 1).map((m) => ch(m[1])).filter((c) => c && c.a > 0.3)
  const groundOf = (x) => { for (let y = x; y; y = y.parentElement) { if (/url\\(|gradient/.test(getComputedStyle(y).backgroundImage)) return null; const c = opaque(y); if (c) return c } return { r: 255, g: 255, b: 255, a: 1 } }
  const fields = []
  for (const e of document.querySelectorAll('input, select, textarea')) {
    if (fields.length >= 100) break
    if (e.tagName === 'INPUT' && /^(hidden|checkbox|radio|submit|button|reset|image|range|color|file)$/i.test(e.type)) continue
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || r.width < ${LIMITS.minWidth} || r.height < ${LIMITS.minHeight}) continue
    const fill = ch(cs.backgroundColor)
    const borders = ['Top', 'Right', 'Bottom', 'Left'].map((s) => (parseFloat(cs['border' + s + 'Width']) || 0) >= 1 ? ch(cs['border' + s + 'Color']) : null).filter((c) => c && c.a > 0.3)
    // the browser's own field: Chrome draws a text field with a 2px inset border on every side
    const ua = ['Top', 'Right', 'Bottom', 'Left'].every((s) => cs['border' + s + 'Style'] === 'inset')
    // the box the template draws around a bare field (a search bar: a transparent, borderless input inside
    // a bordered wrapper that also holds its icon and button): the nearest of two ancestors no taller than
    // the field plus 32px, with an opaque fill or a border of its own (JA Kinetic Joomla's finder, 15/10/2026)
    let box = null
    for (let y = e.parentElement, i = 0; y && i < 2 && !box; y = y.parentElement, i++) {
      const ys = getComputedStyle(y)
      const yr = y.getBoundingClientRect()
      if (yr.height > r.height + 32 || yr.width < r.width) break
      const yb = ['Top', 'Right', 'Bottom', 'Left'].map((s) => (parseFloat(ys['border' + s + 'Width']) || 0) >= 1 ? ch(ys['border' + s + 'Color']) : null).filter((c) => c && c.a > 0.3).concat(rings(ys))
      const yf = opaque(y)
      if (yb.length || yf) box = { fill: yf, borders: yb, around: groundOf(y.parentElement || y) }
    }
    fields.push({ path: pathOf(e), at: label(e) + (e.name ? '[name=' + e.name + ']' : ''), w: Math.round(r.width), h: Math.round(r.height), fill: fill && fill.a > 0.9 ? fill : null, around: groundOf(e.parentElement || e), text: ch(cs.color), borders, ua, ...(box && { box }) })
  }
  return { roles: rolesOf(), fields }
})()`

/** Why a field reads as undressed, or null. @param {any} f @param {any[]} grounds */
const broken = (f, grounds, t = LIMITS, d = DETECTOR_LIMITS) => {
  if (f.ua) return `the browser's own field (inset border${f.fill ? `, fill ${hex(f.fill)}` : ''})`
  if (!f.around) return null
  const fill = f.fill ?? f.around
  if (
    f.fill &&
    chroma(f.fill) < d.brandChroma &&
    !grounds.some((g) => dist(f.fill, g) <= d.systemTolerance) &&
    ratio(f.fill, f.around) >= t.standOut
  )
    return `own fill ${hex(f.fill)} on ${hex(f.around)}, not a ground of the system`
  if (f.text && f.text.a > 0.3 && ratio(f.text, fill) < t.textFloor)
    return `text ${hex(f.text)} on ${hex(fill)} at ${Math.round(ratio(f.text, fill) * 100) / 100}:1`
  // a bare field inside a box the template draws for it is seen through that box
  // (over a picture or a gradient its ground is unknown: a box with a fill or a border of its own is drawn)
  const boxSeen =
    f.box &&
    (!f.box.around
      ? Boolean(f.box.fill || f.box.borders?.length)
      : (f.box.fill && ratio(f.box.fill, f.box.around) >= t.seen) ||
        (f.box.borders ?? []).some((/** @type {any} */ b) => ratio(b, f.box.around) >= t.seen))
  if (
    !boxSeen &&
    ratio(fill, f.around) < t.seen &&
    !(f.borders ?? []).some((/** @type {any} */ b) => ratio(b, f.around) >= t.seen)
  )
    return 'not seen as a field: fill and border match the ground'
  return null
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const grounds = groundsOf(worn?.data?.roles)
  const plainOf = byPath(plain?.data?.fields)
  const findings = []
  for (const f of worn?.data?.fields ?? []) {
    const why = broken(f, grounds)
    if (!why) continue
    const was = plainOf.get(f.path)
    findings.push({
      at: f.at,
      size: `${f.w}×${f.h}`,
      why,
      by: was && broken(was, grounds) ? 'template' : 'system'
    })
  }
  return { count: findings.length, findings }
}
