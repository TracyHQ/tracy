// What the customer took off the plan before a change request (ticket #617, review of 2026-11-14), and the rule that
// holds a change bringing it back. The plan records it two ways:
// - a plan edit that takes data off a block (`plan-edit-gate.mjs`) leaves it shown nowhere and in no left out entry,
//   while every composed or revised plan accounts for every fact and item (`plan-accounting.mjs`): such a gap is the
//   customer's;
// - a change request that took it off (a section removed, a shorter data list) leaves it out with
//   `REQUESTED_OFF_REASON`, and so does every later revision (`carriedLeftOutOf`).
// Data that left with a page the customer removed is not counted: the customer removed the page, not that data.
// A change that shows such data again is made only when the request names it: its label (the plan's, or the one it
// was read with) or the fact's readable name, as whole words (`plan-request-words.mjs`). Otherwise it is
// `change_unlinked`, and the re-compose is told to report the wish under not done. Pure.
import { rowDataIdsOf } from './plan-accounting.mjs'
import { namesWords } from './plan-request-words.mjs'

/** The left out reason of data the customer asked to take off the plan. */
export const REQUESTED_OFF_REASON = 'You asked to take this off the plan.'

const list = (value) => (Array.isArray(value) ? value : [])
const shownOn = (pages) => new Set(list(pages).flatMap((p) => list(p.blocks).flatMap((b) => b.data)))

/** The names a fact or item goes by: the plan's label (a plan edit may have changed it) and the label it was read with. */
export function namesOf(plan, record, id) {
  const onPlan = [...list(plan.facts), ...list(plan.items)].find((d) => d.id === id)?.label
  return [...new Set([onPlan, record?.entry?.label].filter((n) => typeof n === 'string' && n !== ''))]
}

/** The left out entry of the plan that names a fact or item, not among `used`. */
export const leftOutEntryOf = (plan, names, used = new Set()) =>
  list(plan.leftOut).find((e) => names.includes(e.what) && !used.has(e))

/** The ids of what the customer took off the current plan (see the header). */
export function customerTakenOffOf(plan, data) {
  const before = new Set([...shownOn(plan.pages), ...rowDataIdsOf(plan.pages)])
  const out = new Set()
  for (const [id, record] of data.byId) {
    if (record.itemField || data.withheld?.has(id) || before.has(id)) continue
    const entry = leftOutEntryOf(plan, namesOf(plan, record, id))
    if (!entry || entry.reason === REQUESTED_OFF_REASON) out.add(id)
  }
  return out
}

/** The ids a change puts on the plan. */
const dataOf = (change) => [
  ...list(change.data),
  ...list(change.add?.data),
  ...list(change.blocks).flatMap((b) => list(b?.data))
]

/**
 * Report each change that shows again what the customer took off without the request naming it.
 * @returns {Set<string>} the ids shown again with the request naming them
 */
export function broughtBackProblems({ plan, data, changes, request, takenOff }, problem) {
  const again = new Set()
  changes.forEach((change, i) => {
    for (const id of new Set(dataOf(change))) {
      if (!takenOff.has(id) || shownOn(plan.pages).has(id)) continue
      const names = namesOf(plan, data.byId.get(id), id)
      if (names.some((name) => namesWords(request, name))) {
        again.add(id)
        continue
      }
      problem(
        'change_unlinked',
        `changes[${i}].data`,
        `${JSON.stringify(id)} (${names[0] ?? id}) was taken off the plan by the customer earlier and the request does not name it: leave it off, and report the wish under notDone with reason outside_plan`
      )
    }
  })
  return again
}
