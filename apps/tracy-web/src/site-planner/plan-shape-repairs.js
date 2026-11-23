// After the model, before the checker: two slips of the plan's shape that have one reading, repaired by code.
// - A page's block decisions under another name (`blockDecisions`, `blocksDecisions`) are its `blocks`.
// - A block the plan decides in sharedBlocks and again on a page is the shared decision's: the page's copy is dropped.
// Dev lat30 (23/11/2026): JA Boxing's plan round 0 wrote the home page's blocks as `blockDecisions` (R00) and decided the
// header and two shared sections again on the home page (R10g); the fix round rewrote the plan in six minutes. Returns the
// same plan when nothing changed.

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
