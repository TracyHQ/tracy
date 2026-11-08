/**
 * A chain build runs without the per-step caps (#478): no USD budget on the planner, no cost cap on the brand run, no
 * 10 and 12 minute windows on step 9b. Every other engine and every bench run keeps its limits. No database needed.
 *
 *   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-no-caps.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BRAND_CAP_USD, brandHarnessFor } from '../src/brand-step/brand-harness.js'
import { CostCapReached, createSpend } from '../src/brand-step/brand-spend.js'
import { BENCH_HARNESS, benchHarnessFor, withoutCaps } from '../src/lib/bench-harness.js'
import { BENCH_QUEUE } from '../src/lib/bench-run-loop.js'
import { DEFAULT_LIMITS } from '../src/sites/brief-build.js'
import { STEP_CHAIN_DEADLINE_MS, STEP_CHAIN_LIMITS } from '../src/sites/brief-engines/step-chain.js'
import { CHAIN_REPAIR_LIMITS } from '../src/step-chain-steps.js'
import { REPAIR_LIMITS, repairClock } from '../src/write-step/repair-pass/repair-limits.js'

const MIN = 60_000

test('the frame keeps its 25 minute run cut for every other engine, the chain has the 2 hour deadline', () => {
  assert.equal(DEFAULT_LIMITS.runMs, 25 * MIN)
  assert.equal(STEP_CHAIN_DEADLINE_MS, 120 * MIN)
  assert.ok(STEP_CHAIN_LIMITS.runMs > STEP_CHAIN_DEADLINE_MS)
  assert.ok(STEP_CHAIN_LIMITS.applyMs > DEFAULT_LIMITS.applyMs)
})

test('withoutCaps drops the planner budget and nothing else; the default harness keeps it', () => {
  const plain = benchHarnessFor('deepseek-flash', 'deepseek')
  assert.equal(plain.budgetUsd, BENCH_HARNESS.budgetUsd)
  const { budgetUsd: _gone, ...rest } = plain
  assert.deepEqual(withoutCaps(plain), rest)
})

test('a brand harness for a chain build has no cost cap; the default keeps 1 USD', () => {
  assert.equal(brandHarnessFor('deepseek-flash', 'deepseek').capUsd, BRAND_CAP_USD)
  const chained = brandHarnessFor('deepseek-flash', 'deepseek', { noCaps: true })
  assert.equal(chained.capUsd, null)
  assert.equal(chained.maxTurns, brandHarnessFor('deepseek-flash', 'deepseek').maxTurns)
})

test('the brand spend check stops at a cap and never stops without one', async () => {
  const pool = { query: async () => ({ rows: [{ spent: 50 }] }) }
  const spend = (capUsd) => createSpend({ pool, runId: 'r', capUsd, round: () => 0 })
  const spent = async (capUsd) =>
    spend(capUsd)
      .check()
      .then(
        () => 'ran',
        (e) => e
      )
  // 50 USD spent on the stub: a capped run is stopped, an uncapped one is not.
  assert.ok((await spent(1)) instanceof CostCapReached)
  assert.equal(await spent(null), 'ran')
  assert.equal(await spent(undefined), 'ran')
})

test('step 9b keeps its windows by default and runs past them with the chain limits', () => {
  for (const [limits, stoppedAt11, stoppedAt90] of [
    [null, true, true],
    [CHAIN_REPAIR_LIMITS, false, false]
  ]) {
    let at = 0
    const clock = repairClock({ now: () => at, sleep: async () => {}, limits })
    at = 11 * MIN
    assert.equal(clock.stopped(), stoppedAt11)
    at = 90 * MIN
    assert.equal(clock.stopped(), stoppedAt90)
  }
  assert.equal(REPAIR_LIMITS.stopNewWorkMs, 10 * MIN)
  assert.equal(REPAIR_LIMITS.returnByMs, 12 * MIN)
  assert.ok(
    Number.isFinite(CHAIN_REPAIR_LIMITS.returnByMs) &&
      CHAIN_REPAIR_LIMITS.returnByMs >= STEP_CHAIN_DEADLINE_MS
  )
})

test("lost-run detection is untouched: the frame's stale clocks and the bench queue's lease and attempts", () => {
  for (const key of ['staleMs', 'lostAfterMs']) assert.equal(key in STEP_CHAIN_LIMITS, false, key)
  assert.deepEqual([DEFAULT_LIMITS.staleMs, DEFAULT_LIMITS.lostAfterMs], [4 * MIN, 30_000])
  assert.deepEqual([BENCH_QUEUE.leaseMs, BENCH_QUEUE.maxAttempts], [3 * MIN, 20])
})
