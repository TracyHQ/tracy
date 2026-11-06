// The finisher's typed repair orders (spec #418): the fixer model only proposes an order; code checks it against the kit,
// the write report and what the site holds now, and only a valid order is written. An order kind joins by adding an entry
// to ORDER_KINDS (#421 to #423), with its own `check`; nothing else branches on the kind. An order of a kind not listed,
// for a fault its kind does not fix, or naming a slot the kit does not have, is dropped with its reason and writes nothing.
// An order is tied to its fault: it targets the slot the finder named, or, when the finder named none, a slot of the page
// the fault was seen on whose words hold the markup the finder reported. An order that would write the words the slot
// holds already is a no-op, dropped too.
import { showsRawCodes, visibleText } from '../../lib/site-copy/emphasis-markup.js'
import { CONTENT_ORDER_KINDS } from './content-repair-orders.js'
import { FAULT_KINDS } from './fault-kinds.js'
import { ALLOWED_PROPERTIES } from '../../lib/finisher-style.js'
import { STYLE_STEPS, WORDS_STEPS } from './repair-steps.js'
import { validStyleOrder } from './style-order.js'
import { menuRefusal } from './repair-menu.js'
import { gluedWordsOf, isGluedRepair } from './glued-words.js'

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
const HTML_TAG = /<\/?[a-z][a-z0-9]*\b[^<>]*>/i
/** Markup as a finder reports it seen printed: content map codes such as ((span)), and HTML tags. */
const MARKUP_SEEN = /\(\(\s*\/?[a-z][a-z0-9]*\b[^()]*\)\)|<\/?[a-z][a-z0-9]*\b[^<>]*>/gi
const bare = (s) =>
  String(s ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()

/** Why an order's slot is not the one its fault is about, or null when it is. */
function untied(slot, { fault, pageSlots, current }) {
  if (fault.slot)
    return slot === fault.slot ? null : `the order targets ${slot}, the finder named ${fault.slot}`
  if (!pageSlots(fault.page).has(slot)) return `${slot} is not on ${fault.page}, where the fault was seen`
  // Glued words are tied by the words themselves: the slot's words, spacing aside, are the glued words seen.
  if (fault.kind === 'broken-layout')
    return gluedWordsOf(fault, current) ? null : `${slot} does not hold the glued words the finder saw`
  const reported = (String(fault.seen ?? '').match(MARKUP_SEEN) ?? []).map(bare)
  if (!reported.length) return `the finder named no slot and reported no markup to tie ${slot} to`
  if (!reported.some((markup) => bare(current).includes(markup)))
    return `${slot} does not hold the markup the finder reported (${reported.join(', ')})`
  return null
}

/**
 * Fix broken text in one slot: the slot's words exactly as the site holds them, with the printed markup taken out. It never
 * changes a word, so the meaning of the copy stays the writer's. For glued words (a broken layout) it may do one thing only:
 * put the missing space before each line break, every word and code kept (glued-words.js).
 */
function checkFixText(order, { current, fault }) {
  if (typeof order.text !== 'string' || !order.text.trim()) return 'the order carries no text'
  if (fault.kind === 'broken-layout')
    return isGluedRepair(current, order.text)
      ? null
      : `for glued words the new text may add only a space before the line break, every word and code kept (it holds ${JSON.stringify(current)})`
  if (showsRawCodes(order.text) || HTML_TAG.test(order.text)) return 'the new text still holds markup'
  if (squash(visibleText(current)) !== squash(order.text))
    return `the new text changes the words of the slot (it holds ${JSON.stringify(current)})`
  return null
}

/**
 * Every order kind the fixer may use: `label` and `shape` are what the fixer is told, `check` what code holds it to, `steps`
 * how a valid order is written, judged and undone (repair-steps.js).
 */
export const ORDER_KINDS = Object.freeze({
  'fix-text': Object.freeze({
    label: 'fix broken text in one slot',
    shape:
      '{ "kind": "fix-text", "slot": "<slot id>", "text": "<the slot words without the printed markup>" }',
    check: checkFixText,
    steps: WORDS_STEPS
  }),
  // A kind that writes elsewhere than a content slot validates the whole order itself (`validate`), with the same context.
  'style-block': Object.freeze({
    label: `style one block, only with these properties: ${Object.keys(ALLOWED_PROPERTIES).join(', ')}; never anything that hides, empties or moves content off screen; never a picture`,
    shape:
      '{ "kind": "style-block", "block": "<block id, e.g. block-2>", "target": "<null, or tags, classes or ids inside the block such as h2 or .title span>", "styles": { "<property>": "<value>" } }',
    validate: validStyleOrder,
    steps: STYLE_STEPS
  }),
  // #422: link, demo item, alt, page title or description, and accent emphasis; each checks itself (`validate`).
  ...CONTENT_ORDER_KINDS
})

/**
 * @param {unknown} order the fixer's answer
 * @param {{ fault: { kind: string, page: string, slot: string | null, seen: string | null }, kitSlots: Set<string>,
 *   pageSlots: (page: string) => Set<string>, keyOf: (slot: string) => string | null,
 *   currentOf: (key: string) => string | undefined, menu?: object }} context `menu` the fault's repair menu; `pageSlots` gives the kit slots a page shows, `keyOf` the
 *   content map key the write report wrote the slot under, `currentOf` what the site holds there now
 * @returns {{ ok: true, slot: string, key: string, current: string, after: string, changes: Record<string, string> }
 *   | { ok: false, reason: string }} `current` is what the slot holds before the repair, `after` what it holds once repaired;
 *   an order kind with its own `validate` (content-repair-orders.js) may answer a promise, and a `write` in place of `changes`
 */
export function validOrder(order, context) {
  const { fault, kitSlots, keyOf, currentOf } = context
  const entry = ORDER_KINDS[order?.kind]
  if (!entry) return { ok: false, reason: `unknown order kind ${JSON.stringify(order?.kind ?? null)}` }
  if (!FAULT_KINDS[fault.kind]?.orders.includes(order.kind))
    return { ok: false, reason: `a ${order.kind} order does not repair a ${fault.kind} fault` }
  // Everything the order names must be on the fault's repair menu (repair-menu.js); a refusal here is told to the fixer.
  const off = context.menu ? menuRefusal(order, context.menu) : null
  if (off) return { ok: false, reason: off, offMenu: true }
  if (entry.validate) return entry.validate(order, context)
  const { pageSlots } = context
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
  const loose = untied(slot, { fault, pageSlots, current })
  if (loose) return { ok: false, reason: loose }
  const refused = entry.check(order, { current, fault })
  if (refused) return { ok: false, reason: refused }
  if (order.text === current)
    return { ok: false, reason: `a no-op: the new text is the text ${slot} holds now, so nothing is written` }
  const glued = fault.kind === 'broken-layout' ? { glued: true } : {}
  return { ok: true, slot, key, current, after: order.text, changes: { [key]: order.text }, ...glued }
}

/** The order kinds as the fixer is told them. */
export const orderListText = () =>
  Object.entries(ORDER_KINDS)
    .map(([kind, k]) => `- "${kind}": ${k.label}. Answer ${k.shape}`)
    .join('\n')

/** How a valid order of this kind is written, judged and undone. */
export const stepsOf = (kind) => ORDER_KINDS[kind].steps
