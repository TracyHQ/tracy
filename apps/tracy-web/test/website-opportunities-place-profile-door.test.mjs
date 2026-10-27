// `GET /api/website-opportunities/:id/place-profile` (ADR 0037, T5b): the Details page reads the place's research as the
// validated, template-independent document: nothing of the account's brief or demo, and only for the opportunity's owner.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { validatePlaceProfile } from 'website-opportunities/domain/place-profile.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { fileDb } from './_db.mjs'

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
const COVERAGE = [
  'found',
  'partial',
  'searched_not_found',
  'not_researched',
  'blocked',
  'failed',
  'not_applicable'
]
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const BASE = '/api/website-opportunities'
const A = 'a@tracy.test'
const B = 'b@tracy.test'

async function world() {
  const config = readConfig(env)
  const domain = { ...(await websiteOpportunitiesDomain()) }
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: async () => domain,
    websiteOpportunitiesRequest: async () => Response.json({ code: 'UNEXPECTED' }, { status: 500 }),
    fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 })
  })
  await db.pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify({ 'website-opportunities': true })]
  )
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
  return { call }
}

async function opportunity(call) {
  const res = await call(A, 'POST', BASE, {
    candidate: { provider: 'osm', providerId: 'node/1', name: 'Pho Ba', lat: 15.88, lon: 108.33, socials: {} }
  })
  assert.equal(res.status, 201)
  return res.body.opportunity
}

test(
  'the owner reads a valid place profile with a coverage row per target and no brief or demo',
  opts,
  async () => {
    const { call } = await world()
    const opp = await opportunity(call)
    const res = await call(A, 'GET', `${BASE}/${opp.id}/place-profile`)
    assert.equal(res.status, 200)
    assert.deepEqual(Object.keys(res.body), ['profile', 'decisions'])
    // One on-site decision per fact (#1791), the rule's while the owner chose nothing.
    const name = res.body.decisions.find((d) => d.factId === res.body.profile.business.name.id)
    assert.equal(name.decidedBy, 'rule')
    assert.equal(typeof name.onSite, 'boolean')
    assert.ok(['corroborated', 'single-source', 'inferred'].includes(name.confidence))
    assert.equal(validatePlaceProfile(res.body.profile).ok, true)
    assert.equal(res.body.profile.business.name.value, 'Pho Ba')
    assert.ok(res.body.profile.coverage.length > 0)
    for (const row of res.body.profile.coverage) assert.ok(COVERAGE.includes(row.status), row.target)
    for (const key of ['brief', 'demo', 'revisions', 'builds'])
      assert.equal(key in res.body.profile, false, key)
  }
)

test('another account, an unknown id and no session cannot read it', opts, async () => {
  const { call } = await world()
  const opp = await opportunity(call)
  await call(B, 'GET', `${BASE}/settings`)
  assert.equal((await call(B, 'GET', `${BASE}/${opp.id}/place-profile`)).status, 404)
  assert.equal(
    (await call(A, 'GET', `${BASE}/00000000-0000-4000-8000-000000000000/place-profile`)).status,
    404
  )
  assert.equal((await call(A, 'GET', `${BASE}/not-an-id/place-profile`)).status, 404)
  assert.equal((await call(null, 'GET', `${BASE}/${opp.id}/place-profile`)).status, 401)
})
