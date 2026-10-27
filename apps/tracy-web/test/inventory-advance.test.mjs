/**
 * `advanceInstances` (`inventory/reconcile.js`) — the rung of the ladder nobody watches.
 *
 * `runRefills` ends the moment the host has ACCEPTED the job, so without this sweep an instance
 * stops at `preparing` for ever, `supplyOf` keeps counting it as work in flight, and the pool reads
 * as busy rather than broken. What these tests hold it to, in the order the function decides it:
 *
 *   the door      — a missing `deps.sites` function is refused BY NAME and before any row moves;
 *   the pick      — only rows that have sat still for `staleMs` are touched;
 *   the host       — `ok: false` is a machine that did not answer, not a verdict on the build;
 *   the port      — the fleet's port is written here or nowhere, and never over a site that has
 *                   already been through the door once;
 *   health        — a green job is NOT enough: `ready` means the instance answers now;
 *   the ending    — attempts left → `queued` for the outbox, out of attempts → `quarantined`;
 *   review hold   — on and unapproved → `awaiting_review`; on and the GENERATION approved → `ready`.
 *
 * The store is the real `inventory/store.js` — `supplyOf` is exactly the counting question these
 * states exist to answer, and a double's opinion of it would prove nothing. The host and the
 * verifier are doubles: they are the network.
 */

import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'
import { advanceInstances } from '../src/inventory/reconcile.js'
import * as store from '../src/inventory/store.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbUrl = process.env.TEST_DATABASE_URL
const dbOpts = { skip: dbUrl ? false : 'set TEST_DATABASE_URL' }

const config = { origin: 'http://tracy.test:8080', siteDomain: 'localhost', siteAddressPrefix: '' }

const POOL = 'dev:local:joomla:tracy-business|j6:1.0.0:abcdef012345'

async function seedPool(pool, over = {}) {
  const p = { maxAttempts: 3, reviewHold: false, generation: 'g1', ...over }
  await pool.query(
    `insert into inventory_pool (pool_key, environment, host, platform, quickstart_tag,
       quickstart_version, generation, enabled, max_attempts, review_hold)
     values ($1, 'dev', 'local', 'joomla', 'tracy-business/j6', '1.0.0', $2, true, $3, $4)`,
    [POOL, p.generation, p.maxAttempts, p.reviewHold]
  )
  return p
}

/** An instance the sweep is meant to find: `preparing`, with a job id the host can be asked about. */
async function addInstance(pool, label, over = {}) {
  const o = { state: 'preparing', jobId: 'job-1', attempts: 0, generation: 'g1', ...over }
  await pool.query("insert into site (site_key, label, host) values ($1, $2, 'local')", [
    `${label}.localhost`,
    label
  ])
  const { rows } = await pool.query(
    `insert into inventory_instance (pool_key, site_key, label, host, generation, state, job_id, attempts)
     values ($1, $2, $3, 'local', $4, $5, $6, $7) returning *`,
    [POOL, `${label}.localhost`, label, o.generation, o.state, o.jobId, o.attempts]
  )
  return rows[0]
}

/** A host that answers one way for every job. */
const hostSaying = (answer) => ({ hostJob: async () => answer })

/**
 * The four `sites` functions the door demands, each recording its calls. `siteByKey` answers from
 * `over.site` rather than the table so a test can say "this site already has an address" in one
 * line; `drop` omits one function, which is what test 9 needs.
 */
function fakeSites({ site = { label: 'inv-1', address: null }, drop = null } = {}) {
  const calls = { setPort: [], setAddress: [] }
  const all = {
    siteByKey: async () => site,
    setPort: async (_pool, siteKey, port) => void calls.setPort.push([siteKey, port]),
    setAddress: async (_pool, siteKey, patch) => void calls.setAddress.push([siteKey, patch]),
    bornSiteAddress: (label) => `${label}.tracy.test`
  }
  if (drop) delete all[drop]
  return { sites: all, calls }
}

const verifierSaying = (answer) => ({ verifyInstance: async () => answer })

const stateOf = async (pool, id) =>
  (await pool.query('select * from inventory_instance where id = $1', [id])).rows[0]

/** Everything `advanceInstances` needs with nothing stale to wait for. */
function deps(over = {}) {
  const { sites, calls } = over.sitesPair ?? fakeSites()
  return {
    deps: {
      store,
      log: {},
      staleMs: 0,
      doors: {},
      fetchImpl: async () => {
        throw new Error('no test may reach the network')
      },
      host: hostSaying({ ok: true, body: { state: 'done' } }),
      prepare: verifierSaying({ ok: true, healthOk: true, hashes: {} }),
      sites,
      ...over.deps
    },
    calls
  }
}

// ── The happy rung: done + healthy → ready ─────────────────────────────────────────────────────

test(
  'advance: a done job that passes its health check reaches ready and counts as supply',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool)
    const instance = await addInstance(pool, 'inv-ok')
    const { deps: d } = deps({
      deps: { prepare: verifierSaying({ ok: true, healthOk: true, hashes: { artifact: 'sha-abc' } }) }
    })

    const out = await advanceInstances(pool, config, d)

    assert.deepEqual(
      { ran: out.ran, advanced: out.advanced, ready: out.ready, failed: out.failed },
      { ran: true, advanced: 1, ready: 1, failed: 0 }
    )
    const row = await stateOf(pool, instance.id)
    assert.equal(row.state, 'ready')
    assert.equal(row.health_ok, true)
    assert.deepEqual(row.hashes, { artifact: 'sha-abc' }, 'what was READ BACK off the instance is the record')
    assert.notEqual(row.health_checked_at, null, 'a verdict with no time is a verdict that never expires')
    assert.equal((await store.supplyOf(pool, POOL)).ready, 1)
  }
)

// ── The port: written here or nowhere ─────────────────────────────────────────────────────────

test('advance: the port the fleet reported is written once, as a draft address', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  const instance = await addInstance(pool, 'inv-port')
  const pair = fakeSites({ site: { label: 'inv-port', address: null } })
  const { deps: d } = deps({
    sitesPair: pair,
    deps: { host: hostSaying({ ok: true, body: { state: 'done', port: 52057 } }) }
  })

  await advanceInstances(pool, config, d)

  assert.deepEqual(pair.calls.setPort, [['inv-port.localhost', 52057]])
  assert.deepEqual(pair.calls.setAddress, [
    ['inv-port.localhost', { address: 'inv-port.tracy.test', publish: 'draft' }]
  ])
  assert.equal((await stateOf(pool, instance.id)).state, 'ready')
})

test(
  'advance: a site that already has an address is not re-stamped — stock that went through the door keeps it',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool)
    await addInstance(pool, 'inv-addr')
    const pair = fakeSites({ site: { label: 'inv-addr', address: 'customer.example.com' } })
    const { deps: d } = deps({
      sitesPair: pair,
      deps: { host: hostSaying({ ok: true, body: { state: 'done', port: 52058 } }) }
    })

    await advanceInstances(pool, config, d)

    assert.deepEqual(pair.calls.setPort, [], 'the guard is the null address')
    assert.deepEqual(pair.calls.setAddress, [])
  }
)

// ── Two answers that are not answers ──────────────────────────────────────────────────────────

test('advance: a job still running changes nothing', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  const instance = await addInstance(pool, 'inv-running')
  const { deps: d } = deps({ deps: { host: hostSaying({ ok: true, body: { state: 'running' } }) } })

  const out = await advanceInstances(pool, config, d)

  assert.deepEqual(
    { advanced: out.advanced, ready: out.ready, failed: out.failed },
    { advanced: 0, ready: 0, failed: 0 }
  )
  assert.equal((await stateOf(pool, instance.id)).state, 'preparing')
})

test(
  'advance: a host that does not answer is skipped, not treated as a verdict on the build',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool)
    const instance = await addInstance(pool, 'inv-silent')
    const { deps: d } = deps({ deps: { host: hostSaying({ ok: false, body: null }) } })

    const out = await advanceInstances(pool, config, d)

    assert.deepEqual({ advanced: out.advanced, failed: out.failed }, { advanced: 0, failed: 0 })
    const row = await stateOf(pool, instance.id)
    assert.equal(row.state, 'preparing', 'a machine restarting must not cost an instance its life')
    assert.equal(row.last_error, null)
  }
)

// ── A failed job: back to the outbox, or out of attempts ──────────────────────────────────────

test('advance: a failed job with attempts left goes back to queued for the outbox', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool, { maxAttempts: 3 })
  const instance = await addInstance(pool, 'inv-fail1', { attempts: 1 })
  const { deps: d } = deps({
    deps: { host: hostSaying({ ok: true, body: { state: 'failed', step: 'install' } }) }
  })

  const out = await advanceInstances(pool, config, d)

  assert.deepEqual(
    { advanced: out.advanced, ready: out.ready, failed: out.failed },
    { advanced: 1, ready: 0, failed: 1 }
  )
  const row = await stateOf(pool, instance.id)
  assert.equal(row.state, 'queued', 'the retry belongs to the outbox, which owns the backoff')
  assert.match(row.last_error, /install/)
  assert.equal(row.health_ok, false)
})

test('advance: a failed job with no attempts left is quarantined', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool, { maxAttempts: 2 })
  const instance = await addInstance(pool, 'inv-fail2', { attempts: 2 })
  const { deps: d } = deps({
    deps: { host: hostSaying({ ok: true, body: { state: 'failed', step: 'seed' } }) }
  })

  await advanceInstances(pool, config, d)

  const row = await stateOf(pool, instance.id)
  assert.equal(row.state, 'quarantined', 'an instance nobody will retry must stop counting as supply')
  assert.match(row.last_error, /seed/)
  assert.equal((await store.supplyOf(pool, POOL)).quarantined, 1)
})

// ── Health is taken on the INSTANCE, not inferred from the job ────────────────────────────────

test(
  'advance: a green job whose health check fails does NOT reach ready — attempts left means queued',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool, { maxAttempts: 3 })
    const instance = await addInstance(pool, 'inv-sick1', { attempts: 1 })
    const { deps: d } = deps({
      deps: { prepare: verifierSaying({ ok: true, healthOk: false, detail: 'the CMS answered 500' }) }
    })

    const out = await advanceInstances(pool, config, d)

    assert.deepEqual(
      { advanced: out.advanced, ready: out.ready, failed: out.failed },
      { advanced: 1, ready: 0, failed: 1 }
    )
    const row = await stateOf(pool, instance.id)
    assert.equal(row.state, 'queued')
    assert.equal(row.last_error, 'the CMS answered 500')
    assert.equal((await store.supplyOf(pool, POOL)).ready, 0, 'a green job is not eligibility')
  }
)

test(
  'advance: a health check that fails with no attempts left quarantines, however green the job was',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool, { maxAttempts: 2 })
    const instance = await addInstance(pool, 'inv-sick2', { attempts: 2 })
    const { deps: d } = deps({
      deps: { prepare: verifierSaying({ ok: false, detail: 'no route to the site' }) }
    })

    await advanceInstances(pool, config, d)

    const row = await stateOf(pool, instance.id)
    assert.equal(row.state, 'quarantined')
    assert.equal(row.last_error, 'no route to the site')
    assert.equal((await store.supplyOf(pool, POOL)).ready, 0)
  }
)

// ── Review hold ───────────────────────────────────────────────────────────────────────────────

test('advance: with review hold on and the generation unapproved, the instance waits', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool, { reviewHold: true, generation: 'g1' })
  const instance = await addInstance(pool, 'inv-hold', { generation: 'g1' })
  const { deps: d } = deps()

  const out = await advanceInstances(pool, config, d)

  assert.deepEqual({ advanced: out.advanced, ready: out.ready }, { advanced: 1, ready: 0 })
  const row = await stateOf(pool, instance.id)
  assert.equal(row.state, 'awaiting_review')
  assert.equal(row.health_ok, true, 'the machine check still happened — only the human one is pending')
  const supply = await store.supplyOf(pool, POOL)
  assert.deepEqual(
    { ready: supply.ready, awaitingReview: supply.awaitingReview },
    { ready: 0, awaitingReview: 1 }
  )
})

test(
  'advance: with review hold on, an APPROVED generation goes straight to ready — no second look',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool, { reviewHold: true, generation: 'g1' })
    const instance = await addInstance(pool, 'inv-approved', { generation: 'g1' })
    const approved = await store.approveGeneration(pool, {
      poolKey: POOL,
      generation: 'g1',
      expectedHashes: { artifact: 'sha-abc' },
      approvedBy: 'akemi'
    })
    assert.equal(approved.ok, true)
    const { deps: d } = deps()

    const out = await advanceInstances(pool, config, d)

    assert.equal(out.ready, 1)
    assert.equal((await stateOf(pool, instance.id)).state, 'ready')
    assert.equal((await store.supplyOf(pool, POOL)).awaitingReview, 0)
  }
)

// ── The door ──────────────────────────────────────────────────────────────────────────────────

for (const missing of ['siteByKey', 'setPort', 'setAddress', 'bornSiteAddress'])
  test(
    `advance: a missing deps.sites.${missing} is refused by name before any row moves`,
    dbOpts,
    async () => {
      const { pool } = db
      await seedPool(pool)
      // A row that WOULD have advanced, so "nothing moved" is a fact about the guard and not about
      // there being nothing to do.
      const instance = await addInstance(pool, `inv-door-${missing.toLowerCase()}`)
      const { deps: d } = deps({ sitesPair: fakeSites({ drop: missing }) })

      await assert.rejects(
        () => advanceInstances(pool, config, d),
        (error) => {
          assert.equal(error instanceof TypeError, true)
          assert.match(error.message, new RegExp(`deps\\.sites\\.${missing}`))
          return true
        }
      )

      assert.equal(
        (await stateOf(pool, instance.id)).state,
        'preparing',
        'a dependency found half way through takes the sweep down after it has already moved rows'
      )
    }
  )

// ── The pick ──────────────────────────────────────────────────────────────────────────────────

test(
  'advance: an instance that was just touched has not sat still long enough to be swept',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool)
    const instance = await addInstance(pool, 'inv-fresh')
    // A minute of silence is the whole point of the sweep: it picks up what NOBODY is watching, and
    // a row written a moment ago may still have its watcher.
    const { deps: d } = deps({ deps: { staleMs: 60_000 } })

    const out = await advanceInstances(pool, config, d)

    assert.deepEqual(
      { ran: out.ran, advanced: out.advanced, ready: out.ready },
      { ran: true, advanced: 0, ready: 0 }
    )
    assert.equal((await stateOf(pool, instance.id)).state, 'preparing')
  }
)

// A failed build is recorded with the line it died on, not only the step: `inv-ed-v5m9wz` read
// "the host refused the install at step provision" while the host log named the mail helper.
test('advance: a failed build records the reason the host log gives, with its step', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  const instance = await addInstance(pool, 'inv-mail')
  const output = [
    'configure-mail: the site has no sender address and no owner email was passed — none is invented',
    "!! could not configure this site's mail — refusing to mark this site ready"
  ].join('\n')
  const { deps: d } = deps({
    deps: { host: hostSaying({ ok: true, body: { state: 'failed', step: 'provision', output } }) }
  })
  await advanceInstances(pool, config, d)
  const row = await stateOf(pool, instance.id)
  assert.match(row.last_error, /step "provision"/)
  assert.match(row.last_error, /configure-mail: the site has no sender address/)
})
