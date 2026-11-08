// The only label of a control that stays is never hidden alone (ADR 0044, decision 31): a button whose words go and whose link
// stays prints an arrow with no words. When the plan hides a label slot that a kept kit link prints as its words, and that link
// does not leave the page, the hide order climbs the closing ladder instead: (1) words a file has for the label are written;
// (2) else the control itself leaves, by emptying the slots that hold its address; (3) else the label keeps its demo words and
// its line fails, so the site check blocks on it. A plan whose own orders take the control is unchanged. Nothing here writes.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'
import { keptBlocks } from './owner-table.js'

const each = (value) => (Array.isArray(value) ? value : [])
/** The orders that take a label off the page without its control. */
const TAKES_LABEL = new Set(['slot', 'empty'])
/** The orders that leave nothing of a control on the page. */
const LEAVES = new Set(['carried', 'block', 'removed', 'slot', 'empty', 'rewritten', 'menu', 'kept'])
const leaves = (order) => Boolean(order) && LEAVES.has(order.via) && !order.refused

/** The kit links of kept, undropped blocks, by the label slot they print. */
function controlsByLabel(plan, kit, dropped) {
  const kept = new Set(keptBlocks(plan).map((d) => d.block))
  const out = new Map()
  for (const block of each(kit?.blocks)) {
    if (!kept.has(block?.id) || dropped.has(block.id)) continue
    for (const link of each(block.links))
      if (typeof link?.labelId === 'string' && typeof link.id === 'string')
        out.set(link.labelId, [...(out.get(link.labelId) ?? []), link])
  }
  return out
}

/** The words the plan itself gives a slot (a copy entry with `text`), else null. */
function planWords(plan, slot) {
  const decisions = [...each(plan?.sharedBlocks), ...each(plan?.pages).flatMap((p) => each(p?.blocks))]
  const entries = decisions.flatMap((d) => [
    ...each(d?.copy),
    ...each(d?.lists).flatMap((l) => each(l?.items).flatMap((i) => each(i?.copy)))
  ])
  const found = entries.find((c) => c?.slot === slot && typeof c.text === 'string' && c.text.trim())
  return found ? found.text : null
}

/** An order that takes a control by emptying every slot holding its address, or the reason it cannot. */
function controlOrder(link, { doorOf, onSite, changes }) {
  const door = doorOf(link.id)
  if ((door.via !== 'slot' && door.via !== 'shared') || !door.keys?.length)
    return { reason: `no slot of this site holds the address of ${link.id}, so it cannot leave` }
  const stuck = door.keys.find((key) => key in changes || !onSite.get(key)?.canHide)
  if (stuck)
    return {
      reason: `${stuck}, which holds the address of ${link.id}, ${stuck in changes ? 'is written by the write step' : 'cannot be emptied on this site'}`
    }
  return {
    order: { via: 'carried', key: door.keys[0], keys: door.keys, holder: 'address', empties: door.keys }
  }
}

/**
 * @param {{ plan: object, kit: object, orders: Map<string, object>, dropped: Map<string, string>,
 *   doorOf: (id: string) => object, onSite: Map<string, object>, changes: Record<string, string>,
 *   owners?: Map<string, object>, heldWords?: Map<string, string> }} input `orders`: the hide orders by line slot, changed in place; `dropped`: block id to
 *   module key; `heldWords`: words a file had for a slot whose hide won over them, by content map key
 * @returns {{ restored: Record<string, string>, controls: Map<string, object> }} `restored`: label words to write, by key;
 *   `controls`: the orders that take a control no plan line names, by link id
 */
export function guardControlLabels({
  plan,
  kit,
  orders,
  dropped,
  doorOf,
  onSite,
  changes,
  owners = new Map(),
  heldWords = new Map()
}) {
  const restored = {}
  const controls = new Map()
  for (const [label, links] of controlsByLabel(plan, kit, dropped)) {
    const order = orders.get(label)
    if (!order || !TAKES_LABEL.has(order.via)) continue
    // A link the plan claims is the link stage's: it says such a link leaves with its hidden label (link-lines.js, via 'label').
    const staying = links.filter(
      (link) =>
        owners.get(link.id)?.kind !== 'link' && !leaves(orders.get(link.id)) && !leaves(controls.get(link.id))
    )
    if (!staying.length) continue
    const names = staying.map((link) => link.id).join(', ')
    const only = `this slot is the only label of ${names}, which stays on the page`
    const key = order.key ?? contentMapKey(label)
    const words = heldWords.get(key) ?? planWords(plan, label)
    if (typeof words === 'string' && words.trim()) {
      restored[key] = words
      orders.set(label, {
        via: 'restored',
        key,
        value: words,
        reason: `the plan hides this slot, but ${only}: the words a file has for it are written rather than print a control with no words`
      })
      continue
    }
    const taken = staying.map((link) => [link, controlOrder(link, { doorOf, onSite, changes })])
    const refused = taken.find(([, t]) => !t.order)
    if (refused) {
      orders.set(label, {
        via: 'failed',
        key,
        part: 'control-label',
        reason: `the plan hides this slot, but ${only}, no file has words for it, and the control cannot leave (${refused[1].reason}): its demo words remain rather than print a control with no words`
      })
      continue
    }
    for (const [link, { order: taking }] of taken)
      controls.set(link.id, {
        ...taking,
        reason: `the plan hides ${label}, the only label of this control, so the control leaves with it: ${taking.keys.join(', ')} emptied`
      })
  }
  return { restored, controls }
}
