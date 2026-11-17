// The model's left out entries the plan keeps are the ones keyed by data (#575 walk, fourth round): two identical walks
// gave cards of 9 and 16 left out lines because code read the model's words to know what an entry was about (a page
// named in the owner's language was matched to no page type). Spec #575: decide from ids and structured data, never
// from the model's sentences. So, before any rule reads the reply:
// - every page entry of the model is dropped: the pages the plan does not keep are listed by code from the template's
//   page types (`plan-left-out-pages.mjs` `kitPagesLeftOut`), with reasons from the data. A page entry carries the
//   page type it means (`pageType`), so the reply shape names it, but even a valid one is code's to say;
// - a fact or item entry (`kind` item or feature) that gives no `item` id is dropped: what the plan does not show of
//   the business is known by id (`withNamedIds` reads an id the model wrote in `what` first), and code reports by id
//   every fact or item no block shows (placement, `plan-placement*.mjs`), so nothing of the business is lost;
// - a section entry (`kind` block) stays: the plan card never lists one, and the gate names it by its block id.
// Each drop is a recorded fix (`left_out_unkeyed`): nothing the site shows changes. Pure: the reply is copied when
// anything changes.

export const UNKEYED_LEFT_OUT_FIX = 'left_out_unkeyed'

const list = (value) => (Array.isArray(value) ? value : [])

/** Why an entry of the model is dropped, or null to keep it. */
function droppedBecause(entry) {
  if (entry?.kind === 'page') return 'the pages the plan does not keep are listed by code from the template'
  if (entry?.item === undefined && entry?.kind !== 'block')
    return 'a fact or item left out is reported by its id; code reports every one no block shows'
  return null
}

/**
 * The reply with only the left out entries keyed by data.
 * @param {object} reply the model's reply, its shape checked and ids named (`withNamedIds`)
 * @param {(fix: object) => void} fix
 */
export function withKeyedLeftOut(reply, fix) {
  const entries = list(reply?.leftOut)
  if (!entries.some(droppedBecause)) return reply
  const leftOut = entries.filter((entry, i) => {
    const rule = droppedBecause(entry)
    if (rule === null) return true
    fix({ code: UNKEYED_LEFT_OUT_FIX, at: `leftOut[${i}]`, rule, was: entry, now: null })
    return false
  })
  return { ...reply, leftOut }
}
