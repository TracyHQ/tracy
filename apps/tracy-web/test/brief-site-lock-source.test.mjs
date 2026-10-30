/**
 * The rebuilding lock taken AT THE SOURCE (#189, criterion 12.1): a brief build's press asks the host to restore the site
 * already offline (`sourceLock` → the provision instruction's `siteLock`), and its brief row says locked from the start,
 * with the key the host wrote, so Tracy's readers see the real site and the end of a full build lifts it. A site so
 * locked is never left locked with nobody to lift it: a door that cannot lock it again keeps the source lock (failed
 * write) or lifts it (plugin without the lock). Only a brief build's press is locked; a normal create stays online.
 * Fictional businesses of two trades; the door is a double, the rows are real where a database is set.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { fileDb } from './_db.mjs'
import {
  createSiteLock,
  NEUTRAL_SITE_NAME,
  PREVIEW_KEY_SHAPE,
  REBUILDING_MESSAGE,
  sourceLock
} from '../src/sites/site-lock.js'
import { joomlaSiteLock } from '../src/sites/brief-engines/site-lock-joomla.js'
import { briefBuildPress } from '../src/opportunities-build/build-site-lock.js'
import { BRIEF_BUILD } from '../src/opportunities-build/brief-build-path.js'
import { insertBuild } from '../src/opportunities-build/build-store.js'
import { createBriefBuilds } from '../src/sites/brief-build.js'
import { briefOf } from '../src/sites/brief-store.js'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const LOCK = {
  version: 1,
  fields: ['offline', 'offline_message', 'display_offline_message'],
  bypass: 'authorization-bearer',
  bypass_also: ['preview-key']
}

/** A door double: `info` answers `info`, a `site.identity` write answers `set`. */
function door(info, set = { ok: true }) {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    return call.action === 'info' ? info : set
  }
  return { calls, apply }
}

/** A pool double holding one site_brief row's `timings.siteLock`. */
function lockPool(initial) {
  const state = { lock: initial }
  return {
    state,
    async query(sql, params) {
      if (/^\s*select b\.timings->'siteLock'/.test(sql))
        return { rows: state.lock ? [{ lock: state.lock }] : [] }
      if (/update site_brief set timings/.test(sql)) {
        state.lock = JSON.parse(params[1])
        return { rows: [] }
      }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
}

const lockOf = (pool, apply) =>
  createSiteLock({
    pool,
    writers: { joomla: joomlaSiteLock },
    applyFor: () => apply,
    holds: async () => true,
    tokenOf: async () => 'site-token'
  })

const TRADES = [
  {
    trade: 'bakery',
    name: 'Crumb and Crust Bakery',
    siteKey: 'crumb-crust.tracy.test',
    label: 'crumb-crust'
  },
  { trade: 'tailor', name: 'Needle Point Tailors', siteKey: 'needle-point.tracy.test', label: 'needle-point' }
]

test('the rebuilding page is titled with the business name, else a neutral title', () => {
  assert.equal(
    sourceLock({ platform: 'joomla', siteName: '  Anna  Tailoring ' }).host.siteName,
    'Anna Tailoring'
  )
  assert.equal(sourceLock({ platform: 'joomla' }).host.siteName, NEUTRAL_SITE_NAME)
  assert.equal(sourceLock({ platform: 'joomla', siteName: '   ' }).host.siteName, NEUTRAL_SITE_NAME)
})

test('a Joomla site is locked at the source with a fresh key and the approved message; other CMS not yet', () => {
  const a = sourceLock({ platform: 'joomla', now: () => 1000 })
  const b = sourceLock({ platform: 'joomla' })
  assert.match(a.host.previewKey, PREVIEW_KEY_SHAPE)
  assert.notEqual(a.host.previewKey, b.host.previewKey)
  assert.equal(a.host.message, REBUILDING_MESSAGE)
  assert.deepEqual(a.record, {
    version: 1,
    state: 'locked',
    source: 'provision',
    previewKey: a.host.previewKey,
    previewKeyAt: 1000,
    platform: 'joomla'
  })
  assert.equal(sourceLock({ platform: 'wordpress' }), null)
  assert.equal(sourceLock({ platform: 'emdash' }), null)
})

for (const { trade, siteKey } of TRADES) {
  test(`${trade}: a source-locked site is read with its key and unlocked at the end of a full build`, async () => {
    const { record } = sourceLock({ platform: 'joomla' })
    const pool = lockPool(record)
    const { calls, apply } = door({ ok: true, info: { site_offline: LOCK } })
    const lock = lockOf(pool, apply)
    assert.equal(
      await lock.previewKey(siteKey),
      record.previewKey,
      'Tracy reads the locked site from the start'
    )
    assert.equal(await lock.bearer(siteKey), 'site-token')
    const ctx = { siteKey, platform: 'joomla', email: 'owner@example.test', runId: 'run-1' }
    assert.deepEqual(await lock.unlock(ctx), { version: 1, state: 'unlocked' })
    assert.deepEqual(calls.at(-1).params.fields, { offline: 0 })
    assert.equal(pool.state.lock.state, 'unlocked')
    assert.equal(pool.state.lock.previewKey, undefined)
  })

  test(`${trade}: a door that refuses the lock again keeps the source lock, so the end still lifts it`, async () => {
    const { record } = sourceLock({ platform: 'joomla' })
    const pool = lockPool(record)
    const { apply } = door({ ok: true, info: { site_offline: LOCK } }, { ok: false, error: 'busy' })
    const got = await lockOf(pool, apply).lock({
      siteKey,
      platform: 'joomla',
      email: 'o@example.test',
      runId: 'r2'
    })
    assert.equal(got.state, 'locked')
    assert.equal(got.previewKey, record.previewKey)
    assert.equal(got.reason, 'busy')
  })

  test(`${trade}: a plugin that offers no lock has the source lock lifted at once`, async () => {
    const { record } = sourceLock({ platform: 'joomla' })
    const pool = lockPool(record)
    const { calls, apply } = door({ ok: true, info: {} })
    const got = await lockOf(pool, apply).lock({
      siteKey,
      platform: 'joomla',
      email: 'o@example.test',
      runId: 'r3'
    })
    assert.equal(got.state, 'unsupported')
    const set = calls.find((c) => c.action === 'site.identity')
    assert.deepEqual(set.params.fields, { offline: 0 })
  })

  test(`${trade}: a site the door never locked is not unlocked by a refused lock`, async () => {
    const pool = lockPool(null)
    const { calls, apply } = door({ ok: true, info: {} })
    const got = await lockOf(pool, apply).lock({
      siteKey,
      platform: 'joomla',
      email: 'o@example.test',
      runId: 'r4'
    })
    assert.equal(got.state, 'unsupported')
    assert.equal(
      calls.some((c) => c.action === 'site.identity'),
      false
    )
  })
}

/** An account's template-free brief revision, and one build of `workflow` pressed from it (not yet on a site). */
async function pressOf(pool, name, workflow) {
  const account = (
    await pool.query('insert into account (email) values ($1) returning id', [`${name.length}x@example.test`])
  ).rows[0].id
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id) values ($1, $2, 'osm', $3) returning id`,
      [account, name, `n/${name}`]
    )
  ).rows[0].id
  const rev = (
    await pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md) values ($1, $2, 1, $3::jsonb, $4) returning id`,
      [opp, account, JSON.stringify({ business: { name }, acceptance: [] }), name]
    )
  ).rows[0].id
  const buildId = crypto.randomUUID()
  const choice = {
    cms: 'joomla',
    cmsSource: 'default',
    template: { platform: 'joomla', quickstart: 'fixture', design: 'fixture', version: '1' },
    ...(workflow ? { quickstartWorkflow: workflow } : {})
  }
  await insertBuild(pool, { accountId: account, revisionId: rev, requestId: `req-${name}`, buildId, choice })
  return { account, buildId }
}

for (const { name } of TRADES) {
  test(`${name}: only a brief build's own press is locked at the source`, opts, async () => {
    const brief = await pressOf(db.pool, name, BRIEF_BUILD)
    assert.equal(await briefBuildPress(db.pool, brief.account, brief.buildId), true)
    const other = await pressOf(db.pool, `${name} Annex`, 'quickstart-first/1')
    assert.equal(await briefBuildPress(db.pool, other.account, other.buildId), false, 'another workflow')
    assert.equal(await briefBuildPress(db.pool, other.account, brief.buildId), false, 'another account')
    assert.equal(await briefBuildPress(db.pool, brief.account, null), false, 'a press with no build')
  })
}

const builds = () =>
  createBriefBuilds({
    pool: db.pool,
    engines: { joomla: { prepare: async () => ({ values: 1 }), apply: async () => ({ wrote: 1, kept: 0 }) } },
    normalize: async () => ({ name: 'Studio', languages: ['en'] }),
    log: { info() {}, warn() {} },
    sleep: () => new Promise((resolve) => setTimeout(resolve, 1)),
    pollMs: 1,
    recoverOnStart: false
  })

const input = (siteKey, label, trade, more = {}) => ({
  siteKey,
  accountId: null,
  email: 'owner@example.test',
  label,
  platform: 'joomla',
  quickstart: 'fixture/j6',
  brief: { about: `A fictional ${trade}.` },
  ...more
})

for (const { trade, siteKey, label } of TRADES) {
  test(
    `${trade}: the brief row of a source-locked site says locked, with its key, from the start`,
    opts,
    async () => {
      const { record } = sourceLock({ platform: 'joomla' })
      const b = builds()
      assert.deepEqual(await b.start(input(siteKey, label, trade, { siteLock: record })), { started: true })
      const row = await briefOf(db.pool, siteKey)
      assert.equal(row.timings.siteLock.state, 'locked')
      assert.equal(row.timings.siteLock.previewKey, record.previewKey)
      await b.gate(siteKey)
      await b.idle()
    }
  )

  test(`${trade}: a create with no source lock leaves the row with no lock`, opts, async () => {
    const b = builds()
    await b.start(input(siteKey, label, trade))
    const row = await briefOf(db.pool, siteKey)
    assert.equal(row.timings.siteLock, undefined)
    await b.gate(siteKey)
    await b.idle()
  })
}
