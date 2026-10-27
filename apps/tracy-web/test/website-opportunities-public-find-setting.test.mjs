// The public Find's daily cap (tasks/plan-wo-public-find.md §2.3): one WO ops setting, 100 by
// default, 0 closes the door; the /ops/settings/wo panel reads and saves it.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { normalizeWoOpsSettings, parseWoOpsSettingsInput } from 'website-opportunities/src/wo-settings.js'
import { woOpsRoutes } from '../src/ops/wo.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const DEFAULTS = {
  publicFindSearchesPerDay: 500,
  publicFindSearchesPerAddressHour: 60,
  publicFindSearchesPerAddressMinute: 10,
  publicFindSearchesPerMinute: 60,
  publicFindSuggestPerDay: 5000,
  publicFindSuggestPerAddressHour: 300,
  publicFindSuggestPerAddressMinute: 60,
  publicFindSuggestPerMinute: 60,
  placesCacheDays: 183,
  placesCacheCellMeters: 0,
  publicResearchNewPlacesPerAddressDay: 50,
  publicResearchNewPlacesPerDay: 1000,
  researchPublicDailyCapCents: 500,
  publicResearchAgainPerPlacePerDay: 1
}

test('the public Find limits have their defaults, and a stored value inside the range is kept', () => {
  const normal = normalizeWoOpsSettings({})
  for (const [key, value] of Object.entries(DEFAULTS)) assert.equal(normal[key], value, key)
  assert.equal(normalizeWoOpsSettings({ publicFindSearchesPerDay: 0 }).publicFindSearchesPerDay, 0)
  assert.equal(
    normalizeWoOpsSettings({ publicFindSearchesPerAddressHour: 1000 }).publicFindSearchesPerAddressHour,
    1000
  )
})

test('a wrong limit is refused, never replaced by the default; only the day caps take 0', () => {
  for (const key of Object.keys(DEFAULTS))
    for (const bad of [-1, 2.5, '50', 1_000_001, null]) {
      const parsed = parseWoOpsSettingsInput({ settings: { [key]: bad } })
      assert.equal(parsed.ok, false, `${key} refuses ${bad}`)
      assert.equal(parsed.error, 'INVALID_PUBLIC_FIND_LIMIT')
      assert.match(parsed.message, new RegExp(key))
    }
  for (const key of [
    'publicFindSearchesPerDay',
    'publicFindSuggestPerDay',
    'placesCacheDays',
    'placesCacheCellMeters',
    'researchPublicDailyCapCents'
  ])
    assert.equal(parseWoOpsSettingsInput({ settings: { [key]: 0 } }).ok, true, key)
  for (const key of Object.keys(DEFAULTS).filter(
    (k) => !k.endsWith('PerDay') && !k.startsWith('placesCache') && k !== 'researchPublicDailyCapCents'
  ))
    assert.equal(parseWoOpsSettingsInput({ settings: { [key]: 0 } }).ok, false, `${key} has no 0`)
})

test('the public research budget defaults to a quarter of the shared daily research cap', () => {
  assert.equal(normalizeWoOpsSettings({ researchDailyCapCents: 1000 }).researchPublicDailyCapCents, 250)
  assert.equal(
    normalizeWoOpsSettings({ researchDailyCapCents: 1000, researchPublicDailyCapCents: 0 })
      .researchPublicDailyCapCents,
    0
  )
  assert.equal(normalizeWoOpsSettings({ researchPublicDailyCapCents: 900 }).researchPublicDailyCapCents, 900)
})

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

test(
  'the /ops/settings/wo summary carries every public Find limit, and a save keeps the other keys',
  opts,
  async () => {
    const { pool } = db
    const config = { origin: 'https://cowork.tracy.test', sessionSecret: 's'.repeat(32) }
    const app = woOpsRoutes({ pool, config, log: { log() {} }, now: () => Date.now() })
    const staff = (await pool.query("insert into account (email) values ('ops@tracy.test') returning id"))
      .rows[0].id
    const ws = (
      await pool.query("insert into workspace(display_name,kind) values('Tracy','tracy_admin') returning id")
    ).rows[0].id
    await pool.query(
      "insert into seat_workspace(workspace_id,account_id,role,granted_by,accepted_at) values($1,$2,'owner',$2,now())",
      [ws, staff]
    )
    const cookie = `${SESSION_COOKIE}=${await mintSession('ops@tracy.test', config.sessionSecret)}`
    const read = async () => (await app.request('/api/ops/wo/demos/summary', { headers: { cookie } })).json()
    assert.deepEqual((await read()).publicFind, DEFAULTS)
    const saved = await app.request('/api/ops/wo/settings', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json', origin: config.origin },
      body: JSON.stringify({
        settings: { publicFindSearchesPerDay: 0, publicFindSuggestPerAddressHour: 900 }
      })
    })
    assert.equal(saved.status, 200)
    const after = await read()
    assert.deepEqual(after.publicFind, {
      ...DEFAULTS,
      publicFindSearchesPerDay: 0,
      publicFindSuggestPerAddressHour: 900
    })
    assert.equal(after.retention.demoTtlDays, 14)
  }
)
