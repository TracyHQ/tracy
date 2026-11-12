/**
 * A chain build runs without the per-step cost caps (#478): no USD budget on the planner, no cost cap on the brand run.
 * Step 9b keeps its 10 and 12 minute windows. Every other engine and every bench run keeps its limits. No database needed.
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
import {
  chainRepairLimits,
  STEP_CHAIN_DEADLINE_MS,
  STEP_CHAIN_HANDOVER_MS,
  STEP_CHAIN_LIMITS
} from '../src/sites/brief-engines/step-chain.js'
import { REPAIR_LIMITS, repairClock } from '../src/write-step/repair-pass/repair-limits.js'

const MIN = 60_000

test('the frame keeps its 25 minute run cut for every other engine, the chain has the 2 hour deadline', () => {
  // test-quality: contract the frame keeps its 25 minute run cut for every other engine
  assert.equal(DEFAULT_LIMITS.runMs, 25 * MIN)
  // test-quality: contract the chain deadline is 2 hours, by the owner's decision
  assert.equal(STEP_CHAIN_DEADLINE_MS, 120 * MIN)
  assert.ok(STEP_CHAIN_LIMITS.runMs > STEP_CHAIN_DEADLINE_MS)
  assert.ok(STEP_CHAIN_LIMITS.applyMs > DEFAULT_LIMITS.applyMs)
  // The frame's grace for the words after the site is up (a real timer) must not cut the steps before the deadline does.
  assert.ok(STEP_CHAIN_LIMITS.prepareGraceMs >= STEP_CHAIN_DEADLINE_MS)
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

test('step 9b keeps its 10 and 12 minute windows in a chain build too, cut shorter only by the deadline', () => {
  // 22 minutes in is where the measured Central Padel build (12/11/2026) started its write.
  for (const limits of [null, chainRepairLimits(0), chainRepairLimits(22 * MIN)]) {
    let at = 0
    const clock = repairClock({ now: () => at, sleep: async () => {}, limits })
    at = 9 * MIN
    assert.equal(clock.stopped(), false)
    at = 11 * MIN
    assert.equal(clock.stopped(), true)
    assert.ok(clock.returnLeft() > 0 && clock.returnLeft() <= 1 * MIN)
  }
  // test-quality: contract the default repair window stops new work at 10 minutes and returns by 12
  assert.equal(REPAIR_LIMITS.stopNewWorkMs, 10 * MIN)
  // test-quality: contract the default repair window returns by 12 minutes
  assert.equal(REPAIR_LIMITS.returnByMs, 12 * MIN)
  // test-quality: contract the chain hands over 15 minutes after the deadline
  assert.equal(STEP_CHAIN_HANDOVER_MS, 15 * MIN)
  // Starting at 30 minutes: the repair pass's own windows, not the 90 minutes left to the deadline.
  assert.deepEqual(chainRepairLimits(30 * MIN), { stopNewWorkMs: 10 * MIN, returnByMs: 12 * MIN })
  // Starting 5 minutes before the deadline: new work only until the deadline, the same 2 minutes to return after it.
  assert.deepEqual(chainRepairLimits(115 * MIN), { stopNewWorkMs: 5 * MIN, returnByMs: 7 * MIN })
  // Starting after the deadline: no new 9b work at all, only the short bounded window.
  assert.deepEqual(chainRepairLimits(130 * MIN), { stopNewWorkMs: 0, returnByMs: 15 * MIN })
  // test-quality: contract the chain run cut is the deadline plus the hand-over
  assert.equal(STEP_CHAIN_LIMITS.runMs, 135 * MIN)
})

test("lost-run detection is untouched: the frame's stale clocks and the bench queue's lease and attempts", () => {
  for (const key of ['staleMs', 'lostAfterMs']) assert.equal(key in STEP_CHAIN_LIMITS, false, key)
  assert.deepEqual([DEFAULT_LIMITS.staleMs, DEFAULT_LIMITS.lostAfterMs], [4 * MIN, 30_000])
  assert.deepEqual([BENCH_QUEUE.leaseMs, BENCH_QUEUE.maxAttempts], [3 * MIN, 20])
})
