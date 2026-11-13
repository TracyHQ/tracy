// The blocks the gate itself empties (#593 review G1): a block whose every fact and item is too long for its fields
// (`plan-data-limits.mjs`) would be kept with no data and fail Contract B with the gate's own ids and no cause. Such a
// block leaves the plan, reported in the left out list with the over limit reason, as the gate's other removals are.
//
// Only the recipe's main block of the page is required (the recipes declare no other required block). A main block the
// gate empties is reported as `data_over_limit` at the composition's own position, with the field, its limit and the
// length, so the second attempt can act (show another item there, or leave the page out). Its `noData` rule cannot keep
// it: Contract B holds every block of a plan to at least one id, so a main block with a `fallback` rule is reported the
// same way. In the JA Boxing store every main block hides when it has no data.
//
// The page title hero `block-162` of JA Boxing (business name field held to 20 characters, on seven page types) is
// never a main block, so an over long business name drops the block and the page keeps its other blocks.

const list = (value) => (Array.isArray(value) ? value : [])

/** The customer's reason for a section left out because all it would show is too long for it. */
export const EMPTIED_BLOCK_REASON =
  'Everything this section would show is longer than it can hold, so the section is left out.'

/** Where a plan block sits in the composition, `pages[i].blocks[j]`, or its plan place for a block the gate added. */
function compositionAt(page, block, pageIndex) {
  const j = new RegExp(`^${page.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-b(\\d+)$`).exec(block.id)?.[1]
  const i = pageIndex.get(page.id)
  if (i === undefined || j === undefined) return `pages[${page.id}].blocks[${block.id}]`
  return `pages[${i}].blocks[${Number(j) - 1}]`
}

/**
 * Drop the blocks the over limit rule emptied, or report them when they are the page's main block.
 * @param {object[]} before the pages before the over limit rule
 * @param {{pages: object[], dropped: object[]}} limited what `dropOverLimitData` returned
 * @param {{recipes: Map<string, object>, data: object}} context
 * @param {Map<string, number>} pageIndex plan page id -> index of the page in the composition
 * @param {(code: string, at: string, message: string) => void} problem
 * @returns {{pages: object[], leftOut: Array<{what: string, kind: 'block', reason: string}>}}
 */
export function dropEmptiedBlocks(before, limited, context, pageIndex, problem) {
  const had = new Set(
    before.flatMap((p) => p.blocks.filter((b) => list(b.data).length > 0).map((b) => `${p.id}|${b.id}`))
  )
  const leftOut = []
  const pages = limited.pages.map((page) => {
    const main = context.recipes.get(page.pageType)?.mainBlock
    const blocks = page.blocks.filter((block) => {
      if (list(block.data).length > 0 || !had.has(`${page.id}|${block.id}`)) return true
      const dropped = limited.dropped.filter((d) => d.page === page.id && d.block === block.id && !d.cleared)
      if (block.block !== main) {
        leftOut.push({ what: block.label ?? block.block, kind: 'block', reason: EMPTIED_BLOCK_REASON })
        return false
      }
      const at = compositionAt(page, block, pageIndex)
      for (const d of dropped)
        problem(
          'data_over_limit',
          `${at}.data`,
          `${JSON.stringify(d.id)} has ${d.length} characters; the field ${d.field} of block ${block.block}, the main block of this page, holds ${d.limit}: show another item there or leave the page out`
        )
      return true
    })
    return { ...page, blocks }
  })
  return { pages, leftOut }
}
