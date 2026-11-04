// A paid tool call is never paid twice, and a cost cap hit inside a tool ends the run (brand step trial bench, #320).
// A resumed run re-runs the tools of the last answered agent turn; make_icon (a drawing) and look_logo (the reviewer)
// cost money, so their saved results come back instead. A cap reached inside a tool must not become a tool failure
// that buys one more agent turn.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { callsOf } from '../src/brand-step/brand-call-store.js'
import { CostCapReached } from '../src/brand-step/brand-spend.js'
import { readRun } from '../src/brand-step/brand-store.js'
import { createBrandQueue } from '../src/brand-step/brand-worker.js'
import { toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  assignBrandDoors,
  brandCase,
  done,
  fakeTools,
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
const yes = { body: { choices: [{ message: { content: 'yes' } }], usage: { cost: 0.0003 } } }

/** make_icon as the loop sees it: one drawing, logged with its cost. */
const makeIcon = (counts) => ({
  name: 'make_icon',
  description: 'fake make_icon',
  inputSchema: { type: 'object' },
  async run(_input, ctx) {
    counts.make_icon = (counts.make_icon ?? 0) + 1
    await ctx.spend.check()
    await ctx.spend.record({
      kind: 'drawing',
      tool: 'make_icon',
      model: 'vendor/picture-model',
      purpose: 'draw the icon mark',
      status: 'answered',
      latencyMs: 1,
      costUsd: 0.03
    })
    return { ok: true, file: 'icon/icon-1.png', attempt: 1 }
  }
})

const toolsWith = (counts, extra = []) => [
  ...fakeTools({ onCall: (name) => (counts[name] = (counts[name] ?? 0) + 1) }),
  makeIcon(counts),
  ...extra
]

const drain = (pool, model, c, tools) =>
  createBrandQueue({
    pool,
    secret: SECRET,
    fetchImpl: model.fetchImpl.bind(model),
    kitImages: readyKitImages(),
    wiring: fakeWiring({ tools, files: c.files }),
    log: quiet,
    retry: { attempts: 1 }
  })
    .drain()
    .catch(() => {})

const paidTurn = toolCallReply({
  calls: [
    ['make_icon', { subject: 'a fish', colours: ['#112233'] }],
    ['look_logo', { question: 'Is it readable?' }]
  ],
  usage: usageOf({ cost: 0.02 })
})

/** The state a process killed after its tools ran and before the next model call leaves: the next turn is gone. */
async function killedBeforeNextTurn(pool, runId) {
  await pool.query(`delete from brand_call where run_id = $1 and kind = 'agent' and n >= 1`, [runId])
  await pool.query(
    `update brand_round set state = 'working', error = null, finished_at = null where run_id = $1`,
    [runId]
  )
  await pool.query(
    `update brand_run set status = 'queued', error = null, finished_at = null, step = 'working', attempts = 1,
       lease_until = now() - interval '1 second' where id = $1`,
    [runId]
  )
}

async function firstProcess(pool, c) {
  await assignBrandDoors(pool)
  const run = await startRun(pool, c)
  const counts = {}
  // The paid turn is answered and its tools run; the next model call has no reply, so the first process ends there.
  await drain(pool, modelRouter({ agent: [paidTurn], reviewer: [yes] }), c, toolsWith(counts))
  assert.deepEqual([counts.make_icon, counts.look_logo], [1, 1])
  await killedBeforeNextTurn(pool, run.id)
  return run
}

const paid = async (pool, runId) =>
  (await callsOf(pool, runId)).filter((x) => x.kind === 'drawing' || x.kind === 'reviewer')

test('a resumed run does not draw or ask the reviewer again for its last answered turn', opts, async () => {
  const { pool } = db
  const c = await brandCase()
  const run = await firstProcess(pool, c)
  const before = await paid(pool, run.id)
  assert.deepEqual(before.map((x) => x.kind).sort(), ['drawing', 'reviewer'])
  const counts = {}
  const model = modelRouter({ agent: [saveCall(c.brand), done()], reviewer: [] })
  await drain(pool, model, c, toolsWith(counts))
  assert.equal(counts.make_icon ?? 0, 0, 'no second drawing')
  assert.equal(counts.look_logo ?? 0, 0, 'no second reviewer question')
  assert.equal(model.reviewer.requests.length, 0)
  assert.equal((await paid(pool, run.id)).length, before.length, 'no new paid call row')
  const after = await readRun(pool, run.id)
  assert.equal(after.status, 'succeeded', after.error)
  // The agent got the saved results back, as the first process had given them.
  const sent = JSON.stringify(model.agent.requests[0].body.messages)
  assert.match(sent, /icon\/icon-1\.png/)
  assert.match(sent, /\\"verdict\\":\\"yes\\"/)
})

test('only the tool call with no saved result runs again', opts, async () => {
  const { pool } = db
  const c = await brandCase()
  const run = await firstProcess(pool, c)
  // The process died after make_icon and before look_logo finished: that result was never saved.
  await pool.query(`delete from brand_tool_result where run_id = $1 and tool = 'look_logo'`, [run.id])
  const counts = {}
  const model = modelRouter({ agent: [saveCall(c.brand), done()], reviewer: [yes] })
  await drain(pool, model, c, toolsWith(counts))
  assert.equal(counts.make_icon ?? 0, 0)
  assert.equal(counts.look_logo, 1)
  assert.equal((await readRun(pool, run.id)).status, 'succeeded')
})

test(
  'a cost cap reached inside a tool ends the run as the safe version, with no further agent turn',
  opts,
  async () => {
    const { pool } = db
    await assignBrandDoors(pool)
    const c = await brandCase()
    const run = await startRun(pool, c)
    const capped = {
      ...makeIcon({}),
      run: async () => {
        throw new CostCapReached(1.02, 1)
      }
    }
    const model = modelRouter({ agent: [paidTurn, done()], reviewer: [yes] })
    await drain(pool, model, c, [...fakeTools(), capped])
    const after = await readRun(pool, run.id)
    assert.equal(after.status, 'succeeded', after.error)
    assert.equal(after.outcome, 'safe-version')
    assert.equal(after.safeVersionReason, 'cost-cap')
    assert.equal(model.agent.requests.length, 1, 'the capped tool did not buy another agent turn')
    assert.equal(after.rounds[0].state, 'failed')
    assert.match(after.rounds[0].error, /^BRAND_COST_CAP/)
  }
)
