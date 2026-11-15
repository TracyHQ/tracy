// The blocks the gate itself leaves under their minimum (#609, sixth real run): the composition check holds every block
// the model sends to its `items.min` (`plan-gate-items.mjs`, `too_few_items`), but the gate then takes items off a
// block (an item whose name is too long for it, `plan-data-limits.mjs`; an item the pictures summary takes off), and
// a list of two services kept one. That plan passed the compose gate, and the next change request, which gates the
// plan's own pages again, refused it on the block it never touched. One gate, the same rules: a block the gate leaves
// with fewer items than its minimum (and more than none: `plan-emptied-blocks.mjs` drops an emptied one) is handled as
// an emptied block is:
// - a block that is not the page's main block leaves the plan, reported as a section left out
//   (`section_below_minimum`, params `{min, shown}`), and each item it showed that no other block shows is reported
//   as left out with the same code, so every item stays accounted for;
// - the page's main block is a `too_few_items` problem at its place in the composition, naming why the items left,
//   so the second attempt shows another item there or leaves the page out (the gate never adds an item: which item a
//   page shows is the model's choice). Pure.
import { BLOCK_TYPES } from './place-content-roles.mjs'
import { ITEM_NOUNS } from './plan-data.mjs'
import { compositionAt } from './plan-emptied-blocks.mjs'

export const BELOW_MIN_CODE = 'section_below_minimum'
const list = (value) => (Array.isArray(value) ? value : [])

/** The customer's reason of a section left under its minimum, and of an item it showed. */
export const belowMinReason = (min, shown, noun) =>
  `This section needs at least ${min} of your ${noun}, and only ${shown} ${shown === 1 ? 'is' : 'are'} left for it, so I left the section out.`
export const belowMinItemReason = (min, noun) =>
  `It was in a section that needs at least ${min} of your ${noun}, and too few were left for it, so it is not shown.`

const itemsOf = (block, data) => list(block.data).filter((id) => data.byId.get(id)?.what === 'item')

/**
 * Drop or report every block the gate left with fewer items than its minimum.
 * @param {object[]} pages the pages after the gate's own removals
 * @param {{data: object, blocks: Map<string, object>, recipes: Map<string, object>, dropped?: object[]}} context
 *   `dropped`: the data the over limit rule took off (`dropOverLimitData`), named in a main block's problem
 * @param {Map<string, number>} pageIndex plan page id -> index of the page in the composition
 * @param {(code: string, at: string, message: string) => void} problem
 * @returns {{pages: object[], leftOut: Array<{what: string, kind: string, reason: string, code: string,
 *   params?: object, id?: string}>}}
 */
export function dropBelowMinBlocks(pages, { data, blocks, recipes, dropped = [] }, pageIndex, problem) {
  const leftOut = []
  const gone = []
  const out = pages.map((page) => {
    const main = recipes.get(page.pageType)?.mainBlock
    const kept = page.blocks.filter((block) => {
      const d = blocks.get(block.block)
      const kind = BLOCK_TYPES[d?.type]?.itemKind
      const shown = itemsOf(block, data).length
      if (!kind || shown === 0 || shown >= d.items.min) return true
      const noun = ITEM_NOUNS[kind] ?? 'items'
      if (block.block === main) {
        const off = dropped.filter((x) => x.page === page.id && x.block === block.id && !x.cleared)
        const why = off.length
          ? `: ${off.map((x) => `${JSON.stringify(x.id)} has ${x.length} characters, the field ${x.field} holds ${x.limit}`).join('; ')}`
          : ''
        problem(
          'too_few_items',
          `${compositionAt(page, block, pageIndex)}.data`,
          `block ${d.id} shows at least ${d.items.min} items, and ${shown} of yours fit it${why}: show another item there or leave the page out`
        )
        return true
      }
      leftOut.push({
        what: block.label ?? block.block,
        kind: 'block',
        reason: belowMinReason(d.items.min, shown, noun),
        code: BELOW_MIN_CODE,
        params: { min: d.items.min, shown }
      })
      gone.push({ ids: itemsOf(block, data), min: d.items.min, noun })
      return false
    })
    return { ...page, blocks: kept }
  })
  const still = new Set(out.flatMap((p) => p.blocks.flatMap((b) => list(b.data))))
  for (const { ids, min, noun } of gone)
    for (const id of ids.filter((x) => !still.has(x))) {
      still.add(id)
      leftOut.push({
        id,
        what: data.byId.get(id).entry.label,
        kind: 'item',
        reason: belowMinItemReason(min, noun),
        code: BELOW_MIN_CODE,
        params: { min }
      })
    }
  return { pages: out, leftOut }
}
