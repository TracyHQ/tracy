/**
 * Colours in neither palette (E3 of PR 2, 14/10/2026). A worn page should show the system's colours
 * and, where the template keeps its own, the template's; a colour from neither means a role mapped to
 * something nobody chose (a stale preset, a computed shade). JA Vital Joomla under Moxie: the
 * back-to-top square turned indigo #323183, a colour neither Moxie nor JA Vital paints with.
 *
 * In the page: the fills and words of every shown element, and the page's whole palette (every fill,
 * word, line, SVG paint, pseudo-element paint and gradient stop it uses). A finding is a fill or a
 * word colour of the worn page in a colour (chroma from `brandChroma`; a neutral shade is the base
 * probe's) far from every colour of the system (its `--ds-c-*` roles, status ones included), from every blend of two of them (an accent at some
 * opacity on a ground, white or black), and from every colour of the template's own page.
 */
import { chroma, DETECTOR_LIMITS, dist, hex, PAGE_HELPERS, ROLES_IN_PAGE, systemOf } from './lib/colour.mjs'

export const kind = 'foreign-colour'

/** A fill smaller than this (px²) is a dot, not something the visitor reads as a colour. */
const MIN_FILL = 400

export const probe = `(() => {${PAGE_HELPERS}${ROLES_IN_PAGE}
  const palette = new Map()
  const keep = (c) => { if (c && c.a >= 0.3) palette.set([c.r, c.g, c.b].map(Math.round).join(','), { r: c.r, g: c.g, b: c.b, a: 1 }) }
  const stops = (img) => { for (const m of String(img).matchAll(/rgba?\\([^)]*\\)/g)) keep(ch(m[0])) }
  const items = []
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e)
    if (cs.display === 'none') continue
    keep(ch(cs.backgroundColor)); keep(ch(cs.color)); stops(cs.backgroundImage)
    for (const k of ['Top', 'Right', 'Bottom', 'Left']) if ((parseFloat(cs['border' + k + 'Width']) || 0) >= 1) keep(ch(cs['border' + k + 'Color']))
    if (e instanceof SVGElement) { keep(ch(cs.fill)); keep(ch(cs.stroke)) }
    for (const part of ['::before', '::after']) { const s = getComputedStyle(e, part); if (s.content === 'none' || s.content === 'normal') continue; keep(ch(s.backgroundColor)); keep(ch(s.color)); stops(s.backgroundImage); for (const k of ['Top', 'Right', 'Bottom', 'Left']) keep(ch(s['border' + k + 'Color'])) }
    if (items.length >= 1500) continue
    const r = seen(e, cs)
    if (!r) continue
    const bg = ch(cs.backgroundColor)
    if (bg && bg.a >= 0.5 && cs.backgroundImage === 'none' && r.width * r.height >= ${MIN_FILL}) items.push({ path: pathOf(e), at: label(e), what: 'fill', c: bg })
    if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) { const c = ch(cs.color); if (c && c.a >= 0.5) items.push({ path: pathOf(e), at: label(e), what: 'text', c }) }
  }
  return { items, palette: [...palette.values()], roles: rolesOf().map((r) => r.c) }
})()`

/** Distance from `c` to the segment between `a` and `b` (a blend of the two at any share). */
const toBlend = (/** @type {any} */ c, /** @type {any} */ a, /** @type {any} */ b) => {
  const d = [b.r - a.r, b.g - a.g, b.b - a.b]
  const len = d[0] ** 2 + d[1] ** 2 + d[2] ** 2
  const s = len
    ? Math.max(0, Math.min(1, ((c.r - a.r) * d[0] + (c.g - a.g) * d[1] + (c.b - a.b) * d[2]) / len))
    : 0
  return dist(c, { r: a.r + s * d[0], g: a.g + s * d[1], b: a.b + s * d[2] })
}

/** @param {{ worn: any, plain: any, systemColours: string[] }} input */
export function detect({ worn, plain, systemColours }, t = DETECTOR_LIMITS) {
  // every colour the system names: the harness's list leaves the status roles (success, warn,
  // danger) out, the page's own roles have them
  const sys = [...systemOf(systemColours), ...(worn?.data?.roles ?? [])]
  // no system read: nothing to judge against
  if (!sys.length) return { count: 0, findings: [] }
  const ends = [...sys, { r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }]
  const template = plain?.data?.palette ?? []
  const ofSystem = (/** @type {any} */ c) =>
    ends.some((a, i) => ends.some((b, j) => j >= i && toBlend(c, a, b) <= t.systemTolerance))
  /** @type {Map<string, any>} */
  const byColour = new Map()
  for (const x of worn?.data?.items ?? []) {
    if (chroma(x.c) < t.brandChroma) continue
    if (template.some((/** @type {any} */ p) => dist(p, x.c) <= t.systemTolerance) || ofSystem(x.c)) continue
    const key = hex(x.c)
    const f = byColour.get(key) ?? { at: x.at, colour: key, what: new Set(), count: 0 }
    f.what.add(x.what)
    f.count++
    byColour.set(key, f)
  }
  // one finding per colour, the first place it shows and how many places in all
  const findings = [...byColour.values()].map((f) => ({ ...f, what: [...f.what].join(', ') }))
  return { count: findings.length, findings }
}
