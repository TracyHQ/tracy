import { briefOf, CURRENT_BRIEF as CURRENT } from '../lib/site-brief-row.js'

/**
 * The rows behind "Apply" in the Add site popup (`db/migrations/052-site-brief.sql`).
 *
 * The row is the source of truth for how far a site's text and pictures got, because the process that
 * writes them and the process that answers the wizard's poll need not be the same one (two replicas,
 * or a deploy in the middle). Everything here is one statement, and the transitions that must happen
 * at most once (`claimWork`, `markProvisioned`) are decided by the database, not by a variable.
 */

/** The sentence a failed row carries when its worker died just as writing began, before any write was kept on the row. */
export const LOST_PLACING =
  'Tracy restarted just as your text and pictures were being placed, so the site may still have the template’s own words.'

/** @typedef {'queued'|'preparing'|'ready'|'applying'|'applied'|'failed'} BriefState */

// A site's own row (`CURRENT_BRIEF`, #1013) lives in lib/ so other domains read it too.
export { briefOf }

/** The states in which the wizard must still be told "working": the site is up but its words are not in yet. */
export const OPEN_STATES = Object.freeze(['queued', 'preparing', 'ready', 'applying'])

/**
 * Write the row a site born with a brief starts from. A second press of the same site keeps the
 * first row (the creation is idempotent on its `buildId`, so a retry is the same build). A deleted
 * site's row under the same address is written over, as if there had been none.
 * @param {import('pg').Pool} pool
 * @param {{siteKey: string, accountId: string | null, platform: string, quickstart: string | null,
 *   brief: object}} row
 */
export async function putBrief(pool, { siteKey, accountId, platform, quickstart, brief }) {
  const { rows } = await pool.query(
    `insert into site_brief as b (site_key, account_id, platform, quickstart, brief)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (site_key) do update set
       account_id = excluded.account_id, platform = excluded.platform, quickstart = excluded.quickstart,
       brief = excluded.brief, normalized = null, state = 'queued', stage = null, error = null,
       timings = '{}'::jsonb, created_at = now(), updated_at = now()
     where b.created_at < (select s.created_at from site s where s.site_key = b.site_key)
     returning *`,
    [siteKey, accountId, platform, quickstart, JSON.stringify(brief)]
  )
  if (rows[0]) return { inserted: true, row: rows[0] }
  return { inserted: false, row: await briefOf(pool, siteKey) }
}

/**
 * Put a FAILED row back at the start for another attempt of the same build: the host could not install the site, the
 * customer pressed Create again, and the creation door provisions it once more under the same address. A row that is
 * still going is left alone.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {object} brief
 * @param {string | null} [retryActionId] - the server-held WO action; one restart per action
 * @returns {Promise<boolean>} whether the row was put back
 */
export async function restartBrief(pool, siteKey, brief, retryActionId = null) {
  const { rowCount } = await pool.query(
    `update site_brief as b set
       state = 'queued', stage = null, error = null, normalized = null,
       timings = case when $3::text is null then '{}'::jsonb
                      else jsonb_build_object('woRetryActionId', $3::text) end,
       brief = $2::jsonb, updated_at = now()
     where site_key = $1 and state = 'failed'
       and coalesce(timings->>'lostFrom', '') <> 'applying'
       and error is distinct from $4::text
       and ($3::text is null or (
         timings->>'woRetryActionId' is distinct from $3::text
         and not exists (select 1 from site s where s.site_key=b.site_key and s.created_at>b.created_at)
       ))`,
    [siteKey, JSON.stringify(brief), retryActionId, LOST_PLACING]
  )
  return rowCount === 1
}

/**
 * Carry what the worker reached onto the row — only the fields given. `timings` is MERGED key by key (a shallow `||`), so
 * each phase records its own milliseconds without a read-modify-write; besides numbers it holds the apply ids of the run
 * (`applyIds`, `reusedApplyIds`: arrays, each written whole every time).
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {{state?: BriefState, stage?: string | null, error?: string | null, normalized?: object,
 *   timings?: Record<string, unknown>}} fields
 */
export async function updateBrief(pool, siteKey, { state, stage, error, normalized, timings } = {}) {
  const { rows } = await pool.query(
    `update site_brief set
       state = coalesce($2, state),
       stage = case when $3::boolean then $4 else stage end,
       error = case when $5::boolean then $6 else error end,
       normalized = coalesce($7::jsonb, normalized),
       timings = timings || coalesce($8::jsonb, '{}'::jsonb),
       updated_at = now()
     where site_key = $1
     returning *`,
    [
      siteKey,
      state ?? null,
      stage !== undefined,
      stage ?? null,
      error !== undefined,
      error ?? null,
      normalized !== undefined ? JSON.stringify(normalized) : null,
      timings !== undefined ? JSON.stringify(timings) : null
    ]
  )
  return rows[0] ?? null
}

/**
 * A state change the worker makes, and only if the row is still in a state it expects. A row that
 * was abandoned (the host could not install the site) or taken over by the stale check is NOT put back
 * to work by a worker that finishes a phase late: the worker gets `null` and stops.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {BriefState[]} from - the states this transition may start from
 * @param {Parameters<typeof updateBrief>[2]} fields
 * @returns {Promise<object | null>}
 */
export async function advanceBrief(pool, siteKey, from, { state, stage, error, normalized, timings } = {}) {
  const { rows } = await pool.query(
    `update site_brief set
       state = coalesce($3, state),
       stage = case when $4::boolean then $5 else stage end,
       error = case when $6::boolean then $7 else error end,
       normalized = coalesce($8::jsonb, normalized),
       timings = timings || coalesce($9::jsonb, '{}'::jsonb),
       updated_at = now()
     where site_key = $1 and state = any($2::text[])
     returning *`,
    [
      siteKey,
      from,
      state ?? null,
      stage !== undefined,
      stage ?? null,
      error !== undefined,
      error ?? null,
      normalized !== undefined ? JSON.stringify(normalized) : null,
      timings !== undefined ? JSON.stringify(timings) : null
    ]
  )
  return rows[0] ?? null
}

/**
 * Take the right to do a site's work, once. `queued` → `preparing` in one statement: of two replicas
 * on the same row exactly one gets it. A row that is already past `queued` is somebody else's, or done.
 * @param {import('pg').Pool} pool @param {string} siteKey
 * @returns {Promise<boolean>}
 */
export async function claimWork(pool, siteKey) {
  const { rowCount } = await pool.query(
    `update site_brief set state = 'preparing', updated_at = now()
     where site_key = $1 and state = 'queued'`,
    [siteKey]
  )
  return rowCount === 1
}

/**
 * The poll door's word that the host finished and the handover (address, pairing, lane) is done: the
 * site can now be written to. Stamped in `timings` so the report can tell how long the text and the
 * pictures had to be ready by, and idempotent — every poll of a `done` job calls it. It leaves
 * `updated_at` alone: that is the WORKER's heartbeat, and a poll must not make a dead worker look alive.
 * @param {import('pg').Pool} pool @param {string} siteKey @param {number} atMs - epoch ms
 * @returns {Promise<object | null>} the row plus `idle_ms` (time since `updated_at` on the database
 *   clock), or null when this site was made without a brief (a deleted site's row under the same
 *   address included, `CURRENT`)
 */
export async function markProvisioned(pool, siteKey, atMs) {
  const { rows } = await pool.query(
    `update site_brief b set
       timings = case when b.timings ? 'provisionedAt' then b.timings
                      else b.timings || jsonb_build_object('provisionedAt', $2::bigint) end
      from (select $1::text as site_key) k left join site s on s.site_key = k.site_key
     where b.site_key = k.site_key and ${CURRENT}
     returning b.*, extract(epoch from now() - b.updated_at) * 1000 as idle_ms`,
    [siteKey, Math.trunc(atMs)]
  )
  return rows[0] ?? null
}

/** Whether the wizard must still be told "working" for this row. */
export const isOpen = (row) => row !== null && OPEN_STATES.includes(row.state)
