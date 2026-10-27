// `/ops/wo` › Settings › Provider order: real numbers per provider per capability group, and a bold
// "misordered" mark the operator acts on by hand (Lee, 23/10/2026). Nothing here re-orders anything.
//   - under PROVIDER_REPORT.minCalls (30) calls in its group a provider shows no number;
//   - X placed ahead of Y is misordered when X costs more than 1.5× Y per usable result, compared only
//     when both costs were reported by the provider; otherwise when X's usable rate < Y's / 1.5.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { woCapabilities } from '../src/lib/wo-ops.js'
import { readWoOpsSettings, saveWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import {
  capabilityOfCharge,
  PROVIDER_REPORT,
  providerReport,
  readProviderUsage
} from 'website-opportunities/src/provider-report.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const NOW = Date.parse('2026-10-23T12:00:00Z')
const HOUR = 3_600_000
const LABELS = { scrapecreators: 'ScrapeCreators', apify: 'Apify', 'rapidapi-scraper3': 'Scraper3' }

/** One provider's tally as `readProviderUsage` gives it. */
const tally = (calls, usable, { cents = 0, charges = 0, reported = false } = {}) => ({
  calls,
  usable,
  charges,
  chargedCents: cents,
  reported
})

test('the thresholds are the ones Lee set', () => {
  // test-quality: contract Lee set 30 calls and a 1.5 margin on 23/10/2026; changing them is his decision
  assert.equal(PROVIDER_REPORT.minCalls, 30)
  // test-quality: contract the 1.5 margin is Lee's 23/10/2026 decision too
  assert.equal(PROVIDER_REPORT.misorderRatio, 1.5)
})

test('under 30 calls a provider shows no number at all', () => {
  const report = providerReport(['apify', 'scrapecreators'], {
    apify: tally(29, 29, { cents: 290, charges: 29, reported: true }),
    scrapecreators: tally(40, 40, { cents: 40, charges: 40, reported: true })
  })
  assert.deepEqual(report.apify, { enough: false, calls: 29 })
  assert.equal(report.scrapecreators.enough, true)
  assert.equal(
    report.scrapecreators.misordered,
    undefined,
    'nothing is compared with a provider short of data'
  )
})

test('a provider never asked is reported as 0 calls, not enough data', () => {
  const report = providerReport(['apify'], {})
  assert.deepEqual(report.apify, { enough: false, calls: 0 })
})

test('numbers: calls, usable rate, cost per call and per usable result', () => {
  const report = providerReport(['scrapecreators'], {
    scrapecreators: tally(40, 30, { cents: 80, charges: 40, reported: true })
  })
  assert.deepEqual(report.scrapecreators, {
    enough: true,
    calls: 40,
    usable: 30,
    usableRate: 0.75,
    cost: { kind: 'real', perCallCents: 2, perUsableCents: 2 / 0.75 }
  })
})

test('real costs: 1.6× dearer per usable result is misordered, 1.4× is not, exactly 1.5× is not', () => {
  const at = (apifyCents) =>
    providerReport(
      ['apify', 'scrapecreators'],
      {
        apify: tally(40, 40, { cents: apifyCents * 40, charges: 40, reported: true }),
        scrapecreators: tally(40, 40, { cents: 10 * 40, charges: 40, reported: true })
      },
      { labels: LABELS }
    )
  assert.deepEqual(at(16).apify.misordered, { basis: 'cost', than: 'scrapecreators', times: 1.6 })
  assert.equal(at(14).apify.misordered, undefined)
  assert.equal(at(15).apify.misordered, undefined)
  // The one placed after is never the misordered one.
  assert.equal(at(16).scrapecreators.misordered, undefined)
})

test('a ceiling is never called cheaper or dearer: equal usable rates give no mark at any price', () => {
  for (const [apify, sc] of [
    [
      { cents: 50 * 40, reported: false },
      { cents: 10 * 40, reported: true }
    ],
    [
      { cents: 50 * 40, reported: true },
      { cents: 1 * 40, reported: false }
    ]
  ]) {
    const report = providerReport(['apify', 'scrapecreators'], {
      apify: tally(40, 40, { ...apify, charges: 40 }),
      scrapecreators: tally(40, 40, { ...sc, charges: 40 })
    })
    assert.equal(report.apify.misordered, undefined)
  }
  const ceiling = providerReport(['apify'], { apify: tally(40, 40, { cents: 2000, charges: 40 }) })
  assert.equal(ceiling.apify.cost.kind, 'ceiling')
})

test('rate fallback: with a ceiling, a usable rate under the next one ÷ 1.5 is misordered', () => {
  const report = providerReport(['apify', 'scrapecreators'], {
    apify: tally(40, 10, { cents: 400, charges: 40 }),
    scrapecreators: tally(40, 40, { cents: 40, charges: 40, reported: true })
  })
  assert.deepEqual(report.apify.misordered, { basis: 'rate', than: 'scrapecreators', times: 4 })
  const close = providerReport(['apify', 'scrapecreators'], {
    apify: tally(40, 28, { cents: 400, charges: 40 }),
    scrapecreators: tally(40, 40, { cents: 40, charges: 40, reported: true })
  })
  assert.equal(close.apify.misordered, undefined, '70% against 100% is within 1.5×')
})

test('a provider with no recorded cost is compared by usable rate too', () => {
  const report = providerReport(['rapidapi-scraper3', 'scrapecreators'], {
    'rapidapi-scraper3': tally(40, 0),
    scrapecreators: tally(40, 20, { cents: 40, charges: 40, reported: true })
  })
  assert.equal(report['rapidapi-scraper3'].cost.kind, 'none')
  assert.deepEqual(report['rapidapi-scraper3'].misordered, {
    basis: 'rate',
    than: 'scrapecreators',
    times: null
  })
})

test('the strongest reason wins when several later providers beat it', () => {
  const report = providerReport(['apify', 'rapidapi-scraper3', 'scrapecreators'], {
    apify: tally(40, 40, { cents: 30 * 40, charges: 40, reported: true }),
    'rapidapi-scraper3': tally(40, 40, { cents: 15 * 40, charges: 40, reported: true }),
    scrapecreators: tally(40, 40, { cents: 10 * 40, charges: 40, reported: true })
  })
  assert.deepEqual(report.apify.misordered, { basis: 'cost', than: 'scrapecreators', times: 3 })
  assert.equal(report['rapidapi-scraper3'].misordered, undefined, 'exactly 1.5× is not more than 1.5×')
})

test('a provider left out of the order shows its numbers and is never marked', () => {
  const report = providerReport(['scrapecreators'], {
    scrapecreators: tally(40, 40, { cents: 40, charges: 40, reported: true }),
    apify: tally(40, 5, { cents: 4000, charges: 40, reported: true })
  })
  assert.equal(report.apify.enough, true)
  assert.equal(report.apify.misordered, undefined)
})

test('a ledger row names its capability group and provider', () => {
  assert.deepEqual(capabilityOfCharge('scrapecreators', 'facebook-profile'), {
    group: 'facebook',
    provider: 'scrapecreators'
  })
  assert.deepEqual(capabilityOfCharge('apify', 'apify~instagram-scraper'), {
    group: 'instagram',
    provider: 'apify'
  })
  assert.deepEqual(capabilityOfCharge('serpapi', 'tripadvisor-reviews'), {
    group: 'tripadvisor',
    provider: 'serpapi'
  })
  assert.deepEqual(capabilityOfCharge('jina', 'read'), { group: 'website-content', provider: 'jina' })
  // Social stats runs and a search two groups share are not attributed to a single group.
  assert.equal(capabilityOfCharge('apify', 'social-stats:apify~instagram-scraper'), null)
  assert.equal(capabilityOfCharge('scrapecreators', 'google-search'), null)
  assert.equal(capabilityOfCharge('google', 'place-details'), null)
})

// ── the database ──────────────────────────────────────────────────────────────────────────────

/** `count` snapshot sources of `group` researched `hoursAgo`, each with these attempts. */
async function seedAttempts(group, count, attempts, { hoursAgo = 2 } = {}) {
  const { pool } = db
  const place = (await pool.query(`insert into wo_place (display_name) values ('Seed') returning id`)).rows[0]
    .id
  await pool.query(
    `with s as (insert into wo_place_snapshot (place_id) select $1 from generate_series(1, $2) returning id)
     insert into wo_place_snapshot_source (snapshot_id, source, status, coverage, attempted_at, collected_at)
     select id, $3, 'complete', $4::jsonb, $5, $5 from s`,
    [place, count, group, JSON.stringify({ fetched: 1, attempts }), new Date(NOW - hoursAgo * HOUR)]
  )
}

/** `count` ledger rows; `actual` = what the provider reported (null = settled at the ceiling). */
async function seedCharges(provider, operation, count, { reserved, actual = null, hoursAgo = 2 }) {
  const ledger = createCostLedger({
    pool: db.pool,
    now: () => NOW - hoursAgo * HOUR,
    caps: async () => ({ dailyCapCents: 10_000_000, jobCapCents: 10_000_000 })
  })
  for (let i = 0; i < count; i++) {
    const r = await ledger.reserve({ provider, operation, maxCents: reserved })
    await ledger.settle(r.reservation, actual)
  }
}

test('settle records whether the provider reported the cost', opts, async () => {
  await seedCharges('apify', 'apify~facebook-posts-scraper', 1, { reserved: 20, actual: 7 })
  await seedCharges('apify', 'apify~facebook-posts-scraper', 1, { reserved: 20 })
  const { rows } = await db.pool.query(
    'select actual_cents, cost_reported from wo_cost_ledger order by cost_reported desc'
  )
  assert.deepEqual(rows, [
    { actual_cents: 7, cost_reported: true },
    { actual_cents: 20, cost_reported: false }
  ])
})

test(
  'usage: a call is an attempt that went out; usable = complete; a missing key is no call',
  opts,
  async () => {
    await seedAttempts('facebook', 3, [
      { provider: 'rapidapi-scraper3', status: 'skipped', reason: 'credential_missing' },
      { provider: 'apify', status: 'skipped', reason: 'quota' },
      { provider: 'scrapecreators', status: 'complete' }
    ])
    await seedAttempts('facebook', 2, [{ provider: 'scrapecreators', status: 'partial' }])
    await seedAttempts('facebook', 1, [{ provider: 'scrapecreators', status: 'not_found' }])
    // Older than the window: not counted.
    await seedAttempts('facebook', 4, [{ provider: 'scrapecreators', status: 'complete' }], {
      hoursAgo: (PROVIDER_REPORT.windowDays + 1) * 24
    })
    await seedCharges('scrapecreators', 'facebook-profile', 3, { reserved: 2 })
    await seedCharges('apify', 'apify~facebook-posts-scraper', 2, { reserved: 20, actual: 5 })
    await seedCharges('apify', 'social-stats:apify~facebook-posts-scraper', 2, { reserved: 20, actual: 5 })
    const usage = await readProviderUsage(db.pool, { now: () => NOW })
    assert.deepEqual(usage.facebook.scrapecreators, {
      calls: 6,
      usable: 3,
      charges: 3,
      chargedCents: 6,
      reported: false
    })
    assert.deepEqual(usage.facebook.apify, {
      calls: 3,
      usable: 0,
      charges: 2,
      chargedCents: 10,
      reported: true
    })
    assert.equal(usage.facebook['rapidapi-scraper3'], undefined)
  }
)

test(
  'the screen: a misordered provider carries its mark; below 30 calls none; the order is untouched',
  opts,
  async () => {
    await saveWoOpsSettings(db.pool, { providerOrder: { facebook: ['apify', 'scrapecreators'] } }, 'lee@test')
    const before = await db.pool.query('select settings, updated_at from wo_ops_setting')
    await seedAttempts('facebook', 40, [
      { provider: 'apify', status: 'not_found' },
      { provider: 'scrapecreators', status: 'complete' }
    ])
    await seedAttempts('instagram', 12, [{ provider: 'scrapecreators', status: 'complete' }])
    await seedCharges('scrapecreators', 'facebook-profile', 4, { reserved: 2 })
    const groups = await woCapabilities(db.pool, {}, { now: () => NOW })
    const facebook = groups.find((g) => g.id === 'facebook')
    const apify = facebook.providers.find((p) => p.id === 'apify')
    assert.deepEqual(apify.report.misordered, { basis: 'rate', than: 'scrapecreators', times: null })
    assert.equal(facebook.providers.find((p) => p.id === 'scrapecreators').report.cost.kind, 'ceiling')
    const instagram = groups.find((g) => g.id === 'instagram')
    assert.deepEqual(instagram.providers.find((p) => p.id === 'scrapecreators').report, {
      enough: false,
      calls: 12
    })
    assert.equal(facebook.reportMinCalls, PROVIDER_REPORT.minCalls)
    // Nothing re-ordered: the stored order and its row are exactly as saved.
    assert.deepEqual(facebook.order, ['apify', 'scrapecreators'])
    const after = await db.pool.query('select settings, updated_at from wo_ops_setting')
    assert.deepEqual(after.rows, before.rows)
    assert.deepEqual((await readWoOpsSettings(db.pool)).settings.providerOrder, {
      facebook: ['apify', 'scrapecreators']
    })
  }
)

test('a later provider whose reported cost is nothing beats any paid one placed ahead of it', () => {
  const report = providerReport(['apify', 'scrapecreators'], {
    apify: tally(40, 40, { cents: 40, charges: 40, reported: true }),
    scrapecreators: tally(40, 40, { cents: 0, charges: 40, reported: true })
  })
  assert.deepEqual(report.apify.misordered, { basis: 'cost', than: 'scrapecreators', times: null })
  const bothFree = providerReport(['apify', 'scrapecreators'], {
    apify: tally(40, 40, { cents: 0, charges: 40, reported: true }),
    scrapecreators: tally(40, 40, { cents: 0, charges: 40, reported: true })
  })
  assert.equal(bothFree.apify.misordered, undefined)
})
