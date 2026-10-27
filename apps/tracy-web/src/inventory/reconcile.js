/**
 * Keeping the pools full: the periodic pass that decides what is MISSING, and the worker that
 * makes it.
 *
 * Two functions rather than one, because they need opposite things from a lock. Deciding is a
 * handful of counting queries and a row of intents — milliseconds, and it must be exclusive or two
 * replicas both write the same deficit. Making is a provision: minutes, on the network, and it must
 * NOT be exclusive or one slow install stops every other writer of these tables.
 *
 * 🔒 ITS OWN ADVISORY LOCK, NOT `cron.js`'s. `cron.js` runs every one of its jobs under 7_243_002
 * on the stated grounds that they never need to run at once — true of an hourly sweep and a daily
 * one, false the moment a refill joins them. A refill pass that reached the network under that lock
 * would hold it for the length of an install, and every replica's seat-sync drain and provision
 * sweep would skip their ticks for the duration: the OTP sweep, the abandoned-build sweep and the
 * seat outbox would all stop because a pool was being topped up. Hence 7_243_003, and hence the
 * host call below sitting outside every lock this file takes.
 *
 * ⚠ WHAT MUST BE PASSED IN. `host` and `sites` (and `doors`, for verification) have no defaults:
 * `sites/store.js` is another domain and `test/module-graph.test.mjs` forbids this directory from
 * importing it, so the composition root hands them down exactly as it already hands `seats`/`host`
 * to `sitesRoutes`. `store`, `policy`, `prepare` and `intents` do have lazy defaults, for the other
 * reason: `inventory/store.js` and `inventory/policy.js` are written by a parallel branch and a
 * lazy default lets this file and its tests exist before they do. Seams for wiring and tests, never
 * a runtime strategy switch.
 */
import { failureReason } from '../lib/demo-sites.js'
import { readReleases, releasesToken, resolveInstall } from '../lib/quickstart-releases.js'

/**
 * 🔒 A NEW ID, AND THE NUMBER MATTERS. Postgres advisory locks are a flat namespace of integers
 * with no registry; the only thing that keeps two unrelated jobs from excluding each other is that
 * somebody wrote the id down. 7_243_001 is the migration lock (`db/index.js`), 7_243_002 is
 * `cron.js`'s sweeps, and this is the third.
 */
export const LOCK_ID = 7_243_003

/** How often the reconciler runs. §4 asks for boot plus roughly thirty seconds, configurable —
 * `cron.js` may pass its own, and a test passes none because it calls the functions directly. */
export const RECONCILE_MS = 30_000

/** How many due intents one pass claims. A bound, not a target: the pass runs again in 30s. */
const DEFAULT_LIMIT = 10

/**
 * How long a claimed intent may stay `running` before another pass may take it back.
 *
 * 🔒 WITHOUT THIS, A REPLICA THAT DIED MID-PROVISION STRANDS ITS INTENT FOREVER. `running` is not a
 * state anything else clears: the process that set it is the only one that would have settled it,
 * and if it is gone the row sits there being counted as work-in-progress that will never finish,
 * which also means the pool's deficit never reappears and the stock never comes back. The claim
 * therefore pushes `next_at` out by a lease, and a pass takes back any `running` row whose lease
 * has expired. Ten minutes is longer than a provision (≈1–3 min measured on the stand) by enough
 * that a healthy worker is never raced, and short enough that a dead one costs one tick's patience.
 */
const DEFAULT_LEASE_MS = 10 * 60 * 1000

/** Backoff: 30s, doubling, capped at fifteen minutes, ±25% jitter. Finite by `max_attempts`. */
const BACKOFF_BASE_MS = 30_000
const BACKOFF_CAP_MS = 15 * 60 * 1000

let inventoryStore = null
async function defaultStore() {
  inventoryStore ??= await import('./store.js')
  return inventoryStore
}
let inventoryPolicy = null
async function defaultPolicy() {
  inventoryPolicy ??= await import('./policy.js')
  return inventoryPolicy
}
let preparer = null
async function defaultPrepare() {
  preparer ??= await import('./prepare.js')
  return preparer
}

/**
 * Run `fn(client)` holding `LOCK_ID` on its own connection. Copied in shape from `cron.js`'s
 * `withLock` — advisory locks are session-scoped, so it must be one dedicated client and never a
 * `pool.query`, which may hand out a different connection per call. `pg_try_advisory_lock`, not
 * `pg_advisory_lock`: the replica that loses skips this tick rather than queueing behind one that
 * is already running it.
 * @returns {Promise<boolean>} whether `fn` actually ran.
 */
export async function withInventoryLock(pool, fn) {
  const client = await pool.connect()
  try {
    const { rows } = await client.query('select pg_try_advisory_lock($1) as got', [LOCK_ID])
    if (!rows[0].got) return false
    try {
      await fn(client)
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {})
    }
    return true
  } finally {
    client.release()
  }
}

/**
 * The intent outbox's own two writes.
 *
 * ⚠ THEY ARE HERE AND NOT IN `store.js` BECAUSE OF WHAT THEY NEED TO KNOW. The store's
 * `settleRefill(pool, jobKey, {ok, instanceId, error})` carries no attempt policy, and backoff,
 * jitter and "out of attempts" are all read off the POOL's `max_attempts` — a fact this pass has in
 * hand and the store's signature does not take. They are exported as an injectable `intents` dep so
 * that if the store later grows the same two operations, `cron.js` can pass them and this default
 * goes away rather than becoming a second implementation.
 */
export const intents = {
  /**
   * Claim up to `limit` due intents in one statement.
   *
   * `for update skip locked` in the subselect: two replicas reaching this line in the same
   * millisecond take DIFFERENT rows instead of one of them blocking on the other's lock and then
   * finding the row already claimed. The predicate takes `pending` rows that are due AND `running`
   * rows whose lease has expired — the second half is the recovery of §4, and without it a replica
   * that died mid-provision strands its intent for good.
   *
   * 🔒 A PAUSED POOL'S INTENTS ARE NEVER CLAIMED, AND THE CHECK BELONGS HERE RATHER THAN IN THE
   * CALLER. `reconcilePools` refuses to ENQUEUE for a paused pool, and that was read as enough —
   * it is not: an intent written a moment before the pause is still in the outbox, and the next
   * drain installed it. Measured 22/09 on the local stand: a pool paused with a reason, one
   * pending intent, and the very next drain started a real CMS install. An operator who pauses a
   * pool that is running away watches it keep installing, which is the one thing the button is for.
   *
   * Checking it in the CALLER instead — claim, then notice, then put back — was written first and
   * is wrong in two ways this join avoids: the claim has already spent an `attempts`, and it has
   * already pushed `next_at` out by a full lease, so lifting the pause leaves the intent waiting
   * ten more minutes for work that never ran. A row that is never touched needs nothing undone.
   */
  async claimDue(client, { limit = DEFAULT_LIMIT, leaseMs = DEFAULT_LEASE_MS } = {}) {
    const { rows } = await client.query(
      `update inventory_refill_intent set
         state = 'running',
         attempts = attempts + 1,
         next_at = now() + make_interval(secs => $2::float),
         updated_at = now()
       where job_key in (
         select i.job_key from inventory_refill_intent i
            join inventory_pool p on p.pool_key = i.pool_key
          where i.state in ('pending', 'running') and i.next_at <= now()
            and p.paused = false and p.enabled = true
          order by i.next_at
          limit $1
          for update of i skip locked
       )
       returning *`,
      [limit, leaseMs / 1000]
    )
    return rows
  },

  /**
   * Write down how one attempt ended. Success is terminal. A failure that still has attempts left
   * goes back to `pending` with a jittered backoff; one that does not is `failed`, and its instance
   * — if it got as far as having one — is quarantined with the same sentence, because an instance
   * nobody will retry must not keep being counted as supply on its way to `ready`.
   */
  async settle(
    pool,
    row,
    { ok, instanceId = null, error = null, maxAttempts = 3, random = Math.random, store }
  ) {
    if (ok) {
      await pool.query(
        `update inventory_refill_intent set state = 'done', instance_id = coalesce($2, instance_id),
           last_error = null, updated_at = now() where job_key = $1`,
        [row.job_key, instanceId]
      )
      return { state: 'done' }
    }
    const exhausted = row.attempts >= maxAttempts
    if (exhausted) {
      await pool.query(
        `update inventory_refill_intent set state = 'failed', last_error = $2,
           instance_id = coalesce($3, instance_id), updated_at = now() where job_key = $1`,
        [row.job_key, error, instanceId]
      )
      const stuck = instanceId ?? row.instance_id
      if (stuck && store)
        await store.setInstanceState(pool, stuck, { state: 'quarantined', lastError: error })
      return { state: 'failed' }
    }
    // 30s · 2^(attempts-1), capped, then ±25%: the jitter is what keeps N replicas that all failed
    // on the same dead host from coming back in the same millisecond and failing together again.
    const flat = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, row.attempts - 1))
    const delay = Math.min(BACKOFF_CAP_MS, Math.round(flat * (0.75 + random() * 0.5)))
    await pool.query(
      `update inventory_refill_intent set state = 'pending', last_error = $2,
         instance_id = coalesce($3, instance_id),
         next_at = now() + make_interval(secs => $4::float), updated_at = now()
       where job_key = $1`,
      [row.job_key, error, instanceId, delay / 1000]
    )
    return { state: 'pending', delay }
  }
}

/**
 * Which job keys this pool already has outstanding — what `jobKeysFor` must not hand out again.
 *
 * Read rather than assumed, even though `job_key` is the primary key and a duplicate insert is a
 * no-op: without it, a pool whose slots 0 and 1 are already in flight would be handed 0 and 1 again
 * and `enqueueRefill` would report `inserted: 0` for a deficit that is real.
 */
async function inFlightSlots(client, poolKey) {
  const { rows } = await client.query(
    `select job_key from inventory_refill_intent
      where pool_key = $1 and state in ('pending', 'running')`,
    [poolKey]
  )
  return rows.map((r) => r.job_key)
}

/**
 * Every job key this pool has ever been given, settled ones included.
 *
 * 🔒 THESE ARE TWO DIFFERENT QUESTIONS AND THEY MUST NOT SHARE AN ANSWER. "How much work is under
 * way" is the in-flight list, and the deficit is net of it. "Which names are already spent" is
 * THIS list — `job_key` is a primary key and a settled row is kept as history, so a name that has
 * ever been used can never be issued again. Using the in-flight list for both meant that as soon
 * as the first refill settled, slot 1 looked free, was issued again, and `on conflict do nothing`
 * swallowed the insert — the pool then stopped refilling for ever, reporting `enqueued: 0` against
 * a real deficit. Measured on the Ops prepare door, which had the same fault for the same reason.
 */
async function spentSlots(client, poolKey) {
  const { rows } = await client.query('select job_key from inventory_refill_intent where pool_key = $1', [
    poolKey
  ])
  return rows.map((r) => r.job_key)
}

/**
 * One pass over every pool: count what is there, ask the policy what is missing, write that many
 * intents. Writes ONLY intents — no network call is made from here at all, which is what lets the
 * whole pass sit under one short lock.
 *
 * @returns {Promise<{ran: boolean, enqueued: number, pools: Array<object>}>} `ran: false` means
 *   another replica held the lock and this tick did nothing, which is not a failure.
 */
export async function reconcilePools(pool, config, deps = {}) {
  const store = deps.store ?? (await defaultStore())
  const policy = deps.policy ?? (await defaultPolicy())
  const log = deps.log ?? console
  const pools = []
  let enqueued = 0
  const ran = await withInventoryLock(pool, async (client) => {
    for (const row of await store.listPools(client)) {
      const supply = await store.supplyOf(client, row.pool_key)
      const { deficit, reason, bottleneck } = policy.deficitOf({
        supply,
        policy: {
          enabled: row.enabled,
          paused: row.paused,
          lowWatermark: row.low_watermark,
          targetReady: row.target_ready,
          maxStock: row.max_stock,
          maxConcurrentPrepares: row.max_concurrent_prepares
        }
      })
      let inserted = 0
      // 🔒 AN OUTSTANDING INTENT IS WORK IN FLIGHT, AND THE DEFICIT MUST BE NET OF IT. `supplyOf`
      // counts INSTANCES, and an intent that has not yet reached `prepareInstance` has none — so a
      // second pass arriving before the first refill started would read exactly the same supply,
      // compute exactly the same deficit, and (finding slots 0..n-1 taken) allocate n FRESH slots
      // beside them. Measured by `inventory-reconcile.test.mjs`: an event plus two passes produced
      // seven intents for a deficit of three. The primary key cannot catch this, because these are
      // genuinely different keys — the dedupe it gives is against the same slot being enqueued
      // twice, not against the same shortfall being counted twice.
      const inFlight = await inFlightSlots(client, row.pool_key)
      const wanted = Math.max(0, deficit - inFlight.length)
      if (wanted > 0) {
        // Named against every slot ever spent, not just the ones in flight — see `spentSlots`.
        const jobKeys = policy.jobKeysFor(row.pool_key, wanted, await spentSlots(client, row.pool_key))
        // 🔒 THE PRIMARY KEY IS THE DEDUPE, AND THAT IS WHY THE READ ABOVE NEED NOT BE ATOMIC WITH
        // THIS WRITE. Two replicas that both read `taken: []` compute the SAME slot names and both
        // insert them; `on conflict do nothing` means exactly `deficit` rows exist afterwards, not
        // twice that. An intent keyed on anything unique-per-caller would have enqueued the same
        // work once per replica (`026-site-inventory.sql` says the same from the schema's side).
        inserted = (await store.enqueueRefill(client, { poolKey: row.pool_key, jobKeys })).inserted
        enqueued += inserted
      }
      pools.push({
        poolKey: row.pool_key,
        supply,
        deficit,
        // How many of the deficit are already an intent nobody has started yet — the number that
        // makes `deficit: 3, enqueued: 0` readable instead of looking like a stuck pool.
        outstanding: inFlight.length,
        bottleneck,
        reason,
        enqueued: inserted
      })
    }
  })
  if (!ran) return { ran: false, enqueued: 0, pools: [] }
  const blocked = pools.filter((p) => p.bottleneck && p.bottleneck !== 'at-target')
  if (blocked.length > 0)
    log.info?.(
      `[inventory] not refilling: ${blocked.map((p) => `${p.poolKey} (${p.bottleneck})`).join(', ')}`
    )
  return { ran: true, enqueued, pools }
}

/**
 * Drain the intent outbox: claim what is due under the lock, RELEASE IT, and only then provision.
 *
 * 🔒 THE ORDER IS THE POINT. The claim is one statement inside `withInventoryLock`; the host call
 * happens after `withInventoryLock` has returned and the lock is gone. §4 rule 4 asks for exactly
 * this — write the uniquely-keyed intent first, release the lock, and only then provision — and the
 * lease on the claimed row is what makes it safe: the work is already marked as taken, so nothing
 * else picks it up while this pass is on the network with no lock in hand.
 *
 * @returns {Promise<{ran: boolean, started: number, done: number, failed: number}>}
 */
export async function runRefills(pool, config, deps = {}) {
  const store = deps.store ?? (await defaultStore())
  const prepare = deps.prepare ?? (await defaultPrepare())
  const outbox = deps.intents ?? intents
  const log = deps.log ?? console
  const host = deps.host
  const fetchImpl = deps.fetchImpl ?? fetch
  const random = deps.random ?? Math.random
  const releases = deps.releases ?? {
    releases: () => readReleases(pool),
    install: (tag) => resolveInstall(pool, tag),
    token: async () => (await releasesToken(config, fetchImpl)).token
  }

  let claimed = []
  const ran = await withInventoryLock(pool, async (client) => {
    claimed = await outbox.claimDue(client, {
      limit: deps.limit ?? DEFAULT_LIMIT,
      leaseMs: deps.leaseMs ?? DEFAULT_LEASE_MS
    })
  })
  if (!ran) return { ran: false, started: 0, done: 0, failed: 0 }

  // ── No lock is held from here down. Everything below touches the network. ─────────────────────
  let done = 0
  let failed = 0
  for (const row of claimed) {
    const poolRow = await store.readPool(pool, row.pool_key)
    const maxAttempts = poolRow?.max_attempts ?? 3

    let outcome
    try {
      if (!poolRow) {
        outcome = { ok: false, code: 'UNKNOWN_POOL' }
      } else {
        const all = await releases.releases()
        const release = all.find((r) => r.tag === poolRow.quickstart_tag) ?? {
          tag: poolRow.quickstart_tag,
          platform: poolRow.platform
        }
        const install = await releases.install(poolRow.quickstart_tag)
        outcome = install
          ? await prepare.prepareInstance({
              pool,
              config,
              host,
              fetchImpl,
              poolKey: row.pool_key,
              install,
              release,
              releasesToken: await releases.token(),
              // A retry resumes the instance this intent already made, rather than leaving the
              // previous site row behind as debris nothing will ever reclaim.
              instanceId: row.instance_id ?? null,
              // No default: see the header. A missing `sites` is refused by name inside prepare.
              sites: deps.sites,
              ...deps.prepareOpts
            })
          : { ok: false, code: 'UNKNOWN_QUICKSTART', detail: poolRow.quickstart_tag }
      }
    } catch (error) {
      outcome = { ok: false, code: 'PREPARE_THREW', detail: String(error?.message ?? error) }
    }
    const error = outcome.ok
      ? null
      : `${outcome.code}${outcome.detail ? `: ${JSON.stringify(outcome.detail).slice(0, 200)}` : ''}`
    await outbox.settle(pool, row, {
      ok: outcome.ok === true,
      instanceId: outcome.instanceId ?? null,
      error,
      maxAttempts,
      random,
      store
    })
    if (outcome.ok) done++
    else {
      failed++
      log.warn?.(`[inventory] refill ${row.job_key} failed: ${error}`)
    }
  }
  return { ran: true, started: claimed.length, done, failed }
}

/** How long an instance may sit on `preparing` with nobody polling before this sweep asks the host
 * itself. A minute, the same wait `settleProvisions` uses for a customer's build, and for the same
 * reason: a watched job is settled by its watcher and this picks up the ones nobody is watching —
 * which, for stock, is EVERY one of them. Nobody is ever watching a pool. */
const PREPARING_STALE_MS = 60_000

/**
 * Carry every instance the host has finished up the rest of the ladder:
 * `preparing → verifying → ready`, or `awaiting_review` when the pool holds reviews, or
 * `quarantined` when it failed and has no attempts left.
 *
 * 🔒 WITHOUT THIS THE POOL NEVER REACHES `ready`, AND NOTHING SAYS SO. `runRefills` ends the moment
 * the host has accepted the job — the install itself takes a minute or more — so an instance stops
 * at `preparing` and stays there. `supplyOf` then counts it under `preparing` for ever: the deficit
 * reads as satisfied, no more refills are enqueued, and no instance is ever handed to a customer.
 * The pool looks busy rather than broken, which is the worst of the two. Measured 22/09 on the
 * local stand: a real Joomla install reached `done` on the host with `port: 52057`, its containers
 * up and the site answering 200, while the instance row still read `preparing`.
 *
 * 🔒 HEALTH IS TAKEN ON THE INSTANCE, NOT INFERRED FROM THE JOB. A job that ended `done` says the
 * script exited 0 and reported a port; it says nothing about whether the CMS answers now. §3 is
 * explicit that `ready` means the instance is valid, so `verifyInstance` reads the site itself and
 * a health check that fails leaves the instance short of `ready` however green its job was.
 *
 * @returns {Promise<{ran: boolean, advanced: number, ready: number, failed: number}>}
 */
/**
 * Finish the teardowns somebody started from `/ops`.
 *
 * `POST /retire {to:'retired'}` asks the host to tear a stock site down and leaves the row in
 * `draining` carrying the job id. This is the half that notices when that job is done — without
 * it the row sat in `draining` for ever, and the screen looked exactly like a button that did
 * nothing even though the site had already been removed (measured 22/09).
 *
 * 🔒 ONLY A DRAIN THAT CARRIES A JOB. `retire {to:'draining'}` is the label-only press — a
 * decision that this generation is no longer wanted, with nothing torn down. Retiring those here
 * would mark sites gone that are still standing, which is the debris this whole press exists to
 * remove.
 *
 * ⚠ A FAILED TEARDOWN IS NOT A FINISHED ONE. The row stays in `draining` with the reason on it:
 * `retired` means the resources are back, and claiming it while a volume is still held would
 * leave a folder on the host nothing will ever reclaim. A host that does not answer changes
 * nothing at all — the next sweep asks again.
 *
 * @returns {Promise<{ran: boolean, retired: number, failed: number}>}
 */
export async function settleDrains(pool, config, deps = {}) {
  const host = deps.host
  const fetchImpl = deps.fetchImpl ?? fetch
  const store = deps.store ?? (await defaultStore())
  // No host channel means nothing to poll — a deployment with no fleet has no teardowns in flight.
  if (!host?.hostJob) return { ran: false, retired: 0, failed: 0 }

  const { rows } = await pool.query(
    `select id, host, job_id from inventory_instance
      where state = 'draining' and job_id is not null
      order by updated_at
      limit 20`
  )
  if (rows.length === 0) return { ran: false, retired: 0, failed: 0 }

  let retired = 0
  let failed = 0
  for (const row of rows) {
    // Outside any lock: this is a network call, and §4 rule 4 keeps those out of held locks.
    const polled = await host.hostJob(config, row.host, row.job_id, { fetchImpl })
    if (!polled.ok) continue
    const state = polled.body?.state
    if (state === 'done') {
      await store.setInstanceState(pool, row.id, { state: 'retired', lastError: null })
      retired += 1
    } else if (state === 'failed') {
      failed += 1
      await store.setInstanceState(pool, row.id, {
        lastError: `teardown failed: ${polled.body?.detail ?? 'no detail'}`
      })
    }
  }
  return { ran: true, retired, failed }
}

export async function advanceInstances(pool, config, deps = {}) {
  const store = deps.store ?? (await defaultStore())
  const prepare = deps.prepare ?? (await defaultPrepare())
  const log = deps.log ?? console
  const host = deps.host
  const fetchImpl = deps.fetchImpl ?? fetch
  const staleMs = deps.staleMs ?? PREPARING_STALE_MS
  // 🔒 CHECKED AT THE DOOR, NOT AT THE LINE THAT USES IT. A missing dependency found half way
  // through the loop takes down the whole sweep after it has already moved some rows, and the
  // stack says `setPort is not a function` rather than which caller forgot to wire what.
  for (const name of ['siteByKey', 'setPort', 'setAddress', 'bornSiteAddress'])
    if (typeof deps.sites?.[name] !== 'function')
      throw new TypeError(`inventory advance: deps.sites.${name} was not passed in (see cron.js)`)
  let advanced = 0
  let ready = 0
  let failed = 0

  // 🔒 THE LOCK IS HELD FOR THE PICK AND NOTHING ELSE. `runRefills` claims under the lock and
  // releases it before provisioning, for a reason this pass shares: polling twenty hosts and then
  // dialling twenty sites is minutes on the network, and `withInventoryLock` is exclusive across
  // replicas. Doing that work inside it would make every `reconcilePools` and `runRefills` on
  // every replica lose `pg_try_advisory_lock` and skip its tick for the whole time — so the pool
  // would stop enqueueing intents while this sweep hung on a socket, and say nothing, because
  // `ran: false` is an ordinary answer. The module header forbids exactly this.
  //
  // The claim IS the move to `verifying`: it takes the row out of the `preparing` selection, and
  // its fresh `updated_at` keeps it out of the `verifying` selection too until `staleMs` has
  // passed — a lease, so a replica that dies mid-poll has its rows picked up again rather than
  // leaving them stranded.
  let claimed = []
  const ran = await withInventoryLock(pool, async (client) => {
    const { rows } = await client.query(
      `update inventory_instance set state = 'verifying', updated_at = now()
        where id in (
          select i.id from inventory_instance i join inventory_pool p on p.pool_key = i.pool_key
           where i.state in ('preparing', 'verifying') and i.job_id is not null
             and i.updated_at < now() - make_interval(secs => $1)
           order by i.updated_at
           limit 20
           for update of i skip locked
        )
        returning *`,
      [Math.round(staleMs / 1000)]
    )
    // The policy columns the loop needs, read in the same pass rather than per row.
    const keys = [...new Set(rows.map((r) => r.pool_key))]
    const pools = keys.length
      ? (
          await client.query(
            'select pool_key, review_hold, max_attempts from inventory_pool where pool_key = any($1::text[])',
            [keys]
          )
        ).rows
      : []
    const policyOf = new Map(pools.map((p) => [p.pool_key, p]))
    claimed = rows.map((r) => ({
      ...r,
      review_hold: policyOf.get(r.pool_key)?.review_hold ?? false,
      max_attempts: policyOf.get(r.pool_key)?.max_attempts ?? 1
    }))
  })
  if (!ran) return { ran: false, advanced: 0, ready: 0, failed: 0 }

  // Everything below is OUTSIDE the lock.
  {
    for (const row of claimed) {
      // The host's own answer. A host that cannot be reached is not an answer ABOUT the build:
      // leave the row for the next tick rather than calling an instance failed because a machine
      // was restarting — the same rule `settleProvisions` follows for a customer's build.
      const polled = await host.hostJob(config, row.host, row.job_id, { fetchImpl })
      // 🔒 PUT IT BACK WHERE IT WAS. The claim above already moved this row to `verifying`; a row
      // whose build has not ended is still `preparing` as far as anything reading the ladder is
      // concerned, and leaving it on `verifying` would say a check is under way when none is.
      if (!polled.ok) {
        await store.setInstanceState(pool, row.id, { state: 'preparing' })
        continue
      }
      const state = polled.body?.state
      if (state !== 'done' && state !== 'failed') {
        await store.setInstanceState(pool, row.id, { state: 'preparing' })
        continue
      }
      advanced++

      if (state === 'failed') {
        // 🔒 A FAILED PREPARE IS NOT RETRIED HERE. The retry belongs to the outbox, which owns the
        // backoff and the attempt count; this only records the ending. An instance out of attempts
        // is quarantined, and one with attempts left waits for its intent to come round again.
        const spent = row.attempts >= row.max_attempts
        await store.setInstanceState(pool, row.id, {
          state: spent ? 'quarantined' : 'queued',
          healthOk: false,
          // The line the build died on (`failureReason`, the same reading the demo screens use),
          // after the step: "at step provision" alone hid a mail refusal for a whole day (#827).
          lastError: `the host refused the install at step "${polled.body?.step ?? '?'}"${
            failureReason(polled.body) ? `: ${failureReason(polled.body)}` : ''
          }`
        })
        failed++
        continue
      }

      // 🔒 THE PORT THE FLEET REPORTED IS WRITTEN HERE OR NOWHERE. A customer's build gets this
      // from the poll door and, when nobody polled, from `cron.js`'s `settleHandover`; stock has
      // neither — nobody is ever watching a pool. Measured 22/09 on the local stand: a real Joomla
      // instance finished with `port: 52057`, its containers up and the site answering 200, while
      // `site.port` and `site.address` were still null — which is a site no door can reach, and
      // the health probe below is the first thing that cannot reach it.
      //
      // `publish: 'draft'` is not a guess: stock has never been published, and §6 is explicit that
      // a seeded site does not go live on its own. The guard is the null address, so an instance
      // that has been through here once is never re-stamped.
      if (Number.isInteger(polled.body?.port)) {
        const site = await deps.sites.siteByKey(pool, row.site_key)
        if (site && !site.address) {
          await deps.sites.setPort(pool, row.site_key, polled.body.port)
          await deps.sites.setAddress(pool, row.site_key, {
            address: deps.sites.bornSiteAddress(site.label, config),
            publish: 'draft'
          })
        }
      }

      // Already `verifying` from the claim above — no second write to say so.
      const seen = await prepare.verifyInstance({
        pool,
        config,
        host,
        fetchImpl,
        instanceId: row.id,
        sites: deps.sites,
        doors: deps.doors
      })
      if (!seen.ok || seen.healthOk !== true) {
        // 🔒 A GAP THIS DEPLOYMENT CANNOT VERIFY IS NOT A FLAKY SITE, so it does not get the
        // retry ladder. `verifiable: false` means no door exists for this platform at all
        // (`COMPONENT_DOORS` has joomla and wordpress only); trying again on a timer spends
        // attempts on something no amount of waiting changes, and ends in a `quarantined` row
        // whose last error reads like the site was down. Quarantine it AT ONCE, with the reason
        // that is actually true, so Ops sees the gap rather than a phantom outage.
        const spent = seen.verifiable === false || row.attempts >= row.max_attempts
        await store.setInstanceState(pool, row.id, {
          state: spent ? 'quarantined' : 'queued',
          lastError: seen.detail ?? 'the instance did not pass its health check'
        })
        failed++
        continue
      }

      // 🔒 REVIEW HOLD IS A POOL'S CHOICE AND IT IS OFF BY DEFAULT (§3: a successful demo is the
      // eligibility, and a second mandatory human gate was not asked for). With the hold on, an
      // instance whose GENERATION an administrator already approved still goes straight to
      // `ready` — approving a generation is exactly the statement that its later copies need no
      // second look.
      const approved = row.review_hold ? await store.approvalOf(pool, row.pool_key, row.generation) : null
      const next = row.review_hold && !approved ? 'awaiting_review' : 'ready'
      await store.setInstanceState(pool, row.id, { state: next, hashes: seen.hashes, healthOk: true })
      if (next === 'ready') ready++
    }
  }
  if (failed > 0) log.warn?.(`[inventory] ${failed} instance(s) did not reach ready`)
  return { ran: true, advanced, ready, failed }
}
