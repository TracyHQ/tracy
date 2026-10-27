/**
 * Buttons whose label the template's own page cuts while the system's page shows it whole (Akemi's eye
 * check of JA Voyara, 17/10/2026). The footer newsletter's Subscribe was a fixed 42 px square (the design
 * draws an arrow there, Acymailing prints the word in an input), so Template default showed "Subs"; a
 * worn-only rule widened it under a system, and collapsed-button, which judges the worn page, passed it.
 * A customer who takes the system off goes back to the template's look: a cut label there is a defect of
 * the template the readiness check must name.
 *
 * Same reading as collapsed-button (its probe and `broken`), on the template's own page: a finding is a
 * button broken there (label cut, collapsed, hidden without an icon) that the worn page shows whole. One
 * broken on both pages is collapsed-button's finding already.
 */
import { byPath } from './lib/colour.mjs'
import { broken, probe as collapsedProbe } from './collapsed-button.mjs'

export const kind = 'template-cut-label'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

export const probe = collapsedProbe

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const wornOf = byPath(worn?.data)
  const findings = []
  for (const b of plain?.data ?? []) {
    const why = broken(b)
    const now = wornOf.get(b.path)
    if (!why || !now || broken(now)) continue
    findings.push({
      at: b.at,
      text: b.text,
      size: `${b.w}×${b.h}`,
      why: `${why} on the template's own page`,
      by: 'template'
    })
  }
  return { count: findings.length, findings }
}
