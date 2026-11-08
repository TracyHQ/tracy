/**
 * The step chain as one build (#483, spec #472): the brief-build run frame with the step chain engine, picked for a build
 * whose quickstart template is allow-listed while the master switch is on. Real Postgres; the model steps, the write step
 * and its site check are doubles at the edge, so what is asserted is what an operator or owner would see: which engine
 * ran, in which order the steps could start, which run the writes were recorded under, and how the run ended.
 *
 *   TEST_DATABASE_URL=… node --test --test-concurrency=1 apps/tracy-web/test/step-chain-build.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { readActivityV2 } from '../src/sites/activity-v2.js'
import { createBriefBuilds } from '../src/sites/brief-build.js'
import { writeComponent } from '../src/sites/store.js'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { briefOf } from '../src/sites/brief-store.js'
import { STEP_CHAIN_WORKFLOW } from '../src/lib/step-chain-switch.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { info() {}, warn() {} }
const instant = () => Promise.resolve()
const ON = { STEP_CHAIN_ENABLED: '1' }
const REVISION = '6f0b6a52-3c1e-4b8e-9a51-2f7d1c0e9a11'

const chainInput = (over = {}) => ({
  siteKey: 'harbourpadel.tracy.test',
  accountId: null,
  email: 'owner@example.test',
  label: 'harbourpadel',
  platform: 'joomla',
  quickstart: 'quickstart/ja-boxing/j6',
  contract: { id: 'ja-boxing/j6/1.0.11', dir: 'unused' },
  brief: { about: '', goal: null, style: null, workflow: STEP_CHAIN_WORKFLOW, researchRevisionId: REVISION },
  ...over
})

/** A CMS engine double: it must not run for a chain build. */
function cmsEngine() {
  const calls = { prepare: 0, apply: 0 }
  return {
    calls,
    prepare: async () => {
      calls.prepare += 1
      return {}
    },
    apply: async () => {
      calls.apply += 1
      return { wrote: 1, kept: 0 }
    }
  }
}

/** Step doubles that answer at once, each with a cost; `over` replaces one. Every start and end is logged. */
function fakeSteps(over = {}) {
  const log = []
  const step =
    (name, value, usd) =>
    async (...args) => {
      log.push(`${name}:start`)
      const answer = over[name] ? await over[name](...args) : { value, usd }
      log.push(`${name}:end`)
      return answer
    }
  return {
    log,
    steps: {
      kit: step('kit', { ref: 'ja-boxing/j6/1.0.11' }, 0),
      brand: step('brand', { file: 'brand-file.json' }, 0.1),
      plan: step('plan', { file: 'plan.json' }, 0.2),
      copy: step('copy', { file: 'site-copy.json' }, 0.05),
      pictures: step('pictures', { file: 'mapping.json' }, 1.5),
      write: step('write', { report: { status: 'done', counts: { written: 40, hidden: 3 } } }, 0.3)
    }
  }
}

function builds(pool, engines, extra = {}) {
  return createBriefBuilds({
    pool,
    engines,
    normalize: async () => ({ name: 'Harbour Padel', languages: [] }),
    log: quiet,
    sleep: instant,
    pollMs: 1,
    recoverOnStart: false,
    env: ON,
    ...extra
  })
}

/** Poll `gate` the way the poll door does, until the customer is no longer held. */
async function untilSettled(b, siteKey, tries = 500) {
  for (let i = 0; i < tries; i += 1) {
    const g = await b.gate(siteKey)
    if (!g.open) return g
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error('still held')
}

test(
  'an allow-listed template with the switch on runs the step chain, not the CMS engine',
  dbOpts,
  async () => {
    const { pool } = db
    const cms = cmsEngine()
    const { steps, log } = fakeSteps()
    const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
    const b = builds(pool, { joomla: cms, [STEP_CHAIN_WORKFLOW]: chain })
    assert.deepEqual(await b.start(chainInput()), { started: true })
    const done = await untilSettled(b, 'harbourpadel.tracy.test')
    assert.equal(done.state, 'applied')
    assert.deepEqual(cms.calls, { prepare: 0, apply: 0 })
    assert.ok(log.includes('write:end'), log.join(' '))
    const row = await briefOf(pool, 'harbourpadel.tracy.test')
    assert.equal(row.timings.chain.ending, 'complete')
  }
)

test(
  'a template not on the list, or the switch off, runs the CMS engine exactly as today',
  dbOpts,
  async (t) => {
    const { pool } = db
    for (const [name, over, env] of [
      ['not listed', { quickstart: 'quickstart/ja-diner/j6', siteKey: 'a.tracy.test' }, ON],
      ['switch off', { siteKey: 'b.tracy.test' }, {}],
      [
        'a typed brief',
        { siteKey: 'c.tracy.test', brief: { about: 'A padel club', goal: null, style: null } },
        ON
      ]
    ]) {
      await t.test(name, async () => {
        const cms = cmsEngine()
        const { steps, log } = fakeSteps()
        const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
        const b = builds(pool, { joomla: cms, [STEP_CHAIN_WORKFLOW]: chain }, { env })
        await b.start(chainInput(over))
        await untilSettled(b, over.siteKey)
        assert.deepEqual(cms.calls, { prepare: 1, apply: 1 })
        assert.deepEqual(log, [], 'no chain step ran')
        const row = await briefOf(pool, over.siteKey)
        assert.equal(row.timings.chain, undefined)
      })
    }
  }
)

/** A promise to release by hand. */
function gateOf() {
  let open
  const promise = new Promise((resolve) => {
    open = resolve
  })
  return { promise, open }
}
const until = async (cond, tries = 500) => {
  for (let i = 0; i < tries && !cond(); i += 1) await new Promise((r) => setTimeout(r, 2))
  assert.ok(cond(), 'never happened')
}

test(
  'the kit comes first; base site, brand and planner run together; the Write step waits for the site and every input',
  dbOpts,
  async () => {
    const { pool } = db
    const brandGate = gateOf()
    const planGate = gateOf()
    const picturesGate = gateOf()
    const { steps, log } = fakeSteps({
      brand: async () => (await brandGate.promise, { value: { file: 'brand-file.json' }, usd: 0.1 }),
      plan: async () => (await planGate.promise, { value: { file: 'plan.json' }, usd: 0.2 }),
      pictures: async () => (await picturesGate.promise, { value: { file: 'mapping.json' }, usd: 1.5 })
    })
    const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
    const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
    await b.start(chainInput())
    const key = 'harbourpadel.tracy.test'
    // The host is still creating the base site (no gate yet): the kit is done, brand and planner both started.
    await until(() => log.includes('brand:start') && log.includes('plan:start'))
    assert.deepEqual(log.slice(0, 2), ['kit:start', 'kit:end'])
    assert.ok(!log.includes('copy:start'), 'the copy waits for the plan')
    planGate.open()
    await until(() => log.includes('copy:end') && log.includes('pictures:start'))
    // The site is up, the copy is done, the brand and the pictures are not: nothing is written yet.
    assert.equal((await b.gate(key)).open, true)
    await new Promise((r) => setTimeout(r, 30))
    assert.ok(!log.includes('write:start'), log.join(' '))
    brandGate.open()
    await new Promise((r) => setTimeout(r, 30))
    assert.ok(!log.includes('write:start'), 'still waiting for the pictures')
    picturesGate.open()
    const done = await untilSettled(b, key)
    assert.equal(done.state, 'applied')
    assert.equal(log.at(-1), 'write:end')
    assert.ok(log.indexOf('write:start') > log.indexOf('pictures:end'))
  }
)

test('a Write step on a site that is not up yet waits for the base site', dbOpts, async () => {
  const { pool } = db
  const { steps, log } = fakeSteps()
  const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
  const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
  await b.start(chainInput())
  await until(() => log.includes('pictures:end') && log.includes('brand:end'))
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(!log.includes('write:start'), 'every input is ready, the base site is not')
  await untilSettled(b, 'harbourpadel.tracy.test')
  assert.equal(log.at(-1), 'write:end')
})

test(
  'every Write step write carries the run id, and Site changes shows exactly one Tracy setup row for the build',
  dbOpts,
  async () => {
    const { pool } = db
    const SITE = 'harbourpadel.localhost'
    const config = readConfig({
      TRACY_ORIGIN: 'http://tracy.test:8080',
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: 's'.repeat(32),
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://tracy-host.test',
      HOST_local_DSH_ORIGIN: 'http://dsh.test',
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k'
    })
    // The site's Claude Cowork plugin, faked at the network edge: every write is taken.
    const fetchImpl = async () =>
      new Response(JSON.stringify({ ok: true, kind: 'post', id: 7 }), { status: 200 })
    const app = /** @type {any} */ (
      buildApp({ config, pool, mail: { send: async () => {} }, host: { hostCall, hostJob }, fetchImpl })
    )
    await pool.query(
      `insert into site (site_key, label, host, platform) values ($1, 'harbourpadel', 'local', 'joomla')`,
      [SITE]
    )
    const { rows } = await pool.query(
      `insert into account (email) values ('owner@example.test') returning id`
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'owner', $2, now())`,
      [SITE, rows[0].id]
    )
    await writeComponent(
      pool,
      SITE,
      { endpoint: 'https://harbourpadel.example/cowork', token: 'z'.repeat(20) },
      'owner@example.test'
    )
    const { steps } = fakeSteps({
      // Step 9 writes through the one door it is handed: three writes of the build.
      write: async (_ctx, _inputs, { door }) => {
        for (const id of [7, 8, 9]) {
          const answer = await door.apply({
            siteKey: SITE,
            action: 'content.update',
            params: { kind: 'post', id, fields: { post_title: `Court ${id}` }, apply_id: `w-${id}` }
          })
          assert.notEqual(answer.ok, false, JSON.stringify(answer))
        }
        return { value: { report: { status: 'done', counts: { written: 3 } } }, usd: 0 }
      }
    })
    const applyFor = (email, setupRun) => (call) => app.applyAs(email, call, { setupRun })
    const chain = createStepChainEngine({ steps, applyFor })
    const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
    await b.start(chainInput({ siteKey: SITE }))
    assert.equal((await untilSettled(b, SITE)).state, 'applied')
    const { rows: writes } = await pool.query(
      'select origin, origin_ref from site_write where site_key = $1',
      [SITE]
    )
    assert.equal(writes.length, 3)
    const runs = new Set(writes.map((w) => `${w.origin}:${w.origin_ref}`))
    assert.equal(runs.size, 1, 'one run')
    assert.match([...runs][0], /^setup:[0-9a-f-]{36}$/)
    const runJob = async () => ({
      ok: true,
      output: JSON.stringify({ ok: true, head: 'f'.repeat(40), rows: [] })
    })
    const page = await readActivityV2(
      pool,
      { site_key: SITE, label: 'harbourpadel', host: 'local', platform: 'joomla' },
      { runJob }
    )
    assert.deepEqual(
      page.items.map((i) => i.origin.source),
      ['setup'],
      JSON.stringify(page.items.map((i) => i.id))
    )
    assert.equal(page.items[0].evidence.setupRun, [...runs][0].slice('setup:'.length))
  }
)

test(
  'a failing picture step still writes the plan, copy and brand, and the run ends as a soft failure',
  dbOpts,
  async () => {
    const { pool } = db
    let handed = null
    const { steps, log } = fakeSteps({
      pictures: async () => {
        throw new Error('SITE_PICTURES_DOOR: the looker answered nothing')
      },
      write: async (_ctx, inputs) => {
        handed = inputs
        return { value: { report: { status: 'done', counts: { written: 30 } } }, usd: 0 }
      }
    })
    const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
    const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
    await b.start(chainInput())
    const done = await untilSettled(b, 'harbourpadel.tracy.test')
    assert.equal(done.state, 'applied', 'handed over as a normal finished build')
    assert.equal(done.error, null, 'nothing is said to the operator or the owner')
    assert.ok(log.includes('write:end'))
    // No picture file: the Write step's closing ladder empties every kept picture slot instead of leaving the demo's.
    assert.equal(handed.pictures, null)
    assert.deepEqual(handed.plan, { file: 'plan.json' })
    assert.deepEqual(handed.brand, { file: 'brand-file.json' })
    const { chain: record } = (await briefOf(pool, 'harbourpadel.tracy.test')).timings
    assert.equal(record.ending, 'soft-failure')
    assert.equal(record.failedStep, 'pictures')
    assert.match(record.steps.find((s) => s.step === 'pictures').error, /looker answered nothing/)
  }
)

test(
  'a failing planner stops the brand, runs nothing after it, and hands the site over as created',
  dbOpts,
  async () => {
    const { pool } = db
    const brandGate = gateOf()
    let brandSignal = null
    const { steps, log } = fakeSteps({
      plan: async () => {
        throw new Error('SITE_PLANNER_DOOR: no model')
      },
      brand: async (_ctx, _inputs, { signal }) => {
        brandSignal = signal
        await Promise.race([
          brandGate.promise,
          new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
        ])
        return { value: {}, usd: 0 }
      }
    })
    const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
    const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
    await b.start(chainInput())
    const done = await untilSettled(b, 'harbourpadel.tracy.test')
    assert.equal(done.state, 'applied')
    assert.equal(brandSignal.aborted, true, 'the brand step is told to stop')
    for (const step of ['copy', 'pictures', 'write'])
      assert.ok(!log.includes(`${step}:start`), `${step} never ran`)
    const { chain: record } = (await briefOf(pool, 'harbourpadel.tracy.test')).timings
    assert.equal(record.ending, 'soft-failure')
    assert.equal(record.failedStep, 'plan')
    assert.equal(record.steps.find((s) => s.step === 'brand').outcome, 'stopped')
  }
)

test(
  'a Write step that stops or throws still hands the site over, ending as a soft failure at the write',
  dbOpts,
  async () => {
    const { pool } = db
    for (const [siteKey, write] of [
      [
        'stop.tracy.test',
        async () => ({
          value: {
            report: { status: 'stopped', cause: { code: 'CONTRACT_MISMATCH', reason: 'another contract' } }
          }
        })
      ],
      [
        'throw.tracy.test',
        async () => {
          throw new Error('the site door threw')
        }
      ]
    ]) {
      const { steps } = fakeSteps({ write })
      const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
      const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
      await b.start(chainInput({ siteKey }))
      assert.equal((await untilSettled(b, siteKey)).state, 'applied')
      const { chain: record } = (await briefOf(pool, siteKey)).timings
      assert.equal(record.failedStep, 'write', siteKey)
    }
  }
)

test('the row keeps minutes and USD per step, the totals and the ending', dbOpts, async () => {
  const { pool } = db
  let clock = 0
  const tick = (ms) => (clock += ms)
  const { steps } = fakeSteps({
    plan: async () => (tick(12 * 60_000), { value: {}, usd: 0.25 }),
    pictures: async () => (tick(6 * 60_000), { value: {}, usd: 1.5 }),
    write: async () => (
      tick(9 * 60_000), { value: { report: { status: 'done', counts: { written: 5 } } }, usd: 0.3 }
    )
  })
  const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }), now: () => clock })
  const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
  await b.start(chainInput())
  await untilSettled(b, 'harbourpadel.tracy.test')
  const { chain: record } = (await briefOf(pool, 'harbourpadel.tracy.test')).timings
  assert.equal(record.ending, 'complete')
  const by = Object.fromEntries(record.steps.map((s) => [s.step, [s.minutes, s.usd]]))
  // Steps running side by side share the clock, so only the steps that moved it are compared by their minutes.
  assert.deepEqual(Object.keys(by).sort(), ['brand', 'copy', 'kit', 'pictures', 'plan', 'write'])
  assert.deepEqual(
    [by.plan, by.pictures, by.write],
    [
      [12, 0.25],
      [6, 1.5],
      [9, 0.3]
    ]
  )
  assert.deepEqual([by.kit[1], by.brand[1], by.copy[1]], [0, 0.1, 0.05])
  assert.equal(record.totalMinutes, 27)
  assert.equal(record.totalUsd, 2.2)
})

test(
  'the customer is told "working" until the chain has handed the site over, a soft failure included',
  dbOpts,
  async () => {
    const { pool } = db
    for (const [siteKey, failing] of [
      ['held.tracy.test', null],
      ['held-soft.tracy.test', 'pictures']
    ]) {
      let release
      const writing = new Promise((resolve) => {
        release = resolve
      })
      let entered
      const inWrite = new Promise((resolve) => {
        entered = resolve
      })
      const { steps } = fakeSteps({
        ...(failing
          ? {
              [failing]: async () => {
                throw new Error('no pictures')
              }
            }
          : {}),
        write: async () => {
          entered()
          await writing
          return { value: { report: { status: 'done', counts: { written: 1 } } }, usd: 0 }
        }
      })
      const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
      const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
      await b.start(chainInput({ siteKey }))
      assert.equal((await b.gate(siteKey)).open, true, 'held while the steps run')
      await inWrite
      assert.equal((await b.gate(siteKey)).open, true, 'held while the Write step runs')
      release()
      const done = await untilSettled(b, siteKey)
      assert.equal(done.state, 'applied')
      assert.equal(done.error, null)
      assert.equal((await briefOf(pool, siteKey)).timings.chain.ending, failing ? 'soft-failure' : 'complete')
    }
  }
)
