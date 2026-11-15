// The blocks of a page reached under its list page (ticket #597, `pages.<type>.under`), part of `underPagesOf`. Such a
// page has no menu item of its own: a module assigned to it is assigned to its list page's item, so it prints on the
// page under it and on the list page alike (measured, "Placements": a module assigned a list prints on an article
// page under its list page only through the list page's item). Only at a declared detail position
// (`under.detailPositions`) does it print on the page under it alone. For every other block the plan places there:
//
//   every-page                      one record on every page already: nothing to decide
//   one record the list page shows  an in-place or `recipe-pages` block the list page places too: the list page's
//                                   item is assigned anyway, so the block prints on the page under it, as placed
//   anything else a recipe places   a copy or a record the list page does not show: assigned to the list page's item,
//                                   it would print there too, where no plan placed it. The block is not written on
//                                   that page: its entries are skipped (`under_page_block_on_list_page`), and the plan
//                                   lists it (`plan.underNotWritten`, unproven `under_page_block_not_written`)
//   a block no recipe of the page   a plan fault (a library block, or one the kit's recipe for the page type, main or
//   type places                     variant, never lists): the plan stops (`under_page_position_not_detail`)
//
// A detail position declared for another assignment than `list-page` stops the plan too: the contract knows no other.
// Pure.
import { DraftWriteError } from './draft-write-error.mjs'
import { unproven } from './draft-write-sink.mjs'

export const UNDER_SKIP = 'under_page_block_on_list_page'
const ONE_RECORD = ['every-page', 'recipe-pages']

/** The blocks of every recipe of a page type (its main recipe and its variants). */
export const recipeBlocksOf = (pageRecipes) =>
  new Map(
    (pageRecipes?.recipes ?? []).map((r) => [
      r.pageType,
      new Set([...(r.blocks ?? []), ...(r.variants ?? []).flatMap((v) => v.blocks ?? [])])
    ])
  )

const stop = (page, block, position, positions, assign) =>
  new DraftWriteError(
    'under_page_position_not_detail',
    `block ${block.id} of ${page.id} sits at ${position}, not a detail position its list page item prints`,
    {
      page: page.id,
      block: block.id,
      storeBlock: block.block,
      source: block.source,
      assign,
      position,
      positions
    }
  )

/**
 * Decide every block of a page under its list page `list`; record the ones not written in `state.dropReasons` (with
 * `state.dropped`) and `state.underNotWritten`.
 */
export function checkUnderBlocks(state, page, list, detail) {
  const positions = Array.isArray(detail?.positions) ? detail.positions : null
  const shownOnList = new Set(list.blocks.filter((b) => b.state !== 'hidden').map((b) => b.block))
  for (const block of page.blocks) {
    if (block.state === 'hidden' || state.dropped?.has(block.id)) continue
    const assign = state.kit.mapping.placements?.[block.block]?.assign ?? null
    if (block.source !== 'library' && (!assign || assign === 'every-page')) continue
    const position = block.position?.resolved ?? block.position?.request ?? null
    if (positions?.includes(position) && detail.assignTo === 'list-page') continue
    if (positions?.includes(position) || block.source === 'library')
      throw stop(page, block, position, positions, assign)
    if (!state.kit.recipeBlocks?.get(page.pageType)?.has(block.block))
      throw stop(page, block, position, positions, assign)
    if (ONE_RECORD.includes(assign) && shownOnList.has(block.block)) continue
    state.dropped.add(block.id)
    state.dropReasons.set(block.id, UNDER_SKIP)
    const row = { page: page.id, block: block.id, storeBlock: block.block, position, list: list.id }
    state.underNotWritten.push(row)
    unproven(state.sink, 'under_page_block_not_written', row)
  }
}
