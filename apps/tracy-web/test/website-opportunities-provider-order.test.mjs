// `/ops/wo` › Settings › Provider order (tasks/plan-wo-public-research.md, shared contract §2): one
// `providerOrder` setting, one resolver every research step reads, and each provider's state for the
// screen (connected / missing key / limit reached today / last error).
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { woProviderStates, woRuntime } from '../src/lib/wo-ops.js'
import {
  parseWoOpsSettingsInput,
  providerOrderFor,
  readWoOpsSettings,
  resolveProviderOrder,
  saveWoOpsSettings
} from 'website-opportunities/src/wo-settings.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const NOW = Date.parse('2026-10-23T12:00:00Z')

test('an order that names an unknown group or provider is refused, never replaced by a default', () => {
  for (const providerOrder of [
    { facebook: ['looter2'] },
    { myspace: ['apify'] },
    { facebook: 'apify' },
    { facebook: ['apify', 'apify'] },
    []
  ]) {
    const parsed = parseWoOpsSettingsInput({ providerOrder })
    assert.equal(parsed.ok, false, JSON.stringify(providerOrder))
    assert.equal(parsed.error, 'INVALID_PROVIDER_ORDER')
    assert.match(parsed.message, /providerOrder/)
  }
  const ok = parseWoOpsSettingsInput({ providerOrder: { facebook: ['apify', 'scrapecreators'], tiktok: [] } })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.settings.providerOrder, { facebook: ['apify', 'scrapecreators'], tiktok: [] })
})

test('the resolver: undeclared = the old runtime order, [] = off, a list = exactly that list', () => {
  const settings = parseWoOpsSettingsInput({
    mapDiscoveryProvider: 'apify',
    providerOrder: { instagram: ['apify'], tiktok: [] }
  }).settings
  assert.deepEqual(resolveProviderOrder(settings, 'facebook'), {
    order: ['scrapecreators', 'rapidapi-scraper3', 'apify'],
    declared: false
  })
  assert.deepEqual(resolveProviderOrder(settings, 'instagram'), { order: ['apify'], declared: true })
  assert.deepEqual(resolveProviderOrder(settings, 'tiktok'), { order: [], declared: true })
  // The legacy map setting still decides map discovery until that group is declared.
  assert.deepEqual(resolveProviderOrder(settings, 'map-discovery'), {
    order: ['apify', 'osm'],
    declared: false
  })
  const all = providerOrderFor(settings)
  assert.deepEqual(all.instagram, ['apify'])
  assert.deepEqual(all['map-discovery'], ['apify', 'osm'])
})

test('the order is saved and read back; a save of other keys keeps it', opts, async () => {
  const { pool } = db
  const parsed = parseWoOpsSettingsInput({ providerOrder: { facebook: ['apify', 'scrapecreators'] } })
  await saveWoOpsSettings(pool, parsed.settings, 'ceo@tracy.ai')
  assert.deepEqual((await readWoOpsSettings(pool)).settings.providerOrder, {
    facebook: ['apify', 'scrapecreators']
  })
  const runtime = await woRuntime(pool, { sessionSecret: 'x'.repeat(32) })
  assert.deepEqual(resolveProviderOrder(runtime.settings, 'facebook').order, ['apify', 'scrapecreators'])

  const { settings: saved } = await readWoOpsSettings(pool)
  await saveWoOpsSettings(pool, { ...saved, defaultRadiusM: 3000 }, 'ceo@tracy.ai')
  assert.deepEqual((await readWoOpsSettings(pool)).settings.providerOrder, {
    facebook: ['apify', 'scrapecreators']
  })
})

test('a stored group that no longer validates is dropped on read; the others stay', opts, async () => {
  const { pool } = db
  await pool.query(
    `insert into wo_ops_setting (id, settings, updated_by, updated_at) values (true, $1::jsonb, 'x', now())`,
    [JSON.stringify({ providerOrder: { facebook: ['apify'], instagram: ['gone-provider'] } })]
  )
  assert.deepEqual((await readWoOpsSettings(pool)).settings.providerOrder, { facebook: ['apify'] })
})

test('provider states: connected, missing key, limit reached today, last error', opts, async () => {
  const { pool } = db
  const settings = parseWoOpsSettingsInput({}).settings
  // Instagram ScrapeCreators spent its 10 calls today; Facebook ScrapeCreators did not.
  const day = new Date(Math.floor(NOW / 86_400_000) * 86_400_000)
  await pool.query(`insert into rate_bucket (bucket, window_start, count) values ($1, $2, 10), ($3, $2, 2)`, [
    'wo:social-budget:instagram-scrapecreators',
    day,
    'wo:social-budget:facebook-scrapecreators'
  ])
  // A research two hours ago: Apify refused its token on Facebook, ScrapeCreators answered.
  const place = (await pool.query(`insert into wo_place (display_name) values ('Sundrift') returning id`))
    .rows[0].id
  const snap = (
    await pool.query(`insert into wo_place_snapshot (place_id) values ($1) returning id`, [place])
  ).rows[0].id
  const attempts = [
    { provider: 'apify', status: 'skipped', reason: 'credential_invalid' },
    { provider: 'scrapecreators', status: 'complete' }
  ]
  await pool.query(
    `insert into wo_place_snapshot_source (snapshot_id, source, status, coverage, attempted_at)
     values ($1, 'facebook', 'complete', $2::jsonb, $3)`,
    [snap, JSON.stringify({ fetched: 2, attempts }), new Date(NOW - 2 * 3_600_000)]
  )
  const keys = { scrapecreators: 'SC', apify: 'A', rapidapi: null, google: null }
  const states = await woProviderStates(pool, { keys, settings, now: () => NOW })
  assert.equal(states.facebook.scrapecreators.state, 'connected')
  assert.equal(states.facebook['rapidapi-scraper3'].state, 'missing_key')
  assert.equal(states.instagram.scrapecreators.state, 'limit_reached')
  assert.equal(states.facebook.apify.state, 'error')
  assert.deepEqual(states.facebook.apify.lastError, {
    reason: 'credential_invalid',
    at: new Date(NOW - 2 * 3_600_000).toISOString()
  })
  // A provider that needs no key is connected; so is the scrapecreators tier that answered after the error.
  assert.equal(states['map-discovery'].osm.state, 'connected')
  assert.equal(states.facebook.scrapecreators.lastError, undefined)
})

test('a later success clears the last error', opts, async () => {
  const { pool } = db
  const settings = parseWoOpsSettingsInput({}).settings
  const place = (await pool.query(`insert into wo_place (display_name) values ('A') returning id`)).rows[0].id
  for (const [hoursAgo, status, reason] of [
    [5, 'skipped', 'quota'],
    [1, 'complete', null]
  ]) {
    const snap = (
      await pool.query(`insert into wo_place_snapshot (place_id) values ($1) returning id`, [place])
    ).rows[0].id
    await pool.query(
      `insert into wo_place_snapshot_source (snapshot_id, source, status, coverage, attempted_at)
       values ($1, 'instagram', 'complete', $2::jsonb, $3)`,
      [
        snap,
        JSON.stringify({ attempts: [{ provider: 'scrapecreators', status, ...(reason ? { reason } : {}) }] }),
        new Date(NOW - hoursAgo * 3_600_000)
      ]
    )
  }
  const states = await woProviderStates(pool, { keys: { scrapecreators: 'SC' }, settings, now: () => NOW })
  assert.equal(states.instagram.scrapecreators.state, 'connected')
})
