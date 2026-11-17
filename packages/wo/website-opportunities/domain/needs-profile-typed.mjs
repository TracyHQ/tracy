// What the needs profile takes from the research in code, beside the model (#609 defects of a real run): the business
// reading's services as typed items, the rule that a service is never read from inside an audience quote, the About
// line and the owner's own tagline (`needs-research-reading.mjs`, `owner-facts-flow.mjs`). Pure.
//   - a typed item (`source.items`: `{id, kind, fields, evidence}`) is the reading's own service, its quote already
//     checked against its passage by the reading: it is taken as it is, so the profile keeps the reading's list, its
//     price only when its quote proves it (`provenBy`), never an item kind the profile has no place for;
//   - a service or package the model reads from a source whose audience quotes are known (`source.audience`) must have
//     its evidence somewhere in that source's words outside those quotes: "a clinic for anxious patients" in an
//     audience quote names who it serves, not a service it sells;
//   - a typed person (`needs-research-people.mjs`) is a person only guest reviews name whom the brief shows: taken
//     with its name and role only (never a bio or another field) and its `namedBy` mark, its role not held to the
//     quote, because the brief's reading gave it and the brief's rule lifted the person;
//   - the About line (`source.about`) and the owner's tagline (`source.ownerTagline`) ride to the profile as
//     `about: {value, sources}` and `ownerTagline: {id, value, source}`, each only when present.
import { ITEM_KINDS, primaryRoleOf } from './needs-profile-merge.mjs'
import { provenBy } from './needs-profile-grounding.mjs'
import { ownerTaglineOfSources } from './owner-facts-flow.mjs'
import { datedEventDrop, datedEventOf } from './needs-profile-events.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const squash = (value) => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
const TYPED = new Set(['service', 'package'])

export const TYPED_REASONS = Object.freeze({
  typed_item_unreadable: 'a reading service without a kind the profile holds or without a name',
  typed_price_not_in_quote: "the reading's price is not in its quote",
  service_from_audience_quote:
    'the service is read only from a quote of who the business serves, never from a passage about what it offers'
})
const drop = (code, what, scope = 'observation') => ({ ...what, code, reason: TYPED_REASONS[code], scope })

/**
 * The reading's services of every source as observations, taken as they are (rules above); a dated event is no
 * service (`needs-profile-events.mjs`; `at`: when the research was made, when known).
 */
export function typedObservations(sources, { at = null } = {}) {
  const items = []
  const dropped = []
  for (const source of sources) {
    const ref = { id: source.id, origin: source.origin }
    for (const it of list(source.items)) {
      const what = { from: 'research', source: source.id, kind: it?.kind }
      if (it?.kind === 'person') {
        const person = typedPersonOf(it, ref)
        if (person) items.push(person)
        else dropped.push(drop('typed_item_unreadable', what))
        continue
      }
      const name = TYPED.has(it?.kind) ? it.fields?.[primaryRoleOf(it.kind)] : null
      if (!isText(name)) {
        dropped.push(drop('typed_item_unreadable', what))
        continue
      }
      const event = datedEventOf({ name, evidence: it.evidence, page: it.page }, { at })
      if (event) {
        dropped.push(datedEventDrop(event, { ...what, value: name }))
        continue
      }
      const prefix = ITEM_KINDS[it.kind]
      const fields = Object.fromEntries(
        Object.entries(it.fields).filter(([role, v]) => role.startsWith(prefix) && isText(v))
      )
      for (const [role, value] of Object.entries(fields))
        if (role !== primaryRoleOf(it.kind) && !provenBy(role, value, String(it.evidence ?? ''))) {
          dropped.push(drop('typed_price_not_in_quote', { ...what, field: role, value }, 'field'))
          delete fields[role]
        }
      items.push({ kind: it.kind, fields, source: ref })
    }
  }
  return { items, dropped }
}

/** A typed person as an observation: its name and role only, with its `namedBy` mark; null without a name. */
function typedPersonOf(it, ref) {
  const name = it.fields?.['person.name']
  if (!isText(name)) return null
  const role = it.fields?.['person.role']
  return {
    kind: 'person',
    fields: { 'person.name': name.trim(), ...(isText(role) ? { 'person.role': role.trim() } : {}) },
    source: ref,
    ...(isText(it.namedBy) ? { namedBy: it.namedBy } : {})
  }
}

/** Whether a model item of `source` stands only on words inside the source's audience quotes (rule above). */
export function fromAudienceOnly(source, item) {
  const quotes = list(source?.audience).filter(isText)
  if (!quotes.length || !TYPED.has(item?.kind) || !isText(item?.evidence)) return false
  let rest = squash(source.text ?? '')
  for (const q of quotes) rest = rest.split(squash(q)).join('\n')
  const words = [rest, ...list(source.captions).map(squash)].join('\n')
  return !words.includes(squash(item.evidence))
}

/** The drop record of such an item. */
export const audienceOnlyDrop = (at) => drop('service_from_audience_quote', at)

/** The About line and the owner's tagline the research sources carry, as profile keys (each only when present). */
export function profileExtrasOf(sources) {
  const about = list(sources).filter((s) => isText(s?.about))
  const tagline = ownerTaglineOfSources(sources)
  return {
    ...(about.length ? { about: { value: about[0].about.trim(), sources: about.map((s) => s.id) } } : {}),
    ...(tagline ? { ownerTagline: tagline } : {})
  }
}
