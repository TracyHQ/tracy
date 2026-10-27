/**
 * Shapes painted in the template's colours (D2 of PR 2, 14/10/2026): inline SVG fill and stroke, and
 * the shapes a stylesheet draws with a pseudo-element (a background or a border triangle). The slot's
 * role swap reaches neither: ja-mood's light grey and indigo section wedges (`.elementor-shape-fill`)
 * and the green triangle on its module titles stayed the template's on a black page.
 *
 * A fill is the template's when the same shape had the same colour on the plain page and it is not a
 * colour of the system (channel distance only: a template's light grey is not the system's cream).
 * Pictures are left out on purpose, and listed in `excluded` with the reason: a raster (an <img>, an
 * SVG <image>, a pseudo-element painting url(...)) cannot be recoloured by any stylesheet (ja-donate's
 * paint-brush strokes are PNGs), and an SVG that says it is a picture (role=img) is drawn art; that is
 * the template's art, not a missed role.
 */
import { byPath, DETECTOR_LIMITS, dist, hex, ofSystem, PAGE_HELPERS, systemOf } from './lib/colour.mjs'

export const kind = 'shape-fill'

/** Smallest shape (px²) judged: an icon glyph is below it, a wedge or a triangle above. */
const MIN_AREA = 1500

export const probe = `(() => {${PAGE_HELPERS}
  const shapes = []
  const excluded = []
  for (const e of document.querySelectorAll('svg path, svg circle, svg rect, svg ellipse, svg polygon, svg polyline, svg line')) {
    if (shapes.length >= 400) break
    if (e.closest('defs, clipPath, mask, pattern, symbol, marker')) continue
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r) continue
    const owner = e.closest('svg')
    // a shape shows only inside its SVG's box: JA Podcast's 24px Spotify icon has a path whose bounding box
    // runs to 80×24 past it (clipped), read as a shape on every page (16/10/2026)
    const o = owner.getBoundingClientRect()
    const shown = Math.max(0, Math.min(r.right, o.right) - Math.max(r.left, o.left)) * Math.max(0, Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top))
    if (shown < ${MIN_AREA}) continue
    // an SVG that says it is a picture (role=img: Bootstrap's image placeholders on JA Vega's typography
    // page, 16/10/2026) is the template's art like a raster, not a shape the slot should recolour
    if (owner.closest('svg[role=img]')) { if (excluded.length < 20 && !excluded.some((x) => x.path === pathOf(owner))) excluded.push({ path: pathOf(owner), at: label(owner.parentElement || owner) + ' svg', reason: 'an SVG that is a picture (role=img)' }); continue }
    const at = label(owner.parentElement || owner) + ' svg ' + e.tagName.toLowerCase() + (e.getAttribute('class') ? '.' + e.getAttribute('class').trim().split(/\\s+/)[0] : '')
    const colours = []
    const fill = /^url/.test(cs.fill) ? null : ch(cs.fill)
    if (fill && +cs.fillOpacity >= 0.5 && fill.a >= 0.5) colours.push(fill)
    const stroke = /^url/.test(cs.stroke) ? null : ch(cs.stroke)
    if (stroke && stroke.a >= 0.5 && parseFloat(cs.strokeWidth) >= 2) colours.push(stroke)
    if (colours.length) shapes.push({ path: pathOf(e), at, area: Math.round(shown), colours })
  }
  for (const e of document.querySelectorAll('svg image')) {
    const r = e.getBoundingClientRect()
    if (r.width * r.height >= ${MIN_AREA} && excluded.length < 20) excluded.push({ at: label(e.closest('svg').parentElement || e) + ' svg image', reason: 'raster inside an SVG' })
  }
  for (const e of document.querySelectorAll('body *')) {
    if (shapes.length >= 600) break
    if (!seen(e, getComputedStyle(e))) continue
    for (const part of ['::before', '::after']) {
      const s = getComputedStyle(e, part)
      if (s.content === 'none' || s.content === 'normal' || s.display === 'none' || +s.opacity === 0) continue
      const bw = ['Top', 'Right', 'Bottom', 'Left'].map((k) => parseFloat(s['border' + k + 'Width']) || 0)
      const w = (parseFloat(s.width) || 0) + bw[1] + bw[3]
      const h = (parseFloat(s.height) || 0) + bw[0] + bw[2]
      if (w * h < ${MIN_AREA}) continue
      if (/url\\(/.test(s.backgroundImage)) { if (excluded.length < 20) excluded.push({ at: label(e) + part, reason: 'raster background of a pseudo-element' }); continue }
      const colours = []
      const bg = ch(s.backgroundColor)
      if (bg && bg.a >= 0.5) colours.push(bg)
      // a border thick enough to be a shape (a CSS triangle), not a hairline
      ;['Top', 'Right', 'Bottom', 'Left'].forEach((k, i) => { const c = ch(s['border' + k + 'Color']); if (bw[i] >= 4 && s['border' + k + 'Style'] !== 'none' && c && c.a >= 0.5) colours.push(c) })
      if (colours.length) shapes.push({ path: pathOf(e) + part, at: label(e) + part, area: Math.round(w * h), colours })
    }
  }
  return { shapes, excluded }
})()`

/** @param {{ worn: any, plain: any, systemColours: string[] }} input */
export function detect({ worn, plain, systemColours }, t = DETECTOR_LIMITS) {
  const sys = systemOf(systemColours)
  const plainOf = byPath(plain?.data?.shapes)
  const findings = []
  for (const s of worn?.data?.shapes ?? []) {
    const was = plainOf.get(s.path)
    if (!was) continue
    const kept = s.colours.filter(
      (/** @type {any} */ c) =>
        !ofSystem(c, sys, t) && was.colours.some((/** @type {any} */ p) => dist(p, c) <= t.same)
    )
    if (kept.length) findings.push({ at: s.at, colours: [...new Set(kept.map(hex))], area: s.area })
  }
  return { count: findings.length, findings, excluded: worn?.data?.excluded ?? [] }
}
