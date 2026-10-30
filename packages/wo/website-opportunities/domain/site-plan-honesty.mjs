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
import { planStatBoxes } from './stat-box-plan.mjs'
import { factListsOf, factRowFacts, planCollectionFactRows } from './fact-rows.mjs'
import { offeringDescriptionOf, ownPostLinesOf } from './offering-description.mjs'
import { roleInCasingOf, showablePeopleOf } from './brief-people.mjs'
import { planFormBlocks } from './form-blocks.mjs'
import { planReviewGroup, sourcedReviewsOf } from './review-quotes.mjs'
import { shortOfferingName } from './offering-short-name.mjs'
import { labelsOfBlanks, planOfferingTabs } from './offering-tabs-plan.mjs'

export const HONESTY_VERSION = 'site-plan-honesty/1'

/** Every reason code a honesty decision carries, with the sentence a report shows for it. */
export const HONESTY_REASONS = Object.freeze({
  'brief-person': 'a person the brief names',
  'brief-offering': 'an offering the brief lists',
  'brief-offering-quote': 'the business’s own words about this offering',
  'brief-offering-mention': 'a line of the business’s own post or page about this offering',
  'offering-name-only':
    'the brief holds no words about this offering beyond its name: the copy writer writes one line about it, else it is taken off',
  'brief-owner': 'the owner the brief names',
  'brief-review': 'one whole sourced guest review with its real author and platform',
  'no-fitting-review': 'no whole attributed review fits this quote card',
  'author-as-business': 'a post’s author shown as the business, never as a made-up person',
  'no-brief-person': 'the brief names no person for this card',
  'person-name-unavailable': 'the accepted name cannot be shown whole on this card',
  'brief-offering-short': 'an offering the brief lists, in a shorter form of its own words that fits the box',
  'offering-name-unavailable':
    'the offering’s name is too long for this card and has no shorter form of its own words, so the card is taken off',
  'no-brief-offering': 'the brief lists no offering for this card',
  'no-brief-price': 'the brief holds no price for this plan',
  'no-brief-fact': 'the brief holds no such fact',
  'brief-fact-row': 'a sourced fact of the brief in a card’s fact row, under a label that names it',
  'no-brief-statistic': 'the brief holds no such number',
  'no-brief-statistic-photo': 'the brief holds no number for this box, so it shows one of the owner’s photos',
  'brief-statistic': 'a number the brief holds from a source',
  'no-signer': 'the brief names no owner to sign',
  'whole-collection-hidden': 'every card of this section is hidden',
  'no-place-to-hide': 'the record sits where the site cannot hide it',
  'no-form-destination':
    'a sign-up, booking or login block with no destination for this business (no email-marketing account, booking link or member area), taken off whole'
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
/**
 * The characters a text slot holds: the tighter of its contract limit and its measured box, as the site reads it
 * (`SlotFit.php` `checkText`: `fit.maxCharacters`, else the smallest of `fit.maxChars`, only for a measured fit). A value
 * over the box is refused by the site and the slot keeps the demo's words (#189 item 30), so the plan never places one.
 */
export function slotCharacterLimit(slot) {
  const own = Number.isInteger(slot?.maxCharacters) && slot.maxCharacters > 0 ? slot.maxCharacters : Infinity
  const fit = slot?.fit
  if (!fit || fit.measured !== true) return own
  if (Number.isInteger(fit.maxCharacters) && fit.maxCharacters > 0) return Math.min(own, fit.maxCharacters)
  const boxes = Object.values(fit.maxChars ?? {}).filter((n) => Number.isInteger(n) && n > 0)
  return boxes.length ? Math.min(own, ...boxes) : own
}
const fits = (slot, value) => [...value].length <= slotCharacterLimit(slot)
const entityKindOf = (contentMap, entity) =>
  (contentMap?.entities ?? []).find((e) => e?.key === entity)?.kind ?? String(entity).split('-')[0]

/** Whether the brief shows a reading item on the site: its own flag, and the fact behind it. */
function onSite(brief, item) {
  if (item?.onSite === false || item?.reviewsOnly === true) return false
  if (!item?.factId) return true
  const fact = (brief?.facts ?? []).find((f) => f?.id === item.factId)
  return fact?.onSite !== false
}

/**
 * The brief's people the site may show, in the brief's order: a person only reviews name included when the reviews give a
 * role or two reviews name them (`brief-people.mjs`, product owner 29/10/2026), flagged `fromReviews`.
 */
export function peopleOfBrief(brief) {
  return showablePeopleOf(brief)
}

/** The brief's offerings the site may show, in the brief's order, each with its own words. */
export function offeringsOfBrief(brief) {
  const shown = (brief?.reading?.services ?? []).filter(
    (s) => text(s?.id) && text(s?.label) && onSite(brief, s)
  )
  return shown.map((s) => ({
    id: s.id,
    label: text(s.label),
    quote: text(s.quote) || null,
    // The lines quoted under it, with the kind of their source: a description may lean on the business's own posts.
    mentions: (Array.isArray(s.mentions) ? s.mentions : [])
      .filter((m) => text(m?.quote))
      .map((m) => ({ quote: text(m.quote), kind: m?.source?.kind ?? null }))
      // Then the lines of the business's own posts about it: the post it was read from, or one naming only it.
      .concat(ownPostLinesOf(brief, s, shown).map((quote) => ({ quote, kind: 'post' })))
  }))
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
 * @param {{name?: string | null, contact?: Record<string, {value: string}>, now?: number}} [options] - `now`: the year a
 *   founding year is counted from (tests pin it)
 * @returns {{honesty: {version: string, records: any[], hide: any[], values: Record<string, {value: string, reason: string, evidence?: string}>,
 *   blanks: any[], fallbacks: Record<string, {value: string, reason: string}>}}}
 */
export function planHonesty(brief, contentMap, { name = null, contact = {}, now = undefined } = {}) {
  const people = peopleOfBrief(brief)
  const offerings = offeringsOfBrief(brief)
  const owner = people.find((p) => OWNER_WORDS.test(p.role ?? '')) ?? null
  const reviews = sourcedReviewsOf(brief)
  const records = []
  const values = {}
  const blanks = []
  const fallbacks = {}
  /**
   * The description and summary slots of kept offering cards the brief has no words for beyond the offering's name: the copy
   * writer must write them (one line about that offering), and only what it leaves unusable is taken off.
   */
  const nameOnly = []
  /** The brief label each kept offering or person card shows, by group id: `planFill`'s `cardNames`. */
  const cardNames = {}
  // The rows of a card's fact list show the brief's sourced facts, one label set per list (`fact-rows.mjs`).
  const rowFacts = factRowFacts(brief, offerings, contact)
  const setValue = (slot, value, reason) => {
    if (!text(value) || slot.type !== 'text' || !fits(slot, value)) return
    values[slot.key] = { value, reason, evidence: value }
  }
  const byCollection = new Map()
  const statBoxes = new Map(
    planStatBoxes(brief, groupsOf(contentMap), contentMap, { now }).map((b) => [b.group, b])
  )
  for (const group of groupsOf(contentMap)) {
    const isPerson = group.kind === 'person'
    const isOffering =
      OFFERING_KINDS.has(group.kind) && group.slots.some((s) => s.role?.startsWith('offering.'))
    if (isPerson || isOffering || group.kind === 'package') {
      const at = collectionOf(contentMap, group)
      byCollection.set(at, [...(byCollection.get(at) ?? []), group])
      continue
    }
    if (group.kind === 'stat_item') {
      // A box shows a sourced fact, else an owner photo (in a photo grid), else it goes (a band): `stat-box-plan.mjs`.
      const box = statBoxes.get(group.id)
      if (box?.decision === 'fact') {
        records.push({
          group: group.id,
          kind: group.kind,
          decision: 'keep',
          reason: box.reason,
          fact: box.fact
        })
        for (const slot of group.slots)
          if (box.values?.[slot.key]) setValue(slot, box.values[slot.key], box.reason)
          else if (slot.role?.startsWith('stat.') && (slot.type === 'text' || slot.xpath))
            blanks.push(blankOf(slot, 'no-brief-statistic'))
        continue
      }
      if (box?.decision === 'hide')
        records.push({
          group: group.id,
          collection: collectionOf(contentMap, group),
          kind: group.kind,
          decision: 'hide',
          reason: box.reason,
          place: placeOf(contentMap, group),
          ...(box.sectionStays ? { sectionStays: true } : {})
        })
      else if (box?.decision === 'photo')
        records.push({ group: group.id, kind: group.kind, decision: 'photo', reason: box.reason })
      for (const slot of group.slots)
        if (slot.role?.startsWith('stat.') && (slot.type === 'text' || slot.xpath))
          blanks.push(blankOf(slot, 'no-brief-statistic'))
    }
    if (group.kind === 'quote' && group.slots.some((s) => s.role === 'quote.text')) {
      const chosen = planReviewGroup(group.slots, reviews)
      records.push({
        group: group.id,
        kind: 'quote',
        decision: 'keep',
        reason: chosen ? 'brief-review' : 'no-fitting-review',
        ...(chosen ? { assigned: chosen.review, ...(chosen.excerpt ? { excerpt: true } : {}) } : {})
      })
      for (const slot of group.slots) {
        if (chosen && slot.key in chosen.values) setValue(slot, chosen.values[slot.key], 'brief-review')
        else if (slot.type === 'text' && slot.role?.startsWith('quote.'))
          blanks.push(blankOf(slot, 'no-fitting-review'))
      }
    } else if (group.kind === 'quote')
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
    /** The kept offering cards of this collection: their fact rows are planned together, one label set (`fact-rows.mjs`). */
    const rowCards = []
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
    const fallbackBefore = new Set(Object.keys(fallbacks))
    const nameOnlyBefore = nameOnly.length
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
      // No initials-only people card: a name too long for its fields (or no name field) takes off the whole card.
      if (assigned && group.kind === 'person') {
        const names = group.slots.filter((s) => s.role === 'person.name' && s.type === 'text')
        if (names.length === 0 || names.some((s) => !fits(s, assigned.label))) {
          records.push({
            ...record,
            decision: 'hide',
            reason: 'person-name-unavailable',
            place: placeOf(contentMap, group)
          })
          return
        }
      }
      // 🔒 AN OFFERING'S NAME FITS ITS BOX OR ITS CARD GOES (#189 item 30): a name over the measured box was refused by the
      // site, and the card, its page and every menu mirroring it kept the demo's name. The name takes a shorter form of its
      // own words (`shortOfferingName`) that fits every name field of the card; with none, the card is taken off whole.
      /** The name every name field of the card shows, when the brief's label is too long for one of them. */
      let shortName = null
      if (assigned && group.kind !== 'person') {
        const names = group.slots.filter((s) => s.role === 'offering.name' && s.type === 'text')
        if (names.some((s) => !fits(s, assigned.label))) {
          shortName = shortOfferingName(assigned.label, Math.min(...names.map(slotCharacterLimit)))
          if (!shortName) {
            records.push({
              ...record,
              decision: 'hide',
              reason: 'offering-name-unavailable',
              assigned: { id: assigned.id, label: assigned.label },
              place: placeOf(contentMap, group)
            })
            return
          }
        }
      }
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
      // The card's fact rows are planned with the collection's other kept cards, after this loop.
      const rowKeys = new Set()
      /** The fallback lines this card already gives: no sentence twice on one card or its page. */
      const described = new Set()
      if (group.kind !== 'person') {
        rowCards.push({ group, assigned })
        for (const { rows } of factListsOf(group))
          for (const row of rows)
            for (const cell of [row.label, row.value, ...row.rest]) if (cell) rowKeys.add(cell.key)
      }
      // A person card with no role field shows the sourced role on its first free line of words (the line under the name).
      const roleLine =
        group.kind === 'person' && assigned.role && !group.slots.some((s) => s.role === 'person.role')
          ? group.slots.find(
              (s) =>
                s.type === 'text' &&
                s.role === 'editorial.paragraph' &&
                fits(s, roleInCasingOf(assigned.role, s.sample))
            )
          : null
      for (const slot of group.slots) {
        const role = slot.role ?? ''
        if (rowKeys.has(slot.key)) continue
        if (role === 'person.name') setValue(slot, assigned.label, 'brief-person')
        else if (role === 'person.role')
          assigned.role
            ? setValue(slot, roleInCasingOf(assigned.role, slot.sample), 'brief-person')
            : blanks.push(blankOf(slot, 'no-brief-fact'))
        else if (slot === roleLine) setValue(slot, roleInCasingOf(assigned.role, slot.sample), 'brief-person')
        else if (role === 'person.bio' || role === 'person.social_url')
          blanks.push(blankOf(slot, 'no-brief-fact'))
        // 🔒 A KEPT PERSON CARD SHOWS ONLY THE NAME, THE ROLE AND THE PICTURE: any other words or link on it (a link to the
        // demo person's own page, social icons, a demo line) is the demo's, emptied per element, never the whole card.
        else if (
          group.kind === 'person' &&
          !role.startsWith('person.') &&
          (slot.type === 'text' || slot.type === 'url')
        )
          blanks.push(blankOf(slot, 'no-brief-fact'))
        else if (role === 'offering.name' && shortName) {
          if (slot.type === 'text' && fits(slot, shortName))
            values[slot.key] = { value: shortName, reason: 'brief-offering-short', evidence: assigned.label }
        } else if (role === 'offering.name') setValue(slot, assigned.label, 'brief-offering')
        else if (OFFERING_FACTS.has(role)) blanks.push(blankOf(slot, 'no-brief-fact'))
        // 🔒 A DESCRIPTION SAYS MORE THAN THE NAME (COO rule, #189 round 9, `offering-description.mjs`): the fallback is the
        // business's own words about this offering, never its name again; with none, the copy writer must write it
        // (`nameOnly`), and only a line it leaves unusable is taken off.
        else if (role === 'offering.description' || role === 'offering.summary') {
          const own = offeringDescriptionOf(assigned, offerings, {
            fits: (value) => fits(slot, value),
            names: shortName ? [shortName] : [],
            taken: described
          })
          if (own) {
            fallbacks[slot.key] = own
            described.add(own.value)
          } else if (slot.type === 'text') nameOnly.push(slot.key)
        } else if (CONTACT_KIND[role]) {
          const fact = contact?.[CONTACT_KIND[role]]?.value
          fact ? setValue(slot, fact, 'brief-offering') : blanks.push(blankOf(slot, 'no-brief-fact'))
        }
      }
    })
    siblingsFallBackTogether(ordered, { fallbacks, nameOnly, fallbackBefore, nameOnlyBefore })
    const planned = planCollectionFactRows(rowCards, rowFacts)
    rowCards.forEach(({ group }, c) => {
      const byKey = new Map(group.slots.map((s) => [s.key, s]))
      for (const [key, value] of Object.entries(planned[c].values))
        setValue(byKey.get(key), value, 'brief-fact-row')
      for (const slot of planned[c].blanks) blanks.push(blankOf(slot, 'no-brief-fact'))
    })
  }
  // 🔒 A KEPT PERSON'S OWN RECORD SHOWS NO DEMO SOCIAL LINK: the brief holds no social profile of a person, and a template
  // may file a profile's icons in a group of their own (`contact`), so every social slot of that record is emptied.
  const personEntities = new Set(
    records
      .filter((r) => r.kind === 'person' && r.decision === 'keep' && r.reason === 'brief-person')
      .map((r) => groupsOf(contentMap).find((g) => g.id === r.group)?.slots[0]?.entity)
      .filter(Boolean)
  )
  // 🔒 A FORM WITH NO DESTINATION GOES WHOLE (`form-blocks.mjs`): its module is taken off, its words are never written.
  const forms = planFormBlocks(brief, contentMap)
  for (const block of forms.off)
    records.push({
      group: `${block.entity}.form`,
      kind: 'form_block',
      decision: 'hide',
      reason: 'no-form-destination',
      place: { how: 'entity', entity: block.entity, kind: 'module' }
    })
  const blanked = new Set(blanks.map((b) => b.key))
  for (const slot of contentMap?.slots ?? [])
    if (
      personEntities.has(slot.entity) &&
      /^(contact|person)\.social_/.test(slot.role ?? '') &&
      !blanked.has(slot.key)
    )
      blanks.push(blankOf(slot, 'no-brief-fact'))
  // 🔒 TABS BOUND TO OFFERINGS SHOW THE BRIEF'S OFFERINGS, ONE PER TAB, NAMED AS GIVEN; a label goes with the value it
  // labels (`offering-tabs-plan.mjs`).
  const tabs = planOfferingTabs(contentMap, offerings, { limitOf: slotCharacterLimit, placeOf })
  records.push(...tabs.records)
  Object.assign(values, tabs.values)
  Object.assign(cardNames, tabs.cardNames)
  for (const slot of labelsOfBlanks(
    contentMap,
    blanks.map((b) => b.key)
  ))
    blanks.push(blankOf(slot, 'no-brief-fact'))
  return {
    honesty: {
      version: HONESTY_VERSION,
      records,
      hide: hidesOf(records),
      values,
      blanks,
      fallbacks,
      nameOnly,
      cardNames,
      offerings,
      // The keys of the blocks taken off whole: no step writes them.
      unwritten: [...forms.unwritten]
    }
  }
}

/**
 * The takings-off of the hidden records: a list item each, or the whole entity when none of its cards stays.
 * @param {any[]} records
 */
function hidesOf(records) {
  const keptIn = new Set()
  // A box shown as a photo stays in its section as surely as a kept card.
  for (const r of records) if (r.decision !== 'hide' || r.sectionStays) keptIn.add(r.group.split('.')[0])
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

/**
 * 🔒 SIBLINGS OF ONE LIST FALL BACK AS ONE UNIT (COO criterion 1.3, R12): the n-th describing line of every card of a
 * collection either all take the business's own words, or all go to the writer (`nameOnly`). Never three cards with a
 * quoted line beside one the writer must fill or leaves empty: a mixed set sends every one of them to the writer, which
 * writes them together in one shape (`offering-description-writer.js`), or leaves them all off (`offering-name-only.js`).
 * @param {any[]} groups - the collection's groups, in order
 * @param {{fallbacks: Record<string, any>, nameOnly: string[], fallbackBefore: Set<string>, nameOnlyBefore: number}} state
 */
function siblingsFallBackTogether(groups, { fallbacks, nameOnly, fallbackBefore, nameOnlyBefore }) {
  const DESCRIBING = new Set(['offering.description', 'offering.summary'])
  /** Each describing slot's place: its role and its rank among the card's slots of that role. */
  const place = new Map()
  for (const group of groups) {
    const rank = {}
    for (const slot of group.slots)
      if (DESCRIBING.has(slot.role)) {
        rank[slot.role] = (rank[slot.role] ?? -1) + 1
        place.set(slot.key, { slot, at: `${slot.role}#${rank[slot.role]}` })
      }
  }
  const own = Object.keys(fallbacks).filter((k) => !fallbackBefore.has(k) && place.has(k))
  const waiting = new Set(
    nameOnly
      .slice(nameOnlyBefore)
      .filter((k) => place.has(k))
      .map((k) => place.get(k).at)
  )
  for (const key of own) {
    const { slot, at } = place.get(key)
    if (!waiting.has(at)) continue
    delete fallbacks[key]
    if (slot.type === 'text' && !nameOnly.includes(key)) nameOnly.push(key)
  }
}
