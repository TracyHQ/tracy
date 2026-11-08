/**
 * The per-site table of /ops/wo for step chain builds (#481, spec #472). The read (`lib/wo-chain-builds.js`) runs on real
 * Postgres over rows shaped like the run frame leaves them; the door (`ops/wo.js`) is asked with a stand-in pool that
 * only knows who is staff, so what is asserted is what an internal email gets and what anyone else does not.
 *
 *   TEST_DATABASE_URL=… node --test --test-concurrency=1 apps/tracy-web/test/ops-wo-chain-builds.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { listChainBuilds, SLOW_FACTOR } from '../src/lib/wo-chain-builds.js'
import { woOpsRoutes } from '../src/ops/wo.js'
import { fileDb } from './_db.mjs'

const SECRET = 'ops-wo-chain-secret-32-chars-min!'
const ORIGIN = 'https://cowork.tracy.test'
const CONFIG = { origin: ORIGIN, sessionSecret: SECRET, siteDomain: 'tracy.site' }
const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const stepsOf = (minutes, usd) => [
  { step: 'site', minutes: 1.5, usd: 0, outcome: 'done' },
  { step: 'kit', minutes: 0.1, usd: 0, outcome: 'done' },
  { step: 'brand', minutes: 3, usd: usd / 4, outcome: 'done' },
  { step: 'plan', minutes: 6, usd: usd / 4, outcome: 'done' },
  { step: 'write', minutes: minutes - 9.1, usd: usd / 2, outcome: 'done' }
]

/** A brief row the way the run frame leaves it after a chain build. */
async function seedBuild(pool, siteKey, { at, minutes, usd, ending = 'complete', failedStep, label = null }) {
  if (label) {
    await pool.query(
      "insert into site (site_key, label, host, created_at) values ($1, $2, 'local', '2020-01-01')",
      [siteKey, label]
    )
  }
  const chain = {
    ending,
    ...(failedStep ? { failedStep } : {}),
    totalMinutes: minutes,
    totalUsd: usd,
    steps: stepsOf(minutes, usd)
  }
  await pool.query(
    `insert into site_brief (site_key, platform, quickstart, brief, state, timings, created_at)
     values ($1, 'joomla', 'quickstart/ja-boxing/j6', '{}'::jsonb, 'applied', $2::jsonb, $3)`,
    [siteKey, JSON.stringify({ wrote: 3, chain }), at]
  )
}

test('one row per chain build, newest first, with template, start, totals and ending', dbOpts, async () => {
  const { pool } = db
  await seedBuild(pool, 'old.tracy.site', { at: '2026-11-01T10:00:00Z', minutes: 20, usd: 2.4, label: 'old' })
  await seedBuild(pool, 'new.tracy.site', {
    at: '2026-11-05T10:00:00Z',
    minutes: 24,
    usd: 3.1,
    ending: 'soft-failure',
    failedStep: 'plan',
    label: 'new'
  })
  // A brief of the old build never measured a chain, and has no row here.
  await pool.query(
    `insert into site_brief (site_key, platform, quickstart, brief, state) values ('plain.tracy.site', 'joomla', null, '{}', 'applied')`
  )
  const { builds } = await listChainBuilds(pool, CONFIG)
  assert.deepEqual(
    builds.map((b) => b.siteKey),
    ['new.tracy.site', 'old.tracy.site']
  )
  const [first] = builds
  assert.equal(first.label, 'new')
  assert.equal(first.address, 'https://new.tracy.site/')
  assert.equal(first.template, 'ja-boxing/j6')
  assert.equal(first.startedAt, '2026-11-05T10:00:00.000Z')
  assert.deepEqual([first.totalMinutes, first.totalUsd], [24, 3.1])
  assert.deepEqual([first.ending, first.failedStep], ['soft-failure', 'plan'])
  assert.deepEqual(
    first.steps.map((s) => [s.step, s.minutes, s.usd]),
    [
      ['site', 1.5, 0],
      ['kit', 0.1, 0],
      ['brand', 3, 0.775],
      ['plan', 6, 0.775],
      ['write', 14.9, 1.55]
    ]
  )
})

test('a run far above the usual duration is highlighted, and only then', dbOpts, async () => {
  const { pool } = db
  const runs = [10, 12, 11, 13, 10 * SLOW_FACTOR + 15]
  for (const [i, minutes] of runs.entries()) {
    await seedBuild(pool, `s${i}.tracy.site`, {
      at: `2026-11-0${i + 1}T10:00:00Z`,
      minutes,
      usd: 1,
      label: `s${i}`
    })
  }
  const { builds, medianMinutes } = await listChainBuilds(pool, CONFIG)
  assert.equal(medianMinutes, 12)
  assert.deepEqual(
    builds.filter((b) => b.slow).map((b) => b.siteKey),
    ['s4.tracy.site']
  )
})

/** A build whose run left only a snapshot: still going while the row is open, a hard failure once it is not. */
async function seedSnapshot(pool, siteKey, { at, state, running, usd = [0.3] }) {
  const chain = {
    ending: 'running',
    running,
    totalMinutes: 1,
    totalUsd: 0,
    steps: usd.map((u, i) => ({ step: ['kit', 'brand', 'plan'][i], minutes: 1, usd: u, outcome: 'done' }))
  }
  await pool.query(
    `insert into site_brief (site_key, platform, quickstart, brief, state, timings, created_at)
     values ($1, 'joomla', 'quickstart/ja-boxing/j6', '{}'::jsonb, $2, $3::jsonb, $4)`,
    [siteKey, state, JSON.stringify({ chain }), at]
  )
}

test(
  'a running build is a row with its elapsed minutes, current step and spend so far, and is highlighted past the threshold',
  dbOpts,
  async () => {
    const { pool } = db
    for (const [i, minutes] of [10, 12, 11].entries())
      await seedBuild(pool, `d${i}.tracy.site`, { at: `2026-11-0${i + 1}T10:00:00Z`, minutes, usd: 1 })
    await seedSnapshot(pool, 'fresh.tracy.site', {
      at: '2026-11-07T09:50:00Z',
      state: 'applying',
      running: ['write']
    })
    await seedSnapshot(pool, 'stuck.tracy.site', {
      at: '2026-11-07T08:00:00Z',
      state: 'preparing',
      running: ['plan', 'brand']
    })
    const now = () => Date.parse('2026-11-07T10:00:00Z')
    const { builds } = await listChainBuilds(db.pool, CONFIG, { now })
    const by = Object.fromEntries(builds.map((b) => [b.siteKey, b]))
    assert.deepEqual(
      [
        by['fresh.tracy.site'].ending,
        by['fresh.tracy.site'].totalMinutes,
        by['fresh.tracy.site'].runningSteps
      ],
      ['running', 10, ['write']]
    )
    assert.equal(by['fresh.tracy.site'].totalUsd, 0.3)
    assert.equal(by['fresh.tracy.site'].slow, false)
    assert.deepEqual(
      [by['stuck.tracy.site'].ending, by['stuck.tracy.site'].slow, by['stuck.tracy.site'].runningSteps],
      ['running', true, ['plan', 'brand']]
    )
  }
)

test(
  'a snapshot on a row that is no longer open is a hard failure at the step that was under way',
  dbOpts,
  async () => {
    const { pool } = db
    await seedSnapshot(pool, 'dead.tracy.site', {
      at: '2026-11-07T09:00:00Z',
      state: 'failed',
      running: ['pictures']
    })
    await seedSnapshot(pool, 'dead2.tracy.site', { at: '2026-11-07T09:10:00Z', state: 'failed', running: [] })
    const { builds } = await listChainBuilds(pool, CONFIG)
    const by = Object.fromEntries(builds.map((b) => [b.siteKey, [b.ending, b.failedStep, b.runningSteps]]))
    assert.deepEqual(by['dead.tracy.site'], ['failed', 'pictures', []])
    assert.deepEqual(by['dead2.tracy.site'], ['failed', 'write', []])
  }
)

test('with too few builds there is no usual duration, so nothing is highlighted', dbOpts, async () => {
  const { pool } = db
  await seedBuild(pool, 'a.tracy.site', { at: '2026-11-01T10:00:00Z', minutes: 5, usd: 1 })
  await seedBuild(pool, 'b.tracy.site', { at: '2026-11-02T10:00:00Z', minutes: 90, usd: 1 })
  const { builds, slowAfterMinutes } = await listChainBuilds(pool, CONFIG)
  assert.equal(slowAfterMinutes, null)
  assert.ok(builds.every((b) => !b.slow))
})

/** A pool that only knows who is staff and what the read would return. */
function standInPool({ staff }) {
  const asked = []
  return {
    asked,
    async query(sql) {
      const norm = sql.replace(/\s+/g, ' ')
      asked.push(norm)
      if (norm.includes('seat_workspace')) return { rows: staff ? [{ role: 'admit' }] : [] }
      if (norm.includes('from site_brief')) {
        return {
          rows: [
            {
              site_key: 'x.tracy.site',
              quickstart: 'ja-boxing/j6',
              created_at: new Date('2026-11-05T10:00:00Z'),
              chain: { ending: 'complete', totalMinutes: 20, totalUsd: 2, steps: [] },
              label: 'x'
            }
          ]
        }
      }
      return { rows: [] }
    }
  }
}

async function ask(pool, { signedIn = true } = {}) {
  const app = woOpsRoutes({ pool, config: CONFIG, log: { log() {} } })
  const headers = signedIn
    ? { cookie: `${SESSION_COOKIE}=${await mintSession('ops@tracy.test', SECRET)}` }
    : {}
  return app.request('/api/ops/wo/chain-builds', { headers })
}

test('an internal email gets the table', async () => {
  const pool = standInPool({ staff: true })
  const res = await ask(pool)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(
    body.builds.map((b) => [b.siteKey, b.totalMinutes, b.totalUsd]),
    [['x.tracy.site', 20, 2]]
  )
})

test('an email that is not internal gets no table data, and nothing is read for it', async () => {
  const pool = standInPool({ staff: false })
  const res = await ask(pool)
  assert.equal(res.status, 403)
  assert.equal(await res.text(), '')
  assert.ok(!pool.asked.some((q) => q.includes('from site_brief')))
})

test('nobody signed in is sent to sign in, and gets no table data', async () => {
  const pool = standInPool({ staff: true })
  const res = await ask(pool, { signedIn: false })
  assert.notEqual(res.status, 200)
  assert.ok(!pool.asked.some((q) => q.includes('from site_brief')))
})
