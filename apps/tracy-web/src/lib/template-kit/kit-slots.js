// Shared: the site writer's input, the copy check, the copy export, the write step and the site check read it, so it lives in
// lib/ (module-graph.test.mjs). The slots a template kit block lists, in one reader: its own `slots`, each list's row slots and
// the slots of its demo rows, then its `demoOwned` slots (the demo business's own words, which the plan replaces or hides). A
// demo-owned text slot is a text slot like any other once the plan replaces it: the writer writes it, so its limit and the
// demo's accent emphasis (`inline`) must reach every place that reads a slot by id. Pure, no input is modified.

const each = (value) => (Array.isArray(value) ? value : [])
const isSlot = (s) => Boolean(s) && typeof s === 'object' && typeof s.id === 'string' && s.id !== ''

/** Every slot a kit block lists, in kit order, demo-owned slots last. @param {object} block */
export function blockSlotsOf(block) {
  return [
    ...each(block?.slots),
    ...each(block?.lists).flatMap((l) => [
      ...each(l?.rowSlots),
      ...each(l?.rows).flatMap((r) => each(r?.slots))
    ]),
    ...each(block?.demoOwned)
  ].filter(isSlot)
}

/**
 * The kit's slots by id, each with the block it prints in; the first listing of an id wins.
 * @param {object} kit the kit document
 * @returns {Map<string, { slot: object, block: object }>}
 */
export function kitSlotsWithBlock(kit) {
  const out = new Map()
  for (const block of each(kit?.blocks)) {
    if (!block || typeof block !== 'object') continue
    for (const slot of blockSlotsOf(block)) if (!out.has(slot.id)) out.set(slot.id, { slot, block })
  }
  return out
}

/** The kit's slots by id, the first listing of an id wins. @param {object} kit @returns {Map<string, object>} */
export function kitSlotIndex(kit) {
  return new Map([...kitSlotsWithBlock(kit)].map(([id, { slot }]) => [id, slot]))
}
