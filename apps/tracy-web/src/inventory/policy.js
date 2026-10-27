/**
 * How many instances a pool is short, and what to call the intents that fill the gap
 * (`tasks/todo-inventory-va-seed-theo-brief.md` §4). Pure: no database, no clock, no network — so
 * the arithmetic that decides how much a host installs can be argued with in a table of cases
 * rather than by watching a fleet.
 */

/**
 * The gap between what a pool holds and what its policy asks for, with the one sentence an
 * operator needs when the answer is zero.
 *
 * 🔒 A ZERO IS NEVER BARE. Every path out of here names a `bottleneck`, because "deficit 0" has
 * six different causes — paused, switched off, at the ceiling, at the concurrency limit, waiting
 * on a human, or simply full — and an Ops screen that showed only the number would read the same
 * for a healthy pool and for one that has been stuck behind a review for two days.
 *
 * 🔒 THE WINDOW COMES BEFORE THE ARITHMETIC (§4 rule 2). Refill only runs when `ready` has fallen
 * to `lowWatermark`, and only then is the deficit `targetReady - ready - preparing -
 * awaitingReview`. A pool that topped up an hour ago is `at-target` — computing a deficit off
 * `targetReady` alone would have it reinstalling towards the target on every tick.
 *
 * @param {{ supply: { ready: number, preparing: number, awaitingReview: number, stock: number },
 *           policy: { enabled: boolean, paused: boolean, lowWatermark: number, targetReady: number,
 *                     maxStock: number, maxConcurrentPrepares: number } }} args
 * @returns {{ deficit: number, reason: string,
 *   bottleneck: null | 'paused' | 'disabled' | 'max-stock' | 'concurrency' | 'awaiting-review' | 'at-target' }}
 */
export function deficitOf({ supply, policy }) {
  const ready = supply.ready ?? 0
  const preparing = supply.preparing ?? 0
  const awaitingReview = supply.awaitingReview ?? 0
  const stock = supply.stock ?? 0

  if (policy.paused) return { deficit: 0, reason: 'refill is paused', bottleneck: 'paused' }
  if (!policy.enabled) return { deficit: 0, reason: 'pool is not enabled', bottleneck: 'disabled' }

  const stockRoom = policy.maxStock - stock
  if (stockRoom <= 0)
    return {
      deficit: 0,
      reason: `stock ${stock} is at maxStock ${policy.maxStock}`,
      bottleneck: 'max-stock'
    }
  const prepareRoom = policy.maxConcurrentPrepares - preparing
  if (prepareRoom <= 0)
    return {
      deficit: 0,
      reason: `${preparing} preparing is at maxConcurrentPrepares ${policy.maxConcurrentPrepares}`,
      bottleneck: 'concurrency'
    }
  if (ready > policy.lowWatermark)
    return {
      deficit: 0,
      reason: `ready ${ready} is above lowWatermark ${policy.lowWatermark}`,
      bottleneck: 'at-target'
    }

  const want = Math.max(0, policy.targetReady - ready - preparing - awaitingReview)
  if (want === 0) {
    // 🔒 SAY IT IS A REVIEW, DO NOT INSTALL AROUND IT (§4 rule 2). Instances stuck at
    // `awaiting_review` count towards the target, so the deficit is legitimately zero — but the
    // pool has no usable stock, and an operator reading `at-target` here would go looking for a
    // fault that is actually an unpressed approve button.
    if (awaitingReview > 0)
      return {
        deficit: 0,
        reason: `${awaitingReview} awaiting review`,
        bottleneck: 'awaiting-review'
      }
    return {
      deficit: 0,
      reason: `ready ${ready} plus ${preparing} preparing meets targetReady ${policy.targetReady}`,
      bottleneck: 'at-target'
    }
  }

  const deficit = Math.min(want, stockRoom, prepareRoom)
  if (deficit < want && stockRoom <= prepareRoom)
    return { deficit, reason: `${want} short, capped to ${deficit} by maxStock`, bottleneck: 'max-stock' }
  if (deficit < want)
    return {
      deficit,
      reason: `${want} short, capped to ${deficit} by maxConcurrentPrepares`,
      bottleneck: 'concurrency'
    }
  return {
    deficit,
    reason: `ready ${ready} at or below lowWatermark ${policy.lowWatermark}, ${deficit} short of targetReady ${policy.targetReady}`,
    bottleneck: null
  }
}

/**
 * The names of the intents that fill a deficit: the lowest free slots in the pool.
 *
 * 🔒 SLOTS, NOT COUNTERS (§4 rule 5, `inventory_refill_intent.job_key`). Two cron replicas and a
 * claim event looking at the same deficit must write the SAME keys, so exactly one row per slot
 * survives the primary key. A monotonically increasing counter would give each of them a different
 * name and enqueue the deficit three times over.
 *
 * @param {string} poolKey
 * @param {number} deficit
 * @param {Iterable<string | number>} [taken] job keys already in the outbox for this pool (or the
 *   slot numbers themselves); anything that does not name a slot of THIS pool is ignored.
 * @returns {string[]}
 */
export function jobKeysFor(poolKey, deficit, taken = []) {
  const used = new Set()
  for (const entry of taken) {
    if (typeof entry === 'number') {
      used.add(entry)
      continue
    }
    if (typeof entry !== 'string' || !entry.startsWith(`${poolKey}:`)) continue
    const slot = Number(entry.slice(poolKey.length + 1))
    if (Number.isSafeInteger(slot)) used.add(slot)
  }
  const keys = []
  for (let slot = 1; keys.length < deficit; slot++) {
    if (used.has(slot)) continue
    keys.push(`${poolKey}:${slot}`)
  }
  return keys
}
