// The "style one block" repair order (spec #418, ticket #421; ADR 0044, decision 30). The fixer orders a style for one kit
// block; code holds it to the allow list (lib/finisher-style.js) and to its fault, and only then is it written, as one rule
// keyed by the block in the finisher's marked style block of the kit's head injection module (style-write.js). A banned
// declaration refuses the whole order: nothing is written, and the refusal is the reason the repair log keeps.
import { blockScopes, styleRule } from '../../lib/finisher-style.js'

const blockOfSlot = (slot) => String(slot ?? '').replace(/\.[^.]*$/, '')

/** Why the order's block is not the one its fault is about, or null when it is. */
function untiedBlock(block, { fault, kitSlots, pageSlots }) {
  if (![...kitSlots].some((slot) => blockOfSlot(slot) === block)) return `${block} is not a block the kit has`
  if (fault.slot) {
    const named = blockOfSlot(fault.slot)
    return block === named ? null : `the order styles ${block}, the finder named a slot of ${named}`
  }
  if (![...pageSlots(fault.page)].some((slot) => blockOfSlot(slot) === block))
    return `${block} is not on ${fault.page}, where the fault was seen`
  return null
}

/**
 * @param {{ kind: 'style-block', block: string, target?: string | null, styles: Record<string, string> }} order
 * @param {{ fault: object, kitSlots: Set<string>, pageSlots: (page: string) => Set<string> }} context
 * @returns {{ ok: true, style: true, block: string, slot: string | null, line: string }
 *   | { ok: false, reason: string }} `line` is the rule line the block will hold
 */
export function validStyleOrder(order, context) {
  const block = order?.block
  if (typeof block !== 'string' || !blockScopes(block))
    return { ok: false, reason: `block ${JSON.stringify(block ?? null)} is not a block id` }
  const loose = untiedBlock(block, context)
  if (loose) return { ok: false, reason: loose }
  const rule = styleRule({ block, target: order.target ?? null, styles: order.styles })
  if (!rule.ok) return { ok: false, reason: `refused by the style allow list: ${rule.refusals.join('; ')}` }
  return { ok: true, style: true, block, slot: context.fault.slot ?? null, line: rule.line }
}
