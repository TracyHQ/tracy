// Where a bench run's time went (lib/wo-bench-run-timing.js, GET /api/ops/wo/bench-runs/:bench/:runId): rounds and
// turns with their durations, tokens and tool names, and nothing of what was said.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { benchRunTiming, failuresIn, phasesOf, toolsOf } from '../src/lib/wo-bench-run-timing.js'

const RUN = '11111111-2222-3333-4444-555555555555'
const fakePool = (tables) => ({
  query: async (sql, [id]) => {
    const table = sql.match(/from (\w+)/)[1]
    return { rows: (tables[table] ?? []).filter((r) => (r.id ?? r.run_id) === id) }
  }
})

test("a planner run's rounds and turns: durations, tokens, tool names, never the text", async () => {
  const pool = fakePool({
    site_planner_run: [
      {
        id: RUN,
        status: 'succeeded',
        created_at: '2026-11-19T10:00:00Z',
        finished_at: '2026-11-19T10:09:00Z',
        cost_usd: '0.21',
        harness: { effort: 'max', planTurns: true, secretish: 'x' }
      }
    ],
    site_planner_round: [
      {
        run_id: RUN,
        round: 0,
        state: 'checked',
        started_at: '2026-11-19T10:00:05Z',
        finished_at: '2026-11-19T10:07:05Z',
        cost_usd: 0.18,
        failure_list:
          'R07 | Every demoOwned slot | block-1 | detail\nmore text\nR10b | Every link | block-2 | detail'
      }
    ],
    site_planner_turn: [
      {
        run_id: RUN,
        round: 0,
        n: 0,
        state: 'answered',
        dispatched_at: '2026-11-19T10:00:05Z',
        answered_at: '2026-11-19T10:01:35Z',
        usage: { promptTokens: 40000, completionTokens: 9000, reasoningTokens: 8000, cachedTokens: 30000 },
        cost_usd: 0.02,
        message: {
          role: 'assistant',
          content: 'secret reasoning',
          tool_calls: [{ function: { name: 'open_kit_image' } }]
        }
      }
    ]
  })
  const out = await benchRunTiming(pool, 'plan', RUN)
  assert.equal(out.ok, true)
  assert.deepEqual(out.run.harness, { effort: 'max', planTurns: true })
  assert.equal(out.run.ms, 9 * 60_000)
  assert.deepEqual(out.rounds, [
    {
      round: 0,
      state: 'checked',
      startedAt: '2026-11-19T10:00:05.000Z',
      ms: 420_000,
      costUsd: 0.18,
      failures: 2
    }
  ])
  assert.deepEqual(out.turns[0], {
    round: 0,
    n: 0,
    state: 'answered',
    dispatchedAt: '2026-11-19T10:00:05.000Z',
    ms: 90_000,
    promptTokens: 40000,
    completionTokens: 9000,
    reasoningTokens: 8000,
    cachedTokens: 30000,
    costUsd: 0.02,
    tools: ['open_kit_image']
  })
  assert.equal(JSON.stringify(out).includes('secret'), false, 'no text of the turn')
})

test("a picture round also says where its own time went (its manifest's timing), as numbers only", async () => {
  const pool = fakePool({
    site_picture_run: [{ id: RUN, status: 'succeeded', created_at: '2026-11-19T10:00:00Z', harness: {} }],
    site_picture_round: [
      {
        run_id: RUN,
        round: 0,
        state: 'checked',
        started_at: '2026-11-19T10:00:00Z',
        finished_at: '2026-11-19T10:03:00Z',
        cost_usd: 0.05,
        failure_list: 'L01 | The looker passes every finished picture | block-96.1 | it saw: a waterfront',
        // The database answers pictures->'timing' as `phases`.
        phases: { code: 41_000, iconRanking: 9_000, looker: 95_000, drawer: 30_000 }
      }
    ]
  })
  const out = await benchRunTiming(pool, 'pictures', RUN)
  assert.deepEqual(out.rounds[0].phases, { code: 41_000, iconRanking: 9_000, looker: 95_000, drawer: 30_000 })
  assert.equal(out.rounds[0].failures, 1)
  assert.equal(JSON.stringify(out).includes('waterfront'), false)
  assert.deepEqual(phasesOf({ looker: 5, note: 'text', 'bad key': 3, drawer: -1 }), { looker: 5 })
  assert.equal(phasesOf(null), null)
  assert.equal(phasesOf([1, 2]), null)
})

test('an unknown bench, a malformed id and a missing run are refused', async () => {
  const pool = fakePool({})
  assert.deepEqual(await benchRunTiming(pool, 'brand', RUN), { ok: false, error: 'UNKNOWN_BENCH' })
  assert.deepEqual(await benchRunTiming(pool, 'plan', 'x; drop table'), { ok: false, error: 'BAD_RUN_ID' })
  assert.deepEqual(await benchRunTiming(pool, 'copy', RUN), { ok: false, error: 'NO_SUCH_RUN' })
})

test('tool names and failure counts are read defensively', () => {
  assert.deepEqual(
    toolsOf('{"tool_calls":[{"function":{"name":"read_kit_part"}},{"function":{"name":"bad name!"}}]}'),
    ['read_kit_part']
  )
  assert.deepEqual(toolsOf('not json'), [])
  assert.equal(failuresIn(null), 0)
  assert.equal(failuresIn('W06 | No sentence repeats | block-1 | x\nW03 | Text | block-2 | y'), 2)
})
