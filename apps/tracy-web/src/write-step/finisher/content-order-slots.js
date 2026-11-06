// What every content order (content-repair-orders.js, demo-item-order.js) holds a slot to before it may repair it: a slot the
// kit has, written by this run, the one the fault is about. And the repair of one slot, unless it writes what is there.

export const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
export const no = (reason) => ({ ok: false, reason })

/** The slot an order names, held to the kit, to what this run wrote and to the fault: `{ slot, key, current }` or a refusal. */
export function slotOf(order, { fault, kitSlots, pageSlots, keyOf, currentOf }) {
  const slot = order.slot
  if (typeof slot !== 'string' || !kitSlots.has(slot))
    return no(`slot ${JSON.stringify(slot ?? null)} is not a slot the kit has`)
  const key = keyOf(slot)
  const current = key ? currentOf(key) : undefined
  if (!key || typeof current !== 'string')
    return no(`slot ${slot} was not written by this run, so the site has no value to repair there`)
  if (fault.slot && slot !== fault.slot)
    return no(`the order targets ${slot}, the finder named ${fault.slot}`)
  if (!fault.slot && !pageSlots(fault.page).has(slot))
    return no(`${slot} is not on ${fault.page}, where the fault was seen`)
  return { ok: true, slot, key, current }
}

/** A contract repair of one slot, unless it writes what the slot holds already. */
export const slotRepair = (at, after) =>
  after === at.current
    ? no(`a no-op: the new value is what ${at.slot} holds now, so nothing is written`)
    : { ok: true, slot: at.slot, key: at.key, current: at.current, after, changes: { [at.key]: after } }
