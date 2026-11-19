// Where a bench run's time went, for staff (GET /api/ops/wo/bench-runs/:bench/:runId): its rounds and its model turns,
// each with when it started and how long it took, the tokens it used and the tools a turn called. Structural only, like
// the chain's write diagnostics: no prompt, no answer, no checker prose, no measured value. The benches have no screen
// and their runs are read with a command line inside tracy-web; a host with no shell for the person measuring (dev on
// 19/11/2026) still needs to see why a plan step took 7 or 14 minutes.

/** The bench a chain step runs, by the step's name, and the tables its runs, rounds and turns are kept in. */
export const BENCH_TABLES = Object.freeze({
  plan: { run: 'site_planner_run', round: 'site_planner_round', turn: 'site_planner_turn' },
  copy: { run: 'site_writer_run', round: 'site_writer_round', turn: 'site_writer_turn' },
  pictures: { run: 'site_picture_run', round: 'site_picture_round', turn: 'site_picture_turn' }
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ms = (from, to) => (from && to ? new Date(to).getTime() - new Date(from).getTime() : null)
const iso = (v) => (v ? new Date(v).toISOString() : null)
const count = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const json = (v) => {
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

/** How many failures a round's failure list names: one per line that starts with a rule code. */
export const failuresIn = (list) =>
  String(list ?? '')
    .split('\n')
    .filter((line) => /^[A-Z][0-9]{2}[a-z]? \|/.test(line)).length

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
      `select round, state, started_at, finished_at, cost_usd, failure_list from ${t.round} where run_id = $1 order by round`,
      [runId]
    )
  ).rows
  const turns = (
    await pool.query(
      `select round, n, state, dispatched_at, answered_at, usage, cost_usd, message from ${t.turn} where run_id = $1 order by n`,
      [runId]
    )
  ).rows
  const harness = json(run.harness) ?? {}
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
      harness: {
        ...(typeof harness.effort === 'string' ? { effort: harness.effort } : {}),
        ...(Number.isInteger(harness.parallelPages) ? { parallelPages: harness.parallelPages } : {}),
        ...(harness.planTurns === true ? { planTurns: true } : {}),
        ...(Number.isInteger(harness.maxFixRounds) ? { maxFixRounds: harness.maxFixRounds } : {}),
        ...(harness.baseCopy ? { baseCopy: true } : {})
      }
    },
    rounds: rounds.map((r) => ({
      round: r.round,
      state: r.state,
      startedAt: iso(r.started_at),
      ms: ms(r.started_at, r.finished_at),
      costUsd: count(r.cost_usd),
      failures: failuresIn(r.failure_list)
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
