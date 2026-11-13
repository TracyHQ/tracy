// The named person a picture frame shows, and the initials it takes when no own photo of that person fits (ticket #595,
// the locked decision on the coach cards). Pure.
//
// 🔒 A PERSON'S FRAME IS NEVER EMPTY AND NEVER DRAWN. A frame of a person names that person when the plan says who it is:
// the frame of a person item, or a block level person frame whose block shows exactly one person item. It takes an own
// photo of that person, else the initials substitute of `person-avatar.mjs`. A people frame that names nobody (a quote
// author, a proof picture) stays empty with its reason.
import { avatarSubstitute, initialsOf } from './person-avatar.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
/** A person is named when the name gives initials. */
const named = (data, id) => initialsOf(data.byId.get(id)?.entry?.label) !== ''
const isPerson = (data, id) => {
  const held = data.byId.get(id)
  return held?.what === 'item' && (held.kind ?? held.source?.kind) === 'person'
}

/**
 * The person item a people frame shows, or null: the frame's own person item, else the one person item its plan block
 * shows when the frame sits at block level. Only a person with a name is a named person.
 * @param {{people: boolean, place: string, item?: string, itemKind?: string}} frame
 * @param {{data?: string[]}} block the plan block
 * @param {{byId: Map<string, object>}} data the plan data
 */
export function personOfFrame(frame, block, data) {
  if (!frame.people) return null
  if (frame.item) return frame.itemKind === 'person' && named(data, frame.item) ? frame.item : null
  if (frame.place !== 'block' && frame.place !== 'hero') return null
  const people = [...new Set(list(block?.data))].filter((id) => isPerson(data, id))
  return people.length === 1 && named(data, people[0]) ? people[0] : null
}

/** The initials decision of a frame of a named person (its name field, else its label): `{source: 'initials', substitute}`. */
export function initialsDecisionOf(frame, data) {
  const held = data.byId.get(frame.person)
  // The item's own name field wins over its display label, which may carry a role ("Coach Mia").
  const name = held?.source?.fields?.['person.name']
  const own = typeof name === 'string' ? name : name?.value
  const label = typeof own === 'string' && own.trim() !== '' ? own : held?.entry?.label
  return { source: 'initials', substitute: avatarSubstitute({ personId: frame.person, label }, frame.size) }
}
