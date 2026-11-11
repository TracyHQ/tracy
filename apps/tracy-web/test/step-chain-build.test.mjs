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
import { STEP_CHAIN_WORKFLOW } from '../src/lib/step-chain-switch.js'
import { readActivityV2 } from '../src/sites/activity-v2.js'
import { createBriefBuilds } from '../src/sites/brief-build.js'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { briefOf } from '../src/sites/brief-store.js'
import { writeComponent } from '../src/sites/store.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { info() {}, warn() {} }
const instant = () => Promise.resolve()
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

test('a build that did not ask for the chain runs the CMS engine exactly as today', dbOpts, async (t) => {
  const { pool } = db
  for (const [name, over] of [
    ['a typed brief', { siteKey: 'c.tracy.test', brief: { about: 'A padel club', goal: null, style: null } }],
    [
      'another workflow',
      { siteKey: 'd.tracy.test', brief: { about: '', goal: null, style: null, workflow: 'agent-demo/1' } }
    ]
  ]) {
    await t.test(name, async () => {
      const cms = cmsEngine()
      const { steps, log } = fakeSteps()
      const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
      const b = builds(pool, { joomla: cms, [STEP_CHAIN_WORKFLOW]: chain })
      await b.start(chainInput(over))
      await untilSettled(b, over.siteKey)
      assert.deepEqual(cms.calls, { prepare: 1, apply: 1 })
      assert.deepEqual(log, [], 'no chain step ran')
      const row = await briefOf(pool, over.siteKey)
      assert.equal(row.timings.chain, undefined)
    })
  }
})

test(
  'a chain build stays on the chain when the switch is turned off after the press, never falling back to the old build',
  dbOpts,
  async () => {
    const { pool } = db
    const cms = cmsEngine()
    const { steps, log } = fakeSteps()
    const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
    const was = process.env.STEP_CHAIN_ENABLED
    delete process.env.STEP_CHAIN_ENABLED
    try {
      const b = builds(pool, { joomla: cms, [STEP_CHAIN_WORKFLOW]: chain })
      await b.start(chainInput({ siteKey: 'e.tracy.test' }))
      assert.equal((await untilSettled(b, 'e.tracy.test')).state, 'applied')
    } finally {
      if (was !== undefined) process.env.STEP_CHAIN_ENABLED = was
    }
    assert.deepEqual(cms.calls, { prepare: 0, apply: 0 })
    assert.ok(log.includes('write:end'), log.join(' '))
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
  'a planner that made nothing still lets the Write step run, with the brand and no plan or copy, so no demo is left',
  dbOpts,
  async () => {
    const { pool } = db
    let written = null
    const { steps, log } = fakeSteps({
      plan: async () => {
        throw new Error('SITE_PLANNER_DOOR: no model')
      },
      write: async (_ctx, inputs) => {
        written = inputs
        return { value: { report: { status: 'done', counts: { written: 0 } } }, usd: 0 }
      }
    })
    const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
    const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
    await b.start(chainInput())
    const done = await untilSettled(b, 'harbourpadel.tracy.test')
    assert.equal(done.state, 'applied')
    for (const step of ['copy', 'pictures']) assert.ok(!log.includes(`${step}:start`), `${step} had no plan`)
    assert.deepEqual(
      { plan: written.plan, copy: written.copy, pictures: written.pictures, brand: written.brand },
      { plan: null, copy: null, pictures: null, brand: { file: 'brand-file.json' } },
      'the Write step runs with what exists, the stand-ins fill the rest'
    )
    const { chain: record } = (await briefOf(pool, 'harbourpadel.tracy.test')).timings
    assert.equal(record.ending, 'soft-failure')
    assert.equal(record.failedStep, 'plan')
    const outcome = Object.fromEntries(
      record.steps.filter((s) => s.step !== 'site').map((s) => [s.step, s.outcome])
    )
    assert.deepEqual(outcome, {
      kit: 'done',
      brand: 'done',
      plan: 'failed',
      copy: 'skipped',
      pictures: 'skipped',
      write: 'done'
    })
  }
)

test(
  'a writer whose versions the checks all rejected hands over its best one, which the Write step uses',
  dbOpts,
  async () => {
    const { pool } = db
    let written = null
    const { steps } = fakeSteps({
      copy: async () => {
        throw Object.assign(new Error('the copy run ended failed: 3 failures standing'), {
          value: { file: 'site-copy.json' },
          usd: 0.07
        })
      },
      write: async (_ctx, inputs) => {
        written = inputs
        return { value: { report: { status: 'done', counts: { written: 9 } } }, usd: 0 }
      }
    })
    const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
    const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
    await b.start(chainInput())
    await untilSettled(b, 'harbourpadel.tracy.test')
    assert.deepEqual(written.copy, { file: 'site-copy.json' })
    const { chain: record } = (await briefOf(pool, 'harbourpadel.tracy.test')).timings
    assert.equal(record.failedStep, 'copy')
    const copy = record.steps.find((s) => s.step === 'copy')
    assert.deepEqual([copy.outcome, copy.usd], ['failed, best version used', 0.07])
  }
)

test(
  'a template kit that cannot be read hands the base site over as created, ending as a soft failure at the kit',
  dbOpts,
  async () => {
    const { pool } = db
    const { steps, log } = fakeSteps({
      kit: async () => {
        throw new Error('no readable template kit for ja-boxing/j6/9.9.9')
      }
    })
    const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
    const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
    await b.start(chainInput())
    assert.equal((await untilSettled(b, 'harbourpadel.tracy.test')).state, 'applied')
    assert.deepEqual(log, ['kit:start'], 'nothing runs without the kit')
    const { chain: record } = (await briefOf(pool, 'harbourpadel.tracy.test')).timings
    assert.deepEqual([record.ending, record.failedStep], ['soft-failure', 'kit'])
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
  assert.deepEqual(Object.keys(by).sort(), ['brand', 'copy', 'kit', 'pictures', 'plan', 'site', 'write'])
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
  'the base site is a step of its own: minutes from the press until the host had it up, no USD',
  dbOpts,
  async () => {
    const { pool } = db
    const { steps } = fakeSteps()
    const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
    const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
    await b.start(chainInput())
    await untilSettled(b, 'harbourpadel.tracy.test')
    const { chain: record } = (await briefOf(pool, 'harbourpadel.tracy.test')).timings
    const site = record.steps.find((s) => s.step === 'site')
    assert.ok(site, 'the base site has a step')
    assert.equal(site.usd, 0)
    assert.equal(site.outcome, 'done')
    assert.ok(Number.isFinite(site.minutes) && site.minutes >= 0)
  }
)

test('a retried chain base-site duration excludes the previous failed attempt', dbOpts, async () => {
  const { pool } = db
  const input = chainInput({ retryActionId: '1c6d56e2-9650-4ca9-bab7-f52fa86e837c' })
  await pool.query(
    `insert into site_brief (site_key, platform, quickstart, brief, state, created_at)
     values ($1, 'joomla', $2, $3::jsonb, 'failed', now() - interval '2 hours')`,
    [input.siteKey, input.quickstart, JSON.stringify(input.brief)]
  )
  const original = await briefOf(pool, input.siteKey)
  const { steps } = fakeSteps({
    kit: async () => {
      const row = await briefOf(pool, input.siteKey)
      await pool.query('update site_brief set timings = timings || $2::jsonb where site_key=$1', [
        input.siteKey,
        JSON.stringify({ provisionedAt: Number(row.timings.attemptStartedAt) + 60_000 })
      ])
      return { value: { ref: 'ja-boxing/j6/1.0.11' }, usd: 0 }
    }
  })
  const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
  const b = builds(pool, { [STEP_CHAIN_WORKFLOW]: chain })
  assert.equal((await b.start(input)).started, true)
  assert.equal((await untilSettled(b, input.siteKey)).state, 'applied')
  const row = await briefOf(pool, input.siteKey)
  assert.equal(row.timings.chain.steps.find((s) => s.step === 'site').minutes, 1)
  assert.equal(row.created_at.getTime(), original.created_at.getTime())
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

test(
  'while the chain runs the row keeps a snapshot, and a hard failure leaves it at the step that was under way',
  dbOpts,
  async () => {
    const { pool } = db
    let seen = null
    const { steps } = fakeSteps({
      write: async () => {
        seen = (await briefOf(pool, 'harbourpadel.tracy.test')).timings.chain
        throw Object.assign(new Error('x'), { fatal: true })
      }
    })
    const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
    // A hard failure: the engine's apply escapes the frame (a deadline, a crash), which no soft-failure record covers.
    const hard = {
      ...chain,
      apply: async (ctx, prepared) => (
        await chain.apply(ctx, prepared), Promise.reject(new Error('the run died'))
      )
    }
    const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: hard })
    await b.start(chainInput())
    const done = await untilSettled(b, 'harbourpadel.tracy.test')
    assert.equal(done.state, 'failed')
    assert.equal(seen.ending, 'running', 'the write step was under way')
    assert.deepEqual(seen.running, ['write'])
    assert.ok(
      seen.steps.some((st) => st.step === 'brand' && st.usd === 0.1),
      'finished steps and their spend are there'
    )
    const row = (await briefOf(pool, 'harbourpadel.tracy.test')).timings.chain
    assert.equal(row.ending, 'running', 'the last snapshot stays; the reader sees the row failed')
  }
)

test("a chain build past the frame's old 25 minute cut is not cut (#478)", dbOpts, async () => {
  const { pool } = db
  let clock = 0
  const { steps } = fakeSteps({
    plan: async () => ((clock += 40 * 60_000), { value: { file: 'plan.json' }, usd: 0.2 }),
    write: async () => (
      (clock += 20 * 60_000), { value: { report: { status: 'done', counts: { written: 5 } } } }
    )
  })
  const chain = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }), now: () => clock })
  const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
  await b.start(chainInput())
  assert.equal((await untilSettled(b, 'harbourpadel.tracy.test')).state, 'applied')
  const { chain: record } = (await briefOf(pool, 'harbourpadel.tracy.test')).timings
  assert.equal(record.ending, 'complete')
  assert.ok(record.totalMinutes >= 60, String(record.totalMinutes))
})

test(
  'at the 2 hour deadline the steps still running are stopped, the Write step runs and the site is handed over (#478)',
  dbOpts,
  async () => {
    const { pool } = db
    let clock = 0
    let fire = () => {}
    let timerMs = null
    const timer = (f, ms) => {
      fire = f
      timerMs = ms
      return () => {}
    }
    const written = []
    const { steps } = fakeSteps({
      // The pictures step never ends on its own: only the deadline's signal frees it.
      pictures: (_ctx, _inputs, { signal }) =>
        new Promise((_resolve, reject) => {
          clock += 119 * 60_000
          signal.addEventListener('abort', () => {
            clock += 1 * 60_000
            reject(Object.assign(new Error('stopped at the deadline'), { usd: 0.4 }))
          })
          setImmediate(() => fire())
        }),
      write: async (_ctx, inputs, how) => {
        written.push({ ...inputs, limits: how.limits })
        return { value: { report: { status: 'done', counts: { written: 7 } } }, usd: 0.3 }
      }
    })
    const chain = createStepChainEngine({
      steps,
      applyFor: () => async () => ({ ok: true }),
      now: () => clock,
      timer
    })
    const b = builds(pool, { joomla: cmsEngine(), [STEP_CHAIN_WORKFLOW]: chain })
    await b.start(chainInput())
    const done = await untilSettled(b, 'harbourpadel.tracy.test')
    assert.equal(timerMs, 2 * 60 * 60_000)
    assert.equal(done.state, 'applied')
    assert.equal(done.error, null)
    assert.equal(written.length, 1, 'the Write step ran after the deadline')
    assert.equal(written[0].pictures, null, 'the stopped step made nothing')
    assert.deepEqual(written[0].limits, { stopNewWorkMs: 0, returnByMs: 15 * 60_000 }, 'no new 9b work')
    const { chain: record } = (await briefOf(pool, 'harbourpadel.tracy.test')).timings
    assert.deepEqual([record.ending, record.failedStep], ['soft-failure', 'pictures'])
    assert.equal(record.steps.find((s) => s.step === 'pictures').outcome, 'stopped')
    assert.equal(record.steps.find((s) => s.step === 'write').outcome, 'done')
  }
)
