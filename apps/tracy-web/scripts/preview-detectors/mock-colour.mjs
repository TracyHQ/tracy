/**
 * Colours written by hand into the markup (D2 of PR 2, 14/10/2026): a utility class with an
 * arbitrary value (`bg-[#0a4fa8]`) or an inline `style` colour never reads a token, so the slot cannot
 * swap it. Tracy Base on EmDash drew its hero dashboard mock's bars in the template's blue this way,
 * next to the system's periwinkle.
 *
 * An element counts when its markup names a literal colour for a property, the computed value of that
 * property is the same on the plain page, and it is not a colour of the system. `var(...)` is a token,
 * not a literal. What the element is (a mock, a badge, an article's inline style) does not matter: the
 * visitor sees the template's colour either way.
 */
import { byPath, DETECTOR_LIMITS, dist, hex, ofSystem, PAGE_HELPERS, systemOf } from './lib/colour.mjs'

export const kind = 'mock-colour'

export const probe = `(() => {${PAGE_HELPERS}
  const LIT = '(#[0-9a-fA-F]{3,8}|rgba?\\\\(|hsla?\\\\()'
  const util = new RegExp('(?:^|\\\\s)(?:[a-z0-9-]+:)*(bg|text|border|divide|fill|stroke|ring|outline|decoration)-\\\\[' + LIT)
  const PROP = { bg: 'backgroundColor', background: 'backgroundColor', 'background-color': 'backgroundColor', text: 'color', color: 'color', border: 'borderTopColor', divide: 'borderTopColor', 'border-color': 'borderTopColor', 'border-top-color': 'borderTopColor', 'border-bottom-color': 'borderBottomColor', 'border-left-color': 'borderLeftColor', 'border-right-color': 'borderRightColor', 'border-top': 'borderTopColor', 'border-bottom': 'borderBottomColor', 'border-left': 'borderLeftColor', 'border-right': 'borderRightColor', fill: 'fill', stroke: 'stroke', ring: 'outlineColor', outline: 'outlineColor', decoration: 'textDecorationColor' }
  const out = []
  for (const e of document.querySelectorAll('[class*="-[#"], [class*="-[rgb"], [class*="-[hsl"], [style]')) {
    if (out.length >= 300) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || r.width * r.height < 64) continue
    const props = new Set()
    const cls = typeof e.className === 'string' ? e.className : (e.getAttribute('class') || '')
    for (const c of cls.split(/\\s+/)) { const m = util.exec(c); if (m) props.add(PROP[m[1]]) }
    for (const d of (e.getAttribute('style') || '').split(';')) {
      const i = d.indexOf(':')
      if (i < 0) continue
      const name = d.slice(0, i).trim().toLowerCase()
      const value = d.slice(i + 1)
      if (PROP[name] && name !== 'text' && name !== 'bg' && !/var\\(/.test(value) && new RegExp(LIT).test(value)) props.add(PROP[name])
    }
    const colours = {}
    for (const p of props) { const c = ch(cs[p]); if (c && c.a >= 0.5) colours[p] = c }
    // a text colour no text shows is not seen
    if (colours.color && !(e.innerText || '').trim()) delete colours.color
    if (Object.keys(colours).length) out.push({ path: pathOf(e), at: label(e), source: (e.getAttribute('style') || '').match(new RegExp(LIT)) && !util.test(cls) ? 'style' : 'class', colours })
  }
  return out
})()`

/** @param {{ worn: any, plain: any, systemColours: string[] }} input */
export function detect({ worn, plain, systemColours }, t = DETECTOR_LIMITS) {
  const sys = systemOf(systemColours)
  const plainOf = byPath(plain?.data)
  const findings = []
  for (const e of worn?.data ?? []) {
    const was = plainOf.get(e.path)
    if (!was) continue
    const kept = Object.entries(e.colours).filter(
      ([p, c]) => was.colours[p] && dist(was.colours[p], c) <= t.same && !ofSystem(c, sys, t)
    )
    if (kept.length)
      findings.push({
        at: e.at,
        source: e.source,
        colours: Object.fromEntries(kept.map(([p, c]) => [p, hex(c)]))
      })
  }
  return { count: findings.length, findings }
}
