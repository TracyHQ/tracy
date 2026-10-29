/**
 * The family tables of the Joomla rule tables (spec #37 C4). WHICH field names hold a fact is the server's list,
 * `apps/tracy-web/src/lib/fact-fields.json`, read through `fact-fields.js` (the planner and the capture read the same
 * file). This file only says, per family of that list, which slot role and which card a field of the family takes.
 * A new field name in the server list is placed with no edit here; a new family fails the test that compares the two
 * key sets, so a family can never be added to one side only.
 */
import { factRole } from '../../apps/tracy-web/src/lib/fact-fields.js'

/** Field words that say which part of a person a `team` field holds. */
const PERSON_PART = [
  [/(?:^|[-_])(?:bio|desc|description)$/, 'person.bio'],
  [/(?:^|[-_])(?:role|position|title)$/, 'person.role'],
  [/(?:^|[-_])(?:name|author|person|speaker|member|team)$/, 'person.name']
]

/** A price in a pricing table belongs to a package; any other price belongs to an offering. */
const PACKAGE_PRICE = /^(?:plan|tier|package|pricing|membership|subscription)[-_]/

/**
 * family of the server fact list → how a field of it is placed: the card family (`group id` = entity.family.index),
 * the card kind, and the role (a function of the field name when one family holds several parts).
 */
export const FACT_FAMILY_ROLES = Object.freeze({
  stat: { family: 'stat', entityKind: 'stat_item', roleOf: () => 'stat.value' },
  'stat-label': { family: 'stat', entityKind: 'stat_item', roleOf: () => 'stat.label' },
  place: { family: 'place', entityKind: 'contact', roleOf: () => 'contact.address' },
  // `rating` has no role in the vocabulary: it stays for the packaging agent.
  testimonial: {
    family: 'quote',
    entityKind: 'quote',
    roleOf: (field) => (/rating/.test(field) ? null : 'quote.text')
  },
  client: { family: 'client', entityKind: 'claim', roleOf: () => 'claim.entity_name' },
  team: {
    family: 'member',
    entityKind: 'person',
    roleOf: (field) => PERSON_PART.find(([pattern]) => pattern.test(field))?.[1] ?? null
  },
  price: {
    family: 'price',
    entityKind: 'menu_item',
    roleOf: (field) => (PACKAGE_PRICE.test(field) ? 'package.price' : 'offering.price'),
    kindOf: (field) => (PACKAGE_PRICE.test(field) ? 'package' : 'menu_item')
  }
})

/**
 * The placement the family tables give a Joomla ACM field, or null when the server list does not call it a fact.
 * @param {string} field lower-cased field name
 * @param {Set<string>} siblings lower-cased field names of the same module
 * @returns {{family: string, entityKind: string, role: string} | null}
 */
export function factFamilyPlacement(field, siblings) {
  const family = factRole(field, siblings)
  const entry = family ? FACT_FAMILY_ROLES[family] : null
  if (!entry) return null
  const role = entry.roleOf(field)
  if (!role) return null
  return { family: entry.family, entityKind: entry.kindOf ? entry.kindOf(field) : entry.entityKind, role }
}
