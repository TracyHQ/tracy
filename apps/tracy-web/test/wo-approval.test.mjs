// The seller approves the Profile, then the Content brief, before the next step unlocks (#537): the approve doors set
// their times, an approved Profile or brief is final (#537 R23: every edit door answers PROFILE_APPROVED or
// BRIEF_APPROVED; a stale brief survives only on data from before that lock), sources
// are fixed once research starts (added or removed only before it or after it failed), and the brief and build doors
// refuse with the reason.
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
import { researchItemsOf, researchRunOf } from 'website-opportunities/src/research-progress.js'
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
      !['PROFILE_NOT_APPROVED', 'BRIEF_NOT_APPROVED'].includes(open.body?.code),
      JSON.stringify(open.body)
    )
  }
)

const PROFILE_APPROVED = {
  code: 'PROFILE_APPROVED',
  next: 'The business facts are approved. To change them, add this business again as a new card.'
}
const BRIEF_APPROVED = {
  code: 'BRIEF_APPROVED',
  next: 'The Site content brief is approved. To change it, add this business again as a new card.'
}
const refusedWith = (res, want, what) => {
  assert.equal(res.status, 409, `${what}: ${JSON.stringify(res.body)}`)
  assert.equal(res.body.code, want.code, what)
  assert.equal(res.body.next, want.next, what)
}

test(
  'a Profile edit before approval is saved; once approved, every Profile door answers PROFILE_APPROVED',
  opts,
  async () => {
    const w = await world()
    const { opp } = await researchedCard(w)
    // Before approval the owner edits freely.
    const before = await w.call(A, 'PUT', `${BASE}/${opp.id}/profile`, { edits: { phone: '+1 555 0177' } })
    assert.equal(before.status, 200, JSON.stringify(before.body))
    const media = (await w.upload(A, `${BASE}/${opp.id}/media`, PNG)).body.media
    assert.ok(media?.id, 'a photo added before approval')
    assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/profile/approve`)).status, 200)
    const approvedAt = (await w.call(A, 'GET', `${BASE}/${opp.id}`)).body.approval.profileApprovedAt
    const doors = [
      ['PUT', 'name', { name: 'Harbour Gym' }],
      ['PUT', 'profile', { edits: { phone: '+1 555 0199' } }],
      ['PUT', 'hours', { choice: 'leave' }],
      ['PUT', 'rating', { choice: 'leave' }],
      ['PUT', 'reading', { item: 'kp_one', choice: 'remove' }],
      ['PUT', 'facts', { factId: 'band_team', onSite: false }],
      ['PUT', 'facts', { factId: 'contact_phone', value: '+1 555 0100' }],
      ['PUT', 'key-messages', { removed: [], order: [] }],
      ['PUT', 'team', { action: 'add', label: 'Ana Ruiz' }],
      ['PUT', 'socials', { network: 'instagram', action: 'set', handle: 'harborgym' }],
      ['PUT', `media/${media.id}/visibility`, { hidden: true }],
      ['PUT', 'reviews/visibility', { key: 'r_0123456789ab', hidden: true }],
      ['POST', 'research', { requestId: 'locked-research-01', again: true }],
      ['POST', 'research', { requestId: 'locked-research-02', only: 'logo' }],
      ['POST', 'research', { requestId: 'locked-research-03' }]
    ]
    for (const [method, path, body] of doors)
      refusedWith(
        await w.call(A, method, `${BASE}/${opp.id}/${path}`, body),
        PROFILE_APPROVED,
        `${method} ${path}`
      )
    refusedWith(
      await w.upload(A, `${BASE}/${opp.id}/media`, new Uint8Array([...PNG, 0])),
      PROFILE_APPROVED,
      'POST media'
    )
    // Nothing moved: still approved, at the same time, with the edit made before approval.
    const after = (await w.call(A, 'GET', `${BASE}/${opp.id}`)).body
    assert.equal(after.approval.profile, 'approved')
    assert.equal(after.approval.profileApprovedAt, approvedAt)
    assert.equal(
      after.approval.profileChangedAt === null || after.approval.profileChangedAt < approvedAt,
      true
    )
    assert.equal(
      (await w.pool.query('select count(*)::int as n from wo_job where opportunity_id = $1', [opp.id]))
        .rows[0].n,
      1
    )
    // Another account still reads 404, never the lock.
    await w.accountOf(B)
    assert.equal((await w.call(B, 'PUT', `${BASE}/${opp.id}/name`, { name: 'X' })).status, 404)
  }
)

test(
  'an approved brief is final: no new brief and no brief edits; a brief not approved yet is still edited',
  opts,
  async () => {
    const w = await world()
    const { opp } = await researchedCard(w)
    await w.call(A, 'POST', `${BASE}/${opp.id}/profile/approve`)
    const revision = await makeBrief(w, opp, 'locked-brief-01')
    // Before its approval an edit is refused only for its words, never for the lock.
    const early = await w.call(A, 'POST', `${BASE}/${opp.id}/revisions/${revision.id}/edits`, { edits: [] })
    assert.notEqual(early.body?.code, 'BRIEF_APPROVED', JSON.stringify(early.body))
    assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/brief/approve`)).status, 200)
    refusedWith(
      await w.call(A, 'POST', `${BASE}/${opp.id}/revisions/${revision.id}/edits`, {
        edits: [{ path: 'hero.title', value: 'New words' }]
      }),
      BRIEF_APPROVED,
      'brief edits'
    )
    refusedWith(
      await w.call(A, 'POST', `${BASE}/${opp.id}/revisions`, { requestId: 'locked-brief-02' }),
      BRIEF_APPROVED,
      'a new brief'
    )
    assert.equal((await w.call(A, 'GET', `${BASE}/${opp.id}`)).body.approval.brief, 'approved')
  }
)

test(
  'a stale brief left by an edit after approval (data from before the lock) still reads stale and is made again',
  opts,
  async () => {
    const w = await world()
    const { opp } = await researchedCard(w)
    await w.call(A, 'POST', `${BASE}/${opp.id}/profile/approve`)
    await makeBrief(w, opp, 'stale-brief-01')
    await w.call(A, 'POST', `${BASE}/${opp.id}/brief/approve`)
    // What an edit after approval used to leave (no owner door makes it any more).
    await w.pool.query(
      'update wo_opportunity set profile_changed_at = now(), profile_approved_at = null where id = $1',
      [opp.id]
    )
    const after = (await w.call(A, 'GET', `${BASE}/${opp.id}`)).body.approval
    assert.equal(after.profile, 'needed')
    assert.equal(after.brief, 'stale')
    assert.equal(after.briefStale, 'profile')
    assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/brief/approve`)).body.code, 'BRIEF_STALE')
    assert.equal((await build(w, opp, 'stale-build-01')).body.code, 'PROFILE_NOT_APPROVED')
    // Approve again, make the brief again (the same research: the same revision, `reused`), approve it.
    await w.call(A, 'POST', `${BASE}/${opp.id}/profile/approve`)
    const pressed = await w.call(A, 'POST', `${BASE}/${opp.id}/revisions`, { requestId: 'stale-brief-03' })
    assert.equal(pressed.status, 202, JSON.stringify(pressed.body))
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
  }
)

test('the Research sub steps read the place job serving the card and its snapshot', opts, async () => {
  const w = await world()
  const { opp } = await researchedCard(w)
  const run = await researchRunOf(w.pool, opp.id)
  assert.ok(run, 'the request is served by a place job with a snapshot')
  assert.equal(run.job.state, 'completed')
  const items = researchItemsOf(run)
  assert.ok(
    items.some((i) => i.key === 'website' && i.label === 'Website' && i.state === 'done'),
    JSON.stringify(items)
  )
  assert.deepEqual(items.at(-1), {
    key: 'profile',
    label: 'Writing the business facts',
    state: 'done',
    at: null
  })
  // Put the same job back to collecting the website: the card reads it running, Writing the business facts waiting.
  await w.pool.query(
    `update wo_place_job set state = 'running', stage = 'collection', progress = '{"collecting":"website"}'::jsonb
      where id = (select place_job_id from wo_job where opportunity_id = $1 and kind = 'research' limit 1)`,
    [opp.id]
  )
  await w.pool.query(
    `update wo_place_snapshot_source set attempted_at = attempted_at - interval '1 day'
      where source = 'website' and snapshot_id = (select pj.snapshot_id from wo_place_job pj join wo_job rj on
        rj.place_job_id = pj.id where rj.opportunity_id = $1 and rj.kind = 'research' limit 1)`,
    [opp.id]
  )
  await w.pool.query(`update wo_job set state = 'running' where opportunity_id = $1 and kind = 'research'`, [
    opp.id
  ])
  const detail = (await w.call(A, 'GET', `${BASE}/${opp.id}`)).body
  assert.equal(detail.stepProgress.step, 'research')
  assert.equal(detail.stepProgress.items.find((i) => i.key === 'website')?.state, 'running')
  assert.equal(detail.stepProgress.items.at(-1).state, 'waiting')
})

test(
  'a brief made before the Profile was approved reads stale; approving the Profile again keeps its time',
  opts,
  async () => {
    const w = await world()
    const { opp } = await researchedCard(w)
    await w.call(A, 'POST', `${BASE}/${opp.id}/profile/approve`)
    await makeBrief(w, opp, 'early-brief-01')
    // Approving again without an edit keeps the first approval, so the brief made after it stays current.
    const first = (
      await w.pool.query('select profile_approved_at from wo_opportunity where id = $1', [opp.id])
    ).rows[0].profile_approved_at
    assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/profile/approve`)).status, 200)
    const kept = (
      await w.pool.query('select profile_approved_at from wo_opportunity where id = $1', [opp.id])
    ).rows[0].profile_approved_at
    assert.equal(kept.toISOString(), first.toISOString())
    assert.equal((await w.call(A, 'GET', `${BASE}/${opp.id}`)).body.approval.brief, 'needed')
    // A brief made before the approval (one made before the approval step existed): stale, and the build waits.
    await w.pool.query(
      `update wo_opportunity set profile_approved_at = now() + interval '1 minute' where id = $1`,
      [opp.id]
    )
    const approval = (await w.call(A, 'GET', `${BASE}/${opp.id}`)).body.approval
    assert.equal(approval.profile, 'approved')
    assert.equal(approval.brief, 'stale')
    assert.equal(approval.briefStale, 'profile')
    assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/brief/approve`)).body.code, 'BRIEF_STALE')
    assert.equal((await build(w, opp, 'early-build-01')).body.code, 'BRIEF_NOT_APPROVED')
  }
)

test(
  'a source can be added before research or after it failed; running or done answers RESEARCH_STARTED',
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
    assert.equal('research' in first.body.approval, false, 'the approval carries no sources state')
    assert.equal('sourcesChangedAt' in first.body.approval, false)
    assert.ok(
      first.body.opportunity.candidate.pastedLinks.some((l) => l.source === 'instagram'),
      JSON.stringify(first.body.opportunity.candidate)
    )
    const again = await w.call(A, 'POST', `${BASE}/${fresh.id}/sources`, {
      url: 'https://www.instagram.com/harbor.gym.example/'
    })
    assert.equal(again.body.code, 'SOURCE_ALREADY_KNOWN')
    // A listing link added before research gets its own row at once (its page is fetched to judge the link, and here
    // that fetch fails), but the row reads not collected yet, like a pasted link, until research runs.
    const LISTING = 'https://www.tripadvisor.com/Attraction_Review-g000-d000-Reviews-Harbor_Gym_Example.html'
    const listing = await w.call(A, 'POST', `${BASE}/${fresh.id}/sources`, { url: LISTING })
    assert.equal(listing.status, 201, JSON.stringify(listing.body))
    const stored = (
      await w.pool.query(`select status from wo_source where opportunity_id = $1 and source = 'listing'`, [
        fresh.id
      ])
    ).rows[0]
    assert.equal(stored?.status, 'failed', 'the fetch to judge the link failed')
    const early = (await w.call(A, 'GET', `${BASE}/${fresh.id}`)).body.sources.find(
      (s) => s.source === 'listing'
    )
    assert.ok(early, 'the listing row is shown')
    assert.deepEqual(
      {
        status: early.status,
        reason: early.reason,
        coverage: early.coverage,
        collectedAt: early.collectedAt
      },
      { status: null, reason: null, coverage: null, collectedAt: null }
    )
    assert.equal(early.pastedLink, LISTING)

    const add = (url) => w.call(A, 'POST', `${BASE}/${fresh.id}/sources`, { url })
    const linksNow = async () =>
      (await w.pool.query('select candidate from wo_opportunity where id = $1', [fresh.id])).rows[0].candidate
    const NEXT =
      'Research has already run. Sources are fixed once the research starts; they can be changed only before it, or after it failed.'

    // Running: refused with exactly {code, next}, the link list does not change.
    await w.pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id, state) values ($1, $2, 'research', 'add-running-01', 'running')`,
      [a, fresh.id]
    )
    const busy = await add('https://www.tiktok.com/@harbor.gym.example')
    assert.equal(busy.status, 409, JSON.stringify(busy.body))
    assert.deepEqual(busy.body, { code: 'RESEARCH_STARTED', next: NEXT })
    assert.equal((await linksNow()).socials?.tiktok, undefined, 'nothing was added')
    await w.pool.query(`delete from wo_job where request_id = 'add-running-01'`)

    // Failed: a bad link may be the cause, so another one can be added.
    await w.pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id, state) values ($1, $2, 'research', 'add-failed-01', 'failed')`,
      [a, fresh.id]
    )
    const afterFail = await add('https://www.facebook.com/harbor.gym.example')
    assert.equal(afterFail.status, 201, JSON.stringify(afterFail.body))
    assert.ok(afterFail.body.opportunity.candidate.socials?.facebook, 'the link is added')
    await w.pool.query(`delete from wo_job where request_id = 'add-failed-01'`)

    // Done: refused, and the approvals stay as they were (no research, Profile or brief reset).
    await requestResearch(w.pool, { accountId: a, opportunity: fresh, requestId: 'source-research-01' })
    await w.drain()
    await w.call(A, 'POST', `${BASE}/${fresh.id}/profile/approve`)
    await makeBrief(w, fresh, 'source-brief-01')
    await w.call(A, 'POST', `${BASE}/${fresh.id}/brief/approve`)
    const beforeAdd = (await w.call(A, 'GET', `${BASE}/${fresh.id}`)).body.approval
    assert.equal(beforeAdd.brief, 'approved')
    const held = await linksNow()
    const done = await add('https://www.tiktok.com/@harbor.gym.example')
    assert.equal(done.status, 409, JSON.stringify(done.body))
    assert.deepEqual(done.body, { code: 'RESEARCH_STARTED', next: NEXT })
    assert.deepEqual(await linksNow(), held, 'the link list is unchanged')
    // The add door refuses before it judges the link: even a duplicate or a bad body reads RESEARCH_STARTED.
    assert.equal((await add('not a link')).body.code, 'RESEARCH_STARTED')
    const afterAdd = (await w.call(A, 'GET', `${BASE}/${fresh.id}`)).body.approval
    assert.deepEqual(afterAdd, beforeAdd)
    assert.equal('research' in afterAdd, false)
    assert.equal(afterAdd.briefStale, null)
  }
)

test(
  'adding a source refuses unreadable platforms, duplicates and a sixth listing page, each by its own code',
  opts,
  async () => {
    const w = await world()
    const a = await w.accountOf(A)
    const fresh = await w.saveGoogle(a)
    const add = (url) => w.call(A, 'POST', `${BASE}/${fresh.id}/sources`, { url })
    const candidate = async () =>
      (await w.pool.query('select candidate from wo_opportunity where id = $1', [fresh.id])).rows[0].candidate

    for (const [url, platform] of [
      ['https://x.com/harbor_gym_example', 'X'],
      ['https://twitter.com/harbor_gym_example', 'X'],
      ['https://www.linkedin.com/company/harbor-gym-example', 'LinkedIn'],
      ['https://www.threads.net/@harbor.gym.example', 'Threads'],
      ['https://linktr.ee/harborgymexample', 'Linktree'],
      ['https://wa.me/15550100', 'WhatsApp'],
      ['https://api.whatsapp.com/send?phone=15550100', 'WhatsApp']
    ]) {
      const res = await add(url)
      assert.equal(res.status, 422, url)
      assert.equal(res.body.code, 'UNSUPPORTED_LINK', url)
      assert.equal(res.body.platform, platform, url)
      assert.ok(res.body.next, url)
    }
    assert.equal((await candidate()).website, undefined, 'none of them was saved as the website')

    // magicpin on another TLD is a listing page, never the website.
    const MAGICPIN_IN = 'https://magicpin.in/New-Delhi/Saket/Fitness/Harbor-Gym-Example/store/1000002'
    assert.equal((await add(MAGICPIN_IN)).status, 201)
    const afterMagicpin = await candidate()
    assert.equal(afterMagicpin.website, undefined)
    assert.ok(afterMagicpin.listings.some((l) => l.url === MAGICPIN_IN && l.source === 'magicpin'))

    // The exact link again (any spelling) and another page of a platform it has read apart.
    assert.equal((await add(SITE)).status, 201)
    const sameSite = await add('http://www.harbor-gym.example')
    assert.equal(sameSite.status, 409)
    assert.equal(sameSite.body.code, 'SOURCE_ALREADY_KNOWN')
    const otherSite = await add('https://harbor-gym-two.example/')
    assert.equal(otherSite.status, 409)
    assert.deepEqual([otherSite.body.code, otherSite.body.platform], ['PLATFORM_ALREADY_KNOWN', 'website'])
    assert.equal((await add('https://www.instagram.com/harbor.gym.example/')).status, 201)
    const sameIg = await add('https://instagram.com/harbor.gym.example?igsh=abc123')
    assert.equal(sameIg.body.code, 'SOURCE_ALREADY_KNOWN')
    const otherIg = await add('https://www.instagram.com/someone.else.example/')
    assert.deepEqual([otherIg.body.code, otherIg.body.platform], ['PLATFORM_ALREADY_KNOWN', 'instagram'])
    assert.equal((await add(MAGICPIN_IN)).body.code, 'SOURCE_ALREADY_KNOWN')

    // At most five listing pages: the sixth is refused, the same page again still reads as known.
    for (let i = 1; i <= 4; i += 1) {
      const res = await add(
        `https://www.tripadvisor.com/Attraction_Review-g000-d00${i}-Reviews-Harbor_Gym_Example.html`
      )
      assert.equal(res.status, 201, JSON.stringify(res.body))
    }
    assert.equal((await candidate()).listings.length, 5)
    const sixth = await add('https://www.yelp.com/biz/harbor-gym-example')
    assert.equal(sixth.status, 409)
    assert.deepEqual([sixth.body.code, sixth.body.max], ['TOO_MANY_SOURCES', 5])
    assert.equal((await add(MAGICPIN_IN)).body.code, 'SOURCE_ALREADY_KNOWN')
    assert.equal((await candidate()).listings.length, 5)
  }
)

test('a source removed before research only leaves the link list', opts, async () => {
  const w = await world()
  const a = await w.accountOf(A)
  const fresh = await w.saveGoogle(a)
  const IG = 'https://www.instagram.com/harbor.gym.example/'
  const LISTING = 'https://www.tripadvisor.com/Attraction_Review-g000-d000-Reviews-Harbor_Gym_Example.html'
  assert.equal((await w.call(A, 'POST', `${BASE}/${fresh.id}/sources`, { url: IG })).status, 201)
  assert.equal((await w.call(A, 'POST', `${BASE}/${fresh.id}/sources`, { url: LISTING })).status, 201)
  // Another account cannot remove it; a link it does not list is 404; a bad body is 400.
  await w.accountOf(B)
  assert.equal((await w.call(B, 'DELETE', `${BASE}/${fresh.id}/sources`, { url: IG })).status, 404)
  const unknown = await w.call(A, 'DELETE', `${BASE}/${fresh.id}/sources`, {
    url: 'https://www.instagram.com/someone.else.example/'
  })
  assert.equal(unknown.status, 404)
  assert.equal(unknown.body.code, 'NOT_FOUND')
  assert.equal((await w.call(A, 'DELETE', `${BASE}/${fresh.id}/sources`, { url: 'not a link' })).status, 400)
  // The Google link is the business itself.
  await w.pool.query(
    `update wo_opportunity set candidate = jsonb_set(candidate, '{pastedLinks}',
       candidate->'pastedLinks' || '[{"source":"google-places","url":"https://maps.google.com/?cid=1234567890"}]')
     where id = $1`,
    [fresh.id]
  )
  const google = await w.call(A, 'DELETE', `${BASE}/${fresh.id}/sources`, {
    url: 'https://maps.google.com/?cid=1234567890'
  })
  assert.equal(google.body.code, 'GOOGLE_LINK_NOT_REMOVED')

  // Sent as shown: no www, http, no trailing slash, a share-tracking parameter.
  const gone = await w.call(A, 'DELETE', `${BASE}/${fresh.id}/sources`, {
    url: 'http://instagram.com/harbor.gym.example?igsh=abc123'
  })
  assert.equal(gone.status, 200, JSON.stringify(gone.body))
  assert.equal('research' in gone.body.approval, false)
  assert.equal(gone.body.opportunity.candidate.socials?.instagram, undefined)
  assert.ok(!gone.body.opportunity.candidate.pastedLinks.some((l) => l.source === 'instagram'))
  assert.ok(gone.body.opportunity.candidate.pastedLinks.some((l) => l.source === 'google-places'))

  const listing = await w.call(A, 'DELETE', `${BASE}/${fresh.id}/sources`, { url: LISTING })
  assert.equal(listing.status, 200, JSON.stringify(listing.body))
  assert.equal(listing.body.opportunity.candidate.listings, undefined)
  const rows = (
    await w.pool.query(`select 1 from wo_source where opportunity_id = $1 and source = 'listing'`, [fresh.id])
  ).rows
  assert.equal(rows.length, 0, 'its private listing row goes with its last page')
  const detail = (await w.call(A, 'GET', `${BASE}/${fresh.id}`)).body
  assert.ok(!detail.sources.some((s) => s.source === 'listing'), JSON.stringify(detail.sources))
  assert.ok(!JSON.stringify(detail.opportunity.candidate).includes('harbor.gym.example/'))
  const listed = (await w.call(A, 'GET', `${BASE}?limit=10`)).body.opportunities.find(
    (o) => o.id === fresh.id
  )
  assert.equal(listed.candidate.socials?.instagram, undefined)
  assert.equal(
    (await w.call(A, 'DELETE', `${BASE}/${fresh.id}/sources`, { url: IG })).body.code,
    'NOT_FOUND',
    'removed once, it is gone'
  )
})

test(
  'a source can be removed before research or after it failed; running or done answers RESEARCH_STARTED',
  opts,
  async () => {
    const w = await world()
    const a = await w.accountOf(A)
    const opp = await w.saveGoogle(a)
    const TT = 'https://www.tiktok.com/@harbor.gym.example'
    const IG = 'https://www.instagram.com/harbor.gym.example/'
    const del = (url) => w.call(A, 'DELETE', `${BASE}/${opp.id}/sources`, { url })
    const stored = async () =>
      (await w.pool.query('select candidate from wo_opportunity where id = $1', [opp.id])).rows[0].candidate
    assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/sources`, { url: TT })).status, 201)
    assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/sources`, { url: IG })).status, 201)
    const IG2 = 'https://www.facebook.com/harbor.gym.example'
    assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/sources`, { url: IG2 })).status, 201)

    // Not started: the link goes and the approvals do not move.
    const early = await del(IG)
    assert.equal(early.status, 200, JSON.stringify(early.body))
    assert.equal('research' in early.body.approval, false)
    assert.equal(early.body.opportunity.candidate.socials?.instagram, undefined)

    // Running: refused with the research-started answer, nothing changes.
    await w.pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id, state) values ($1, $2, 'research', 'running-01', 'running')`,
      [a, opp.id]
    )
    const busy = await del(TT)
    assert.equal(busy.status, 409)
    assert.deepEqual(Object.keys(busy.body).sort(), ['code', 'next'])
    assert.equal(busy.body.code, 'RESEARCH_STARTED')
    assert.match(busy.body.next, /only before the research, or after it failed/)
    assert.equal((await stored()).socials?.tiktok !== undefined, true, 'the link stays')
    await w.pool.query(`delete from wo_job where request_id = 'running-01'`)

    // Failed: the bad link may be the cause, so it can go; the approvals do not move.
    await w.pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id, state) values ($1, $2, 'research', 'failed-01', 'failed')`,
      [a, opp.id]
    )
    const failed = await del(IG2)
    assert.equal(failed.status, 200, JSON.stringify(failed.body))
    assert.equal(failed.body.opportunity.candidate.socials?.facebook, undefined, 'the link is gone')
    assert.equal('research' in failed.body.approval, false)
    await w.pool.query(`delete from wo_job where request_id = 'failed-01'`)

    // Done: still refused, and the collected rows are untouched.
    await requestResearch(w.pool, {
      accountId: a,
      opportunity: (await w.pool.query('select * from wo_opportunity where id = $1', [opp.id])).rows[0],
      requestId: 'remove-research-01'
    })
    await w.drain()
    const held = (await w.pool.query('select count(*)::int as n from wo_place_snapshot_source')).rows[0].n
    const done = await del(TT)
    assert.equal(done.status, 409, JSON.stringify(done.body))
    assert.equal(done.body.code, 'RESEARCH_STARTED')
    assert.equal((await stored()).socials?.tiktok !== undefined, true, 'the link stays')
    assert.equal(
      (await w.pool.query('select count(*)::int as n from wo_place_snapshot_source')).rows[0].n,
      held
    )
    const detail = (await w.call(A, 'GET', `${BASE}/${opp.id}`)).body
    assert.equal('research' in detail.approval, false)
    assert.equal('sourcesChangedAt' in detail.approval, false)
  }
)

test('the last link of an opportunity is never removed', opts, async () => {
  const w = await world()
  await w.accountOf(A)
  const made = await w.call(A, 'POST', BASE, { links: [SITE] })
  assert.ok([200, 201].includes(made.status), JSON.stringify(made.body))
  const id = made.body.opportunity.id
  const last = await w.call(A, 'DELETE', `${BASE}/${id}/sources`, { url: SITE })
  assert.equal(last.status, 409, JSON.stringify(last.body))
  assert.deepEqual({ code: last.body.code, next: last.body.next }, { code: 'LAST_SOURCE', next: 'add' })
  assert.equal(
    (await w.pool.query('select candidate from wo_opportunity where id = $1', [id])).rows[0].candidate
      .website,
    SITE
  )
  // With a second link, the first one goes.
  assert.equal(
    (
      await w.call(A, 'POST', `${BASE}/${id}/sources`, {
        url: 'https://www.instagram.com/harbor.gym.example/'
      })
    ).status,
    201
  )
  const ok = await w.call(A, 'DELETE', `${BASE}/${id}/sources`, { url: 'harbor-gym.example' })
  assert.equal(ok.status, 200, JSON.stringify(ok.body))
  assert.equal(ok.body.opportunity.candidate.website, undefined)
})

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
    const second = new Uint8Array(
      await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 20, g: 120, b: 60 } } })
        .png()
        .toBuffer()
    )
    // After research, before approval: still added, a Profile edit.
    const later = await w.upload(A, `${BASE}/${fresh.id}/media`, second)
    assert.equal(later.status, 201)
    assert.equal(later.body.approval.profile, 'needed')
    const shown = await w.call(A, 'GET', `${BASE}/${fresh.id}`)
    assert.equal(shown.body.research?.state, 'done', 'but never for research again')
    assert.equal(shown.body.media.filter((m) => m.source === 'owner').length, 2)
    assert.ok(shown.body.media.length > 2, 'next to the collected photos')
    assert.equal(w.kept.size >= 2, true)
    // Once approved, no photo is added any more (#537 R23).
    await w.call(A, 'POST', `${BASE}/${fresh.id}/profile/approve`)
    const third = new Uint8Array(
      await sharp({ create: { width: 20, height: 30, channels: 3, background: { r: 90, g: 20, b: 160 } } })
        .png()
        .toBuffer()
    )
    const locked = await w.upload(A, `${BASE}/${fresh.id}/media`, third)
    assert.equal(locked.status, 409)
    assert.equal(locked.body.code, 'PROFILE_APPROVED')
  }
)
