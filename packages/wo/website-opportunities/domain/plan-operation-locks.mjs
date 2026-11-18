// What the owner may not take off the plan on the plan card (#575), decided from the template's kit and the plan, never
// guessed: the card shows no trash for a locked part, and the plan operation gate refuses it with the same code.
//
// From the kit:
// - a page keeps the main block of its recipe (`page-recipes.json` `mainBlock`): a page without it is no page of its
//   kind (ADR 0046 decision 3; the edit gate's `main_block_missing`);
// - a block the build writes in place (`block-store.json` `placement: "in-place"`) is the site's single chrome (the
//   header, a footer column, the copyright line): one record shown on every page, so it cannot leave one page;
// - a block keeps at least `items.min` items (`block-store.json`), and every block at least one detail (Contract B).
// From the plan:
// - the first page (the home page every link and the not-found page lead to);
// - the page the privacy page is (`legalPages[].use` names a page of the plan);
// - the block a page ends on (`endAction.block` names a block of its own page);
// - a fact of the main button (`primaryAction.factIds`).
// Pure.
import { BLOCK_TYPES } from './place-content-roles.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** The kit's description of each block of the store and the library, by block id. */
const descriptionsOf = (blockStore, library) =>
  new Map([...list(blockStore?.blocks), ...list(library)].map((b) => [b?.id, b]))

/** The block ids that are their page's main block, by the recipes of the kit. */
function mainBlocksOf(plan, pageRecipes) {
  const recipes = new Map(list(pageRecipes?.recipes).map((r) => [r?.pageType, r]))
  const out = new Set()
  for (const page of list(plan?.pages)) {
    const main = recipes.get(page?.pageType)?.mainBlock
    for (const block of list(page?.blocks)) if (main && block?.block === main) out.add(block.id)
  }
  return out
}

/** How many of a block's data are items (not facts): what `items.min` counts. */
export function itemCountOf(block, plan) {
  const items = new Set(list(plan?.items).map((i) => i?.id))
  return list(block?.data).filter((id) => items.has(id)).length
}

/**
 * The parts of the plan the owner cannot take off, each with the code of why.
 * @param {object} plan a Contract B plan
 * @param {{blockStore?: object, pageRecipes?: object, library?: object[]}} kit
 * @returns {{pages: Record<string, string>, blocks: Record<string, string>, facts: Record<string, string>,
 *   minItems: Record<string, number>}} `minItems`: the fewest items each block keeps (by block id)
 */
export function planLocksOf(plan, { blockStore, pageRecipes, library = [] } = {}) {
  const pages = {}
  const blocks = {}
  const facts = {}
  const minItems = {}
  const described = descriptionsOf(blockStore, library)
  const main = mainBlocksOf(plan, pageRecipes)
  list(plan?.pages).forEach((page, i) => {
    if (i === 0) pages[page.id] = 'first_page'
    const end = page?.endAction?.block
    for (const block of list(page?.blocks)) {
      const description = described.get(block?.block)
      if (main.has(block.id)) blocks[block.id] = 'main_block'
      else if (description?.placement === 'in-place') blocks[block.id] = 'site_chrome'
      else if (block.id === end) blocks[block.id] = 'end_action'
      // Only a block whose type shows items has an item minimum (the gate's `too_few_items`); every block keeps one
      // detail (Contract B), which the gate holds apart.
      const counted = BLOCK_TYPES[description?.type]?.itemKind ? (description?.items?.min ?? 0) : 0
      minItems[block.id] = Math.max(counted, 0)
    }
  })
  for (const legal of list(plan?.legalPages))
    if (legal?.use !== 'create' && typeof legal?.use === 'string' && !pages[legal.use])
      pages[legal.use] = 'privacy_page'
  for (const id of list(plan?.primaryAction?.factIds)) facts[id] = 'main_button'
  return { pages, blocks, facts, minItems }
}
