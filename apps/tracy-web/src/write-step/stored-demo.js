// What no frozen file names and the template prints all the same. Nothing here writes.
//
// A kit marks a field `printed: false` when it found no page printing it, but it read the listing card, and a template can
// print the field elsewhere: JA Boxing's service page prints `classes-title` as its hero in place of the article title, and
// only when that field is empty does it print the article title, which the writer filled. So an unprinted field no file fills
// is emptied, and the words a file owns stand.
//
// A link's address can live apart from its words. When the plan hides the words, a placeholder address (`#`) kept on the same
// entity still draws a button with nothing in it, so it goes too. One the kit knows is a slot the plan speaks for, so only an
// address outside the kit counts, and only one stored as a field of its own: one inside HTML is a link of the page.
import { kitSlotIds } from './kit-slot-ids.js'

const each = (value) => (Array.isArray(value) ? value : [])

const keptDecisions = (plan) =>
  [
    ...each(plan?.sharedBlocks),
    ...each(plan?.pages)
      .filter((p) => p?.decision === 'keep')
      .flatMap((p) => each(p.blocks))
  ].filter((d) => d?.decision !== 'hide')

/** The kit's slots of every field it marks unprinted. */
function unprintedSlots(kit) {
  const out = new Set()
  for (const block of each(kit?.blocks))
    for (const list of each(block?.lists))
      for (const field of each(list?.rowSlots))
        if (field?.printed === false)
          for (const slot of each(field.slots)) if (typeof slot?.id === 'string') out.add(slot.id)
  return out
}

/** The placeholder addresses on the entities of the blocks where a link's words are hidden. */
function leftAddresses({ plan, kit, contentMap }) {
  const blocks = new Map(each(kit?.blocks).map((b) => [b?.id, b]))
  const known = kitSlotIds(kit)
  const out = new Set()
  for (const decision of keptDecisions(plan)) {
    const hidden = new Set(each(decision.hiddenSlots).map((h) => h?.slot))
    if (!each(decision.links).some((l) => hidden.has(l?.labelSlot))) continue
    const entity = blocks.get(decision.block)?.source?.entity
    if (!entity) continue
    for (const slot of each(contentMap?.slots))
      if (
        slot?.entity === entity &&
        slot.jsonPath &&
        !slot.xpath &&
        String(slot.sample ?? '').trim() === '#' &&
        !known.has(String(slot.key).replace(/^module-/, 'block-'))
      )
        out.add(slot.key)
  }
  return out
}

/**
 * Hide claims for what stands in no file: `owner: 'kit'`, because the plan does not say this, and `why` for the report.
 * @param {{ plan: object, kit: object, contentMap?: object | null, filled: Set<string>, file: string }} input
 * @returns {object[]} claims of the owner table
 */
export function storedDemoClaims({ plan, kit, contentMap, filled, file }) {
  const claim = (slot, why) => ({ slot, owner: 'kit', file, kind: 'hide', content: '(hide)', why })
  const free = (slot) => !filled.has(slot)
  return [
    ...[...unprintedSlots(kit)]
      .filter(free)
      .map((slot) =>
        claim(
          slot,
          'the kit says no page prints this field and no file gives it words, so its demo words leave'
        )
      ),
    ...[...leftAddresses({ plan, kit, contentMap })].filter(free).map((slot) => ({
      ...claim(
        slot,
        'the words of the link at this placeholder address left, so the address leaves with them'
      ),
      storedAddress: true
    }))
  ]
}

const BESIDE_ELEMENT = /\/text\(\)\[\d+\]$/

/**
 * The file's words hold no edge spaces, but a text node beside an element keeps its words apart from it by one (`Join over
 * <span>`). Where the template's own sample has a space there, the written words get one too.
 * @param {Record<string, string>} changes
 * @param {{ slots?: object[] } | null | undefined} contentMap
 * @returns {Record<string, string>}
 */
export function keepSpaceAround(changes, contentMap) {
  const out = { ...changes }
  for (const slot of each(contentMap?.slots)) {
    if (!(slot?.key in out) || !BESIDE_ELEMENT.test(String(slot.xpath ?? ''))) continue
    const sample = String(slot.sample ?? '')
    const value = String(out[slot.key])
    const before = /^\s/.test(sample) && !/^\s/.test(value) ? ' ' : ''
    const after = /\s$/.test(sample) && !/\s$/.test(value) ? ' ' : ''
    out[slot.key] = `${before}${value}${after}`
  }
  return out
}

/** The pages the plan keeps, by the kit's paths: what the site check opens. */
export function keptPagesOf(plan, kit) {
  const paths = new Map(each(kit?.pages).map((p) => [p?.id, p?.path]))
  return each(plan?.pages)
    .filter((p) => p?.decision === 'keep' && typeof paths.get(p.id) === 'string')
    .map((p) => ({ id: p.id, path: paths.get(p.id) }))
}
