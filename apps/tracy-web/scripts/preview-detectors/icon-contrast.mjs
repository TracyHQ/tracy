/**
 * Icon glyphs the system painted into their ground (Akemi's eye check of JA Tour, 17/10/2026: the login
 * module's input addons kept a near-black fill under Moxie while their user and lock glyphs took a dark
 * grey, so the icons all but vanished). icon-invisible reads icon CONTROLS (a toggle, an icon button with
 * no words); an addon label holds the field's name for a screen reader, so it was not one, and the text
 * rules do not read a glyph.
 *
 * In the page: every icon glyph (`lib/icons.mjs`) with the opaque ground under it. A finding is a glyph
 * that reads under `FLOOR` against its ground on the worn page and read at least that on the template's
 * own page. A glyph over a picture has no colour ground and is left out.
 */
import { byPath, hex, ratio } from './lib/colour.mjs'
import { ICONS_IN_PAGE } from './lib/icons.mjs'

export const kind = 'icon-contrast'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

/** WCAG 1.4.11: graphics a visitor needs read from 3:1. */
export const FLOOR = 3

export const probe = `(() => {${ICONS_IN_PAGE}
  return icons().filter((i) => i.colour && i.ground && i.colour.a > 0.3).map(({ path, at, colour, ground }) => ({ path, at, colour, ground }))
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, floor = FLOOR) {
  const plainOf = byPath(plain?.data)
  const findings = (worn?.data ?? [])
    .filter((/** @type {any} */ g) => {
      const was = plainOf.get(g.path)
      return was && ratio(g.colour, g.ground) < floor && ratio(was.colour, was.ground) >= floor
    })
    .map((/** @type {any} */ g) => {
      const was = plainOf.get(g.path)
      return {
        at: g.at,
        why: `${hex(g.colour)} on ${hex(g.ground)} ${ratio(g.colour, g.ground).toFixed(2)}:1, was ${hex(was.colour)} on ${hex(was.ground)} ${ratio(was.colour, was.ground).toFixed(2)}:1`,
        by: 'system'
      }
    })
  return { count: findings.length, findings }
}
