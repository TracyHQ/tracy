/**
 * The life of a Website Opportunities demo site (tasks/todo-wo-demo-retention.md, 19/10/2026).
 *
 *   built     `demo_expires_at = now + demoTtlDays` (`demoReviewTtlDays` when QA left it needs-review),
 *             counted from when the build got its site (the submit), not from the site being ready:
 *             no build-done hook exists to start it later
 *   touched   the detail page, a hand-off or a QA round pushes the expiry out again from now
 *   frozen    the expiry passed: `demo_frozen_at`; one press (`reopenDemo`) gives it a new term
 *   deleted   frozen past `demoFreezeGraceDays`: the site's own teardown, then `demo_deleted_at` and
 *             `state = 'deleted'`. The
 *             brief, QA, screenshots and cost ledger stay — a build is a pure function of its revision
 *   caps      over `demoMaxPerAccount` / `demoMaxPerHost` / `demoDiskHighWaterPct` the coldest live
 *             demos are frozen (never deleted) until under the cap
 *
 * ⚠ FROZEN IS A MARK, NOT A STOPPED CONTAINER. tracy-host has no door that stops or starts one site's
 * stack, so a frozen demo keeps running and answering; what the mark changes is that its clock stops,
 * hand-off refuses it, and the delete counts from it.
 *
 * 🔒 ONE SWEEP AT A TIME ACROSS INSTANCES: `pg_try_advisory_lock(DEMO_RETENTION_LOCK_ID)` on one
 * connection for the whole run; another instance that finds it held skips its run.
 */

export const DEMO_RETENTION_LOCK_ID = 7_243_141
const DAY_MS = 86_400_000

/** Days a demo lives from a touch: the review term when QA handed it back as needs-review. */
function termDays(handoff, settings) {
  return handoff?.state === 'needs-review' ? settings.demoReviewTtlDays : settings.demoTtlDays
}

const expiryFrom = (now, handoff, settings) => new Date(now + termDays(handoff, settings) * DAY_MS)

/**
 * A build that just got its site starts its clock; a build whose clock already runs (or was stopped
 * for good) is left alone.
 */
export async function startDemoClock(pool, buildId, { now, settings }) {
  const { rows } = await pool.query('select handoff from wo_build where id = $1', [buildId])
  if (!rows[0]) return null
  // A customer's own site (Build from my business, `own-site.js`) is no demo: it never gets a clock, so the
  // sweep and the per-account ceiling, which act only on clocked builds, never reach it.
  const updated = await pool.query(
    `update wo_build set demo_expires_at = $2
      where id = $1 and site_key is not null and demo_expires_at is null
        and demo_touched_at is null and demo_deleted_at is null
        and not exists (select 1 from wo_demo_action a where a.account_id = wo_build.account_id
          and a.build_request_id = wo_build.request_id and a.selection->>'ownSite' = 'true')
      returning *`,
    [buildId, expiryFrom(now, rows[0].handoff, settings)]
  )
  return updated.rows[0] ?? null
}

/** Someone used the demo: a new term from now. A frozen, deleted or kept-for-good demo is not changed. */
export async function touchDemo(pool, buildId, { now, settings }) {
  const { rows } = await pool.query('select handoff from wo_build where id = $1', [buildId])
  if (!rows[0]) return null
  const updated = await pool.query(
    `update wo_build set demo_touched_at = $2, demo_expires_at = $3
      where id = $1 and demo_expires_at is not null and demo_frozen_at is null and demo_deleted_at is null
      returning *`,
    [buildId, new Date(now), expiryFrom(now, rows[0].handoff, settings)]
  )
  return updated.rows[0] ?? null
}

/** Freeze a live demo (its term ran out, or a cap chose it). Null when it was not live. */
export async function freezeDemo(pool, buildId, { now }) {
  const { rows } = await pool.query(
    `update wo_build set demo_frozen_at = $2
      where id = $1 and site_key is not null and demo_frozen_at is null and demo_deleted_at is null
      returning *`,
    [buildId, new Date(now)]
  )
  return rows[0] ?? null
}

/** One press on a frozen demo: thawed, touched, a new term. Null when it is not frozen (or is gone). */
export async function reopenDemo(pool, buildId, { now, settings }) {
  const { rows } = await pool.query(
    'select handoff from wo_build where id = $1 and demo_frozen_at is not null and demo_deleted_at is null',
    [buildId]
  )
  if (!rows[0]) return null
  const updated = await pool.query(
    `update wo_build set demo_frozen_at = null, demo_touched_at = $2, demo_expires_at = $3
      where id = $1 and demo_frozen_at is not null and demo_deleted_at is null
      returning *`,
    [buildId, new Date(now), expiryFrom(now, rows[0].handoff, settings)]
  )
  return updated.rows[0] ?? null
}

/**
 * Tear a frozen demo's site down through the site's own teardown (`teardown(build)`, the delete door's
 * path as a function: `'gone' | 'started' | 'busy'`), and mark the build deleted once the site row is
 * gone. A teardown still running is asked about again by the next sweep.
 * @returns {Promise<'deleted' | 'started' | 'busy'>}
 */
export async function deleteDemo(pool, build, { now, teardown }) {
  const markDeleted = async () => {
    // The state says it too: a deleted build is not a live one (`liveBuildOf`, Rebuild, the stage).
    await pool.query(
      `update wo_build set demo_deleted_at = $2, state = 'deleted', updated_at = now()
        where id = $1 and demo_deleted_at is null`,
      [build.id, new Date(now)]
    )
    return 'deleted'
  }
  const exists = async () =>
    (await pool.query('select 1 from site where site_key = $1', [build.site_key])).rowCount > 0
  if (!(await exists())) return markDeleted()
  const said = await teardown(build)
  if (said === 'gone' || !(await exists())) return markDeleted()
  return said === 'busy' ? 'busy' : 'started'
}

// The site's own delete door stamps builds through lib/ (sites/ may not import this domain).
export { markDemoDeletedBySite } from '../lib/wo-demo-marks.js'

// Live = has a site, not frozen, not deleted. Kept-for-good demos (no expiry) are never capped.
const CAPPABLE = `b.site_key is not null and b.demo_frozen_at is null and b.demo_deleted_at is null
  and b.demo_expires_at is not null`
const COLDEST_FIRST = 'coalesce(b.demo_touched_at, b.created_at) asc, b.created_at asc'

/** Ids of the live demos past a per-account or per-host cap, coldest first. `max` 0 = no cap. */
async function overCap(pool, partition, max, limit) {
  if (!max || limit <= 0) return []
  const { rows } = await pool.query(
    `select id from (
       select b.id, b.demo_touched_at, b.created_at,
              row_number() over (partition by ${partition}
                                 order by coalesce(b.demo_touched_at, b.created_at) desc, b.created_at desc) as rn
         from wo_build b join site s on s.site_key = b.site_key
        where ${CAPPABLE}) b
      where rn > $1 order by ${COLDEST_FIRST} limit $2`,
    [max, limit]
  )
  return rows.map((r) => r.id)
}

/**
 * One run of the hourly sweep (`cron.js` via `app.demoRetentionTick`): tear down demos frozen past the
 * grace, freeze demos whose term ran out, then freeze the coldest demos over a cap — at most
 * `demoSweepBatch` operations, under one advisory lock across instances.
 * @param {import('pg').Pool} pool
 * @param {{ now: number, settings: Record<string, any>,
 *   teardown: (build: Record<string, any>) => Promise<'gone' | 'started' | 'busy'>,
 *   diskPct?: (host: string) => Promise<number | null>, log?: Pick<Console, 'info' | 'warn'> }} deps
 */
export async function sweepDemos(pool, { now, settings, teardown, diskPct, log = console }) {
  if (!settings.demoRetentionEnabled) {
    log.info?.('[demo-retention] switched off on /ops/settings/wo: nothing frozen or deleted')
    return { ran: false, reason: 'disabled' }
  }
  const lock = await pool.connect()
  try {
    const got = (await lock.query('select pg_try_advisory_lock($1) as ok', [DEMO_RETENTION_LOCK_ID])).rows[0]
    if (!got.ok) return { ran: false, reason: 'busy' }
    try {
      return await sweepUnderLock(pool, { now, settings, teardown, diskPct, log })
    } finally {
      await lock.query('select pg_advisory_unlock($1)', [DEMO_RETENTION_LOCK_ID])
    }
  } finally {
    lock.release()
  }
}

async function sweepUnderLock(pool, { now, settings, teardown, diskPct, log }) {
  let budget = settings.demoSweepBatch
  const result = { ran: true, deleted: 0, tearingDown: 0, frozen: 0, capped: 0 }
  const when = new Date(now)

  const dueForDelete = await pool.query(
    `select b.* from wo_build b
      where b.site_key is not null and b.demo_deleted_at is null and b.demo_frozen_at <= $1
      order by b.demo_frozen_at limit $2`,
    [new Date(now - settings.demoFreezeGraceDays * DAY_MS), budget]
  )
  for (const build of dueForDelete.rows) {
    budget--
    try {
      const said = await deleteDemo(pool, build, { now, teardown })
      if (said === 'deleted') result.deleted++
      else result.tearingDown++
    } catch (error) {
      log.warn?.(`[demo-retention] teardown of ${build.site_key} failed: ${error?.message ?? error}`)
    }
  }

  if (budget > 0) {
    const { rowCount } = await pool.query(
      `update wo_build set demo_frozen_at = $1 where id in (
         select b.id from wo_build b
          where b.site_key is not null and b.demo_frozen_at is null and b.demo_deleted_at is null
            and b.demo_expires_at <= $1
          order by b.demo_expires_at limit $2)`,
      [when, budget]
    )
    result.frozen = rowCount ?? 0
    budget -= result.frozen
  }

  const capFreeze = async (ids) => {
    for (const id of ids) {
      if (budget <= 0) return
      if (await freezeDemo(pool, id, { now })) {
        result.capped++
        budget--
      }
    }
  }
  await capFreeze(await overCap(pool, 'b.account_id', settings.demoMaxPerAccount, budget))
  await capFreeze(await overCap(pool, 's.host', settings.demoMaxPerHost, budget))
  if (typeof diskPct === 'function' && budget > 0) {
    const hosts = await pool.query(
      `select distinct s.host from wo_build b join site s on s.site_key = b.site_key where ${CAPPABLE}`
    )
    for (const { host } of hosts.rows) {
      const pct = await diskPct(host).catch(() => null)
      if (typeof pct !== 'number' || pct <= settings.demoDiskHighWaterPct) continue
      const coldest = await pool.query(
        `select b.id from wo_build b join site s on s.site_key = b.site_key
          where ${CAPPABLE} and s.host = $1 order by ${COLDEST_FIRST} limit 1`,
        [host]
      )
      await capFreeze(coldest.rows.map((r) => r.id))
    }
  }
  return result
}
