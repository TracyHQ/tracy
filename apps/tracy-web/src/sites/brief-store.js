import { briefOf, CURRENT_BRIEF as CURRENT, LOST_PLACING } from '../lib/site-brief-row.js'
import { CHAIN_RETRY_BRIEF_HASH, CHAIN_RETRY_SAFE } from '../lib/chain-retry-authority.js'

/**
 * The rows behind "Apply" in the Add site popup (`db/migrations/052-site-brief.sql`).
 *
 * The row is the source of truth for how far a site's text and pictures got, because the process that
 * writes them and the process that answers the wizard's poll need not be the same one (two replicas,
 * or a deploy in the middle). Everything here is one statement, and the transitions that must happen
 * at most once (`claimWork`, `markProvisioned`) are decided by the database, not by a variable.
 */

export { LOST_PLACING }

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
 * Put a failed row back at the start for another attempt of the same build: the host could not install the site, the
 * customer pressed Create again, and the creation door provisions it once more under the same address. A row that is
 * still going is left alone. Server-held chain retry authority can also restart an applied terminal soft failure whose
 * latest write failed; it preserves the site's identity and prepares a fresh chain rather than provisioning again.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {object} brief
 * @param {string | null} [retryActionId] - the server-held WO action; one restart per action
 * @returns {Promise<boolean>} whether the row was put back
 */
export async function restartBrief(pool, siteKey, brief, retryActionId = null, retryAuthority = null) {
  if (retryAuthority) {
    const { rowCount } = await pool.query(
      `update site_brief b set state='queued',stage=null,error=null,normalized=null,
       timings=jsonb_build_object('attemptStartedAt',floor(extract(epoch from clock_timestamp())*1000),
         'woRetryActionId',$3::text), brief=$2::jsonb,updated_at=now()
       from wo_build w,site s
       where b.site_key=$1 and s.site_key=b.site_key and w.id=($5::jsonb->>'buildId')::uuid
         and ${CHAIN_RETRY_SAFE} and b.error is distinct from $4::text and b.brief=$2::jsonb
         and ${CHAIN_RETRY_BRIEF_HASH}=$5::jsonb->>'failedBriefHash'
         and exists(select 1 from wo_demo_action a where a.id=$3::uuid and a.status='queued'
           and a.account_id=w.account_id and a.revision_id=w.revision_id and a.build_request_id=w.request_id
           and a.opportunity_id=(select r.opportunity_id from wo_revision r where r.id=w.revision_id
             and r.account_id=w.account_id) and a.protocol='legacy'
           and a.retry_of=($5::jsonb->>'parentActionId')::uuid
           and a.selection->'acceptedChainRetry'=$5::jsonb
           and a.id::text=$5::jsonb->>'acceptedActionId'
           and exists(select 1 from wo_demo_action p where p.id=a.retry_of
             and p.status in ('failed','quality-failed-v1','completed','quality-completed-v1') and p.account_id=a.account_id
             and p.opportunity_id=a.opportunity_id and p.revision_id=a.revision_id
             and p.build_request_id=a.build_request_id)
           and a.account_id::text=$5::jsonb->>'accountId'
           and a.revision_id::text=$5::jsonb->>'revisionId'
           and w.site_key=$5::jsonb->>'siteKey')`,
      [siteKey, JSON.stringify(brief), retryActionId, LOST_PLACING, JSON.stringify(retryAuthority)]
    )
    return rowCount === 1
  }
  const { rowCount } = await pool.query(
    `update site_brief as b set
       state = 'queued', stage = null, error = null, normalized = null,
       timings = jsonb_build_object('attemptStartedAt', floor(extract(epoch from clock_timestamp()) * 1000))
                 || case when $3::text is null then '{}'::jsonb
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
