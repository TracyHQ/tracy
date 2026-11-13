// The Tracy library (ticket #596): blocks Tracy owns, for data a template has no block for. The declaration file
// `tracy-library.json` is what the plan composer reads (`composePlan({library: TRACY_LIBRARY})`); each block's content
// rules decide which items it may show, and the rules gate and the extra data placement hold the plan to them, so a
// plan never promises a review the block would not show.
import { readFileSync } from 'node:fs'
import { reviewProblem } from './library-reviews-content.mjs'

export const TRACY_LIBRARY_DECLARATION = Object.freeze(
  JSON.parse(readFileSync(new URL('./library/tracy-library.json', import.meta.url), 'utf8'))
)
/** The library's blocks, in the block description format the plan composer takes as `library`. */
export const TRACY_LIBRARY = TRACY_LIBRARY_DECLARATION.blocks
export const TRACY_REVIEWS_BLOCK_ID = 'tracy-reviews'

/** One library block's declaration by id, or null. */
export const tracyLibraryBlock = (id) => TRACY_LIBRARY.find((b) => b.id === id) ?? null

const textLimitOf = (description) =>
  description.itemFields?.find((f) => f.kind === 'quote.text')?.limit ?? Number.POSITIVE_INFINITY

/** The content rule of each library block type: why it does not show an item, or null when it does. */
const ITEM_RULES = Object.freeze({
  reviews: (description, item) => reviewProblem(item, { textLimit: textLimitOf(description) })
})

/**
 * Why a library block does not show this item, or null when it does (or when the block is not a library block).
 * @param {object} description the block's description (template store or library)
 * @param {object} item the needs profile item
 */
export function libraryItemProblem(description, item) {
  if (description?.source !== 'library') return null
  return ITEM_RULES[description.type]?.(description, item) ?? null
}
