// Fix rounds of the site planner bench (ADR 0041, #303), at the bench-run seam: a failing plan's failure list goes
// back to the same conversation as the next user turn, the planner answers with the whole plan again, and it is
// scored again; at most two fix rounds, then the failures still standing are stored on the run. An answer that is
// not one JSON object is a round that is not a plan. The model is a scripted fake.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readRun } from '../src/site-planner/bench-store.js'
import {
  createSitePlannerQueue,
  MAX_FIX_ROUNDS,
  NOT_A_PLAN_MESSAGE
} from '../src/site-planner/bench-worker.js'
import { openKit } from '../src/site-planner/kit-source.js'
import { checkPlan, failureListText } from '../src/site-planner/plan-check/check-plan.js'
import { finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import { assignPlannerDoor, KIT_REF, SECRET, startRun } from './_site-planner-bench.mjs'
import { brief, plan } from './_site-plan-check.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { error() {}, warn() {}, log() {} }

/** A plan the checker fails: no site part, so no privacy page, no not-found page and no language. */
const badPlan = () => {
  const p = plan()
  delete p.site
  return p
}
const failuresOf = (p) =>
  failureListText(
    checkPlan({ plan: p, kit: openKit(KIT_REF).doc, brief: brief(), briefRef: 'harbour-sport-club.json' })
  )
const answer = (p, cost = 1) => finalReply({ content: JSON.stringify(p), usage: usageOf({ cost }) })
const readContents = () =>
  toolCallReply({ calls: [['read_kit_part', { id: 'contents' }]], usage: usageOf({ cost: 0.5 }) })
const lastUserText = (request) => {
  const m = request.body.messages.at(-1)
  return typeof m.content === 'string' ? m.content : m.content.map((p) => p.text).join('')
}

async function runOnce(pool, replies, { wrap } = {}) {
  await assignPlannerDoor(pool)
  const started = await startRun(pool)
  const model = scriptedModel(replies)
  const fetchImpl = wrap ? wrap(model.fetchImpl, started) : model.fetchImpl
  await createSitePlannerQueue({ pool, secret: SECRET, fetchImpl, log: quiet }).drain()
  return { run: await readRun(pool, started.id), model }
}

test(
  'a plan fixed in round 1: the failure list goes back in the same conversation, round 1 is clean',
  opts,
  async () => {
    const { pool } = db
    const steps = []
    const { run, model } = await runOnce(
      pool,
      [readContents(), answer(badPlan()), readContents(), answer(plan(), 2)],
      {
        wrap: (fetchImpl, started) => async (url, init) => {
          const { step, round } = await readRun(pool, started.id)
          steps.push(`${step} ${round}`)
          return fetchImpl(url, init)
        }
      }
    )
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.standingFailures, null)
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state]),
      [
        [0, 'checked'],
        [1, 'checked']
      ]
    )
    const failures = failuresOf(badPlan())
    assert.ok(failures)
    assert.equal(run.rounds[0].failureList, failures)
    assert.deepEqual(run.rounds[0].plan, badPlan())
    assert.deepEqual(run.rounds[1].plan, plan())
    assert.equal(run.rounds[1].failureList, '')
    assert.equal(run.rounds[0].costUsd, 1.5)
    assert.equal(run.rounds[1].costUsd, 2.5)
    assert.equal(run.costUsd, 4)
    assert.deepEqual(steps, ['planning 0', 'planning 0', 'fixing 1', 'fixing 1'])
    // Round 1 opens with the failure list as a user turn after the whole round 0 conversation.
    assert.equal(model.requests.length, 4)
    const third = model.requests[2]
    assert.equal(lastUserText(third), failures)
    assert.deepEqual(
      third.body.messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'tool', 'assistant', 'user']
    )
    assert.equal(third.body.messages[4].content, JSON.stringify(badPlan()))
    // The planner may read the kit again in a fix round.
    assert.deepEqual(
      model.requests[3].body.messages.slice(-2).map((m) => m.role),
      ['assistant', 'tool']
    )
  }
)

test(
  'a plan never fixed: two fix rounds, no third, the failures still standing are on the run',
  opts,
  async () => {
    const { pool } = db
    const { run, model } = await runOnce(pool, [answer(badPlan()), answer(badPlan()), answer(badPlan())])
    assert.equal(MAX_FIX_ROUNDS, 2)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.step, 'done')
    assert.equal(model.requests.length, 3)
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state]),
      [
        [0, 'checked'],
        [1, 'checked'],
        [2, 'checked']
      ]
    )
    assert.equal(run.standingFailures, failuresOf(badPlan()))
    assert.equal(lastUserText(model.requests[1]), failuresOf(badPlan()))
    assert.equal(lastUserText(model.requests[2]), failuresOf(badPlan()))
  }
)

test(
  'an answer that is not one JSON object is a round that is not a plan, and asks for the plan',
  opts,
  async () => {
    const { pool } = db
    const prose = `Here is the plan: ${JSON.stringify(plan())}`
    const { run, model } = await runOnce(pool, [finalReply({ content: prose }), answer(plan())])
    assert.equal(run.status, 'succeeded', run.error)
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state]),
      [
        [0, 'not_a_plan'],
        [1, 'checked']
      ]
    )
    assert.equal(run.rounds[0].plan, null)
    assert.equal(run.rounds[0].answer, prose)
    assert.match(run.rounds[0].error, /^SITE_PLANNER_ANSWER_NOT_JSON/)
    assert.equal(run.rounds[0].failureList, NOT_A_PLAN_MESSAGE)
    assert.equal(lastUserText(model.requests[1]), NOT_A_PLAN_MESSAGE)
    assert.match(NOT_A_PLAN_MESSAGE, /whole plan as one JSON object, with nothing before or after it/)
  }
)

test('answers that are never a plan count against the two fix rounds', opts, async () => {
  const { pool } = db
  const { run, model } = await runOnce(pool, [
    finalReply({ content: '[1, 2]' }),
    finalReply({ content: 'sorry' }),
    finalReply({ content: 'still prose' })
  ])
  assert.equal(model.requests.length, 3)
  assert.equal(run.rounds.length, 3)
  assert.match(run.rounds[0].error, /^SITE_PLANNER_ANSWER_NOT_OBJECT/)
  assert.equal(run.standingFailures, NOT_A_PLAN_MESSAGE)
})

test('a plan wrapped in one markdown code fence is read as the plan', opts, async () => {
  const { pool } = db
  for (const fence of ['```json', '```']) {
    await db.reset()
    const content = `  ${fence}\n${JSON.stringify(plan(), null, 2)}\n\`\`\`\n`
    const { run } = await runOnce(pool, [finalReply({ content })])
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.rounds.length, 1)
    assert.equal(run.rounds[0].state, 'checked')
    assert.deepEqual(run.rounds[0].plan, plan())
  }
})

test('text around a fence, or two fences, is not a plan', opts, async () => {
  const { pool } = db
  const one = `\`\`\`json\n${JSON.stringify(plan())}\n\`\`\``
  for (const content of [`Plan:\n${one}`, `${one}\n${one}`]) {
    await db.reset()
    const { run } = await runOnce(pool, [finalReply({ content }), answer(plan())])
    assert.equal(run.rounds[0].state, 'not_a_plan', content.slice(0, 20))
  }
})

test('a cancel asked during the last call of a round ends the run before the fix round', opts, async () => {
  const { pool } = db
  const { run, model } = await runOnce(pool, [answer(badPlan()), answer(plan())], {
    wrap: (fetchImpl, started) => async (url, init) => {
      await pool.query('update site_planner_run set cancel_requested_at = now() where id = $1', [started.id])
      return fetchImpl(url, init)
    }
  })
  assert.equal(run.status, 'cancelled')
  assert.equal(model.requests.length, 1)
  assert.deepEqual(
    run.rounds.map((r) => r.state),
    ['checked']
  )
})
