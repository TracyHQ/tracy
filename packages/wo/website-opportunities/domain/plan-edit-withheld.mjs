// What a customer's plan edit may name, seen from what the owner keeps off the site (ticket #593). A plan edit that
// brings back a held item (a held person, a held review, the held business name) or names an id the plan does not
// hold is refused in the customer's words: the message names the thing by its neutral label (`withheldWhatOf`),
// never by its plan id (an id can carry a held person's name) or its value. Contract B alone would word the same
// refusal with the id (`"person-<name>" is not a fact or item of the plan`), so this runs before it. Pure.
import { planDataOf } from './plan-data.mjs'
import { addItemFieldFacts } from './plan-conflicts.mjs'
import { WITHHELD_REASON, withheldWhatOf } from './plan-withheld.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const ENTRY_FIELD = /^(?:facts|items)\[([^\]]+)\]\./
const BLOCK_DATA = /^pages\[[^\]]+\]\.blocks\[[^\]]+\]\.data$/

/** The refusal of one id: its neutral label when the owner keeps it off the site, a generic sentence otherwise. */
function refusal(id, data, withheld) {
  const record = data.byId.get(id)
  if (data.withheld.has(id))
    return {
      code: 'withheld_shown',
      message: `This change cannot be saved: ${withheldWhatOf(record, withheld)} stays off your site. ${WITHHELD_REASON}`
    }
  return {
    code: 'edit_invalid',
    message: 'This change cannot be saved: it names something that is not part of your plan.'
  }
}

/**
 * The problems of the ids an edit names, before Contract B words them with the id.
 * @param {{plan: object, edit: object, profile: object}} input `profile`: the profile with the edit's fact values
 *   already written back (`profileAfterEdit`), so a card edit that shows the held name has un-hidden it
 * @returns {Array<{code: string, at: string, message: string}>}
 */
export function editedIdProblems({ plan, edit, profile }) {
  const data = addItemFieldFacts(profile, planDataOf(profile))
  const known = new Set([...list(plan?.facts), ...list(plan?.items)].map((e) => e?.id))
  const problems = []
  list(edit?.changes).forEach((change, i) => {
    const field = typeof change?.field === 'string' ? change.field : ''
    const named = BLOCK_DATA.test(field)
      ? list(change.value).filter((id) => typeof id === 'string')
      : ENTRY_FIELD.test(field)
        ? [ENTRY_FIELD.exec(field)[1]]
        : []
    for (const id of named)
      if (!known.has(id) || data.withheld.has(id))
        problems.push({ at: `changes[${i}]`, ...refusal(id, data, profile?.withheld) })
  })
  return problems
}
