// The owner's choices for the site itself on the Profile card (#537): the team door (add, rename, photograph, remove),
// the social links typed for the site, a photo or review kept off the site, and a band switched off through the facts
// door. Each is a Profile edit, refused once the Profile is approved; the next Content brief reads it. Real Postgres, a fictional place, the real domain with
// its network parts replaced.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/wo-owner-site-edits.test.mjs
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
const PLACE_ID = 'ChIJownerEditsHarborGym'
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
  const upload = async (email, path, bytes, name = 'counter.png', fields = {}) => {
    const form = new FormData()
    form.append('file', new Blob([bytes]), name)
    for (const [k, v] of Object.entries(fields)) form.append(k, v)
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

const MEMBER = 'te_coach1'
/** The researched place's reading names one person (as the business reading would). */
async function withReadTeam(w, opp) {
  const { rows } = await w.pool.query(
    `select sp.snapshot_id from wo_opportunity o join wo_place p on p.id = o.place_id
       join wo_place_snapshot_profile sp on sp.snapshot_id = p.current_snapshot_id where o.id = $1`,
    [opp.id]
  )
  assert.equal(rows.length, 1, 'the researched card has a snapshot profile')
  const reading = {
    method: 'model',
    services: [],
    audience: [],
    team: [
      {
        id: MEMBER,
        label: 'Mira Holm',
        quote: 'Coach Mira Holm',
        source: { kind: 'bio', ref: 'bio' },
        reviewsOnly: false
      }
    ],
    story: [],
    serviceAreas: [],
    facts: [],
    keyMessages: []
  }
  // The published snapshot is guarded against edits; this fixture stands in for a research that read the team.
  const client = await w.pool.connect()
  try {
    await client.query("set session_replication_role = 'replica'")
    await client.query(
      `update wo_place_snapshot_profile set profile = profile || jsonb_build_object('businessReading', $2::jsonb) where snapshot_id = $1`,
      [rows[0].snapshot_id, JSON.stringify(reading)]
    )
  } finally {
    await client.query("set session_replication_role = 'origin'").catch(() => {})
    client.release()
  }
}

test(
  'the team door adds, renames, photographs and removes people before approval; each is a Profile edit',
  opts,
  async () => {
    const w = await world()
    const { opp } = await researchedCard(w)
    await withReadTeam(w, opp)
    const team = (body) => w.call(A, 'PUT', `${BASE}/${opp.id}/team`, body)

    assert.equal((await team({ action: 'invite' })).body.code, 'INVALID_ACTION')
    assert.equal((await team({ action: 'add', label: '' })).body.code, 'INVALID_LABEL')
    assert.equal(
      (await team({ action: 'add', label: 'Ana', role: 'r'.repeat(61) })).body.code,
      'INVALID_ROLE'
    )
    assert.equal((await team({ action: 'add', label: 'Ana', photoMediaId: 'x' })).body.code, 'INVALID_PHOTO')
    const missing = await team({
      action: 'add',
      label: 'Ana',
      photoMediaId: '00000000-0000-4000-8000-000000000000'
    })
    assert.equal(missing.status, 422)
    assert.equal(missing.body.code, 'MEDIA_NOT_FOUND')

    // A team photo goes up through the media door with `purpose: team` and is filed with the people pictures.
    const up = await w.upload(A, `${BASE}/${opp.id}/media`, PNG, 'ana.png', { purpose: 'team' })
    assert.equal(up.status, 201, JSON.stringify(up.body))
    assert.equal(up.body.media.category, 'people')
    const bad = await w.upload(A, `${BASE}/${opp.id}/media`, PNG, 'ana.png', { purpose: 'logo' })
    assert.equal(bad.body.code, 'INVALID_PURPOSE')

    const added = await team({
      action: 'add',
      label: 'Ana Ruiz',
      role: 'Front desk',
      photoMediaId: up.body.media.id
    })
    assert.equal(added.status, 201, JSON.stringify(added.body))
    assert.match(added.body.member.id, /^te_own[0-9a-f]{10}$/)
    assert.equal(added.body.opportunity.candidate.teamEdits.added.length, 1)
    const renamed = await team({ action: 'update', id: MEMBER, label: 'Mira H.', role: 'Head coach' })
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body))
    assert.equal((await team({ action: 'update', id: 'te_nobody', label: 'X' })).status, 404)

    const details = await w.call(A, 'GET', `${BASE}/${opp.id}`)
    assert.equal(details.body.approval.profile, 'needed')
    const card = details.body.profile.readingCard.team
    assert.deepEqual(
      card.map((p) => [p.id, p.label, p.role ?? null, p.owner === true, p.photo?.id ?? null]),
      [
        [MEMBER, 'Mira H.', 'Head coach', false, null],
        [added.body.member.id, 'Ana Ruiz', 'Front desk', true, up.body.media.id]
      ]
    )
    // The photo also stays in Photos & video.
    assert.ok(details.body.media.some((m) => m.id === up.body.media.id && m.category === 'people'))

    // Remove: the added person is deleted, the researched one leaves through the reading picks.
    const gone = await team({ action: 'remove', id: added.body.member.id })
    assert.equal(gone.body.opportunity.candidate.teamEdits.added.length, 0)
    const off = await team({ action: 'remove', id: MEMBER })
    assert.deepEqual(off.body.opportunity.candidate.readingPicks.removed, [MEMBER])
    // Another account's card answers 404.
    await w.accountOf(B)
    assert.equal(
      (await w.call(B, 'PUT', `${BASE}/${opp.id}/team`, { action: 'add', label: 'Eve' })).status,
      404
    )
  }
)

test('the socials door keeps the links the site shows apart from the research sources', opts, async () => {
  const w = await world()
  const { opp } = await researchedCard(w)
  const set = (body) => w.call(A, 'PUT', `${BASE}/${opp.id}/socials`, body)
  assert.equal(
    (await set({ network: 'myspace', action: 'set', url: 'https://myspace.com/a' })).body.code,
    'INVALID_NETWORK'
  )
  assert.equal((await set({ network: 'facebook', action: 'put' })).body.code, 'INVALID_ACTION')
  const url = await set({ network: 'facebook', action: 'set', url: 'https://example.com/x' })
  assert.equal(url.status, 422)
  assert.equal(url.body.code, 'INVALID_URL')
  const phone = await set({ network: 'whatsapp', action: 'set', number: '12' })
  assert.equal(phone.status, 422)
  assert.equal(phone.body.code, 'INVALID_PHONE')
  assert.equal(
    (await set({ network: 'other', action: 'set', url: 'https://links.example' })).body.code,
    'INVALID_LABEL'
  )
  const wa = await set({ network: 'whatsapp', action: 'set', number: '+971 50 123 4567' })
  assert.equal(wa.status, 200, JSON.stringify(wa.body))
  assert.equal(wa.body.siteSocials.whatsapp.url, 'https://wa.me/971501234567')
  const li = await set({
    network: 'linkedin',
    action: 'set',
    url: 'https://www.linkedin.com/company/harbor-gym'
  })
  assert.equal(
    li.body.opportunity.candidate.siteSocials.linkedin.url,
    'https://www.linkedin.com/company/harbor-gym'
  )
  // Never a research source: the candidate's research links are untouched.
  assert.deepEqual(li.body.opportunity.candidate.socials, {})
  const removed = await set({ network: 'whatsapp', action: 'remove' })
  assert.deepEqual(Object.keys(removed.body.siteSocials), ['linkedin'])
  const details = await w.call(A, 'GET', `${BASE}/${opp.id}`)
  assert.ok(details.body.socialNetworks.some((n) => n.id === 'telegram' && n.label === 'Telegram'))
  await w.accountOf(B)
  assert.equal(
    (await w.call(B, 'PUT', `${BASE}/${opp.id}/socials`, { network: 'x', action: 'remove' })).status,
    404
  )
})

test(
  'a photo or a review kept off, and a band switched off, reach Details and the next brief',
  opts,
  async () => {
    const w = await world()
    const { opp } = await researchedCard(w)
    const up = await w.upload(A, `${BASE}/${opp.id}/media`, PNG, 'counter.png')
    assert.equal(up.status, 201, JSON.stringify(up.body))
    const mediaId = up.body.media.id
    const vis = (id, body) => w.call(A, 'PUT', `${BASE}/${opp.id}/media/${id}/visibility`, body)
    assert.equal((await vis(mediaId, { hidden: 'yes' })).body.code, 'INVALID_HIDDEN')
    assert.equal((await vis('00000000-0000-4000-8000-000000000000', { hidden: true })).status, 404)
    const hid = await vis(mediaId, { hidden: true })
    assert.equal(hid.status, 200, JSON.stringify(hid.body))
    assert.deepEqual(hid.body.media, { id: mediaId, ownerHidden: true })
    const details = await w.call(A, 'GET', `${BASE}/${opp.id}`)
    assert.equal(details.body.media.find((m) => m.id === mediaId).ownerHidden, true)
    assert.equal(details.body.approval.profile, 'needed')

    const rev = (body) => w.call(A, 'PUT', `${BASE}/${opp.id}/reviews/visibility`, body)
    assert.equal((await rev({ key: 'bad key', hidden: true })).body.code, 'INVALID_REVIEW')
    assert.equal((await rev({ key: 'rv_abc', hidden: 1 })).body.code, 'INVALID_HIDDEN')
    const r = await rev({ key: 'rv_abc', hidden: true })
    assert.deepEqual(r.body.opportunity.candidate.reviewPicks.hidden, ['rv_abc'])

    // A band off goes through the facts door, and Details and the place profile say so.
    const band = await w.call(A, 'PUT', `${BASE}/${opp.id}/facts`, { factId: 'band_brand', onSite: false })
    assert.equal(band.status, 200, JSON.stringify(band.body))
    assert.equal((await w.call(A, 'GET', `${BASE}/${opp.id}`)).body.bands.brand, false)
    assert.equal((await w.call(A, 'GET', `${BASE}/${opp.id}/place-profile`)).body.bands.brand, false)

    assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/profile/approve`)).status, 200)
    const revision = await makeBrief(w, opp, 'owner-edits-brief-01')
    assert.ok(!revision.brief.assets.some((a) => a.id === mediaId), 'the hidden photo is no asset')
    assert.equal(revision.brief.brand, null)
    await w.accountOf(B)
    assert.equal(
      (await w.call(B, 'PUT', `${BASE}/${opp.id}/media/${mediaId}/visibility`, { hidden: false })).status,
      404
    )
  }
)

test(
  'the facts door edits the value of any fact; the saved profile and the next brief carry it (#537 R18)',
  opts,
  async () => {
    const w = await world()
    const { opp } = await researchedCard(w)
    await withReadTeam(w, opp)
    const facts = (body) => w.call(A, 'PUT', `${BASE}/${opp.id}/facts`, body)
    const before = (await w.call(A, 'GET', `${BASE}/${opp.id}/place-profile`)).body.profile
    const phone = before.business.phone
    const mira = before.people.find((p) => p.teamMemberId === MEMBER)
    assert.ok(phone && mira, 'research read a phone and a person')

    // Unknown fact, wrong kind, and a fact of no kind.
    assert.equal((await facts({ factId: 'fact_unknown', value: 'x' })).status, 404)
    assert.equal((await facts({ factId: 'not an id', value: 'x' })).body.code, 'INVALID_FACT')
    const wrong = await facts({ factId: phone.id, value: 42 })
    assert.equal(wrong.status, 400)
    assert.equal(wrong.body.code, 'INVALID_VALUE')
    assert.equal(wrong.body.expected, 'text')
    assert.match(wrong.body.next, /text of 1 to 2000 characters/)
    assert.equal((await facts({ factId: phone.id, value: 'x', onSite: 'no' })).body.code, 'INVALID_ON_SITE')

    // A text fact and a person's name: the answer says the value saved and the one research read.
    const edited = await facts({ factId: phone.id, value: '+1 555 0199' })
    assert.equal(edited.status, 200, JSON.stringify(edited.body))
    assert.deepEqual(edited.body.fact, {
      id: phone.id,
      kind: 'text',
      value: '+1 555 0199',
      researchValue: phone.value,
      editedByOwner: true
    })
    assert.equal(edited.body.opportunity.candidate.factEdits[phone.id].value, '+1 555 0199')
    const renamed = await facts({ factId: mira.id, value: 'Mira H.', onSite: true })
    assert.equal(renamed.body.fact.value.name, 'Mira H.')
    assert.equal(renamed.body.opportunity.candidate.factOverrides[mira.id].onSite, true)

    // Both reads give the saved profile; the Profile needs review again.
    const details = await w.call(A, 'GET', `${BASE}/${opp.id}`)
    assert.equal(details.body.approval.profile, 'needed')
    const saved = details.body.placeProfile.profile
    assert.equal(saved.business.phone.value, '+1 555 0199')
    assert.equal(saved.business.phone.researchValue, phone.value)
    assert.equal(saved.business.phone.editedByOwner, true)
    const read = (await w.call(A, 'GET', `${BASE}/${opp.id}/place-profile`)).body.profile
    assert.equal(read.people.find((p) => p.id === mira.id).value.name, 'Mira H.')
    assert.equal(read.people.find((p) => p.id === mira.id).decidedBy, 'owner')

    // null gives the fact back the value research read.
    const back = await facts({ factId: phone.id, value: null })
    assert.equal(back.body.fact.value, phone.value)
    assert.equal(back.body.fact.editedByOwner, false)
    assert.equal(phone.id in back.body.opportunity.candidate.factEdits, false)
    assert.equal((await facts({ factId: phone.id, value: '+1 555 0199' })).status, 200)

    // The next brief states the saved values.
    assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/profile/approve`)).status, 200)
    const revision = await makeBrief(w, opp, 'owner-value-brief-01')
    assert.equal(revision.brief.business.phone, '+1 555 0199')
    const member = revision.brief.reading.team.find((p) => p.id === MEMBER)
    assert.equal(member.label, 'Mira H.')
    assert.equal(member.factId, mira.id)

    // Once approved, the value is final (#537 R23).
    const locked = await facts({ factId: phone.id, value: null })
    assert.equal(locked.status, 409)
    assert.equal(locked.body.code, 'PROFILE_APPROVED')
  }
)
