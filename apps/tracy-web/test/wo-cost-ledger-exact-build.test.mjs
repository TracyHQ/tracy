// The ledger records what a call cost to the thousandth of a cent, and a build's charges count against their own day
// cap (#296, 02/11/2026). A build's look makes hundreds of ~0.12 ¢ vision calls that each booked 1 ¢, and every build
// charge spent the research day cap, so a few builds stopped research.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { capsFromRuntime, createCostLedger, withCharge } from 'website-opportunities/src/cost-ledger.js'
import { visionCostCents, visionCostExactCents } from 'website-opportunities/src/cost-prices.js'
import { normalizeWoOpsSettings, parseWoOpsSettingsInput } from 'website-opportunities/src/wo-settings.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const AT = Date.parse('2026-11-02T12:00:00Z')
const LOOK_CALL = { promptTokens: 1_900, completionTokens: 40 }

const ledgerOf = ({ budget = 'research', daily = 100 } = {}) =>
  createCostLedger({
    pool: db.pool,
    now: () => AT,
    budget,
    caps: async () => ({ dailyCapCents: daily, jobCapCents: daily })
  })

const lookCall = (ledger) =>
  withCharge(
    ledger,
    {
      provider: 'vision',
      operation: 'deepseek-chat',
      maxCents: 1,
      actualCents: (r) => visionCostExactCents('deepseek-chat', r),
      purpose: 'demo-look'
    },
    async () => LOOK_CALL
  )

test('a vision call costs its tokens, unrounded; its ceiling stays a whole cent', () => {
  const exact = visionCostExactCents('deepseek-chat', LOOK_CALL)
  assert.ok(Math.abs(exact - 0.124) < 1e-9, String(exact))
  assert.equal(visionCostCents('deepseek-chat', LOOK_CALL), 1)
})

test(
  'a settled call keeps its cost to the thousandth; a thousand of them sum to their cost, not to $10',
  opts,
  async () => {
    const ledger = ledgerOf({ daily: 100_000 })
    await lookCall(ledger)
    const row = (await db.pool.query('select actual_cents, actual_millicents from wo_cost_ledger')).rows[0]
    assert.deepEqual(row, { actual_cents: 1, actual_millicents: '124' })
    for (let i = 1; i < 1000; i++) await lookCall(ledger)
    const day = await ledger.summary({ day: '2026-11-02' })
    assert.equal(day.spentCents, 124, 'rounded up once, for the sum')
    assert.equal(day.calls, 1000)
  }
)

test('the day cap counts what calls cost: 1 000 look calls fit a 200 ¢ day', opts, async () => {
  const ledger = ledgerOf({ daily: 200 })
  for (let i = 0; i < 1000; i++) await lookCall(ledger)
  const answer = await ledger.reserve({ provider: 'vision', operation: 'deepseek-chat', maxCents: 70 })
  assert.equal(answer.ok, true, JSON.stringify(answer))
})

test('a build charge never spends the research day, nor research the build day', opts, async () => {
  const build = ledgerOf({ budget: 'build', daily: 10 })
  const research = ledgerOf({ budget: 'research', daily: 10 })
  const spend = (ledger) => ledger.reserve({ provider: 'vision', operation: 'deepseek-chat', maxCents: 10 })
  assert.equal((await spend(build)).ok, true)
  assert.equal((await spend(build)).ok, false, 'the build day is spent')
  assert.equal((await spend(research)).ok, true, 'research still has its whole day')
  assert.equal((await spend(research)).ok, false)
  const budgets = (
    await db.pool.query('select budget, count(*)::int as n from wo_cost_ledger group by 1 order by 1')
  ).rows
  assert.deepEqual(budgets, [
    { budget: 'build', n: 1 },
    { budget: 'research', n: 1 }
  ])
  assert.equal((await build.summary({ day: '2026-11-02' })).totalCents, 10)
})

test('the build reads its own day cap from /ops/wo', async () => {
  const settings = normalizeWoOpsSettings({ researchDailyCapCents: 500, buildDailyCapCents: 3000 })
  const runtime = async () => ({ settings })
  assert.deepEqual(await capsFromRuntime(runtime, 'build')(), { dailyCapCents: 3000, jobCapCents: 3000 })
  assert.deepEqual(await capsFromRuntime(runtime)(), {
    dailyCapCents: 500,
    jobCapCents: settings.researchJobCapCents
  })
  assert.equal(parseWoOpsSettingsInput({ buildDailyCapCents: -1 }).ok, false)
  assert.throws(() => createCostLedger({ pool: {}, caps: async () => ({}), budget: 'other' }), /budget/)
})
