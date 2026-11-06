// The one-off fallback of the brand bench (#321): when the usual agent falls short, a run can use gpt-6-luna as the
// agent with the reviewer switched to deepseek-flash, so the two never match. Both switches are explicit, both are
// recorded with the reason, and the same model on both doors is still refused.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { startBrandRun } from '../src/brand-step/brand-control.js'
import { callsOf } from '../src/brand-step/brand-call-store.js'
import { readRun } from '../src/brand-step/brand-store.js'
import { createBrandQueue } from '../src/brand-step/brand-worker.js'
import { fileDb } from './_db.mjs'
import { scriptedModel } from './_agent-over-door-fake.mjs'
import {
  assignBrandDoors,
  brandCase,
  done,
  fakeWiring,
  quiet,
  saveCall,
  SECRET,
  startRun
} from './_brand-bench.mjs'
import { KIT_REF, readyKitImages } from './_site-planner-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const LUNA = 'openai/gpt-6-luna'
const FLASH = 'deepseek/deepseek-flash'
const REASON = 'the usual agent fell short on this brief'

const start = (pool, c, agentModel) =>
  startBrandRun({
    pool,
    secret: SECRET,
    brief: c.brief,
    briefSource: { kind: 'file', name: 'x.json' },
    kitRef: KIT_REF,
    startedBy: 'cli',
    kitImages: readyKitImages(),
    wiring: fakeWiring({ files: c.files }),
    agentModel
  })

test(
  'luna as the agent with the reviewer switched to flash: both recorded with the reason, and the run uses them',
  opts,
  async () => {
    const { pool } = db
    // the reviewer door holds luna too, so luna as the agent alone would be the same model on both doors
    await assignBrandDoors(pool, { agent: FLASH, reviewer: LUNA })
    const c = await brandCase()
    const started = await startRun(pool, c, {
      agentModel: { model: LUNA, reason: REASON, reviewerModel: FLASH }
    })
    const door = (await pool.query('select door from brand_run where id = $1', [started.id])).rows[0].door
    assert.equal(door.agent.model, LUNA)
    assert.deepEqual(door.agent.override, {
      model: LUNA,
      reason: REASON,
      reviewerModel: FLASH,
      replaces: FLASH
    })
    assert.equal(door.reviewer.model, FLASH)
    assert.deepEqual(door.reviewer.override, { model: FLASH, reason: REASON, replaces: LUNA })

    const agent = scriptedModel([saveCall(c.brand, 0.002), done(0.001)])
    const requests = []
    await createBrandQueue({
      pool,
      secret: SECRET,
      fetchImpl: (url, init) => {
        const body = JSON.parse(init.body)
        requests.push(body.model)
        return agent.fetchImpl(url, init)
      },
      kitImages: readyKitImages(),
      // the product price table (luna and flash are in it), not the test one
      wiring: async () => ({ ...(await fakeWiring({ files: c.files })()), prices: undefined }),
      log: quiet,
      retry: { attempts: 1 }
    }).drain()
    const run = await readRun(pool, started.id)
    assert.equal(run.outcome, 'brand-file', run.error)
    assert.deepEqual([...new Set(requests)], [LUNA], 'every agent call named the override model')
    assert.ok((await callsOf(pool, started.id)).every((x) => x.kind !== 'agent' || x.model === LUNA))
  }
)

test('nothing is switched on its own: the same model on both doors is still refused', opts, async () => {
  const { pool } = db
  await assignBrandDoors(pool, { agent: FLASH, reviewer: LUNA })
  const c = await brandCase()
  const same = await start(pool, c, { model: LUNA, reason: REASON })
  assert.equal(same.code, 'BRAND_SAME_MODEL')
  const both = await start(pool, c, { model: LUNA, reason: REASON, reviewerModel: LUNA })
  assert.equal(both.code, 'BRAND_SAME_MODEL')
  const anthropic = await start(pool, c, {
    model: LUNA,
    reason: REASON,
    reviewerModel: 'anthropic/claude-opus-5.5'
  })
  assert.equal(anthropic.code, 'BRAND_REVIEWER_DOOR_ANTHROPIC')
  const noReason = await start(pool, c, { model: LUNA, reason: ' ', reviewerModel: FLASH })
  assert.equal(noReason.code, 'BRAND_OVERRIDE_REASON')
  assert.equal((await pool.query('select count(*)::int as n from brand_run')).rows[0].n, 0)
})
