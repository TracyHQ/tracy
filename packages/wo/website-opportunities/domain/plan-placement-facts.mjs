// Fact placement of the rules gate (ticket #593): a business fact no block of the composed plan shows (a phone, opening
// hours, the main button's words) finds a block in a fixed order, and a fact that finds none is reported in the left
// out list, never dropped silently:
//   1. a block on the plan that declares a field of the fact's data kind with room for one more value of that kind;
//   2. a facts only block of the store not on the plan (a contact strip, say) that declares such a field, added to a
//      page whose recipe lists it (`plan-placement-pages.mjs`);
//   3. else a left out entry with the reason.
// A design typed field never counts: it carries no data kind (Contract A). A fact that stands for an item field
// (`plan-conflicts.mjs`) is shown with its item and never placed here. Pure: pages in, new pages, left out entries
// (with the ids they name) and what was placed out.
import { BLOCK_TYPES } from './place-content-roles.mjs'
import { extraBlockId, insertBlock, pageFor } from './plan-placement-pages.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
/** How many values of data kind `kind` a block's own fields hold. */
const slotsFor = (description, kind) =>
  list(description?.fields).filter((f) => f?.type !== 'design' && f?.kind === kind).length
const factsOnly = (description) => !BLOCK_TYPES[description.type]?.itemKind

/**
 * Place every fact no block shows and the model did not leave out.
 * @param {object[]} pages placed pages of the plan
 * @param {{data: object, blocks: Map<string, object>, recipes?: Map<string, object>, leftOutIds?: Set<string>}} context
 * @returns {{pages: object[], leftOut: object[], placed: Array<{item: string, page: string, block: string,
 *   how: string}>}} each left out entry names the fact `id` it reports
 */
export function placeExtraFacts(pages, { data, blocks, recipes, leftOutIds = new Set() }) {
  const out = structuredClone(pages)
  const placed = []
  const leftOut = []
  const shown = new Set(out.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const kindOf = (id) => data.byId.get(id)?.kind
  for (const fact of data.facts) {
    const record = data.byId.get(fact.id)
    if (record.itemField || shown.has(fact.id) || leftOutIds.has(fact.id)) continue
    let home = null
    for (const page of out)
      for (const block of page.blocks) {
        if (home) break
        const room = slotsFor(blocks.get(block.block), fact.kind)
        const used = block.data.filter((id) => kindOf(id) === fact.kind).length
        if (room > used) home = { page, block, how: 'block on the plan with a field for it' }
      }
    if (!home)
      for (const description of blocks.values()) {
        if (description.source === 'library' || !factsOnly(description)) continue
        if (slotsFor(description, fact.kind) === 0) continue
        if (out.some((p) => p.blocks.some((b) => b.block === description.id))) continue
        const page = pageFor(out, description, recipes)
        if (!page) continue
        const block = {
          id: extraBlockId(page),
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
    } else
      leftOut.push({
        id: fact.id,
        what: fact.label,
        kind: 'feature',
        reason: `No section of the template has a place for your ${fact.label.toLowerCase()}.`
      })
  }
  return { pages: out, leftOut, placed }
}
