// Research again on a real database (tasks/todo-wo-research-again.md): the web search for a place's Facebook and
// Instagram pages is a part of its own, and a pressed Research again looks again only at what is due.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { joinPlace } from 'website-opportunities/src/place-jobs.js'
import { requestResearch } from 'website-opportunities/src/place-requests.js'
import { SOURCE_RETRY_MS } from 'website-opportunities/src/places.js'
import { placeAgainPlan, queueResearchAgain } from 'website-opportunities/src/research-again.js'
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { fileDb, writeAsHistory } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const PLACE_ID = 'ChIJagainSushi1'
const FB = 'https://www.facebook.com/tomarusushibar'
const IG = 'https://www.instagram.com/tomardubai'
const GOOGLE = {
  displayName: { text: 'Tomaru Sushi Bar' },
  formattedAddress: 'Sarab 1B, Al Barari, Dubai',
  nationalPhoneNumber: '056 555 0146',
  addressComponents: [
    { longText: 'Sarab 1B', types: ['route'] },
    { longText: 'Dubai', types: ['locality'] }
  ]
}

const blocked = () => ({
  available: false,
  reason: 'credential_missing',
  collect: async () => ({ status: 'blocked', media: [] })
})

/** A domain whose web search answers `pages` (url → page facts); every outside call is counted. */
async function domainWith(pages) {
  const real = await websiteOpportunitiesDomain()
  const calls = { search: [], page: 0, details: 0 }
  const domain = {
    ...real,
    connectorsFor: () => ({
      website: blocked(),
      facebook: blocked(),
      instagram: blocked(),
      tiktok: blocked(),
      youtube: blocked()
    }),
    fetchPlaceDetails: async (placeId) => {
      calls.details += 1
      return { id: placeId, ...GOOGLE }
    },
    scrapeCreatorsGoogleSearch: async (q) => {
      calls.search.push(q)
      return Object.keys(pages.current).map((u) => ({ title: 'page', url: u, description: '' }))
    },
    collectSocialProfile: async (network, u) => {
      calls.page += 1
      const key = Object.keys(pages.current).find((k) => u.replace(/\/$/, '') === k)
      return {
        source: network,
        status: 'complete',
        profile: pages.current[key] ?? null,
        posts: [],
        media: []
      }
    }
  }
  return { domain, calls }
}

function executor(pool, domain, clock) {
  return createExecutor({
    host: woHost,
    pool,
    shared: true,
    now: () => clock.now,
    loadDomain: async () => domain,
    runtime: async () => ({
      keys: { google: 'AIza-test', apify: null, scrapecreators: 'sc-test' },
      settings: normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false })
    }),
    objects: { put: async () => true },
    switchOn: async () => true,
    imageInfo,
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    log: { warn() {}, error() {}, log() {}, info() {} }
  })
}

async function drain(ex) {
  for (let i = 0; i < 20; i += 1) {
    const { claimed, done } = await ex.tick()
    if (!claimed) break
    await done
  }
}

async function researchOnce(pool, ex) {
  const accountId = (await pool.query("insert into account (email) values ('a@example.com') returning id"))
    .rows[0].id
  const candidate = { provider: 'google-places', providerId: PLACE_ID, name: 'Tomaru Sushi Bar', socials: {} }
  const { row } = await insertOpportunity(pool, accountId, {
    name: 'Tomaru Sushi Bar',
    branch: null,
    provider: 'google-places',
    providerId: PLACE_ID,
    candidate
  })
  await requestResearch(pool, { accountId, opportunity: row, requestId: 'again-1' })
  await drain(ex)
  return { accountId, placeId: row.place_id }
}

const searchRows = async (pool) =>
  (
    await pool.query(
      `select ss.source, ss.status, ss.reason, ss.collector_version, ss.coverage, ss.attempted_at, ss.collected
         from wo_place p join wo_place_snapshot_source ss on ss.snapshot_id = p.current_snapshot_id
        where ss.source like '%-search' order by ss.source`
    )
  ).rows

const links = async (pool) =>
  (await pool.query('select kind, verified_by from wo_place_link order by kind')).rows.map((l) => [
    l.kind,
    l.verified_by
  ])

const keysAndSettings = (domain) => ({
  domain,
  keys: { google: 'AIza-test', scrapecreators: 'sc-test' },
  settings: normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false })
})

test('the search for each network leaves its own row on the published snapshot', opts, async () => {
  const pages = {
    current: {
      [FB]: { name: 'Tomaru Sushi Bar | Dubai', address: 'Al Barari, Dubai', phone: '056 555 0146' }
    }
  }
  const { domain } = await domainWith(pages)
  const clock = { now: Date.parse('2026-10-24T05:00:00Z') }
  await researchOnce(db.pool, executor(db.pool, domain, clock))
  const rows = await searchRows(db.pool)
  assert.deepEqual(
    rows.map((r) => [r.source, r.status, r.reason]),
    [
      ['facebook-search', 'complete', null],
      ['instagram-search', 'skipped', 'not_found']
    ]
  )
  assert.ok(rows.every((r) => (r.collector_version ?? r.coverage?.version)?.startsWith('social-search-')))
  assert.deepEqual(await links(db.pool), [['facebook', 'search']])
})

test(
  'a place researched before the search existed is searched by Research again, and nothing else runs',
  opts,
  async () => {
    const pages = { current: {} }
    const { domain, calls } = await domainWith(pages)
    const clock = { now: Date.parse('2026-10-23T05:00:00Z') }
    const ex = executor(db.pool, domain, clock)
    const { placeId } = await researchOnce(db.pool, ex)
    // The 23/10 place: its research holds no search rows at all.
    await writeAsHistory(
      db.pool,
      `delete from wo_place_snapshot_source where source like '%-search'
       and snapshot_id = (select current_snapshot_id from wo_place where id = $1)`,
      [placeId]
    )
    clock.now = Date.parse('2026-10-24T05:00:00Z')
    const plan = await placeAgainPlan(db.pool, placeId, { now: clock.now, ...keysAndSettings(domain) })
    assert.deepEqual(
      plan.run.map((r) => [r.part, r.reason]),
      [
        ['facebook-search', 'never'],
        ['instagram-search', 'never']
      ]
    )
    pages.current = {
      [IG]: { name: 'Tomar • Dubai', address: 'Al Barari, Dubai', phone: '+971 56 555 0146' }
    }
    const details = calls.details
    const queued = await queueResearchAgain(db.pool, placeId, {
      now: clock.now,
      starter: { kind: 'operator' },
      ...keysAndSettings(domain)
    })
    assert.ok(queued.job?.again_plan, 'the run holds the accepted plan')
    await drain(ex)
    assert.equal(calls.details, details, 'the Google listing, still fresh, is not fetched again')
    assert.deepEqual(await links(db.pool), [['instagram', 'search']])
    const after = await placeAgainPlan(db.pool, placeId, { now: clock.now, ...keysAndSettings(domain) })
    assert.deepEqual(after.run, [], 'nothing left to look at again')
  }
)

test('Research again with nothing due queues nothing', opts, async () => {
  const pages = { current: {} }
  const { domain } = await domainWith(pages)
  const clock = { now: Date.parse('2026-10-24T05:00:00Z') }
  const { placeId } = await researchOnce(db.pool, executor(db.pool, domain, clock))
  const out = await queueResearchAgain(db.pool, placeId, {
    now: clock.now + 60_000,
    starter: { kind: 'operator' },
    ...keysAndSettings(domain)
  })
  assert.equal(out.job, undefined)
  assert.deepEqual(out.plan.run, [])
})

test(
  'a Try again of one search that finds nothing new still records the try on the current research',
  opts,
  async () => {
    const pages = { current: {} }
    const { domain, calls } = await domainWith(pages)
    const clock = { now: Date.parse('2026-10-24T05:00:00Z') }
    const ex = executor(db.pool, domain, clock)
    const { placeId } = await researchOnce(db.pool, ex)
    clock.now += 2 * SOURCE_RETRY_MS
    const before = calls.search.length
    const client = await db.pool.connect()
    try {
      await client.query('begin')
      await joinPlace(client, placeId, { onlySource: 'instagram-search', starter: { kind: 'operator' } })
      await client.query('commit')
    } finally {
      client.release()
    }
    await drain(ex)
    assert.ok(calls.search.length > before, 'searched again')
    assert.ok(
      calls.search.slice(before).every((q) => /instagram/.test(q)),
      'only the Instagram search ran'
    )
    const ig = (await searchRows(db.pool)).find((r) => r.source === 'instagram-search')
    assert.equal(new Date(ig.attempted_at).getTime(), clock.now, 'the try is on the current research')
  }
)

test('a Research again pressed while a run is going joins it and queues nothing more', opts, async () => {
  const pages = { current: {} }
  const { domain } = await domainWith(pages)
  const clock = { now: Date.parse('2026-10-23T05:00:00Z') }
  const { placeId } = await researchOnce(db.pool, executor(db.pool, domain, clock))
  await writeAsHistory(
    db.pool,
    `delete from wo_place_snapshot_source where source like '%-search'
       and snapshot_id = (select current_snapshot_id from wo_place where id = $1)`,
    [placeId]
  )
  const client = await db.pool.connect()
  try {
    await client.query('begin')
    await joinPlace(client, placeId, { onlySource: 'tripadvisor', starter: { kind: 'operator' } })
    await client.query('commit')
  } finally {
    client.release()
  }
  const out = await queueResearchAgain(db.pool, placeId, {
    now: clock.now,
    starter: { kind: 'operator' },
    ...keysAndSettings(domain)
  })
  assert.equal(out.joined, true)
  assert.equal(out.job.again_plan, null)
  const { rows } = await db.pool.query("select count(*)::int as n from wo_place_job where state = 'queued'")
  assert.equal(rows[0].n, 1)
})

const forgetSearches = (pool, placeId) =>
  writeAsHistory(
    pool,
    `delete from wo_place_snapshot_source where source like '%-search'
       and snapshot_id = (select current_snapshot_id from wo_place where id = $1)`,
    [placeId]
  )

test(
  'an account presses Research again on its place card: the run is its own, within its daily limit',
  opts,
  async () => {
    const pages = { current: {} }
    const { domain } = await domainWith(pages)
    const clock = { now: Date.parse('2026-10-23T05:00:00Z') }
    const { accountId, placeId } = await researchOnce(db.pool, executor(db.pool, domain, clock))
    const opportunity = (
      await db.pool.query('select * from wo_opportunity where account_id = $1', [accountId])
    ).rows[0]
    const deps = keysAndSettings(domain)
    await assert.rejects(
      requestResearch(db.pool, {
        accountId,
        opportunity,
        requestId: 'again-2',
        now: () => clock.now,
        again: deps
      }),
      (e) => e.code === 'NOTHING_DUE' && e.plan.run.length === 0
    )
    await forgetSearches(db.pool, placeId)
    await assert.rejects(
      requestResearch(db.pool, {
        accountId,
        opportunity,
        requestId: 'again-3',
        now: () => clock.now,
        again: { ...deps, settings: { ...deps.settings, researchAgainPerAccountDay: 0 } }
      }),
      (e) => e.code === 'RESEARCH_AGAIN_LIMIT'
    )
    const out = await requestResearch(db.pool, {
      accountId,
      opportunity,
      requestId: 'again-4',
      now: () => clock.now,
      again: deps
    })
    assert.deepEqual(
      out.plan.run.map((r) => r.part),
      ['facebook-search', 'instagram-search']
    )
    const run = (await db.pool.query('select * from wo_place_job where id = $1', [out.job.place_job_id]))
      .rows[0]
    assert.equal(run.started_by, 'account')
    assert.equal(run.started_by_account_id, accountId)
    assert.ok(run.again_plan)
  }
)

test('a stranger on /find presses Research again: Tracy pays, once a place a day', opts, async () => {
  const { admitPublicResearchAgain } = await import('website-opportunities/src/place-jobs.js')
  const pages = { current: {} }
  const { domain } = await domainWith(pages)
  const clock = { now: Date.parse('2026-10-23T05:00:00Z') }
  const ex = executor(db.pool, domain, clock)
  const { placeId } = await researchOnce(db.pool, ex)
  const limits = { perAddressDay: 50, perDay: 1000, budgetCents: 500, jobCapCents: 200 }
  const press = (extra = {}) =>
    admitPublicResearchAgain(db.pool, {
      placeId,
      providerId: PLACE_ID,
      ipBucket: '203.0.113.7',
      now: clock.now,
      limits,
      ...keysAndSettings(domain),
      ...extra
    })
  assert.equal((await press()).state, 'up-to-date')
  await forgetSearches(db.pool, placeId)
  const first = await press()
  assert.equal(first.state, 'queued')
  assert.ok(first.receipt)
  const run = (await db.pool.query("select * from wo_place_job where state = 'queued'")).rows[0]
  assert.equal(run.started_by, 'public')
  assert.ok(run.again_plan.ceilingCents <= limits.jobCapCents)
  const joined = await press()
  assert.equal(joined.joined, true, 'a second press joins the run going')
  await drain(ex)
  await forgetSearches(db.pool, placeId)
  assert.equal((await press()).refused, 'PUBLIC_AGAIN_LIMIT')
  assert.equal(
    (
      await press({
        limits: { ...limits, budgetCents: 0 },
        settings: { ...keysAndSettings(domain).settings, publicResearchAgainPerPlacePerDay: 5 }
      })
    ).refused,
    'PUBLIC_RESEARCH_SPENT'
  )
})

test('/ops confirms a page the search left for a person to check, and the place gains it', opts, async () => {
  const { judgeSocialPage } = await import('website-opportunities/src/wo-places-store.js')
  // Same name, same city, no branch proof: left pending.
  const pages = { current: { [IG]: { name: 'Tomaru Sushi Bar', address: 'Dubai' } } }
  const { domain } = await domainWith(pages)
  const clock = { now: Date.parse('2026-10-24T05:00:00Z') }
  const { placeId } = await researchOnce(db.pool, executor(db.pool, domain, clock))
  const ig = (await searchRows(db.pool)).find((r) => r.source === 'instagram-search')
  assert.equal(ig.reason, 'pending')
  await assert.rejects(
    judgeSocialPage(db.pool, placeId, {
      url: 'https://www.instagram.com/someoneelse',
      verdict: 'confirm',
      actor: 'op@tracy.test'
    }),
    (e) => e.code === 'PAGE_NOT_FOUND'
  )
  await judgeSocialPage(db.pool, placeId, { url: IG, verdict: 'confirm', actor: 'op@tracy.test' })
  assert.deepEqual(await links(db.pool), [['instagram', 'operator']])
  // A confirmed page is named on the current snapshot, so Research again plans it (not only Force refresh); this
  // test domain has no Instagram key, so the plan keeps it as unavailable rather than leaving it out.
  const plan = await placeAgainPlan(db.pool, placeId, { now: clock.now, ...keysAndSettings(domain) })
  assert.ok(
    [...plan.run, ...plan.kept].some((r) => r.part === 'instagram'),
    JSON.stringify(plan)
  )
})

test('/ops sees the pages each search found, with their verdict and evidence', opts, async () => {
  const { placeDetail, judgeSocialPage } = await import('website-opportunities/src/wo-places-store.js')
  const pages = { current: { [IG]: { name: 'Tomaru Sushi Bar', address: 'Dubai' } } }
  const { domain } = await domainWith(pages)
  const clock = { now: Date.parse('2026-10-24T05:00:00Z') }
  const { placeId } = await researchOnce(db.pool, executor(db.pool, domain, clock))
  const searchOf = async () =>
    (await placeDetail(db.pool, placeId, clock.now)).place.sources.find(
      (s) => s.source === 'instagram-search'
    )
  const before = await searchOf()
  assert.equal(before.pages.length, 1)
  assert.equal(before.pages[0].url.replace(/\/$/, ''), IG)
  assert.equal(before.pages[0].verdict, 'pending')
  assert.ok(Array.isArray(before.pages[0].evidence?.reasons))
  await judgeSocialPage(db.pool, placeId, { url: IG, verdict: 'reject', actor: 'op@tracy.test' })
  assert.equal((await searchOf()).pages[0].verdict, 'rejected')
  const website = (await placeDetail(db.pool, placeId, clock.now)).place.sources.find(
    (s) => s.source === 'website'
  )
  assert.equal(website?.pages, undefined)
})

const setVersion = (pool, placeId, source, version) =>
  pool.query(
    `update wo_place_snapshot_source set collector_version = $3
      where source = $2 and snapshot_id = (select current_snapshot_id from wo_place where id = $1)`,
    [placeId, source, version]
  )

test(
  'Google facts collected before the field mask gained the phone are fetched again by Research again',
  opts,
  async () => {
    const { domain, calls } = await domainWith({ current: {} })
    const clock = { now: Date.parse('2026-10-24T05:00:00Z') }
    const ex = executor(db.pool, domain, clock)
    const { placeId } = await researchOnce(db.pool, ex)
    const fresh = await placeAgainPlan(db.pool, placeId, { now: clock.now, ...keysAndSettings(domain) })
    assert.ok(!fresh.run.some((r) => r.part === 'google-places'), 'collected by this rule: up to date')
    // A place collected before #1670 carries the old generic version.
    await setVersion(db.pool, placeId, 'google-places', 'wo-place-1')
    const plan = await placeAgainPlan(db.pool, placeId, { now: clock.now, ...keysAndSettings(domain) })
    assert.deepEqual(
      plan.run.filter((r) => r.part === 'google-places').map((r) => r.reason),
      ['rule-changed']
    )
    const details = calls.details
    await queueResearchAgain(db.pool, placeId, {
      now: clock.now,
      starter: { kind: 'operator' },
      ...keysAndSettings(domain)
    })
    await drain(ex)
    assert.equal(calls.details, details + 1, 'Place Details fetched again')
    const after = await placeAgainPlan(db.pool, placeId, { now: clock.now, ...keysAndSettings(domain) })
    assert.ok(!after.run.some((r) => r.part === 'google-places'))
  }
)

test('a Facebook page collected before the logo fix is collected again by Research again', opts, async () => {
  const pages = {
    current: {
      [FB]: { name: 'Tomaru Sushi Bar | Dubai', address: 'Al Barari, Dubai', phone: '056 555 0146' }
    }
  }
  const { domain } = await domainWith(pages)
  let collects = 0
  const facebook = {
    available: true,
    provider: 'scrapecreators',
    collect: async () => {
      collects += 1
      return {
        source: 'facebook',
        status: 'complete',
        profile: { name: 'Tomaru Sushi Bar' },
        posts: [],
        media: [],
        coverage: { fetched: 0 }
      }
    }
  }
  const connectorsFor = domain.connectorsFor
  domain.connectorsFor = (...a) => ({ ...connectorsFor(...a), facebook })
  const clock = { now: Date.parse('2026-10-24T05:00:00Z') }
  const ex = executor(db.pool, domain, clock)
  const { placeId } = await researchOnce(db.pool, ex)
  assert.equal(collects, 1)
  const fresh = await placeAgainPlan(db.pool, placeId, { now: clock.now, ...keysAndSettings(domain) })
  assert.ok(!fresh.run.some((r) => r.part === 'facebook'), 'collected by this rule: up to date')
  await setVersion(db.pool, placeId, 'facebook', 'wo-place-1')
  const plan = await placeAgainPlan(db.pool, placeId, { now: clock.now, ...keysAndSettings(domain) })
  assert.deepEqual(
    plan.run.filter((r) => r.part === 'facebook').map((r) => r.reason),
    ['rule-changed']
  )
  await queueResearchAgain(db.pool, placeId, {
    now: clock.now,
    starter: { kind: 'operator' },
    ...keysAndSettings(domain)
  })
  await drain(ex)
  assert.equal(collects, 2, 'the page is read again')
  const after = await placeAgainPlan(db.pool, placeId, { now: clock.now, ...keysAndSettings(domain) })
  assert.ok(!after.run.some((r) => r.part === 'facebook'))
})

// "Juniper" $0.36 previewed vs $0.43 spent, Tomaru $0.18 vs $0.23 (24/10/2026): the preview must hold the whole run.
test('the preview ceiling holds every call a run can make', opts, async () => {
  const { domain } = await domainWith({ current: {} })
  const clock = { now: Date.parse('2026-10-24T05:00:00Z') }
  const { placeId } = await researchOnce(db.pool, executor(db.pool, domain, clock))
  await forgetSearches(db.pool, placeId)
  const base = keysAndSettings(domain)
  const plan = await placeAgainPlan(db.pool, placeId, {
    now: clock.now,
    ...base,
    keys: { ...base.keys, serpapi: 'serp-test', rapidapi: 'rapid-test' }
  })
  const cents = Object.fromEntries(plan.run.map((r) => [r.part, r.ceilingCents]))
  // Each of three queries: a 1¢ search and up to three page reads (Facebook 2¢, Instagram 1¢); then the page itself.
  assert.equal(cents['facebook-search'], 3 * (1 + 3 * 2) + 2)
  assert.equal(cents['instagram-search'], 3 * (1 + 3 * 1) + 1)
  // Google's branch location (3¢), then each keyed provider: a search, up to three place reads and the reviews.
  assert.equal(cents.tripadvisor, 3 + (3 + 3 * 3 + 3) + (1 + 3 * 1 + 1))
})

test('/ops adds a social page the search did not find; Research again then collects it', opts, async () => {
  const { addSocialPage } = await import('website-opportunities/src/wo-places-store.js')
  // The search finds nothing (pilot 24/10/2026: Tomaru's Facebook page).
  const { domain } = await domainWith({ current: {} })
  const clock = { now: Date.parse('2026-10-24T05:00:00Z') }
  const { placeId } = await researchOnce(db.pool, executor(db.pool, domain, clock))
  const resolve = async () => [{ address: '157.240.1.35', family: 4 }]
  const add = (u) => addSocialPage(db.pool, placeId, { url: u, actor: 'op@tracy.test', resolve })
  for (const [bad, code] of [
    ['https://tomaru.test/', 'INVALID_URL'],
    ['javascript:alert(1)', 'INVALID_URL'],
    ['https://user:pw@www.facebook.com/tomaru', 'URL_BLOCKED'],
    ['https://www.facebook.com:8443/tomaru', 'URL_BLOCKED']
  ])
    await assert.rejects(add(bad), (e) => e.code === code, bad)
  await assert.rejects(
    addSocialPage(db.pool, placeId, {
      url: `${FB}/`,
      actor: 'op@tracy.test',
      resolve: async () => [{ address: '10.0.0.1', family: 4 }]
    }),
    (e) => e.code === 'URL_BLOCKED'
  )
  assert.deepEqual(await links(db.pool), [])
  assert.deepEqual(await add(`${FB}/#about`), { link: { kind: 'facebook', url: FB }, added: true })
  assert.deepEqual(await add(FB), { link: { kind: 'facebook', url: FB }, added: false })
  const rows = (await db.pool.query('select kind, url, verified_by, evidence from wo_place_link')).rows
  assert.deepEqual(rows, [
    {
      kind: 'facebook',
      url: FB,
      verified_by: 'operator',
      evidence: { from: 'operator', addedBy: 'op@tracy.test' }
    }
  ])
  const event = (await db.pool.query("select detail from wo_place_ops_event where action = 'social-page'"))
    .rows
  assert.deepEqual(
    event.map((e) => e.detail),
    [{ url: FB, network: 'facebook', verdict: 'added' }]
  )
  // With a Facebook connector, Research again collects the page and no longer searches for one.
  const withFacebook = {
    ...domain,
    connectorsFor: () => ({ ...domain.connectorsFor(), facebook: { available: true } })
  }
  const plan = await placeAgainPlan(db.pool, placeId, { now: clock.now, ...keysAndSettings(withFacebook) })
  const parts = [...plan.run, ...plan.kept].map((r) => r.part)
  assert.ok(
    plan.run.some((r) => r.part === 'facebook'),
    JSON.stringify(plan)
  )
  assert.ok(!parts.includes('facebook-search'), JSON.stringify(plan))
  await assert.rejects(
    addSocialPage(db.pool, '00000000-0000-4000-8000-000000000000', {
      url: FB,
      actor: 'op@tracy.test',
      resolve
    }),
    (e) => e.code === 'PLACE_NOT_FOUND'
  )
})
