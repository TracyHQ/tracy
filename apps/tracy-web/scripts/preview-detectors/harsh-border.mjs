/**
 * Hard light lines on a dark page in a colour of the system (E3 of PR 2, 14/10/2026). A template draws
 * its grid and card rims as faint hairlines; the slot maps their colour to a role, and when that role
 * is the text colour the hairlines turn into bright lines across every section. Under Moxie: JA Space
 * Joomla's client logo grid, JA Vogue Joomla's section and card grid, JA Voyara Joomla's feature,
 * testimonial and journey cards, all ruled in Moxie's cream text colour (#f4efd4) on #1a1a1a.
 *
 * A finding is an element of the worn page with a harsh line (`harshLines`: thin, light on a dark
 * ground, far above the system's softest border role and far above what the template drew) that is
 * not the template's own colour; a harsh line the template's own colour kept is `border-colour`'s
 * (TPL-1). The rule is BORDER-1 (worth fixing: the page reads, it looks harsh).
 */
import { BORDERS_PROBE, harshLines, keptLine } from './lib/borders.mjs'
import { byPath, hex, ratio, systemOf } from './lib/colour.mjs'

export const kind = 'harsh-border'

export const probe = BORDERS_PROBE

/** @param {{ worn: any, plain: any, systemColours: string[] }} input */
export function detect({ worn, plain, systemColours }) {
  // the page's roles too: the harness's list leaves the status roles (success, warn, danger) out
  const sys = [...systemOf(systemColours), ...(worn?.data?.roles ?? []).map((/** @type {any} */ r) => r.c)]
  const was = byPath(plain?.data?.lines)
  const findings = []
  for (const x of worn?.data?.lines ?? []) {
    const p = was.get(x.path)
    const hard = harshLines(x, p, worn.data.roles).filter((/** @type {any} */ l) => !keptLine(l, p, sys))
    if (!hard.length) continue
    findings.push({
      at: x.at,
      colour: hex(hard[0].c),
      ground: hex(x.ground),
      ratio: Math.round(ratio(hard[0].c, x.ground) * 100) / 100,
      sides: hard.map((/** @type {any} */ l) => `${l.side} ${l.width}px`).join(', '),
      size: `${x.w}×${x.h}`
    })
  }
  return { count: findings.length, findings }
}
