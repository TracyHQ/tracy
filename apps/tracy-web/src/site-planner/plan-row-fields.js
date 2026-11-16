// After the model, before the checker: a field of a list row the decision keeps, that the decision both writes and
// hides, is written. R23 says a kept row keeps all its printed fields (a card shows its title, text and picture
// together) and R10g says nothing is decided twice; a slot in both the copy and the hidden slots of a row that stays
// can only mean the copy, since the row prints the field either way and a hidden field leaves the card with a gap.
// Dev corpus, 16/11/2026 (a JA Boxing plan, e89e4676): three feature descriptions of a class article's repeated
// field were written and hidden at once, 8 R10g and 6 R23 failures for one meaning.
//
// A row stays when the decision shows another field of it (written or framed, not hidden) and the row is within the
// rows the decision keeps of its list (`rows`), as R23 reads it (plan-check/rules-kept-rows.js shownRows). A hidden
// list, a row the decision cuts, or a slot outside every row stays with the planner. Returns the same plan when
// nothing changed.
import { indexKit } from './plan-check/kit-index.js'
import { decisionParts } from './plan-check/plan-index.js'
import { shownRows } from './plan-check/rules-kept-rows.js'

const each = (value) => (Array.isArray(value) ? value : [])

/**
 * @param {any} plan
 * @param {any} kit
 */
export function withWrittenRowFieldsShown(plan, kit) {
  if (!plan || typeof plan !== 'object' || !kit || typeof kit !== 'object') return plan
  // R23's own reading of the rows (kit lists, row slots and repeated stored fields), from the same kit index.
  const ctx = { kit, ...indexKit(kit), decisionParts }
  let changed = false
  const fix = (decision) => {
    if (!decision || typeof decision !== 'object' || decision.decision !== 'keep') return decision
    const parts = decisionParts(decision)
    const hidden = new Set(parts.hidden.map((h) => h.slot))
    const twice = new Set(parts.copy.map((c) => c.slot).filter((slot) => hidden.has(slot)))
    if (!twice.size) return decision
    const unhide = new Set()
    for (const list of shownRows(ctx, { d: decision }))
      for (const row of list.shown)
        if (row.kept)
          for (const [, slots] of row.fields) for (const slot of slots) if (twice.has(slot)) unhide.add(slot)
    if (!unhide.size) return decision
    changed = true
    return { ...decision, hiddenSlots: each(decision.hiddenSlots).filter((h) => !unhide.has(h?.slot)) }
  }
  const sharedBlocks = Array.isArray(plan.sharedBlocks) ? plan.sharedBlocks.map(fix) : plan.sharedBlocks
  const pages = Array.isArray(plan.pages)
    ? plan.pages.map((page) => {
        if (!page || typeof page !== 'object' || page.decision === 'drop' || !Array.isArray(page.blocks))
          return page
        const blocks = page.blocks.map(fix)
        return blocks.some((b, i) => b !== page.blocks[i]) ? { ...page, blocks } : page
      })
    : plan.pages
  if (!changed) return plan
  return {
    ...plan,
    ...(Array.isArray(sharedBlocks) ? { sharedBlocks } : {}),
    ...(Array.isArray(pages) ? { pages } : {})
  }
}
