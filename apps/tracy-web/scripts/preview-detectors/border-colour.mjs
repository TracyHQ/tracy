/**
 * Lines left in a template colour (E3 of PR 2, 14/10/2026). The base probe reads fills, so a border
 * the template paints stays under every system: JA Rent Joomla under Moxie kept its header's 5 px blue
 * underline (rgb(7,154,238)) and its topbar's light grey hairlines (#f1f1f1), faint on the template's
 * white, hard on Moxie's #1a1a1a; JA Seven Joomla kept its #e9ecef section rules on black.
 *
 * A finding is an element whose border, on the worn page, is the template's own colour (off every
 * colour of the system, the same colour as on the template's own page) and either a brand colour
 * (chroma from `brandChroma`) that shows on its ground, or a neutral turned harsh (`harshLines`). A
 * faint template neutral is left alone. A harsh line in a colour of the system is `harsh-border`'s.
 * The rule is TPL-1 (the template's own colours stay visible).
 */
import { BORDERS_PROBE, harshLines, keptLine } from './lib/borders.mjs'
import { byPath, chroma, DETECTOR_LIMITS, hex, ratio, systemOf } from './lib/colour.mjs'

export const kind = 'border-colour'

/** A line shows on its ground from this contrast. */
const SEEN = 1.2

export const probe = BORDERS_PROBE

/** @param {{ worn: any, plain: any, systemColours: string[] }} input */
export function detect({ worn, plain, systemColours }, t = DETECTOR_LIMITS) {
  // the page's roles too: the harness's list leaves the status roles (success, warn, danger) out
  const sys = [...systemOf(systemColours), ...(worn?.data?.roles ?? []).map((/** @type {any} */ r) => r.c)]
  const was = byPath(plain?.data?.lines)
  const findings = []
  for (const x of worn?.data?.lines ?? []) {
    const p = was.get(x.path)
    if (!p) continue
    const harsh = new Set(harshLines(x, p, worn.data.roles))
    const kept = x.lines.filter(
      (/** @type {any} */ l) =>
        keptLine(l, p, sys, t) &&
        ((chroma(l.c) >= t.brandChroma && ratio(l.c, x.ground) >= SEEN) || harsh.has(l))
    )
    if (!kept.length) continue
    findings.push({
      at: x.at,
      colour: hex(kept[0].c),
      sides: kept.map((/** @type {any} */ l) => `${l.side} ${l.width}px`).join(', '),
      size: `${x.w}×${x.h}`
    })
  }
  return { count: findings.length, findings }
}
