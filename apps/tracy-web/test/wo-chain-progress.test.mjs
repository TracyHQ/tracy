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
    assert.equal((await w.action()).status, 'completed')
  }
)
