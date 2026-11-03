// A brand bench run after a redeploy (brand step trial bench, #320): the next worker resumes from the saved turns and
// rounds and sends only the calls that are still missing. A call that was answered is never sent again, and neither is
// one that was dispatched and never answered (the provider may have charged it): that run fails with the reason.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { runAgent } from '../src/lib/agent-over-door.js'
import { saveTurn } from '../src/brand-step/brand-call-store.js'
import { fixMessage } from '../src/brand-step/brand-first-message.js'
import { saveRound } from '../src/brand-step/brand-round-store.js'
import { readRun, setProgress } from '../src/brand-step/brand-store.js'
import { createBrandQueue } from '../src/brand-step/brand-worker.js'
import { DOOR, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  assignBrandDoors,
  brandCase,
  done,
  fakeWiring,
  modelRouter,
  quiet,
  saveCall,
  SECRET,
  startRun
} from './_brand-bench.mjs'
import { readyKitImages } from './_site-planner-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const tools = [
  { name: 'open_image', parameters: { type: 'object' }, run: () => '{"ok":true}' },
  { name: 'save_brand_file', parameters: { type: 'object' }, run: () => '{"saved":true}' }
]

/** What the process killed by a redeploy left: the turns it saved (until `dieAt`), and a run whose lease has lapsed. */
async function killedAfter(pool, runId, replies, { dieAt = null } = {}) {
  const model = scriptedModel(replies)
  await runAgent({
    door: DOOR,
    system: 'system',
    firstUser: 'first',
    tools,
    fetchImpl: model.fetchImpl,
    onTurn: async (turn) => {
      if (dieAt && turn.n === dieAt.n && turn.state === dieAt.state) throw new Error('killed')
      await saveTurn(pool, { runId, round: 0, turn, model: DOOR.model })
    }
  }).catch(() => {})
  await setProgress(pool, { runId, step: 'working', round: 0 })
  await pool.query(`update brand_round set state = state where run_id = $1`, [runId])
  await pool.query(
    `update brand_run set attempts = 1, lease_until = now() - interval '1 second' where id = $1`,
    [runId]
  )
}

async function drain(pool, model, c) {
  await createBrandQueue({
    pool,
    secret: SECRET,
    fetchImpl: model.fetchImpl.bind(model),
    kitImages: readyKitImages(),
    wiring: fakeWiring({ files: c.files }),
    log: quiet,
    retry: { attempts: 1 }
  })
    .drain()
    .catch(() => {})
}

const openImage = toolCallReply({
  calls: [['open_image', { id: 'page-home-1440' }]],
  usage: usageOf({ cost: 0.5 })
})

test(
  'a run killed between two calls resumes from its saved turns and sends only the next call',
  opts,
  async () => {
    const { pool } = db
    await assignBrandDoors(pool)
    const c = await brandCase()
    const started = await startRun(pool, c)
    await killedAfter(pool, started.id, [openImage], { dieAt: { n: 1, state: 'dispatched' } })
    await saveRound(pool, { runId: started.id, round: 0, state: 'working', attempt: c.brand })
    const model = modelRouter({ agent: [done(0.1)] })
    await drain(pool, model, c)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.attempts, 2)
    assert.equal(model.agent.requests.length, 1, 'the answered call was not sent again')
    assert.deepEqual(
      model.agent.requests[0].body.messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'tool', 'user']
    )
    assert.equal(run.cost.agent, 0.6)
    assert.equal(run.outcome, 'brand-file')
  }
)

test(
  'a call dispatched and never answered is not sent again: the run fails with the reason',
  opts,
  async () => {
    const { pool } = db
    await assignBrandDoors(pool)
    const c = await brandCase()
    const started = await startRun(pool, c)
    await killedAfter(pool, started.id, [openImage], { dieAt: { n: 0, state: 'answered' } })
    const model = modelRouter({ agent: [done()] })
    await drain(pool, model, c)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'failed')
    assert.match(run.error, /AGENT_TURN_UNANSWERED/)
    assert.equal(model.requests.length, 0, 'no model call was made')
    assert.equal(run.outcome, null)
  }
)

test(
  'a final answer saved before the round was recorded is not asked for again; the gate runs on it',
  opts,
  async () => {
    const { pool } = db
    await assignBrandDoors(pool)
    const c = await brandCase()
    const started = await startRun(pool, c)
    await killedAfter(pool, started.id, [saveCall(c.brand, 0.2), done(0.1)])
    await saveRound(pool, { runId: started.id, round: 0, state: 'working', attempt: c.brand })
    const model = modelRouter({ agent: [] })
    await drain(pool, model, c)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.outcome, 'brand-file')
    assert.equal(model.requests.length, 0)
    assert.equal(run.rounds[0].state, 'accepted')
  }
)

test(
  'a run that stopped after a rejected round resumes in the fix round and sends the rejected fields once',
  opts,
  async () => {
    const { pool } = db
    await assignBrandDoors(pool)
    const c = await brandCase()
    const started = await startRun(pool, c)
    const bad = { ...c.brand, name: { ...c.brand.name, value: 'Wrong' } }
    await killedAfter(pool, started.id, [saveCall(bad), done()])
    const rejected = [{ field: 'name.value', why: 'must be exactly the brand name' }]
    await saveRound(pool, {
      runId: started.id,
      round: 0,
      state: 'rejected',
      attempt: bad,
      gateResult: { ok: false, rejected },
      sentBack: rejected,
      fault: 'agent'
    })
    const model = modelRouter({ agent: [saveCall(c.brand), done()] })
    await drain(pool, model, c)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.deepEqual(
      run.rounds.map((r) => r.state),
      ['rejected', 'accepted']
    )
    assert.equal(model.agent.requests.length, 2)
    const sent = model.agent.requests[0].body.messages.filter((m) => m.role === 'user')
    assert.equal(sent.at(-1).content, fixMessage(rejected))
  }
)
