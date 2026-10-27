import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { qualityBudgetSlots, createQualityHeadroom } from '../src/opportunities-build/quality-budget.js'
import { acceptQualityIntent } from '../src/opportunities-build/quality-intents.js'
import { qualityRunStore, runQualityAttempt } from '../src/opportunities-build/quality-runs.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' },
  db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const models = Object.fromEntries(
  ['facts', 'observations', 'plan', 'review'].map((role) => [
    role,
    {
      providerId: 'synthetic',
      role,
      hash: role,
      price: ['facts', 'plan'].includes(role)
        ? { inputCentsPerM: 132, outputCentsPerM: 396 }
        : { inputCentsPerM: 30, outputCentsPerM: 120 }
    }
  ])
)
const policy = { maxAttempts: 64, maxRunMs: 172800000, accountDailyCapCents: 400 }
const args = { models, observationBatches: 4, maxFieldCalls: 11, reviewCalls: 10 }
async function world({ dayCap = 400, jobCap = 200 } = {}) {
  const accountId = randomUUID(),
    opportunityId = randomUUID()
  const ledger = createCostLedger({
    pool: db.pool,
    caps: async () => ({ dailyCapCents: dayCap, jobCapCents: jobCap })
  })
  const store = qualityRunStore({ pool: db.pool })
  const intent = await acceptQualityIntent(db.pool, {
    accountId,
    opportunityId,
    semanticInput: { source: 'synthetic' },
    policy
  })
  const run = await store.prepare({
    accountId,
    opportunityId,
    revisionId: randomUUID(),
    input: { synthetic: true },
    intentId: intent.id,
    policy
  })
  const headroom = createQualityHeadroom({ pool: db.pool, ledger, store })
  return { accountId, ledger, store, run, headroom }
}
test('the complete forecast includes whole-site review, both repairs and the single C schema repair', () => {
  const forecast = qualityBudgetSlots(args)
  assert.equal(forecast.totalCalls, 50)
  assert.equal(forecast.ceilingCents, 194)
  assert.equal(forecast.slots.filter((s) => s.stage.startsWith('d-')).length, 30)
  assert.equal(forecast.assumptions.reviewIncludesGlobalCoherence, true)
  for (const change of [{ reviewCalls: 11 }, { observationBatches: 5 }, { maxFieldCalls: 12 }])
    assert.throws(() => qualityBudgetSlots({ ...args, ...change }), /FORECAST_POLICY/)
})
test('current call is counted once and only its actual ceiling is held', opts, async () => {
  const { ledger, store, run, headroom } = await world({ dayCap: 200 })
  const admission = await headroom({ ...args, run, stage: 'a-facts', budget: { maxCents: 11 } })
  assert.equal(admission.remainingCeilingCents, 194)
  const result = await ledger.reserve({
    provider: 'synthetic',
    operation: 'quality:a-facts',
    maxCents: 11,
    accountId: run.account_id,
    accountDailyCapCents: 400,
    jobId: run.intent_id,
    requestKey: 'synthetic-first',
    minRemainingCents: admission.minRemainingCents
  })
  assert.equal(result.ok, true)
  assert.equal((await ledger.summary()).reservedCents, 11)
  await headroom({ ...args, run })
  const forecast = (await db.pool.query('select artifacts from wo_quality_run where id=$1', [run.id])).rows[0]
    .artifacts['call-forecast']
  assert.equal(forecast.ceilingCents, 194)
  await assert.rejects(headroom({ ...args, run, stage: 'unplanned', budget: { maxCents: 1 } }), /UNPLANNED/)
  assert.ok(store)
})
test('two roots race for final day headroom under the same monetary lock', opts, async () => {
  const { accountId, ledger } = await world({ dayCap: 200 })
  const answers = await Promise.all(
    [1, 2].map((n) =>
      ledger.reserve({
        provider: 'synthetic',
        operation: 'quality:a-facts',
        accountId,
        accountDailyCapCents: 400,
        jobId: randomUUID(),
        requestKey: `race-${n}`,
        maxCents: 11,
        minRemainingCents: async () => 183
      })
    )
  )
  assert.equal(answers.filter((a) => a.ok).length, 1)
  assert.equal(answers.filter((a) => !a.ok)[0].scope, 'day')
  assert.equal((await ledger.summary()).reservedCents, 11)
})
test('a held future slot is not counted twice, unknown spend stops later dispatch', opts, async () => {
  const { ledger, store, run, headroom } = await world()
  const held = await store.claim({
    runId: run.id,
    accountId: run.account_id,
    stage: 'c2-1',
    input: {},
    modelConfig: models.plan
  })
  const reserved = await ledger.reserve({
    provider: 'synthetic',
    operation: 'quality:c2-1',
    maxCents: 9,
    accountId: run.account_id,
    accountDailyCapCents: 400,
    jobId: run.intent_id,
    requestKey: `quality:${held.attempt.id}:${held.attempt.lease_token}`
  })
  await store.dispatch(held.attempt, reserved.reservation)
  const admission = await headroom({ ...args, run, stage: 'a-facts', budget: { maxCents: 11 } })
  assert.equal(admission.remainingCeilingCents, 185)
  await ledger.unreconcile(reserved.reservation)
  await assert.rejects(headroom({ ...args, run, stage: 'a-facts', budget: { maxCents: 11 } }), /UNCERTAIN/)
})
test(
  'paid-slot proof survives replay; cached reads do not request fresh budget or call again',
  opts,
  async () => {
    const { ledger, store, run, headroom } = await world()
    let calls = 0,
      budgetChecks = 0,
      receipts = 0
    const paid = {
      ledger,
      store,
      run,
      stage: 'a-facts',
      input: {},
      modelConfig: models.facts,
      maxCents: 11,
      checkAllowed: async () => {},
      checkBudget: async () => {
        budgetChecks++
        return headroom({ ...args, run, stage: 'a-facts', budget: { maxCents: 11 } })
      },
      call: async () => {
        calls++
        return { result: { facts: [] }, receipt: { requestId: 'synthetic-receipt' } }
      },
      actualCents: () => 0.2,
      onPaid: async (a) => {
        receipts++
        await store.artifact(run.id, run.account_id, 'paid-slot:a-facts', {
          attemptId: a.id,
          modelConfigHash: models.facts.hash
        })
      }
    }
    await runQualityAttempt(paid)
    assert.equal((await runQualityAttempt(paid)).reused, true)
    assert.deepEqual({ calls, budgetChecks, receipts }, { calls: 1, budgetChecks: 1, receipts: 2 })
    assert.equal((await ledger.summary()).spentCents, 1, 'fractional estimates round up conservatively')
    const next = await headroom({ ...args, run, stage: 'c1-outline', budget: { maxCents: 14 } })
    assert.equal(next.remainingCeilingCents, 183)
    assert.equal(next.balance.committedCents.job, 1)
  }
)
test('another consumer can exhaust shared headroom; the forecast is not an allocation', opts, async () => {
  const { ledger, run, headroom } = await world({ dayCap: 200 })
  const checked = await headroom({ ...args, run, stage: 'a-facts', budget: { maxCents: 11 } })
  await ledger.reserve({ provider: 'another', operation: 'research', maxCents: 10, jobId: randomUUID() })
  const refused = await ledger.reserve({
    provider: 'synthetic',
    operation: 'quality:a-facts',
    maxCents: 11,
    accountId: run.account_id,
    accountDailyCapCents: 400,
    jobId: run.intent_id,
    requestKey: 'after-consumer',
    minRemainingCents: checked.minRemainingCents
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.scope, 'day')
  await assert.rejects(
    ledger.reserve({ provider: 'synthetic', operation: 'bad', maxCents: 1, minRemainingCents: 1 }),
    /requires account/
  )
})

test(
  'a scoped stand counts all deployment money but mutates only its account and two registered jobs',
  opts,
  async () => {
    const { ledger, run } = await world({ dayCap: 200 })
    const otherAccount = randomUUID(),
      otherJob = randomUUID()
    const foreign = await ledger.reserve({
      provider: 'synthetic',
      operation: 'another-account',
      maxCents: 20,
      accountId: otherAccount,
      accountDailyCapCents: 400,
      jobId: otherJob
    })
    const sameAccount = await ledger.reserve({
      provider: 'synthetic',
      operation: 'another-job',
      maxCents: 20,
      accountId: run.account_id,
      accountDailyCapCents: 400,
      jobId: randomUUID()
    })
    await db.pool.query("update wo_cost_ledger set created_at=now()-interval '1 hour'")
    const scoped = createCostLedger({
      pool: db.pool,
      scope: { accountIds: [run.account_id], jobIds: [run.intent_id, randomUUID()] },
      caps: async () => ({ dailyCapCents: 200, jobCapCents: 200 })
    })
    assert.equal(await scoped.markStale(), 0)
    assert.equal(await scoped.settle(foreign.reservation, 1), false)
    assert.equal(await scoped.unreconcile(sameAccount.reservation), false)
    assert.equal(await scoped.release(foreign.reservation), false)
    await assert.rejects(
      scoped.reserve({
        provider: 'synthetic',
        operation: 'bad',
        maxCents: 1,
        accountId: otherAccount,
        jobId: otherJob
      }),
      /outside/
    )
    const answer = await scoped.reserve({
      provider: 'synthetic',
      operation: 'allowed',
      maxCents: 161,
      accountId: run.account_id,
      accountDailyCapCents: 400,
      jobId: run.intent_id
    })
    assert.equal(answer.ok, false)
    assert.equal(answer.scope, 'day', 'the other forty cents still count globally')
    assert.deepEqual((await db.pool.query('select distinct state from wo_cost_ledger')).rows, [
      { state: 'reserved' }
    ])
  }
)

test('a settings increase and day rollover cannot increase the frozen job cap', opts, async () => {
  const clock = { now: Date.parse('2026-10-20T23:59:00Z') },
    accountId = randomUUID(),
    jobId = randomUUID()
  const ledger = createCostLedger({
    pool: db.pool,
    now: () => clock.now,
    caps: async () => ({ dailyCapCents: 2000, jobCapCents: 500 })
  })
  const spec = {
    provider: 'synthetic',
    operation: 'quality',
    accountId,
    jobId,
    accountDailyCapCents: 400,
    jobCapCents: 200
  }
  const paid = await ledger.reserve({ ...spec, maxCents: 200 })
  await ledger.settle(paid.reservation, 190)
  clock.now = Date.parse('2026-10-21T00:01:00Z')
  const next = await ledger.reserve({ ...spec, maxCents: 11 })
  assert.equal(next.ok, false)
  assert.equal(next.scope, 'job')
  assert.equal((await ledger.headroom(spec)).availableCents, 10)
})
