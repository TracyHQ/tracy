// Deleting a saved opportunity (`DELETE /api/website-opportunities/:id`, and `POST …/jobs/bulk` with action
// "delete"): another account's row is NOT_FOUND, a live job is cancelled first, a live demo site goes through the
// demo retention sweep's teardown before the row, and a bulk press answers its counts once per requestId.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const A = 'a@tracy.test'
const B = 'b@tracy.test'
const BASE = '/api/website-opportunities'
const BULK = `${BASE}/jobs/bulk`

/** `teardown`: what the site delete door answers for a demo site (`app.teardownSiteAs`), recorded in `torn`. */
async function world({ teardown = 'started' } = {}) {
  const { pool } = db
  const config = readConfig(env)
  const domain = await websiteOpportunitiesDomain()
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: async () => domain,
    websiteOpportunitiesRequest: async () => Response.json({ code: 'UNEXPECTED' }, { status: 500 }),
    fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 })
  })
  const torn = []
  app.teardownSiteAs = async (siteKey, email) => {
    torn.push({ siteKey, email })
    return teardown
  }
  const call = async (email, method, path, body) => {
    const headers = { origin: 'http://tracy.test:8080' }
    if (email) headers.cookie = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test:8080${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  await pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify({ 'website-opportunities': true })]
  )
  const accountOf = async (email) => {
    const made = await call(email, 'POST', BASE, {
      candidate: { provider: 'osm', providerId: `seed/${email}`, name: 'Seed', lat: 1, lon: 1, socials: {} }
    })
    assert.ok(made.status === 201 || made.status === 200)
    await pool.query('delete from wo_opportunity where provider_id = $1', [`seed/${email}`])
    return (await pool.query('select id from account where email = $1', [email])).rows[0].id
  }
  return { pool, call, accountOf, torn }
}

let seq = 0

/** A fictional place, with jobs in `jobs` states and, with `site`, a demo build on a site of that key. */
async function seed(pool, accountId, { jobs = [], site = null, candidate = {} } = {}) {
  const name = `Harbor Bakery ${++seq}`
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
       values ($1, $2, 'osm', $3, $4) returning *`,
      [accountId, name, `node/${randomUUID()}`, JSON.stringify({ name, ...candidate })]
    )
  ).rows[0]
  const jobIds = []
  for (const state of jobs) {
    const job = await pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id, state)
       values ($1, $2, 'research', $3, $4) returning id`,
      [accountId, opp.id, `seed-${randomUUID()}`, state]
    )
    jobIds.push(job.rows[0].id)
  }
  if (site) {
    await pool.query(
      `insert into site (site_key, label, host, platform) values ($1, $2, 'local', 'joomla')`,
      [site, `demo${seq}`]
    )
    const rev = await pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md)
       values ($1, $2, 1, '{}'::jsonb, '') returning id`,
      [opp.id, accountId]
    )
    await pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, state, site_key, choice, choice_key)
       values ($1, $2, $3, $4, 'done', $5, '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture')`,
      [accountId, rev.rows[0].id, `b-${randomUUID()}`, randomUUID(), site]
    )
  }
  return { ...opp, jobIds }
}

const exists = async (pool, id) =>
  (await pool.query('select 1 from wo_opportunity where id = $1', [id])).rowCount > 0

test(
  'delete: another account’s row, an unknown id and a customer’s own site are NOT_FOUND',
  opts,
  async () => {
    const { pool, call, accountOf } = await world()
    await accountOf(A)
    const accB = await accountOf(B)
    const theirs = await seed(pool, accB)
    const res = await call(A, 'DELETE', `${BASE}/${theirs.id}`)
    assert.equal(res.status, 404)
    assert.equal(res.body.code, 'NOT_FOUND')
    assert.ok(await exists(pool, theirs.id), 'B’s row stays')
    assert.equal((await call(A, 'DELETE', `${BASE}/${randomUUID()}`)).status, 404)
    assert.equal((await call(A, 'DELETE', `${BASE}/not-a-uuid`)).status, 404)
    const own = await seed(pool, accB, { candidate: { ownSite: true } })
    assert.equal((await call(B, 'DELETE', `${BASE}/${own.id}`)).status, 404)
    assert.ok(await exists(pool, own.id))
    assert.equal((await call(null, 'DELETE', `${BASE}/${theirs.id}`)).status, 401)
  }
)

test('delete without a demo: a live job is cancelled, then the row and its own rows go', opts, async () => {
  const { pool, call, accountOf, torn } = await world()
  const acc = await accountOf(A)
  const opp = await seed(pool, acc, { jobs: ['completed', 'running'] })
  const res = await call(A, 'DELETE', `${BASE}/${opp.id}`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { ok: true, deleted: { id: opp.id, siteRemoved: false } })
  assert.equal(await exists(pool, opp.id), false)
  const jobs = await pool.query('select 1 from wo_job where opportunity_id = $1', [opp.id])
  assert.equal(jobs.rowCount, 0, 'its jobs went with it')
  assert.deepEqual(torn, [], 'no site to tear down')
  assert.equal((await call(A, 'DELETE', `${BASE}/${opp.id}`)).status, 404, 'a second press finds nothing')
})

test(
  'delete with a live demo: the site goes through the retention teardown, then the row',
  opts,
  async () => {
    const { pool, call, accountOf, torn } = await world()
    const acc = await accountOf(A)
    const opp = await seed(pool, acc, { site: 'harbor-demo-1' })
    // A quality link on its demo action has no cascade: the delete must clear it, not fail on it.
    const rev = (await pool.query('select id from wo_revision where opportunity_id = $1', [opp.id])).rows[0]
      .id
    const action = (
      await pool.query(
        `insert into wo_demo_action (account_id, opportunity_id, request_id, fingerprint, accepted_at, revision_id,
         build_request_id, session_id, queued_at)
       values ($1, $2, $3, 'fixture', now(), $4, $5, 'fixture', now()) returning id`,
        [acc, opp.id, randomUUID(), rev, randomUUID()]
      )
    ).rows[0].id
    const intent = (
      await pool.query(
        `insert into wo_quality_intent (account_id, opportunity_id, generation, semantic_hash, semantic_input, policy, deadline)
       values ($1, $2, 1, 'h', '{}'::jsonb, '{}'::jsonb, now()) returning id`,
        [acc, opp.id]
      )
    ).rows[0].id
    const run = (
      await pool.query(
        `insert into wo_quality_run (account_id, opportunity_id, revision_id, input_hash, input, policy, intent_id)
       values ($1, $2, $3, 'h', '{}'::jsonb, '{}'::jsonb, $4) returning id`,
        [acc, opp.id, rev, intent]
      )
    ).rows[0].id
    await pool.query(
      `insert into wo_quality_action_link (action_id, run_id, account_id, opportunity_id, revision_id)
     values ($1, $2, $3, $4, $5)`,
      [action, run, acc, opp.id, rev]
    )
    const res = await call(A, 'DELETE', `${BASE}/${opp.id}`)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.deepEqual(res.body.deleted, { id: opp.id, siteRemoved: true })
    assert.deepEqual(torn, [{ siteKey: 'harbor-demo-1', email: A }], 'acted as the account that built it')
    assert.equal(await exists(pool, opp.id), false)
  }
)

test('delete refuses with 409 when the demo teardown cannot start, and the row stays', opts, async () => {
  const { pool, call, accountOf } = await world({ teardown: 'busy' })
  const acc = await accountOf(A)
  const opp = await seed(pool, acc, { site: 'harbor-demo-2' })
  const res = await call(A, 'DELETE', `${BASE}/${opp.id}`)
  assert.equal(res.status, 409)
  assert.equal(res.body.code, 'DEMO_TEARDOWN_FAILED')
  assert.ok(await exists(pool, opp.id))
})

test(
  'bulk delete by opportunity ids: counts, rows without a job, another account’s skipped',
  opts,
  async () => {
    const { pool, call, accountOf, torn } = await world()
    const acc = await accountOf(A)
    const accB = await accountOf(B)
    const plain = await seed(pool, acc)
    const paused = await seed(pool, acc, { jobs: ['paused'] })
    const demo = await seed(pool, acc, { site: 'harbor-demo-3' })
    const theirs = await seed(pool, accB)
    const body = {
      action: 'delete',
      requestId: 'delete-00000001',
      opportunityIds: [plain.id, paused.id, demo.id, theirs.id]
    }
    const res = await call(A, 'POST', BULK, body)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.results, [
      { opportunityId: plain.id, ok: true, siteRemoved: false },
      { opportunityId: paused.id, ok: true, siteRemoved: false },
      { opportunityId: demo.id, ok: true, siteRemoved: true },
      { opportunityId: theirs.id, ok: false, code: 'NOT_FOUND' }
    ])
    assert.deepEqual(
      [res.body.deleted, res.body.sitesRemoved, res.body.done, res.body.skipped, res.body.failed],
      [3, 1, 3, 1, 0]
    )
    assert.equal(torn.length, 1)
    assert.ok(await exists(pool, theirs.id), 'B’s row is not touched')

    // The same requestId answers the stored result and deletes nothing more.
    const fresh = await seed(pool, acc)
    const replay = await call(A, 'POST', BULK, body)
    assert.deepEqual(replay.body, res.body)
    assert.equal(torn.length, 1)
    const reused = await call(A, 'POST', BULK, { ...body, opportunityIds: [fresh.id] })
    assert.equal(reused.status, 409)
    assert.equal(reused.body.code, 'REQUEST_ID_REUSED')
    assert.ok(await exists(pool, fresh.id))
  }
)

test('bulk delete: a filter or job ids are refused, over 500 is TOO_MANY', opts, async () => {
  const { call, accountOf } = await world()
  await accountOf(A)
  const filter = await call(A, 'POST', BULK, {
    action: 'delete',
    requestId: 'delete-00000002',
    filter: { stage: 'research' }
  })
  assert.equal(filter.status, 400)
  assert.equal(filter.body.code, 'INVALID_SELECTION')
  const jobs = await call(A, 'POST', BULK, {
    action: 'delete',
    requestId: 'delete-00000003',
    jobIds: [randomUUID()]
  })
  assert.equal(jobs.status, 400)
  const many = await call(A, 'POST', BULK, {
    action: 'delete',
    requestId: 'delete-00000004',
    opportunityIds: Array.from({ length: 501 }, () => randomUUID())
  })
  assert.equal(many.status, 422)
  assert.equal(many.body.code, 'TOO_MANY')
})
