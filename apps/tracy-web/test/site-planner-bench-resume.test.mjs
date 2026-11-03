// A site planner bench run after a redeploy (ADR 0041, #301): the next worker resumes from the saved turns,
// sends once more a call that was dispatched without an answer (a second loss fails the run), resumes at the round
// it stopped in, and honours a cancel asked while nobody held the run.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { runAgent } from '../src/lib/agent-over-door.js'
import { readRun, saveTurn, setProgress } from '../src/site-planner/bench-store.js'
import { createSitePlannerQueue } from '../src/site-planner/bench-worker.js'
import { DOOR, finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import { assignPlannerDoor, SECRET, startRun } from './_site-planner-bench.mjs'
import { plan } from './_site-plan-check.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { error() {}, warn() {}, log() {} }
const tools = [{ name: 'read_kit_part', parameters: { type: 'object' }, run: () => '{"id":"contents"}' }]

/** What the process killed by a redeploy left: the turns it saved, and a run whose lease has lapsed. */
async function killedAfter(pool, runId, replies, { dieAt }) {
  const model = scriptedModel(replies)
  await runAgent({
    door: DOOR,
    system: 'system',
    firstUser: 'first',
    tools,
    fetchImpl: model.fetchImpl,
    onTurn: async (turn) => {
      if (turn.n === dieAt.n && turn.state === dieAt.state) throw new Error('killed')
      await saveTurn(pool, { runId, round: 0, turn })
    }
  }).catch(() => {})
  await setProgress(pool, { runId, step: 'planning', round: 0 })
  await pool.query(
    `update site_planner_run set attempts = 1, lease_until = now() - interval '1 second' where id = $1`,
    [runId]
  )
}

/**
 * One worker runs what is queued. killOn: the process dies while waiting for that request (1-based): the call was
 * dispatched and saved, and nothing after it is written. dieOnFixing: it dies just before a fix round opens.
 */
async function drain(pool, model, { killOn, dieOnFixing } = {}) {
  let count = 0
  const kill = async () => {
    await pool.query('update site_planner_run set lease_token = lease_token + 1')
    throw new Error('killed')
  }
  const fetchImpl = async (url, init) => {
    if (++count === killOn) await kill()
    return model.fetchImpl(url, init)
  }
  const watched = dieOnFixing
    ? new Proxy(pool, {
        get: (target, key) =>
          key === 'query'
            ? async (sql, params) => {
                if (/set step = \$2/.test(sql) && params?.[1] === 'fixing') await kill()
                return target.query(sql, params)
              }
            : target[key]
      })
    : pool
  await createSitePlannerQueue({ pool: watched, secret: SECRET, fetchImpl, log: quiet })
    .drain()
    .catch(() => {})
}

/** The killed worker's lease lapses, so the next tick may claim the run. */
const lapse = (pool, runId) =>
  pool.query(`update site_planner_run set lease_until = now() - interval '1 second' where id = $1`, [runId])

async function turnRows(pool, runId) {
  const { rows } = await pool.query('select * from site_planner_turn where run_id = $1 order by n', [runId])
  return rows
}

test(
  'a run killed between two calls resumes from its saved turns and sends only the next call',
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool)
    const started = await startRun(pool)
    const before = toolCallReply({
      calls: [['read_kit_part', { id: 'contents' }]],
      usage: usageOf({ cost: 0.5 })
    })
    await killedAfter(pool, started.id, [before], { dieAt: { n: 1, state: 'dispatched' } })

    const model = scriptedModel([
      finalReply({ content: JSON.stringify(plan()), usage: usageOf({ cost: 1 }) })
    ])
    await drain(pool, model)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.attempts, 2)
    assert.equal(run.totals.turns, 2)
    assert.equal(run.costUsd, 1.5)
    assert.equal(model.requests.length, 1)
    // The resumed call carries the saved conversation and the tool result run again.
    const sent = model.requests[0].body.messages
    assert.deepEqual(
      sent.map((m) => m.role),
      ['system', 'user', 'assistant', 'tool']
    )
    assert.equal(run.rounds[0].state, 'checked')
  }
)

test('a call dispatched without an answer is abandoned and sent once more', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const started = await startRun(pool)
  const before = toolCallReply({
    calls: [['read_kit_part', { id: 'contents' }]],
    usage: usageOf({ cost: 0.5 })
  })
  await killedAfter(pool, started.id, [before], { dieAt: { n: 0, state: 'answered' } })

  const model = scriptedModel([finalReply({ content: JSON.stringify(plan()), usage: usageOf({ cost: 1 }) })])
  await drain(pool, model)
  const run = await readRun(pool, started.id)
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(model.requests.length, 1)
  // The resend is the same request: the first user message, nothing else.
  assert.deepEqual(
    model.requests[0].body.messages.map((m) => m.role),
    ['system', 'user']
  )
  const turns = await turnRows(pool, started.id)
  assert.deepEqual(
    turns.map((t) => [t.n, t.state, t.resend_of]),
    [
      [0, 'abandoned', null],
      [1, 'answered', 0]
    ]
  )
  assert.deepEqual(turns[1].sent, turns[0].sent)
  assert.equal(turns[0].error.code, 'TURN_ABANDONED')
  assert.equal(run.costUsd, 1)
})

test('a resend lost again fails the run with AGENT_TURN_UNANSWERED', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const started = await startRun(pool)
  await killedAfter(pool, started.id, [toolCallReply({ calls: [['read_kit_part', { id: 'contents' }]] })], {
    dieAt: { n: 0, state: 'answered' }
  })
  await drain(pool, scriptedModel([]), { killOn: 1 })
  await lapse(pool, started.id)

  const model = scriptedModel([finalReply({ content: JSON.stringify(plan()) })])
  await drain(pool, model)
  const run = await readRun(pool, started.id)
  assert.equal(model.requests.length, 0)
  assert.equal(run.status, 'failed')
  assert.match(run.error, /^AGENT_TURN_UNANSWERED/)
  assert.equal(run.rounds[0].state, 'failed')
  const turns = await turnRows(pool, started.id)
  assert.deepEqual(
    turns.map((t) => [t.n, t.state, t.resend_of]),
    [
      [0, 'abandoned', null],
      [1, 'dispatched', 0]
    ]
  )
})

test(
  'a redeploy while round 1 waits for the model resumes round 1 and resends its failure list',
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool)
    const started = await startRun(pool)
    const bad = plan()
    delete bad.site
    await drain(pool, scriptedModel([finalReply({ content: JSON.stringify(bad) })]), { killOn: 2 })
    await lapse(pool, started.id)
    let run = await readRun(pool, started.id)
    assert.equal(run.status, 'queued')
    assert.deepEqual([run.step, run.round], ['fixing', 1])

    const model = scriptedModel([finalReply({ content: JSON.stringify(plan()) })])
    await drain(pool, model)
    run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 1)
    const sent = model.requests[0].body.messages
    assert.deepEqual(
      sent.map((m) => m.role),
      ['system', 'user', 'assistant', 'user']
    )
    assert.match(JSON.stringify(sent[3].content), /R09 \|/)
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state]),
      [
        [0, 'checked'],
        [1, 'checked']
      ]
    )
    const turns = await turnRows(pool, started.id)
    assert.deepEqual(
      turns.map((t) => [t.n, t.round, t.state, t.resend_of]),
      [
        [0, 0, 'answered', null],
        [1, 1, 'abandoned', null],
        [2, 1, 'answered', 1]
      ]
    )
  }
)

test('a redeploy between two rounds opens the next round with the failure list', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const started = await startRun(pool)
  const bad = plan()
  delete bad.site
  // Round 0 is checked and saved, then the process dies before round 1 opens.
  await drain(pool, scriptedModel([finalReply({ content: JSON.stringify(bad) })]), { dieOnFixing: true })
  await lapse(pool, started.id)
  const model = scriptedModel([finalReply({ content: JSON.stringify(plan()) })])
  await drain(pool, model)
  const run = await readRun(pool, started.id)
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(model.requests.length, 1)
  assert.equal(run.rounds.length, 2)
  assert.match(JSON.stringify(model.requests[0].body.messages.at(-1).content), /R09 \|/)
})

test('a cancel asked while the run had no worker ends it on the next claim, with no call', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const started = await startRun(pool)
  const before = toolCallReply({ calls: [['read_kit_part', { id: 'contents' }]] })
  await killedAfter(pool, started.id, [before], { dieAt: { n: 1, state: 'dispatched' } })
  await pool.query('update site_planner_run set cancel_requested_at = now() where id = $1', [started.id])
  await pool.query(
    `insert into site_planner_round (run_id, round, state) values ($1, 0, 'planning') on conflict do nothing`,
    [started.id]
  )

  const model = scriptedModel([])
  await drain(pool, model)
  const run = await readRun(pool, started.id)
  assert.equal(model.requests.length, 0)
  assert.equal(run.status, 'cancelled')
  assert.equal(run.rounds[0].state, 'cancelled')
})
