// Scratch Postgres only; Google, the website and the social pages are fakes. Nothing reaches the network.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { menuVisionDoorOf } from 'website-opportunities/src/menu-photo-reading.js'
import { LOGO_PROMPT_VERSION } from 'website-opportunities/src/place-logo.js'
import { joinPlace } from 'website-opportunities/src/place-jobs.js'
import { NewPlacesLimitError, requestResearch } from 'website-opportunities/src/place-requests.js'
import { placeViewOf } from 'website-opportunities/src/place-view.js'
import { privateRefsDue } from 'website-opportunities/src/places.js'
import { JobActiveError, insertOpportunity } from 'website-opportunities/src/store.js'
import { fileDb, writeAsHistory } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)

const PLACE_ID = 'ChIJRetryTest1'
const FB = 'https://www.facebook.com/cafevela'
const db = fileDb()
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

async function drain(ex) {
  for (let i = 0; i < 20; i++) {
    const { claimed, done } = await ex.tick()
    if (!claimed) return
    await done
  }
}

/** `world` is what the fakes answer, changed between runs: `google` 'ok' | 'down', `facebook` a status/reason pair. */
async function fixture({ capCents = 1000, pageSpeed = false, placePhotos = false } = {}) {
  const { pool } = db
  const accountId = (await pool.query("insert into account(email) values('retry@tracy.test') returning id"))
    .rows[0].id
  const { row: opportunity } = await insertOpportunity(pool, accountId, {
    name: 'Cafe Vela',
    provider: 'google-places',
    providerId: PLACE_ID,
    candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'Cafe Vela' }
  })
  const real = await websiteOpportunitiesDomain()
  const world = { google: 'ok', photo: 'ok', facebook: { status: 'blocked', reason: 'credential_invalid' } }
  const calls = { google: 0, website: 0, facebook: 0, instagram: 0, photo: 0 }
  const page = (source, extra = {}) => ({
    source,
    status: 'complete',
    cursor: null,
    profile: { name: 'Cafe Vela' },
    pages: [],
    menus: [],
    bookings: [],
    socials: {},
    media: [],
    coverage: { fetched: 1 },
    ...extra
  })
  const domain = {
    ...real,
    connectorsFor: () => ({
      website: {
        available: true,
        collect: async () => {
          calls.website += 1
          return page('website', { profile: { name: 'Cafe Vela', links: [FB] } })
        }
      },
      facebook: {
        available: true,
        collect: async () => {
          calls.facebook += 1
          return world.facebook.status === 'complete'
            ? page('facebook')
            : { source: 'facebook', ...world.facebook, cursor: null, media: [], coverage: { fetched: 0 } }
        }
      },
      ...Object.fromEntries(
        ['instagram', 'tiktok', 'youtube'].map((s) => [s, { available: false, collect: async () => page(s) }])
      )
    }),
    fetchPlaceDetails: async () => {
      calls.google += 1
      if (world.google === 'down') throw Object.assign(new Error('google down'), { code: 'HTTP_500' })
      return {
        id: PLACE_ID,
        displayName: { text: 'Cafe Vela' },
        websiteUri: 'https://saga.test/',
        ...(placePhotos ? { photos: [{ name: `places/${PLACE_ID}/photos/p1`, attributions: [] }] } : {})
      }
    },
    fetchPlacePhoto: async () => {
      calls.photo += 1
      throw Object.assign(new Error('photo down'), { code: world.photo === 'down' ? 'HTTP_500' : 'HTTP_503' })
    },
    fetchLimited: async (url) => ({
      url,
      status: 200,
      mime: 'text/html',
      bytes: Buffer.from('<html></html>')
    })
  }
  const settings = {
    ...normalizeWoOpsSettings({ pageSpeedCheckEnabled: pageSpeed, googlePlacesPhotos: placePhotos }),
    tripadvisorReviews: false
  }
  const ledger = createCostLedger({
    pool,
    caps: async () => ({ dailyCapCents: capCents, jobCapCents: capCents })
  })
  const ex = createExecutor({
    host: woHost,
    pool,
    shared: true,
    loadDomain: async () => domain,
    runtime: async () => ({ keys: { google: 'test-google' }, settings }),
    chargeable: createChargeable(ledger),
    menuVisionDoor: async () => menuVisionDoorOf({ state: 'unassigned' }, woHost),
    apiFetch: async () => {
      throw new Error('no network in tests')
    },
    objects: { put: async () => true, get: async () => null },
    imageInfo,
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    switchOn: async () => true,
    log: { warn() {}, error() {}, log() {} }
  })
  const research = (requestId, extra = {}) =>
    requestResearch(pool, { accountId, opportunity, requestId, requiredSources: {}, ...extra })
  const shown = async () =>
    (await placeViewOf(pool, opportunity)).shown.map((s) => [s.source, s.status, s.reason ?? null])
  const ledgerRows = async () =>
    (await pool.query('select provider, operation from wo_cost_ledger order by created_at')).rows.map(
      (r) => `${r.provider}:${r.operation}`
    )
  const placeId = async () => (await pool.query('select id from wo_place limit 1')).rows[0].id
  return { pool, ex, world, calls, research, shown, ledgerRows, placeId, opportunity, accountId }
}

test(
  'the place view lists Google beside the website and the social page, with what each ended on',
  opts,
  async () => {
    const h = await fixture()
    await h.research('first')
    await drain(h.ex)
    assert.deepEqual(await h.shown(), [
      ['website', 'complete', null],
      ['facebook', 'blocked', 'credential_invalid'],
      ['google-places', 'complete', null]
    ])
  }
)

test('a Google Place Details call that failed is listed as failed, not hidden', opts, async () => {
  const h = await fixture()
  h.world.google = 'down'
  await h.research('first')
  await drain(h.ex)
  assert.deepEqual(await h.shown(), [['google-places', 'failed', 'error']])
})

test('Retry on one source collects that source alone, at once, and nothing else', opts, async () => {
  const h = await fixture()
  await h.research('first')
  await drain(h.ex)
  assert.deepEqual(h.calls, { google: 1, website: 1, facebook: 1, instagram: 0, photo: 0 })
  h.world.facebook = { status: 'complete' }
  const { job } = await h.research('retry-facebook', { onlySource: 'facebook' })
  assert.ok(job)
  await drain(h.ex)
  assert.deepEqual(h.calls, { google: 1, website: 1, facebook: 2, instagram: 0, photo: 0 })
  assert.deepEqual(await h.shown(), [
    ['website', 'complete', null],
    ['facebook', 'complete', null],
    ['google-places', 'complete', null]
  ])
})

test('Retry on a social source downloads no Google listing photo', opts, async () => {
  const h = await fixture({ placePhotos: true })
  await h.research('first')
  await drain(h.ex)
  const photosBefore = h.calls.photo
  assert.ok(photosBefore > 0, 'the full research asks for the listing photo it has not stored')
  h.world.facebook = { status: 'complete' }
  await h.research('retry-facebook', { onlySource: 'facebook' })
  await drain(h.ex)
  assert.equal(h.calls.facebook, 2)
  assert.equal(h.calls.photo, photosBefore)
})

test(
  'Retry on Google asks Place Details once more, charged through the ledger, and collects no page',
  opts,
  async () => {
    const h = await fixture()
    h.world.google = 'down'
    await h.research('first')
    await drain(h.ex)
    assert.deepEqual(await h.ledgerRows(), ['google:place-details'])
    h.world.google = 'ok'
    await h.research('retry-google', { onlySource: 'google-places' })
    await drain(h.ex)
    assert.equal(h.calls.google, 2)
    assert.equal(h.calls.website, 0)
    assert.deepEqual(await h.ledgerRows(), ['google:place-details', 'google:place-details'])
    assert.equal((await h.shown()).find((r) => r[0] === 'google-places')[1], 'complete')
  }
)

test('Retry over the spending cap pauses before the call goes out', opts, async () => {
  const h = await fixture()
  h.world.google = 'down'
  await h.research('first')
  await drain(h.ex)
  await h.pool.query('update wo_cost_ledger set reserved_cents = 100000, actual_cents = 100000')
  h.world.google = 'ok'
  await h.research('retry-google', { onlySource: 'google-places' })
  await drain(h.ex)
  assert.equal(h.calls.google, 1)
  const last = (
    await h.pool.query('select state, last_error from wo_place_job order by created_at desc limit 1')
  ).rows[0]
  assert.equal(last.state, 'paused')
  assert.equal(last.last_error.reason, 'budget')
})

test(
  'Retry on a place never researched runs the whole research and counts against new places',
  opts,
  async () => {
    const h = await fixture()
    await assert.rejects(
      h.research('first', { onlySource: 'facebook', newPlaceAllowed: async () => false }),
      NewPlacesLimitError
    )
    const { job } = await h.research('second', { onlySource: 'facebook' })
    const placeJob = (
      await h.pool.query('select only_source from wo_place_job where id = $1', [job.place_job_id])
    ).rows[0]
    assert.equal(placeJob.only_source, null)
  }
)

test(
  'a waiting one-source run becomes the whole research when the whole research is asked for',
  opts,
  async () => {
    const h = await fixture()
    await h.research('first')
    await drain(h.ex)
    const client = await h.pool.connect()
    try {
      const part = await joinPlace(client, await h.placeId(), { onlySource: 'facebook' })
      assert.equal(part.job.only_source, 'facebook')
      const same = await joinPlace(client, await h.placeId(), { onlySource: 'facebook' })
      assert.equal(same.job.id, part.job.id)
      const whole = await joinPlace(client, await h.placeId(), { force: true })
      assert.equal(whole.job.id, part.job.id)
      assert.equal(whole.job.only_source, null)
    } finally {
      client.release()
    }
  }
)

test(
  'an opportunity source blocked by our key is due again, one the place keeps private is settled',
  opts,
  async () => {
    const h = await fixture()
    await h.research('first')
    await drain(h.ex)
    await h.pool.query(
      `update wo_opportunity set candidate = candidate || '{"socials":{"instagram":"https://www.instagram.com/mine","tiktok":"https://www.tiktok.com/@mine"}}'::jsonb where id = $1`,
      [h.opportunity.id]
    )
    await h.pool.query(
      `insert into wo_source (opportunity_id, source, ref, status, reason) values
       ($1, 'instagram', 'https://www.instagram.com/mine', 'blocked', 'credential_invalid'),
       ($1, 'tiktok', 'https://www.tiktok.com/@mine', 'blocked', 'private_or_empty')`,
      [h.opportunity.id]
    )
    const opportunity = (await h.pool.query('select * from wo_opportunity where id = $1', [h.opportunity.id]))
      .rows[0]
    // The rows are stamped with the database clock, so judge them by it (the clock-shift run moves Date.now()).
    const dbNow = (await h.pool.query('select now() as t')).rows[0].t.getTime()
    const due = await privateRefsDue(h.pool, opportunity, await h.placeId(), dbNow)
    assert.deepEqual(
      due.map((r) => r.source),
      ['instagram']
    )
  }
)

test('a Retry of another source while a one-source run waits is refused, not dropped', opts, async () => {
  const h = await fixture()
  await h.research('first')
  await drain(h.ex)
  const client = await h.pool.connect()
  try {
    await joinPlace(client, await h.placeId(), { onlySource: 'facebook' })
    await assert.rejects(
      joinPlace(client, await h.placeId(), { onlySource: 'google-places' }),
      JobActiveError
    )
  } finally {
    client.release()
  }
})

test(
  'a Retry of another source while a one-source run is running queues its own run behind it',
  opts,
  async () => {
    const h = await fixture()
    await h.research('first')
    await drain(h.ex)
    const client = await h.pool.connect()
    try {
      const part = await joinPlace(client, await h.placeId(), { onlySource: 'facebook' })
      await client.query("update wo_place_job set state = 'running' where id = $1", [part.job.id])
      const next = await joinPlace(client, await h.placeId(), { onlySource: 'google-places' })
      assert.notEqual(next.job.id, part.job.id)
      assert.deepEqual([next.job.state, next.job.only_source], ['queued', 'google-places'])
    } finally {
      client.release()
    }
  }
)

test(
  'a one-source Retry pays for its source only: no new PageSpeed audit, no menu search',
  opts,
  async () => {
    const h = await fixture({ pageSpeed: true })
    await h.research('first')
    await drain(h.ex)
    const before = await h.ledgerRows()
    assert.ok(before.includes('google:pagespeed'), 'the whole research audited the website')
    h.world.facebook = { status: 'complete' }
    await h.research('retry-facebook', { onlySource: 'facebook' })
    await drain(h.ex)
    assert.deepEqual(await h.ledgerRows(), before)
    assert.equal((await h.shown()).find((r) => r[0] === 'facebook')[1], 'complete')
  }
)

// e2e dev 24/10/2026: a Retry that found nothing new published a new snapshot, so every brief read as stale and
// the logo research it carried was redone with zero vision calls on record.
test(
  'a Retry whose source answers the same keeps the snapshot, the brief and the logo research',
  opts,
  async () => {
    const h = await fixture()
    await h.research('first')
    await drain(h.ex)
    const place = await h.placeId()
    const current = async () =>
      (await h.pool.query('select current_snapshot_id from wo_place where id = $1', [place])).rows[0]
        .current_snapshot_id
    const before = await current()
    const held = {
      version: LOGO_PROMPT_VERSION,
      at: '2026-10-20T00:00:00.000Z',
      status: 'none',
      chosen: null,
      candidates: [],
      vision: { status: 'complete', calls: 3, promptTokens: 900, completionTokens: 30, cents: 1 }
    }
    await writeAsHistory(
      h.pool,
      `update wo_place_snapshot_profile set brand = coalesce(brand, '{}'::jsonb) || $2::jsonb where snapshot_id = $1`,
      [before, JSON.stringify({ logoResearch: held })]
    )
    const { currentResearchKey } = await import('../src/opportunities-build/revisions.js')
    const domain = await websiteOpportunitiesDomain()
    const opp = (await h.pool.query('select * from wo_opportunity where id = $1', [h.opportunity.id])).rows[0]
    const key = await currentResearchKey(h.pool, opp, domain)

    await h.research('retry-facebook', { onlySource: 'facebook' })
    await drain(h.ex)
    assert.equal(h.calls.facebook, 2, 'the source was asked again')
    assert.equal(await current(), before, 'nothing changed: no new snapshot')
    assert.equal(await currentResearchKey(h.pool, opp, domain), key, 'the brief is not stale')
    const brand = (
      await h.pool.query('select brand from wo_place_snapshot_profile where snapshot_id = $1', [before])
    ).rows[0].brand
    assert.deepEqual(brand.logoResearch, held)
    const job = (
      await h.pool.query(`select state, result_snapshot_id from wo_job where request_id = 'retry-facebook'`)
    ).rows[0]
    assert.deepEqual(job, { state: 'completed', result_snapshot_id: before })
  }
)

test(
  'a Retry that finds something new still publishes it, keeping the logo research it did not redo',
  opts,
  async () => {
    const h = await fixture()
    await h.research('first')
    await drain(h.ex)
    const place = await h.placeId()
    const current = async () =>
      (await h.pool.query('select current_snapshot_id from wo_place where id = $1', [place])).rows[0]
        .current_snapshot_id
    const before = await current()
    const held = {
      version: LOGO_PROMPT_VERSION,
      at: '2026-10-20T00:00:00.000Z',
      status: 'none',
      chosen: null,
      candidates: [],
      vision: { status: 'complete', calls: 3, promptTokens: 900, completionTokens: 30, cents: 1 }
    }
    await writeAsHistory(
      h.pool,
      `update wo_place_snapshot_profile set brand = coalesce(brand, '{}'::jsonb) || $2::jsonb where snapshot_id = $1`,
      [before, JSON.stringify({ logoResearch: held })]
    )
    h.world.facebook = { status: 'complete' }
    await h.research('retry-facebook', { onlySource: 'facebook' })
    await drain(h.ex)
    const after = await current()
    assert.notEqual(after, before)
    const brand = (
      await h.pool.query('select brand from wo_place_snapshot_profile where snapshot_id = $1', [after])
    ).rows[0].brand
    assert.equal(brand.logoResearch.vision.calls, 3)
  }
)

// e2e dev 24/10/2026: a demo brief made from a frozen research read showed "research changed" at once — the live
// read hashed its Date columns as `{}`, the frozen copy (back from jsonb) as ISO strings.
test('a brief made from a frozen research read hashes like the live read it froze', opts, async () => {
  const h = await fixture()
  await h.research('first')
  await drain(h.ex)
  const { currentResearchKey, freezeDemoResearchInput, researchKey } = await import(
    '../src/opportunities-build/revisions.js'
  )
  const domain = await websiteOpportunitiesDomain()
  const opp = (await h.pool.query('select * from wo_opportunity where id = $1', [h.opportunity.id])).rows[0]
  const frozen = JSON.parse(JSON.stringify(await freezeDemoResearchInput(h.pool, opp.id, opp.account_id)))
  assert.equal(researchKey(domain, frozen), await currentResearchKey(h.pool, opp, domain))
})
