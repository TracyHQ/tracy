import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { verifyShardRequest } from '../src/lib/shard-channel.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { answerTeardown } from './_host-teardown.mjs'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const SECRET = 'ab'.repeat(32)
const MASTER = 'http://master.tracy.test:8080'
const BUILD = '11111111-2222-4333-8444-555555555555'
/** The master's own check of a shard's signed call (contract §2). */
const signedByShard = (u, init) =>
  verifyShardRequest({
    secret: SECRET,
    headers: init.headers,
    method: init.method ?? 'POST',
    path: u.pathname,
    body: init.body ?? ''
  }).ok
const env = {
  TRACY_ORIGIN: 'http://s2.tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 's2',
  HOST_NAME: 's2',
  HOST_s2_ORIGIN: 'http://tracy-host.test',
  HOST_s2_DSH_ORIGIN: 'http://dsh.test',
  HOST_s2_SECRET: 'h',
  SEAT_s2_SECRET: 'k',
  TRACY_DEPLOYMENT_ROLE: 'shard',
  MASTER_ORIGIN: MASTER,
  SHARD_SECRET: SECRET,
  SESSION_COOKIE_NAME: 'tracy_sess_s2'
}

/** The master (labels, events) and the host (provision, reserve, jobs, teardown) behind one fetch. */
function world({ master = 'up', takenLabels = [] } = {}) {
  const reserved = []
  const provisions = []
  const outboxAtProvision = []
  const jobs = new Map()
  const fetchImpl = async (input, init = {}) => {
    const u = new URL(String(input))
    if (u.origin === MASTER) {
      if (master === 'down') throw new TypeError('fetch failed')
      if (!signedByShard(u, init))
        return Response.json({ code: 'SIGNATURE_INVALID', why: 'signature' }, { status: 403 })
      const body = JSON.parse(init.body)
      if (u.pathname === '/api/shards/s2/labels/reserve') {
        reserved.push(body)
        if (takenLabels.includes(body.label))
          return Response.json({ code: 'LABEL_TAKEN', reason: 'IN_USE' }, { status: 409 })
        return Response.json({ label: body.label, expiresAt: '2026-10-16T10:30:00Z' })
      }
      return Response.json({ ok: true })
    }
    const teardown = answerTeardown(input, init)
    if (teardown) return teardown
    if (u.pathname === '/_host/provision') {
      const body = JSON.parse(init.body)
      provisions.push(body)
      outboxAtProvision.push(
        (await db.pool.query("select count(*)::int as n from shard_event_outbox where kind = 'site.created'"))
          .rows[0].n
      )
      const id = `k-${body.jobKey}`
      if (!jobs.has(id)) jobs.set(id, { state: 'running' })
      return Response.json({ jobId: id })
    }
    if (u.pathname.startsWith('/_host/jobs/')) {
      const job = jobs.get(u.pathname.slice('/_host/jobs/'.length))
      return Response.json(job ?? { state: 'unknown' }, { status: job ? 200 : 404 })
    }
    if (u.pathname === '/_host/attach' || u.pathname === '/_host/reserve') return Response.json({ ok: true })
    return new Response(null, { status: 404 })
  }
  return { reserved, provisions, outboxAtProvision, jobs, fetchImpl }
}

function harness(fetchImpl, extra = {}) {
  const config = readConfig({ ...env, ...extra })
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(db.pool, config),
    host: { hostCall, hostJob },
    fetchImpl
  })
  const cookieFor = async (email) => `tracy_sess_s2=${await mintSession(email, config.sessionSecret)}`
  const call = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://s2.tracy.test:8080${path}`, {
        method,
        headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    )
  return { cookieFor, call }
}
async function handedHere(email) {
  const { rows } = await db.pool.query('insert into account (email) values ($1) returning id', [email])
  await db.pool.query(
    "insert into shard_mirror (email, account_id, source, idempotency_key) values ($1, $2, 'master', $3)",
    [email, rows[0].id, `m-${email}`]
  )
}
const catalogueRead = () =>
  db.pool.query(
    "insert into quickstart_releases (tag, release, tracy) values ('test/none', '{}', 'no-setting')"
  )
const count = async (table) => (await db.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n
const want = { label: 'lantern', platform: 'wordpress', buildId: BUILD }

test('a person the master never handed here cannot create a site on the shard', opts, async () => {
  await catalogueRead()
  const w = world()
  const { cookieFor, call } = harness(w.fetchImpl)
  const res = await call('POST', '/api/sites', await cookieFor('stranger@x.y'), want)
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { code: 'ACCOUNT_NOT_ON_SHARD', login: `${MASTER}/login` })
  assert.equal(w.reserved.length, 0)
})

test(
  'a handed person creates a site: the label is held at the master first and site.created is queued before the provision',
  opts,
  async () => {
    await catalogueRead()
    await handedHere('a@x.y')
    const w = world()
    const { cookieFor, call } = harness(w.fetchImpl)
    const res = await call('POST', '/api/sites', await cookieFor('a@x.y'), want)
    assert.equal(res.status, 202, await res.clone().text())
    assert.deepEqual(w.reserved, [{ label: 'lantern', siteKey: 'lantern.localhost' }])
    assert.deepEqual(w.outboxAtProvision, [1])
    const { rows } = await db.pool.query('select kind, data from shard_event_outbox')
    assert.deepEqual(rows, [
      {
        kind: 'site.created',
        data: { siteKey: 'lantern.localhost', label: 'lantern', platform: 'wordpress' }
      }
    ])
  }
)

test(
  'the master holding the label elsewhere is the same TAKEN refusal as a local clash, and nothing is written',
  opts,
  async () => {
    await catalogueRead()
    await handedHere('a@x.y')
    const w = world({ takenLabels: ['lantern'] })
    const { cookieFor, call } = harness(w.fetchImpl)
    const res = await call('POST', '/api/sites', await cookieFor('a@x.y'), want)
    assert.equal(res.status, 409)
    assert.equal((await res.json()).code, 'TAKEN')
    assert.equal(await count('site'), 0)
    assert.equal(w.provisions.length, 0)
  }
)

test(
  'the master not answering refuses the create with LABEL_REGISTRY_UNAVAILABLE and leaves no site behind',
  opts,
  async () => {
    await catalogueRead()
    await handedHere('a@x.y')
    const w = world({ master: 'down' })
    const { cookieFor, call } = harness(w.fetchImpl)
    const res = await call('POST', '/api/sites', await cookieFor('a@x.y'), want)
    assert.equal(res.status, 503)
    assert.deepEqual(await res.json(), { code: 'LABEL_REGISTRY_UNAVAILABLE' })
    assert.equal(await count('site'), 0)
    assert.equal(await count('shard_event_outbox'), 0)
    assert.equal(w.provisions.length, 0)
    assert.equal((await db.pool.query('select state from site_creation')).rows[0].state, 'refused')
  }
)

test(
  'a shard that has not read the catalogue, or is at its cap, answers SHARD_FULL with the master’s fresh start',
  opts,
  async () => {
    await handedHere('a@x.y')
    const w = world()
    const { cookieFor, call } = harness(w.fetchImpl)
    const res = await call('POST', '/api/sites', await cookieFor('a@x.y'), want)
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.equal(body.code, 'SHARD_FULL')
    // Contract §12: the master does not follow tracy_shard back here when fresh=1, and adopts elsewhere.
    assert.equal(body.createAt, `${MASTER}/new/?fresh=1`)
    assert.match(body.message, /master\.tracy\.test:8080/)
    await catalogueRead()
    await db.pool.query("insert into site (site_key, label, host) values ('old.localhost', 'old', 's2')")
    const capped = harness(w.fetchImpl, { SHARD_MAX_SITES: '1' })
    assert.equal((await capped.call('POST', '/api/sites', await capped.cookieFor('a@x.y'), want)).status, 503)
  }
)

test(
  'a nameless claim on a shard draws another draft address when the master holds the first',
  opts,
  async () => {
    await catalogueRead()
    await handedHere('a@x.y')
    let first = null
    const w = world()
    const fetchImpl = async (input, init) => {
      const u = new URL(String(input))
      if (u.pathname === '/api/shards/s2/labels/reserve' && first === null) {
        first = JSON.parse(init.body).label
        return Response.json({ code: 'LABEL_TAKEN', reason: 'ZONE_RECORD' }, { status: 409 })
      }
      return w.fetchImpl(input, init)
    }
    const { cookieFor, call } = harness(fetchImpl)
    const res = await call('POST', '/api/sites/claim', await cookieFor('a@x.y'), {
      platform: 'wordpress',
      buildId: BUILD
    })
    assert.equal(res.status, 201, await res.clone().text())
    const claimed = await res.json()
    assert.notEqual(claimed.label, first)
    assert.deepEqual((await db.pool.query('select kind from shard_event_outbox')).rows, [
      { kind: 'site.created' }
    ])
  }
)
