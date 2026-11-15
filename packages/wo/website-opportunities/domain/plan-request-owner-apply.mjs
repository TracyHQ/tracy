// What code does itself for a change request (#609 over #617), from `ownerEditsOf` (`plan-request-owner-words.mjs`),
// before the model's changes are applied:
// - an owner value enters the needs profile as the owner's answer (source `owner-statement`, read "Your answer"): a
//   value of a kind the profile holds replaces it, as a plan card edit of that fact does; a new one is `fresh`, so the
//   gate places it as a first plan's (it is not data the customer took off: `carriedLeftOutOf`, `customerTakenOffOf`);
// - a rename is the plan card's edit of `items[<id>].label`, held to the same gate (`gateEditedPlan`), which writes the
//   new name into the profile item the page writer reads; the plan keeps its revision here, the revision raises it once;
// - an item no page shows, named for removal, is left out as the customer asked (`REQUESTED_OFF_REASON`).
// Every sentence the customer reads from here carries a stable `code`. `withoutContradicted` takes out a not done line
// of the model that a part code did contradicts (a value the owner just gave, an item code renamed or took off), so the
// customer is never told the plan lacks data they gave or cannot do what it did. Pure: the plan and profile given are
// never changed.
import { OWNER_SOURCE_ID } from './owner-facts-flow.mjs'
import { PLAN_EDIT_SCHEMA } from './build-contract-plan-edit.mjs'
import { FACT_LABELS } from './plan-data.mjs'
import { gateEditedPlan } from './plan-edit-gate.mjs'
import { REQUESTED_OFF_REASON } from './plan-request-taken-off.mjs'
import { namesWords } from './plan-request-words.mjs'
import { idOf } from './plan-data.mjs'
import { HOURS_KIND, hoursDisplayOf } from './plan-hours-display.mjs'
import { rowDataIdsOf } from './plan-accounting.mjs'

/** The stable codes of the lines code writes for these parts of a request. */
export const OWNER_EDIT_CODES = Object.freeze({
  valueSaved: 'owner_value_saved',
  itemRenamed: 'item_renamed',
  itemTakenOff: 'item_taken_off',
  renameRefused: 'item_rename_refused',
  valueNotShown: 'owner_value_not_shown'
})
const list = (value) => (Array.isArray(value) ? value : [])
const VALUE_CUES = Object.freeze({
  'contact.hours': /\b(?:hours?|open|opening|closed?)\b/iu,
  'contact.phone': /\b(?:phone|call|number|telephone)\b/iu,
  'contact.email': /\b(?:e-?mail|mail)\b/iu,
  'contact.cta_url': /\b(?:book|booking|link|button)\b/iu
})
const RENAME_CUE = /\b(?:renam\w*|names?|call\w*|titles?)\b/iu
const REMOVE_CUE = /\b(?:remov\w*|delet\w*|drop\w*|hid\w*|tak\w*\s+(?:it\s+)?off|not\s+shown)\b/iu

/** The owner's values written into a copy of the profile, with the ids of the facts that are new. */
function withValues(profile, values, lines) {
  const next = structuredClone(profile)
  const fresh = new Set()
  let saved = 0
  for (const { kind, value } of values) {
    next.facts ??= {}
    const held = list(next.facts[kind])
    const label = FACT_LABELS[kind] ?? kind
    if (held[0]?.value === value && held[0]?.sources?.includes(OWNER_SOURCE_ID)) continue
    if (held[0]) {
      const conflict = list(next.conflicts).find((c) => c.id === held[0].conflict)
      if (conflict) Object.assign(conflict, { chosen: value, chosenBy: 'plan-request' })
      held[0] = { ...held[0], value, sources: [OWNER_SOURCE_ID] }
    } else {
      next.facts[kind] = [{ value, sources: [OWNER_SOURCE_ID], confidence: 'single-source' }]
      fresh.add(idOf(kind))
    }
    // Opening hours are said in their display form, never the structured value (`plan-hours-display.mjs`).
    const shown = kind === HOURS_KIND ? hoursDisplayOf(value) : null
    lines.push({
      code: OWNER_EDIT_CODES.valueSaved,
      text: `Your answer is saved: ${label}, ${shown?.display ?? value}.`,
      params: { kind, label, value, ...(shown ? { display: shown.display } : {}) }
    })
    saved += 1
  }
  if (saved > 0 && !list(next.sources).some((s) => s.id === OWNER_SOURCE_ID))
    next.sources = [...list(next.sources), { id: OWNER_SOURCE_ID, origin: 'answer' }]
  return { profile: next, fresh }
}

/**
 * Apply the parts of a request code does itself.
 * @param {{plan: object, profile: object, edits: object, kit: object}} input `edits` from `ownerEditsOf`; `kit` the
 *   block store, page recipes and library of the plan
 * @returns {{plan: object, profile: object, fresh: Set<string>, takenOff: Map<string, string>,
 *   lines: Array<{code: string, text: string}>, notDone: Array<{code: string, what: string, reason: string,
 *   why: string}>}}
 */
export function applyOwnerEdits({ plan, profile, edits, kit }) {
  const lines = []
  const notDone = []
  let current = { plan, profile }
  for (const rename of edits.renames) {
    const edit = {
      schema: PLAN_EDIT_SCHEMA,
      id: `request-rename-${rename.id}`,
      plan: { id: current.plan.id, revision: current.plan.revision },
      changes: [{ field: `items[${rename.id}].label`, value: rename.to }]
    }
    const gated = gateEditedPlan({ ...kit, plan: current.plan, profile: current.profile, edit })
    if (gated.ok) {
      current = { plan: { ...gated.plan, revision: plan.revision }, profile: gated.profile }
      lines.push({
        code: OWNER_EDIT_CODES.itemRenamed,
        text: `${rename.from} is now called ${rename.to}.`,
        params: { item: rename.id, from: rename.from, name: rename.to }
      })
    } else
      notDone.push({
        code: OWNER_EDIT_CODES.renameRefused,
        params: { item: rename.id, from: rename.from, name: rename.to },
        what: `Rename ${rename.from}`,
        reason: 'outside_plan',
        why: gated.problems[0]?.message ?? 'The plan cannot take this name.'
      })
  }
  const valued = withValues(current.profile, edits.values, lines)
  const takenOff = new Map()
  for (const removal of edits.removals) {
    takenOff.set(removal.id, REQUESTED_OFF_REASON)
    lines.push({
      code: OWNER_EDIT_CODES.itemTakenOff,
      text: `${removal.label} stays off your site, as you asked.`,
      params: { item: removal.id, name: removal.label }
    })
  }
  return { plan: current.plan, profile: valued.profile, fresh: valued.fresh, takenOff, lines, notDone }
}

/**
 * The model's not done lines without those a part code did contradicts: a line on a value kind the owner just gave,
 * or on renaming or taking off an item code renamed or took off (its cue, and no other item's label).
 */
export function withoutContradicted(notDone, edits, plan) {
  const labels = list(plan?.items).map((i) => i.label)
  const done = [
    ...edits.values.map((v) => ({ cue: VALUE_CUES[v.kind], names: [] })),
    ...edits.renames.map((r) => ({ cue: RENAME_CUE, names: [r.from, r.to] })),
    ...edits.removals.map((r) => ({ cue: REMOVE_CUE, names: [r.label] }))
  ].filter((d) => d.cue)
  return notDone.filter(({ what, why }) => {
    const text = `${what} ${why}`
    return !done.some(
      ({ cue, names }) =>
        cue.test(text) &&
        !labels.some((l) => !names.includes(l) && typeof l === 'string' && namesWords(text, l))
    )
  })
}

/**
 * A not done line for each value the owner gave in this request that the revised plan shows nowhere (their design has
 * no place for it, or every place is taken): the owner asked to show it, so a left out entry alone is not enough.
 * `params.because` is the code of the plan's left out entry of that fact.
 */
export function ownerValuesNotShown(edits, revised) {
  const shown = new Set([
    ...list(revised.pages).flatMap((p) => p.blocks.flatMap((b) => b.data)),
    ...rowDataIdsOf(revised.pages)
  ])
  return list(edits?.values)
    .filter(({ kind }) => !shown.has(idOf(kind)))
    .map(({ kind }) => {
      const label = FACT_LABELS[kind] ?? kind
      const entry = list(revised.leftOut).find((e) => e.item === idOf(kind))
      const because = entry?.code ?? 'not_shown'
      return {
        code: OWNER_EDIT_CODES.valueNotShown,
        params: { kind, label, because },
        what: `Show your ${label.toLowerCase()} on the site`,
        reason: 'no_recipe',
        why:
          because === 'no_place_in_design'
            ? 'Your answer is saved, but your design has no place that shows it.'
            : `Your answer is saved. ${entry?.reason ?? 'The plan has no place that shows it.'}`
      }
    })
}
