/**
 * Buttons and links whose hover or focus state the system made look exactly like their rest state
 * (HOVER-2, 20/10/2026). HOVER-1 reads a state that became unreadable; this one reads a state that
 * became identical. A code review of JA Restaurant found it by hand: on the dark variants the grey
 * ground of a button or row and its grey :hover ground both read the surface role, so under a system
 * the visitor's pointer changes nothing while the template's own page darkens or lightens it.
 *
 * No probe of its own: it judges hover-unreadable's readings (`dataOf`), the words' colour, the ground
 * they sit on and every other cue of the state (underline, border, shadow, ring, lift, opacity), at
 * rest and with the state's twin rules on. A finding is an element whose worn state equals its worn
 * rest in all of them, while on the template's own page its state changed the words or the ground
 * visibly, or changed a cue (an underline, a border, a shadow, a ring, a lift the system took away; a
 * cue's colour is held to the words' and ground's thresholds, so rounding never counts).
 */
import { byPath, dist, hex } from './lib/colour.mjs'

export const kind = 'hover-same'

export const dataOf = 'hover-unreadable'

/** Largest channel distance still read as the same colour (rounding, a blended edge). */
const SAME = 3
/** Smallest channel distance the template's own state moves a colour by to count as a visible change. */
const CHANGED = 16

/** A cue without its colours: what a state draws, not in which shade (the words' shift moves an underline's). */
const shapeOf = (/** @type {unknown} */ cue) =>
  String(cue ?? '').replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi, '')

/** The colours a cue names, as channels with their opacity on the same 0-255 scale: an underline's, a border's, a shadow's. */
const shadesOf = (/** @type {unknown} */ cue) =>
  [...String(cue ?? '').matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+(\d*\.?\d+))?/gi)].map(
    (m) => ({
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] === undefined ? 255 : Number(m[4]) * 255
    })
  )

/** Two cues draw the same: one shape, each colour within rounding of the other. */
const sameCue = (/** @type {unknown} */ a, /** @type {unknown} */ b) => {
  if (shapeOf(a) !== shapeOf(b)) return false
  const x = shadesOf(a)
  const y = shadesOf(b)
  return x.length === y.length && x.every((c, i) => dist(c, y[i]) <= SAME)
}

/** A state that looks like rest: the words, their ground and every cue alike. */
const still = (/** @type {any} */ r) =>
  dist(r.rest.fg, r.on.fg) <= SAME && dist(r.rest.bg, r.on.bg) <= SAME && sameCue(r.rest.cue, r.on.cue)

/** The template's own state visibly changed: its words, its ground, a cue's shape or one of its colours. */
const changed = (/** @type {any} */ p) => {
  if (dist(p.rest.fg, p.on.fg) >= CHANGED || dist(p.rest.bg, p.on.bg) >= CHANGED) return true
  if (shapeOf(p.rest.cue) !== shapeOf(p.on.cue)) return true
  const x = shadesOf(p.rest.cue)
  const y = shadesOf(p.on.cue)
  // a shadow that only deepens (rgba 0.2 -> 0.8) is a change too: its opacity counts like a channel. Read
  // on the template's side only, so this can add a finding and never take one away
  return (
    x.length !== y.length || x.some((c, i) => dist(c, y[i]) >= CHANGED || Math.abs(c.a - y[i].a) >= CHANGED)
  )
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const was = byPath(plain?.data)
  const findings = []
  for (const x of worn?.data ?? []) {
    if (!x?.rest || !x?.on || !still(x)) continue
    const p = was.get(x.path)
    if (!p?.rest || !p?.on) continue
    if (!changed(p)) continue
    findings.push({
      at: `${x.at} "${String(x.text ?? '').slice(0, 32)}"`,
      colour: hex(x.on.fg),
      ground: hex(x.on.bg),
      was: `${hex(p.rest.fg)} on ${hex(p.rest.bg)} → ${hex(p.on.fg)} on ${hex(p.on.bg)}`
    })
  }
  return { count: findings.length, findings }
}
