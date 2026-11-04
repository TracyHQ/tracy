// The brand bench's two model doors (brand step trial bench, #320): a door of its own for the agent (tools and vision)
// and for the reviewer (vision), assigned in /ops only. A run is refused, with its reason and nothing written, when a
// door is unset, disabled or incapable, when the agent and the reviewer resolve to one model, or when a brand door
// holds an Anthropic model. There is no environment or file fallback.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { startBrandRun } from '../src/brand-step/brand-control.js'
import { doorEntry } from '../src/lib/llm-catalog.js'
import { clearDoor } from '../src/lib/llm-store.js'
import { fileDb } from './_db.mjs'
import {
  AGENT_MODEL,
  assignBrandDoors,
  brandCase,
  fakeWiring,
  REVIEWER_MODEL,
  SECRET,
  startRun
} from './_brand-bench.mjs'
import { KIT_REF, readyKitImages } from './_site-planner-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

async function refusal(pool, c = null) {
  const brand = c ?? (await brandCase())
  const started = await startBrandRun({
    pool,
    secret: SECRET,
    brief: brand.brief,
    briefSource: { kind: 'file', name: 'x.json' },
    kitRef: KIT_REF,
    startedBy: 'cli',
    kitImages: readyKitImages(),
    wiring: fakeWiring({ files: brand.files })
  })
  assert.equal(started.ok, false, 'the start is refused')
  const { rows } = await pool.query('select count(*)::int as n from brand_run')
  assert.equal(rows[0].n, 0, 'nothing is queued')
  return started
}

test('the catalogue has a brand agent door (tools and vision) and a brand reviewer door (vision)', () => {
  assert.deepEqual(doorEntry('brandAgent').requires, ['tools', 'vision'])
  assert.deepEqual(doorEntry('brandReviewer').requires, ['vision'])
  assert.equal(doorEntry('brandAgent').label, 'Brand agent')
  assert.equal(doorEntry('brandReviewer').label, 'Brand reviewer')
})

test(
  'an unset agent door or reviewer door refuses the run, even with a key in the environment',
  opts,
  async () => {
    const { pool } = db
    process.env.OPENROUTER_API_KEY = 'sk-or-from-the-environment'
    try {
      assert.equal((await refusal(pool)).code, 'BRAND_AGENT_DOOR_UNSET')
      await assignBrandDoors(pool, { reviewer: null })
      assert.equal((await refusal(pool)).code, 'BRAND_REVIEWER_DOOR_UNSET')
    } finally {
      delete process.env.OPENROUTER_API_KEY
    }
  }
)

test('a door on a disabled provider refuses the run', opts, async () => {
  const { pool } = db
  await assignBrandDoors(pool, { enabled: false })
  const r = await refusal(pool)
  assert.equal(r.code, 'BRAND_AGENT_DOOR_DISABLED')
  assert.match(r.reason, /switched off/)
})

test(
  'a model the provider says cannot do tools, or cannot read pictures, refuses the run',
  opts,
  async () => {
    const { pool } = db
    await assignBrandDoors(pool, { models: [{ id: AGENT_MODEL, tools: false, vision: true }] })
    const tools = await refusal(pool)
    assert.equal(tools.code, 'BRAND_AGENT_DOOR_MODEL_LACKS')
    assert.deepEqual(tools.lacking, ['tools'])
    await assignBrandDoors(pool, { models: [{ id: AGENT_MODEL, tools: true, vision: false }] })
    assert.deepEqual((await refusal(pool)).lacking, ['vision'])
    await assignBrandDoors(pool, {
      models: [
        { id: AGENT_MODEL, tools: true, vision: true },
        { id: REVIEWER_MODEL, vision: false }
      ]
    })
    assert.equal((await refusal(pool)).code, 'BRAND_REVIEWER_DOOR_MODEL_LACKS')
  }
)

test('an agent and a reviewer that resolve to the same model refuse the run', opts, async () => {
  const { pool } = db
  await assignBrandDoors(pool, { agent: 'openai/gpt-6-luna', reviewer: 'openai/gpt-6-luna' })
  assert.equal((await refusal(pool)).code, 'BRAND_SAME_MODEL')
  // The same model under another vendor prefix is the same model.
  await assignBrandDoors(pool, { agent: 'gpt-6-luna', reviewer: 'openai/gpt-6-luna' })
  assert.equal((await refusal(pool)).code, 'BRAND_SAME_MODEL')
})

test('no Opus, no Sonnet and no Anthropic provider on any brand door', opts, async () => {
  const { pool } = db
  for (const model of ['anthropic/claude-opus-5.5', 'anthropic/claude-sonnet-5.5', 'claude-haiku-5']) {
    await assignBrandDoors(pool, { agent: model })
    assert.equal((await refusal(pool)).code, 'BRAND_AGENT_DOOR_ANTHROPIC', model)
    await assignBrandDoors(pool, { reviewer: model })
    assert.equal((await refusal(pool)).code, 'BRAND_REVIEWER_DOOR_ANTHROPIC', model)
  }
  await clearDoor(pool, 'brandAgent')
  await assignBrandDoors(pool, { agent: 'some-model', agentProvider: 'anthropic' })
  assert.equal((await refusal(pool)).code, 'BRAND_AGENT_DOOR_ANTHROPIC')
})

test(
  'a one-off agent model is recorded with its reason, and an Anthropic one is refused too',
  opts,
  async () => {
    const { pool } = db
    await assignBrandDoors(pool)
    const c = await brandCase()
    const run = await startRun(pool, c, {
      agentModel: { model: 'openai/gpt-6-luna', reason: 'flash fell short on this brief' }
    })
    const stored = (await pool.query('select door from brand_run where id = $1', [run.id])).rows[0].door
    assert.equal(stored.agent.model, 'openai/gpt-6-luna')
    assert.equal(stored.agent.override.reason, 'flash fell short on this brief')
    await pool.query(`update brand_run set status = 'cancelled' where id = $1`, [run.id])
    const refused = await startBrandRun({
      pool,
      secret: SECRET,
      brief: c.brief,
      briefSource: { kind: 'file', name: 'x.json' },
      kitRef: KIT_REF,
      startedBy: 'cli',
      kitImages: readyKitImages(),
      wiring: fakeWiring({ files: c.files }),
      agentModel: { model: 'anthropic/claude-opus-5.5', reason: 'try it' }
    })
    assert.equal(refused.code, 'BRAND_AGENT_DOOR_ANTHROPIC')
  }
)
