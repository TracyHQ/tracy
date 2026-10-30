/**
 * What a build's words cost is recorded (`text-spend.js`): every text model an engine makes during a build's prepare and
 * apply is summed onto the build's timings, in all and per stage, however the step ends. Fictional usage numbers.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summedUsage, trackTextSpend, withTextSpend } from '../src/sites/brief-engines/text-spend.js'

const modelSpending = (calls, stage) => ({
  usage: () => ({
    calls,
    promptTokens: calls * 100,
    completionTokens: calls * 10,
    reasoningTokens: calls,
    stages: {
      [stage]: { calls, promptTokens: calls * 100, completionTokens: calls * 10, reasoningTokens: calls }
    }
  })
})

test('the text models of one build are summed onto its timings across prepare and apply, even when a step throws', async () => {
  let made = 0
  const models = trackTextSpend(async () => ({
    text: modelSpending(++made, made === 1 ? 'planner' : 'menu')
  }))
  const engine = withTextSpend({
    async prepare() {
      await models()
      return { ok: true }
    },
    async apply() {
      await models()
      throw new Error('the site refused a write')
    }
  })
  const times = {}
  const ctx = { time: (name, v) => (times[name] = v) }
  // Another build running at the same time keeps its own count.
  const other = { time: () => {} }
  await Promise.all([engine.prepare(ctx), engine.prepare(other)])
  await assert.rejects(engine.apply(ctx, {}), /refused/)
  assert.equal(times.textCalls, 1 + 3, 'prepare (1 call) and apply (3 calls) of this build only')
  assert.equal(times.textIn, 400)
  assert.equal(times['text.planner.calls'], 1)
  assert.equal(times['text.menu.calls'], 3)
})

test('summed usage reads models with no usage as nothing', () => {
  assert.deepEqual(summedUsage([null, {}, modelSpending(2, 'x')]).calls, 2)
})

test('prepare and apply are handed copies of the build context, and the timings still keep both steps summed', async () => {
  // The build runner spreads its context into each step (`{...ctx, signal}`), so the two steps never share one object.
  let made = 0
  const models = trackTextSpend(async () => ({ text: modelSpending(++made * 2, 'planner') }))
  const engine = withTextSpend({
    async prepare() {
      await models()
    },
    async apply() {
      await models()
    }
  })
  const times = {}
  const base = { time: (name, v) => (times[name] = v), record: (name, v) => (times[name] = v) }
  await engine.prepare({ ...base, signal: null })
  assert.equal(times.textCalls, 2)
  await engine.apply({ ...base, signal: null }, {})
  assert.equal(times.textCalls, 2 + 4, 'apply adds to what prepare spent, never replaces it')
  assert.equal(times.textIn, 600)
  assert.equal(times['text.planner.calls'], 6)
})

test('the text a build spent is priced from the repo price table, and a model with no price is named, not guessed', async () => {
  const priced = (model, promptTokens, completionTokens) => ({
    usage: () => ({ model, calls: 1, promptTokens, completionTokens, reasoningTokens: 0, stages: {} })
  })
  const total = summedUsage([
    priced('deepseek/deepseek-v4-flash', 1_000_000, 100_000),
    priced('deepseek/deepseek-v4-flash', 500_000, 0),
    priced('a-model-nobody-priced', 10, 10)
  ])
  // deepseek-flash: 30 cents per million in, 120 cents per million out.
  assert.equal(total.costUsd, 0.57)
  assert.deepEqual(total.unpriced, ['a-model-nobody-priced'])
  const times = {}
  const ctx = { time: (name, v) => (times[name] = v), record: (name, v) => (times[name] = v) }
  const models = trackTextSpend(async () => ({ text: priced('deepseek/deepseek-v4-flash', 2_000_000, 0) }))
  await withTextSpend({
    async prepare() {
      await models()
    }
  }).prepare(ctx)
  assert.equal(times.textCostUsd, 0.6)
})
