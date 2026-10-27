/**
 * The inventory book: pools and their policy, the instances in them, the refill outbox and the
 * generation approvals (`026-site-inventory.sql`).
 *
 * This file is the only place that writes those four tables. Everything it exports takes the pool
 * or the client as its first argument — a caller inside a transaction passes its client, so a
 * reservation and the outbox row that pays for it commit together or not at all.
 */

/** Policy fields `setPolicy` accepts, with the check each one must pass before it reaches SQL. */
const POLICY = {
  enabled: { column: 'enabled', ok: (v) => typeof v === 'boolean' },
  lowWatermark: { column: 'low_watermark', ok: (v) => Number.isSafeInteger(v) && v >= 0 },
  targetReady: { column: 'target_ready', ok: (v) => Number.isSafeInteger(v) && v >= 1 },
  maxStock: { column: 'max_stock', ok: (v) => Number.isSafeInteger(v) && v >= 1 },
  maxConcurrentPrepares: { column: 'max_concurrent_prepares', ok: (v) => Number.isSafeInteger(v) && v >= 1 },
  reviewHold: { column: 'review_hold', ok: (v) => typeof v === 'boolean' },
  maxAttempts: { column: 'max_attempts', ok: (v) => Number.isSafeInteger(v) && v >= 1 },
  healthTtlSeconds: { column: 'health_ttl_seconds', ok: (v) => Number.isSafeInteger(v) && v > 0 },
  paused: { column: 'paused', ok: (v) => typeof v === 'boolean' },
  pausedReason: {
    column: 'paused_reason',
    ok: (v) => v === null || (typeof v === 'string' && v.trim() !== '')
  }
}

/**
 * The pool row for one key, created at its default policy if it is new.
 *
 * 🔒 AN EXISTING POOL KEEPS ITS POLICY. A release being republished, a reconciler restarting, an
 * operator pressing Prepare now — all of them come through here, and any of them overwriting
 * `enabled`/`target_ready` would undo an operator's decision with no press and no audit. The only
 * thing a second call moves is who touched it last.
 * @param {{ query: Function }} pool
 */
export async function upsertPool(
  pool,
  { poolKey, environment, host, platform, quickstartTag, quickstartVersion, generation, updatedBy = null }
) {
  const { rows } = await pool.query(
    `insert into inventory_pool
       (pool_key, environment, host, platform, quickstart_tag, quickstart_version, generation, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (pool_key) do update set updated_by = excluded.updated_by, updated_at = now()
     returning *`,
    [poolKey, environment, host, platform, quickstartTag, quickstartVersion, generation, updatedBy]
  )
  return rows[0]
}

/** @param {{ query: Function }} pool */
export async function readPool(pool, poolKey) {
  const { rows } = await pool.query('select * from inventory_pool where pool_key = $1', [poolKey])
  return rows[0] ?? null
}

/** @param {{ query: Function }} pool */
export async function listPools(pool) {
  const { rows } = await pool.query('select * from inventory_pool order by pool_key')
  return rows
}

/**
 * Change part of one pool's policy, under an optimistic lock.
 *
 * The bounds are checked here as well as by the table's own constraint, on purpose: a constraint
 * violation arrives as a thrown 23514 naming a constraint, which a screen cannot turn into a
 * sentence about which field was wrong. The merge is against the row as it stands, so a patch
 * setting only `targetReady` is still refused when the new value would leave `maxStock` below it.
 *
 * @param {{ query: Function }} pool
 * @param {string} poolKey
 * @param {Record<string, unknown>} patch
 * @param {{ expectedRevision: number, updatedBy?: string | null }} args
 * @returns {Promise<{ ok: true, row: any } | { ok: false, code: 'REVISION_CONFLICT' | 'INVALID', detail: string }>}
 */
export async function setPolicy(pool, poolKey, patch, { expectedRevision, updatedBy = null }) {
  if (!patch || typeof patch !== 'object')
    return { ok: false, code: 'INVALID', detail: 'patch is not an object' }
  const keys = Object.keys(patch)
  if (keys.length === 0) return { ok: false, code: 'INVALID', detail: 'patch is empty' }
  for (const key of keys) {
    if (!Object.hasOwn(POLICY, key)) return { ok: false, code: 'INVALID', detail: `unknown field ${key}` }
    if (!POLICY[key].ok(patch[key])) return { ok: false, code: 'INVALID', detail: `out of bounds: ${key}` }
  }
  const current = await readPool(pool, poolKey)
  if (!current) return { ok: false, code: 'INVALID', detail: 'unknown pool' }
  if (!Number.isSafeInteger(expectedRevision))
    return { ok: false, code: 'INVALID', detail: 'expectedRevision is not a number' }
  if (current.revision !== expectedRevision)
    return { ok: false, code: 'REVISION_CONFLICT', detail: 'pool moved' }

  const after = {
    lowWatermark: patch.lowWatermark ?? current.low_watermark,
    targetReady: patch.targetReady ?? current.target_ready,
    maxStock: patch.maxStock ?? current.max_stock,
    paused: patch.paused ?? current.paused,
    // An explicit `null` clears the reason; leaving it out keeps whatever is on the row.
    pausedReason: Object.hasOwn(patch, 'pausedReason') ? patch.pausedReason : current.paused_reason
  }
  if (after.lowWatermark > after.targetReady)
    return { ok: false, code: 'INVALID', detail: 'lowWatermark above targetReady' }
  if (after.maxStock < after.targetReady)
    return { ok: false, code: 'INVALID', detail: 'maxStock below targetReady' }
  // 🔒 "PAUSED, NO REASON" IS THE STATE NOBODY CAN ACT ON. Refill stopping is an operational fact
  // someone else has to read off a screen at 3am; the table says the same thing in a constraint.
  if (after.paused && !after.pausedReason)
    return { ok: false, code: 'INVALID', detail: 'paused needs pausedReason' }

  const sets = keys.map((k, i) => `${POLICY[k].column} = $${i + 3}`)
  const { rows } = await pool.query(
    `update inventory_pool set ${sets.join(', ')}, revision = revision + 1,
            updated_by = $${keys.length + 3}, updated_at = now()
      where pool_key = $1 and revision = $2 returning *`,
    [poolKey, expectedRevision, ...keys.map((k) => patch[k]), updatedBy]
  )
  // Zero rows here means another writer won between the read above and this update.
  if (!rows[0]) return { ok: false, code: 'REVISION_CONFLICT', detail: 'pool moved' }
  return { ok: true, row: rows[0] }
}

/**
 * What one pool holds, in the buckets §4 rule 1 counts in.
 *
 * `ready` is deliberately narrower than the state: an instance whose health check has aged past
 * the pool's TTL is not stock anybody may hand out, because "ready" in §3 means the machine check
 * is STILL valid, not that it once passed. It does keep counting towards `stock`, because it is
 * still holding a database, a volume and a port on the host — a cap that stopped counting stale
 * instances would let a pool of expired stock refill itself past its own ceiling.
 *
 * `assigned` covers `assigning` too: both have an owner on the way and neither is available.
 * @param {{ query: Function }} pool
 */
export async function supplyOf(pool, poolKey) {
  const { rows } = await pool.query(
    `select
       count(*) filter (where i.state = 'ready' and i.health_ok is true
         and i.health_checked_at is not null
         and i.health_checked_at > now() - make_interval(secs => p.health_ttl_seconds)) as ready,
       count(*) filter (where i.state in ('queued', 'preparing', 'verifying')) as preparing,
       count(*) filter (where i.state = 'awaiting_review') as awaiting_review,
       count(*) filter (where i.state = 'reserved') as reserved,
       count(*) filter (where i.state in ('assigning', 'assigned')) as assigned,
       count(*) filter (where i.state = 'quarantined') as quarantined,
       count(*) filter (where i.state = 'draining') as draining,
       -- 🔒 AN ASSIGNED INSTANCE IS NOT STOCK, AND CONFLATING THE TWO STOPS REFILL FOR EVER.
       -- Section 4 rule 3 of the task names exactly what the stock cap counts -- awaiting_review,
       -- reserved, quarantined, draining, the ones still holding resources -- and puts sites
       -- already handed over under a DIFFERENT number, the global host quota. Counting assigned
       -- here makes a maxStock of N mean "this pool may ever serve N customers", because every
       -- customer occupies a slot permanently: measured 22/09 on the WordPress Business pool with
       -- maxStock 1, one instance claimed, and the reconciler then answering deficit 0 with
       -- bottleneck max-stock against a pool holding zero ready and no way ever to get one.
       -- A cap on how many sites a HOST may carry is a real thing and a separate one; handedOver
       -- is reported here so it can be built without re-deriving it.
       count(*) filter (where i.state not in ('retired', 'assigned')) as stock,
       count(*) filter (where i.state = 'assigned') as handed_over
     from inventory_pool p
     left join inventory_instance i on i.pool_key = p.pool_key
     where p.pool_key = $1
     group by p.pool_key`,
    [poolKey]
  )
  const r = rows[0]
  const n = (v) => Number(v ?? 0)
  return {
    ready: n(r?.ready),
    preparing: n(r?.preparing),
    awaitingReview: n(r?.awaiting_review),
    reserved: n(r?.reserved),
    assigned: n(r?.assigned),
    quarantined: n(r?.quarantined),
    draining: n(r?.draining),
    stock: n(r?.stock),
    /** Instances a customer already holds. Not stock, and not free either — the number a host
     * quota is built on (task §4 rule 3). Reported so nothing has to re-derive it. */
    handedOver: n(r?.handed_over)
  }
}

/**
 * A new instance at the bottom of the ladder. Takes a client rather than the pool: the site row and
 * this row are written in one transaction, since an instance whose site row rolled back names a
 * site that does not exist.
 * @param {{ query: Function }} client
 */
export async function insertInstance(client, { poolKey, siteKey, label, host, generation }) {
  const { rows } = await client.query(
    `insert into inventory_instance (pool_key, site_key, label, host, generation)
     values ($1, $2, $3, $4, $5) returning *`,
    [poolKey, siteKey, label, host, generation]
  )
  return rows[0]
}

/**
 * Move one instance along the ladder. Every field is optional; only what is passed is written, so
 * a health result does not blank a job id.
 *
 * A health verdict always stamps `health_checked_at`: the pair is what the TTL is measured from,
 * and a verdict without a time is a verdict that never expires.
 * @param {{ query: Function }} pool
 * @returns {Promise<any | null>} the row, or null if there is no such instance
 */
export async function setInstanceState(
  pool,
  id,
  { state, jobId, lastError, healthOk, healthDetail, hashes, nextAttemptAt, bumpAttempt = false } = {}
) {
  const sets = ['updated_at = now()']
  const params = [id]
  const put = (sql, value) => {
    params.push(value)
    sets.push(`${sql} = $${params.length}`)
  }
  if (state !== undefined) put('state', state)
  if (jobId !== undefined) put('job_id', jobId)
  if (lastError !== undefined) put('last_error', lastError)
  if (healthOk !== undefined) {
    put('health_ok', healthOk)
    sets.push('health_checked_at = now()')
  }
  if (healthDetail !== undefined) put('health_detail', JSON.stringify(healthDetail))
  if (hashes !== undefined) put('hashes', JSON.stringify(hashes))
  if (nextAttemptAt !== undefined) put('next_attempt_at', nextAttemptAt)
  if (bumpAttempt) sets.push('attempts = attempts + 1')
  const { rows } = await pool.query(
    `update inventory_instance set ${sets.join(', ')} where id = $1 returning *`,
    params
  )
  return rows[0] ?? null
}

/** @param {{ query: Function }} pool */
export async function instanceById(pool, id) {
  const { rows } = await pool.query('select * from inventory_instance where id = $1', [id])
  return rows[0] ?? null
}

/** @param {{ query: Function }} pool */
export async function instanceBySiteKey(pool, siteKey) {
  const { rows } = await pool.query('select * from inventory_instance where site_key = $1', [siteKey])
  return rows[0] ?? null
}

/** @param {{ query: Function }} pool */
export async function listInstances(pool, poolKey, { states } = {}) {
  const { rows } = await pool.query(
    `select * from inventory_instance
      where pool_key = $1 and ($2::text[] is null or state = any($2::text[]))
      order by created_at`,
    [poolKey, states ?? null]
  )
  return rows
}

/**
 * Take exactly one `ready` instance out of a pool for one (account, build).
 *
 * 🔒 FIRST USE OF `for update skip locked` IN THIS REPOSITORY, AND WHY IT HAD TO BE. Every other
 * compare-and-swap here picks a row it can NAME — `insert … on conflict (k) do update … where
 * <guard>` (`saveBuildBase`, `seat_sync`) settles a race over ONE known key. This one has to pick
 * one row out of N equally valid ones, and the two requests racing must not pick the same one. A
 * plain `update … where state='ready' limit 1`-shaped subselect does not do it: both transactions
 * read the same top row, the second blocks on the first's lock, and when it wakes it re-evaluates
 * its own already-chosen id — which is now `reserved` — and takes nothing, so a pool with two
 * ready instances hands out one. `for update skip locked` makes the second transaction step over
 * the locked row and take the next, which is the behaviour a queue needs.
 *
 * The retry short-circuit comes first and bumps nothing: §5 says the same request must converge on
 * the instance it already took, and a re-issued reservation that moved the fencing token would
 * invalidate the checkpoints the first attempt is still carrying.
 *
 * @param {{ query: Function }} client a client inside the caller's transaction
 * @returns {Promise<{ ok: true, instance: any, fencingToken: number } | { ok: false, code: 'NONE_READY' }>}
 */
export async function reserveReady(client, { poolKey, accountId, buildId }) {
  const { rows: held } = await client.query(
    `select * from inventory_instance
      where reserved_account = $1 and reserved_build = $2
        and state in ('reserved', 'assigning', 'assigned')`,
    [accountId, buildId]
  )
  // Deliberately not filtered by pool: §4 says a build that already has an instance may not be
  // moved onto a second one, whichever pool the first came from. A caller that asked for another
  // pool is asking about a build that is already placed, and gets told where.
  if (held[0]) return { ok: true, instance: held[0], fencingToken: Number(held[0].fencing_token) }

  const { rows } = await client.query(
    `update inventory_instance set
       state = 'reserved', reserved_account = $2, reserved_build = $3, reserved_at = now(),
       fencing_token = fencing_token + 1, updated_at = now()
     where id = (
       select i.id from inventory_instance i
         join inventory_pool p on p.pool_key = i.pool_key
        where i.pool_key = $1 and i.state = 'ready' and i.health_ok is true
          and i.health_checked_at is not null
          and i.health_checked_at > now() - make_interval(secs => p.health_ttl_seconds)
        order by i.created_at
        for update of i skip locked
        limit 1)
     returning *`,
    [poolKey, accountId, buildId]
  )
  if (!rows[0]) return { ok: false, code: 'NONE_READY' }
  return { ok: true, instance: rows[0], fencingToken: Number(rows[0].fencing_token) }
}

/**
 * Put a reservation back, when the worker that held it proved the instance is still clean.
 *
 * Only a `reserved` instance comes back: once activation has moved it to `assigning`/`assigned`
 * the customer may already hold a seat, a session or data on it (§5), and handing it to the next
 * request would hand over somebody's site. The fencing token is checked, not the timestamp — a
 * worker that resumed after its reservation was released and re-taken carries the old token and is
 * refused by it.
 * @param {{ query: Function }} client
 * @returns {Promise<{ ok: true, instance: any } | { ok: false, code: 'NOT_FOUND' | 'NOT_RESERVED' | 'STALE_FENCE' }>}
 */
export async function releaseReservation(client, id, { expectedFencingToken }) {
  const { rows } = await client.query(
    `update inventory_instance set
       state = 'ready', reserved_account = null, reserved_build = null, reserved_at = null,
       updated_at = now()
     where id = $1 and state = 'reserved' and fencing_token = $2 returning *`,
    [id, expectedFencingToken]
  )
  if (rows[0]) return { ok: true, instance: rows[0] }
  const current = await instanceById(client, id)
  if (!current) return { ok: false, code: 'NOT_FOUND' }
  if (current.state !== 'reserved') return { ok: false, code: 'NOT_RESERVED' }
  return { ok: false, code: 'STALE_FENCE' }
}

/**
 * Write refill intents into the outbox.
 *
 * 🔒 THE KEY IS THE DEDUPE (§4 rule 5). The caller composes `poolKey:<slot>` (`policy.js`'s
 * `jobKeysFor`), so a claim event and two cron replicas racing on one deficit all write the same
 * primary keys and exactly one row per slot survives. `inserted` is how many were actually new —
 * a caller that treats it as "how many I asked for" would enqueue a deficit three times.
 * @param {{ query: Function }} client
 * @returns {Promise<{ inserted: number }>}
 */
export async function enqueueRefill(client, { poolKey, jobKeys }) {
  if (!Array.isArray(jobKeys) || jobKeys.length === 0) return { inserted: 0 }
  const result = await client.query(
    `insert into inventory_refill_intent (job_key, pool_key)
     select k, $2 from unnest($1::text[]) as k
     on conflict (job_key) do nothing`,
    [jobKeys, poolKey]
  )
  return { inserted: result.rowCount ?? 0 }
}

/**
 * Intents whose time has come, oldest first.
 *
 * A READ, not a claim: it does not move anything to `running`. Whoever runs them owns that
 * transition, because the row must go to `running` in the same breath as whatever else that worker
 * writes, and this function cannot know what that is.
 * @param {{ query: Function }} pool
 */
/**
 * EVERY job key this pool has ever been given — the names `jobKeysFor` must not hand out again.
 *
 * 🔒 A SLOT IS TAKEN BY AN INTENT, NOT BY AN INSTANCE, and it stays taken after that intent ENDS.
 * Two separate mistakes live here, both measured:
 *
 *   1. Counting INSTANCES to pick the next slot hands out a name the outbox is already holding —
 *      an intent that has not reached `prepareInstance` yet has no instance row. The insert then
 *      collapses into the existing row and the caller is told `enqueued: 0` for a real shortfall.
 *   2. Counting only `pending`/`running` is worse, and it fails on the ORDINARY path rather than a
 *      rare one: `job_key` is the primary key and a settled row is KEPT as history, so the moment
 *      the first refill finishes, slot 1 disappears from the list, is handed out again, and
 *      `on conflict do nothing` swallows it — for ever. Measured on the Ops prepare door: press 1
 *      → 202, every press after the first intent settled → 409 with nothing enqueued, and the
 *      reconciler's own loop stops refilling the pool at the same moment for the same reason.
 *
 * So this names every row of the pool, whatever its state. Use `inFlightRefills` for the other
 * question — how much work is already under way — which is a different number.
 * @param {{ query: Function }} pool
 * @returns {Promise<string[]>}
 */
export async function takenSlots(pool, poolKey) {
  const { rows } = await pool.query('select job_key from inventory_refill_intent where pool_key = $1', [
    poolKey
  ])
  return rows.map((r) => r.job_key)
}

/**
 * The job keys of this pool that nobody has settled yet — work already under way.
 *
 * This is what a deficit must be net of: `supplyOf` counts INSTANCES, and an intent that has not
 * reached `prepareInstance` has none, so a second pass would read the same supply, compute the
 * same deficit, and allocate that many FRESH slots beside the ones already in flight.
 * @param {{ query: Function }} pool
 * @returns {Promise<string[]>}
 */
export async function inFlightRefills(pool, poolKey) {
  const { rows } = await pool.query(
    `select job_key from inventory_refill_intent
      where pool_key = $1 and state in ('pending', 'running')`,
    [poolKey]
  )
  return rows.map((r) => r.job_key)
}

export async function dueRefills(pool, limit = 20) {
  const { rows } = await pool.query(
    `select * from inventory_refill_intent
      where state = 'pending' and next_at <= now()
      order by next_at, job_key limit $1`,
    [limit]
  )
  return rows
}

/**
 * Close one intent out. A failure keeps its row: an intent that was lost and an intent that was
 * honoured must stay distinguishable, which is why `instance_id` is written even on the way to
 * `done`.
 * @param {{ query: Function }} pool
 * @returns {Promise<any | null>}
 */
export async function settleRefill(pool, jobKey, { ok, instanceId = null, error = null }) {
  const { rows } = await pool.query(
    `update inventory_refill_intent set
       state = $2, instance_id = coalesce($3, instance_id), last_error = $4,
       attempts = attempts + case when $2 = 'failed' then 1 else 0 end, updated_at = now()
     where job_key = $1 returning *`,
    [jobKey, ok ? 'done' : 'failed', instanceId, error]
  )
  return rows[0] ?? null
}

/**
 * An administrator's approval of one generation of one pool.
 *
 * 🔒 THE APPROVAL NAMES WHAT WAS SEEN (§3). `expectedHashes` is what the screen was looking at when
 * the press happened; an approve posted from a stale screen can therefore be compared and refused
 * by whoever reads it, rather than being applied blind to whatever the instance says now.
 *
 * A second approve of the same (pool, generation) does not overwrite the first — the original
 * approver and the hashes they saw are the record.
 * @param {{ query: Function }} pool
 * @returns {Promise<{ ok: true, row: any } | { ok: false, code: 'ALREADY_APPROVED', row: any }>}
 */
export async function approveGeneration(pool, { poolKey, generation, expectedHashes, approvedBy }) {
  const { rows } = await pool.query(
    `insert into inventory_generation_approval (pool_key, generation, expected_hashes, approved_by)
     values ($1, $2, $3::jsonb, $4)
     on conflict (pool_key, generation) do nothing
     returning *`,
    [poolKey, generation, JSON.stringify(expectedHashes ?? {}), approvedBy]
  )
  if (rows[0]) return { ok: true, row: rows[0] }
  return { ok: false, code: 'ALREADY_APPROVED', row: await approvalOf(pool, poolKey, generation) }
}

/** @param {{ query: Function }} pool */
export async function approvalOf(pool, poolKey, generation) {
  const { rows } = await pool.query(
    'select * from inventory_generation_approval where pool_key = $1 and generation = $2',
    [poolKey, generation]
  )
  return rows[0] ?? null
}

/**
 * The refill timer's own row (`027-inventory-sweep.sql`): its period, and what its last run did.
 *
 * The bounds are the table's CHECK, repeated here so a bad value is refused with a sentence rather
 * than a constraint name, and exported so the screen offers the same range it will be held to.
 */
export const SWEEP_PERIOD_MS = { min: 10_000, max: 3_600_000, default: 30_000 }

/** @param {any} row - an `inventory_sweep` row, or undefined when none was ever written. */
const sweepView = (row) => ({
  periodMs: row?.period_ms ?? SWEEP_PERIOD_MS.default,
  lastStartedAt: row?.last_started_at ?? null,
  lastFinishedAt: row?.last_finished_at ?? null,
  lastError: row?.last_error ?? null,
  lastOutcome: row?.last_outcome ?? null,
  revision: row?.revision ?? 0,
  updatedBy: row?.updated_by ?? null,
  updatedAt: row?.updated_at ?? null
})

/**
 * The timer's row as the screen and the timer read it. A missing row is the default period and
 * "never ran", revision 0 — a fresh deployment behaves exactly as it did before the table existed.
 * @param {{ query: Function }} pool
 */
export async function readSweep(pool) {
  const { rows } = await pool.query('select * from inventory_sweep where id')
  return sweepView(rows[0])
}

/**
 * Change how often the refill pass runs. Optimistic like `setPolicy`: `expectedRevision` is the
 * revision the person was looking at, and a second editor who saved first wins.
 *
 * Two statements rather than one upsert: the row may already exist at revision 0 because the timer
 * recorded a run before anybody edited the period, and "insert, or update where revision = N" has
 * to reach that row too.
 * @param {{ query: Function }} pool
 * @param {{ periodMs: unknown, expectedRevision: unknown, updatedBy?: string | null }} change
 */
export async function setSweepPeriod(pool, { periodMs, expectedRevision, updatedBy = null }) {
  if (!Number.isSafeInteger(periodMs) || periodMs < SWEEP_PERIOD_MS.min || periodMs > SWEEP_PERIOD_MS.max)
    return {
      ok: false,
      code: 'INVALID',
      detail: `period must be ${SWEEP_PERIOD_MS.min / 1000}–${SWEEP_PERIOD_MS.max / 1000} seconds`
    }
  if (!Number.isSafeInteger(expectedRevision))
    return { ok: false, code: 'INVALID', detail: 'expectedRevision is not a number' }
  await pool.query('insert into inventory_sweep (id) values (true) on conflict (id) do nothing')
  const { rows } = await pool.query(
    `update inventory_sweep set period_ms = $1, revision = revision + 1, updated_by = $3, updated_at = now()
      where id and revision = $2 returning *`,
    [periodMs, expectedRevision, updatedBy]
  )
  if (!rows[0])
    return { ok: false, code: 'REVISION_CONFLICT', detail: 'the period was changed by someone else' }
  return { ok: true, sweep: sweepView(rows[0]) }
}

/**
 * Stamp the start of a run. Written before the passes rather than with the result, so a pass that
 * hangs shows up as "started, never finished" instead of as a timer that looks idle.
 * @param {{ query: Function }} pool
 */
export async function recordSweepStart(pool) {
  await pool.query(
    `insert into inventory_sweep (id, last_started_at) values (true, now())
     on conflict (id) do update set last_started_at = now()`
  )
}

/**
 * Stamp the end of a run: `error` null for a clean one, its message otherwise, and the counts the
 * passes returned. Never touches the period or its revision — a run is not an edit.
 * @param {{ query: Function }} pool
 * @param {{ error?: string | null, outcome?: object | null }} result
 */
export async function recordSweepEnd(pool, { error = null, outcome = null } = {}) {
  await pool.query(
    `insert into inventory_sweep (id, last_finished_at, last_error, last_outcome) values (true, now(), $1, $2::jsonb)
     on conflict (id) do update
       set last_finished_at = now(), last_error = excluded.last_error, last_outcome = excluded.last_outcome`,
    [error, outcome === null ? null : JSON.stringify(outcome)]
  )
}
