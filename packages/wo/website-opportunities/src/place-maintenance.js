/**
 * The shared place store's background work, run from the Website Opportunities tick (`app.js`): the
 * backfill of research made before places existed (`place-backfill.js`) and the merges that waited for
 * their places to be idle (`place-merge.js`). One replica at a time (`pg_try_advisory_lock`); a replica that
 * stops half-way leaves nothing half-written, and the next tick goes on from where the store says.
 */
import { runBackfill } from './place-backfill.js'
import { applyApprovedMerges, autoMergeAll, autoMergeFor } from './place-merge.js'

/** `pg_try_advisory_lock` id of the sweep (`executor.js` lists the taken ones; 041 is the cost ledger's). */
export const PLACE_MAINTENANCE_LOCK_ID = 7_243_042
/** After a backfill pass that found nothing, the next one waits this long. */
const IDLE_MS = 5 * 60_000

/**
 * @param {{ pool: import('pg').Pool, objects: { get: Function, put: Function } | null, log?: Console,
 *   batch?: number, retryAfterMs?: number, now?: () => number,
 *   runtime?: () => Promise<{ keys: { google?: string | null } }>, loadDomain?: () => Promise<any>,
 *   domainDeps?: object, chargeable?: Function }} deps
 *   `runtime` + `loadDomain`: the backfill's website pass asks Google (`/ops/wo` key) through `chargeable`.
 */
export function createPlaceMaintenance({
  pool,
  objects,
  log = console,
  batch = 50,
  retryAfterMs,
  now = Date.now,
  runtime = null,
  loadDomain = null,
  domainDeps = {},
  chargeable
}) {
  let idleUntil = 0
  const key = async () => (runtime ? ((await runtime()).keys?.google ?? null) : null)
  const googleWebsite =
    runtime && loadDomain
      ? {
          available: async () => Boolean(await key()),
          website: async (googleId) =>
            (await loadDomain()).fetchPlaceWebsite(googleId, { ...domainDeps, googleKey: await key() })
        }
      : null
  // A backfill pass moved something since the last merge check (it may span several ticks).
  let unchecked = true

  async function afterPublish(placeId) {
    try {
      return await autoMergeFor(pool, placeId)
    } catch (error) {
      log.warn(`[opportunities] place ${placeId}: merge check failed: ${error?.message ?? error}`)
      return null
    }
  }

  /** @returns {Promise<{ran: boolean, backfill?: object, merges?: object}>} */
  async function tick() {
    const client = await pool.connect()
    try {
      const { rows } = await client.query('select pg_try_advisory_lock($1) as got', [
        PLACE_MAINTENANCE_LOCK_ID
      ])
      if (!rows[0]?.got) return { ran: false }
      try {
        let backfill = null
        if (now() >= idleUntil) {
          backfill = await runBackfill(pool, {
            objects,
            batch,
            log,
            googleWebsite,
            ...(chargeable ? { chargeable } : {}),
            ...(retryAfterMs === undefined ? {} : { retryAfterMs })
          })
          if (backfill.linked || backfill.published || backfill.upgraded) unchecked = true
          // Merges are judged once the backfill is through, never place by place while places still arrive.
          if (!backfill.more && unchecked) {
            await autoMergeAll(pool)
            unchecked = false
          }
          const busy =
            backfill.more || backfill.linked || backfill.published || backfill.upgraded || backfill.retried
          if (!busy) idleUntil = now() + IDLE_MS
        }
        const merges = await applyApprovedMerges(pool)
        return { ran: true, backfill, merges }
      } finally {
        await client.query('select pg_advisory_unlock($1)', [PLACE_MAINTENANCE_LOCK_ID]).catch(() => {})
      }
    } finally {
      client.release()
    }
  }

  return { tick, afterPublish }
}
