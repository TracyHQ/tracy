// Extra data placement of the rules gate (ticket #593, ADR 0046 decision 3): data items the composed plan shows nowhere
// (for example reviews) find a block in a fixed order, and what finds none is reported, never dropped silently.
//   1. a template block of that item's own type: one already on the plan with room, else one of the store not placed;
//   2. a template block whose fields fit: its type accepts the item's kind and its item fields carry the item's role;
//   3. a Tracy library block of that type, styled through the template's design variables, for the items its content
//      rules accept (`library.mjs`: a Google review of four or five stars, for example);
//   4. else a left out entry with the reason.
// Photos are the exception to 4: a photo with no gallery block stays in the pictures pool (`plan-look-pictures.mjs`).
// Pure: placed pages in, new pages, left out entries and what was placed out.
import { libraryEntryProblem } from './library.mjs'
import { ITEM_KINDS } from './needs-profile-merge.mjs'
import { BLOCK_TYPES, GROUP_KINDS_V3 } from './place-content-roles.mjs'
import { ITEM_NOUNS } from './plan-data.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const ownTypeOf = (block, kind) => BLOCK_TYPES[block.type]?.itemKind === kind
const accepts = (block, kind) =>
  GROUP_KINDS_V3[BLOCK_TYPES[block.type]?.itemKind]?.allowedKinds?.includes(kind) ?? false
const fieldsFit = (block, kind) =>
  list(block.itemFields).some((f) => f?.type !== 'design' && f?.kind?.startsWith(ITEM_KINDS[kind] ?? '\0'))
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1)

/** Item ids shown by the placed pages. */
const shownIds = (pages) => new Set(pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))

/**
 * Place every item no block shows and the model did not leave out.
 * @param {object[]} pages placed pages: `{id, pageType, blocks: [{id, type, block, source, label, data, reason}]}`
 * @param {{data: object, blocks: Map<string, object>, leftOutIds?: Set<string>}} context `blocks`: id -> description of
 *   every block of the template's store and of the Tracy library
 * @returns {{pages: object[], leftOut: object[], placed: Array<{item: string, page: string, block: string, how: string}>}}
 */
export function placeExtraData(pages, { data, blocks, leftOutIds = new Set() }) {
  const out = structuredClone(pages)
  const shown = shownIds(out)
  const placed = []
  const leftOut = []
  const home = out.find((p) => p.pageType === 'home') ?? out[0]
  const byKind = new Map()
  for (const item of data.items) {
    if (shown.has(item.id) || leftOutIds.has(item.id)) continue
    byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item])
  }
  const onPlan = () => out.flatMap((page) => page.blocks.map((block) => ({ page, block })))
  const descriptions = [...blocks.values()]

  /** Fill blocks on the plan that pass `fit`, then add one new block per store block that passes it. */
  const tier = (remaining, kind, how, fit) => {
    for (const { page, block } of onPlan()) {
      const description = blocks.get(block.block)
      if (!description || !fit(description)) continue
      const room =
        description.items.max - block.data.filter((id) => data.byId.get(id)?.what === 'item').length
      for (const item of remaining.splice(0, Math.max(room, 0))) {
        block.data.push(item.id)
        placed.push({ item: item.id, page: page.id, block: block.id, how })
      }
    }
    const placedBlocks = new Set(onPlan().map(({ block }) => block.block))
    for (const description of descriptions) {
      if (remaining.length === 0) break
      if (remaining.length < Math.max(description.items.min, 1)) continue
      if (placedBlocks.has(description.id) || !fit(description)) continue
      const id = `${home.id}-extra-${home.blocks.length + 1}`
      const taken = remaining.splice(0, description.items.max)
      const noun = ITEM_NOUNS[kind] ?? 'items'
      const block = {
        id,
        type: description.type,
        block: description.id,
        source: description.source ?? 'template',
        label: capital(noun),
        data: taken.map((i) => i.id),
        reason:
          description.source === 'library'
            ? `The template has no section for your ${noun}, so they use a Tracy section drawn in the style of your template.`
            : `More of your ${noun}, shown in a section of the template made for them.`
      }
      const footer = home.blocks.findIndex((b) => b.type === 'footer')
      home.blocks.splice(footer === -1 ? home.blocks.length : footer, 0, block)
      for (const item of taken) placed.push({ item: item.id, page: home.id, block: id, how })
    }
  }

  for (const [kind, items] of byKind) {
    const remaining = [...items]
    const template = (d) => (d.source ?? 'template') === 'template'
    tier(remaining, kind, 'template block of its type', (d) => template(d) && ownTypeOf(d, kind))
    tier(
      remaining,
      kind,
      'template block whose fields fit',
      (d) => template(d) && accepts(d, kind) && fieldsFit(d, kind)
    )
    const library = descriptions.filter((d) => d.source === 'library' && ownTypeOf(d, kind))
    const refusedBy = new Map()
    for (const item of remaining) {
      const reasons = library.map((d) => libraryEntryProblem(d, data.byId.get(item.id)))
      if (library.length > 0 && reasons.every(Boolean)) refusedBy.set(item.id, reasons[0])
    }
    const fitting = remaining.filter((item) => !refusedBy.has(item.id))
    tier(fitting, kind, 'Tracy library block', (d) => library.includes(d))
    if (kind === 'gallery') continue
    for (const item of remaining.filter((i) => refusedBy.has(i.id) || fitting.includes(i)))
      leftOut.push({
        what: item.label,
        kind: 'item',
        reason: refusedBy.has(item.id)
          ? `Not shown in the Tracy section: ${refusedBy.get(item.id)}.`
          : `No section of the template or of the Tracy library can show more of your ${ITEM_NOUNS[kind] ?? 'items'}.`
      })
  }
  return { pages: out, leftOut, placed }
}
