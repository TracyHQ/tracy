// An approved card is final (#537 R23), and so is the research it shows: once its Business facts are approved, nothing
// done on another card of the same place (a new research, Research again, a one-part retry that found the same data)
// changes what the approved card reads, its Details and its next Content brief alike.
// Real Postgres, a fictional place, the real domain with its network parts replaced.
//
//   TEST_DATABASE_URL=… node --test --test-concurrency=1 apps/tracy-web/test/wo-approval-freeze.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { requestResearch } from 'website-opportunities/src/place-requests.js'
import { insertNewOpportunity } from 'website-opportunities/src/store.js'
import { createTracyWoHost } from '../src/wo-host.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const woHost = createTracyWoHost()
const PLACE_ID = 'ChIJfreezeLanternBakery'
const SITE = 'https://lantern-bakery.example/'
const BASE = '/api/website-opportunities'
const A = 'a@tracy.test'
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

/** What the website says, per research round: the second round finds other words, another phone and another photo. */
const ROUNDS = {
  1: { bio: 'Sourdough baked at dawn since 1998', phone: '+1 555 0140', photo: 'oven.png' },
  2: { bio: 'Now a coffee bar with no bread at all', phone: '+1 555 0199', photo: 'espresso.png' }
}
let round = 1

let PNG
before(async () => {
  PNG = new Uint8Array(
    await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 120, g: 80, b: 40 } } })
      .png()
      .toBuffer()
  )
})

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
          profile: { name: 'Lantern Bakery', bio: ROUNDS[round].bio, phone: ROUNDS[round].phone, links: [] },
          pages: [{ url: ref, title: 'Lantern Bakery', text: ROUNDS[round].bio }],
          media: [{ url: `${SITE}${ROUNDS[round].photo}`, kind: 'image', caption: 'the shop' }],
          coverage: { fetched: 1, total: 1 }
        })
      },
      facebook: blocked,
      instagram: blocked,
      tiktok: blocked,
      youtube: blocked
    }),
    fetchPlaceDetails: async (placeId) => ({ id: placeId, websiteUri: SITE }),
    // Each photo its own bytes, so the second round's photo is another picture.
    fetchLimited: async (u) => ({
      url: u,
      status: 200,
      mime: 'image/png',
      bytes: u.endsWith(ROUNDS[2].photo) ? new Uint8Array([...PNG, 1]) : PNG,
      truncated: false
    })
  }
}

async function world() {
  const pool = db.pool
  const config = readConfig(ENV)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: domainFor,
    websiteOpportunitiesRequest: async () => Response.json({ templates: [] }),
    websiteOpportunitiesObjects: {
      put: async () => true,
      get: async () => null,
      publicUrl: async () => null
    },
    dnsResolve: async () => [{ address: '2606:4700:4700::1111', family: 6 }],
    fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 })
  })
  await pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify({ 'website-opportunities': true })]
  )
  const domain = await domainFor()
  const ex = createExecutor({
    host: woHost,
    pool,
    shared: true,
    loadDomain: async () => domain,
    runtime: async () => ({
      keys: { google: 'AIza-test', apify: null },
      settings: normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false })
    }),
    objects: { put: async () => true },
    switchOn: async () => true,
    imageInfo: imageInfoWith(woHost),
    resolve: async () => [{ address: '2606:4700:4700::1111', family: 6 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    log: { warn() {}, error() {}, log() {} }
  })
  const drain = async () => {
    for (let i = 0; i < 20; i += 1) {
      const { claimed, done } = await ex.tick()
      if (!claimed) return
      await done
    }
  }
  const call = async (email, method, path, body) => {
    const headers = {
      origin: ENV.TRACY_ORIGIN,
      cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`
    }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`${ENV.TRACY_ORIGIN}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const accountOf = async (email) => {
    await call(email, 'POST', BASE, {
      candidate: { provider: 'osm', providerId: `seed/${email}`, name: 'Seed', lat: 1, lon: 1, socials: {} }
    })
    await pool.query('delete from wo_opportunity where provider_id = $1', [`seed/${email}`])
    return (await pool.query('select id from account where email = $1', [email])).rows[0].id
  }
  const newCard = async (accountId, socials = {}) =>
    (
      await insertNewOpportunity(pool, accountId, {
        name: 'Lantern Bakery',
        branch: null,
        provider: 'google-places',
        providerId: PLACE_ID,
        candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'Lantern Bakery', socials }
      })
    ).row
  return { pool, call, drain, accountOf, newCard }
}

/** Poll a Content brief job until it settles, the way the client does. */
async function settled(call, oppId, jobId) {
  for (let i = 0; i < 100; i += 1) {
    const res = await call(A, 'GET', `${BASE}/${oppId}/brief-jobs/${jobId}`)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    if (res.body.job.state !== 'running') return res.body
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('the brief job never settled')
}

/** Everything Details shows of the research: the facts, the sources table with its dates, the photos, the saved profile. */
const shown = (detail) => ({
  place: detail.place,
  sources: detail.sources,
  profile: detail.profile,
  media: detail.media,
  menu: detail.menu,
  placeProfile: detail.placeProfile?.profile ?? null
})

test(
  'an approved card keeps the research it was approved with while another card of the place researches again',
  opts,
  async () => {
    round = 1
    const w = await world()
    const a = await w.accountOf(A)
    const first = await w.newCard(a)
    await requestResearch(w.pool, { accountId: a, opportunity: first, requestId: 'freeze-research-01' })
    await w.drain()
    const approved = await w.call(A, 'POST', `${BASE}/${first.id}/profile/approve`)
    assert.equal(approved.status, 200, JSON.stringify(approved.body))
    const before = shown((await w.call(A, 'GET', `${BASE}/${first.id}`)).body)
    assert.equal(before.profile.bio, ROUNDS[1].bio)
    assert.ok(before.media.some((m) => m.sourceUrl.endsWith(ROUNDS[1].photo)))

    // A second card of the same place: a one-part retry that finds the same data carries its tries onto the snapshot
    // the first card was approved on.
    const second = await w.newCard(a)
    assert.notEqual(second.id, first.id)
    await requestResearch(w.pool, {
      accountId: a,
      opportunity: second,
      requestId: 'freeze-research-02',
      onlySource: 'website'
    })
    await w.drain()
    assert.deepEqual(
      shown((await w.call(A, 'GET', `${BASE}/${first.id}`)).body),
      before,
      'a one-part retry of another card'
    )

    // A full research of the second card that finds other words, another phone and another photo.
    round = 2
    await requestResearch(w.pool, {
      accountId: a,
      opportunity: second,
      requestId: 'freeze-research-03',
      force: true
    })
    await w.drain()
    const other = (await w.call(A, 'GET', `${BASE}/${second.id}`)).body
    assert.equal(other.profile.bio, ROUNDS[2].bio, 'the second card reads the new research')
    assert.notEqual(other.place.snapshotId, before.place.snapshotId)
    assert.deepEqual(
      shown((await w.call(A, 'GET', `${BASE}/${first.id}`)).body),
      before,
      'a new research of another card'
    )

    // The first card's Content brief, made after that, is made from the research it was approved with.
    const pressed = await w.call(A, 'POST', `${BASE}/${first.id}/revisions`, { requestId: 'freeze-brief-01' })
    assert.equal(pressed.status, 202, JSON.stringify(pressed.body))
    const done = await settled(w.call, first.id, pressed.body.job.id)
    assert.equal(done.job.state, 'done', JSON.stringify(done.job.error))
    const revision = (
      await w.pool.query(
        'select place_snapshot_id, profile_effective from wo_revision where opportunity_id = $1 order by n desc limit 1',
        [first.id]
      )
    ).rows[0]
    assert.equal(revision.place_snapshot_id, before.place.snapshotId)
    assert.equal(revision.profile_effective.bio, ROUNDS[1].bio)
    // After a brief, the saved profile is the one that brief froze (`saved-profile-read.js`): made from the same research.
    const later = shown((await w.call(A, 'GET', `${BASE}/${first.id}`)).body)
    assert.deepEqual({ ...later, placeProfile: null }, { ...before, placeProfile: null }, 'after the brief')
    const saved = JSON.stringify(later.placeProfile)
    assert.ok(saved.includes(ROUNDS[1].phone), 'the saved profile states the approved phone')
    assert.ok(
      !saved.includes(ROUNDS[2].phone) && !saved.includes(ROUNDS[2].bio),
      'nothing of the new research'
    )
  }
)

test('a card not approved yet still follows the place research of another card', opts, async () => {
  round = 1
  const w = await world()
  const a = await w.accountOf(A)
  const first = await w.newCard(a)
  await requestResearch(w.pool, { accountId: a, opportunity: first, requestId: 'open-research-01' })
  await w.drain()
  const second = await w.newCard(a)
  round = 2
  await requestResearch(w.pool, {
    accountId: a,
    opportunity: second,
    requestId: 'open-research-02',
    force: true
  })
  await w.drain()
  assert.equal((await w.call(A, 'GET', `${BASE}/${first.id}`)).body.profile.bio, ROUNDS[2].bio)
})

test('an approved card keeps the social measurements it was approved with', opts, async () => {
  round = 1
  const w = await world()
  const a = await w.accountOf(A)
  const INSTAGRAM = 'https://www.instagram.com/lanternbakery/'
  const first = await w.newCard(a, { instagram: INSTAGRAM })
  await w.pool.query(
    `insert into wo_social_stat (stat_key, network, url, status, handle, followers, fetched_at)
     values ('instagram:lanternbakery', 'instagram', $1, 'done', 'lanternbakery', 1234, now())`,
    [INSTAGRAM]
  )
  await requestResearch(w.pool, { accountId: a, opportunity: first, requestId: 'stats-research-01' })
  await w.drain()
  const followers = async () =>
    JSON.stringify((await w.call(A, 'GET', `${BASE}/${first.id}/place-profile`)).body.profile)
  assert.ok((await followers()).includes('1234'), 'the measurement reaches the place profile')
  assert.equal((await w.call(A, 'POST', `${BASE}/${first.id}/profile/approve`)).status, 200)
  assert.ok((await followers()).includes('1234'))
  // Another card's refresh of the same profile measures it again.
  await w.pool.query("update wo_social_stat set followers = 98765 where stat_key = 'instagram:lanternbakery'")
  const after = await followers()
  assert.ok(after.includes('1234') && !after.includes('98765'), after)
})
