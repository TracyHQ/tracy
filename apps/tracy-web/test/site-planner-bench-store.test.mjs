// The site planner bench tables and their store (ADR 0041, #301): one run row (the durable queue's row), one row per
// round, one append-only row per model call, and only one active run at a time.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { runAgent } from '../src/lib/agent-over-door.js'
import { compactTurn } from '../src/site-planner/bench-export.js'
import {
  activeRun,
  createRun,
  listRuns,
  readRun,
  requestCancel,
  SITE_PLANNER_RUN_ACTIVE,
  saveRound,
  saveTurn,
  saveTurnProgress,
  setProgress,
  turnOf,
  turnRow,
  turnsOf
} from '../src/site-planner/bench-store.js'
import { DOOR, finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import { brief } from './_site-plan-check-inputs.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const input = (over = {}) => ({
  startedBy: 'owner@tracy.test',
  brief: brief(),
  briefSource: { kind: 'pasted' },
  kit: { ref: 'ja-boxing/j6/1.0.10', release: 'quickstart/ja-boxing/j6', version: '1.0.10', images: 110 },
  promptSha256: `1492da55${'0'.repeat(56)}`,
  checkerVersion: 'site-plan-check/1',
  door: { door: 'sitePlanner', providerId: 'openrouter', model: 'anthropic/claude-opus-5.5' },
  harness: {
    maxTokens: 64000,
    effort: 'high',
    cacheTtl: { system: '1h', rolling: '5m' },
    toolImages: 'inline'
  },
  ...over
})

const tools = [
  { name: 'read_kit_part', parameters: { type: 'object' }, run: ({ id }) => JSON.stringify({ id }) }
]

/** A whole conversation through the real agent loop, every turn saved through the store as it happens. */
async function conversation(pool, runId, replies, { leaseToken = null, round = 0 } = {}) {
  const model = scriptedModel(replies)
  const result = await runAgent({
    door: DOOR,
    system: 'system',
    firstUser: 'first',
    tools,
    fetchImpl: model.fetchImpl,
    retry: { attempts: 1 },
    onTurn: async (turn) => assert.equal(await saveTurn(pool, { runId, round, turn, leaseToken }), true)
  }).catch((error) => ({ error }))
  return { ...result, model }
}

// ── Pure: a turn survives the trip through a row ─────────────────────────────────────────────────

test('a turn and its row convert both ways without losing a field', () => {
  const dispatched = {
    n: 0,
    state: 'dispatched',
    sent: [{ role: 'user', content: 'first' }],
    request: { model: 'm', maxTokens: 64000, effort: 'high', tools: ['read_kit_part'], messages: 2 },
    dispatchedAt: '2026-11-03T05:00:00.000Z'
  }
  const answered = {
    ...dispatched,
    state: 'answered',
    message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function' }] },
    finishReason: 'tool_calls',
    generationId: 'gen-1',
    providerModel: 'm',
    usage: {
      promptTokens: 9018,
      completionTokens: 50,
      cachedTokens: 0,
      cacheWriteTokens: 9014,
      reasoningTokens: 0
    },
    cost: 0.04609,
    retries: [{ attempt: 1, code: 'AGENT_PROVIDER_HTTP', status: 429, reason: 'rate limited', waitMs: 2000 }],
    answeredAt: '2026-11-03T05:00:09.000Z'
  }
  const refused = { ...answered, finishReason: 'content_filter', refusal: 'filtered' }
  const failed = {
    ...dispatched,
    state: 'failed',
    error: { code: 'AGENT_PROVIDER_HTTP', reason: 'bad gateway', status: 502, uncertain: false, attempts: 1 },
    retries: [],
    answeredAt: '2026-11-03T05:00:09.000Z'
  }
  for (const turn of [dispatched, answered, refused, failed]) assert.deepEqual(turnOf(turnRow(turn, 1)), turn)
  assert.equal(turnRow(refused, 0).state, 'refused')
  assert.equal(turnRow(answered, 2).round, 2)
})

// ── Runs ─────────────────────────────────────────────────────────────────────────────────────────

test('a run stores its inputs and waits in the queue', opts, async () => {
  const { pool } = db
  const created = await createRun(pool, input())
  assert.equal(created.error, undefined)
  const run = await readRun(pool, created.run.id)
  assert.equal(run.status, 'queued')
  assert.equal(run.step, 'waiting')
  assert.equal(run.round, 0)
  assert.deepEqual(run.brief, brief())
  assert.match(run.briefSha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(run.kit, input().kit)
  assert.equal(run.promptSha256, input().promptSha256)
  assert.equal(run.checkerVersion, 'site-plan-check/1')
  assert.deepEqual(run.door, input().door)
  assert.deepEqual(run.harness, input().harness)
  assert.equal(run.costUsd, 0)
  assert.deepEqual(run.rounds, [])
  assert.equal(run.attempts, 0)
})

test('only one run is active at a time; the refusal names the running one', opts, async () => {
  const { pool } = db
  const first = await createRun(pool, input())
  const second = await createRun(pool, input({ startedBy: 'admin@tracy.test' }))
  assert.equal(second.error, SITE_PLANNER_RUN_ACTIVE)
  assert.equal(second.active.id, first.run.id)
  assert.equal(second.active.startedBy, 'owner@tracy.test')
  assert.equal((await activeRun(pool)).id, first.run.id)
  await pool.query("update site_planner_run set status = 'succeeded' where id = $1", [first.run.id])
  assert.equal(await activeRun(pool), null)
  const third = await createRun(pool, input())
  assert.equal(third.error, undefined)
})

test('the inputs of a run are frozen once stored', opts, async () => {
  const { pool } = db
  const { run } = await createRun(pool, input())
  await assert.rejects(
    pool.query(`update site_planner_run set brief = '{}' where id = $1`, [run.id]),
    /site planner run input is immutable/
  )
  await assert.rejects(
    pool.query(`update site_planner_run set prompt_sha256 = $2 where id = $1`, [run.id, 'f'.repeat(64)]),
    /immutable/
  )
})

test(
  'progress and cancel are written only to the run they name, and progress only under its lease',
  opts,
  async () => {
    const { pool } = db
    const { run } = await createRun(pool, input())
    await pool.query('update site_planner_run set lease_token = 7 where id = $1', [run.id])
    assert.equal(
      await setProgress(pool, { runId: run.id, step: 'planning', round: 0, leaseToken: '6' }),
      false
    )
    assert.equal(
      await setProgress(pool, { runId: run.id, step: 'planning', round: 0, leaseToken: '7' }),
      true
    )
    assert.equal((await readRun(pool, run.id)).step, 'planning')
    await assert.rejects(setProgress(pool, { runId: run.id, step: 'planning', round: 3, leaseToken: '7' }))
    assert.equal((await requestCancel(pool, run.id)).id, run.id)
    assert.ok((await readRun(pool, run.id)).cancelRequestedAt)
    await pool.query("update site_planner_run set status = 'failed' where id = $1", [run.id])
    assert.equal(await requestCancel(pool, run.id), null)
    assert.equal(await readRun(pool, '00000000-0000-0000-0000-000000000000'), null)
    assert.equal(await readRun(pool, 'not-a-uuid'), null)
  }
)

// ── Turns ────────────────────────────────────────────────────────────────────────────────────────

test(
  'every model call is saved as it happens, and the saved turns resume the conversation',
  opts,
  async () => {
    const { pool } = db
    const { run } = await createRun(pool, input())
    const done = await conversation(pool, run.id, [
      toolCallReply({
        calls: [['read_kit_part', { id: 'contents' }]],
        usage: usageOf({ cacheWrite: 900, cost: 0.04 })
      }),
      finalReply({ content: '{"plan":true}', usage: usageOf({ cached: 900, cost: 0.005 }) })
    ])
    assert.equal(done.answer, '{"plan":true}')
    const saved = await turnsOf(pool, run.id)
    assert.deepEqual(saved, JSON.parse(JSON.stringify(done.turns)))

    const again = scriptedModel([])
    const resumed = await runAgent({
      door: DOOR,
      system: 'system',
      firstUser: 'first',
      tools,
      history: saved,
      fetchImpl: again.fetchImpl
    })
    assert.equal(resumed.answer, '{"plan":true}')
    assert.equal(again.requests.length, 0, 'a resumed run sent a call again')

    const read = await readRun(pool, run.id)
    assert.equal(read.costUsd, 0.045)
    assert.equal(read.totals.turns, 2)
    assert.equal(read.totals.cachedTokens, 900)
    assert.equal(read.totals.cacheWriteTokens, 900)
    assert.equal(read.totals.costUsd, 0.045)
    assert.equal(read.totals.turnsWithoutCost, 0)
  }
)

test('a dispatched call with no answer stays on record and is never resent', opts, async () => {
  const { pool } = db
  const { run } = await createRun(pool, input())
  const network = Object.assign(new Error('socket hang up'), { name: 'Error' })
  const done = await conversation(pool, run.id, [
    toolCallReply({ calls: [['read_kit_part', { id: 'site' }]], usage: usageOf({ cost: 0.01 }) }),
    { throw: network }
  ])
  assert.equal(done.error.code, 'AGENT_NETWORK')
  const saved = await turnsOf(pool, run.id)
  assert.deepEqual(
    saved.map((t) => [t.n, t.state, t.error?.uncertain ?? null]),
    [
      [0, 'answered', null],
      [1, 'failed', true]
    ]
  )
  const again = scriptedModel([finalReply({ content: '{}' })])
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: 's',
      firstUser: 'first',
      tools,
      history: saved,
      fetchImpl: again.fetchImpl
    }),
    { code: 'AGENT_TURN_UNANSWERED' }
  )
  assert.equal(again.requests.length, 0)
})

test(
  'a streamed call in flight records its progress on the dispatched row, and only there',
  opts,
  async () => {
    const { pool } = db
    const { run } = await createRun(pool, input())
    const dispatchedAt = new Date().toISOString()
    const turn = {
      n: 0,
      state: 'dispatched',
      sent: [],
      request: { stream: true, idleMs: 180000 },
      dispatchedAt
    }
    assert.equal(await saveTurn(pool, { runId: run.id, round: 0, turn }), true)
    const progress = {
      contentChars: 41000,
      reasoningChars: 900,
      toolArgumentChars: 0,
      lastByteAt: dispatchedAt,
      at: dispatchedAt
    }
    assert.equal(await saveTurnProgress(pool, { runId: run.id, n: 0, progress }), true)
    // A stale lease writes nothing.
    assert.equal(await saveTurnProgress(pool, { runId: run.id, n: 0, progress: {}, leaseToken: 99 }), false)
    const flying = await readRun(pool, run.id)
    assert.deepEqual(flying.inFlight, { n: 0, round: 0, dispatchedAt, streamed: true, progress })
    // Once answered, the row is final: a late report changes nothing, and nothing is in flight.
    const answered = {
      ...turn,
      state: 'answered',
      message: { role: 'assistant', content: '{}' },
      answeredAt: dispatchedAt
    }
    assert.equal(await saveTurn(pool, { runId: run.id, round: 0, turn: answered }), true)
    assert.equal(await saveTurnProgress(pool, { runId: run.id, n: 0, progress: {} }), false)
    assert.equal((await readRun(pool, run.id)).inFlight, null)
    const { rows } = await pool.query('select progress from site_planner_turn where run_id = $1', [run.id])
    assert.deepEqual(rows[0].progress, progress)
  }
)

test('a refused answer is stored as refused and read back as the same turn', opts, async () => {
  const { pool } = db
  const { run } = await createRun(pool, input())
  const done = await conversation(pool, run.id, [
    finalReply({ content: null, finishReason: 'content_filter', usage: usageOf({ cost: 0.002 }) })
  ])
  assert.equal(done.error.code, 'AGENT_REFUSED')
  const { rows } = await pool.query('select state from site_planner_turn where run_id = $1', [run.id])
  assert.deepEqual(rows, [{ state: 'refused' }])
  const [turn] = await turnsOf(pool, run.id)
  assert.deepEqual([turn.state, turn.finishReason, turn.cost], ['answered', 'content_filter', 0.002])
  const again = scriptedModel([])
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: 's',
      firstUser: 'first',
      tools,
      history: [turn],
      fetchImpl: again.fetchImpl
    }),
    { code: 'AGENT_REFUSED' }
  )
  assert.equal(again.requests.length, 0)
})

test(
  'a call answered after a retry is one turn: its retries are stored and shown in the turns log',
  opts,
  async () => {
    const { pool } = db
    const { run } = await createRun(pool, input())
    const model = scriptedModel([
      {
        status: 503,
        body: { error: { code: 503, message: 'Service unavailable' } },
        headers: { 'retry-after': '3' }
      },
      finalReply({ content: '{}', usage: usageOf({ cost: 0.01 }) })
    ])
    const waits = []
    await runAgent({
      door: DOOR,
      system: 's',
      firstUser: 'first',
      tools,
      fetchImpl: model.fetchImpl,
      sleep: async (ms) => {
        waits.push(ms)
      },
      onTurn: async (turn) => assert.equal(await saveTurn(pool, { runId: run.id, round: 0, turn }), true)
    })
    assert.deepEqual(waits, [3000])
    const [turn, ...more] = await turnsOf(pool, run.id)
    assert.equal(more.length, 0)
    assert.equal(turn.state, 'answered')
    assert.deepEqual(
      turn.retries.map((r) => [r.attempt, r.status, r.waitMs]),
      [[1, 503, 3000]]
    )
    assert.match(turn.retries[0].reason, /Service unavailable/)
    assert.deepEqual(compactTurn(turn).retries, turn.retries)
    assert.equal((await readRun(pool, run.id)).costUsd, 0.01)
  }
)

test('a finished turn cannot be rewritten, and a stale lease writes no turn', opts, async () => {
  const { pool } = db
  const { run } = await createRun(pool, input())
  await pool.query('update site_planner_run set lease_token = 3 where id = $1', [run.id])
  const turn = {
    n: 0,
    state: 'dispatched',
    sent: [{ role: 'user', content: 'first' }],
    request: { model: 'm' },
    dispatchedAt: new Date().toISOString()
  }
  assert.equal(await saveTurn(pool, { runId: run.id, round: 0, turn, leaseToken: '2' }), false)
  assert.equal(await saveTurn(pool, { runId: run.id, round: 0, turn, leaseToken: '3' }), true)
  const answered = {
    ...turn,
    state: 'answered',
    message: { role: 'assistant', content: '{}' },
    finishReason: 'stop',
    generationId: 'g',
    providerModel: 'm',
    usage: { promptTokens: 1, completionTokens: 1, cachedTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
    cost: 0.25,
    answeredAt: new Date().toISOString()
  }
  assert.equal(await saveTurn(pool, { runId: run.id, round: 0, turn: answered, leaseToken: '3' }), true)
  assert.equal(
    await saveTurn(pool, { runId: run.id, round: 0, turn: { ...answered, cost: 9 }, leaseToken: '3' }),
    false
  )
  assert.equal((await readRun(pool, run.id)).costUsd, 0.25, 'a second answer was counted')
  await assert.rejects(
    pool.query(`update site_planner_turn set cost_usd = 9 where run_id = $1 and n = 0`, [run.id]),
    /final/
  )
})

// ── Rounds and lists ─────────────────────────────────────────────────────────────────────────────

test(
  'a round keeps its plan, checker result and failure list, and costs what its turns cost',
  opts,
  async () => {
    const { pool } = db
    const { run } = await createRun(pool, input())
    assert.equal(await saveRound(pool, { runId: run.id, round: 0, state: 'planning' }), true)
    await conversation(pool, run.id, [
      toolCallReply({ calls: [['read_kit_part', { id: 'contents' }]], usage: usageOf({ cost: 0.5 }) }),
      finalReply({ content: '{"version":"site-plan/3"}', usage: usageOf({ cost: 0.25 }) })
    ])
    const check = { summary: { pass: 18, fail: 1, skip: 1 }, rules: [{ id: 'R00', status: 'pass' }] }
    assert.equal(
      await saveRound(pool, {
        runId: run.id,
        round: 0,
        state: 'checked',
        answer: '{"version":"site-plan/3"}',
        plan: { version: 'site-plan/3' },
        checkResult: check,
        failureList: 'R05: too many rows'
      }),
      true
    )
    await saveRound(pool, { runId: run.id, round: 1, state: 'failed', error: 'AGENT_TURN_UNANSWERED' })
    await assert.rejects(saveRound(pool, { runId: run.id, round: 3, state: 'planning' }))

    const read = await readRun(pool, run.id)
    assert.deepEqual(
      read.rounds.map((r) => [r.round, r.state, r.costUsd]),
      [
        [0, 'checked', 0.75],
        [1, 'failed', 0]
      ]
    )
    assert.deepEqual(read.rounds[0].plan, { version: 'site-plan/3' })
    assert.deepEqual(read.rounds[0].checkResult, check)
    assert.equal(read.rounds[0].failureList, 'R05: too many rows')
    assert.ok(read.rounds[0].finishedAt)
    assert.equal(read.rounds[1].error, 'AGENT_TURN_UNANSWERED')
  }
)

test('the list shows the newest runs first, without their brief', opts, async () => {
  const { pool } = db
  const first = await createRun(pool, input())
  await pool.query(
    "update site_planner_run set status = 'succeeded', created_at = now() - interval '1 hour' where id = $1",
    [first.run.id]
  )
  const second = await createRun(pool, input({ briefSource: { kind: 'revision', revisionId: 'r-1' } }))
  const list = await listRuns(pool)
  assert.deepEqual(
    list.map((r) => r.id),
    [second.run.id, first.run.id]
  )
  assert.equal(list[0].kitRef, 'ja-boxing/j6/1.0.10')
  assert.equal(list[0].model, 'anthropic/claude-opus-5.5')
  assert.deepEqual(list[0].briefSource, { kind: 'revision', revisionId: 'r-1' })
  assert.equal(list[0].brief, undefined)
  assert.equal(list[1].status, 'succeeded')
  assert.equal((await listRuns(pool, { limit: 1 })).length, 1)
})
