/**
 * A step chain run the run frame fails outside the engine (#591): the site never comes up, the setup hold is not proven,
 * the apply times out, the run dies after its write. On every path the row and the kept record agree: the same ending
 * and the same stop, and a record says `complete` only when its last line is a completed Write step. Real Postgres; the
 * steps and the host are scripted doubles.
 *
 *   TEST_DATABASE_URL=… node --test --test-concurrency=1 apps/tracy-web/test/step-chain-frame-endings.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { STEP_CHAIN_WORKFLOW } from '../src/lib/step-chain-switch.js'
import { createBriefBuilds } from '../src/sites/brief-build.js'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { briefOf } from '../src/sites/brief-store.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const SITE = 'harbourpadel.tracy.test'
const REVISION = '6f0b6a52-3c1e-4b8e-9a51-2f7d1c0e9a11'
const input = (over = {}) => ({
  siteKey: SITE,
  accountId: null,
  email: 'owner@example.test',
  label: 'harbourpadel',
  platform: 'joomla',
  quickstart: 'quickstart/ja-boxing/j6',
  contract: { id: 'ja-boxing/j6/1.0.11', dir: 'unused' },
  brief: { about: '', goal: null, style: null, workflow: STEP_CHAIN_WORKFLOW, researchRevisionId: REVISION },
  ...over
})
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** A chain engine over scripted steps; `over` replaces some, and the kept record lands in `kept`. */
function chainWith(over = {}, engineOver = {}) {
  const kept = { chain: null }
  const ok = (value) => async () => ({ value, usd: 0 })
  const steps = {
    kit: ok({ ref: 'ja-boxing/j6/1.0.11' }),
    brand: ok({ file: 'brand-file.json' }),
    plan: ok({ file: 'plan.json' }),
    copy: ok({ file: 'site-copy.json' }),
    pictures: ok({ file: 'mapping.json' }),
    write: async () => ({ value: { report: { status: 'done', counts: { written: 4 } } }, usd: 0 }),
    dispose: async (prepared) => {
      kept.chain = prepared.chain
    },
    ...over
  }
  const engine = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
  return { engine: { ...engine, ...engineOver }, kept }
}

function builds(engine, extra = {}) {
  return createBriefBuilds({
    pool: db.pool,
    engines: { [STEP_CHAIN_WORKFLOW]: engine },
    normalize: async () => ({ name: 'Harbour Padel', languages: [] }),
    log: { info() {}, warn() {}, error() {} },
    sleep: () => wait(1),
    pollMs: 1,
    jobPollMs: 1,
    recoverOnStart: false,
    webroot: { open: async () => ({ held: true }), close: async () => ({ held: true }) },
    ...extra
  })
}

/** Until the row is settled and the record kept, polling the gate (which says the site is up) when `up`. */
async function settled(b, kept, { up = true } = {}) {
  for (let i = 0; i < 1500; i += 1) {
    if (up) await b.gate(SITE)
    const row = await briefOf(db.pool, SITE)
    if (['failed', 'applied'].includes(row?.state) && kept.chain) return row
    await wait(2)
  }
  throw new Error('the run never settled')
}

/** The row's chain and the kept record agree on how the run ended and why. */
function agree(row, kept) {
  const view = (c) => ({ ending: c.ending, failedStep: c.failedStep ?? null, stop: c.stop ?? null })
  assert.deepEqual(view(row.timings.chain), view(kept.chain))
}

test(
  'prepare done, the site never comes up: the row fails and both say stopped, the site not up',
  opts,
  async () => {
    let picturesDone = false
    const { engine, kept } = chainWith({
      pictures: async () => ((picturesDone = true), { value: { file: 'mapping.json' }, usd: 0 })
    })
    const b = builds(engine, {
      hostJob: async () => (picturesDone ? { state: 'failed' } : { state: 'running' })
    })
    await b.start(input({ host: 'local', jobId: 'job-1' }))
    const row = await settled(b, kept, { up: false })
    assert.equal(row.state, 'failed')
    assert.equal(row.timings.chain.ending, 'stopped')
    assert.equal(row.timings.chain.stop.code, 'SITE_NOT_UP')
    assert.ok(!kept.chain.steps.some((s) => s.step === 'write'))
    agree(row, kept)
  }
)

test('the setup hold is not proven: both say stopped with the hold code, nothing written', opts, async () => {
  let wrote = false
  const { engine, kept } = chainWith({
    write: async () => ((wrote = true), { value: { report: { status: 'done' } }, usd: 0 })
  })
  const b = builds(engine, {
    webroot: { open: async () => ({ held: false }), close: async () => ({ held: true }) }
  })
  await b.start(input())
  const row = await settled(b, kept)
  assert.equal(row.state, 'failed')
  assert.equal(wrote, false)
  assert.equal(row.timings.chain.stop.code, 'STEP_CHAIN_SETUP_HOLD_UNPROVEN')
  agree(row, kept)
})

test(
  'the apply times out: both say stopped at the write, and no late snapshot replaces the row',
  opts,
  async () => {
    const { engine, kept } = chainWith(
      {
        write: (_ctx, _inputs, { signal }) =>
          new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
      },
      {}
    )
    const b = builds({ ...engine, limits: { ...engine.limits, applyMs: 40 } })
    await b.start(input())
    const row = await settled(b, kept)
    assert.equal(row.state, 'failed')
    assert.equal(row.timings.chain.ending, 'stopped')
    assert.equal(row.timings.chain.failedStep, 'write')
    agree(row, kept)
    await wait(30)
    agree(await briefOf(db.pool, SITE), kept)
  }
)

test(
  'the run dies after its write: the row fails, and the record is not kept as complete',
  opts,
  async () => {
    const { engine, kept } = chainWith()
    const dying = {
      ...engine,
      apply: async (ctx, prepared) => (
        await engine.apply(ctx, prepared), Promise.reject(new Error('the run died'))
      )
    }
    const b = builds(dying)
    await b.start(input())
    const row = await settled(b, kept)
    assert.equal(row.state, 'failed')
    assert.equal(kept.chain.ending, 'stopped')
    assert.equal(kept.chain.stop.error, 'the run died')
    agree(row, kept)
  }
)

test(
  'the site goes down while a step still runs: the late record and the failed row agree',
  opts,
  async () => {
    let planStarted = false
    const { engine, kept } = chainWith({
      plan: (_ctx, _inputs, { signal }) => {
        planStarted = true
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason))
        )
      }
    })
    const b = builds(engine, { hostJob: async () => ({ state: planStarted ? 'failed' : 'running' }) })
    await b.start(input({ host: 'local', jobId: 'job-1' }))
    const row = await settled(b, kept, { up: false })
    assert.equal(row.state, 'failed')
    for (let i = 0; i < 200 && (await briefOf(db.pool, SITE)).timings.chain?.ending !== 'stopped'; i += 1)
      await wait(2)
    agree(await briefOf(db.pool, SITE), kept)
    assert.equal(kept.chain.failedStep, 'plan')
  }
)

test('a hold that fails to close after a completed write: both say complete', opts, async () => {
  const { engine, kept } = chainWith()
  const b = builds(engine, {
    webroot: { open: async () => ({ held: true }), close: async () => ({ held: false }) }
  })
  await b.start(input())
  const row = await settled(b, kept)
  assert.equal(row.state, 'applied')
  assert.equal(kept.chain.ending, 'complete')
  agree(row, kept)
})
