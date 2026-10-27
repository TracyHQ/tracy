/**
 * Reconcile a content plan with what the site ACTUALLY carries now.
 *
 * 🔒 WHY A RULE, NOT A HEURISTIC. Three sources want to decide one slot:
 *
 *   1. the original archive — demo text, `slot.sample`;
 *   2. this pipeline itself — what the previous seed run wrote, still kept in the old mapping's `changes`;
 *   3. a person — an agent or the customer editing through the contract door, after the plan was made.
 *
 * `slot.current` alone **cannot tell** (2) from (3), and the two demand opposite behaviour: what the
 * pipeline wrote itself a new brief MAY update (the customer changes a price, the price must change),
 * while what a person wrote must **never** be overwritten nor asked again. Mixing the two is how you
 * get one of two bugs: either the old price freezes, or the customer's hand edit disappears.
 *
 * The distinction needs no guessing, the data is there: the old mapping **remembers exactly** what it wrote.
 *
 *   current === sample                      → archive: the slot still holds the demo text
 *   current === applied[key]                → pipeline: the previous run wrote exactly this value
 *   otherwise                               → person: someone wrote over it
 *
 * ⚠ MEASURED 12/09/2026, and this is why this file exists: the old reconciliation layers sat behind
 * `mapping === null`, i.e. **they ran only when the brief changed**. An agent applying values straight
 * to the site — exactly what an agent did with `module-178.*` — was not recorded at all, and re-running
 * the same brief gave the same 540 pending slots, not one fewer. Site content is authoritative **whether
 * or not the brief changed**, so reconciliation must run on BOTH paths.
 */

/**
 * @typedef {{ key: string, sample: string, current?: string, maxCharacters: number }} Slot
 *
 * @param {object} args
 * @param {{ pending?: string[], changes?: Record<string,string>, evidence?: Record<string,string> }} args.plan
 * @param {Slot[]} args.slots        slots as `inspect` just returned them — `current` is the latest truth
 * @param {Record<string,string>} [args.applied]  the previous mapping's `changes`: what the pipeline wrote
 * @returns {{ plan: object, filledBySite: string[], alreadyApplied: string[], refusedOverwrite: string[], onSite: string[] }}
 */
export function reconcileWithSite({ plan, slots, applied = {} }) {
  const byKey = new Map(slots.map((slot) => [slot.key, slot]))

  /** Who holds this slot. `null` when the contract does not report `current` (no guessing). */
  const heldBy = (slot) => {
    if (!slot || slot.current === undefined) return null
    if (slot.current === slot.sample) return 'archive'
    return applied[slot.key] === slot.current ? 'pipeline' : 'person'
  }

  const pending = []
  const filledBySite = []
  const alreadyApplied = []
  for (const key of plan.pending ?? []) {
    const who = heldBy(byKey.get(key))
    if (who === 'person') {
      filledBySite.push(key)
      continue
    }
    if (who === 'pipeline') {
      // Written by the previous run yet still pending is a contradiction in the old mapping itself; the
      // site is the referee, so the slot counts as done.
      alreadyApplied.push(key)
      continue
    }
    pending.push(key)
  }

  const changes = { ...plan.changes }
  const evidence = { ...plan.evidence }
  const refusedOverwrite = []
  const onSite = []
  for (const [key, value] of Object.entries(changes)) {
    const slot = byKey.get(key)
    if (!slot || slot.current === undefined) continue
    if (slot.current === value) {
      // Already written: keeping it in changes only makes a redundant write and a meaningless new revision.
      delete changes[key]
      onSite.push(key)
      continue
    }
    if (heldBy(slot) === 'person') {
      // 🔒 THE SITE BEATS THE CACHE, AND IT MUST SAY SO. This is where "silently pick the cache" would
      // erase a hand edit. Drop it from changes and return the slot name for the caller to log.
      delete changes[key]
      delete evidence[key]
      refusedOverwrite.push(key)
    }
  }

  return {
    plan: { ...plan, changes, evidence, pending },
    filledBySite,
    alreadyApplied,
    refusedOverwrite,
    onSite
  }
}
