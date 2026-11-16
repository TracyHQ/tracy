// Whether a row keyed to a page can be seen (ticket #597, gate review of run 7): a module prints the row whose key
// names the page shown, and only on the pages it is assigned to. A copy for the site is assigned to the pages that
// place its block (`assign: "recipe-pages"`, `module.assign` of `draft-write-plan-records.mjs`), a copy of a page to
// that page; only `every-page` prints everywhere. A row keyed to a page outside those pages is written and never seen
// (the masthead rows of the home, plans, about and trainer pages, none of which places the masthead), so the plan
// skips it, typed: `row_keyed_page_without_block`. Pure; part of `rankOf` (`draft-write-plan-blocks.mjs`).

const list = (value) => (Array.isArray(value) ? value : [])

/** The skip reason of a row keyed to a page that never shows its block. */
export const ROW_KEYED_PAGE_WITHOUT_BLOCK = 'row_keyed_page_without_block'

/** The pages that place a block, shown and kept (a block the order hides, or a dropped container, prints nowhere). */
export function pagesPlacing(state, blockId) {
  const out = new Set()
  for (const page of list(state.order.pages))
    for (const block of list(page.blocks))
      if (block.block === blockId && block.state !== 'hidden' && !state.dropped?.has(block.id))
        out.add(page.id)
  return out
}

/**
 * Whether the page a row is keyed to never shows the row's module.
 * @param {object} state the planner's state
 * @param {{page: object, block: object}} at the place the row is written from
 * @param {string} keyed the id of the page the row is keyed to
 */
export function rowKeyedOutOfSight(state, at, keyed) {
  const assign = state.kit.mapping.placements?.[at.block.block]?.assign
  if (assign === 'every-page') return false
  if (assign === 'page') return keyed !== at.page.id
  return !pagesPlacing(state, at.block.block).has(keyed)
}
