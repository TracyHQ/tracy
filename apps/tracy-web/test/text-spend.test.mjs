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
