// The honesty part of the site plan (spec TracyHQ/tracy#189, ticket #192): which records of the template stay, which are
// hidden, and what a fact slot holds when the brief has no fact for it. Pure and deterministic: no model, no site.
//
// 🔒 ONE CARD PER REAL OFFERING, ONE CARD PER REAL PERSON: the cards of a collection (the items of one list, or the
// entities of one kind) take the brief's offerings or people in order; the cards beyond them are hidden, never left with
// the demo's words or with empty ones. A collection with no card left is hidden whole (its module).
// 🔒 NO INVENTED FACT: a person's name and role, an offering's name, a contact fact come from the brief; a price, a
// schedule, a statistic, a signature line, a bio the brief does not hold is emptied (`blanks`), never the demo's value
// and never a made-up one. A package (a priced plan) is hidden: the brief holds no price.
// 🔒 RULES BY ROLE, GROUP KIND AND ENTITY KIND, never by template: the location of a record is read from its slots (an item
// of a JSON list, or an entity of its own).
import { collectionOfGroupId } from './content-map-repeatable-lists.mjs'
import { namedIn } from './pictures/picture-links.mjs'

export const HONESTY_VERSION = 'site-plan-honesty/1'

/** Every reason code a honesty decision carries, with the sentence a report shows for it. */
export const HONESTY_REASONS = Object.freeze({
  'brief-person': 'a person the brief names',
  'brief-offering': 'an offering the brief lists',
  'brief-offering-quote': 'the business’s own words about this offering',
  'brief-owner': 'the owner the brief names',
  'author-as-business': 'a post’s author shown as the business, never as a made-up person',
  'no-brief-person': 'the brief names no person for this card',
  'no-brief-offering': 'the brief lists no offering for this card',
  'no-brief-price': 'the brief holds no price for this plan',
  'no-brief-fact': 'the brief holds no such fact',
  'no-brief-statistic': 'the brief holds no such number',
  'no-signer': 'the brief names no owner to sign',
  'whole-collection-hidden': 'every card of this section is hidden',
  'no-place-to-hide': 'the record sits where the site cannot hide it'
})

/** Group kinds whose cards each show one offering of the business. Dishes (`menu_item`) are the copy pins'. */
const OFFERING_KINDS = new Set(['service', 'product', 'room'])
/** Owner words of a person's role: such a person signs the business's story. */
const OWNER_WORDS = /\b(?:owner|co-owner|founder|co-founder|proprietor)\b/i
/** Roles that put a price on a card. */
const PRICE_ROLES = new Set(['offering.price', 'package.price'])
/** Fact roles of an offering card the brief never holds a value for. */
const OFFERING_FACTS = new Set([
  'offering.price',
  'offering.price_note',
  'offering.schedule',
  'offering.duration_or_unit'
])
const CONTACT_KIND = Object.freeze({
  'contact.phone': 'phone',
  'contact.email': 'email',
  'contact.address': 'address'
})

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '')
const fits = (slot, value) => !Number.isInteger(slot.maxCharacters) || [...value].length <= slot.maxCharacters
const entityKindOf = (contentMap, entity) =>
  (contentMap?.entities ?? []).find((e) => e?.key === entity)?.kind ?? String(entity).split('-')[0]

/** Whether the brief shows a reading item on the site: its own flag, and the fact behind it. */
function onSite(brief, item) {
  if (item?.onSite === false || item?.reviewsOnly === true) return false
  if (!item?.factId) return true
  const fact = (brief?.facts ?? []).find((f) => f?.id === item.factId)
  return fact?.onSite !== false
}

/** The brief's people the site may show, in the brief's order. */
export function peopleOfBrief(brief) {
  return (brief?.reading?.team ?? [])
    .filter((p) => text(p?.id) && text(p?.label) && onSite(brief, p))
    .map((p) => ({ id: p.id, label: text(p.label), role: text(p.role) || null }))
}

/** The brief's offerings the site may show, in the brief's order, each with its own words. */
export function offeringsOfBrief(brief) {
  return (brief?.reading?.services ?? [])
    .filter((s) => text(s?.id) && text(s?.label) && onSite(brief, s))
    .map((s) => ({ id: s.id, label: text(s.label), quote: text(s.quote) || null }))
}

const folded = (value) =>
  ` ${String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `

/**
 * The words a kept offering card falls back to (spec TracyHQ/tracy#189): the brief's quote about THAT offering, else its own
 * label. A quote that also names another offering of the brief ("Tennis & Padel" for the Padel card) speaks for several, so
 * the card takes its own label instead; null when the offering has neither.
 * @param {{id: string, label: string, quote: string | null}} assigned
 * @param {Array<{id: string, label: string}>} offerings
 * @returns {{value: string, reason: string} | null}
 */
export function ownQuote(assigned, offerings) {
  const quote = text(assigned.quote)
  const label = text(assigned.label)
  if (quote) {
    const said = folded(quote)
    const mine = folded(label)
    const others = offerings.filter(
      (o) => o.id !== assigned.id && folded(o.label).trim() && !mine.includes(folded(o.label))
    )
    if (!others.some((o) => said.includes(folded(o.label))))
      return { value: quote, reason: 'brief-offering-quote' }
  }
  return label ? { value: label, reason: 'brief-offering-label' } : null
}

/** The role groups of a map, with their slots, in map order; a demo-only entity's are left out. */
function groupsOf(contentMap) {
  const demoOnly = new Set((contentMap?.entities ?? []).filter((e) => e?.demoOnly === true).map((e) => e.key))
  const groups = new Map()
  for (const slot of contentMap?.slots ?? []) {
    const id = slot?.group?.id
    if (!id || demoOnly.has(slot.entity)) continue
    const group = groups.get(id) ?? { id, kind: slot.group.kind, item: slot.group.item, slots: [] }
    group.slots.push(slot)
    groups.set(id, group)
  }
  return [...groups.values()]
}

/** The collection a group is a card of: its list (`module-7.person`), else every entity of its kind with that group kind. */
function collectionOf(contentMap, group) {
  return collectionOfGroupId(group.id) ?? `${entityKindOf(contentMap, group.slots[0].entity)}:${group.kind}`
}

/**
 * Where the card `groupId` of `slots` can be taken off (`placeOf`): `{how: 'item' | 'entity' | 'none', ...}`.
 * @param {{slots?: any[], entities?: any[]}} contentMap
 * @param {string} groupId
 */
export function hidePlaceOf(contentMap, groupId) {
  const slots = (contentMap?.slots ?? []).filter((s) => s?.group?.id === groupId)
  if (slots.length === 0) return { how: 'none' }
  return placeOf(contentMap, { id: groupId, kind: slots[0].group.kind, slots })
}

/** Where a hidden card is taken off: an item of a JSON list, an entity of its own, or nowhere the site can. */
function placeOf(contentMap, group) {
  const entities = new Set(group.slots.map((s) => s.entity))
  const listed = group.slots.filter((s) => Array.isArray(s.jsonPath) && Number.isInteger(s.jsonPath.at(-1)))
  if (entities.size === 1 && listed.length === group.slots.length) {
    const [first] = listed
    const paths = new Map(
      listed.map((s) => [JSON.stringify(s.jsonPath.slice(0, -2)), s.jsonPath.slice(0, -2)])
    )
    return {
      how: 'item',
      entity: first.entity,
      column: first.column ?? null,
      nestedJson: first.nestedJson ?? null,
      parents: [...paths.values()],
      // The list's own fields: their arrays give the list's length, and every array of that length loses the item.
      fields: [...new Set(listed.map((s) => s.jsonPath.at(-2)))],
      index: first.jsonPath.at(-1)
    }
  }
  const kind = entityKindOf(contentMap, group.slots[0].entity)
  if (
    entities.size === 1 &&
    collectionOfGroupId(group.id) === null &&
    ['article', 'menuItem', 'module'].includes(kind)
  )
    return { how: 'entity', entity: group.slots[0].entity, kind }
  return { how: 'none' }
}

/** Where an emptied slot is written: the field and the path in it. */
const blankOf = (slot, reason) => ({
  key: slot.key,
  entity: slot.entity,
  type: slot.type,
  column: slot.column ?? null,
  ...(slot.nestedJson ? { nestedJson: slot.nestedJson } : {}),
  ...(Array.isArray(slot.jsonPath) ? { jsonPath: slot.jsonPath } : {}),
  ...(slot.xpath ? { xpath: slot.xpath } : {}),
  sample: String(slot.sample ?? ''),
  reason
})

/**
 * @param {object} brief - a validated brief revision
 * @param {{slots?: any[], entities?: any[]} | null} contentMap
 * @param {{name?: string | null, contact?: Record<string, {value: string}>}} [options]
 * @returns {{honesty: {version: string, records: any[], hide: any[], values: Record<string, {value: string, reason: string, evidence?: string}>,
 *   blanks: any[], fallbacks: Record<string, {value: string, reason: string}>}}}
 */
export function planHonesty(brief, contentMap, { name = null, contact = {} } = {}) {
  const people = peopleOfBrief(brief)
  const offerings = offeringsOfBrief(brief)
  const owner = people.find((p) => OWNER_WORDS.test(p.role ?? '')) ?? null
  const records = []
  const values = {}
  const blanks = []
  const fallbacks = {}
  /** The brief label each kept offering or person card shows, by group id: `planFill`'s `cardNames`. */
  const cardNames = {}
  const setValue = (slot, value, reason) => {
    if (!text(value) || slot.type !== 'text' || !fits(slot, value)) return
    values[slot.key] = { value, reason, evidence: value }
  }
  const byCollection = new Map()
  for (const group of groupsOf(contentMap)) {
    const isPerson = group.kind === 'person'
    const isOffering =
      OFFERING_KINDS.has(group.kind) && group.slots.some((s) => s.role?.startsWith('offering.'))
    if (isPerson || isOffering || group.kind === 'package') {
      const at = collectionOf(contentMap, group)
      byCollection.set(at, [...(byCollection.get(at) ?? []), group])
      continue
    }
    if (group.kind === 'stat_item')
      for (const slot of group.slots)
        if (slot.role?.startsWith('stat.') && (slot.type === 'text' || slot.xpath))
          blanks.push(blankOf(slot, 'no-brief-statistic'))
    if (group.kind === 'quote')
      for (const slot of group.slots) {
        if (slot.role === 'quote.author_name' && owner) setValue(slot, owner.label, 'brief-owner')
        else if (slot.role === 'quote.author_context' && owner?.role)
          setValue(slot, owner.role, 'brief-owner')
        else if (['quote.author_name', 'quote.author_context'].includes(slot.role))
          blanks.push(blankOf(slot, 'no-signer'))
      }
  }
  for (const [collection, groups] of byCollection) {
    const ordered = [...groups].sort((a, b) => (Number(a.item) || 0) - (Number(b.item) || 0))
    // 🔒 A PRICED CARD STANDS ONLY FOR AN OFFERING ITS OWN NAME SAYS: a gift card, a membership or a plan the brief does not
    // hold names none, and is hidden; a priced card of an offering the brief lists stays, without the demo price.
    const priced = ordered.some((g) => g.slots.some((s) => PRICE_ROLES.has(s.role)))
    const taken = new Set()
    const pricedOffering = (group) => {
      const sample = group.slots.find((s) => s.role === 'offering.name')?.sample
      const hit = sample
        ? namedIn(
            String(sample),
            offerings.filter((o) => !taken.has(o.id))
          )
        : null
      if (hit) taken.add(hit.id)
      return hit ? offerings.find((o) => o.id === hit.id) : null
    }
    ordered.forEach((group, n) => {
      const authors = entityKindOf(contentMap, group.slots[0].entity) === 'user'
      const record = { group: group.id, collection, kind: group.kind, item: n }
      if (authors) {
        // A post's author is a user of the site: never hidden, never a made-up person.
        records.push({ ...record, decision: 'keep', reason: 'author-as-business' })
        for (const slot of group.slots)
          if (slot.role === 'person.name') setValue(slot, name, 'author-as-business')
        return
      }
      const list = group.kind === 'person' ? people : group.kind === 'package' ? [] : offerings
      const assigned = group.kind !== 'person' && priced ? pricedOffering(group) : (list[n] ?? null)
      if (!assigned) {
        const reason =
          group.kind === 'package'
            ? 'no-brief-price'
            : group.kind === 'person'
              ? 'no-brief-person'
              : 'no-brief-offering'
        records.push({ ...record, decision: 'hide', reason, place: placeOf(contentMap, group) })
        return
      }
      records.push({
        ...record,
        decision: 'keep',
        reason: `brief-${group.kind === 'person' ? 'person' : 'offering'}`,
        assigned: { id: assigned.id, label: assigned.label }
      })
      cardNames[group.id] = assigned.label
      for (const slot of group.slots) {
        const role = slot.role ?? ''
        if (role === 'person.name') setValue(slot, assigned.label, 'brief-person')
        else if (role === 'person.role')
          assigned.role
            ? setValue(slot, assigned.role, 'brief-person')
            : blanks.push(blankOf(slot, 'no-brief-fact'))
        else if (role === 'person.bio') blanks.push(blankOf(slot, 'no-brief-fact'))
        else if (role === 'offering.name') setValue(slot, assigned.label, 'brief-offering')
        else if (OFFERING_FACTS.has(role)) blanks.push(blankOf(slot, 'no-brief-fact'))
        else if (role === 'offering.description') {
          const own = ownQuote(assigned, offerings)
          if (own && fits(slot, own.value)) fallbacks[slot.key] = own
        } else if (CONTACT_KIND[role]) {
          const fact = contact?.[CONTACT_KIND[role]]?.value
          fact ? setValue(slot, fact, 'brief-offering') : blanks.push(blankOf(slot, 'no-brief-fact'))
        }
      }
    })
  }
  return {
    honesty: {
      version: HONESTY_VERSION,
      records,
      hide: hidesOf(records),
      values,
      blanks,
      fallbacks,
      cardNames
    }
  }
}

/**
 * The takings-off of the hidden records: a list item each, or the whole entity when none of its cards stays.
 * @param {any[]} records
 */
function hidesOf(records) {
  const keptIn = new Set()
  for (const r of records) if (r.decision === 'keep') keptIn.add(r.group.split('.')[0])
  const out = []
  const whole = new Set()
  for (const r of records) {
    if (r.decision !== 'hide') continue
    const place = r.place
    if (place.how === 'item' && !keptIn.has(place.entity)) {
      if (whole.has(place.entity)) continue
      whole.add(place.entity)
      out.push({
        how: 'entity',
        entity: place.entity,
        kind: place.entity.split('-')[0],
        reason: 'whole-collection-hidden'
      })
    } else if (place.how === 'none') out.push({ how: 'none', group: r.group, reason: 'no-place-to-hide' })
    else out.push({ ...place, group: r.group, reason: r.reason })
  }
  return out
}
