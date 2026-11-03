// A site planner bench run after a redeploy (ADR 0041, #301): the next worker resumes from the saved turns, never
// sends again a call that was dispatched without an answer, and a cancel asked while nobody held the run is honoured.
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

const drain = (pool, model) =>
  createSitePlannerQueue({ pool, secret: SECRET, fetchImpl: model.fetchImpl, log: quiet }).drain()

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

test('a call dispatched without an answer is never sent again: the run fails and says so', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const started = await startRun(pool)
  const before = toolCallReply({ calls: [['read_kit_part', { id: 'contents' }]] })
  await killedAfter(pool, started.id, [before], { dieAt: { n: 0, state: 'answered' } })

  const model = scriptedModel([finalReply({ content: JSON.stringify(plan()) })])
  await drain(pool, model)
  const run = await readRun(pool, started.id)
  assert.equal(model.requests.length, 0)
  assert.equal(run.status, 'failed')
  assert.match(run.error, /^AGENT_TURN_UNANSWERED/)
  assert.equal(run.rounds[0].state, 'failed')
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
