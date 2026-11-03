// The brand bench worker (brand step trial bench, #320), at the brand-run seam: a queued run is claimed, the locked
// prompt runs over the brand agent door with the brand tools, every model call is logged with its cost, the gate checks
// the file the agent saved, and the run ends with the accepted brand file. The models are scripted fakes.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { BRAND_PROMPT_SHA256, brandPrompt } from '../src/brand-step/brand-prompt.js'
import { callsOf } from '../src/brand-step/brand-call-store.js'
import { toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import { AGENT_MODEL, API_KEY, brandCase, done, REVIEWER_MODEL, runOnce, saveCall } from './_brand-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

test('the locked prompt is copied byte for byte and its hash is the approved one', () => {
  const bytes = readFileSync(new URL('../src/brand-step/brand-step.system.md', import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), BRAND_PROMPT_SHA256)
  assert.equal(brandPrompt().sha256, 'bffba6a4735a2957e38ff7e575234ba189cc1569d451344686cacf3decba70e0')
  assert.match(brandPrompt().text, /^# Brand step/)
})

test('a brand file the gate accepts on round 0 ends the run with that file', opts, async () => {
  const { pool } = db
  const c = await brandCase()
  const look = toolCallReply({
    calls: [['look_logo', { question: 'Is it readable?' }]],
    usage: usageOf({ cost: 0.02 })
  })
  const { run, model } = await runOnce(pool, c, {
    agent: [look, saveCall(c.brand, 0.03), done(0.01)],
    reviewer: [{ body: { choices: [{ message: { content: 'yes' } }], usage: { cost: 0.0003 } } }]
  })
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(run.outcome, 'brand-file')
  assert.equal(run.safeVersionReason, null)
  assert.deepEqual(run.brandFile, c.brand)
  assert.equal(run.rounds.length, 1)
  assert.equal(run.rounds[0].state, 'accepted')
  assert.deepEqual(run.rounds[0].gateResult, { ok: true })
  // The locked prompt went out as the system prompt and its hash is on the run.
  assert.equal(run.promptSha256, BRAND_PROMPT_SHA256)
  assert.match(model.agent.requests[0].body.messages[0].content, /^# Brand step/)
  assert.equal(model.agent.requests[0].body.model, AGENT_MODEL)
  assert.equal(model.reviewer.requests[0].body.model, REVIEWER_MODEL)
  // The cost is split agent / drawing / reviewer, and every call is in the log with tool, model, purpose, status.
  assert.deepEqual(run.cost, { agent: 0.06, drawing: 0, reviewer: 0.0003 })
  assert.equal(run.costUsd, 0.0603)
  const calls = await callsOf(pool, run.id)
  assert.deepEqual(
    calls.map((x) => [x.kind, x.status]),
    [
      ['agent', 'answered'],
      ['reviewer', 'answered'],
      ['agent', 'answered'],
      ['agent', 'answered']
    ]
  )
  const reviewer = calls.find((x) => x.kind === 'reviewer')
  assert.deepEqual(
    [reviewer.tool, reviewer.model, reviewer.purpose],
    ['look_logo', REVIEWER_MODEL, 'logo look']
  )
  assert.ok(Number.isInteger(reviewer.latencyMs) && reviewer.costUsd === 0.0003)
})

test(
  'the run records its harness: 5-minute cache, 512 px images, a brand-sized output budget, the cost cap',
  opts,
  async () => {
    const { pool } = db
    const c = await brandCase()
    const { run } = await runOnce(pool, c, { agent: [saveCall(c.brand), done()] })
    assert.deepEqual(run.harness.cacheTtl, { system: '5m', rolling: '5m' })
    assert.equal(run.harness.imageLongEdge, 512)
    assert.equal(run.harness.capUsd, 1)
    assert.equal(run.harness.maxTokens, 32000)
    assert.equal(run.harness.maxFixRounds, 2)
    assert.ok(run.tools.map((t) => t.name).includes('look_logo'))
    assert.equal(run.door.agent.model, AGENT_MODEL)
    assert.equal(run.door.reviewer.model, REVIEWER_MODEL)
  }
)

test(
  'a picture a tool returns reaches the agent at 512 px and is saved as a reference, not as bytes',
  opts,
  async () => {
    const { pool } = db
    const c = await brandCase()
    const open = toolCallReply({
      calls: [['open_image', { id: 'page-home-1440' }]],
      usage: usageOf({ cost: 0.01 })
    })
    const { run, model } = await runOnce(pool, c, { agent: [open, saveCall(c.brand), done()] })
    assert.equal(run.status, 'succeeded', run.error)
    const sent = JSON.stringify(model.agent.requests[1].body.messages)
    assert.match(sent, /data:image\/png;base64,/)
    const { rows } = await pool.query(
      `select sent from brand_call where run_id = $1 and kind = 'agent' order by n`,
      [run.id]
    )
    assert.ok(!JSON.stringify(rows).includes('base64'), 'the saved turns hold no image bytes')
    const fitted = [...c.files.map.keys()].filter((k) => k.startsWith('agent-view'))
    assert.equal(fitted.length, 1)
    const { default: sharp } = await import('sharp')
    const { width, height } = await sharp(c.files.map.get(fitted[0])).metadata()
    assert.equal(Math.max(width, height), 512)
  }
)

test('no key is logged or stored on a run, its rounds or its calls', opts, async () => {
  const { pool } = db
  const c = await brandCase()
  const { run } = await runOnce(pool, c, { agent: [saveCall(c.brand), done()] })
  for (const table of ['brand_run', 'brand_round', 'brand_call']) {
    const { rows } = await pool.query(
      `select * from ${table} where ${table === 'brand_run' ? 'id' : 'run_id'} = $1`,
      [run.id]
    )
    assert.ok(!JSON.stringify(rows).includes(API_KEY), `${table} holds no key`)
  }
  assert.ok(!JSON.stringify(run).includes(API_KEY))
})
