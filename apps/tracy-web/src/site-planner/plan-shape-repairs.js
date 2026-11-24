// After the model, before the checker: slips of the plan's shape that have one reading, repaired by code.
// - A page's block decisions under another name (`blockDecisions`, `blocksDecisions`) are its `blocks`.
// - A block the plan decides in sharedBlocks and again on a page is the shared decision's: the page's copy is dropped.
// - A block the kit does not share, decided in sharedBlocks, is its one page's (withUnsharedBlocksOnTheirPage).
// Dev lat30 (23/11/2026): JA Boxing's plan round 0 wrote the home page's blocks as `blockDecisions` (R00) and decided the
// header and two shared sections again on the home page (R10g); the fix round rewrote the plan in six minutes. Returns the
// same plan when nothing changed.
import { pageBlockOrder } from './plan-check/kit-index.js'

const each = (value) => (Array.isArray(value) ? value : [])
const ALIASES = ['blockDecisions', 'blocksDecisions']
const blockOf = (d) => (d && typeof d === 'object' ? d.block : d)

/**
 * @param {any} plan
 */
export function withPageBlocksRepaired(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.pages)) return plan
  const shared = new Set(
    each(plan.sharedBlocks)
      .map(blockOf)
      .filter((b) => typeof b === 'string')
  )
  let changed = false
  const pages = plan.pages.map((page) => {
    if (!page || typeof page !== 'object') return page
    let next = page
    const alias = ALIASES.find((k) => Array.isArray(page[k]))
    if (alias) {
      const own = each(page.blocks)
      const have = new Set(own.map(blockOf))
      const { [alias]: moved, ...rest } = page
      next = { ...rest, blocks: [...own, ...moved.filter((d) => !have.has(blockOf(d)))] }
      changed = true
    }
    if (Array.isArray(next.blocks) && next.blocks.some((d) => shared.has(blockOf(d)))) {
      next = { ...next, blocks: next.blocks.filter((d) => !shared.has(blockOf(d))) }
      changed = true
    }
    return next
  })
  return changed ? { ...plan, pages } : plan
}

/**
 * A block the plan decides in sharedBlocks that the kit says is not shared (`shared: false`) and prints on one page only is
 * that page's: the decision moves to the page when the plan keeps it and decides the block nowhere there, and leaves when
 * the plan drops the page (nothing prints it). Dev lat32 (23/11/2026): JA Boxing's plan decided the team page's people block
 * in sharedBlocks (R01), the fix rounds ran out with it there, and the write step left the team page's photos and names as
 * the demo's.
 * @param {any} plan
 * @param {any} kit
 */
export function withUnsharedBlocksOnTheirPage(plan, kit) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.sharedBlocks) || !Array.isArray(plan.pages))
    return plan
  const kitBlocks = new Map(each(kit?.blocks).map((b) => [b?.id, b]))
  const pagesOf = (block) => each(kit?.pages).filter((p) => p && pageBlockOrder(p).includes(block))
  const byPage = new Map(plan.pages.filter((p) => p && typeof p === 'object').map((p) => [p.id, p]))
  const moves = new Map()
  const sharedBlocks = []
  for (const d of plan.sharedBlocks) {
    const id = blockOf(d)
    const home = kitBlocks.get(id)?.shared === false ? pagesOf(id) : []
    const page = home.length === 1 ? byPage.get(home[0].id) : null
    if (!page) {
      sharedBlocks.push(d)
      continue
    }
    if (page.decision !== 'keep') continue
    if (each(page.blocks).some((x) => blockOf(x) === id)) continue
    moves.set(page.id, [...(moves.get(page.id) ?? []), d])
  }
  if (sharedBlocks.length === plan.sharedBlocks.length) return plan
  const pages = plan.pages.map((p) =>
    p && moves.has(p.id) ? { ...p, blocks: [...each(p.blocks), ...moves.get(p.id)] } : p
  )
  return { ...plan, sharedBlocks, pages }
}
