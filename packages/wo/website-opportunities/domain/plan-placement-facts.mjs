// Fact placement of the rules gate (ticket #593): a business fact no block of the composed plan shows (a phone, opening
// hours, the main button's words) finds a block in a fixed order, and a fact that finds none is reported in the left
// out list, never dropped silently:
//   1. a block on the plan with room for one more value of the fact's data kind: its fields of that kind, and the rows
//      of its lists (`factSlotsFor`); a contact channel never goes into a block that needs items;
//   2. a facts only block of the store not on the plan (a contact strip, say) that declares such a field, added to a
//      page whose recipe lists it (`plan-placement-pages.mjs`);
//   3. else a left out entry with the reason (no place of that kind, or every place taken already).
// A design typed field never counts: it carries no data kind (Contract A). A fact that stands for an item field
// (`plan-conflicts.mjs`) is shown with its item and never placed here. Pure: pages in, new pages, left out entries
// (with the ids they name) and what was placed out.
import { limitOf, placeLimitsOf } from './field-place-limits.mjs'
import { isOwnerVerbatim } from './plan-data-limits.mjs'
import { BLOCK_TYPES } from './place-content-roles.mjs'
import { extraBlockId, insertBlock, pageFor } from './plan-placement-pages.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
/**
 * The left out reasons of a fact no block shows, by code. The sentence never repeats the fact's name: the entry's
 * `what` names it, and "no space for your founded" was no sentence.
 */
export const FACT_LEFT_OUT = Object.freeze(
  Object.fromEntries(
    Object.entries({
      fact_longer_than_every_place:
        'This is longer than every place your design has for it, and Tracy never shortens it.',
      no_room_left: 'Every place your design has for this is taken already.',
      no_place_in_design: 'Your design has no place that shows this.'
    }).map(([code, reason]) => [code, Object.freeze({ code, reason })])
  )
)
/** How many values of data kind `kind` a block's own fields hold. */
export const slotsFor = (description, kind) =>
  list(description?.fields).filter((f) => f?.type !== 'design' && f?.kind === kind).length
const factsOnly = (description) => !BLOCK_TYPES[description.type]?.itemKind
const hasKind = (fields, kind) => list(fields).some((f) => f?.type !== 'design' && f?.kind === kind)

/** The fact kinds of a contact channel: phone, email, address, booking link, social profile. */
export const CONTACT_CHANNEL_KINDS = Object.freeze([
  'contact.phone',
  'contact.email',
  'contact.address',
  'contact.cta_url',
  'contact.social_url'
])

/**
 * How many facts of data kind `kind` a block shows: 0 for a block that needs items; its own fields, plus one place
 * per item for an item field and one per row for a list field (a social link is one row of a links list).
 */
export function factSlotsFor(description, kind) {
  if (!description || !factsOnly(description)) return 0
  const items = hasKind(description.itemFields, kind) ? (description.items?.max ?? 0) : 0
  const rows = list(description.lists)
    .filter((l) => hasKind(l?.fields, kind))
    .reduce((n, l) => n + (l?.items?.max ?? 0), 0)
  return slotsFor(description, kind) + items + rows
}

/**
 * The places the placement may fill: those of `factSlotsFor`; in a block that needs items, its own fields, but never
 * for a contact channel (the listing link of a reviews block is the review site's, not the business's social link).
 */
const placesFor = (description, kind) =>
  !description || factsOnly(description)
    ? factSlotsFor(description, kind)
    : CONTACT_CHANNEL_KINDS.includes(kind)
      ? 0
      : slotsFor(description, kind)

/**
 * Place every fact no block shows and the model did not leave out.
 * @param {object[]} pages placed pages of the plan
 * @param {{data: object, blocks: Map<string, object>, recipes?: Map<string, object>, leftOutIds?: Set<string>}} context
 * @returns {{pages: object[], leftOut: object[], placed: Array<{item: string, page: string, block: string,
 *   how: string}>}} each left out entry names the fact `id` it reports
 */
export function placeExtraFacts(pages, { data, blocks, recipes, leftOutIds = new Set(), idTag }) {
  const out = structuredClone(pages)
  const placed = []
  const leftOut = []
  const shown = new Set(out.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const kindOf = (id) => data.byId.get(id)?.kind
  const limits = placeLimitsOf(blocks.values())
  for (const fact of data.facts) {
    const record = data.byId.get(fact.id)
    if (record.itemField || shown.has(fact.id) || leftOutIds.has(fact.id)) continue
    // The owner's own tagline is shown as typed, never cut: only a field it fits is a place for it.
    const tooShort = isOwnerVerbatim(record)
      ? (d) =>
          d &&
          !list(d.fields).some((f) => f?.kind === fact.kind && limitOf(f, limits) >= [...fact.value].length)
      : () => false
    let home = null
    for (const page of out)
      for (const block of page.blocks) {
        if (home) break
        if (tooShort(blocks.get(block.block))) continue
        const room = placesFor(blocks.get(block.block), fact.kind)
        const used = block.data.filter((id) => kindOf(id) === fact.kind).length
        if (room > used) home = { page, block, how: 'block on the plan with a field for it' }
      }
    if (!home)
      for (const description of blocks.values()) {
        if (description.source === 'library' || !factsOnly(description)) continue
        if (factSlotsFor(description, fact.kind) === 0 || tooShort(description)) continue
        if (out.some((p) => p.blocks.some((b) => b.block === description.id))) continue
        const page = pageFor(out, description, recipes)
        if (!page) continue
        const block = {
          id: extraBlockId(page, idTag),
          type: description.type,
          block: description.id,
          source: 'template',
          label: description.type.charAt(0).toUpperCase() + description.type.slice(1),
          data: [],
          reason:
            'Your business details that no other section shows, in a section of the template made for them.'
        }
        insertBlock(page, block, recipes?.get(page.pageType))
        home = { page, block, how: 'template block with a field for it' }
        break
      }
    if (home) {
      home.block.data.push(fact.id)
      shown.add(fact.id)
      placed.push({ item: fact.id, page: home.page.id, block: home.block.id, how: home.how })
    } else {
      // True of the template: its places for the kind may all be taken (three addresses, one address place).
      const full = [...blocks.values()].some((d) => d.source !== 'library' && placesFor(d, fact.kind) > 0)
      const long =
        isOwnerVerbatim(record) &&
        full &&
        [...blocks.values()].every(
          (d) => d.source === 'library' || placesFor(d, fact.kind) === 0 || tooShort(d)
        )
      leftOut.push({
        id: fact.id,
        what: fact.label,
        kind: 'feature',
        ...FACT_LEFT_OUT[long ? 'fact_longer_than_every_place' : full ? 'no_room_left' : 'no_place_in_design']
      })
    }
  }
  return { pages: out, leftOut, placed }
}
