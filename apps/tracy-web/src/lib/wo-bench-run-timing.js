// Where a bench run's time went, for staff (GET /api/ops/wo/bench-runs/:bench/:runId): its rounds and its model turns,
// each with when it started and how long it took, the tokens it used and the tools a turn called. Structural only, like
// the chain's write diagnostics: no prompt, no answer, no checker prose, no measured value. The benches have no screen
// and their runs are read with a command line inside tracy-web; a host with no shell for the person measuring (dev on
// 19/11/2026) still needs to see why a plan step took 7 or 14 minutes.

/** The bench a chain step runs, by the step's name, and the tables its runs, rounds and turns are kept in. */
export const BENCH_TABLES = Object.freeze({
  plan: { run: 'site_planner_run', round: 'site_planner_round', turn: 'site_planner_turn' },
  copy: { run: 'site_writer_run', round: 'site_writer_round', turn: 'site_writer_turn' },
  // A picture round's manifest keeps where its own time went (code, icon ranking, looker, drawer: `timing`, in ms).
  pictures: {
    run: 'site_picture_run',
    round: 'site_picture_round',
    turn: 'site_picture_turn',
    phases: "pictures->'timing'"
  }
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ms = (from, to) => (from && to ? new Date(to).getTime() - new Date(from).getTime() : null)
const iso = (v) => (v ? new Date(v).toISOString() : null)
const count = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}
/** A round's phase times: only named, non-negative milliseconds. */
export function phasesOf(timing) {
  const t = json(timing)
  if (!t || Array.isArray(t)) return null
  const out = Object.fromEntries(
    Object.entries(t).filter(
      ([k, v]) => /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(k) && Number.isFinite(v) && v >= 0
    )
  )
  return Object.keys(out).length ? out : null
}
function json(v) {
  if (v && typeof v === 'object') return v
  try {
    return typeof v === 'string' ? JSON.parse(v) : null
  } catch {
    return null
  }
}

/** The names of the tools an answered turn called (none for a final answer). */
export function toolsOf(message) {
  const m = json(message)
  return (Array.isArray(m?.tool_calls) ? m.tool_calls : [])
    .map((c) => c?.function?.name ?? c?.name)
    .filter((n) => typeof n === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(n))
}

const RULE_LINE = /^([A-Z][0-9]{2}[a-z]?) \|/

/** How many failures a round's failure list names: one per line that starts with a rule code. */
export const failuresIn = (list) =>
  String(list ?? '')
    .split('\n')
    .filter((line) => RULE_LINE.test(line)).length

/** How many failures of each rule a round's failure list names, by rule code (only the code, never the line). */
export function failureCodesIn(list) {
  const out = {}
  for (const line of String(list ?? '').split('\n')) {
    const code = RULE_LINE.exec(line)?.[1]
    if (code) out[code] = (out[code] ?? 0) + 1
  }
  return out
}

/** The harness settings that change a run's timing, and nothing else of the harness. */
export function timingHarness(value) {
  const harness = json(value) ?? {}
  return {
    ...(typeof harness.effort === 'string' ? { effort: harness.effort } : {}),
    ...(Number.isInteger(harness.parallelPages) ? { parallelPages: harness.parallelPages } : {}),
    ...(harness.planTurns === true ? { planTurns: true } : {}),
    ...(Number.isInteger(harness.maxFixRounds) ? { maxFixRounds: harness.maxFixRounds } : {}),
    ...(harness.baseCopy ? { baseCopy: true } : {})
  }
}

/** The most runs one listing answers, and the widest window it reads. */
export const LIST_LIMIT = 100
export const LIST_WINDOW_MS = 7 * 24 * 3600_000

/**
 * The runs of one bench started in a window (by default the last 24 hours), oldest first: for builds whose step records
 * carry no run id (before #707), told apart by their kit and start time.
 * @param {import('pg').Pool} pool
 * @param {'plan' | 'copy' | 'pictures'} bench
 * @param {{ since?: string, until?: string, now?: () => number }} window
 */
export async function benchRunsBetween(pool, bench, { since, until, now = Date.now } = {}) {
  const t = BENCH_TABLES[bench]
  if (!t) return { ok: false, error: 'UNKNOWN_BENCH' }
  const end = until === undefined ? now() : Date.parse(until)
  const start = since === undefined ? end - 24 * 3600_000 : Date.parse(since)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end - start > LIST_WINDOW_MS)
    return { ok: false, error: 'BAD_WINDOW' }
  const { rows } = await pool.query(
    `select id, status, created_at, finished_at, cost_usd, harness, kit->>'ref' as kit_ref,
            brief_source->>'revisionId' as revision_id
       from ${t.run} where created_at >= $1 and created_at <= $2 order by created_at limit ${LIST_LIMIT}`,
    [new Date(start).toISOString(), new Date(end).toISOString()]
  )
  return {
    ok: true,
    runs: rows.map((r) => ({
      id: r.id,
      bench,
      status: r.status,
      createdAt: iso(r.created_at),
      finishedAt: iso(r.finished_at),
      ms: ms(r.created_at, r.finished_at),
      costUsd: count(r.cost_usd),
      kitRef: typeof r.kit_ref === 'string' ? r.kit_ref.slice(0, 200) : null,
      revisionId: UUID.test(String(r.revision_id)) ? r.revision_id : null,
      harness: timingHarness(r.harness)
    }))
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {'plan' | 'copy' | 'pictures'} bench
 * @param {string} runId
 * @returns {Promise<{ ok: false, error: string } | { ok: true, run: object, rounds: object[], turns: object[] }>}
 */
export async function benchRunTiming(pool, bench, runId) {
  const t = BENCH_TABLES[bench]
  if (!t) return { ok: false, error: 'UNKNOWN_BENCH' }
  if (!UUID.test(String(runId))) return { ok: false, error: 'BAD_RUN_ID' }
  const run = (
    await pool.query(
      `select id, status, created_at, finished_at, cost_usd, harness from ${t.run} where id = $1`,
      [runId]
    )
  ).rows[0]
  if (!run) return { ok: false, error: 'NO_SUCH_RUN' }
  const rounds = (
    await pool.query(
      `select round, state, started_at, finished_at, cost_usd, failure_list, ${t.phases ?? 'null'} as phases from ${t.round} where run_id = $1 order by round`,
      [runId]
    )
  ).rows
  const turns = (
    await pool.query(
      `select round, n, state, dispatched_at, answered_at, usage, cost_usd, message from ${t.turn} where run_id = $1 order by n`,
      [runId]
    )
  ).rows
  return {
    ok: true,
    run: {
      id: run.id,
      bench,
      status: run.status,
      createdAt: iso(run.created_at),
      finishedAt: iso(run.finished_at),
      ms: ms(run.created_at, run.finished_at),
      costUsd: count(run.cost_usd),
      harness: timingHarness(run.harness)
    },
    rounds: rounds.map((r) => ({
      round: r.round,
      state: r.state,
      startedAt: iso(r.started_at),
      ms: ms(r.started_at, r.finished_at),
      costUsd: count(r.cost_usd),
      failures: failuresIn(r.failure_list),
      failureCodes: failureCodesIn(r.failure_list),
      ...(phasesOf(r.phases) ? { phases: phasesOf(r.phases) } : {})
    })),
    turns: turns.map((x) => {
      const usage = json(x.usage) ?? {}
      return {
        round: x.round,
        n: x.n,
        state: x.state,
        dispatchedAt: iso(x.dispatched_at),
        ms: ms(x.dispatched_at, x.answered_at),
        promptTokens: count(usage.promptTokens ?? usage.prompt_tokens),
        completionTokens: count(usage.completionTokens ?? usage.completion_tokens),
        reasoningTokens: count(usage.reasoningTokens ?? usage.reasoning_tokens),
        cachedTokens: count(usage.cachedTokens ?? usage.cached_tokens),
        costUsd: count(x.cost_usd),
        tools: toolsOf(x.message)
      }
    })
  }
}
