// What Tracy pays for shared research (`website-opportunities/src/cost-ledger.js`, plan P2 of
// tasks/todo-wo-shared-research.md): every billable provider call is reserved against a
// deployment-wide daily cap and a per-job cap before it goes out, settled after, and a call that may
// have been billed (it threw, or its holder vanished) keeps counting as unreconciled.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  normalizeWoOpsSettings,
  parseWoOpsSettingsInput,
  DEFAULT_WO_OPS_SETTINGS
} from 'website-opportunities/src/wo-settings.js'
import { BudgetExceededError, createCostLedger, withCharge } from 'website-opportunities/src/cost-ledger.js'
import { newPlacesDaySpent } from 'website-opportunities/src/apify-budget.js'
import { apifyCeilingCents, ceilingCents, visionCostCents } from 'website-opportunities/src/cost-prices.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const JOB_A = '00000000-0000-4000-8000-00000000000a'
const JOB_B = '00000000-0000-4000-8000-00000000000b'
const PLACE_1 = '00000000-0000-4000-8000-000000000001'
const PLACE_2 = '00000000-0000-4000-8000-000000000002'
const MIN = 60_000

function ledgerOf({ daily = 100, job = 1000, at = '2026-10-19T12:00:00Z', staleAfterMs = 30 * MIN } = {}) {
  const clock = { now: Date.parse(at) }
  const ledger = createCostLedger({
    pool: db.pool,
    now: () => clock.now,
    caps: async () => ({ dailyCapCents: daily, jobCapCents: job }),
    staleAfterMs
  })
  return { ledger, clock }
}

const spec = (over = {}) => ({
  provider: 'apify',
  operation: 'apify~facebook-posts-scraper',
  maxCents: 7,
  placeId: PLACE_1,
  jobId: JOB_A,
  ...over
})

test('50 reserves at once of 7¢ against a 100¢ day: exactly 14 are admitted', opts, async () => {
  const { ledger } = ledgerOf({ daily: 100 })
  const answers = await Promise.all(
    Array.from({ length: 50 }, (_, i) => ledger.reserve(spec({ jobId: i % 2 ? JOB_A : JOB_B })))
  )
  const admitted = answers.filter((a) => a.ok)
  assert.equal(admitted.length, 14)
  for (const refused of answers.filter((a) => !a.ok)) {
    assert.equal(refused.code, 'BUDGET_EXCEEDED')
    assert.equal(refused.scope, 'day')
  }
  const sum = await ledger.summary({ day: '2026-10-19' })
  assert.equal(sum.reservedCents, 98)
  assert.equal(sum.spentCents, 0)
})

test('the job cap refuses one job and leaves another job its room', opts, async () => {
  const { ledger } = ledgerOf({ daily: 100, job: 20 })
  assert.equal((await ledger.reserve(spec())).ok, true)
  assert.equal((await ledger.reserve(spec())).ok, true)
  const third = await ledger.reserve(spec())
  assert.equal(third.ok, false)
  assert.equal(third.scope, 'job')
  assert.equal((await ledger.reserve(spec({ jobId: JOB_B }))).ok, true)
})

test('a settled call counts what it cost, a released one counts nothing', opts, async () => {
  const { ledger } = ledgerOf({ daily: 100 })
  const a = await ledger.reserve(spec({ maxCents: 50 }))
  const b = await ledger.reserve(spec({ maxCents: 50 }))
  assert.equal((await ledger.reserve(spec({ maxCents: 1 }))).ok, false, 'the day is full while both are held')
  assert.equal(await ledger.settle(a.reservation, 10, 'run-1'), true)
  assert.equal(await ledger.release(b.reservation), true)
  const sum = await ledger.summary({ day: '2026-10-19' })
  assert.deepEqual(
    { spent: sum.spentCents, reserved: sum.reservedCents, unreconciled: sum.unreconciledCents },
    { spent: 10, reserved: 0, unreconciled: 0 }
  )
  assert.equal((await ledger.reserve(spec({ maxCents: 90 }))).ok, true, '10 spent leaves 90')
  const { rows } = await db.pool.query(
    'select provider_run_id, actual_cents from wo_cost_ledger where id = $1',
    [a.reservation.id]
  )
  assert.deepEqual(rows[0], { provider_run_id: 'run-1', actual_cents: 10 })
  assert.equal(await ledger.settle(a.reservation, 3), false, 'a settled call is not settled twice')
  assert.equal(await ledger.release(a.reservation), false, 'a settled call is never released')
})

test('a reservation older than the stale age becomes unreconciled and keeps counting', opts, async () => {
  const { ledger, clock } = ledgerOf({ daily: 100, staleAfterMs: 30 * MIN })
  const held = await ledger.reserve(spec({ maxCents: 40 }))
  clock.now += 31 * MIN
  const sum = await ledger.summary({ day: '2026-10-19' })
  assert.equal(sum.unreconciledCents, 40)
  assert.equal(sum.reservedCents, 0)
  assert.equal((await ledger.reserve(spec({ maxCents: 61 }))).ok, false, 'the unreconciled 40 still counts')
  assert.equal(await ledger.release(held.reservation), false, 'an unreconciled call is never released')
  assert.equal(await ledger.settle(held.reservation, 12, 'late'), true, 'a late settle reconciles it')
  const after = await ledger.summary({ day: '2026-10-19' })
  assert.equal(after.unreconciledCents, 0)
  assert.equal(after.spentCents, 12)
})

test('a replayed reserve with the same request key returns the same reservation', opts, async () => {
  const { ledger } = ledgerOf({ daily: 10 })
  const first = await ledger.reserve(spec({ requestKey: 'job-a:facebook:0' }))
  const again = await ledger.reserve(spec({ requestKey: 'job-a:facebook:0' }))
  assert.equal(again.ok, true, 'a replay is answered even though 7 + 7 would pass the cap')
  assert.equal(again.reservation.id, first.reservation.id)
  assert.equal(again.reservation.replayed, true)
  const both = await Promise.all([
    ledger.reserve(spec({ maxCents: 1, requestKey: 'k2' })),
    ledger.reserve(spec({ maxCents: 1, requestKey: 'k2' }))
  ])
  assert.equal(both[0].reservation.id, both[1].reservation.id, 'concurrent replays meet on one row')
  assert.equal((await ledger.summary({ day: '2026-10-19' })).reservedCents, 8)
})

test('the day rolls over at midnight UTC', opts, async () => {
  const { ledger, clock } = ledgerOf({ daily: 10, at: '2026-10-19T23:59:00Z' })
  assert.equal((await ledger.reserve(spec({ maxCents: 10 }))).ok, true)
  assert.equal((await ledger.reserve(spec({ maxCents: 1 }))).ok, false)
  clock.now = Date.parse('2026-10-20T00:01:00Z')
  const next = await ledger.reserve(spec({ maxCents: 10 }))
  assert.equal(next.ok, true)
  assert.equal(next.reservation.budgetDay, '2026-10-20')
  assert.equal((await ledger.summary({ day: '2026-10-19' })).reservedCents, 10)
  assert.equal((await ledger.summary({ day: '2026-10-20' })).reservedCents, 10)
})

test('summary of one place counts only that place; the day total names the cap', opts, async () => {
  const { ledger } = ledgerOf({ daily: 100 })
  const a = await ledger.reserve(spec({ maxCents: 20 }))
  await ledger.reserve(spec({ maxCents: 5, placeId: PLACE_2 }))
  await ledger.settle(a.reservation, 15)
  const one = await ledger.summary({ day: '2026-10-19', placeId: PLACE_1 })
  assert.deepEqual(
    { spent: one.spentCents, reserved: one.reservedCents, unreconciled: one.unreconciledCents },
    { spent: 15, reserved: 0, unreconciled: 0 }
  )
  const all = await ledger.summary({ day: '2026-10-19' })
  assert.equal(all.totalCents, 20)
  assert.equal(all.capCents, 100)
})

test(
  'withCharge settles at what the call reports, or at its ceiling when it reports nothing',
  opts,
  async () => {
    const { ledger } = ledgerOf({ daily: 100 })
    const result = await withCharge(
      ledger,
      spec({ maxCents: 25, actualCents: (r) => r.cost, providerRunId: (r) => r.runId }),
      async () => ({ cost: 4, runId: 'apify-run-9' })
    )
    assert.deepEqual(result, { cost: 4, runId: 'apify-run-9' })
    await withCharge(ledger, spec({ maxCents: 25 }), async () => 'no cost known')
    const { rows } = await db.pool.query(
      'select state, actual_cents, provider_run_id from wo_cost_ledger order by actual_cents'
    )
    assert.deepEqual(rows, [
      { state: 'settled', actual_cents: 4, provider_run_id: 'apify-run-9' },
      { state: 'settled', actual_cents: 25, provider_run_id: null }
    ])
  }
)

test(
  'withCharge keeps a call that threw as unreconciled, unless it says it was never sent',
  opts,
  async () => {
    const { ledger } = ledgerOf({ daily: 100 })
    await assert.rejects(
      withCharge(ledger, spec({ maxCents: 30 }), async () => {
        throw Object.assign(new Error('timed out'), { code: 'TIMEOUT' })
      }),
      /timed out/
    )
    await assert.rejects(
      withCharge(ledger, spec({ maxCents: 30 }), async (charge) => {
        charge.notSent()
        throw new Error('no credential')
      }),
      /no credential/
    )
    const sum = await ledger.summary({ day: '2026-10-19' })
    assert.equal(sum.unreconciledCents, 30, 'the timeout may have been billed')
    assert.equal(sum.totalCents, 30, 'the call that never went out counts nothing')
  }
)

test('withCharge refuses over the cap without calling the provider', opts, async () => {
  const { ledger } = ledgerOf({ daily: 10 })
  let called = false
  await assert.rejects(
    withCharge(ledger, spec({ maxCents: 11 }), async () => {
      called = true
    }),
    (error) =>
      error instanceof BudgetExceededError && error.code === 'BUDGET_EXCEEDED' && error.scope === 'day'
  )
  assert.equal(called, false)
})

test('withCharge does not ride a replayed reservation that was already spent', opts, async () => {
  const { ledger } = ledgerOf({ daily: 100 })
  await withCharge(ledger, spec({ requestKey: 'job-a:1:facebook:0' }), async () => 'first')
  let called = false
  await assert.rejects(
    withCharge(ledger, spec({ requestKey: 'job-a:1:facebook:0' }), async () => {
      called = true
    }),
    (error) => error.code === 'CHARGE_SPENT'
  )
  assert.equal(called, false, 'a second provider call would go out uncounted')
})

test('new places: an account is limited per day, another account is not', opts, async () => {
  const day = Date.parse('2026-10-19T08:00:00Z')
  const a = '00000000-0000-4000-8000-0000000000aa'
  const b = '00000000-0000-4000-8000-0000000000bb'
  assert.equal(await newPlacesDaySpent(woHost, db.pool, a, day, 2), false)
  assert.equal(await newPlacesDaySpent(woHost, db.pool, a, day, 2), false)
  assert.equal(await newPlacesDaySpent(woHost, db.pool, a, day, 2), true)
  assert.equal(await newPlacesDaySpent(woHost, db.pool, b, day, 2), false)
  assert.equal(
    await newPlacesDaySpent(woHost, db.pool, a, day + 86_400_000, 2),
    false,
    'the next day starts again'
  )
})

test('a reserve with no ceiling or no provider is a programming error, not a free call', opts, async () => {
  const { ledger } = ledgerOf()
  await assert.rejects(ledger.reserve(spec({ maxCents: undefined })), /maxCents/)
  await assert.rejects(ledger.reserve(spec({ provider: '' })), /provider/)
})

test('price table: an Apify run reserves the larger of its per-item bound and the run charge cap', () => {
  // 20 Facebook posts at the measured 0.5¢ each + the start fee stay under a 25¢ cap: the cap is held.
  assert.equal(apifyCeilingCents('apify~facebook-posts-scraper', { items: 20, maxChargeUsd: 0.25 }), 25)
  // A deep page (offset 180 + 20) passes the cap: the per-item bound is held.
  assert.ok(apifyCeilingCents('apify~facebook-posts-scraper', { items: 200, maxChargeUsd: 0.25 }) >= 100)
  // An actor the table does not know is held at the dearest known rate, never at zero.
  assert.ok(apifyCeilingCents('someone~new-actor', { items: 20, maxChargeUsd: 0 }) > 0)
  assert.ok(ceilingCents('google', 'place-details') >= 3)
  assert.ok(ceilingCents('google', 'place-photo') >= 1)
  assert.throws(() => ceilingCents('google', 'made-up'), /no price/)
})

test('price table: a ScrapeCreators profile reserves one cent per credit call it makes', () => {
  // Facebook and TikTok read the page and its posts (two calls); Instagram's profile carries its posts.
  assert.equal(ceilingCents('scrapecreators', 'facebook-profile'), 2)
  assert.equal(ceilingCents('scrapecreators', 'instagram-profile'), 1)
  assert.equal(ceilingCents('scrapecreators', 'tiktok-profile'), 2)
})

test('price table: the vision call costs what its tokens say, rounded up to a whole cent', () => {
  assert.equal(visionCostCents('deepseek-chat', { promptTokens: 0, completionTokens: 0 }), 0)
  assert.equal(visionCostCents('deepseek-chat', { promptTokens: 1000, completionTokens: 10 }), 1)
  assert.ok(
    visionCostCents('deepseek-chat', { promptTokens: 10_000_000, completionTokens: 0 }) >
      visionCostCents('deepseek-chat', { promptTokens: 1_000_000, completionTokens: 0 })
  )
})

test('settings: research caps and the new-places limit are kept when valid, defaulted when not', () => {
  const kept = normalizeWoOpsSettings({
    researchDailyCapCents: 5000,
    researchJobCapCents: 300,
    newPlacesPerAccountPerDay: 12
  })
  assert.deepEqual(
    [kept.researchDailyCapCents, kept.researchJobCapCents, kept.newPlacesPerAccountPerDay],
    [5000, 300, 12]
  )
  const defaulted = normalizeWoOpsSettings({ researchDailyCapCents: -1, researchJobCapCents: 'x' })
  assert.equal(defaulted.researchDailyCapCents, DEFAULT_WO_OPS_SETTINGS.researchDailyCapCents)
  assert.equal(defaulted.researchJobCapCents, DEFAULT_WO_OPS_SETTINGS.researchJobCapCents)
  assert.ok(DEFAULT_WO_OPS_SETTINGS.researchJobCapCents <= DEFAULT_WO_OPS_SETTINGS.researchDailyCapCents)
  // A cap of 0 is a valid choice: research that costs anything stops.
  assert.equal(normalizeWoOpsSettings({ researchDailyCapCents: 0 }).researchDailyCapCents, 0)
})

test('settings: a cap that is not a whole number of cents in range is refused, not silently defaulted', () => {
  for (const bad of [-5, 1.5, 'lots', 100_000_001]) {
    const answer = parseWoOpsSettingsInput({ settings: { researchDailyCapCents: bad } })
    assert.equal(answer.ok, false, `refuses ${bad}`)
    assert.equal(answer.error, 'INVALID_RESEARCH_CAP')
  }
  const ok = parseWoOpsSettingsInput({ settings: { researchJobCapCents: 250 } })
  assert.equal(ok.ok, true)
  assert.equal(ok.settings.researchJobCapCents, 250)
})
