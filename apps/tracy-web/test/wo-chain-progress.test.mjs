// The progress of a step chain demo build as the seller sees it (#516, spec #512): the demo runner marks the demo action
// with the chain's own step identifiers as each step starts, and the list and Details doors carry the steps, the current
// step, the start, the minutes and USD so far, and an estimate measured from past chain builds. Real Postgres, fictional
// places and a stand-in create door; the chain itself is played by writing its measurement onto the brief row the way
// the run frame does (`sites/brief-build.js` `progress`).
//
//   TEST_DATABASE_URL=… node --test --test-concurrency=1 apps/tracy-web/test/wo-chain-progress.test.mjs
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { DEFAULT_WO_OPS_SETTINGS } from 'website-opportunities/src/wo-settings.js'
import { acceptDemoActions } from '../src/opportunities-build/demo-actions.js'
import { createDemoRunner } from '../src/opportunities-build/demo-runner.js'
import { revisionForAction } from '../src/opportunities-build/revisions.js'
import { createWebsiteBuilder } from '../src/opportunities-build/route.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const READY = { version: 'brief-readiness/1', verdict: 'pass', next: 'build', checks: [], ownerQuestions: [] }
const CHAIN = { design: 'ja-boxing', quickstart: 'ja-boxing/j6', cms: 'joomla' }
const SITE = 'harbor-gym.localhost'
const T0 = Date.parse('2026-11-09T10:00:00Z')
let savedSwitch
beforeEach(() => {
  savedSwitch = process.env.STEP_CHAIN_ENABLED
  process.env.STEP_CHAIN_ENABLED = '1'
})
afterEach(() => {
  if (savedSwitch === undefined) delete process.env.STEP_CHAIN_ENABLED
  else process.env.STEP_CHAIN_ENABLED = savedSwitch
})

/** A fictional account, place and create door; the host's job and the chain's brief row move when the test says so. */
async function world() {
  const pool = db.pool
  const account = (
    await pool.query("insert into account(email) values ('builder@test.example') returning id")
  ).rows[0].id
  const opportunity = (
    await pool.query(
      `insert into wo_opportunity(account_id,name,provider,provider_id,candidate)
       values ($1,'Harbor Gym','url','https://harbor-gym.example','{}') returning id`,
      [account]
    )
  ).rows[0].id
  const clock = { at: T0 }
  const host = { job: 'running' }
  const cards = [
    {
      id: CHAIN.design,
      label: 'JA Boxing',
      platforms: [{ platform: CHAIN.cms, tag: CHAIN.quickstart, version: '1.0.10' }]
    }
  ]
  const measured = await websiteOpportunitiesDomain()
  const domain = { ...measured, briefReadinessOf: () => structuredClone(READY) }
  const request = async (path, init = {}) => {
    if (path === '/api/templates') return Response.json({ templates: cards })
    if (path === '/api/sites') {
      const body = JSON.parse(init.body)
      await pool.query(
        `insert into site(site_key,label,platform,host,address,created_at)
         values ($1,'harbor-gym',$2,'local','https://harbor-gym.localhost',$3) on conflict do nothing`,
        [SITE, CHAIN.cms, new Date(clock.at)]
      )
      await pool.query(
        `insert into site_creation(account_id,build_id,payload_hash,state,site_key,job_id)
         values ($1,$2,'hash','provisioning',$3,'job-test') on conflict do nothing`,
        [account, body.buildId, SITE]
      )
      return Response.json({ siteKey: SITE, jobId: 'job-test' }, { status: 201 })
    }
    if (path.includes('/jobs/')) {
      if (host.job === 'done')
        await pool.query("update site_creation set state='done' where job_id='job-test'")
      return Response.json({ state: host.job })
    }
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
  }
  const deps = {
    pool,
    config: { origin: 'http://localhost', siteDomain: 'localhost', sessionSecret: 's'.repeat(32) },
    request,
    loadDomain: async () => domain,
    revisionForAction: (p, args) => revisionForAction(p, { ...args, historical: false }),
    runtime: async () => ({ settings: DEFAULT_WO_OPS_SETTINGS }),
    switchOn: async () => true,
    objects: { get: async () => null },
    now: () => clock.at,
    prepareDemoContact: async () => ({ ok: true }),
    checkDemoGrant: async () => true,
    sessionAhead: async (_site, _email, id) => id,
    log: { warn() {}, error() {}, info() {} }
  }
  const press = () =>
    acceptDemoActions(pool, {
      accountId: account,
      entries: [
        {
          opportunityId: opportunity,
          requestId: 'press-once',
          workflow: 'agent-demo/1',
          chatMode: 'client-send/1',
          selection: { cms: CHAIN.cms, design: CHAIN.design, quickstart: CHAIN.quickstart }
        }
      ],
      requireSelection: true,
      templates: { cards },
      now: () => clock.at
    })
  /** One poll of the runner, `ms` after the last. */
  const tick = async (ms = 11_000) => {
    clock.at += ms
    await pool.query('update wo_demo_action set next_at=$1', [new Date(clock.at - 1)])
    await createDemoRunner(deps).drain()
  }
  /** The chain's measurement as the run frame keeps it on the brief row. */
  const chain = async (state, measurement) => {
    await pool.query(
      `insert into site_brief (site_key, account_id, platform, quickstart, brief, state, timings, created_at, updated_at)
       values ($1, $2, 'joomla', 'quickstart/ja-boxing/j6/1.0.10', '{}'::jsonb, $3, $4::jsonb, $5, $6)
       on conflict (site_key) do update set state = excluded.state, timings = excluded.timings,
         updated_at = excluded.updated_at`,
      [
        SITE,
        account,
        state,
        JSON.stringify({ chain: measurement }),
        new Date(T0 + 30_000),
        new Date(clock.at)
      ]
    )
  }
  const action = async () => (await pool.query('select * from wo_demo_action')).rows[0]
  return { pool, account, opportunity, clock, host, press, tick, chain, action, deps }
}

const done = (step, minutes, usd) => ({ step, minutes, usd, outcome: 'done' })
const running = (running, steps, totalUsd = 0) => ({
  ending: 'running',
  running,
  totalMinutes: 0,
  totalUsd,
  steps
})

test(
  'the runner marks the demo action with the chain step identifiers in order as each step starts',
  opts,
  async () => {
    const w = await world()
    assert.equal((await w.press()).status, 202)
    await w.tick(0)
    const seen = []
    const see = async () => {
      const { step } = await w.action()
      if (seen.at(-1) !== step) seen.push(step)
    }
    await w.chain('preparing', running(['kit'], []))
    await w.tick()
    await see()
    await w.chain('preparing', running(['brand', 'plan'], [done('kit', 0.1, 0)]))
    await w.tick()
    await see()
    await w.chain(
      'preparing',
      running(['brand', 'copy', 'pictures'], [done('kit', 0.1, 0), done('plan', 6, 0.2)])
    )
    await w.tick()
    await see()
    // The base site is up while the chain still writes: the action keeps building, it is not done yet.
    w.host.job = 'done'
    await w.chain(
      'applying',
      running(['write'], [done('kit', 0.1, 0), done('plan', 6, 0.2), done('brand', 3, 0.1)])
    )
    await w.tick()
    await see()
    assert.equal((await w.action()).status, 'queued')
    await w.chain('applied', {
      ending: 'complete',
      totalMinutes: 24,
      totalUsd: 1.6,
      steps: [
        done('site', 2, 0),
        done('kit', 0.1, 0),
        done('brand', 3, 0.1),
        done('plan', 6, 0.2),
        done('write', 9, 0.1)
      ]
    })
    await w.tick()
    await see()
    assert.deepEqual(seen, ['kit', 'plan', 'pictures', 'write'])
    const ended = await w.action()
    assert.equal(ended.status, 'completed', JSON.stringify(ended))
    assert.equal(ended.step, 'write')
    const build = (await w.pool.query('select qa from wo_build')).rows[0]
    assert.equal(build.qa.state, 'passed')
  }
)

test(
  'a chain still writing past the two hour action deadline keeps its action open until it ends',
  opts,
  async () => {
    const w = await world()
    await w.press()
    await w.tick(0)
    w.host.job = 'done'
    await w.chain('applying', running(['write'], [done('kit', 0.1, 0)]))
    await w.tick(2 * 60 * 60_000 + 60_000)
    assert.equal((await w.action()).status, 'queued', 'the chain hands over within its own deadline')
    await w.chain('applied', {
      ending: 'soft-failure',
      failedStep: 'write',
      totalMinutes: 130,
      totalUsd: 2,
      steps: []
    })
    await w.tick()
    assert.equal((await w.action()).status, 'failed')
    assert.equal((await w.action()).error, 'QA_NEEDS_REVIEW')
  }
)

test('a soft-failed model step can hand over when the final write and site check passed', opts, async () => {
  const w = await world()
  await w.press()
  await w.tick(0)
  w.host.job = 'done'
  await w.chain('applied', {
    ending: 'soft-failure',
    failedStep: 'brand',
    steps: [{ step: 'brand', outcome: 'failed' }, done('write', 1, 0)]
  })
  await w.tick()
  assert.equal((await w.action()).status, 'completed')
  const { qa } = (await w.pool.query('select qa from wo_build')).rows[0]
  assert.equal(qa.state, 'passed')
  assert.equal(qa.humanAccepted, false)
})

for (const [label, state, measurement] of [
  ['missing brief', null, null],
  ['failed brief', 'failed', { ending: 'complete', steps: [done('write', 1, 0)] }],
  ['stale running measurement', 'applied', running(['write'], [])],
  ['missing write measurement', 'applied', { ending: 'complete', steps: [] }],
  ...['plan', 'copy', 'pictures'].map((step) => [
    `unresolved ${step} checks`,
    'applied',
    {
      ending: 'soft-failure',
      steps: [
        { step, outcome: 'failed, best version used', code: 'CHAIN_BENCH_CHECK_FAILED' },
        done('write', 1, 0)
      ]
    }
  ]),
  [
    'failed final write',
    'applied',
    { ending: 'soft-failure', steps: [{ step: 'write', outcome: 'failed' }] }
  ],
  ['stopped final write', 'applied', { ending: 'complete', steps: [{ step: 'write', outcome: 'stopped' }] }]
]) {
  test(`a chain with ${label} never passes QA after base provisioning`, opts, async () => {
    const w = await world()
    await w.press()
    await w.tick(0)
    const original = (await w.pool.query('select id, site_key from wo_build')).rows[0]
    w.host.job = 'done'
    if (state) await w.chain(state, measurement)
    await w.tick()
    const action = await w.action()
    assert.equal(action.status, 'failed')
    assert.equal(action.error, 'QA_NEEDS_REVIEW')
    const { qa } = (await w.pool.query('select qa from wo_build')).rows[0]
    assert.equal(qa.state, 'failed')
    assert.equal(qa.humanAccepted, false)
    assert.equal(qa.chain?.briefState, state)
    assert.equal(qa.chain?.writeOutcome, measurement?.steps?.find((s) => s.step === 'write')?.outcome ?? null)
    assert.equal(qa.chain?.ending, measurement?.ending ?? null)
    const retained = (await w.pool.query('select id, site_key from wo_build')).rows[0]
    assert.deepEqual(retained, original, 'the failed attempt keeps its build and site for Retry')
    if (measurement) {
      const brief = (await w.pool.query('select timings from site_brief where site_key=$1', [SITE])).rows[0]
      assert.deepEqual(brief.timings.chain, measurement, 'the original findings remain on the chain')
    }
  })
}

/** A chain build of another place that already ended, as the run frame leaves its brief row. */
async function past(
  pool,
  n,
  { quickstart = 'quickstart/ja-boxing/j6/1.0.10', minutes, usd, ending = 'complete' }
) {
  await pool.query(
    `insert into site_brief (site_key, platform, quickstart, brief, state, timings, created_at)
     values ($1, 'joomla', $2, '{}'::jsonb, 'applied', $3::jsonb, $4)`,
    [
      `past-${n}.localhost`,
      quickstart,
      JSON.stringify({ chain: { ending, totalMinutes: minutes, totalUsd: usd, steps: [] } }),
      new Date(T0 - (n + 1) * 86_400_000)
    ]
  )
}

/** What the list and the Details doors say of the place's current build. */
async function runOf(w) {
  const builder = createWebsiteBuilder({
    config: w.deps.config,
    pool: w.pool,
    loadDomain: w.deps.loadDomain,
    now: () => w.clock.at
  })
  const listed = (await builder.listedDemoOf(w.account, [w.opportunity])).get(w.opportunity).demoAction.run
  const opp = (await w.pool.query('select * from wo_opportunity')).rows[0]
  const detail = (await builder.detailOf(opp, w.account)).demoAction.run
  assert.deepEqual(detail, listed, 'Details and the list say the same of one build')
  return listed
}

const IDS = ['kit', 'brand', 'plan', 'copy', 'pictures', 'write']

test('the doors carry the steps, the current step, the start, the minutes and USD so far', opts, async () => {
  const w = await world()
  await w.press()
  // Pressed, nothing started yet: the steps are all upcoming and nothing is spent.
  const pressed = await runOf(w)
  assert.deepEqual(
    pressed.steps.map((s) => [s.id, s.state]),
    IDS.map((id) => [id, 'upcoming'])
  )
  assert.equal(pressed.current, null)
  assert.equal(pressed.usd, 0)
  assert.equal(pressed.steps[3].label, 'Page texts')
  await w.tick(0)
  await w.chain(
    'preparing',
    running(['brand', 'copy', 'pictures'], [done('kit', 0.1, 0), done('plan', 6, 0.25)])
  )
  await w.tick()
  w.clock.at = T0 + 30_000 + 12 * 60_000
  const run = await runOf(w)
  assert.deepEqual(
    run.steps.map((s) => [s.id, s.state]),
    [
      ['kit', 'done'],
      ['brand', 'current'],
      ['plan', 'done'],
      ['copy', 'current'],
      ['pictures', 'current'],
      ['write', 'upcoming']
    ]
  )
  assert.equal(run.current, 'pictures')
  assert.deepEqual(
    run.steps.map((s) => s.minutes),
    [0.1, null, 6, null, null, null],
    'a done step says how long it took'
  )
  assert.equal(run.startedAt, new Date(T0 + 30_000).toISOString())
  assert.equal(run.minutes, 12)
  assert.equal(run.usd, 0.25)
  assert.equal(run.estimate, null, 'no chain build has ended yet: nothing to estimate from')
})

test('the estimate is the median of ended chain builds of the same template', opts, async () => {
  const w = await world()
  await past(w.pool, 1, { minutes: 10, usd: 1 })
  await past(w.pool, 2, { minutes: 20, usd: 1.5 })
  await past(w.pool, 3, { minutes: 60, usd: 4 })
  // Other templates, a soft failure and a run that never finished say nothing about this template.
  for (const n of [4, 5, 6])
    await past(w.pool, n, { quickstart: 'quickstart/ja-other/j6/1.0.0', minutes: 100, usd: 9 })
  await past(w.pool, 7, { minutes: 1, usd: 0.1, ending: 'soft-failure' })
  await w.press()
  assert.deepEqual((await runOf(w)).estimate, { minutes: 20, usd: 1.5 })
})

test(
  'with fewer than three builds of the template the estimate is the median of every template',
  opts,
  async () => {
    const w = await world()
    await past(w.pool, 1, { minutes: 20, usd: 1 })
    await past(w.pool, 2, { minutes: 30, usd: 2 })
    await past(w.pool, 3, { quickstart: 'quickstart/ja-other/j6/1.0.0', minutes: 40, usd: 3 })
    await w.press()
    assert.deepEqual((await runOf(w)).estimate, { minutes: 30, usd: 2 })
  }
)

test(
  'the Build form offers each chain template its estimate, or null when none was measured',
  opts,
  async () => {
    const w = await world()
    const builder = createWebsiteBuilder({
      config: w.deps.config,
      pool: w.pool,
      request: w.deps.request,
      now: () => w.clock.at
    })
    const offered = async () =>
      (await builder.templateChoicesOf(DEFAULT_WO_OPS_SETTINGS)).joomla.templates.find(
        (t) => t.quickstart === CHAIN.quickstart
      )
    assert.equal((await offered()).estimate, null)
    await past(w.pool, 1, { minutes: 26, usd: 1.84 })
    assert.deepEqual((await offered()).estimate, { minutes: 26, usd: 1.84 })
  }
)
