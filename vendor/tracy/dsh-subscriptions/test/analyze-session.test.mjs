import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeSessionEvents } from '../lib/analyze-session.js'

test('analyzeSessionEvents handles empty list', () => {
  const res = analyzeSessionEvents([])
  assert.equal(res.totalCalls, 0)
  assert.equal(res.weightedCacheHitPercent, 0)
})

test('analyzeSessionEvents calculates prompt cache hit percent', () => {
  const events = [
    { usage: { prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens: 50 } },
    { usage: { prompt_tokens: 1200, prompt_tokens_details: { cached_tokens: 1000 }, completion_tokens: 60 } },
    { usage: { prompt_tokens: 1500, prompt_tokens_details: { cached_tokens: 1200 }, completion_tokens: 70 } },
  ]
  const res = analyzeSessionEvents(events)
  assert.equal(res.totalCalls, 3)
  assert.equal(res.promptTokens, 3700)
  assert.equal(res.cachedTokens, 2200)
  // 2200 / 3700 = 59.5%
  assert.equal(res.weightedCacheHitPercent, 59.5)
  assert.equal(res.calls[0].classification, 'cold_start')
  assert.equal(res.calls[1].classification, 'cache_hit')
})

test('analyzeSessionEvents calculates prompt cache hit from history records (#386)', () => {
  const historyEvents = [
    { usage: { inputTokens: 2000, cacheReadTokens: 0, outputTokens: 100 } },
    { usage: { inputTokens: 2500, cacheReadTokens: 2000, outputTokens: 150 } },
    { usage: { inputTokens: 3000, cacheReadTokens: 2500, outputTokens: 200 } },
  ]
  const res = analyzeSessionEvents(historyEvents)
  assert.equal(res.totalCalls, 3)
  assert.equal(res.promptTokens, 7500)
  assert.equal(res.cachedTokens, 4500)
  assert.equal(res.completionTokens, 450)
  // 4500 / 7500 = 60.0%
  assert.equal(res.weightedCacheHitPercent, 60)
  assert.equal(res.savedTokens, 4500)
  assert.equal(res.calls[0].classification, 'cold_start')
  assert.equal(res.calls[1].classification, 'cache_hit')
  assert.equal(res.calls[2].classification, 'cache_hit')
})
