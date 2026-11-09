// Research state belongs to the opportunity, not to the shared place store (#524): a place researched for one card and
// saved again (after a delete, or by another account) shows an empty Profile, no photos and no shared source rows until
// THIS card's own research finishes; the press may reuse the fresh shared research, but the card is marked researched at
// its own time. Real Postgres, a fictional place, the real domain with its network parts replaced.
//
//   TEST_DATABASE_URL=… node --test --test-concurrency=1 apps/tracy-web/test/wo-research-state.test.mjs
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
const PLACE_ID = 'ChIJresearchStateHarbor'
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
  const config = readConfig(ENV)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: domainFor,
    websiteOpportunitiesRequest: async () => Response.json({ templates: [] }),
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
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
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
  return { pool, call, drain, accountOf, saveGoogle }
}

test(
  'a place saved again after a delete shows nothing researched until its own Research, then its own date',
  opts,
  async () => {
    const { pool, call, drain, accountOf, saveGoogle } = await world()
    const a = await accountOf(A)
    const first = await saveGoogle(a)
    await requestResearch(pool, { accountId: a, opportunity: first, requestId: 'first-research-0001' })
    await drain()
    const researched = await call(A, 'GET', `${BASE}/${first.id}`)
    assert.equal(researched.status, 200)
    assert.equal(researched.body.research.state, 'done')
    assert.ok(researched.body.profile, 'the first card shows its research')
    assert.ok(researched.body.media.length > 0)
    const firstAt = researched.body.research.researchedAt
    // Back-date the first research so the second press is told apart by its own time.
    await pool.query(`update wo_job set updated_at = now() - interval '14 days' where opportunity_id = $1`, [
      first.id
    ])

    assert.equal((await call(A, 'DELETE', `${BASE}/${first.id}`)).status, 200)
    const again = await saveGoogle(a)
    assert.equal(again.place_id, first.place_id, 'the new card attaches to the shared place')

    const fresh = await call(A, 'GET', `${BASE}/${again.id}`)
    assert.equal(fresh.status, 200)
    assert.deepEqual(fresh.body.research, { state: 'not_started', researchedAt: null })
    assert.equal(fresh.body.profile, null, 'no Profile before this card is researched')
    assert.deepEqual(fresh.body.media, [])
    assert.equal(fresh.body.menu, null)
    assert.ok(
      fresh.body.sources.every((s) => s.shared !== true),
      'no shared source row before this card is researched'
    )
    const card = await call(A, 'GET', `${BASE}/${again.id}/place-profile`)
    assert.equal(card.status, 200)
    assert.equal(card.body.profile, null)
    const listed = await call(A, 'GET', `${BASE}?limit=10`)
    assert.deepEqual(listed.body.opportunities.find((o) => o.id === again.id).research, {
      state: 'not_started',
      researchedAt: null
    })

    // Research on this card: the shared place is fresh, so nothing is fetched, but the card is researched now.
    const pressed = await call(A, 'POST', `${BASE}/${again.id}/research`, {
      requestId: 'second-research-0001'
    })
    assert.equal(pressed.status, 202, JSON.stringify(pressed.body))
    await drain()
    const done = await call(A, 'GET', `${BASE}/${again.id}`)
    assert.equal(done.body.research.state, 'done')
    assert.ok(done.body.profile, 'the Profile fills after this card is researched')
    assert.ok(done.body.media.length > 0)
    assert.notEqual(done.body.research.researchedAt, firstAt)
    assert.ok(Date.parse(done.body.research.researchedAt) > Date.now() - 60_000, 'researched at its own time')
    const listedDone = await call(A, 'GET', `${BASE}?limit=10`)
    assert.equal(listedDone.body.opportunities.find((o) => o.id === again.id).research.state, 'done')
  }
)

test('another account saving a researched place starts with an empty Profile too', opts, async () => {
  const { pool, call, drain, accountOf, saveGoogle } = await world()
  const a = await accountOf(A)
  const b = await accountOf(B)
  const mine = await saveGoogle(a)
  await requestResearch(pool, { accountId: a, opportunity: mine, requestId: 'mine-research-0001' })
  await drain()
  const theirs = await saveGoogle(b)
  const before = await call(B, 'GET', `${BASE}/${theirs.id}`)
  assert.equal(before.body.research.state, 'not_started')
  assert.equal(before.body.profile, null)
  // A running research shows its state, still with no Profile.
  await pool.query(
    `insert into wo_job (account_id, opportunity_id, kind, request_id, state) values ($1, $2, 'research', 'running-0001', 'running')`,
    [b, theirs.id]
  )
  const running = await call(B, 'GET', `${BASE}/${theirs.id}`)
  assert.equal(running.body.research.state, 'running')
  assert.equal(running.body.profile, null)
  await pool.query(`update wo_job set state = 'failed' where request_id = 'running-0001'`)
  const failed = await call(B, 'GET', `${BASE}/${theirs.id}`)
  assert.equal(failed.body.research.state, 'failed')
  assert.equal(failed.body.profile, null)
})

test(
  'Profile edits stay on the card, layer over the shared profile and feed the next brief',
  opts,
  async () => {
    const { pool, call, drain, accountOf, saveGoogle } = await world()
    const a = await accountOf(A)
    const b = await accountOf(B)
    const mine = await saveGoogle(a)
    const theirs = await saveGoogle(b)
    await requestResearch(pool, { accountId: a, opportunity: mine, requestId: 'edit-research-0001' })
    await requestResearch(pool, { accountId: b, opportunity: theirs, requestId: 'edit-research-0002' })
    await drain()
    const before = await call(A, 'GET', `${BASE}/${mine.id}`)
    assert.equal(before.body.profile.phone, '+1 555 0100')

    const refused = await call(A, 'PUT', `${BASE}/${mine.id}/profile`, { edits: { phone: 12 } })
    assert.equal(refused.status, 400)
    const saved = await call(A, 'PUT', `${BASE}/${mine.id}/profile`, {
      edits: { phone: '+1 555 0199', bio: 'Strength and boxing classes for every level' }
    })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    const after = await call(A, 'GET', `${BASE}/${mine.id}`)
    assert.equal(after.body.profile.phone, '+1 555 0199')
    assert.equal(after.body.profile.bio, 'Strength and boxing classes for every level')
    assert.deepEqual(after.body.profile.editedBySeller.sort(), ['bio', 'phone'])
    // The shared store and the other account's card are untouched.
    const other = await call(B, 'GET', `${BASE}/${theirs.id}`)
    assert.equal(other.body.profile.phone, '+1 555 0100')
    assert.equal(other.body.profile.editedBySeller, undefined)

    // Clearing an edit gives the researched value back.
    await call(A, 'PUT', `${BASE}/${mine.id}/profile`, { edits: { bio: null } })
    const cleared = await call(A, 'GET', `${BASE}/${mine.id}`)
    assert.equal(cleared.body.profile.bio, 'Strength classes since 2001')
    assert.deepEqual(cleared.body.profile.editedBySeller, ['phone'])

    // The brief reads the layered profile.
    const domain = await domainFor()
    const { createRevision } = await import('../src/opportunities-build/revisions.js')
    const made = await createRevision(pool, { accountId: a, opportunityId: mine.id, domain })
    assert.ok(made.revision, JSON.stringify(made.errors ?? made))
    assert.ok(
      JSON.stringify(made.revision.brief).includes('+1 555 0199'),
      'the brief states the edited phone'
    )
    assert.ok(!JSON.stringify(made.revision.brief).includes('+1 555 0100'), 'never the researched one')
  }
)

/** Poll a Content brief job until it settles, the way the client does. */
async function settled(call, email, oppId, jobId) {
  for (let i = 0; i < 100; i += 1) {
    const res = await call(email, 'GET', `${BASE}/${oppId}/brief-jobs/${jobId}`)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    if (res.body.job.state !== 'running') return res.body
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('the brief job never settled')
}

test(
  'the Content brief is locked until research, then made as a background job the client polls',
  opts,
  async () => {
    const { pool, call, drain, accountOf, saveGoogle } = await world()
    const a = await accountOf(A)
    const opp = await saveGoogle(a)
    const locked = await call(A, 'POST', `${BASE}/${opp.id}/revisions`, { requestId: 'brief-press-0001' })
    assert.equal(locked.status, 409)
    assert.equal(locked.body.code, 'RESEARCH_NOT_DONE')

    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'brief-research-0001' })
    await drain()
    const pressed = await call(A, 'POST', `${BASE}/${opp.id}/revisions`, { requestId: 'brief-press-0002' })
    assert.equal(pressed.status, 202, JSON.stringify(pressed.body))
    assert.equal(pressed.body.job.state, 'running')
    assert.equal('revision' in pressed.body, false, 'the press never waits for the brief')
    const again = await call(A, 'POST', `${BASE}/${opp.id}/revisions`, { requestId: 'brief-press-0002' })
    assert.equal(again.body.job.id, pressed.body.job.id, 'the same press answers the same job')

    const done = await settled(call, A, opp.id, pressed.body.job.id)
    assert.equal(done.job.state, 'done', JSON.stringify(done.job.error))
    assert.equal(done.revision.n, 1)
    assert.equal(done.job.revisionId, done.revision.id)
    const details = await call(A, 'GET', `${BASE}/${opp.id}`)
    assert.equal(details.body.briefJob.state, 'done')
    assert.equal(details.body.revisions.length, 1)

    // Unknown, foreign and malformed jobs are not found.
    assert.equal((await call(A, 'GET', `${BASE}/${opp.id}/brief-jobs/not-a-job`)).status, 404)
    await accountOf(B)
    assert.equal((await call(B, 'GET', `${BASE}/${opp.id}/brief-jobs/${pressed.body.job.id}`)).status, 404)
  }
)

test(
  'a brief job whose worker stopped reads as failed, or as done when its brief was written',
  opts,
  async () => {
    const { pool, call, drain, accountOf, saveGoogle } = await world()
    const a = await accountOf(A)
    const opp = await saveGoogle(a)
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'stale-research-0001' })
    await drain()
    const stale = (
      await pool.query(
        `insert into wo_brief_job (account_id, opportunity_id, request_id, step, heartbeat_at, created_at)
       values ($1, $2, 'stale-job-0001', 'labelling', now() - interval '10 minutes', now() - interval '12 minutes') returning id`,
        [a, opp.id]
      )
    ).rows[0]
    const failed = await call(A, 'GET', `${BASE}/${opp.id}/brief-jobs/${stale.id}`)
    assert.equal(failed.body.job.state, 'failed')
    assert.equal(failed.body.job.error.code, 'BRIEF_INTERRUPTED')
    // Try again starts a new job, which completes.
    const retried = await call(A, 'POST', `${BASE}/${opp.id}/revisions`, { requestId: 'stale-job-0002' })
    assert.equal(retried.status, 202)
    const done = await settled(call, A, opp.id, retried.body.job.id)
    assert.equal(done.job.state, 'done')

    const written = (
      await pool.query(
        `insert into wo_brief_job (account_id, opportunity_id, request_id, heartbeat_at, created_at)
       values ($1, $2, 'stale-job-0003', now() - interval '10 minutes', now() - interval '1 hour') returning id`,
        [a, opp.id]
      )
    ).rows[0]
    const healed = await call(A, 'GET', `${BASE}/${opp.id}/brief-jobs/${written.id}`)
    assert.equal(healed.body.job.state, 'done', 'its brief was written after it started')
    assert.equal(healed.body.revision.id, done.revision.id)
  }
)

test('a brief of a reading older than the code is not current and offers Refresh', opts, async () => {
  const { pool, call, drain, accountOf, saveGoogle } = await world()
  const a = await accountOf(A)
  const opp = await saveGoogle(a)
  await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'reading-research-0001' })
  await drain()
  // The reading the published snapshot holds, rewritten past the snapshot guard (a published snapshot never changes).
  const readAs = async (version) => {
    await pool.query('alter table wo_place_snapshot_profile disable trigger user')
    await pool.query(
      `update wo_place_snapshot_profile set profile = jsonb_set(profile, '{businessReading}', $2::jsonb)
       where snapshot_id = (select current_snapshot_id from wo_place where id = $1)`,
      [opp.place_id, JSON.stringify({ version, services: [], audience: [], team: [], story: [] })]
    )
    await pool.query('alter table wo_place_snapshot_profile enable trigger user')
  }
  await readAs('business-reading-4-5e46f68738ff')
  const old = await call(A, 'POST', `${BASE}/${opp.id}/revisions`, { requestId: 'reading-brief-0001' })
  assert.equal((await settled(call, A, opp.id, old.body.job.id)).job.state, 'done')
  const stale = await call(A, 'GET', `${BASE}/${opp.id}`)
  assert.equal(stale.body.brief.current, false, 'a brief of an old reading is never current')
  assert.equal(stale.body.brief.readingOld, true)

  const { BUSINESS_READING_VERSION } = await websiteOpportunitiesDomain()
  await readAs(`${BUSINESS_READING_VERSION}-6ca821c381fd`)
  const fresh = await call(A, 'POST', `${BASE}/${opp.id}/revisions`, { requestId: 'reading-brief-0002' })
  assert.equal((await settled(call, A, opp.id, fresh.body.job.id)).job.state, 'done')
  const current = await call(A, 'GET', `${BASE}/${opp.id}`)
  assert.equal(current.body.brief.current, true)
  assert.equal(current.body.brief.readingOld, undefined)
})

test(
  'a pasted Instagram link of the shared page makes ONE row, dated by collection; a server key failure stays off the seller row',
  opts,
  async () => {
    const { pool, call, drain, accountOf, saveGoogle } = await world()
    const a = await accountOf(A)
    const opp = await saveGoogle(a)
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'merge-research-0001' })
    await drain()
    const snapshotId = (
      await pool.query('select current_snapshot_id as id from wo_place where id = $1', [opp.place_id])
    ).rows[0].id
    // The shared research holds the Instagram page, collected on 26 Oct; this card's pasted copy of the same page failed
    // on a server key; a second pasted network failed the same way and has no shared twin.
    await pool.query('alter table wo_place_snapshot_source disable trigger user')
    await pool.query(
      `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, coverage, collected, collected_at, attempted_at)
     values ($1, 'instagram', 'https://www.instagram.com/harbor.gym/', 'complete', '{"fetched": 12}'::jsonb,
       '{"posts": [], "profile": {}}'::jsonb, '2026-10-26T09:00:00Z', '2026-10-26T09:00:00Z')`,
      [snapshotId]
    )
    await pool.query('alter table wo_place_snapshot_source enable trigger user')
    await pool.query(
      `insert into wo_source (opportunity_id, source, ref, status, reason, updated_at) values
       ($1, 'instagram', 'https://www.instagram.com/harbor.gym?igsh=abc123&utm_source=qr', 'blocked', 'credential_invalid', now()),
       ($1, 'tiktok', 'https://www.tiktok.com/@harbor.gym', 'blocked', 'credential_invalid', now())`,
      [opp.id]
    )
    const details = await call(A, 'GET', `${BASE}/${opp.id}`)
    const instagram = details.body.sources.filter((s) => s.source === 'instagram')
    assert.equal(instagram.length, 1, JSON.stringify(details.body.sources))
    assert.equal(instagram[0].status, 'complete', 'the row with data wins')
    assert.equal(instagram[0].collectedAt, '2026-10-26T09:00:00.000Z')
    const tiktok = details.body.sources.find((s) => s.source === 'tiktok')
    assert.equal(tiktok.status, 'skipped')
    assert.equal(tiktok.reason, 'not_collected', 'never the server key failure')
    assert.equal(JSON.stringify(details.body.sources).includes('credential_invalid'), false)
    const website = details.body.sources.find((s) => s.source === 'website')
    assert.ok(website.collectedAt, 'a collected source carries its collection time')
  }
)

test(
  'a seller edit of the Content brief is a new revision marked edited, which Details shows and Build reads',
  opts,
  async () => {
    const { pool, call, drain, accountOf, saveGoogle } = await world()
    const a = await accountOf(A)
    const opp = await saveGoogle(a)
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'edit-brief-research-1' })
    await drain()
    const pressed = await call(A, 'POST', `${BASE}/${opp.id}/revisions`, { requestId: 'edit-brief-press-1' })
    const made = (await settled(call, A, opp.id, pressed.body.job.id)).revision
    assert.equal(typeof made.brief.business.phone, 'string')

    const bad = await call(A, 'POST', `${BASE}/${opp.id}/revisions/${made.id}/edits`, {
      edits: [{ path: 'business.secret', value: 'x' }]
    })
    assert.equal(bad.status, 400)
    const missing = await call(A, 'POST', `${BASE}/${opp.id}/revisions/${made.id}/edits`, {
      edits: [{ path: 'reading.services.40.label', value: 'Boxing' }]
    })
    assert.equal(missing.status, 400)
    assert.equal(missing.body.code, 'UNKNOWN_PATH', 'an edit never adds a fact the brief does not hold')

    const edited = await call(A, 'POST', `${BASE}/${opp.id}/revisions/${made.id}/edits`, {
      edits: [{ path: 'business.phone', value: '+1 555 0142' }]
    })
    assert.equal(edited.status, 201, JSON.stringify(edited.body))
    assert.equal(edited.body.revision.n, made.n + 1)
    assert.equal(edited.body.revision.editedBySeller, true)
    assert.equal(edited.body.revision.brief.business.phone, '+1 555 0142')
    const stored = (
      await pool.query('select brief_md from wo_revision where id = $1', [edited.body.revision.id])
    ).rows[0]
    assert.ok(stored.brief_md.includes('+1 555 0142'), 'the build prompt says what the seller wrote')
    const original = (await pool.query('select brief from wo_revision where id = $1', [made.id])).rows[0]
    assert.notEqual(original.brief.business.phone, '+1 555 0142', 'the made brief never changes')

    const details = await call(A, 'GET', `${BASE}/${opp.id}`)
    assert.equal(details.body.brief.id, edited.body.revision.id, 'Details and Build use the edited brief')
    assert.equal(details.body.brief.current, true)
    assert.equal(details.body.brief.editedBySeller, true)
    assert.equal(details.body.revisions[0].editedBySeller, true)
  }
)
