// The WO frame checks existing recovery metadata before paid retry work and keeps fresh-base work parallel.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { STEP_CHAIN_WORKFLOW } from '../src/lib/step-chain-switch.js'
import { createBriefBuilds } from '../src/sites/brief-build.js'
import { briefOf, putBrief } from '../src/sites/brief-store.js'
import { createStepChainSteps } from '../src/step-chain-steps.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const input = () => ({
  siteKey: 'full-base.test',
  label: 'full-base',
  platform: 'joomla',
  quickstart: 'ja-boxing/j6',
  email: 'owner@example.test',
  accountId: null,
  brief: { workflow: STEP_CHAIN_WORKFLOW }
})
const refusal = () =>
  Object.assign(new Error('SITE_RECOVERY_POINT_UNAVAILABLE: no verified full backup'), {
    code: 'SITE_RECOVERY_POINT_UNAVAILABLE'
  })
const tick = () => new Promise((resolve) => setTimeout(resolve, 2))
async function until(predicate) {
  for (let i = 0; i < 300; i++) {
    if (await predicate()) return
    await tick()
  }
  throw new Error('the expected frame transition did not finish')
}
function frame(engine) {
  return createBriefBuilds({
    pool: db.pool,
    engines: { [STEP_CHAIN_WORKFLOW]: engine },
    normalize: async () => ({}),
    log: { warn() {}, info() {} },
    pollMs: 1,
    sleep: tick,
    recoverOnStart: false
  })
}

test(
  'an existing failed WO retry refuses a missing full baseline before any paid preparation',
  opts,
  async () => {
    const own = input()
    await putBrief(db.pool, own)
    await db.pool.query("update site_brief set state='failed', error='previous failure' where site_key=$1", [
      own.siteKey
    ])
    let paidCalls = 0
    const builds = frame({
      validateBase: async () => {
        throw refusal()
      },
      prepare: async () => {
        paidCalls++
        return {}
      },
      apply: async () => ({ wrote: 1 })
    })
    const result = await builds.start({ ...own, retryActionId: 'known-bad-retry' })
    assert.equal(result.started, false)
    assert.equal(result.code, 'SITE_RECOVERY_POINT_UNAVAILABLE')
    assert.match(result.error, /no verified full backup/)
    assert.equal(paidCalls, 0)
    const row = await briefOf(db.pool, own.siteKey)
    assert.equal(row.state, 'failed')
    assert.equal(row.error, 'previous failure')
    assert.equal(row.timings.woRetryActionId, undefined)
  }
)

test(
  'fresh WO base failure aborts parallel preparation and never becomes ready or applies',
  opts,
  async () => {
    const own = input()
    let started = false,
      aborted = false,
      applied = false
    const builds = frame({
      validateBase: async () => {
        throw refusal()
      },
      prepare: async ({ signal }) => {
        started = true
        return new Promise((resolve) =>
          signal.addEventListener(
            'abort',
            () => {
              aborted = true
              resolve({})
            },
            { once: true }
          )
        )
      },
      apply: async () => {
        applied = true
        return { wrote: 1 }
      }
    })
    assert.equal((await builds.start(own)).started, true)
    await until(() => started)
    assert.equal(
      (await briefOf(db.pool, own.siteKey)).state,
      'preparing',
      'models started while the host was still building'
    )
    await builds.gate(own.siteKey)
    await until(async () => (await briefOf(db.pool, own.siteKey)).state === 'failed')
    assert.equal(aborted, true)
    assert.equal(applied, false)
    const row = await briefOf(db.pool, own.siteKey)
    assert.match(row.error, /SITE_RECOVERY_POINT_UNAVAILABLE/)
  }
)

test(
  'healthy fresh WO keeps base and model preparation parallel and applies after full-baseline validation',
  opts,
  async () => {
    const own = input()
    let started = false,
      validated = false,
      applied = false,
      release
    const builds = frame({
      writesBrand: true,
      validateBase: async () => {
        validated = true
      },
      prepare: async () => {
        started = true
        return new Promise((resolve) => {
          release = () => resolve({})
        })
      },
      apply: async () => {
        assert.equal(validated, true)
        applied = true
        return { wrote: 1 }
      }
    })
    assert.equal((await builds.start(own)).started, true)
    await until(() => started)
    assert.equal(validated, false)
    await builds.gate(own.siteKey)
    await until(() => validated)
    assert.equal(applied, false)
    assert.equal((await briefOf(db.pool, own.siteKey)).state, 'preparing')
    release()
    await until(async () => (await briefOf(db.pool, own.siteKey)).state === 'applied')
    assert.equal(applied, true)
  }
)

test('WO base validation reads host-proved full backup metadata and refuses file-only or unavailable points', async () => {
  const site = { site_key: 'full-base.test', platform: 'joomla' }
  let payload = {
    may: { restoreEverything: true },
    rows: [{ kind: 'backup', version: 1, sha: 'a'.repeat(40), database: { state: 'none' } }]
  }
  const steps = createStepChainSteps({
    pool: { query: async () => ({ rows: [site] }) },
    config: {},
    secret: 's'.repeat(32),
    kitImages: {},
    fetchImpl: async () => Response.json(payload)
  })
  await assert.rejects(() => steps.validateBase(input()), { code: 'SITE_RECOVERY_POINT_UNAVAILABLE' })
  payload.rows[0].database = { state: 'full', sha256: 'b'.repeat(64) }
  const point = await steps.validateBase(input())
  assert.equal(point.database.sha256, 'b'.repeat(64))
  payload = { may: { restoreEverything: false }, rows: payload.rows }
  await assert.rejects(() => steps.validateBase(input()), { code: 'SITE_RECOVERY_POINT_UNAVAILABLE' })
})
