// The finisher's typed repair orders (spec #418): the fixer model only proposes an order; code checks it against the kit,
// the write report and what the site holds now, and only a valid order is written. An order kind joins by adding an entry
// to ORDER_KINDS (#421 to #423), with its own `check`; nothing else branches on the kind. An order of a kind not listed,
// for a fault its kind does not fix, or naming a slot the kit does not have, is dropped with its reason and writes nothing.
import { showsRawCodes, visibleText } from '../../lib/site-copy/emphasis-markup.js'
import { FAULT_KINDS } from './fault-kinds.js'

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
const HTML_TAG = /<\/?[a-z][a-z0-9]*\b[^<>]*>/i

/**
 * Fix broken text in one slot: the slot's words exactly as the site holds them, with the printed markup taken out. It never
 * changes a word, so the meaning of the copy stays the writer's.
 */
function checkFixText(order, { current }) {
  if (typeof order.text !== 'string' || !order.text.trim()) return 'the order carries no text'
  if (showsRawCodes(order.text) || HTML_TAG.test(order.text)) return 'the new text still holds markup'
  if (squash(visibleText(current)) !== squash(order.text))
    return `the new text changes the words of the slot (it holds ${JSON.stringify(current)})`
  return null
}

/** Every order kind the fixer may use: `label` and `shape` are what the fixer is told, `check` what code holds it to. */
export const ORDER_KINDS = Object.freeze({
  'fix-text': Object.freeze({
    label: 'fix broken text in one slot',
    shape:
      '{ "kind": "fix-text", "slot": "<slot id>", "text": "<the slot words without the printed markup>" }',
    check: checkFixText
  })
})

/**
 * @param {unknown} order the fixer's answer
 * @param {{ fault: { kind: string }, kitSlots: Set<string>, keyOf: (slot: string) => string | null,
 *   currentOf: (key: string) => string | undefined }} context `keyOf` gives the content map key the write report wrote the
 *   slot under, `currentOf` what the site holds there now
 * @returns {{ ok: true, slot: string, key: string, changes: Record<string, string> } | { ok: false, reason: string }}
 */
export function validOrder(order, { fault, kitSlots, keyOf, currentOf }) {
  const entry = ORDER_KINDS[order?.kind]
  if (!entry) return { ok: false, reason: `unknown order kind ${JSON.stringify(order?.kind ?? null)}` }
  if (!FAULT_KINDS[fault.kind]?.orders.includes(order.kind))
    return { ok: false, reason: `a ${order.kind} order does not repair a ${fault.kind} fault` }
  const slot = order.slot
  if (typeof slot !== 'string' || !kitSlots.has(slot))
    return { ok: false, reason: `slot ${JSON.stringify(slot ?? null)} is not a slot the kit has` }
  const key = keyOf(slot)
  const current = key ? currentOf(key) : undefined
  if (!key || typeof current !== 'string')
    return {
      ok: false,
      reason: `slot ${slot} was not written by this run, so the site has no value to repair there`
    }
  const refused = entry.check(order, { current })
  if (refused) return { ok: false, reason: refused }
  return { ok: true, slot, key, changes: { [key]: order.text } }
}

/** The order kinds as the fixer is told them. */
export const orderListText = () =>
  Object.entries(ORDER_KINDS)
    .map(([kind, k]) => `- "${kind}": ${k.label}. Answer ${k.shape}`)
    .join('\n')
