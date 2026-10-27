import { test } from 'node:test'
import assert from 'node:assert/strict'
import { observeForecast, estimateForecast, calculateBurnRatePerHour } from '../lib/forecast.js'

const H = 3600000

test('#84: observe keeps sliding window and resets on reset-change', () => {
  const now = 10 * H
  let st = observeForecast(null, 'k', 90, null, now)
  st = observeForecast(st, 'k', 88, null, now + 60000)
  st = observeForecast(st, 'k', 80, null, now + 2 * 60000)
  const rec = st.windows.k
  assert.equal(rec.samples.length, 3)
  // reset boundary change -> fresh samples
  const st2 = observeForecast(st, 'k', 97, now + 3 * 60000, now + 180000)
  assert.equal(st2.windows.k.samples.length, 1)
  assert.equal(st2.windows.k.resetsAt, now + 180000)
})

test('#84: estimate is calibrating without enough span/consumption', () => {
  const now = 10 * H
  let st = observeForecast(null, 'k', 90, null, now)
  st = observeForecast(st, 'k', 89.8, null, now + 60000)
  st = observeForecast(st, 'k', 89.5, null, now + 120000)
  assert.equal(estimateForecast(st, 'k', 89.5, null, now + 120000).status, 'calibrating')
})

test('#84: estimate computes runway from a steady burn', () => {
  const now = 10 * H
  let st = null
  // 60%/hour burn: remaining drops 1% per minute
  for (let i = 0; i <= 40; i++) {
    st = observeForecast(st, 'k', 80 - i, null, now + i * 60000)
  }
  const est = estimateForecast(st, 'k', 40, null, now + 40 * 60000)
  assert.equal(est.status, 'ready')
  assert.ok(est.pacePerHour > 55 && est.pacePerHour < 65, 'pace ~60/h, got ' + est.pacePerHour)
  // 40% left at 60%/h -> ~0.66h ~ 2400s
  assert.ok(est.runwaySeconds > 2200 && est.runwaySeconds < 2600, 'runway, got ' + est.runwaySeconds)
})

test('#84: idle when nothing is consumed', () => {
  const now = 10 * H
  let st = null
  for (let i = 0; i <= 40; i++) {
    st = observeForecast(st, 'k', 80, null, now + i * 60000)
  }
  // duplicate pct is not re-sampled (delta < 0.1), so only 1 sample exists
  assert.equal(estimateForecast(st, 'k', 80, null, now + 40 * 60000).status, 'calibrating')
})

test('#352: calculateBurnRatePerHour discards pre-reset window when reset boundary is present', () => {
  const now = Date.now()
  const samples = [
    { at: now - 3600000, pct: 90, resetAt: now },
    { at: now - 1800000, pct: 10, resetAt: now },
    { at: now, pct: 100, resetAt: now + 6 * 3600000 },
    { at: now + 3600000, pct: 80, resetAt: now + 6 * 3600000 },
  ]
  const pace = calculateBurnRatePerHour(samples, now + 3600000)
  assert.equal(Math.round(pace), 20)
})
