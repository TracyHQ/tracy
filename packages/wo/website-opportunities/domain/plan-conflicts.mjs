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
//
// 🔒 A picture is never a plan fact or an alternative: its value is a reference the pictures step opens (a map
// provider's photo resource name runs to hundreds of characters), never words the owner reads or picks. The merge
// never makes such a conflict (`settle`, `needs-profile-merge.mjs`); one that still reaches here is accounted as
// `picture` and left off the plan, so a raw reference cannot fail the `facts[].value` limit of the plan gate.
//
// 🔒 A value is shown whole or not at all: no rule here cuts or rewrites the business's text. A link is held to a
// link's limit (`facts[].url`), any other value to `facts[].value`. A value of a conflict longer than its limit is never
// offered as an alternative: the card says the sources differ and which one was used, and the customer can still type
// another value (the step chain kept one value with a note that sources differ, `brief.mjs` `priceNote`). When the
// trust order's own value is too long to show, the item keeps it as it is, with no plan fact and no card line (accounted
// `overLimit`), as an item's long description is never on the card either.
import { factValueLimitKey, TEXT_LIMITS, textLength } from './build-contract-shapes.mjs'
import { isPictureRole } from './needs-profile-merge.mjs'
import { FACT_LABELS, idOf, short, sourcesOf } from './plan-data.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const ROLE_WORDS = Object.freeze({
  'offering.price': 'Price',
  'package.price': 'Price',
  'offering.description': 'Description',
  'person.role': 'Role'
})
/** A source as a sentence names it: "your website", "your Google Maps listing". */
const sourceWords = ({ kind, name }) =>
  kind === 'answer' ? 'your answer' : `your ${name.toLowerCase().replace('google maps', 'Google Maps')}`
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

/** Whether `value` fits the plan's limit for a fact of data kind `kind`, whole. */
const fits = (kind, value) =>
  typeof value === 'string' && textLength(value) <= TEXT_LIMITS[factValueLimitKey(kind)]

const open = (profile) =>
  list(profile?.conflicts).filter((c) => c?.chosen === null || c?.chosen === undefined)

/** Add to `data` one plan fact per open conflict on an item field (mutates `data`, returns it). */
export function addItemFieldFacts(profile, data) {
  const origins = new Map(list(profile?.sources).map((s) => [s.id, s.origin]))
  for (const conflict of open(profile)) {
    const place = conflictPlace(conflict)
    if (place.scope !== 'item' || isPictureRole(place.role)) continue
    const item = data.byId.get(place.id)
    const field = item?.source?.fields?.[place.role]
    if (item?.what !== 'item' || !fits(place.role, field?.value)) continue
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
 * profile: `{conflict, settledBy: 'answer'}`, `{conflict, assumption}`, `{conflict, picture: true}` or
 * `{conflict, overLimit: true}` (never on the plan, see the head of the file); a conflict with none of them is
 * `unexplained`.
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
    if (isPictureRole(conflict?.kind) || isPictureRole(conflictPlace(conflict).role)) {
      accounting.push({ conflict: conflict?.id, picture: true })
      continue
    }
    const fact = factOf(conflict, data)
    const kind = fact?.kind ?? conflict?.kind
    if (!fits(kind, fact ? fact.value : conflict?.default)) {
      accounting.push({ conflict: conflict?.id, overLimit: true })
      continue
    }
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
    const used = alternatives
      .find((a) => a.value === fact.value)
      .sources.map(sourceWords)
      .join(' and ')
    // Only the values the plan can show whole are offered; with fewer than two, the card states the disagreement.
    const shown = alternatives.filter((a) => fits(fact.kind, a.value))
    const choose = shown.length >= 2 ? 'You can pick another.' : 'You can change it.'
    const said = conflict.question
      ? `You did not choose the ${what}, so I used the one from ${used}. ${choose}`
      : `Your sources show different values for the ${what}. I used the one from ${used}; ${choose.charAt(0).toLowerCase()}${choose.slice(1)}`
    assumptions.push({
      id: conflict.id,
      field: `facts[${fact.id}].value`,
      said: short(said, 200),
      ...(shown.length >= 2 ? { alternatives: shown } : {})
    })
    accounting.push({ conflict: conflict.id, assumption: conflict.id })
  }
  return { assumptions, accounting }
}
