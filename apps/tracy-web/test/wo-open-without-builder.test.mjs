// ADR 0036: the open Website Opportunities doors run without Tracy's demo builder (`deps.builder`
// absent, the standalone repo's manual mode): they answer, with no demo field and no build door.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { websiteOpportunitiesRoutes } from 'website-opportunities/src/route.js'
import { readWoRuntime } from 'website-opportunities/src/wo-settings.js'
import { ensureAccount } from '../src/seats/store.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const BASE = '/api/website-opportunities'
const ORIGIN = 'http://tracy.test:8080'
const DEMO_FIELDS = ['demo', 'progress', 'revisions', 'brief', 'demoAction', 'usage', 'builds']
const LIST_DEMO_FIELDS = ['latestRevision', 'sites', 'latestBuild', 'demoAction', 'demo']

async function world() {
  const config = readConfig({
    TRACY_ORIGIN: ORIGIN,
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://tracy-host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  })
  const domain = await websiteOpportunitiesDomain()
  const app = websiteOpportunitiesRoutes({
    config,
    pool: db.pool,
    host: woHost,
    request: async () => Response.json({ code: 'UNEXPECTED' }, { status: 500 }),
    ensureAccount,
    loadDomain: async () => domain,
    objects: null,
    runtime: () => readWoRuntime(db.pool, config, { openSecret: woHost.openSecret }),
    fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 })
  })
  await db.pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify({ 'website-opportunities': true })]
  )
  const cookie = `tracy_sess=${await mintSession('a@tracy.test', config.sessionSecret)}`
  return async (method, path, body) => {
    const headers = { origin: ORIGIN, cookie }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`${ORIGIN}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
    )
    const text = await res.text()
    let parsed = text
    try {
      parsed = JSON.parse(text)
    } catch {}
    return { status: res.status, body: parsed }
  }
}

test('without a builder the open doors answer with no demo data', opts, async () => {
  const call = await world()
  const made = await call('POST', BASE, {
    candidate: { provider: 'osm', providerId: 'node/1', name: 'Pho Ba', lat: 1, lon: 1, socials: {} }
  })
  assert.equal(made.status, 201)
  const id = made.body.opportunity.id

  const list = await call('GET', BASE)
  assert.equal(list.status, 200)
  assert.equal(list.body.opportunities.length, 1)
  const row = list.body.opportunities[0]
  assert.equal(row.id, id)
  assert.equal(row.stage, 'research')
  for (const field of LIST_DEMO_FIELDS) assert.equal(field in row, false, field)

  const paged = await call('GET', `${BASE}?limit=10`)
  assert.equal(paged.status, 200)
  assert.equal(paged.body.total, 1)
  for (const field of LIST_DEMO_FIELDS) assert.equal(field in paged.body.opportunities[0], false, field)

  const detail = await call('GET', `${BASE}/${id}`)
  assert.equal(detail.status, 200)
  assert.equal(detail.body.opportunity.id, id)
  assert.deepEqual(detail.body.jobs, [])
  for (const field of DEMO_FIELDS) assert.equal(field in detail.body, false, field)

  assert.deepEqual((await call('GET', `${BASE}/settings`)).body, {})
  const put = await call('PUT', `${BASE}/settings`, { cms: 'wordpress' })
  assert.equal(put.status, 404)
  assert.equal(put.body.code, 'NO_BUILDER')
})

test('without a builder no build door is mounted', opts, async () => {
  const call = await world()
  assert.equal((await call('GET', `${BASE}/demo/usage`)).status, 404)
  assert.equal(
    (await call('POST', `${BASE}/demo/builds/bulk`, { requestId: 'r-12345678', ids: [] })).status,
    404
  )
})
