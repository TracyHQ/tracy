/**
 * HOW LONG VOICE TURNS TAKE (council 19/10/2026): what a Voice page reports for each phrase it sent
 * (`@tracy/dsh-chat-input` `voice-trace.mjs`) and what /ops › Agents › Voice reads back. Shared by the
 * door that takes a report (`speech/trace.js`) and the operators' screen (`ops/speech.js`); in lib/
 * because a domain may not import a sibling domain (`test/module-graph.test.mjs`).
 *
 * WHAT A REPORT IS. Spans in milliseconds, each between two moments of the PAGE's own clock
 * (`performance.now()`), never a browser time set against this server's: end of speech → phrase
 * confirmed → message sent → "got it" heard, → reply heard, and end of speech → reply heard (the one
 * a person feels). Four flags, 0 or 1. Nothing else is read from the body ({@link parseVoiceTrace}):
 * no words, and the page sends none. Kept as one `ops_signal` row of kind `voice.turn`
 * (`lib/ops-signal.js` FIELDS), once per turn id the page drew.
 *
 * 🔒 READ BY THE USAGE RULES (`ops/usage.js`, council 17/10/2026): a median needs
 * {@link MIN_FOR_MEDIAN} turns and the 95th percentile {@link MIN_FOR_P95}; a share is a count until
 * {@link MIN_FOR_MEDIAN}; every figure says how many turns it stands on; Tracy staff seats are left out.
 * Every turn is reported (no sampling).
 */

/** The spans a page may report, as the page names them, and as the row keeps them. */
export const VOICE_TRACE_SPANS = Object.freeze({
  speechToCommit: 'speech_to_commit',
  commitToSent: 'commit_to_sent',
  sentToAck: 'sent_to_ack',
  sentToReply: 'sent_to_reply',
  speechToReply: 'speech_to_reply'
})
/** The flags, 0 or 1: the "got it" played from the page's copy; failed; cut off before its reply; sent by a press. */
export const VOICE_TRACE_FLAGS = Object.freeze({
  ackCached: 'ack_cached',
  error: 'error',
  interrupted: 'interrupted',
  pressed: 'pressed'
})
/** The longest span taken: ten minutes. Anything longer is a page left open, not a turn. */
export const VOICE_TRACE_MAX_MS = 600_000
/** The largest body read: a report is about two hundred bytes. */
export const VOICE_TRACE_MAX_BYTES = 1024
/** Reports one account may make in an hour: one every six seconds of talk. */
export const VOICE_TRACES_PER_HOUR = 600
/** A turn's id as the page draws it (`crypto.randomUUID()`, or its own fallback). */
const TRACE_ID = /^[A-Za-z0-9_-]{8,64}$/

/** Below this many turns a figure is a count only: no median, no share (`ops/usage.js` `MIN_FOR_RATE`). */
export const MIN_FOR_MEDIAN = 20
/** The 95th percentile needs this many turns (`ops/usage.js` `MIN_FOR_P90`, the same rule). */
export const MIN_FOR_P95 = 100
/** The windows /ops shows, in days back from now. */
export const VOICE_TRACE_WINDOWS = Object.freeze([1, 7])
const DAY_MS = 86_400_000

/**
 * A report as this server keeps it, or why it is refused. Only the names above are read; a span that
 * is not a finite number from 0 to {@link VOICE_TRACE_MAX_MS} is dropped, a flag that is not 1 is 0.
 * @param {unknown} body
 * @returns {{ ok: true, id: string, data: Record<string, number> } | { ok: false, code: string }}
 */
export function parseVoiceTrace(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, code: 'INVALID_TRACE' }
  const raw = /** @type {Record<string, unknown>} */ (body)
  if (typeof raw.id !== 'string' || !TRACE_ID.test(raw.id)) return { ok: false, code: 'INVALID_TRACE_ID' }
  /** @type {Record<string, number>} */
  const data = {}
  for (const [name, field] of Object.entries(VOICE_TRACE_SPANS)) {
    const value = raw[name]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= VOICE_TRACE_MAX_MS)
      data[field] = Math.round(value)
  }
  for (const [name, field] of Object.entries(VOICE_TRACE_FLAGS)) data[field] = raw[name] === 1 ? 1 : 0
  return { ok: true, id: raw.id, data }
}

/**
 * The 50th and 95th percentile of `values` (nearest rank), as far as their number allows.
 * @param {number[]} values
 * @returns {{ n: number, p50: number | null, p95: number | null }}
 */
export function percentiles(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  const n = sorted.length
  const at = (q) => sorted[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))]
  return {
    n,
    p50: n >= MIN_FOR_MEDIAN ? Math.round(at(0.5)) : null,
    p95: n >= MIN_FOR_P95 ? Math.round(at(0.95)) : null
  }
}

/** `a` of `b`, with the share once `b` reaches {@link MIN_FOR_MEDIAN}. */
const share = (a, b) => ({ a, b, rate: b >= MIN_FOR_MEDIAN ? Math.round((a / b) * 1000) / 1000 : null })

/**
 * One window's turns, summed: each span's percentiles over the turns not sent by a press (a press's
 * spans hold the person's own pause), and how many failed, were cut off, or heard their "got it" from
 * the page's copy.
 * @param {{ data: Record<string, unknown> }[]} rows
 */
export function summarizeVoiceTurns(rows) {
  const flag = (row, field) => row.data?.[field] === 1
  const timed = rows.filter((row) => !flag(row, 'pressed'))
  const spans = Object.fromEntries(
    Object.entries(VOICE_TRACE_SPANS).map(([name, field]) => [
      name,
      percentiles(timed.map((row) => row.data?.[field]).filter((v) => typeof v === 'number'))
    ])
  )
  const acked = rows.filter((row) => typeof row.data?.sent_to_ack === 'number')
  return {
    turns: rows.length,
    pressed: rows.length - timed.length,
    spans,
    errors: share(rows.filter((row) => flag(row, 'error')).length, rows.length),
    interrupted: share(rows.filter((row) => flag(row, 'interrupted')).length, rows.length),
    ackCached: share(acked.filter((row) => flag(row, 'ack_cached')).length, acked.length)
  }
}

/**
 * The windows /ops shows ({@link VOICE_TRACE_WINDOWS}), from the reports of the last week; Tracy staff
 * seats left out, as `ops/usage.js` leaves them out (an accepted, live seat in the `tracy_admin`
 * workspace, matched on the address the row was recorded with).
 * @param {{ query: Function }} pool
 * @param {number} now
 */
export async function voiceTurnSummary(pool, now) {
  const longest = Math.max(...VOICE_TRACE_WINDOWS)
  const staff = (
    await pool.query(
      `select distinct lower(a.email) as email
         from account a
         join seat_workspace sw on sw.account_id = a.id
         join workspace w on w.id = sw.workspace_id
        where w.kind = 'tracy_admin'
          and sw.revoked_at is null and sw.declined_at is null and sw.accepted_at is not null`
    )
  ).rows.map((row) => row.email)
  const { rows } = await pool.query(
    `select data, occurred_at from ops_signal
      where kind = 'voice.turn' and occurred_at >= $1
        and lower(coalesce(data->>'email', '')) <> all($2::text[])`,
    [new Date(now - longest * DAY_MS), staff]
  )
  return Object.fromEntries(
    VOICE_TRACE_WINDOWS.map((days) => [
      days === 1 ? 'day' : 'week',
      {
        days,
        ...summarizeVoiceTurns(
          rows.filter((row) => new Date(row.occurred_at).getTime() >= now - days * DAY_MS)
        )
      }
    ])
  )
}
