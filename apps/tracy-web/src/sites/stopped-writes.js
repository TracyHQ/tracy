/**
 * WHAT A STOPPED CHAT TURN WROTE — kept here so the next turn of the same conversation learns it, even
 * after the host restarted (`148-site-stopped-write.sql`, review Q2, council 20/10/2026).
 *
 * The host (`tracy-site-tools` `stopped-writes.mjs`) records the writes of a site call the customer's
 * Stop cut — `sent` while one is still on the wire, then its outcome — and the first step of the next
 * turn takes them, once (`POST /api/sites/:key/turn/stopped` and `/turn/stopped/take`, `route.js`).
 * What this file guarantees:
 *   - only names are kept: an action, a target of four short fields, an outcome — never a value;
 *   - a late `sent` never overwrites an outcome that already arrived (the Stop's report and the
 *     answer's report race on the wire);
 *   - a row is told once: the take marks what it answers in the same statement;
 *   - the take answers only the earlier turns of the asking turn's own conversation, on its own site,
 *     recorded as the same person.
 */

import { parseTurnId } from './turns.js'

/** The outcomes a write of a stopped turn can have (see the migration). */
export const STOPPED_OUTCOMES = new Set(['sent', 'ok', 'refused', 'unknown', 'not-sent'])
/** Which road the write took. */
export const STOPPED_VIA = new Set(['apply', 'emdash'])
/** The most writes one report may carry, and one turn may keep: a stopped call is a few writes, not a log. */
export const STOPPED_WRITES_MAX = 50
/** The most rows one take answers: the notice names a handful and counts the rest. */
export const STOPPED_TAKE_MAX = 50
/** Rows older than this are a past visit: dropped when the site is next asked, never told. */
export const STOPPED_KEEP_MS = 7 * 24 * 60 * 60_000

const WRITE_ID = /^[A-Za-z0-9_-]{1,64}$/
const ACTION = /^[a-z][A-Za-z0-9_.]{0,63}$/
const TARGET_FIELDS = Object.freeze({
  kind: /^[A-Za-z0-9_.-]{1,64}$/,
  id: /^[\p{L}\p{N}._:-]{1,128}$/u,
  slot: /^[A-Za-z0-9_.:[\]-]{1,128}$/,
  page: /^\/[^\s"'<>]{0,199}$/
})

/**
 * One write as a report carries it, reduced to what may be kept; null when it is not a write at all.
 * A target field of the wrong shape is dropped, not refused: the outcome matters more than its label.
 * @param {unknown} value
 * @returns {{ id: string, action: string, target: Record<string, string> | null, via: string, outcome: string } | null}
 */
export function stoppedWriteOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const w = /** @type {Record<string, unknown>} */ (value)
  if (typeof w.id !== 'string' || !WRITE_ID.test(w.id)) return null
  if (typeof w.action !== 'string' || !ACTION.test(w.action)) return null
  if (typeof w.outcome !== 'string' || !STOPPED_OUTCOMES.has(w.outcome)) return null
  const via = typeof w.via === 'string' && STOPPED_VIA.has(w.via) ? w.via : 'apply'
  /** @type {Record<string, string>} */
  const target = {}
  const asked = w.target && typeof w.target === 'object' && !Array.isArray(w.target) ? w.target : {}
  for (const [field, shape] of Object.entries(TARGET_FIELDS)) {
    const v = /** @type {Record<string, unknown>} */ (asked)[field]
    const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : v
    if (typeof s === 'string' && shape.test(s)) target[field] = s
  }
  return {
    id: w.id,
    action: w.action,
    target: Object.keys(target).length > 0 ? target : null,
    via,
    outcome: w.outcome
  }
}

/**
 * Keep the writes one report carries for `turnId`, as `actor`. Upsert by (turn, write id): an
 * outcome replaces `sent`, a `sent` arriving after an outcome changes nothing, and a row already told
 * stays told. A turn keeps at most {@link STOPPED_WRITES_MAX} writes; the rest are dropped.
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, turnId: string, actor: string | null, writes: ReturnType<typeof stoppedWriteOf>[] }} report
 * @returns {Promise<number>} how many rows were written.
 */
export async function recordStoppedWrites(pool, { siteKey, turnId, actor, writes }) {
  const turn = parseTurnId(turnId)
  if (turn === null) return 0
  let kept = 0
  for (const w of writes) {
    if (w === null) continue
    const { rowCount } = await pool.query(
      `insert into site_stopped_write (turn_id, write_id, site_key, session_id, turn, actor, action, target, via, outcome)
       select $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10
        where exists (select 1 from site_stopped_write where turn_id = $1 and write_id = $2)
           or (select count(*) from site_stopped_write where turn_id = $1) < $11
       on conflict (turn_id, write_id) do update
         set outcome = case when excluded.outcome = 'sent' then site_stopped_write.outcome else excluded.outcome end,
             target = coalesce(site_stopped_write.target, excluded.target)
       where site_stopped_write.site_key = excluded.site_key`,
      [
        turnId,
        w.id,
        siteKey,
        turn.sessionId,
        turn.turn,
        actor,
        w.action,
        w.target === null ? null : JSON.stringify(w.target),
        w.via,
        w.outcome,
        STOPPED_WRITES_MAX
      ]
    )
    kept += rowCount ?? 0
  }
  return kept
}

/**
 * The writes of earlier stopped turns of `turnId`'s conversation on `siteKey`, recorded as `actor` and
 * not told yet — marked told in the same statement, so a second take answers nothing. Oldest first.
 * Rows past {@link STOPPED_KEEP_MS} on this site are dropped first.
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, turnId: string, actor: string | null }} ask
 * @returns {Promise<Array<{ turn: number, action: string, target: Record<string, string> | null, via: string, outcome: string }>>}
 */
export async function takeStoppedWrites(pool, { siteKey, turnId, actor }) {
  const turn = parseTurnId(turnId)
  if (turn === null) return []
  await pool.query(
    `delete from site_stopped_write
      where site_key = $1 and recorded_at < now() - ($2::int * interval '1 millisecond')`,
    [siteKey, STOPPED_KEEP_MS]
  )
  const { rows } = await pool.query(
    `with told as (
       update site_stopped_write set noticed_at = now()
        where (turn_id, write_id) in (
          select turn_id, write_id from site_stopped_write
           where site_key = $1 and session_id = $2 and turn < $3 and noticed_at is null
             and actor is not distinct from $4
           order by turn, recorded_at, write_id
           limit $5)
       returning turn, action, target, via, outcome, recorded_at, write_id)
     select turn, action, target, via, outcome from told order by turn, recorded_at, write_id`,
    [siteKey, turn.sessionId, turn.turn, actor, STOPPED_TAKE_MAX]
  )
  return rows.map((r) => ({
    turn: r.turn,
    action: r.action,
    target: r.target ?? null,
    via: r.via,
    outcome: r.outcome
  }))
}
