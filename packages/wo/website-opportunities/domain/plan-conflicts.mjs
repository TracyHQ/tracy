// Conflicts of the needs profile on the build plan (ticket #593, product decision of 13/11). A conflict the customer
// settled with an answer (`plan-answers.mjs`) is gone from the plan: its value is simply the fact. Every other conflict,
// asked and not answered or never asked, shows its trust order default as an assumption that carries the values the
// sources disagree on (Contract B `alternatives`), so the customer can still pick another one on the plan card.
//
// A plan item carries a label only, so a conflict on an item field (a price, a role) becomes a plan fact of its own,
// `<item id>-<role>` (for example `service-court-hire-offering-price`), marked `itemField` in the plan data. The model
// never reads such a fact apart from its item (`modelViewOf`), the gate refuses it in a block's data, and it is shown
// or left out with its item (`plan-accounting.mjs`). A plan edit of its value is mapped back to the item field
// (`profileAfterPlan`, `plan-edit-gate.mjs`).
import { FACT_LABELS, idOf, short, sourcesOf } from './plan-data.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const ROLE_WORDS = Object.freeze({
  'offering.price': 'Price',
  'package.price': 'Price',
  'offering.description': 'Description',
  'person.role': 'Role'
})
const roleWord = (role) => {
  if (ROLE_WORDS[role]) return ROLE_WORDS[role]
  const word = role.split('.').at(-1).replace(/_/g, ' ')
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Where a conflict sits: `{scope: 'fact', kind}` or `{scope: 'item', kind, id, role}` from its `at`. */
export function conflictPlace(conflict) {
  const parts = String(conflict?.at ?? '').split('.')
  if (parts[0] === 'facts') return { scope: 'fact', kind: parts.slice(1).join('.') }
  if (parts[0] === 'items' && parts.length >= 5)
    return { scope: 'item', kind: parts[1], id: parts[2], role: parts.slice(3).join('.') }
  return { scope: 'unknown' }
}

const open = (profile) =>
  list(profile?.conflicts).filter((c) => c?.chosen === null || c?.chosen === undefined)

/** Add to `data` one plan fact per open conflict on an item field (mutates `data`, returns it). */
export function addItemFieldFacts(profile, data) {
  const origins = new Map(list(profile?.sources).map((s) => [s.id, s.origin]))
  for (const conflict of open(profile)) {
    const place = conflictPlace(conflict)
    if (place.scope !== 'item') continue
    const item = data.byId.get(place.id)
    const field = item?.source?.fields?.[place.role]
    if (item?.what !== 'item' || typeof field?.value !== 'string') continue
    const id = `${place.id}-${idOf(place.role)}`
    const sources = sourcesOf(field.sources, origins)
    if (data.byId.has(id) || sources.length === 0) continue
    const label = short(`${roleWord(place.role)} of ${item.entry.label}`, 80)
    const entry = { id, kind: place.role, label, value: field.value, sources }
    data.facts.push(entry)
    data.byId.set(id, {
      what: 'fact',
      kind: place.role,
      entry,
      source: field,
      itemField: { item: place.id, kind: place.kind, role: place.role }
    })
  }
  return data
}

/** The plan fact an open conflict is about, or null. */
function factOf(conflict, data) {
  const place = conflictPlace(conflict)
  if (place.scope === 'item') {
    const fact = data.byId.get(`${place.id}-${idOf(place.role)}`)
    return fact?.itemField ? fact.entry : null
  }
  if (place.scope !== 'fact') return null
  return data.facts.find((f) => data.byId.get(f.id).source?.conflict === conflict.id) ?? null
}

/**
 * The assumptions of every open conflict, each with its alternatives, and the accounting of every conflict of the
 * profile: `{conflict, settledBy: 'answer'}` or `{conflict, assumption}`; a conflict with neither is `unexplained`.
 */
export function conflictAssumptionsOf(profile, data) {
  const origins = new Map(list(profile?.sources).map((s) => [s.id, s.origin]))
  const assumptions = []
  const accounting = []
  for (const conflict of list(profile?.conflicts)) {
    if (conflict?.chosen !== null && conflict?.chosen !== undefined) {
      accounting.push({ conflict: conflict.id, settledBy: 'answer' })
      continue
    }
    const fact = factOf(conflict, data)
    const alternatives = []
    for (const v of list(conflict?.values)) {
      const sources = sourcesOf(v.sources, origins)
      if (sources.length > 0 && !alternatives.some((a) => a.value === v.value))
        alternatives.push({ value: v.value, sources })
    }
    if (!fact || alternatives.length < 2 || !alternatives.some((a) => a.value === fact.value)) {
      accounting.push({ conflict: conflict?.id, unexplained: true })
      continue
    }
    const name = FACT_LABELS[fact.kind] ?? fact.label
    const what = name.charAt(0).toLowerCase() + name.slice(1)
    const said = conflict.question
      ? `You did not confirm the ${what}, so the value from your most trusted source is used. You can pick another one.`
      : `Your sources disagree on the ${what}. The value from your most trusted source is used; you can pick another one.`
    assumptions.push({
      id: conflict.id,
      field: `facts[${fact.id}].value`,
      said: short(said, 200),
      alternatives
    })
    accounting.push({ conflict: conflict.id, assumption: conflict.id })
  }
  return { assumptions, accounting }
}
