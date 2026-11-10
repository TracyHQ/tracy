// The seller approves the Profile, then the Content brief, before the next step unlocks (#537): the approve doors set
// their times, a Profile edit or an added photo after approval asks for review again and marks the brief stale, a
// source added after research asks for research again, and the brief and build doors refuse with the reason.
// Real Postgres, a fictional place, the real domain with its network parts replaced.
//
//   TEST_DATABASE_URL=… node --test --test-concurrency=1 apps/tracy-web/test/wo-approval.test.mjs
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
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { createTracyWoHost } from '../src/wo-host.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const woHost = createTracyWoHost()
const PLACE_ID = 'ChIJapprovalHarborGym'
const SITE = 'https://harbor-gym.example/'
const BASE = '/api/website-opportunities'
const A = 'a@tracy.test'
const B = 'b@tracy.test'
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

let PNG
before(async () => {
  PNG = new Uint8Array(
    await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 90, b: 30 } } })
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
          profile: {
            name: 'Harbor Gym',
            bio: 'Strength classes since 2001',
            phone: '+1 555 0100',
            links: []
          },
          pages: [{ url: ref, title: 'Harbor Gym', text: 'Classes' }],
          media: [{ url: `${SITE}hall.png`, kind: 'image', caption: 'the hall' }],
          coverage: { fetched: 1, total: 1 }
        })
      },
      facebook: blocked,
      instagram: blocked,
      tiktok: blocked,
      youtube: blocked
    }),
    fetchPlaceDetails: async (placeId) => ({ id: placeId, websiteUri: SITE }),
    fetchLimited: async (u) => ({ url: u, status: 200, mime: 'image/png', bytes: PNG, truncated: false })
  }
}

async function world() {
  const pool = db.pool
  const kept = new Map()
  const stored = {
    put: async (key, bytes) => (kept.set(key, bytes), true),
    get: async (key) => (kept.has(key) ? new Response(kept.get(key)) : null),
    publicUrl: async () => null
  }
  const config = readConfig(ENV)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: domainFor,
    websiteOpportunitiesRequest: async () => Response.json({ templates: [] }),
    websiteOpportunitiesObjects: stored,
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
    const headers = { origin: ENV.TRACY_ORIGIN }
    if (email) headers.cookie = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
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
  const upload = async (email, path, bytes, name = 'counter.png') => {
    const form = new FormData()
    form.append('file', new Blob([bytes]), name)
    const res = await app.fetch(
      new Request(`${ENV.TRACY_ORIGIN}${path}`, {
        method: 'POST',
        headers: {
          origin: ENV.TRACY_ORIGIN,
          cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`
        },
        body: form
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
  const saveGoogle = async (accountId) =>
    (
      await insertOpportunity(pool, accountId, {
        name: 'Harbor Gym',
        branch: null,
        provider: 'google-places',
        providerId: PLACE_ID,
        candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'Harbor Gym', socials: {} }
      })
    ).row
  return { pool, call, drain, accountOf, saveGoogle, kept, upload }
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

/** A researched card of account A. */
async function researchedCard(w) {
  const a = await w.accountOf(A)
  const opp = await w.saveGoogle(a)
  await requestResearch(w.pool, { accountId: a, opportunity: opp, requestId: 'approval-research-01' })
  await w.drain()
  return { a, opp }
}

async function makeBrief(w, opp, requestId) {
  const pressed = await w.call(A, 'POST', `${BASE}/${opp.id}/revisions`, { requestId })
  assert.equal(pressed.status, 202, JSON.stringify(pressed.body))
  const done = await settled(w.call, opp.id, pressed.body.job.id)
  assert.equal(done.job.state, 'done', JSON.stringify(done.job.error))
  return done.revision
}

const build = (w, opp, requestId) =>
  w.call(A, 'POST', `${BASE}/${opp.id}/demo/build`, { requestId, selection: { cms: 'joomla' } })

test(
  'the Profile is approved before the brief, the brief before a build; each door says why it refuses',
  opts,
  async () => {
    const w = await world()
    const a = await w.accountOf(A)
    const fresh = await w.saveGoogle(a)
    // Before research there is nothing to approve.
    const early = await w.call(A, 'POST', `${BASE}/${fresh.id}/profile/approve`)
    assert.equal(early.status, 409)
    assert.equal(early.body.code, 'RESEARCH_NOT_DONE')
    assert.equal((await w.call(A, 'GET', `${BASE}/${fresh.id}`)).body.approval.profile, 'none')

    await requestResearch(w.pool, { accountId: a, opportunity: fresh, requestId: 'approval-research-02' })
    await w.drain()
    const researched = await w.call(A, 'GET', `${BASE}/${fresh.id}`)
    assert.equal(researched.body.approval.profile, 'needed')
    assert.equal(researched.body.approval.brief, 'none')
    const listed = await w.call(A, 'GET', `${BASE}?limit=10`)
    assert.equal(listed.body.opportunities.find((o) => o.id === fresh.id).approval.profile, 'needed')

    const locked = await w.call(A, 'POST', `${BASE}/${fresh.id}/revisions`, {
      requestId: 'approval-brief-01'
    })
    assert.equal(locked.status, 409)
    assert.equal(locked.body.code, 'PROFILE_NOT_APPROVED')
    assert.equal((await build(w, fresh, 'approval-build-01')).body.code, 'PROFILE_NOT_APPROVED')
    // Another account cannot approve it.
    await w.accountOf(B)
    assert.equal((await w.call(B, 'POST', `${BASE}/${fresh.id}/profile/approve`)).status, 404)

    const approved = await w.call(A, 'POST', `${BASE}/${fresh.id}/profile/approve`)
    assert.equal(approved.status, 200, JSON.stringify(approved.body))
    assert.equal(approved.body.approval.profile, 'approved')
    assert.ok(Date.parse(approved.body.approval.profileApprovedAt) > Date.now() - 60_000)
    assert.equal((await w.call(A, 'POST', `${BASE}/${fresh.id}/brief/approve`)).body.code, 'NO_BRIEF')

    await makeBrief(w, fresh, 'approval-brief-02')
    const made = await w.call(A, 'GET', `${BASE}/${fresh.id}`)
    assert.equal(made.body.approval.brief, 'needed')
    const blocked = await build(w, fresh, 'approval-build-02')
    assert.equal(blocked.status, 409)
    assert.equal(blocked.body.code, 'BRIEF_NOT_APPROVED')

    const briefOk = await w.call(A, 'POST', `${BASE}/${fresh.id}/brief/approve`)
    assert.equal(briefOk.status, 200, JSON.stringify(briefOk.body))
    assert.equal(briefOk.body.approval.brief, 'approved')
    const open = await build(w, fresh, 'approval-build-03')
    assert.ok(
      !['PROFILE_NOT_APPROVED', 'BRIEF_NOT_APPROVED', 'RESEARCH_NEEDED'].includes(open.body?.code),
      JSON.stringify(open.body)
    )
  }
)

test('a Profile edit after approval asks for review again and marks the brief stale', opts, async () => {
  const w = await world()
  const { opp } = await researchedCard(w)
  await w.call(A, 'POST', `${BASE}/${opp.id}/profile/approve`)
  await makeBrief(w, opp, 'stale-brief-01')
  await w.call(A, 'POST', `${BASE}/${opp.id}/brief/approve`)
  assert.equal((await w.call(A, 'GET', `${BASE}/${opp.id}`)).body.approval.brief, 'approved')

  const edited = await w.call(A, 'PUT', `${BASE}/${opp.id}/profile`, { edits: { phone: '+1 555 0177' } })
  assert.equal(edited.status, 200)
  const after = (await w.call(A, 'GET', `${BASE}/${opp.id}`)).body.approval
  assert.equal(after.profile, 'needed')
  assert.equal(after.profileApprovedAt, null)
  assert.equal(after.brief, 'stale')
  assert.equal(after.briefStale, 'profile')
  assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/brief/approve`)).body.code, 'BRIEF_STALE')
  assert.equal((await build(w, opp, 'stale-build-01')).body.code, 'PROFILE_NOT_APPROVED')
  // Approve again, make the brief again from the edited Profile, approve it: Build opens again.
  await w.call(A, 'POST', `${BASE}/${opp.id}/profile/approve`)
  assert.equal((await build(w, opp, 'stale-build-02')).body.code, 'BRIEF_NOT_APPROVED')
  await makeBrief(w, opp, 'stale-brief-02')
  assert.equal((await w.call(A, 'GET', `${BASE}/${opp.id}`)).body.approval.brief, 'needed')
  assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/brief/approve`)).status, 200)
  // An edit that leaves what the brief reads as it was (an edit undone): making the brief again answers the same
  // revision (`reused`), and the brief is no longer stale, only waiting for its approval.
  await w.pool.query(
    'update wo_opportunity set profile_changed_at = now(), profile_approved_at = null where id = $1',
    [opp.id]
  )
  assert.equal((await w.call(A, 'GET', `${BASE}/${opp.id}`)).body.approval.brief, 'stale')
  await w.call(A, 'POST', `${BASE}/${opp.id}/profile/approve`)
  const pressed = await w.call(A, 'POST', `${BASE}/${opp.id}/revisions`, { requestId: 'stale-brief-03' })
  const again = await settled(w.call, opp.id, pressed.body.job.id)
  assert.equal(again.job.reused, true)
  const listedAgain = (await w.call(A, 'GET', `${BASE}?limit=10`)).body.opportunities.find(
    (o) => o.id === opp.id
  )
  assert.equal(listedAgain.approval.brief, 'needed')
  const detail = (await w.call(A, 'GET', `${BASE}/${opp.id}`)).body
  assert.equal(detail.approval.brief, 'needed')
  assert.deepEqual(detail.stepProgress, { step: null, items: [] })
  assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/brief/approve`)).status, 200)
})

test(
  'a source added after research asks for research again; before research it is only added',
  opts,
  async () => {
    const w = await world()
    const a = await w.accountOf(A)
    const fresh = await w.saveGoogle(a)
    const bad = await w.call(A, 'POST', `${BASE}/${fresh.id}/sources`, { url: 'not a link' })
    assert.ok([400, 422].includes(bad.status), JSON.stringify(bad.body))
    const google = await w.call(A, 'POST', `${BASE}/${fresh.id}/sources`, {
      url: 'https://maps.google.com/?cid=1234567890'
    })
    assert.equal(google.body.code, 'GOOGLE_LINK_NOT_ADDED')
    const first = await w.call(A, 'POST', `${BASE}/${fresh.id}/sources`, {
      url: 'https://www.instagram.com/harbor.gym.example/'
    })
    assert.equal(first.status, 201, JSON.stringify(first.body))
    assert.equal(first.body.approval.research, 'ok', 'nothing ran yet: the source is only added')
    assert.equal(first.body.approval.sourcesChangedAt, null)
    assert.ok(
      first.body.opportunity.candidate.pastedLinks.some((l) => l.source === 'instagram'),
      JSON.stringify(first.body.opportunity.candidate)
    )
    const again = await w.call(A, 'POST', `${BASE}/${fresh.id}/sources`, {
      url: 'https://www.instagram.com/harbor.gym.example/'
    })
    assert.equal(again.body.code, 'SOURCE_ALREADY_KNOWN')

    await requestResearch(w.pool, { accountId: a, opportunity: fresh, requestId: 'source-research-01' })
    await w.drain()
    await w.call(A, 'PUT', `${BASE}/${fresh.id}/profile`, { edits: { email: 'hello@harbor-gym.example' } })
    await w.call(A, 'POST', `${BASE}/${fresh.id}/profile/approve`)
    await makeBrief(w, fresh, 'source-brief-01')
    await w.call(A, 'POST', `${BASE}/${fresh.id}/brief/approve`)

    const added = await w.call(A, 'POST', `${BASE}/${fresh.id}/sources`, {
      url: 'https://www.tiktok.com/@harbor.gym.example'
    })
    assert.equal(added.status, 201, JSON.stringify(added.body))
    assert.equal(added.body.approval.research, 'sources_changed')
    assert.equal(added.body.approval.profile, 'none')
    assert.equal(added.body.approval.brief, 'stale')
    assert.equal(added.body.approval.briefStale, 'sources')
    for (const [path, body] of [
      [`${BASE}/${fresh.id}/revisions`, { requestId: 'source-brief-02' }],
      [`${BASE}/${fresh.id}/demo/build`, { requestId: 'source-build-01', selection: { cms: 'joomla' } }],
      [`${BASE}/${fresh.id}/profile/approve`, undefined],
      [`${BASE}/${fresh.id}/brief/approve`, undefined]
    ]) {
      const res = await w.call(A, 'POST', path, body)
      assert.equal(res.status, 409, path)
      assert.equal(res.body.code, 'RESEARCH_NEEDED', path)
    }
    // Research again: the Profile needs review, the seller's edit is kept over the collected value.
    const held = (await w.pool.query('select * from wo_opportunity where id = $1', [fresh.id])).rows[0]
    await requestResearch(w.pool, { accountId: a, opportunity: held, requestId: 'source-research-02' })
    await w.drain()
    const reread = await w.call(A, 'GET', `${BASE}/${fresh.id}`)
    assert.equal(reread.body.approval.research, 'ok', JSON.stringify(reread.body.research))
    assert.equal(reread.body.approval.profile, 'needed')
    assert.equal(reread.body.approval.brief, 'stale')
    assert.equal(reread.body.profile.email, 'hello@harbor-gym.example')
  }
)

test(
  'a photo the seller adds is stored as their own, shown on Details, and counts as a Profile edit',
  opts,
  async () => {
    const w = await world()
    const a = await w.accountOf(A)
    const fresh = await w.saveGoogle(a)
    // Before research: the photo is kept and shown, nothing else is.
    const early = await w.upload(A, `${BASE}/${fresh.id}/media`, PNG)
    assert.equal(early.status, 201, JSON.stringify(early.body))
    assert.equal(early.body.media.source, 'owner')
    const before = await w.call(A, 'GET', `${BASE}/${fresh.id}`)
    assert.deepEqual(
      before.body.media.map((m) => m.source),
      ['owner']
    )
    assert.equal((await w.upload(A, `${BASE}/${fresh.id}/media`, PNG)).body.code, 'MEDIA_ALREADY_ADDED')
    assert.equal(
      (await w.upload(A, `${BASE}/${fresh.id}/media`, new TextEncoder().encode('plain words'), 'note.txt'))
        .body.code,
      'NOT_MEDIA'
    )
    await w.accountOf(B)
    assert.equal((await w.upload(B, `${BASE}/${fresh.id}/media`, PNG)).status, 404)

    await requestResearch(w.pool, { accountId: a, opportunity: fresh, requestId: 'media-research-01' })
    await w.drain()
    await w.call(A, 'POST', `${BASE}/${fresh.id}/profile/approve`)
    const second = new Uint8Array(
      await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 20, g: 120, b: 60 } } })
        .png()
        .toBuffer()
    )
    const later = await w.upload(A, `${BASE}/${fresh.id}/media`, second)
    assert.equal(later.status, 201)
    assert.equal(later.body.approval.profile, 'needed', 'an added photo asks for review again')
    assert.equal(later.body.approval.research, 'ok', 'but never for research again')
    const shown = await w.call(A, 'GET', `${BASE}/${fresh.id}`)
    assert.equal(shown.body.media.filter((m) => m.source === 'owner').length, 2)
    assert.ok(shown.body.media.length > 2, 'next to the collected photos')
    assert.equal(w.kept.size >= 2, true)
  }
)
