import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateBurnUrgency } from '../lib/forecast.js'
import { pickAccount, getAccountRemainingPercent } from '../lib/rotate.js'
import { Config, plainConfig } from '../lib/config-schema.js'

test('calculateBurnUrgency: calculates urgency correctly based on remaining percent and reset time', () => {
  const now = 1000000000
  const hourMs = 3600000

  // 60% remaining, 1 hour to reset => 60 / 1 = 60
  const u1 = calculateBurnUrgency(60, now + hourMs, now)
  assert.equal(Math.round(u1), 60)

  // 60% remaining, 2 hours to reset => 60 / 2 = 30
  const u2 = calculateBurnUrgency(60, now + 2 * hourMs, now)
  assert.equal(Math.round(u2), 30)

  // 60% remaining, 30 minutes to reset => 60 / 0.5 = 120
  const u3 = calculateBurnUrgency(60, now + 0.5 * hourMs, now)
  assert.equal(Math.round(u3), 120)
})

test('calculateBurnUrgency: clamps denominator when reset is imminent (< 3 minutes)', () => {
  const now = 1000000000
  // 1 minute to reset => clamped to 0.05 hours => 50 / 0.05 = 1000
  const u = calculateBurnUrgency(50, now + 60000, now)
  assert.equal(Math.round(u), 1000)
})

test('calculateBurnUrgency: respects safetyFloor threshold', () => {
  const now = 1000000000
  const hourMs = 3600000

  // At or below default safety floor (5%) => returns 0
  assert.equal(calculateBurnUrgency(5, now + hourMs, now, 5), 0)
  assert.equal(calculateBurnUrgency(4, now + hourMs, now, 5), 0)
  assert.equal(calculateBurnUrgency(0, now + hourMs, now, 5), 0)

  // Above safety floor => positive urgency
  assert.ok(calculateBurnUrgency(6, now + hourMs, now, 5) > 0)

  // Custom safety floor (15%)
  assert.equal(calculateBurnUrgency(10, now + hourMs, now, 15), 0)
  assert.ok(calculateBurnUrgency(20, now + hourMs, now, 15) > 0)
})

test('calculateBurnUrgency: returns 0 for invalid inputs or expired windows', () => {
  const now = 1000000000
  const hourMs = 3600000

  assert.equal(calculateBurnUrgency(null, now + hourMs, now), 0)
  assert.equal(calculateBurnUrgency(undefined, now + hourMs, now), 0)
  assert.equal(calculateBurnUrgency(NaN, now + hourMs, now), 0)
  assert.equal(calculateBurnUrgency(-10, now + hourMs, now), 0)

  // Reset in the past or right now
  assert.equal(calculateBurnUrgency(50, now - 1000, now), 0)
  assert.equal(calculateBurnUrgency(50, now, now), 0)
  assert.equal(calculateBurnUrgency(50, null, now), 0)
  assert.equal(calculateBurnUrgency(50, undefined, now), 0)
})

test('getAccountRemainingPercent: correctly resolves remaining percent across formats', () => {
  assert.equal(getAccountRemainingPercent({ quota: { remainingPercent: 75 } }), 75)
  assert.equal(getAccountRemainingPercent({ quota: { usedPercent: 25 } }), 75)
  assert.equal(getAccountRemainingPercent({ usagePercent: 30 }), 70)
  assert.equal(getAccountRemainingPercent({ quota: { remaining: 250, limit: 1000 } }), 25)
  assert.equal(getAccountRemainingPercent(null), null)
  assert.equal(getAccountRemainingPercent({}), null)
})

test('pickAccount: drainBeforeReset prioritizes account with closer reset window', () => {
  const now = 1000000000
  const hourMs = 3600000

  const accClose = {
    ref: 'ACC_CLOSE',
    hasToken: true,
    quota: { remainingPercent: 70, resetAt: now + hourMs },
  }
  const accFar = {
    ref: 'ACC_FAR',
    hasToken: true,
    quota: { remainingPercent: 70, resetAt: now + 4 * hourMs },
  }

  const picked = pickAccount([accFar, accClose], now, { drainBeforeReset: true })
  assert.equal(picked.ref, 'ACC_CLOSE')
})

test('pickAccount: drainBeforeReset prioritizes account with higher remaining quota when reset times equal', () => {
  const now = 1000000000
  const hourMs = 3600000

  const accMoreQuota = {
    ref: 'ACC_MORE',
    hasToken: true,
    quota: { remainingPercent: 90, resetAt: now + 2 * hourMs },
  }
  const accLessQuota = {
    ref: 'ACC_LESS',
    hasToken: true,
    quota: { remainingPercent: 30, resetAt: now + 2 * hourMs },
  }

  const picked = pickAccount([accLessQuota, accMoreQuota], now, { drainBeforeReset: true })
  assert.equal(picked.ref, 'ACC_MORE')
})

test('pickAccount: drainBeforeReset protects account below safetyFloor', () => {
  const now = 1000000000
  const hourMs = 3600000

  const accDrained = {
    ref: 'ACC_DRAINED',
    hasToken: true,
    quota: { remainingPercent: 4, resetAt: now + hourMs }, // 4% <= 5% floor -> urgency 0
  }
  const accHealthy = {
    ref: 'ACC_HEALTHY',
    hasToken: true,
    quota: { remainingPercent: 60, resetAt: now + 4 * hourMs }, // urgency > 0
  }

  const picked = pickAccount([accDrained, accHealthy], now, {
    drainBeforeReset: true,
    drainSafetyPercent: 5,
  })
  assert.equal(picked.ref, 'ACC_HEALTHY')
})

test('pickAccount: drainBeforeReset prioritizes account with impending window over unknown reset', () => {
  const now = 1000000000
  const hourMs = 3600000

  const accNoReset = {
    ref: 'ACC_NO_RESET',
    hasToken: true,
    quota: { remainingPercent: 50 }, // no resetAt -> urgency 0
  }
  const accExpiring = {
    ref: 'ACC_EXPIRING',
    hasToken: true,
    quota: { remainingPercent: 50, resetAt: now + 2 * hourMs }, // urgency > 0
  }

  const picked = pickAccount([accNoReset, accExpiring], now, { drainBeforeReset: true })
  assert.equal(picked.ref, 'ACC_EXPIRING')
})

test('pickAccount: drainBeforeReset treats expired resetAt as non-draining', () => {
  const now = 1000000000
  const hourMs = 3600000

  const accExpired = {
    ref: 'ACC_EXPIRED',
    hasToken: true,
    quota: { remainingPercent: 50, resetAt: now - 10000 }, // expired -> urgency 0
  }
  const accExpiring = {
    ref: 'ACC_EXPIRING',
    hasToken: true,
    quota: { remainingPercent: 50, resetAt: now + 2 * hourMs }, // active window
  }

  const picked = pickAccount([accExpired, accExpiring], now, { drainBeforeReset: true })
  assert.equal(picked.ref, 'ACC_EXPIRING')
})

test('pickAccount: falls back to standard rotation when drainBeforeReset is false', () => {
  const now = 1000000000
  const hourMs = 3600000

  // When drainBeforeReset is false, Auto-Pacing or standard sorting applies
  const acc1 = {
    ref: 'ACC_LOW_RISK',
    hasToken: true,
    pacingRisk: 10,
    quota: { remainingPercent: 70, resetAt: now + 4 * hourMs },
  }
  const acc2 = {
    ref: 'ACC_HIGH_RISK',
    hasToken: true,
    pacingRisk: 80,
    quota: { remainingPercent: 70, resetAt: now + hourMs },
  }

  const picked = pickAccount([acc2, acc1], now, { drainBeforeReset: false })
  assert.equal(picked.ref, 'ACC_LOW_RISK')
})

test('Config schema: includes drainBeforeReset and drainSafetyPercent defaults', () => {
  const parsed = plainConfig(Config({}))
  assert.equal(parsed.drainBeforeReset, false)
  assert.equal(parsed.drainSafetyPercent, 5)
})
