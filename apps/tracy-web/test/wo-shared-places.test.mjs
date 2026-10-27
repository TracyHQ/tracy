// Place research shared across deployments, slice 1 (tasks/plan-wo-shared-places.md §14): a sender
// researches a place with its pictures in the shared bucket, exports it, and pushes it through the real
// ingest door of a destination on ANOTHER database. Two scratch databases in one process; the shared bucket
// is an in-memory store both sides hold; the research domain is the real one with its network parts
// replaced; the pictures are real PNG bytes.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { routePlaceMediaObjects } from 'website-opportunities/src/place-media-store.js'
import { mintSession } from '../src/lib/session.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { exportPlaceBundle, pushPlaces } from 'website-opportunities/src/place-export.js'
import { IMPORT_TABLES } from 'website-opportunities/src/place-import.js'
import { addLink } from 'website-opportunities/src/places.js'
import { requestResearch } from 'website-opportunities/src/place-requests.js'
import { createRevision } from '../src/opportunities-build/revisions.js'
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const sender = fileDb()
const destination = fileDb()
before(sender.open)
before(destination.open)
beforeEach(sender.reset)
beforeEach(destination.reset)
after(sender.close)
after(destination.close)

const PLACE_ID = 'ChIJsharedAcrossDeployments'
const SITE = 'https://phoshared.example/'
const SECRET = 'S'.repeat(40)
const MARKER = 'ACCOUNT-ONLY-7f3a9c'
const BASE = '/api/website-opportunities'
const DOOR = '/api/internal/wo-places/v1/ingest'
const ENV = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const TEMPLATES = {
  cards: [
    {
      id: 'ja-restaurant',
      label: 'JA Restaurant',
      platforms: [{ platform: 'joomla', tag: 'ja-restaurant/j6', version: '2.0.1' }]
    }
  ]
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const one = async (pool, sql, params) => (await pool.query(sql, params)).rows[0]
const count = async (pool, table) => (await one(pool, `select count(*)::int as n from ${table}`)).n

let PNG
let PNG2
before(async () => {
  const png = (r) =>
    sharp({ create: { width: 40, height: 30, channels: 3, background: { r, g: 90, b: 30 } } })
      .png()
      .toBuffer()
  PNG = new Uint8Array(await png(200))
  PNG2 = new Uint8Array(await png(20))
})

/** An S3-like store in memory. `publicUrl` is null so the media door streams the bytes it read. */
function memoryStore() {
  const objects = new Map()
  return {
    objects,
    off: false,
    async put(key, bytes) {
      if (this.off) throw new Error('store is off')
      objects.set(key, Buffer.from(bytes))
      return true
    },
    async get(key) {
      if (this.off) throw new Error('store is off')
      return objects.has(key) ? new Response(objects.get(key)) : null
    },
    async head(key) {
      if (this.off) throw new Error('store is off')
      return objects.has(key) ? { size: objects.get(key).length } : null
    },
    async publicUrl() {
      return null
    }
  }
}

async function domainFor() {
  const real = await websiteOpportunitiesDomain()
  const blocked = {
    available: false,
    reason: 'credential_missing',
    collect: async () => ({ status: 'blocked' })
  }
  return {
    ...real,
    connectorsFor: () => ({
      website: {
        available: true,
        collect: async (ref) => ({
          source: 'website',
          status: 'complete',
          profile: { name: 'Pho Shared', bio: 'Noodles since 1990', phone: '+84 1', links: [] },
          pages: [{ url: ref, title: 'Pho Shared', text: 'Pho' }],
          media: [
            { url: `${SITE}pho.png`, kind: 'image', caption: 'pho' },
            { url: `${SITE}pho2.png`, kind: 'image', caption: 'broth' }
          ],
          coverage: { fetched: 1, total: 1 }
        })
      },
      facebook: blocked,
      instagram: blocked,
      tiktok: blocked,
      youtube: blocked
    }),
    fetchPlaceDetails: async (placeId) => ({ id: placeId, websiteUri: SITE, servesDinner: true }),
    fetchLimited: async (u) => ({
      url: u,
      status: 200,
      mime: 'image/png',
      bytes: u.endsWith('2.png') ? PNG2 : PNG,
      truncated: false
    })
  }
}

async function account(pool, email) {
  return (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
}

async function saveGoogle(pool, accountId, candidateExtra = {}) {
  const { row } = await insertOpportunity(pool, accountId, {
    name: 'Pho Shared',
    branch: null,
    provider: 'google-places',
    providerId: PLACE_ID,
    candidate: {
      provider: 'google-places',
      providerId: PLACE_ID,
      name: 'Pho Shared',
      socials: {},
      ...candidateExtra
    }
  })
  return row
}

/**
 * The sender's real research of the place, its pictures written through the routed store, and the
 * account's own data planted with MARKER everywhere it lives. @returns {Promise<string>} the place id
 */
async function researchOnSender({ bucket, artifacts }) {
  const pool = sender.pool
  const domain = await domainFor()
  const objects = routePlaceMediaObjects({ local: artifacts, shared: bucket })
  const ex = createExecutor({
    host: woHost,
    pool,
    shared: true,
    loadDomain: async () => domain,
    runtime: async () => ({
      keys: { google: 'AIza-test', apify: null },
      settings: normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false })
    }),
    objects,
    switchOn: async () => true,
    imageInfo: imageInfoWith(woHost),
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    log: { warn() {}, error() {}, log() {} }
  })
  const a = await account(pool, `${MARKER.toLowerCase()}@sender.test`)
  const opp = await saveGoogle(pool, a, { phone: `+1 ${MARKER}`, notes: MARKER })
  await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'sender-req-0001' })
  for (let i = 0; i < 20; i += 1) {
    const { claimed, done } = await ex.tick()
    if (!claimed) break
    await done
  }
  const placeId = opp.place_id
  const place = await one(pool, 'select * from wo_place where id = $1', [placeId])
  assert.ok(place.current_snapshot_id, 'the sender published a snapshot')
  // The account's own data, each carrying the marker or the account/opportunity id.
  await pool.query(
    `insert into wo_source (opportunity_id, source, ref, status, collected) values ($1, 'facebook', $2, 'complete', $3::jsonb)`,
    [opp.id, `https://facebook.com/${MARKER}`, JSON.stringify({ note: MARKER })]
  )
  await addLink(pool, placeId, 'instagram', 'https://www.instagram.com/phoshared/', 'website', {
    from: 'backfill',
    opportunityId: opp.id
  })
  await addLink(pool, placeId, 'facebook', `https://facebook.com/${MARKER}-operator`, 'operator', {
    from: 'ops'
  })
  await pool.query(
    `insert into wo_place_backfill (place_id, state, from_opportunity_id, from_account_id, detail)
     values ($1, 'done', $2, $3, $4::jsonb)`,
    [placeId, opp.id, a, JSON.stringify({ note: MARKER })]
  )
  await pool.query(
    `insert into wo_social_stat (stat_key, network, url, status, requested_by) values ($1, 'instagram', $2, 'done', $3)`,
    [`instagram:${MARKER}`, `https://www.instagram.com/${MARKER}/`, a]
  )
  await pool.query(
    `insert into wo_cost_ledger (budget_day, place_id, opportunity_id, account_id, provider, operation, reserved_cents, request_key)
     values (current_date, $1, $2, $3, 'google', 'place-details', 1, $4)`,
    [placeId, opp.id, a, MARKER]
  )
  const brief = await createRevision(pool, {
    accountId: a,
    opportunityId: opp.id,
    domain,
    templates: TEMPLATES
  })
  assert.ok(brief.revision, JSON.stringify(brief.errors))
  return { placeId, accountId: a, opportunityId: opp.id }
}

function destinationApp({ bucket, artifacts = memoryStore(), env = { WO_PLACES_INGEST_SECRET: SECRET } }) {
  const config = readConfig({ ...ENV, ...env })
  return buildApp({
    config,
    pool: destination.pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: domainFor,
    websiteOpportunitiesRequest: async () => Response.json({ templates: TEMPLATES.cards }),
    websiteOpportunitiesObjects: routePlaceMediaObjects({ local: artifacts, shared: bucket }),
    fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 })
  })
}

async function post(app, body, headers = { 'x-tracy-wo-places-secret': SECRET }) {
  const res = await app.fetch(
    new Request(`${ENV.TRACY_ORIGIN}${DOOR}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  )
  const text = await res.text()
  let parsed = text
  try {
    parsed = JSON.parse(text)
  } catch {}
  return { status: res.status, body: parsed }
}

async function customer(app, email) {
  const cookie = `tracy_sess=${await mintSession(email, 's'.repeat(32))}`
  await destination.pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, '{"website-opportunities": true}'::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`
  )
  return async (method, path, body) => {
    const headers = { origin: ENV.TRACY_ORIGIN, cookie }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`${ENV.TRACY_ORIGIN}${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    )
    const type = res.headers.get('content-type') ?? ''
    return {
      status: res.status,
      body: type.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer())
    }
  }
}

async function tableCounts(pool) {
  const { rows } = await pool.query(
    `select table_name from information_schema.tables
     where table_schema = current_schema() and table_type = 'BASE TABLE' and table_name <> 'schema_migration'`
  )
  const counts = {}
  for (const { table_name: t } of rows) counts[t] = await count(pool, `"${t}"`)
  return counts
}

test('the sender stores new place pictures under content-addressed shared keys', opts, async () => {
  const bucket = memoryStore()
  const artifacts = memoryStore()
  const { placeId } = await researchOnSender({ bucket, artifacts })
  const { rows } = await sender.pool.query(
    `select sha256, object_key from wo_place_media where place_id = $1 and status = 'stored'`,
    [placeId]
  )
  assert.equal(rows.length, 2)
  for (const r of rows) {
    assert.equal(r.object_key, `media/other/${r.sha256.slice(0, 2)}/${r.sha256}.png`)
    assert.equal(sha(bucket.objects.get(r.object_key)), r.sha256)
  }
  assert.equal([...artifacts.objects.keys()].filter((k) => k.startsWith('places/')).length, 0)
})

test(
  '1. no account data leaves the sender and the destination writes only the allow-listed tables',
  opts,
  async () => {
    const bucket = memoryStore()
    const { placeId, accountId, opportunityId } = await researchOnSender({ bucket, artifacts: memoryStore() })
    const bundle = await exportPlaceBundle(sender.pool, placeId, { origin: 'sender-test' })
    const text = JSON.stringify(bundle)
    for (const secret of [MARKER, MARKER.toLowerCase(), accountId, opportunityId, placeId])
      assert.equal(text.includes(secret), false, `the bundle carries ${secret}`)
    assert.deepEqual(
      bundle.links.map((l) => [l.kind, l.verifiedBy, l.evidence]).sort(),
      [
        ['instagram', 'website', { from: 'backfill' }],
        ['website', 'google', { from: 'google-place-details' }]
      ].sort(),
      'operator links stay home and evidence keeps only `from`'
    )

    const before = await tableCounts(destination.pool)
    const res = await post(destinationApp({ bucket }), bundle)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.outcome, 'imported')
    const afterCounts = await tableCounts(destination.pool)
    const changed = Object.keys(afterCounts)
      .filter((t) => afterCounts[t] !== before[t])
      .sort()
    assert.deepEqual(changed, [...IMPORT_TABLES].filter((t) => changed.includes(t)).sort())
    assert.ok(changed.includes('wo_place_snapshot'))
    assert.ok(changed.includes('wo_place_import'))

    const dump = JSON.stringify(
      await Promise.all(
        IMPORT_TABLES.map(async (t) => (await destination.pool.query(`select * from ${t}`)).rows)
      )
    )
    assert.equal(dump.includes(MARKER), false)
    assert.equal(dump.includes(opportunityId), false)
    assert.equal(dump.includes(accountId), false)
  }
)

test('1b. the importer source writes no table outside its allow-list', () => {
  const source = readFileSync(
    new URL('../../../packages/wo/website-opportunities/src/place-import.js', import.meta.url),
    'utf8'
  )
  const written = [...source.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+([a-z_]+)/gi)].map(
    (m) => m[1]
  )
  assert.ok(written.length > 0)
  for (const table of written) assert.ok(IMPORT_TABLES.includes(table), `the importer writes ${table}`)
  for (const banned of ['wo_opportunity', 'wo_job', 'wo_revision', 'wo_source', 'wo_cost_ledger', 'account'])
    assert.equal(IMPORT_TABLES.includes(banned), false)
})

test(
  '2. ingest is idempotent: sent again, or three at once, it is one place and one snapshot',
  opts,
  async () => {
    const bucket = memoryStore()
    const { placeId } = await researchOnSender({ bucket, artifacts: memoryStore() })
    const bundle = await exportPlaceBundle(sender.pool, placeId, { origin: 'sender-test' })
    const app = destinationApp({ bucket })
    const outcomes = (await Promise.all([post(app, bundle), post(app, bundle), post(app, bundle)])).map(
      (r) => r.body.outcome
    )
    assert.deepEqual(outcomes.sort(), ['imported', 'skipped_existing', 'skipped_existing'])
    const again = await post(app, bundle)
    assert.equal(again.body.outcome, 'skipped_existing')
    assert.equal(await count(destination.pool, 'wo_place'), 1)
    assert.equal(await count(destination.pool, 'wo_place_snapshot'), 1)
    assert.equal(await count(destination.pool, 'wo_place_media'), bundle.snapshot.media.length)
    assert.equal(await count(destination.pool, 'wo_place_import'), 4, 'one audit row per POST')
    const audit = (await destination.pool.query(`select * from wo_place_import order by received_at`)).rows
    assert.ok(audit.every((r) => r.origin === 'sender-test'))
    const imported = audit.find((r) => r.outcome === 'imported')
    assert.equal(imported.media_rows, bundle.snapshot.media.length)
    assert.equal(imported.snapshots, 1)
  }
)

test('2b. a snapshot already imported from this origin is never imported twice', opts, async () => {
  const bucket = memoryStore()
  const { placeId } = await researchOnSender({ bucket, artifacts: memoryStore() })
  const bundle = await exportPlaceBundle(sender.pool, placeId, { origin: 'sender-test' })
  const app = destinationApp({ bucket })
  assert.equal((await post(app, bundle)).body.outcome, 'imported')
  // The place lost its current snapshot here (an operator split, say): the same push stays a no-op.
  await destination.pool.query('update wo_place set current_snapshot_id = null')
  const again = await post(app, bundle)
  assert.equal(again.status, 200)
  assert.equal(again.body.outcome, 'skipped_existing')
  assert.equal(await count(destination.pool, 'wo_place_snapshot'), 1)
})

test(
  '3. pictures load on the destination with the sender store switched off; a stranger is refused',
  opts,
  async () => {
    const bucket = memoryStore()
    const senderArtifacts = memoryStore()
    const { placeId } = await researchOnSender({ bucket, artifacts: senderArtifacts })
    const bundle = await exportPlaceBundle(sender.pool, placeId, { origin: 'sender-test' })
    senderArtifacts.off = true
    const app = destinationApp({ bucket })
    assert.equal((await post(app, bundle)).body.outcome, 'imported')

    const call = await customer(app, 'buyer@destination.test')
    const opp = (
      await call('POST', BASE, {
        candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'Pho Shared', socials: {} }
      })
    ).body.opportunity
    const detail = (await call('GET', `${BASE}/${opp.id}`)).body
    assert.equal(detail.media.length, 2)
    const destinationPlace = await one(destination.pool, 'select id from wo_place')
    assert.notEqual(destinationPlace.id, placeId, 'the destination made its own place id')
    for (const m of detail.media) {
      const read = await call('GET', `${BASE}/media/${m.id}`)
      assert.equal(read.status, 200)
      const row = await one(destination.pool, 'select sha256 from wo_place_media where id = $1', [m.id])
      assert.equal(sha(read.body), row.sha256)
    }
    const stranger = await customer(app, 'stranger@destination.test')
    assert.equal((await stranger('GET', `${BASE}/media/${detail.media[0].id}`)).status, 404)
  }
)

test(
  '4. the door: 404 unconfigured or wrong secret before the body is read, 413 when too large',
  opts,
  async () => {
    const bucket = memoryStore()
    const body = () => new TextEncoder().encode('{}')
    const requests = []
    const send = (app, headers, payload) => {
      const req = new Request(`${ENV.TRACY_ORIGIN}${DOOR}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: payload,
        duplex: 'half'
      })
      requests.push(req)
      return app.fetch(req)
    }
    const unconfigured = destinationApp({ bucket, env: {} })
    assert.equal((await send(unconfigured, { 'x-tracy-wo-places-secret': SECRET }, body())).status, 404)
    const app = destinationApp({ bucket })
    assert.equal((await send(app, {}, body())).status, 404)
    assert.equal((await send(app, { 'x-tracy-wo-places-secret': `${SECRET}x` }, body())).status, 404)
    assert.equal((await send(app, { 'x-tracy-wo-places-secret': 'T'.repeat(40) }, body())).status, 404)
    assert.ok(
      requests.every((r) => !r.bodyUsed),
      'a refused call never reads the body'
    )

    const big = 'x'.repeat(4 * 1024 * 1024 + 1)
    const declared = await post(app, `{"pad":"${big}"}`)
    assert.equal(declared.status, 413)
    const chunked = new ReadableStream({
      start(controller) {
        for (let i = 0; i < 5; i += 1) controller.enqueue(new TextEncoder().encode('x'.repeat(1024 * 1024)))
        controller.close()
      }
    })
    assert.equal((await send(app, { 'x-tracy-wo-places-secret': SECRET }, chunked)).status, 413)

    const invalid = await post(app, { schema: 'tracy-wo-place-bundle/v1', origin: 'x', extra: true })
    assert.equal(invalid.status, 400)
    assert.equal(invalid.body.outcome, 'invalid')
    assert.equal(await count(destination.pool, 'wo_place'), 0)
  }
)

test('5. a missing or wrong object publishes nothing', opts, async () => {
  const bucket = memoryStore()
  const { placeId } = await researchOnSender({ bucket, artifacts: memoryStore() })
  const bundle = await exportPlaceBundle(sender.pool, placeId, { origin: 'sender-test' })
  const app = destinationApp({ bucket })
  const [first, second] = bundle.snapshot.media.filter((m) => m.status === 'stored')

  const kept = bucket.objects.get(first.objectKey)
  bucket.objects.delete(first.objectKey)
  const missing = await post(app, bundle)
  assert.equal(missing.status, 422)
  assert.equal(missing.body.outcome, 'media_missing')
  bucket.objects.set(first.objectKey, kept)

  bucket.objects.set(
    second.objectKey,
    Buffer.concat([bucket.objects.get(second.objectKey), Buffer.from([0])])
  )
  assert.equal((await post(app, bundle)).body.outcome, 'media_missing', 'a size that differs from the row')

  const forged = structuredClone(bundle)
  forged.snapshot.media[0].sha256 = 'f'.repeat(64)
  assert.equal((await post(app, forged)).body.outcome, 'invalid', 'a key that does not name the row sha')

  assert.equal(await count(destination.pool, 'wo_place'), 0)
  assert.equal(await count(destination.pool, 'wo_place_snapshot'), 0)
  assert.equal(await count(destination.pool, 'wo_place_media'), 0)
  assert.deepEqual(
    (await destination.pool.query('select outcome from wo_place_import order by received_at')).rows.map(
      (r) => r.outcome
    ),
    ['media_missing', 'media_missing', 'invalid']
  )
})

test(
  '5b. a place with its own snapshot or research is left alone; an identity split is a conflict',
  opts,
  async () => {
    const bucket = memoryStore()
    const { placeId } = await researchOnSender({ bucket, artifacts: memoryStore() })
    const bundle = await exportPlaceBundle(sender.pool, placeId, { origin: 'sender-test' })
    const app = destinationApp({ bucket })
    const pool = destination.pool
    const a = await account(pool, 'early@destination.test')
    const opp = await saveGoogle(pool, a)
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'destination-req-1' })
    assert.equal((await post(app, bundle)).body.outcome, 'retry_later')
    assert.equal(await count(pool, 'wo_place_snapshot'), 0)

    const split = structuredClone(bundle)
    const other = (await pool.query(`insert into wo_place (display_name) values ('other') returning id`))
      .rows[0].id
    await pool.query(
      `insert into wo_place_identity (namespace, external_id, place_id, source) values ('url', $1, $2, 'url')`,
      ['https://split.example/', other]
    )
    split.identities.push({
      namespace: 'url',
      externalId: 'https://split.example/',
      source: 'url',
      confidence: 1
    })
    assert.equal((await post(app, split)).body.outcome, 'conflict')
  }
)

test(
  '6. the destination reuses the imported research: no new research, a brief from the imported snapshot',
  opts,
  async () => {
    const bucket = memoryStore()
    const { placeId } = await researchOnSender({ bucket, artifacts: memoryStore() })
    const app = destinationApp({ bucket })
    const pushed = await pushPlaces({
      pool: sender.pool,
      placeIds: [placeId],
      to: ENV.TRACY_ORIGIN,
      secret: SECRET,
      origin: 'sender-test',
      fetchImpl: (url, init) => app.fetch(new Request(url, init))
    })
    assert.equal(pushed.length, 1)
    assert.equal(pushed[0].outcome, 'imported')
    assert.match(pushed[0].line, /outcome=imported/)
    const imported = await one(
      destination.pool,
      'select snapshot_id from wo_place_import where outcome = $1',
      ['imported']
    )

    const call = await customer(app, 'later@destination.test')
    const opp = (
      await call('POST', BASE, {
        candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'Pho Shared', socials: {} }
      })
    ).body.opportunity
    const research = await call('POST', `${BASE}/${opp.id}/research`, { requestId: 'destination-req-0001' })
    assert.equal(research.body.job.state, 'completed', JSON.stringify(research.body))
    assert.equal(research.body.job.resultSnapshotId, imported.snapshot_id)
    assert.equal(await count(destination.pool, 'wo_place_job'), 0, 'no research ran on the destination')
    const detail = (await call('GET', `${BASE}/${opp.id}`)).body
    assert.equal(detail.profile.phone, '+84 1')

    const laterAccount = (
      await one(destination.pool, `select id from account where email = 'later@destination.test'`)
    ).id
    const brief = await createRevision(destination.pool, {
      accountId: laterAccount,
      opportunityId: opp.id,
      domain: await domainFor(),
      templates: TEMPLATES
    })
    assert.ok(brief.revision, JSON.stringify(brief.errors))
    assert.equal(brief.revision.place_snapshot_id, imported.snapshot_id)
  }
)

test(
  'the exporter refuses a place whose stored pictures are not in the shared bucket yet',
  opts,
  async () => {
    const bucket = memoryStore()
    const { placeId } = await researchOnSender({ bucket, artifacts: memoryStore() })
    const row = await one(
      sender.pool,
      `select id, sha256, object_key from wo_place_media where status = 'stored' limit 1`
    )
    await sender.pool.query('update wo_place_media set object_key = $2 where id = $1', [
      row.id,
      `places/${placeId}/${row.sha256}.png`
    ])
    await assert.rejects(
      () => exportPlaceBundle(sender.pool, placeId, { origin: 'sender-test' }),
      (e) => e.code === 'MEDIA_NOT_SHARED'
    )
  }
)
