// The left out line of opening hours the brief holds (#575 walk, the newest plan of a racquet club lost it). Commit
// 86196a7a35 made the hours a protected fact and the model's left out entries without an id dropped
// (`left_out_unkeyed`): right for hours in the plan's data, which placement reports as `no_place_in_design` when no
// block of the kit has an hours field. But hours the brief HOLDS never reach the plan's data (`needs-research.mjs`), so
// only `briefLeftOutOf` (`plan-composer-brief.mjs`) can report them, and it knew two cases only: hours waiting for the
// owner (`hours_unconfirmed`) and sources that disagree. Once the owner answered "Leave hours off the site" in the
// build chat (`held-hours-question.mjs`), the brief holds them by the owner's choice, neither case matched, the model's
// own entry for them had no id and was dropped, and the card said nothing about the hours at all.
// The rule here, pure and read from the kit's block store like placement's:
//   - the brief found hours (a fact, withheld values or disagreeing sources) and keeps them off the site, and
//   - no template block declares a field of kind `contact.hours`: `no_place_in_design`, the same line and code placement
//     writes for hours in the data, whatever held them, because the design could not show them in any case;
//   - a kit with an hours field: the brief's own case (`hours_unconfirmed`, `hours_sources_disagree`), or
//     `owner_withheld` when the owner left them off.
// No hours found at all gives no line. Never an hours value.
import { briefLeftOutOf, HELD_HOURS_LEFT_OUT, heldHoursOf } from './plan-composer-brief.mjs'
import { hasFieldOfKind } from './plan-field-only-facts.mjs'
import { FACT_LEFT_OUT } from './plan-placement-facts.mjs'
import { WITHHELD_REASON } from './plan-withheld.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const WHAT = 'Opening hours'
const HOURS_CODES = new Set(Object.values(HELD_HOURS_LEFT_OUT).map((e) => e.code))

/** Whether any template block of the kit has a field of kind `contact.hours` (a library block is not the kit's). */
export function kitShowsHours(blocks) {
  const all = blocks instanceof Map ? [...blocks.values()] : list(blocks)
  return all.some((d) => d?.source !== 'library' && hasFieldOfKind(d, 'contact.hours'))
}

/**
 * The left out entry of the hours the brief holds, or null (rules above).
 * @param {object | null | undefined} brief the content brief research stored
 * @param {Map<string, object> | object[]} blocks the kit's block descriptions (the composer's `blocks`)
 */
export function heldHoursLeftOutOf(brief, blocks) {
  const held = list(brief?.missing).find((m) => m?.field === 'hours')
  if (!held) return null
  const fact = list(brief?.facts).find((f) => f?.field === 'hours' && f.onSite === false)
  const found = Boolean(fact) || list(held.conflicting).length > 0 || list(held.withheld).length > 0
  if (!found) return null
  if (!kitShowsHours(blocks)) return { what: WHAT, kind: 'feature', ...FACT_LEFT_OUT.no_place_in_design }
  const coded = heldHoursOf(brief)
  if (coded) return { ...coded, kind: 'feature' }
  const ownerLeft = fact?.decidedBy === 'owner' || list(fact?.reasons).includes('owner-left-off')
  return ownerLeft ? { what: WHAT, kind: 'feature', reason: WITHHELD_REASON, code: 'owner_withheld' } : null
}

/**
 * `briefLeftOutOf` with its hours line decided by `heldHoursLeftOutOf`: the composer's hook (`composerContextOf`,
 * `leftOut`), in place of `briefLeftOutOf(brief)`. `placed`: the brief channels the plan holds as facts.
 */
export function briefLeftOutWithHoursOf(brief, blocks, placed = new Set()) {
  const hours = heldHoursLeftOutOf(brief, blocks)
  return [...briefLeftOutOf(brief, placed).filter((e) => !HOURS_CODES.has(e.code)), ...(hours ? [hours] : [])]
}
