/**
 * The visible lines of a page, as source for a probe (E3 of PR 2, 14/10/2026), shared by the two
 * border detectors: `border-colour` (a line in a template colour, TPL-1) and `harsh-border` (a line
 * far harder than the system's border role, BORDER-1). Form fields (FORM-1) and buttons (BTN-1) are
 * left to their own detectors; pseudo-elements to `pseudo-colour` and `shape-fill`.
 *
 * Each entry: `{ path, at, w, h, ground, lines: [{ side, c, width, length }] }`, the ground being the
 * element's own opaque fill or the nearest ancestor's (a line is drawn at the edge of its own box);
 * null over a picture. `roles` comes with it (ROLES_IN_PAGE), so a detector can read `--ds-c-border`.
 */
import { BUTTON_SELECTOR } from './buttons.mjs'
import {
  chroma,
  DETECTOR_LIMITS,
  dist,
  lum,
  ofSystem,
  PAGE_HELPERS,
  ratio,
  ROLES_IN_PAGE
} from './colour.mjs'

/** A line shorter than this (px) is a glyph's or an icon's, not a rule across the page. */
export const MIN_LINE = 24

export const BORDERS_PROBE = `(() => {${PAGE_HELPERS}${ROLES_IN_PAGE}
  const groundOf = (e) => { for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (/url\\(|gradient/.test(cs.backgroundImage) || /^(IMG|VIDEO|PICTURE)$/.test(x.tagName)) return null; const c = ch(cs.backgroundColor); if (c && c.a > 0.9) return c } return { r: 255, g: 255, b: 255, a: 1 } }
  const skip = 'input, select, textarea, ${BUTTON_SELECTOR}'
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 800) break
    if (e.matches(skip) || e.closest('svg')) continue
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r) continue
    const lines = []
    for (const k of ['Top', 'Right', 'Bottom', 'Left']) {
      const width = parseFloat(cs['border' + k + 'Width']) || 0
      if (width < 1 || /none|hidden/.test(cs['border' + k + 'Style'])) continue
      const c = ch(cs['border' + k + 'Color'])
      if (!c || c.a < 0.5) continue
      const length = Math.round(k === 'Top' || k === 'Bottom' ? r.width : r.height)
      if (length < ${MIN_LINE}) continue
      lines.push({ side: k.toLowerCase(), c, width, length })
    }
    if (!lines.length) continue
    const ground = groundOf(e)
    if (!ground) continue
    out.push({ path: pathOf(e), at: label(e), w: Math.round(r.width), h: Math.round(r.height), ground, lines })
  }
  return { roles: rolesOf(), lines: out }
})()`

export const HARSH_LIMITS = Object.freeze({
  /** a dark ground: luminance under this (PREVIEW_LIMITS.darkPage) */
  darkPage: 0.2,
  /** a hairline or a thin rule, not a shape */
  thin: 3,
  /** a line this hard reads as a rule across the page */
  harsh: 3,
  /** ...and this many times the system's softest border role */
  overRole: 1.5,
  /** ...and this many times what the template drew */
  overPlain: 1.5
})

/**
 * The lines of one worn entry that are harsh: thin, neutral, lighter than a dark ground, at least `harsh`, at
 * least `overRole` times the system's softest border role (`--ds-c-border*`: Moxie's `--ds-c-border`
 * is its text colour, its `--ds-c-border-soft` the line it means for grids) and at least `overPlain`
 * times what the same side had on the template's own page.
 * @param {any} x a worn entry @param {any} p the plain entry of the same path, or undefined
 * @param {any[]} roles the worn page's roles
 */
export function harshLines(x, p, roles, t = HARSH_LIMITS) {
  if (lum(x.ground) >= t.darkPage) return []
  const borders = (roles ?? []).filter((r) => /^border(-|$)/.test(r.name)).map((r) => r.c)
  const soft = borders.length ? Math.min(...borders.map((b) => ratio(b, x.ground))) : null
  return x.lines.filter((/** @type {any} */ l) => {
    // a neutral rule; a line in a brand colour (an accent underline) is decoration, not a grid
    if (l.width > t.thin || chroma(l.c) >= DETECTOR_LIMITS.brandChroma || lum(l.c) <= lum(x.ground))
      return false
    const r = ratio(l.c, x.ground)
    if (r < t.harsh || (soft && r < t.overRole * soft)) return false
    const q = p?.lines.find((/** @type {any} */ o) => o.side === l.side)
    return !q || r >= t.overPlain * ratio(q.c, p.ground)
  })
}

/**
 * A line in the template's own colour: off every colour of the system and the same as the same side
 * on the template's own page.
 * @param {any} l a line @param {any} p the plain entry @param {any[]} sys the system's colours
 */
export const keptLine = (l, p, sys, t = DETECTOR_LIMITS) =>
  !!p &&
  !ofSystem(l.c, sys, t) &&
  p.lines.some((/** @type {any} */ q) => q.side === l.side && dist(q.c, l.c) <= t.same)
