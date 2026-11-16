// SQL and row helpers shared by the bench stores (ADR 0041, #301, #320): ids, JSON and number columns, the lease fence a
// worker's write carries so a worker that lost its lease can never write, and the start that holds a bench to
// BENCH_RUNS_AT_ONCE active runs (#633).
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const json = (value) => (value === undefined ? null : JSON.stringify(value))
export const num = (value) => (value === null || value === undefined ? null : Number(value))
export const iso = (value) => (value ? new Date(value).toISOString() : null)
/** SQL that is true when no lease token is given, or the run in `table` holds the given one. */
export const fenced = (table, runParam, tokenParam) =>
  `($${tokenParam}::bigint is null or exists (select 1 from ${table} r where r.id = $${runParam} and r.lease_token = $${tokenParam}::bigint))`

/**
 * How many runs one bench (the site planner, the site writer, the picture step, the brand step) holds active at once,
 * across every process: the start refuses one more, and the bench's worker leases and plays that many side by side, each
 * with its own lease, heartbeat and cancel (#633). Before, a bench held one run, so two step chain builds started
 * together played their plan, copy, pictures and brand steps one after the other. Every active run makes its own model
 * calls, so this is also how many runs of one bench call the provider at once (a picture run fans out further inside:
 * its looks and drawings); it is kept small for the providers' rate limits and the spend in flight. A constant, not a
 * setting: no bench limit is an operator setting.
 */
export const BENCH_RUNS_AT_ONCE = 3

/**
 * Insert a run into a bench's run table unless `limit` runs of that table are already active (status 'queued': waiting
 * or leased). The count and the insert happen in one transaction under an advisory lock on the table, so two processes
 * starting at once never pass the limit together. `insert` is the step's own `insert ... returning *`.
 * @param {import('pg').Pool} pool
 * @param {string} runTable trusted name of the run table
 * @returns {Promise<{ row: object } | { full: true }>}
 */
export async function insertRunWithinLimit(pool, runTable, insert, params, limit = BENCH_RUNS_AT_ONCE) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`bench-run-start:${runTable}`])
    const { rows: held } = await client.query(
      `select count(*)::int as n from ${runTable} where status = 'queued'`
    )
    if (held[0].n >= limit) {
      await client.query('rollback')
      return { full: true }
    }
    const { rows } = await client.query(insert, params)
    await client.query('commit')
    return { row: rows[0] }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * The refusal of a start when the bench already holds BENCH_RUNS_AT_ONCE active runs, naming them, oldest first. `what`
 * names the bench's runs ("writer runs"); `active` is the oldest one, the field a refusal named when a bench held one
 * run.
 * @param {string} code
 * @param {string} what
 * @param {{ id: string, startedBy: string, step: string }[]} activeRuns
 */
export function benchFullRefusal(code, what, activeRuns) {
  const who = activeRuns.length
    ? activeRuns.map((r) => `run ${r.id} (started by ${r.startedBy}, step ${r.step})`).join(', ')
    : 'other runs'
  const are = activeRuns.length === 1 ? 'is' : 'are'
  return {
    ok: false,
    code,
    reason: `At most ${BENCH_RUNS_AT_ONCE} ${what} at a time: ${who} ${are} still active.`,
    active: activeRuns[0] ?? null,
    activeRuns
  }
}

/** The brief of one WO revision by its id. */
export async function briefOfRevision(pool, revisionId) {
  if (!UUID.test(String(revisionId))) return { ok: false, code: 'SITE_PLANNER_REVISION_UNKNOWN' }
  const { rows } = await pool.query('select brief from wo_revision where id = $1', [revisionId])
  if (!rows[0]) return { ok: false, code: 'SITE_PLANNER_REVISION_UNKNOWN' }
  return { ok: true, brief: rows[0].brief }
}
