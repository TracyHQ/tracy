// The hub decides pending observations against what it reads itself: one fetch per source group, charged through
// the cost ledger, with `unsupported_source` and `deferred_budget` instead of a lowered bar.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createCostLedger } from '../src/cost-ledger.js'
import { migrate } from '../src/schema/index.js'
import { createHubContributions } from '../src/hub/contributions.js'
import { createHubQuota } from '../src/hub/quota.js'
import { createHubTokens } from '../src/hub/tokens.js'
import { createGooglePlacesAdapter, createVerifyQueue } from '../src/hub/verify-queue.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const KEY = ['fake', 'google', 'key'].join('-')
const PLACE = {
  id: 'ChIJ-cafe',
  displayName: { text: 'Cafe Aurora' },
  websiteUri: 'https://www.cafe-aurora.example/',
  formattedAddress: 'Main Street 1, 1011 AB Town',
  internationalPhoneNumber: '+31 20 123 4567',
  nationalPhoneNumber: '020 123 4567',
  location: { latitude: 52.37, longitude: 4.89 },
  rating: 4.6,
  userRatingCount: 210,
  primaryType: 'cafe',
  regularOpeningHours: {
    periods: [
      { open: { day: 1, hour: 8, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
      { open: { day: 2, hour: 8, minute: 0 }, close: { day: 2, hour: 17, minute: 30 } },
      { open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }
    ],
    weekdayDescriptions: [
      'Monday: 8:00\u2009AM\u2009\u2013\u20095:30\u2009PM',
      'Tuesday: 8:00\u2009AM\u2009\u2013\u20095:30\u2009PM'
    ]
  }
}

let db
let clock
let calls
let failNext
let tokens
let contributions
let ledger

const fakeFetch = async (url) => {
  calls.push(String(url))
  if (failNext) {
    failNext = false
    return new Response('{}', { status: 500 })
  }
  if (String(url).includes('ChIJ-gone'))
    return Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 })
  return Response.json(PLACE)
}
const resolve = async () => [{ address: '2606:4700:4700::1111', family: 6 }]
const adapter = () => createGooglePlacesAdapter({ googleKey: async () => KEY, fetch: fakeFetch, resolve })
const queue = (extra = {}) =>
  createVerifyQueue({
    pool: db.pool,
    adapters: [adapter()],
    ledger,
    verifyDailyCapCents: 100,
    now: () => clock,
    ...extra
  })

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await scratchDatabase()
  await migrate(db.pool)
  tokens = createHubTokens({ pool: db.pool })
  const quota = createHubQuota({ pool: db.pool, now: () => clock })
  contributions = createHubContributions({ pool: db.pool, quota, now: () => clock, pendingPlacesLimit: 100 })
  ledger = createCostLedger({
    pool: db.pool,
    caps: async () => ({ dailyCapCents: 10_000, jobCapCents: 10_000 }),
    now: () => clock
  })
})
after(async () => db?.close())
beforeEach(async () => {
  clock = Date.parse('2026-10-24T10:00:00Z')
  calls = []
  failNext = false
  if (db) {
    await db.pool.query('delete from wo_hub_contribution')
    await db.pool.query('delete from wo_cost_ledger')
  }
})

const newAccount = async () => {
  const p = (await db.pool.query(`insert into wo_principal (kind) values ('test') returning id`)).rows[0].id
  return (await tokens.issue(p)).accountId
}
const google = (id = 'ChIJ-cafe') => ({ family: 'google_maps', objectId: id })
const submit = async (accountId, observations, { key = 'k', subject = 'ChIJ-cafe' } = {}) =>
  (
    await contributions.submit({
      accountId,
      idempotencyKey: key,
      bytes: 1,
      body: {
        schema: 'wo-contribution/v1',
        subject: { identity: { namespace: 'google', externalId: subject } },
        observations
      }
    })
  ).receipt
const statuses = async (receipt) =>
  (await contributions.receipt(await owner(receipt.id), receipt.id)).observations.map((o) => [
    o.status,
    o.reason
  ])
const owner = async (id) =>
  (await db.pool.query('select account_id from wo_hub_contribution where id = $1', [id])).rows[0].account_id
const ledgerRows = async () =>
  (await db.pool.query(`select provider, operation, purpose, state from wo_cost_ledger`)).rows

test(
  'twenty accounts sending the same Google data make one evidence group and one paid read',
  opts,
  async () => {
    const receipts = []
    for (let i = 0; i < 20; i++) {
      const a = await newAccount()
      receipts.push(
        await submit(a, [{ field: 'website', value: 'https://www.cafe-aurora.example/', source: google() }], {
          key: `same-${i}`
        })
      )
    }
    const result = await queue().tick()
    assert.equal(result.fetched, 1)
    assert.equal(calls.length, 1)
    assert.deepEqual(await ledgerRows(), [
      { provider: 'google', operation: 'place-details', purpose: 'hub-verify', state: 'settled' }
    ])
    const groups = await db.pool.query(
      'select count(*)::int as rows, count(distinct fetch_id)::int as fetches, count(distinct source_group)::int as groups, min(source_group) as g from wo_hub_evidence'
    )
    assert.deepEqual(groups.rows[0], { rows: 20, fetches: 1, groups: 1, g: 'google_maps:ChIJ-cafe' })
    for (const r of receipts) assert.deepEqual(await statuses(r), [['accepted', null]])
    const decided = await contributions.receipt(await owner(receipts[0].id), receipts[0].id)
    assert.equal(decided.status, 'decided')
  }
)

test(
  'each field is judged against the record the hub read, not against a page the contributor points at',
  opts,
  async () => {
    const a = await newAccount()
    const r = await submit(a, [
      { field: 'website', value: 'http://cafe-aurora.example', source: google() },
      // A live page answering 200 proves nothing: Google names another website for this place.
      { field: 'website', value: 'https://cafe-aurora-deals.example/', source: google() },
      { field: 'phone', value: '+31 20-123-4567', source: google() },
      { field: 'phone', value: '+31 20 999 9999', source: google() },
      { field: 'name', value: 'CAFE  aurora', source: google() },
      { field: 'address', value: 'Main Street 1, 1011 AB Town', source: google() },
      { field: 'location', value: { latitude: 52.3701, longitude: 4.8901 }, source: google() },
      { field: 'location', value: { latitude: 52.4, longitude: 4.89 }, source: google() },
      { field: 'rating', value: { rating: 4.6, reviewCount: 212 }, source: google() },
      { field: 'rating', value: { rating: 3.1, reviewCount: 210 }, source: google() },
      { field: 'identity', value: { namespace: 'google', externalId: 'ChIJ-cafe' }, source: google() }
    ])
    await queue().tick()
    assert.equal(calls.length, 1)
    assert.deepEqual(await statuses(r), [
      ['accepted', null],
      ['rejected', 'differs_from_source'],
      ['accepted', null],
      ['rejected', 'differs_from_source'],
      ['accepted', null],
      ['accepted', null],
      ['accepted', null],
      ['rejected', 'differs_from_source'],
      ['accepted', null],
      ['rejected', 'differs_from_source'],
      ['accepted', null]
    ])
  }
)

test(
  'category is judged against the primary type and opening hours against the normalized weekly periods',
  opts,
  async () => {
    const a = await newAccount()
    const period = (d, h, m, d2, h2, m2) => ({
      open: { day: d, hour: h, minute: m },
      close: { day: d2, hour: h2, minute: m2 }
    })
    const r = await submit(a, [
      { field: 'category', value: 'Cafe', source: google() },
      { field: 'category', value: 'bar', source: google() },
      // Same week in another order: the same hours.
      {
        field: 'opening_hours',
        value: {
          periods: [period(5, 18, 0, 6, 2, 0), period(2, 8, 0, 2, 17, 30), period(1, 8, 0, 1, 17, 30)]
        },
        source: google()
      },
      {
        field: 'opening_hours',
        value: { periods: [period(1, 8, 0, 1, 17, 30), period(2, 8, 0, 2, 17, 30)] },
        source: google()
      },
      {
        field: 'opening_hours',
        value: {
          periods: [period(1, 9, 0, 1, 17, 30), period(2, 8, 0, 2, 17, 30), period(5, 18, 0, 6, 2, 0)]
        },
        source: google()
      },
      {
        field: 'opening_hours',
        value: { weekdayText: ['monday: 8:00 AM - 5:30 PM', 'Tuesday:  8:00 am \u2013 5:30 pm'] },
        source: google()
      },
      {
        field: 'opening_hours',
        value: { weekdayText: ['Monday: 9:00 AM - 5:30 PM', 'Tuesday: 8:00 AM - 5:30 PM'] },
        source: google()
      }
    ])
    await queue().tick()
    assert.equal(calls.length, 1)
    assert.deepEqual(await statuses(r), [
      ['accepted', null],
      ['rejected', 'differs_from_source'],
      ['accepted', null],
      ['rejected', 'differs_from_source'],
      ['rejected', 'differs_from_source'],
      ['accepted', null],
      ['rejected', 'differs_from_source']
    ])
  }
)

test(
  'email, social profiles and photo references stay unsupported: no Google field to check them against',
  opts,
  async () => {
    const a = await newAccount()
    const r = await submit(a, [
      {
        field: 'social_profile',
        value: { network: 'instagram', url: 'https://www.instagram.com/cafe.aurora' },
        source: google()
      },
      { field: 'photo_ref', value: { url: 'https://cafe-aurora.example/front.jpg' }, source: google() }
    ])
    await queue().tick()
    assert.deepEqual(await statuses(r), [
      ['rejected', 'unsupported_source'],
      ['rejected', 'unsupported_source']
    ])
    assert.equal(calls.length, 0)
  }
)

test('a place Google does not have rejects its observations as not in the source', opts, async () => {
  const a = await newAccount()
  const r = await submit(a, [{ field: 'name', value: 'Ghost', source: google('ChIJ-gone') }], {
    subject: 'ChIJ-gone'
  })
  await queue().tick()
  assert.deepEqual(await statuses(r), [['rejected', 'not_in_source']])
})

test(
  'an unsupported source family or field is rejected as unsupported_source without a paid read',
  opts,
  async () => {
    const a = await newAccount()
    const r = await submit(a, [
      { field: 'name', value: 'Cafe Aurora', source: { family: 'tripadvisor', objectId: 'd123' } },
      { field: 'email', value: 'hello@cafe-aurora.example', source: google() },
      { field: 'name', value: 'Cafe Aurora', source: google('ChIJ-elsewhere') }
    ])
    await queue().tick()
    assert.deepEqual(await statuses(r), [
      ['rejected', 'unsupported_source'],
      ['rejected', 'unsupported_source'],
      ['rejected', 'subject_mismatch']
    ])
    assert.equal(calls.length, 0)
    assert.deepEqual(await ledgerRows(), [])
  }
)

test(
  'without verification budget an observation waits as deferred_budget, and is decided once budget returns',
  opts,
  async () => {
    const a = await newAccount()
    const r = await submit(a, [{ field: 'name', value: 'Cafe Aurora', source: google() }])
    await queue({ verifyDailyCapCents: 0 }).tick()
    assert.deepEqual(await statuses(r), [['pending', 'deferred_budget']])
    assert.equal(calls.length, 0)
    assert.deepEqual(await ledgerRows(), [])
    await queue().tick()
    assert.deepEqual(await statuses(r), [['accepted', null]])
  }
)

test('the whole-ledger cap also defers: the ledger refusal is deferred_budget', opts, async () => {
  const a = await newAccount()
  const r = await submit(a, [{ field: 'name', value: 'Cafe Aurora', source: google() }])
  const broke = createCostLedger({
    pool: db.pool,
    caps: async () => ({ dailyCapCents: 0, jobCapCents: 0 }),
    now: () => clock
  })
  await queue({ ledger: broke }).tick()
  assert.deepEqual(await statuses(r), [['pending', 'deferred_budget']])
})

test('a retry after a timeout returns the same receipt and adds no cost', opts, async () => {
  const a = await newAccount()
  const obs = [{ field: 'name', value: 'Cafe Aurora', source: google() }]
  const first = await submit(a, obs, { key: 'timeout' })
  await queue().tick()
  const retry = await submit(a, obs, { key: 'timeout' })
  assert.equal(retry.id, first.id)
  await queue().tick()
  assert.equal(calls.length, 1)
  assert.equal((await ledgerRows()).length, 1)
})

test('a fresh read is reused; a stale one is read again', opts, async () => {
  const [a, b, c] = [await newAccount(), await newAccount(), await newAccount()]
  await submit(a, [{ field: 'name', value: 'Cafe Aurora', source: google() }])
  await queue().tick()
  clock += 60 * 60_000
  await submit(b, [{ field: 'name', value: 'Cafe Aurora', source: google() }])
  await queue().tick()
  assert.equal(calls.length, 1)
  clock += 2 * 24 * 60 * 60_000
  await submit(c, [{ field: 'name', value: 'Cafe Aurora', source: google() }])
  await queue().tick()
  assert.equal(calls.length, 2)
})

test('a withdrawn observation is never verified or charged', opts, async () => {
  const a = await newAccount()
  const r = await submit(a, [{ field: 'name', value: 'Cafe Aurora', source: google() }])
  await contributions.withdraw(a, r.id)
  await queue().tick()
  assert.equal(calls.length, 0)
  assert.deepEqual(await statuses(r), [['withdrawn', 'withdrawn_by_contributor']])
})

test(
  'a failed read leaves the observation pending (never "not there") and keeps the charge unreconciled',
  opts,
  async () => {
    const a = await newAccount()
    const r = await submit(a, [{ field: 'name', value: 'Cafe Aurora', source: google() }])
    failNext = true
    await queue().tick()
    assert.deepEqual(await statuses(r), [['pending', 'verify_failed']])
    assert.deepEqual(
      (await ledgerRows()).map((x) => x.state),
      ['unreconciled']
    )
  }
)

test('without a Google key nothing is charged and the observation waits', opts, async () => {
  const a = await newAccount()
  const r = await submit(a, [{ field: 'name', value: 'Cafe Aurora', source: google() }])
  const keyless = createGooglePlacesAdapter({ googleKey: async () => null, fetch: fakeFetch, resolve })
  await queue({ adapters: [keyless] }).tick()
  assert.deepEqual(await statuses(r), [['pending', 'verifier_unavailable']])
  assert.deepEqual(await ledgerRows(), [])
})
