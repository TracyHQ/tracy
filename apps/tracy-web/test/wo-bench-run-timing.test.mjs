// Where a bench run's time went (lib/wo-bench-run-timing.js, GET /api/ops/wo/bench-runs/:bench/:runId): rounds and
// turns with their durations, tokens and tool names, and nothing of what was said.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  benchRunTiming,
  benchRunsBetween,
  errorCodeOf,
  failureCodesIn,
  partsOf,
  failureSamplesIn,
  failuresIn,
  LIST_LIMIT,
  maskedReason,
  phasesOf,
  SAMPLES_PER_RULE,
  toolsOf
} from '../src/lib/wo-bench-run-timing.js'

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
      failures: 2,
      failureCodes: { R07: 1, R10b: 1 },
      failureSamples: {
        R07: [{ where: 'block-1', reason: 'detail' }],
        R10b: [{ where: 'block-2', reason: 'detail' }]
      }
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
  // Where the failure is, never what the looker saw on the photo.
  assert.deepEqual(out.rounds[0].failureSamples, { L01: [{ where: 'block-96.1' }] })
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

test("a bench's runs in a window: kit, revision, duration and timing settings, oldest first; a bad window is refused", async () => {
  const asked = []
  const pool = {
    query: async (sql, params) => {
      asked.push({ sql, params })
      return {
        rows: [
          {
            id: RUN,
            status: 'succeeded',
            created_at: '2026-11-19T18:02:07Z',
            finished_at: '2026-11-19T18:11:04Z',
            cost_usd: '0.16',
            harness: { effort: 'max', parallelPages: 3, budgetUsd: 2 },
            kit_ref: 'ja-diner/j6/1.0.9',
            revision_id: '7ef2a1d4-d846-49d1-adaa-2fad610dd665'
          },
          { id: RUN, status: 'running', created_at: '2026-11-19T18:03:00Z', revision_id: 'not a uuid' }
        ]
      }
    }
  }
  const now = () => Date.parse('2026-11-19T20:00:00Z')
  const out = await benchRunsBetween(pool, 'plan', { now })
  assert.equal(out.ok, true)
  assert.deepEqual(out.runs[0], {
    id: RUN,
    bench: 'plan',
    status: 'succeeded',
    createdAt: '2026-11-19T18:02:07.000Z',
    finishedAt: '2026-11-19T18:11:04.000Z',
    ms: 537_000,
    costUsd: 0.16,
    kitRef: 'ja-diner/j6/1.0.9',
    revisionId: '7ef2a1d4-d846-49d1-adaa-2fad610dd665',
    harness: { effort: 'max', parallelPages: 3 }
  })
  assert.equal(out.runs[1].revisionId, null)
  assert.equal(out.runs[1].ms, null)
  // The default window is the last 24 hours, read from the planner's own run table, at most LIST_LIMIT runs.
  assert.deepEqual(asked[0].params, ['2026-11-18T20:00:00.000Z', '2026-11-19T20:00:00.000Z'])
  assert.match(asked[0].sql, /from site_planner_run where created_at >= \$1/)
  assert.match(asked[0].sql, new RegExp(`limit ${LIST_LIMIT}$`))
  for (const window of [
    { since: 'yesterday' },
    { since: '2026-11-19T10:00:00Z', until: '2026-11-19T09:00:00Z' },
    { since: '2026-11-01T00:00:00Z', until: '2026-11-19T00:00:00Z' }
  ])
    assert.deepEqual(await benchRunsBetween(pool, 'copy', { ...window, now }), {
      ok: false,
      error: 'BAD_WINDOW'
    })
  assert.deepEqual(await benchRunsBetween(pool, 'brand', { now }), { ok: false, error: 'UNKNOWN_BENCH' })
  assert.equal(asked.length, 1, 'a refused window reads nothing')
})

test('tool names and failure counts are read defensively', () => {
  assert.deepEqual(
    toolsOf('{"tool_calls":[{"function":{"name":"read_kit_part"}},{"function":{"name":"bad name!"}}]}'),
    ['read_kit_part']
  )
  assert.deepEqual(toolsOf('not json'), [])
  assert.equal(failuresIn(null), 0)
  assert.equal(failuresIn('W06 | No sentence repeats | block-1 | x\nW03 | Text | block-2 | y'), 2)
  assert.deepEqual(failureCodesIn('R01 | a | b | c\nR01 | a | d | e\nR10b | f | g | h\nnot a rule line'), {
    R01: 2,
    R10b: 1
  })
  assert.deepEqual(failureCodesIn(null), {})
})

test("a round keeps the first three failures of each rule, with the business's words, numbers and addresses masked", () => {
  const lines = [
    ...Array.from(
      { length: 5 },
      (_, i) =>
        `R02 | Fact ids exist | page page-home / block hero @ $.copy[${i}] | fact id f-coach-${i} not in brief.facts`
    ),
    'W06 | Words stand on facts | block-160.2 | the words "Our club since 1998" rest on no fact',
    'R10b | Every link | block-7.link-1 | leads to https://example.test/book or call +971 50 000 1234, mail book@example.test',
    'no rule here | anything'
  ].join('\n')
  const samples = failureSamplesIn(lines)
  assert.equal(samples.R02.length, SAMPLES_PER_RULE)
  assert.deepEqual(samples.R02[0], {
    where: 'page page-home / block hero @ $.copy[0]',
    reason: 'fact id f-coach-0 not in brief.facts'
  })
  assert.deepEqual(samples.W06, [{ where: 'block-160.2', reason: 'the words "…" rest on no fact' }])
  assert.equal(samples.R10b[0].reason, 'leads to …url… or call #, mail …@…')
  assert.equal(Object.keys(samples).length, 3)
  assert.equal(maskedReason('x'.repeat(500)).length, 200)
})

test('a round that made no document says why by its code only, never by the answer the message quotes', () => {
  assert.equal(
    errorCodeOf('SITE_PLANNER_ANSWER_NOT_JSON: Unexpected token } in "the club\'s hours" at 1200'),
    'SITE_PLANNER_ANSWER_NOT_JSON'
  )
  assert.equal(errorCodeOf('SITE_WRITER_CHANGES_NOT_APPLIED'), 'SITE_WRITER_CHANGES_NOT_APPLIED')
  for (const error of [null, '', 'the model said no', 'lowercase_code: x'])
    assert.equal(errorCodeOf(error), null)
})

test('a round written in parallel parts says which pages each part wrote, by id only', () => {
  const reading = [
    { part: 0, about: ['shared', 'page-home'], from: 0, answer: '{"slots": [{"text": "secret words"}]}' },
    { part: 1, about: ['page-about-us', 'not an id!'], from: 1000, answer: '{}' },
    { part: 'x', about: ['page-x'] }
  ]
  assert.deepEqual(partsOf(reading), [
    { part: 0, pages: ['shared', 'page-home'] },
    { part: 1, pages: ['page-about-us'] }
  ])
  assert.equal(JSON.stringify(partsOf(JSON.stringify(reading))).includes('secret'), false)
  for (const none of [null, [], '{"a": 1}']) assert.equal(partsOf(none), null)
})
