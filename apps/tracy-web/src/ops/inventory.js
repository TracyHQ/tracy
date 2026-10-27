/**
 * `/api/ops/inventory` — the stock of CMS instances installed BEFORE a customer asks for one.
 *
 * What a person can do here, and nothing more: see every pool and what is in it, see one
 * instance's siteKey/preview/health/hashes/history, change the policy that decides how much stock
 * a pool keeps, pause and un-pause a pool with a reason, approve a generation when review hold is
 * on, and prepare one now by hand.
 *
 * 🔒 ELIGIBILITY IS READ FROM JOB EVIDENCE, NEVER FROM A LABEL (22/09: a quickstart with a
 * demo that installed successfully may be stocked, `Installed, not public` included). The list at
 * `/eligible` is `inventory/eligibility.js`, which reads provision jobs that reached `done` — not
 * the demo site row, because `upsertDemoSite` rewrites that row at the START of every attempt.
 * Measured on the local stand 22/09: `business-emdash` and `saas-emdash` carry a complete-looking
 * row while every one of their provision jobs is `failed`. A screen that trusted the row would
 * have offered both for stocking.
 *
 * 🔒 THIS DOOR NEVER TEARS DOWN A DEMO AND NEVER PUTS STOCK IN THE DEMO CATALOGUE. The two
 * lifecycles share the fleet and nothing else (§2 of the task): `lib/demo-sites.js` owns demos,
 * this owns stock, and neither reads the other's rows.
 *
 * Same door rules as the Demos and Quickstarts screens: staff read, owner/admin write, writes only
 * from this deployment's own origin.
 */
import { Hono } from 'hono'
import { canonical, generationOf, poolKeyOf } from '../lib/inventory-pool-key.js'
import { resolveInstall } from '../lib/quickstart-releases.js'
import { bornSiteAddress } from '../lib/site-address.js'
import { admit, denied } from './admit.js'

/** `patch` keys the door accepts, and the request spelling of each. A request naming anything else
 * is refused by `setPolicy` — this map exists so the wire stays camelCase while the store keeps
 * the column names. */
const POLICY_FIELDS = [
  'enabled',
  'lowWatermark',
  'targetReady',
  'maxStock',
  'maxConcurrentPrepares',
  'reviewHold',
  'maxAttempts',
  'healthTtlSeconds',
  'paused',
  'pausedReason'
]

export function inventoryRoutes({ pool, config, inventory, host = null, fetchImpl = fetch }) {
  const app = new Hono()

  // 🔒 THE STOCK MODULES ARE HANDED IN, NOT IMPORTED, and that is the module graph's rule rather
  // than a preference: `test/module-graph.test.mjs` refuses a domain directory that imports
  // another domain, and `inventory/` is a domain of its own (it is also reached from `cron.js`,
  // which is top-level and therefore allowed to import both). `app.js` is the composition root
  // that owns the wiring. An `ops` deployment that passes nothing simply has no stock screen.
  const {
    approvalOf,
    approveGeneration,
    eligibleQuickstarts,
    enqueueRefill,
    instanceById,
    jobKeysFor,
    listInstances,
    listPools,
    takenSlots,
    readPool,
    readSweep,
    recordDemoAttestations,
    setInstanceState,
    setPolicy,
    setSweepPeriod,
    supplyOf,
    upsertPool
  } = inventory

  const guard = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write) {
      if (!['owner', 'admin'].includes(who.role)) return { deny: c.body(null, 403) }
      // The PUBLIC origin, not the request's — behind the tunnel this app is handed plain http,
      // so reading `new URL(c.req.url).origin` refuses every real browser (the Demos screen has
      // the measurement).
      if (c.req.header('origin') !== config.origin) return { deny: c.body(null, 403) }
    }
    return { who }
  }

  /** A pool row plus what is actually in it — the shape both the list and one pool's page draw. */
  const viewOf = async (row) => ({
    poolKey: row.pool_key,
    environment: row.environment,
    host: row.host,
    platform: row.platform,
    quickstartTag: row.quickstart_tag,
    quickstartVersion: row.quickstart_version,
    generation: row.generation,
    policy: {
      enabled: row.enabled,
      lowWatermark: row.low_watermark,
      targetReady: row.target_ready,
      maxStock: row.max_stock,
      maxConcurrentPrepares: row.max_concurrent_prepares,
      reviewHold: row.review_hold,
      maxAttempts: row.max_attempts,
      healthTtlSeconds: row.health_ttl_seconds,
      paused: row.paused,
      pausedReason: row.paused_reason
    },
    revision: row.revision,
    supply: await supplyOf(pool, row.pool_key)
  })

  /** One instance, as a person needs to see it: the key they can open, the health that decided
   * `ready`, and the error that decided `quarantined`. Never a secret. */
  const instanceView = (row) => ({
    id: row.id,
    /**
     * Where a person can actually open it.
     *
     * 🔒 BUILT FROM THIS DEPLOYMENT'S OWN ORIGIN, never a hard-coded scheme or port: a stand
     * answers on `http://<label>.tracy.test:8080/` and production on `https://<label>.tracy.ai/`,
     * and `bornSiteAddress` is the one place that already knows the difference. Writing it by hand
     * here produced a link that opened nothing at all when this was last done elsewhere
     * (`config.js`'s own ⚠ on demo addresses records the measurement).
     */
    url: row.label ? bornSiteAddress(row.label, config) : null,
    poolKey: row.pool_key,
    siteKey: row.site_key,
    label: row.label,
    host: row.host,
    generation: row.generation,
    state: row.state,
    jobId: row.job_id,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    healthOk: row.health_ok,
    healthCheckedAt: row.health_checked_at,
    healthDetail: row.health_detail ?? null,
    hashes: row.hashes ?? {},
    // WHO it is being handed to is deliberately absent: an operator screen needs to know a slot is
    // taken, not which customer took it.
    reserved: row.reserved_account !== null,
    reservedAt: row.reserved_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })

  app.get('/api/ops/inventory', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const rows = await listPools(pool)
    return c.json({ pools: await Promise.all(rows.map(viewOf)), sweep: await readSweep(pool) })
  })

  /**
   * How often the refill timer runs. The timer reads this row before every tick (`cron.js`), so a
   * change here reaches every replica on its next tick — no restart, and nothing to deploy.
   */
  app.put('/api/ops/inventory/sweep', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const body = await c.req.json().catch(() => null)
    const done = await setSweepPeriod(pool, {
      periodMs: body?.periodMs,
      expectedRevision: body?.revision,
      updatedBy: g.who.email ?? null
    })
    if (!done.ok)
      return c.json({ code: done.code, detail: done.detail }, done.code === 'REVISION_CONFLICT' ? 409 : 400)
    return c.json({ sweep: done.sweep })
  })

  /**
   * Which quickstarts MAY be stocked, and for the ones that may not, why in one sentence.
   *
   * Recording runs first so the answer reflects demos that finished since the last look; it is an
   * insert-if-absent over job rows, so a second call in the same minute writes nothing.
   */
  app.get('/api/ops/inventory/eligible', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const { recorded } = await recordDemoAttestations(pool)
    const rows = await eligibleQuickstarts(pool, { resolveInstall })
    return c.json({ recorded, quickstarts: rows })
  })

  app.get('/api/ops/inventory/instances', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    const poolKey = c.req.query('pool')
    if (!poolKey) return c.json({ code: 'POOL_REQUIRED' }, 400)
    c.header('cache-control', 'no-store')
    const rows = await listInstances(pool, poolKey)
    return c.json({ instances: rows.map(instanceView) })
  })

  // An instance id is a uuid (`026-site-inventory.sql`). Checked here rather than let through:
  // Postgres answers a malformed uuid with 22P02, which reaches a caller as a 500 — an error that
  // reads like the server broke, for a request that was simply wrong.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  app.get('/api/ops/inventory/instance', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    const id = c.req.query('id')
    if (!UUID.test(id ?? '')) return c.json({ code: 'BAD_INSTANCE_ID' }, 400)
    const row = await instanceById(pool, id)
    if (!row) return c.json({ code: 'NOT_FOUND' }, 404)
    c.header('cache-control', 'no-store')
    return c.json({ instance: instanceView(row) })
  })

  /**
   * Make a pool for one eligible quickstart, so a policy can be written against it.
   *
   * 🔒 IT REFUSES A QUICKSTART WITH NO SUCCESSFUL DEMO, and says which of the two reasons it is.
   * Creating the pool anyway and letting the refill fail later would spend a real install to learn
   * something this door already knows.
   */
  app.post('/api/ops/inventory/pool', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const body = await c.req.json().catch(() => null)
    const tag = typeof body?.tag === 'string' ? body.tag : null
    if (!tag) return c.json({ code: 'TAG_REQUIRED' }, 400)
    const host = typeof body?.host === 'string' && body.host ? body.host : config.defaultHost
    if (!config.hosts.has(host)) return c.json({ code: 'UNKNOWN_HOST', host }, 400)

    await recordDemoAttestations(pool)
    const eligible = (await eligibleQuickstarts(pool, { resolveInstall })).find((r) => r.tag === tag)
    if (!eligible || !eligible.eligible)
      return c.json(
        {
          code: 'NOT_ELIGIBLE',
          tag,
          reason: eligible?.reason ?? 'no demo of this quickstart',
          drift: eligible?.drift ?? null
        },
        409
      )

    const install = await resolveInstall(pool, tag)
    if (!install) return c.json({ code: 'RELEASE_UNRESOLVABLE', tag }, 409)
    const generation = generationOf({ install })
    const poolKey = poolKeyOf({
      environment: config.environment,
      host,
      platform: install.platform,
      quickstartTag: tag,
      quickstartVersion: install.version,
      generation
    })
    const row = await upsertPool(pool, {
      poolKey,
      environment: config.environment,
      host,
      platform: install.platform,
      quickstartTag: tag,
      quickstartVersion: install.version,
      generation,
      updatedBy: g.who.email ?? null
    })
    return c.json({ pool: await viewOf(row) }, 201)
  })

  /** Change the policy under an optimistic lock — same shape as Build base and the pinned demo
   * address, so two admin tabs disagree the way they already do everywhere else. */
  app.put('/api/ops/inventory/policy', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const body = await c.req.json().catch(() => null)
    const poolKey = typeof body?.poolKey === 'string' ? body.poolKey : null
    if (!poolKey) return c.json({ code: 'POOL_REQUIRED' }, 400)
    const patch = {}
    for (const field of POLICY_FIELDS) if (body?.[field] !== undefined) patch[field] = body[field]
    const done = await setPolicy(pool, poolKey, patch, {
      expectedRevision: body?.revision,
      updatedBy: g.who.email ?? null
    })
    if (!done.ok)
      return c.json({ code: done.code, detail: done.detail }, done.code === 'REVISION_CONFLICT' ? 409 : 400)
    return c.json({ pool: await viewOf(done.row) })
  })

  /**
   * Prepare one now, by hand.
   *
   * It writes an INTENT, it does not install: the same outbox the reconciler drains, so a press
   * here and a tick of the timer cannot produce two installs for one slot. The press answers as
   * soon as the row is down — §4 rule 4 keeps the host call outside any lock, and outside this
   * request too.
   */
  app.post('/api/ops/inventory/prepare', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const body = await c.req.json().catch(() => null)
    const poolKey = typeof body?.poolKey === 'string' ? body.poolKey : null
    if (!poolKey) return c.json({ code: 'POOL_REQUIRED' }, 400)
    const row = await readPool(pool, poolKey)
    if (!row) return c.json({ code: 'NOT_FOUND' }, 404)
    if (row.paused) return c.json({ code: 'POOL_PAUSED', reason: row.paused_reason }, 409)
    /**
     * How many slots this press asks for. One by default, so every existing caller is unchanged.
     *
     * 🔒 CAPPED BY THE POOL, NOT BY THE CALLER. A press for ten against a pool with room for two
     * gets two and is TOLD so (`capped: true`) — refusing outright would make the button useless
     * at the ceiling, and honouring ten would start eight installs the policy forbids.
     */
    const asked = Number.isInteger(body?.count) ? body.count : 1
    if (asked < 1 || asked > 50) return c.json({ code: 'BAD_COUNT' }, 400)
    const supply = await supplyOf(pool, poolKey)
    if (supply.stock >= row.max_stock)
      return c.json({ code: 'AT_MAX_STOCK', stock: supply.stock, maxStock: row.max_stock }, 409)
    const room = row.max_stock - supply.stock
    const want = Math.min(asked, room)
    // 🔒 A FREE SLOT IS ONE THE OUTBOX HAS NEVER ISSUED — not one no instance occupies, and not
    // one no intent is currently running. `takenSlots` carries the whole argument; both wrong
    // answers were measured on this very door.
    const taken = await takenSlots(pool, poolKey)
    const { inserted } = await enqueueRefill(pool, { poolKey, jobKeys: jobKeysFor(poolKey, want, taken) })
    // `enqueued: 0` cannot happen now that the slot is drawn from the outbox — if it ever does, it
    // is a lost race with the reconciler and the caller is told the truth rather than a bare 202.
    return c.json({ enqueued: inserted, capped: want < asked }, inserted > 0 ? 202 : 409)
  })

  /**
   * Approve a generation, so later refills of the same generation reach `ready` on the machine
   * check alone (§3). Only meaningful while the pool's review hold is on.
   *
   * 🔒 THE APPROVAL NAMES WHAT THE PERSON WAS LOOKING AT. `expectedHashes` is the instance's read
   * hashes as the screen showed them; an approve posted from a stale tab is refused rather than
   * applied to a generation nobody inspected.
   */
  app.post('/api/ops/inventory/approve', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const body = await c.req.json().catch(() => null)
    if (!UUID.test(body?.instanceId ?? '')) return c.json({ code: 'BAD_INSTANCE_ID' }, 400)
    const instance = await instanceById(pool, body?.instanceId)
    if (!instance) return c.json({ code: 'NOT_FOUND' }, 404)
    if (instance.state !== 'awaiting_review')
      return c.json({ code: 'NOT_AWAITING_REVIEW', state: instance.state }, 409)
    // 🔒 COMPARED CANONICALLY, NOT BY `JSON.stringify`. JSON promises nothing about key order, so
    // a client that built the same hashes in another order would be told HASH_MISMATCH for facts
    // that match. `canonical` is the same sort the generation hash is built with.
    const seen = canonical(body?.expectedHashes ?? null)
    if (seen !== canonical(instance.hashes ?? {}))
      return c.json({ code: 'HASH_MISMATCH', hashes: instance.hashes ?? {} }, 409)
    const done = await approveGeneration(pool, {
      poolKey: instance.pool_key,
      generation: instance.generation,
      expectedHashes: instance.hashes ?? {},
      approvedBy: g.who.email ?? 'ops'
    })
    // 🔒 AN ALREADY-APPROVED GENERATION STILL RELEASES THIS INSTANCE, and that is the point of
    // approving a GENERATION rather than a row (§3): the first approval is the decision, every
    // later instance of the same generation rides on it. What must not happen is what happened
    // before this comment: the store answering `ok: false` while the door reported
    // `approved: false` with HTTP 200 and moved the instance anyway — three signals disagreeing on
    // one screen. So the move is stated as its own fact, and the approval says whose it is.
    const released = await setInstanceState(pool, instance.id, { state: 'ready' })
    return c.json({
      released: released?.state === 'ready',
      alreadyApproved: done.ok === false && done.code === 'ALREADY_APPROVED',
      generation: instance.generation,
      approval: done.row ?? null
    })
  })

  app.get('/api/ops/inventory/approval', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    const row = await approvalOf(pool, c.req.query('pool'), c.req.query('generation'))
    return c.json({ approval: row ?? null })
  })

  /**
   * Refuse one instance: it stops being supply and keeps its row as history.
   *
   * `quarantine` is for one that failed a check; `drain` is for one that is simply the wrong
   * generation now. Neither may touch an instance a customer already holds — §5 is explicit that
   * there is no cron road that tears down an assigned site, and this is the manual half of the
   * same rule.
   */
  app.post('/api/ops/inventory/retire', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const body = await c.req.json().catch(() => null)
    const to = ['quarantined', 'draining', 'retired'].includes(body?.to) ? body.to : null
    if (!to) return c.json({ code: 'BAD_TARGET', detail: 'to must be quarantined, draining or retired' }, 400)
    if (!UUID.test(body?.instanceId ?? '')) return c.json({ code: 'BAD_INSTANCE_ID' }, 400)
    const instance = await instanceById(pool, body?.instanceId)
    if (!instance) return c.json({ code: 'NOT_FOUND' }, 404)
    if (['reserved', 'assigning', 'assigned'].includes(instance.state))
      return c.json({ code: 'HAS_OWNER', state: instance.state }, 409)

    /**
     * 🔒 `retired` IS THE ONLY ONE THAT FREES ANYTHING, and until now nothing did. `quarantined`
     * and `draining` move a row out of the pool and leave the site standing — which is correct for
     * a post-mortem and wrong for disk: the pool refills beside it, so every press made the disk
     * grow (measured on the stand: ~362 MB per site, 12 GB across one machine's sites).
     *
     * ⚠ THE ROW IS NOT MARKED GONE HERE. Teardown is a job on the host; claiming `retired` before
     * it finishes would leave a pool refilling beside a site nobody will ever clean up. The row
     * waits in `draining` carrying the job that will finish it, exactly as `preparing` waits for
     * its own — and a host that refuses leaves the row completely untouched.
     */
    if (to === 'retired') {
      if (!host?.hostCall) return c.json({ code: 'HOST_NOT_CONFIGURED' }, 503)
      const answer = await host.hostCall(
        config,
        instance.host ?? config.defaultHost,
        '/teardown',
        { label: instance.label },
        { fetchImpl }
      )
      if (!answer.ok)
        // 🔒 TWO FAILURES THAT LOOK THE SAME AND ARE NOT. `status: 0` is `hostCall` never getting
        // an answer — the host is down, or this process cannot resolve its address — while any
        // other status is the host saying no. The first is somebody's machine to go and look at;
        // the second is about this instance. Collapsing them into one code sent a reader looking
        // at the wrong thing (measured 22/09: a bare "TEARDOWN_REFUSED" with no detail at all).
        return c.json(
          {
            code: answer.status === 0 ? 'HOST_UNREACHABLE' : 'TEARDOWN_REFUSED',
            host: instance.host ?? config.defaultHost,
            status: answer.status,
            detail: answer.body?.code ?? answer.body?.why ?? null
          },
          502
        )
      const torn = await setInstanceState(pool, instance.id, {
        state: 'draining',
        jobId: answer.body?.jobId ?? null,
        lastError: typeof body?.reason === 'string' ? body.reason : null
      })
      return c.json({ instance: instanceView(torn) })
    }

    const row = await setInstanceState(pool, instance.id, {
      state: to,
      lastError: typeof body?.reason === 'string' ? body.reason : null
    })
    return c.json({ instance: instanceView(row) })
  })

  return app
}
