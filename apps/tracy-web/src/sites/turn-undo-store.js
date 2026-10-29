/**
 * The Postgres reads behind "undo a chat turn" (`turn-undo.js` decides; `route.js` serves
 * `GET /api/sites/:key/turns` and `POST /api/sites/:key/turns/undo`).
 *
 * ⚠ ONE READ OF `audit`. The `apply_id` a revert needs lives only in `audit.detail` (`site_write`
 * does not keep it), and `audit` has no index but its key (`023-site-write-lease.sql`), so
 * {@link turnAudits} scans it like `appliesOfSession` does — once per look, bounded by site and time.
 */
import { classifyCmsChange } from './activity-source.js'

const rowsOf = async (pool, sql, params) => (await pool.query(sql, params)).rows

/** Every turn of one conversation on one site (every actor), oldest first. */
export function sessionTurns(pool, siteKey, sessionId) {
  return rowsOf(
    pool,
    `select turn_id, session_id, turn, actor, title, opened_at, closed_at, state, head_sha, files,
            concurrent, unsealed_start
       from site_turn where site_key = $1 and session_id = $2 order by turn`,
    [siteKey, sessionId]
  )
}

/** Turns still `open` on the site, any conversation, opened after `since`. */
export function openTurnsOn(pool, siteKey, since) {
  return rowsOf(
    pool,
    `select turn_id, actor, opened_at, state from site_turn
      where site_key = $1 and state = 'open' and opened_at > $2`,
    [siteKey, since]
  )
}

/** `site_write` rows of the named turns, oldest first. */
export function writesOfTurns(pool, siteKey, turnIds) {
  if (turnIds.length === 0) return Promise.resolve([])
  return rowsOf(
    pool,
    `select id, at, actor, action, outcome, target, via, turn_id, session_id
       from site_write where site_key = $1 and turn_id = any($2::text[]) order by at, id`,
    [siteKey, turnIds]
  )
}

/**
 * The `audit` rows the turns' writes made (`detail.turnId`), and every `apply.revert` on the site,
 * since `since`: what pairs a write with its `apply_id`, and what says an id was reverted.
 */
export function turnAudits(pool, siteKey, turnIds, since) {
  return rowsOf(
    pool,
    `select id, at, actor, action, detail from audit
      where site_key = $1 and at >= $3
        and (detail->>'turnId' = any($2::text[]) or action = 'apply.revert')
      order by at, id
      limit 5000`,
    [siteKey, turnIds, since]
  )
}

/**
 * Successful writes (any turn, any conversation) under the named apply ids — what says a change of
 * the undo set also lives outside it (SHARED_CHANGE). The same `audit` scan as {@link turnAudits}.
 */
export function applyIdAudits(pool, siteKey, applyIds) {
  if (applyIds.length === 0) return Promise.resolve([])
  return rowsOf(
    pool,
    `select id, at, actor, action, detail from audit
      where site_key = $1 and detail->>'apply_id' = any($2::text[])
        and detail->>'ok' = 'true' and action not like 'apply.%'
      order by at, id
      limit 2000`,
    [siteKey, applyIds]
  )
}

/** Content and WordPress look writes on the site after `since`, any conversation, newest first. */
export function writesAfter(pool, siteKey, since) {
  return rowsOf(
    pool,
    `select id, at, actor, action, outcome, target, via, turn_id, session_id
       from site_write
      where site_key = $1 and at > $2 and outcome <> 'refused' and via in ('apply', 'emdash-mcp', 'look-css')
      order by at desc, id desc
      limit 500`,
    [siteKey, since]
  )
}

/** CMS admin log rows after `since`, newest first, each with its Source (`classifyCmsChange`). */
export async function cmsChangesAfter(pool, siteKey, since) {
  const rows = await rowsOf(
    pool,
    `select id, source, cms_actor, resource_type, resource_id, resource_title, op, occurred_at,
            producer, change_type
       from site_cms_change
      where site_key = $1 and occurred_at > $2
      order by occurred_at desc, id desc
      limit 200`,
    [siteKey, since]
  )
  return rows.map((row) => ({ ...row, origin: classifyCmsChange(row) }))
}

/**
 * Undo/restore operations on the site created after `since`. Not a Sync to live or its undo
 * (`live-push.js`): they wrote the live site, not the copy a chat turn's undo puts back.
 */
export function operationsAfter(pool, siteKey, since) {
  return rowsOf(
    pool,
    `select id, action, target_sha, status, created_at from site_operation
      where site_key = $1 and created_at > $2 and action not in ('sync-to-live', 'sync-to-live-undo')
      order by created_at`,
    [siteKey, since]
  )
}

/** The `site.turn-undo` press recorded under `idemKey` on this site, or null. */
export async function turnUndoPress(pool, siteKey, idemKey) {
  const rows = await rowsOf(
    pool,
    `select actor, detail from audit
      where site_key = $1 and action = 'site.turn-undo' and detail->>'idemKey' = $2
      order by id desc limit 1`,
    [siteKey, idemKey]
  )
  return rows[0] ?? null
}

/**
 * Stamp the turns an undo press undid (`undoneMarks`, turn-undo.js). Every mark: `undone_at` now and
 * whether this press undid all of the turn (`undo_complete`) — the conversation's next turn reads them
 * ({@link undoneSince}) and tells the agent, which otherwise reads the reverted site as changed by
 * nobody (migration 067). A proven mark also: `undo_proven_at` now, and `undo_proven_complete` once
 * a press undid all of it — the Site changes row reads those (migration 182). A press that proves
 * nothing leaves an earlier proof as it was, and a complete proof stays complete. A complete mark is
 * proven by definition (`undoneMarks` calls a turn complete only when all of it verifiably went), so a
 * mark without `proven` still counts as proven when complete.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {Array<{ turnId: string, complete: boolean, proven?: boolean }>} marks
 */
export async function markTurnsUndone(pool, siteKey, marks) {
  if (marks.length === 0) return
  await pool.query(
    `update site_turn t
        set undone_at = now(),
            undo_complete = m.complete,
            undo_proven_at = case when m.proven then now() else t.undo_proven_at end,
            undo_proven_complete = case when m.proven then (m.complete or t.undo_proven_complete is true)
                                        else t.undo_proven_complete end
       from unnest($2::text[], $3::boolean[], $4::boolean[]) as m(turn_id, complete, proven)
      where t.site_key = $1 and t.turn_id = m.turn_id`,
    [
      siteKey,
      marks.map((m) => m.turnId),
      marks.map((m) => m.complete),
      marks.map((m) => m.proven === true || m.complete === true)
    ]
  )
}

/** The most undone turns one turn's open answer names. */
export const UNDONE_LIST_MAX = 5

/**
 * The turns of this conversation undone from the chat since the agent last spoke in it: stamped
 * after the previous turn of the session opened. Newest first, at most {@link UNDONE_LIST_MAX}. A
 * session's first turn has no previous one, so nothing. Read once, when the turn opens: the turn
 * after it opened later than the stamp, so the same undo is never named twice. `undo_complete` is the
 * LAST press's (migration 067), never the sticky proof Site changes reads.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {string} sessionId
 * @param {number} turn - the turn being opened.
 * @returns {Promise<Array<{ turn: number, title: string, undo_complete: boolean | null }>>}
 */
export function undoneSince(pool, siteKey, sessionId, turn) {
  return rowsOf(
    pool,
    `with prev as (
       select opened_at from site_turn
        where site_key = $1 and session_id = $2 and turn < $3
        order by turn desc limit 1
     )
     select t.turn, t.title, t.undo_complete
       from site_turn t, prev
      where t.site_key = $1 and t.session_id = $2 and t.turn < $3 and t.undone_at > prev.opened_at
      order by t.turn desc
      limit ${UNDONE_LIST_MAX}`,
    [siteKey, sessionId, turn]
  )
}
