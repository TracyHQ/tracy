// The site planner bench worker (ADR 0041, #301), at the bench-run seam: a queued run is claimed, the planner runs
// over the site planner door with the two kit tools, every model call is saved, the final answer is parsed as plan
// JSON and scored by the checker, and round 0 and the run's verdict are saved. The model is a scripted fake. Fix
// rounds and answers that are not a plan: site-planner-bench-fix-rounds.test.mjs.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readRun, turnsOf } from '../src/site-planner/bench-store.js'
import { BENCH_QUEUE, createSitePlannerQueue } from '../src/site-planner/bench-worker.js'
import { openKit } from '../src/site-planner/kit-source.js'
import { checkPlan, failureListText } from '../src/site-planner/plan-check/check-plan.js'
import { plannerPrompt } from '../src/site-planner/planner-prompt.js'
import { finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  API_KEY,
  assignPlannerDoor,
  KIT_REF,
  MODEL,
  readyKitImages,
  SECRET,
  startRun
} from './_site-planner-bench.mjs'
import { brief, plan } from './_site-plan-check.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { error() {}, warn() {}, log() {} }

// "contents" comes in the first message; the run reads the page groups.
const readGroups = (cost = 0.5) =>
  toolCallReply({ calls: [['read_kit_part', { id: 'pageGroups' }]], usage: usageOf({ cost }) })
const planReply = (cost = 1.25) => finalReply({ content: JSON.stringify(plan()), usage: usageOf({ cost }) })

/** Start a run, then let one worker claim and run everything queued. */
async function runOnce(pool, replies, { wrap } = {}) {
  await assignPlannerDoor(pool)
  const run = await startRun(pool)
  const model = scriptedModel(replies)
  const fetchImpl = wrap ? wrap(model.fetchImpl, run) : model.fetchImpl
  await createSitePlannerQueue({
    pool,
    secret: SECRET,
    fetchImpl,
    kitImages: readyKitImages(),
    log: quiet,
    retry: { attempts: 1 }
  }).drain()
  return { run: await readRun(pool, run.id), model }
}

test('the queue survives redeploys: one run at a time, many claims allowed', () => {
  // test-quality: contract one run at a time is the limit set for the paid model API (spend and rate limits); raising it is a decision, not a refactor
  assert.equal(BENCH_QUEUE.concurrency, 1)
  assert.ok(BENCH_QUEUE.maxAttempts >= 10)
})

test(
  'a run reads the kit, answers a plan, and round 0 holds the plan, its check and its cost',
  opts,
  async () => {
    const { pool } = db
    const { run, model } = await runOnce(pool, [readGroups(), planReply()])
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.step, 'done')
    assert.ok(run.finishedAt)
    assert.equal(run.costUsd, 1.75)
    assert.equal(run.totals.turns, 2)
    const [round] = run.rounds
    assert.equal(round.state, 'checked')
    assert.deepEqual(round.plan, plan())
    const expected = checkPlan({
      plan: plan(),
      kit: openKit(KIT_REF).doc,
      brief: brief(),
      briefRef: 'harbour-sport-club.json'
    })
    assert.deepEqual(round.checkResult, expected)
    assert.equal(round.failureList, failureListText(expected))
    assert.equal(round.costUsd, 1.75)
    // The approved prompt went out as the system prompt, the kit's page groups came back as the tool result.
    assert.equal(model.requests.length, 2)
    const [first, second] = model.requests.map((r) => r.body)
    assert.equal(first.model, MODEL)
    assert.equal(first.messages[0].content[0].text, plannerPrompt().text)
    assert.equal(first.max_tokens, 128000)
    const toolResult = second.messages.find((m) => m.role === 'tool')
    assert.match(JSON.stringify(toolResult.content), /group-home/)
    assert.equal(model.requests[0].headers.authorization, `Bearer ${API_KEY}`)
  }
)

test('a truncated answer fails the run', opts, async () => {
  const { pool } = db
  const cut = finalReply({ content: JSON.stringify(plan()).slice(0, 500), finishReason: 'length' })
  const { run } = await runOnce(pool, [readGroups(), cut])
  assert.equal(run.status, 'failed')
  assert.match(run.error, /^AGENT_TRUNCATED/)
  assert.equal(run.rounds[0].state, 'failed')
  assert.equal(run.rounds[0].plan, null)
})

test('a provider error fails the run with the provider reason', opts, async () => {
  const { pool } = db
  const { run } = await runOnce(pool, [{ status: 500, body: { error: { message: 'upstream down' } } }])
  assert.equal(run.status, 'failed')
  assert.match(run.error, /^AGENT_PROVIDER_HTTP.*upstream down/)
})

test('a door changed after the start fails the run before any call', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const started = await startRun(pool)
  await pool.query(`update llm_assignment set model = 'vendor/other-model' where door = 'sitePlanner'`)
  const model = scriptedModel([])
  await createSitePlannerQueue({
    pool,
    secret: SECRET,
    fetchImpl: model.fetchImpl,
    kitImages: readyKitImages(),
    log: quiet
  }).drain()
  const run = await readRun(pool, started.id)
  assert.equal(model.requests.length, 0)
  assert.equal(run.status, 'failed')
  assert.match(run.error, /^SITE_PLANNER_DOOR_CHANGED/)
  assert.deepEqual(run.rounds, [])
})

test('a cancel asked during a call stops the run after that call', opts, async () => {
  const { pool } = db
  const { run, model } = await runOnce(pool, [readGroups(), planReply()], {
    wrap: (fetchImpl, started) => async (url, init) => {
      await pool.query('update site_planner_run set cancel_requested_at = now() where id = $1', [started.id])
      return fetchImpl(url, init)
    }
  })
  assert.equal(run.status, 'cancelled')
  assert.equal(run.rounds[0].state, 'cancelled')
  assert.equal(model.requests.length, 1)
  assert.equal(run.totals.turns, 1)
})

test('a worker that lost its lease writes nothing more', opts, async () => {
  const { pool } = db
  const { run } = await runOnce(pool, [readGroups(), planReply()], {
    wrap: (fetchImpl, started) => async (url, init) => {
      await pool.query('update site_planner_run set lease_token = lease_token + 1 where id = $1', [
        started.id
      ])
      return fetchImpl(url, init)
    }
  })
  assert.equal(run.status, 'queued')
  const turns = await turnsOf(pool, run.id)
  assert.deepEqual(
    turns.map((t) => t.state),
    ['dispatched']
  )
})
