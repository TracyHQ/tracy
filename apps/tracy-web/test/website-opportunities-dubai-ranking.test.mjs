// Scratch Postgres and synthetic Find caches; no discovery, crawler, or paid provider calls.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { fileDb } from './_db.mjs'
import { createDubaiPrefetch } from 'website-opportunities/src/dubai-prefetch.js'
import { claimPlaceJob, finishPlaceJob, placeLease } from 'website-opportunities/src/place-jobs.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'

const db = fileDb()
const opts = { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)
const NOW = Date.parse('2026-10-20T12:00:00Z')
const candidate = (id, extra = {}) => ({
  provider: 'google-places',
  providerId: id,
  name: `Synthetic restaurant ${id}`,
  kind: 'restaurants',
  distanceM: 100,
  lat: 25.198,
  lon: 55.275,
  rating: 4.5,
  reviews: 200,
  phone: '+971000000',
  socials: {},
  ...extra
})
async function setup(candidates, { siteChecks = null, socialStats = null } = {}) {
  const s = createDubaiPrefetch({
    pool: db.pool,
    role: 'central',
    now: () => NOW,
    siteChecks,
    socialStats,
    runtime: async () => ({ settings: normalizeWoOpsSettings({}) }),
    discover: async () => ({
      source: {
        id: 'google-places-text',
        revision: 'ranking-fixture-v1',
        fetchedAt: new Date(NOW).toISOString()
      },
      candidates
    })
  })
  await s.create()
  await s.setEnabled(true)
  return s
}
async function tick(s) {
  await db.pool.query("update wo_prefetch_campaign set next_tick_at=now() where id='dubai'")
  return s.tick()
}
async function ordered() {
  return (
    await db.pool.query(
      "select external_id,facts,job_id from wo_prefetch_seed where facts->>'selected'='true' order by (facts->>'rank')::int"
    )
  ).rows
}

test(
  'an enabled legacy Google campaign fails closed until its received Find selection is upgraded',
  opts,
  async () => {
    const s = await setup([candidate('legacy')])
    await db.pool.query(
      "update wo_prefetch_campaign set seed_source=seed_source-'rankingVersion',selection_candidates='[]'::jsonb where id='dubai'"
    )
    assert.deepEqual(await tick(s), { ran: false, reason: 'find_selection_required' })
    assert.equal((await s.status()).campaign.enabled, false)
    assert.equal((await db.pool.query('select count(*)::int as n from wo_place_job')).rows[0].n, 0)
    assert.equal((await tick(s)).ran, false)
    assert.equal((await s.setEnabled(true)).updated, true)
    assert.equal((await s.status()).campaign.seed_source.rankingVersion, 'find-v1')
    assert.ok((await tick(s)).jobId)
  }
)

test(
  'Find ranking retains website-less opportunities, hides known chains, applies closed penalty, and keeps tie order',
  opts,
  async () => {
    const checked = { status: 'done', performance: 95, https: true, mobileFriendly: true }
    const rows = [
      candidate('tie-z'),
      candidate('tie-a'),
      candidate('rich-site', { website: 'https://rich.example.test/' }),
      candidate('temporarily-closed', { temporarilyClosed: true }),
      candidate('known-chain', { name: 'KFC Dubai' }),
      candidate('tie-z')
    ]
    const s = await setup(rows, {
      siteChecks: {
        lookup: async () => ({ 'https://rich.example.test/': checked }),
        request: async () => ({})
      }
    })
    const seeds = await ordered()
    assert.deepEqual(
      seeds.map((r) => r.external_id),
      ['tie-z', 'tie-a', 'temporarily-closed', 'rich-site']
    )
    assert.equal(seeds[0].facts.website, null)
    assert.equal(seeds[0].facts.candidate.chainSuspect, false, 'Dedupe precedes chain detection')
    assert.ok(
      seeds[2].facts.opportunity.reasons.some(([key, points]) => key === 'closed.penalty' && points < 0)
    )
    const admitted = await tick(s)
    assert.equal(
      (await db.pool.query('select place_id from wo_place_job where id=$1', [admitted.jobId])).rows[0]
        .place_id,
      (await db.pool.query('select place_id from wo_prefetch_seed where external_id=$1', ['tie-z'])).rows[0]
        .place_id
    )
  }
)

test(
  'changed Find cache reprioritizes unadmitted places while preserving an existing job and snapshot',
  opts,
  async () => {
    const rows = ['a', 'b', 'c'].map((id) => candidate(id, { website: `https://${id}.example.test/` }))
    const checks = {
      'https://a.example.test/': { status: 'down' },
      'https://b.example.test/': { status: 'done', performance: 95 },
      'https://c.example.test/': { status: 'done', performance: 20 }
    }
    const s = await setup(rows, { siteChecks: { lookup: async () => checks, request: async () => ({}) } })
    assert.deepEqual(
      (await ordered()).map((r) => r.external_id),
      ['a', 'c', 'b']
    )
    const first = await tick(s)
    const job = await claimPlaceJob(db.pool, 'ranking-fixture', 60000, { kind: 'prefetch' })
    assert.equal(job.id, first.jobId)
    const snapshot = job.snapshot_id
    checks['https://a.example.test/'] = { status: 'done', performance: 95 }
    checks['https://b.example.test/'] = { status: 'down' }
    assert.equal((await tick(s)).waiting, true)
    assert.deepEqual(
      (await ordered()).map((r) => r.external_id),
      ['b', 'c', 'a']
    )
    assert.equal((await ordered()).find((r) => r.external_id === 'a').job_id, job.id)
    assert.equal(
      (await db.pool.query('select snapshot_id from wo_place_job where id=$1', [job.id])).rows[0].snapshot_id,
      snapshot
    )
    assert.equal(await finishPlaceJob(db.pool, placeLease(job), { state: 'completed' }), true)
    const next = await tick(s)
    assert.notEqual(next.jobId, first.jobId)
    const selected = (await ordered()).find((r) => r.job_id === next.jobId)
    assert.equal(selected.external_id, 'b')
    assert.equal(
      (await db.pool.query('select current_snapshot_id from wo_place where id=$1', [job.place_id])).rows[0]
        .current_snapshot_id,
      snapshot
    )
  }
)

test(
  'Find auto batches use 20 site and 10 social admissions; persisted terminal and deferred answers do not re-admit after ticks or Stop',
  opts,
  async () => {
    const rows = Array.from({ length: 60 }, (_, n) =>
      candidate(`batch-${n}`, {
        website: `https://batch-${n}.example.test/`,
        socials: n < 40 ? { instagram: `https://www.instagram.com/synthetic.batch.${n}/` } : {}
      })
    )
    const siteCalls = [],
      socialCalls = []
    const observations = {}
    const siteChecks = {
      lookup: async () => ({}),
      request: async (urls, options) => {
        siteCalls.push({ urls, options })
        return {}
      }
    }
    const socialStats = {
      lookup: async () => ({}),
      async request(handles, options) {
        socialCalls.push({ handles, options })
        for (const [i, { url }] of handles.entries()) {
          observations[url] ??=
            i === 0
              ? { status: 'queued' }
              : i === 2
                ? { status: 'complete', lastPostAt: '2026-10-19T00:00:00Z' }
                : i === 3
                  ? { status: 'queued', deferredUntil: '2026-10-21T00:00:00Z' }
                  : { status: 'not_queued' }
        }
        return Object.fromEntries(handles.map(({ url }) => [url, observations[url]]))
      }
    }
    const s = await setup(rows, { siteChecks, socialStats })
    assert.equal((await ordered()).length, 50)
    await tick(s)
    assert.equal(siteCalls[0].urls.length, 60)
    assert.equal(siteCalls[0].options.limit, 20)
    assert.equal(socialCalls[0].handles.length, 40)
    assert.equal(socialCalls[0].options.limit, 10)
    const campaign = (
      await db.pool.query("select selection_observations from wo_prefetch_campaign where id='dubai'")
    ).rows[0]
    assert.equal(Object.keys(campaign.selection_observations).length, 40)
    await tick(s)
    assert.deepEqual(
      socialCalls[1].handles,
      [socialCalls[0].handles[0]],
      'Only the queued, non-deferred page remains eligible to poll'
    )
    assert.deepEqual(await s.setEnabled(false), { updated: true })
    const counts = [siteCalls.length, socialCalls.length]
    for (let n = 0; n < 3; n++) assert.equal((await tick(s)).ran, false)
    assert.deepEqual([siteCalls.length, socialCalls.length], counts)
  }
)
