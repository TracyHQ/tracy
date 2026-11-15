// The item counts of a structure variant (ticket #586): the full variant must show every item block at its declared
// most items and the minimum variant at its declared least (at least one). A block the build shows otherwise is
// explained only by a reason the build itself gives: a write step gap that took items out (its code), a block the
// write order hides or replaces by its fallback (its reason). Any other block is named, and the variant cannot pass:
// it did not measure the shape it claims. The main block of an item page (a post, a class) shows the page's own record,
// counted as its one item. Pure.
import { countOf, itemKindOf } from './marker-composition.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** The reason the build gives for a block of a page, if any. */
function reasonOf(page, b, built) {
  const at = page.id + '.' + b.id
  const hidden = list(built?.order?.hidden).find((h) => h.at === at)
  if (hidden) return 'hidden:' + hidden.reason
  if (b.state === 'fallback') return 'fallback:' + (b.reason ?? 'none')
  const gap = list(built?.gaps).find((g) =>
    list(g.blocks).includes((page.pageType ?? page.id) + '/' + b.block)
  )
  return gap ? 'gap:' + gap.code : null
}

/**
 * The item blocks of a build with how many items each shows against the count of the shape, and why it differs.
 * @param {object} built the marker build (`order`, `gaps`)
 * @param {{blockStore: object, pageRecipes?: object}} kit
 * @param {'max' | 'min'} shape
 */
export function itemCountsOf(built, kit, shape = 'max') {
  const byId = new Map(list(kit?.blockStore?.blocks).map((b) => [b.id, b]))
  const mains = new Map(list(kit?.pageRecipes?.recipes).map((r) => [r.pageType, r.mainBlock]))
  const out = []
  for (const page of list(built?.order?.pages))
    for (const b of list(page.blocks)) {
      const block = byId.get(b.block)
      if (!block || !itemKindOf(block) || b.state === 'hide') continue
      const ownRecord = block.placement === 'created' && mains.get(page.pageType ?? page.id) === b.block
      const items = ownRecord ? 1 : (b.counts?.shown ?? list(b.items).length)
      const expected = countOf(block, shape)
      const row = {
        page: page.id,
        block: b.block,
        items,
        min: countOf(block, 'min'),
        max: countOf(block, 'max')
      }
      if (ownRecord) row.counted = 'page_record'
      if (b.counts?.available != null) row.available = b.counts.available
      if (items !== expected) {
        const reason = reasonOf(page, b, built)
        row.expected = expected
        row[reason ? 'reason' : 'unexplained'] = reason ?? true
      }
      out.push(row)
    }
  return out
}

/** The blocks a variant shows at another count than its shape with no reason the build gives. */
export const unexplainedItems = (blocks) =>
  blocks
    .filter((b) => b.unexplained)
    .map((b) => ({ page: b.page, block: b.block, items: b.items, expected: b.expected }))
