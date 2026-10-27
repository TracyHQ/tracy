// The shared hub, end to end: one standalone server serves the hub (`HUB_SERVE=1`), two others use it as clients
// (`HUB_URL`, `HUB_TOKEN`). Every database is a scratch one; every provider call is a fake that counts itself.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { serve } from '@hono/node-server'
import { briefResearchOf } from '../src/brief-research.js'
import { createHubTokens } from '../src/hub/tokens.js'
import { suppressBusiness } from '../src/hub/revocations.js'
import { migrate } from '../src/schema/index.js'
import { readStandaloneConfig } from '../src/standalone/config.js'
import { ensureOperatorPrincipal } from '../src/standalone/operator-principal.js'
import { createStandaloneApp } from '../src/standalone/server.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const BASE = '/api/website-opportunities'
const PLACE_A = 'ChIJ-hub-a'
const quiet = { info() {}, warn() {}, error() {}, log() {} }
// A fake key built from pieces, so no scanner reads it as a secret.
const KEY = ['fake', 'google', 'key'].join('-')
const OPERATOR = ['operator', 'token', 'for', 'the', 'hub', 'test'].join('-')

/** Google as the fakes answer it: one place, read by Place Details (full mask) or by the hub's verification mask. */
const GOOGLE_A = {
  id: PLACE_A,
  displayName: { text: 'Cafe Hub' },
  formattedAddress: '1 Market Street, Amsterdam',
  internationalPhoneNumber: '+31 20 555 0101',
  nationalPhoneNumber: '020 555 0101',
  location: { latitude: 52.3701, longitude: 4.8952 },
  rating: 4.4,
  userRatingCount: 120
}

function fakeGoogle(calls) {
  return async (input, init = {}) => {
    const href = String(input instanceof Request ? input.url : input)
    const headers = new Headers(input instanceof Request ? input.headers : init.headers)
    if (href.startsWith('https://places.googleapis.com/v1/places:')) {
      calls.push({ kind: 'search', href })
      return Response.json({
        places: [{ ...GOOGLE_A, primaryType: 'cafe', primaryTypeDisplayName: { text: 'Cafe' } }]
      })
    }
    if (href.startsWith(`https://places.googleapis.com/v1/places/${PLACE_A}`)) {
      const mask = headers.get('x-goog-fieldmask') ?? ''
      // Place Details asks for Atmosphere fields (editorialSummary); the hub's verification mask never does.
      calls.push({ kind: mask.includes('editorialSummary') ? 'details' : 'verify', href })
      return Response.json(GOOGLE_A)
    }
    calls.push({ kind: 'other', href })
    return new Response('not found', { status: 404 })
  }
}

const resolve = async () => [{ address: '2606:4700:4700::1111', family: 6 }]

async function standalone(env, calls) {
  const db = await scratchDatabase()
  await migrate(db.pool)
  await ensureOperatorPrincipal(db.pool)
  const config = readStandaloneConfig({
    DATABASE_URL: db.url,
    PORT: '0',
    GOOGLE_PLACES_API_KEY: KEY,
    OPERATOR_TOKEN: OPERATOR,
    ...env
  })
  const made = createStandaloneApp({
    config,
    pool: db.pool,
    objects: null,
    fetchImpl: fakeGoogle(calls),
    resolve,
    log: quiet
  })
  const tick = (name) => made.ticks.find((t) => t.name === name).run()
  const call = async (method, path, body) => {
    const res = await made.app.fetch(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          authorization: `Bearer ${OPERATOR}`,
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    )
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  return { db, pool: db.pool, made, tick, call }
}

/** Saves place A from a search and runs its research to the end on that server. */
async function researchA(server) {
  const found = await server.call('POST', `${BASE}/search`, { lat: 52.37, lon: 4.89, radiusM: 1000 })
  assert.equal(found.status, 200, JSON.stringify(found.body))
  const saved = await server.call('POST', BASE, { candidate: found.body.candidates[0] })
  const id = saved.body.opportunity.id
  const started = await server.call('POST', `${BASE}/${id}/research`, { requestId: `req-${id.slice(0, 8)}` })
  assert.equal(started.status, 202, JSON.stringify(started.body))
  for (let i = 0; i < 20; i++) {
    const { claimed, done } = await server.tick('research')
    await done
    const open = await server.pool.query(
      `select count(*)::int as n from wo_place_job where state in ('queued', 'running')`
    )
    if (!claimed && open.rows[0].n === 0) break
  }
  const opp = (await server.pool.query('select * from wo_opportunity where id = $1', [id])).rows[0]
  return opp
}

let hub
let hubServer
let hubUrl
let one
let two
let three
const hubCalls = []
const threeCalls = []
const oneCalls = []
const twoCalls = []
let accountTwo

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  hub = await standalone({ HUB_SERVE: '1' }, hubCalls)
  hubServer = await new Promise((done) => {
    const s = serve({ fetch: hub.made.app.fetch, port: 0, hostname: '127.0.0.1' }, () => done(s))
  })
  hubUrl = `http://127.0.0.1:${hubServer.address().port}`
  const tokens = createHubTokens({ pool: hub.pool })
  const principal = async () =>
    (await hub.pool.query(`insert into wo_principal (kind) values ('test') returning id`)).rows[0].id
  const first = await tokens.issue(await principal())
  const second = await tokens.issue(await principal())
  accountTwo = second.accountId
  one = await standalone({ HUB_URL: hubUrl, HUB_TOKEN: first.token, HUB_CONTRIBUTE: '1' }, oneCalls)
  two = await standalone({ HUB_URL: hubUrl, HUB_TOKEN: second.token }, twoCalls)
  // Per-account research (no shared place store) asks the same hub.
  const third = await tokens.issue(await principal())
  three = await standalone({ HUB_URL: hubUrl, HUB_TOKEN: third.token, WO_SHARED_RESEARCH: '0' }, threeCalls)
})

after(async () => {
  await new Promise((done) => (hubServer ? hubServer.close(() => done()) : done()))
  for (const s of [one, two, three, hub]) await s?.db.close()
})

test('without HUB_SERVE the hub doors are not mounted', opts, async () => {
  // A GET may fall through to the browser page; a POST cannot.
  const body = { items: [{ namespace: 'google', externalId: PLACE_A }] }
  assert.equal((await one.call('POST', '/hub/v1/places/lookup', body)).status, 404)
  const answer = await hub.call('POST', '/hub/v1/places/lookup', body)
  assert.equal(answer.status, 401, 'the operator token is not a hub token')
  assert.equal(answer.body.code, 'invalid_token')
})

test('the hub admin doors are mounted only where the hub is served', opts, async () => {
  const path = '/api/website-opportunities/operator/hub/verify'
  const served = await hub.call('GET', path)
  assert.equal(served.status, 200, JSON.stringify(served.body))
  const me = await hub.call('GET', '/api/website-opportunities/operator/me')
  assert.equal(me.body.hub, true)
  // A client server has no hub admin: the path is not an API door there.
  assert.notEqual(
    (await one.call('POST', '/api/website-opportunities/operator/hub/places/x/revoke', { reason: 'r' }))
      .status,
    200
  )
})

test(
  'a place researched once is shared: contributed, verified, published, then read without a provider call',
  opts,
  async () => {
    // Client one: the hub has nothing yet, so it pays Google, then offers what it found.
    await researchA(one)
    assert.equal(
      oneCalls.filter((c) => c.kind === 'details').length,
      1,
      'client one pays for Place Details once'
    )
    const sent = await one.tick('hub')
    assert.equal(sent.contributed, 1, JSON.stringify(sent))

    // The hub checks the contribution against Google itself (one read for the source group), then publishes it.
    await hub.tick('hub verify')
    assert.equal(hubCalls.filter((c) => c.kind === 'verify').length, 1)
    const published = await hub.tick('hub publish')
    assert.equal(published.published, 1, JSON.stringify(published))

    // Client two: the hub has a fresh snapshot, so no Place Details call is made.
    const opp = await researchA(two)
    assert.equal(
      twoCalls.filter((c) => c.kind === 'details').length,
      0,
      'client two never pays for Place Details'
    )
    const source = (
      await two.pool.query(
        `select s.collected, s.coverage from wo_place_snapshot_source s join wo_place p on p.current_snapshot_id = s.snapshot_id
        where p.id = $1 and s.source = 'google-places'`,
        [opp.place_id]
      )
    ).rows[0]
    assert.equal(source.coverage.provenance, 'hub')
    assert.equal(source.collected.name, 'Cafe Hub')
    assert.equal(source.collected.formattedAddress, '1 Market Street, Amsterdam')
    const { read } = await briefResearchOf(two.pool, opp)
    assert.equal(read.profile.googlePlace?.name, 'Cafe Hub')
    assert.equal(read.hubRevoked, undefined)
  }
)

test('per-account research reads the hub before paying for Place Details too', opts, async () => {
  const opp = await researchA(three)
  assert.equal(
    threeCalls.filter((c) => c.kind === 'details').length,
    0,
    'the hub copy is fresh: no Place Details call'
  )
  const { read } = await briefResearchOf(three.pool, opp)
  assert.equal(read.profile.googlePlace?.name, 'Cafe Hub')
  assert.equal(read.profile.googlePlace?.via, 'hub')
})

test(
  'only the closed field list leaves a client, and only one that turned contributions on',
  opts,
  async () => {
    const { rows } = await hub.pool.query('select distinct field from wo_hub_observation order by field')
    assert.deepEqual(
      rows.map((r) => r.field),
      ['address', 'identity', 'location', 'name', 'phone']
    )
    const location = await hub.pool.query(
      `select value, status from wo_hub_observation where field = 'location'`
    )
    assert.deepEqual(location.rows, [{ value: { latitude: 52.3701, longitude: 4.8952 }, status: 'accepted' }])
    const queued = await two.pool.query('select count(*)::int as n from wo_hub_client_outbox')
    assert.equal(queued.rows[0].n, 0, 'HUB_CONTRIBUTE is off by default')
    const sentBody = (await one.pool.query('select body from wo_hub_client_outbox')).rows[0].body
    assert.deepEqual(Object.keys(sentBody).sort(), ['observations', 'schema', 'subject'])
  }
)

test('HUB_URL and HUB_TOKEN go together; contributing needs a hub', opts, () => {
  const env = { DATABASE_URL: 'postgres://x@localhost/x' }
  assert.throws(() => readStandaloneConfig({ ...env, HUB_URL: 'https://hub.example' }), /HUB_TOKEN/)
  assert.throws(() => readStandaloneConfig({ ...env, HUB_CONTRIBUTE: '1' }), /HUB_URL/)
  const off = readStandaloneConfig(env)
  assert.equal(off.hubServe, false)
  assert.equal(off.hubUrl, null)
  assert.equal(off.hubContribute, false)
})

test(
  'a business removed on the hub leaves the client cache after the revocation feed, even with no read quota',
  opts,
  async () => {
    const cached = await two.pool.query('select hub_place_id from wo_hub_client_place where dto is not null')
    assert.equal(cached.rowCount, 1)
    const hubPlaceId = cached.rows[0].hub_place_id
    await suppressBusiness(hub.pool, { placeId: hubPlaceId, reason: 'owner asked', actor: 'test operator' })
    // Client two has no read quota left for today.
    await hub.pool.query(
      `insert into wo_hub_quota_use (account_id, category, period, period_start, used)
     values ($1, 'read_places', 'day', current_date, 100000), ($1, 'read_places', 'month', date_trunc('month', current_date), 100000)
     on conflict (account_id, category, period, period_start) do update set used = excluded.used`,
      [accountTwo]
    )
    const synced = await two.tick('hub')
    assert.ok(synced.revoked >= 1, JSON.stringify(synced))
    const after = await two.pool.query(
      'select dto, revoked_at from wo_hub_client_place where hub_place_id = $1',
      [hubPlaceId]
    )
    assert.equal(after.rows[0].dto, null)
    assert.ok(after.rows[0].revoked_at)
    const opp = (await two.pool.query('select * from wo_opportunity limit 1')).rows[0]
    const { read } = await briefResearchOf(two.pool, opp)
    assert.equal(read.profile.googlePlace, undefined, 'the brief no longer states the revoked hub facts')
    assert.equal(read.hubRevoked?.length, 1)
    assert.ok(!read.sources.some((s) => s.source === 'google-places'))

    // The per-account copy is dropped from briefs too, and the next research pays Google again.
    await three.tick('hub')
    const threeOpp = (await three.pool.query('select * from wo_opportunity limit 1')).rows[0]
    const perAccount = (await briefResearchOf(three.pool, threeOpp)).read
    assert.equal(
      perAccount.profile.googlePlace,
      undefined,
      'a per-account brief no longer states the revoked hub facts'
    )
    assert.equal(perAccount.hubRevoked?.length, 1)
  }
)
