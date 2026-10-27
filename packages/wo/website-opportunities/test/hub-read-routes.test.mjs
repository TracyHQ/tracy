// Hub read doors on a real database, with the intake's real tokens and quota.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { materialize, POLICY_VERSION } from '../src/hub/materialize.js'
import { createHubQuota } from '../src/hub/quota.js'
import { hubReadRoutes } from '../src/hub/read-routes.js'
import { mergePlace, revokeMedia, revokePlace, suppressBusiness } from '../src/hub/revocations.js'
import { evidenceRevisionOf, hubDatabase, makePlace, makeTokenHolder, observe } from './hub-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
let db
let pool
let app
let broke // a reader whose read quota is used up
let reader
const objects = { get: async (key) => new Response(`bytes of ${key}`) }

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await hubDatabase()
  pool = db.pool
  reader = await makeTokenHolder(pool)
  broke = await makeTokenHolder(pool)
  const real = createHubQuota({ pool })
  const empty = createHubQuota({ pool, limits: { read_places: { day: 0, month: 0 } } })
  const quota = {
    charge: (accountId, ...rest) => (accountId === broke.accountId ? empty : real).charge(accountId, ...rest)
  }
  app = hubReadRoutes({ pool, quota, objects })
})
after(async () => db?.close())

const call = (path, { token = reader.token, method = 'GET', body, headers = {} } = {}) =>
  app.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
const publish = async (placeId) =>
  materialize(pool, placeId, await evidenceRevisionOf(pool, placeId), POLICY_VERSION)
const usedReads = async (accountId) =>
  Number(
    (
      await pool.query(
        `select coalesce(sum(used), 0) as n from wo_hub_quota_use where account_id = $1 and category = 'read_places' and period = 'day'`,
        [accountId]
      )
    ).rows[0].n
  )

async function publishedPlace(name, extra = []) {
  const { placeId, identities } = await makePlace(pool)
  const subject = identities[0]
  await observe(pool, { subject, field: 'name', value: name })
  await observe(pool, { subject, field: 'location', value: { latitude: 48.8566, longitude: 2.3522 } })
  for (const o of extra) await observe(pool, { subject, ...o })
  const out = await publish(placeId)
  return { placeId, subject, ...out }
}

test('no token, no data', opts, async () => {
  const res = await app.request('/hub/v1/changes')
  assert.equal(res.status, 401)
  assert.equal((await res.json()).code, 'invalid_token')
})

test('a place answers its snapshot, revision, ETag, freshness and public provenance only', opts, async () => {
  const { placeId } = await publishedPlace('Bistro A', [{ field: 'pipeline_stage', value: 'contacted' }])
  // Data that never belongs in the hub, sitting next to it in the same database.
  await pool.query(`update wo_place set display_name = 'internal label' where id = $1`, [placeId])
  const before = await usedReads(reader.accountId)
  const res = await call(`/hub/v1/places/${placeId}`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(Object.keys(body).sort(), [
    'contentHash',
    'fields',
    'freshness',
    'id',
    'policyVersion',
    'revision',
    'score',
    'websiteVerdict'
  ])
  assert.deepEqual(Object.keys(body.fields).sort(), ['location', 'name'])
  assert.deepEqual(Object.keys(body.fields.name).sort(), [
    'alternatives',
    'blocksBrief',
    'provenance',
    'status',
    'value'
  ])
  assert.deepEqual(Object.keys(body.fields.name.provenance).sort(), [
    'observedAt',
    'sourceObjects',
    'sources'
  ])
  assert.equal(body.websiteVerdict.state, 'not_found')
  assert.deepEqual(body.websiteVerdict.checkedSources, ['google_maps'])
  assert.ok(body.websiteVerdict.checkedAt)
  assert.doesNotMatch(JSON.stringify(body), /internal label|contacted|observationIds|account|contribution/)
  assert.equal(await usedReads(reader.accountId), before + 1)
  const etag = res.headers.get('etag')
  const again = await call(`/hub/v1/places/${placeId}`, { headers: { 'if-none-match': etag } })
  assert.equal(again.status, 304)
  assert.equal(await usedReads(reader.accountId), before + 1, 'a not-modified answer is not charged')
})

test('a cache miss is not_found and never reaches a provider', opts, async () => {
  const res = await call('/hub/v1/places/00000000-0000-4000-8000-000000000000')
  assert.equal(res.status, 404)
  assert.equal((await res.json()).code, 'not_found')
  const lookup = await call('/hub/v1/places/lookup', {
    method: 'POST',
    body: { items: [{ namespace: 'google', externalId: 'ChIJ-nowhere' }] }
  })
  assert.deepEqual((await lookup.json()).results, [{ status: 'not_found' }])
})

test('lookup maps identities to the canonical id, or says ambiguous', opts, async () => {
  const a = await publishedPlace('Lookup A')
  const b = await publishedPlace('Lookup B')
  const res = await call('/hub/v1/places/lookup', {
    method: 'POST',
    body: {
      items: [a.subject, { identities: [a.subject, b.subject] }, { namespace: 'osm', externalId: 'node/0' }]
    }
  })
  const { results } = await res.json()
  assert.deepEqual(results[0], { status: 'found', id: a.placeId, revision: 1 })
  assert.equal(results[1].status, 'ambiguous')
  assert.deepEqual(results[1].candidates, [a.placeId, b.placeId].sort())
  assert.deepEqual(results[2], { status: 'not_found' })
  const bad = await call('/hub/v1/places/lookup', { method: 'POST', body: { items: [] } })
  assert.equal(bad.status, 400)
})

test('a cell lists its places in bounded pages', opts, async () => {
  await publishedPlace('Cell A')
  await publishedPlace('Cell B')
  const res = await call('/hub/v1/places?cell=4885:235')
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(body.places.length >= 2)
  assert.ok(body.places.every((p) => p.fields.location.value.latitude === 48.8566))
  assert.equal((await call('/hub/v1/places?cell=nonsense')).status, 400)
})

test(
  'ACCEPTANCE: a client offline then back gets every revocation even with no quota left',
  opts,
  async () => {
    const head = (await (await call('/hub/v1/revocations', { token: broke.token })).json()).cursor
    const places = [
      await publishedPlace('Gone 1'),
      await publishedPlace('Gone 2'),
      await publishedPlace('Gone 3')
    ]
    await revokePlace(pool, { placeId: places[0].placeId, reason: 'review', actor: 'operator' })
    await suppressBusiness(pool, { placeId: places[1].placeId, reason: 'owner request', actor: 'operator' })
    await pool.query(
      `update wo_hub_observation set status = 'withdrawn', decided_at = now()
                     where subject_external_id = $1 and field = 'name'`,
      [places[2].subject.externalId]
    )
    // Out of data quota: places are refused...
    const live = await publishedPlace('Still here')
    const denied = await call(`/hub/v1/places/${live.placeId}`, { token: broke.token })
    assert.equal(denied.status, 429)
    assert.equal((await denied.json()).code, 'quota_exceeded')
    // ...but every revocation still comes through, page by page.
    const got = []
    let cursor = head
    for (;;) {
      const page = await (
        await call(`/hub/v1/revocations?cursor=${cursor}&limit=1`, { token: broke.token })
      ).json()
      got.push(...page.events.map((e) => [e.kind, e.placeId]))
      cursor = page.cursor
      if (!page.more) break
    }
    assert.deepEqual(got, [
      ['revoke', places[0].placeId],
      ['delete', places[1].placeId],
      ['revoke', places[2].placeId]
    ])
    assert.equal(await usedReads(broke.accountId), 0)
  }
)

test('an expired cursor answers 410 cursor_expired; a foreign one 400', opts, async () => {
  const bad = await call('/hub/v1/changes?cursor=c1.e30')
  assert.equal(bad.status, 400)
  await pool.query('update wo_hub_feed_state set change_floor = seq')
  const { rows } = await pool.query('select seq from wo_hub_feed_state')
  const { encodeCursor } = await import('../src/hub/feed.js')
  const old = encodeCursor('changes', BigInt(rows[0].seq) - 1n)
  const res = await call(`/hub/v1/changes?cursor=${old}`)
  assert.equal(res.status, 410)
  assert.equal((await res.json()).code, 'cursor_expired')
})

test('ACCEPTANCE: an old snapshot URL and an old image URL do not pass a revocation', opts, async () => {
  const first = await publishedPlace('Pictures')
  await observe(pool, { subject: first.subject, field: 'phone', value: '+33 1 00 00 00 00' })
  const second = await publish(first.placeId)
  const media = (
    await pool.query(
      `insert into wo_place_media (place_id, sha256, object_key, kind, source, source_url, mime, bytes)
       values ($1, 'abc', 'media/abc.webp', 'image', 'google_maps', 'https://example.com/p.jpg', 'image/webp', 10) returning id`,
      [first.placeId]
    )
  ).rows[0].id
  const oldUrl = `/hub/v1/places/${first.placeId}/snapshots/${first.snapshotId}`
  assert.equal((await call(oldUrl)).status, 200)
  assert.equal((await call(`/hub/v1/media/${media}`)).status, 200)
  // One picture revoked: its URL stops working, the place does not.
  const other = (
    await pool.query(
      `insert into wo_place_media (place_id, sha256, object_key, kind, source, source_url, mime, bytes)
       values ($1, 'def', 'media/def.webp', 'image', 'google_maps', 'https://example.com/q.jpg', 'image/webp', 10) returning id`,
      [first.placeId]
    )
  ).rows[0].id
  await revokeMedia(pool, { mediaId: other, reason: 'not this business' })
  assert.equal((await call(`/hub/v1/media/${other}`)).status, 410)
  // The whole place revoked: every old URL is refused.
  await revokePlace(pool, { placeId: first.placeId, reason: 'review', actor: 'operator' })
  for (const url of [
    oldUrl,
    `/hub/v1/places/${first.placeId}/snapshots/${second.snapshotId}`,
    `/hub/v1/places/${first.placeId}`,
    `/hub/v1/media/${media}`
  ]) {
    const res = await call(url)
    assert.equal(res.status, 410, url)
  }
})

test('a snapshot that showed a withdrawn observation is gone, even by its old URL', opts, async () => {
  const p = await publishedPlace('Withdrawn')
  await pool.query(
    `update wo_hub_observation set status = 'withdrawn', decided_at = now()
                     where subject_external_id = $1 and field = 'location'`,
    [p.subject.externalId]
  )
  const res = await call(`/hub/v1/places/${p.placeId}/snapshots/${p.snapshotId}`)
  assert.equal(res.status, 410)
  assert.equal((await res.json()).code, 'withdrawn')
})

test('a conflicted website reaches readers as conflicted with no value', opts, async () => {
  const p = await publishedPlace('Two sites', [
    { field: 'website', value: 'https://one.example/' },
    { field: 'website', value: 'https://two.example/', family: 'osm', objectId: 'node/2' }
  ])
  const body = await (await call(`/hub/v1/places/${p.placeId}`)).json()
  assert.equal(body.fields.website.status, 'conflicted')
  assert.equal(body.fields.website.value, null)
  assert.equal(body.fields.website.blocksBrief, true)
  assert.equal(body.websiteVerdict.state, 'conflicted')
})

test('a merged place sends readers to the surviving one; lookup follows it', opts, async () => {
  const old = await publishedPlace('Duplicate')
  const kept = await publishedPlace('Original')
  await mergePlace(pool, { placeId: old.placeId, intoPlaceId: kept.placeId, actor: 'operator' })
  const res = await call(`/hub/v1/places/${old.placeId}`)
  assert.equal(res.status, 301)
  assert.equal(res.headers.get('location'), `/hub/v1/places/${kept.placeId}`)
  const { results } = await (
    await call('/hub/v1/places/lookup', { method: 'POST', body: { items: [old.subject] } })
  ).json()
  assert.deepEqual(results, [{ status: 'found', id: kept.placeId, revision: 1 }])
})
