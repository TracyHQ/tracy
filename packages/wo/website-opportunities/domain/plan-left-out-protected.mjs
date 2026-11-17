// Facts the model may never leave out (#575 walk, second round): a real plan lost its "Business name" and "Main button"
// rows because the model wrote left out entries for them ("the name is handled at the brand step", "no verified link
// for this button"), and the gate read each as leaving the fact out (`withNamedIds`). The rule, in code:
// - a fact the owner answered (a source of origin `answer`), and
// - an identity fact with a value: the business name, a phone, the address, the main button, and the opening hours
//   (#575 walk, fourth round: hours the owner kept were left out of the card on one walk and shown on the next; hours
//   the brief holds never reach the plan's data, so hours in the data are hours the owner confirmed or no source
//   disputed),
// is never left out by the model. Its entry is dropped (a recorded fix, `left_out_protected_fact`) and the fact goes
// through placement as any fact no block shows (`plan-placement-facts.mjs`): it is shown, or left out by code with the
// reason code knows. An entry the owner asked for on a change request (its reason in `context.askedOff`) stays: the
// owner's own request is no model choice. Pure: the reply is copied when anything changes.

/** The fact kinds that say who the business is and how to reach it: never left out by the model. */
export const IDENTITY_FACT_KINDS = Object.freeze([
  'business.name',
  'contact.phone',
  'contact.address',
  'contact.cta_label',
  'contact.hours'
])
export const PROTECTED_FACT_CODE = 'left_out_protected_fact'

const list = (value) => (Array.isArray(value) ? value : [])

/** Whether the fact of plan id `id` is one the model may never leave out. */
export function isProtectedFact(id, data) {
  const record = data?.byId?.get(id)
  if (record?.what !== 'fact' || data.withheld?.has(id)) return false
  if (IDENTITY_FACT_KINDS.includes(record.kind)) return true
  return list(record.entry?.sources).some((s) => s?.kind === 'answer')
}

/**
 * The reply without the model's left out entries of protected facts, each known by the id it reports (`item`): an
 * entry with no id never reaches this rule (`plan-left-out-keyed.mjs`), and no label is read from the model's words.
 * @param {object} reply the model's reply, its entries named by id already (`withNamedIds`)
 * @param {{byId: Map<string, object>, withheld?: Set<string>}} data
 * @param {(fix: object) => void} fix
 * @param {Set<string>} [askedOff] the reasons of what the owner asked to take off (a revision)
 */
export function withoutProtectedLeftOut(reply, data, fix, askedOff = new Set()) {
  const entries = list(reply?.leftOut)
  const protectedOf = (entry) => {
    if (askedOff.has(entry?.reason) || typeof entry?.item !== 'string') return null
    return isProtectedFact(entry.item, data) ? entry.item : null
  }
  if (!entries.some(protectedOf)) return reply
  const rule =
    'a fact the owner answered, and the business name, phone, address, main button and opening hours, are never left out by the model'
  const leftOut = entries.filter((entry, i) => {
    const id = protectedOf(entry)
    if (id === null) return true
    fix({ code: PROTECTED_FACT_CODE, at: `leftOut[${i}]`, rule, was: entry, now: id })
    return false
  })
  return { ...reply, leftOut }
}
