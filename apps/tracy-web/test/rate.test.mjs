import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'
import {
  memoryRateLimiter,
  overLimit,
  overLimitBy,
  overLimitDetail,
  overLimitOrClosed
} from '../src/lib/rate.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL

test('overLimit: the third call over a limit of two answers true; a new hour starts a fresh bucket', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { pool } = db
  const now = Date.parse('2026-01-01T00:00:00Z')
  assert.equal(await overLimit(pool, 'seat:lee', 2, now), false) // count 1
  assert.equal(await overLimit(pool, 'seat:lee', 2, now), false) // count 2
  assert.equal(await overLimit(pool, 'seat:lee', 2, now), true) // count 3 > 2

  const nextHour = now + 3_600_000
  assert.equal(await overLimit(pool, 'seat:lee', 2, nextHour), false) // a fresh bucket, count 1
})

test('overLimit: a custom windowMs (a day) does not roll over after an hour, only after the day', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { pool } = db
  const DAY_MS = 24 * 60 * 60 * 1000
  const now = Date.parse('2026-01-01T00:00:00Z')
  assert.equal(await overLimit(pool, 'design-read:1.2.3.4', 1, now, DAY_MS), false) // count 1
  // An hour later is still the SAME window — the default (hourly) callers are unaffected because
  // they never pass this fifth argument, but a caller that does pass a day must actually get one.
  const anHourLater = now + 3_600_000
  assert.equal(await overLimit(pool, 'design-read:1.2.3.4', 1, anHourLater, DAY_MS), true) // count 2 > 1
  const nextDay = now + DAY_MS
  assert.equal(await overLimit(pool, 'design-read:1.2.3.4', 1, nextDay, DAY_MS), false) // a fresh bucket
})

test('overLimit: two different buckets never share a count', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { pool } = db
  const now = Date.now()
  assert.equal(await overLimit(pool, 'seat:a', 1, now), false)
  assert.equal(await overLimit(pool, 'seat:b', 1, now), false)
  assert.equal(await overLimit(pool, 'seat:a', 1, now), true)
})

test('overLimitDetail: the same count as overLimit, plus the seconds until the next fixed window opens', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { pool } = db
  // 00:10:30 into an hourly window: the next window opens in 49 min 30 s = 2970 s.
  const now = Date.parse('2026-01-01T00:10:30Z')
  assert.deepEqual(await overLimitDetail(pool, 'key:abc:write', 2, now), { over: false, retryAfterS: 2970 })
  assert.deepEqual(await overLimitDetail(pool, 'key:abc:write', 2, now), { over: false, retryAfterS: 2970 })
  assert.deepEqual(await overLimitDetail(pool, 'key:abc:write', 2, now), { over: true, retryAfterS: 2970 })
  // Shares the bucket table with overLimit: the fourth call is over there too.
  assert.equal(await overLimit(pool, 'key:abc:write', 2, now), true)
  // A partial second still rounds UP to a whole second a client can wait.
  const late = Date.parse('2026-01-01T00:59:59.400Z')
  assert.deepEqual(await overLimitDetail(pool, 'key:abc:read', 1, late), { over: false, retryAfterS: 1 })
  // Exactly on the boundary: a full window ahead.
  const onBoundary = Date.parse('2026-01-01T01:00:00Z')
  assert.deepEqual(await overLimitDetail(pool, 'key:abc:read', 1, onBoundary), {
    over: false,
    retryAfterS: 3600
  })
})

test('overLimit: a parallel burst on one bucket counts every call — exactly the limit get through', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { pool } = db
  const now = Date.parse('2026-09-30T08:00:00Z')
  const answers = await Promise.all(
    Array.from({ length: 12 }, () => overLimitOrClosed(pool, 'login-email:burst@b.c', 5, now))
  )
  assert.equal(answers.filter((over) => !over).length, 5)
  assert.equal(answers.filter(Boolean).length, 7)
})

test('overLimitOrClosed: the real table answers like overLimit; a failing pool answers "over"', async () => {
  const failing = { query: async () => Promise.reject(new Error('connection refused')) }
  assert.equal(await overLimitOrClosed(failing, 'login-ip:1.2.3.4', 30, Date.now()), true)
  // A pool that answers with no row (a broken table) is a failure too, not a pass.
  const empty = { query: async () => ({ rows: [] }) }
  assert.equal(await overLimitOrClosed(empty, 'login-ip:1.2.3.4', 30, Date.now()), true)
  if (!url) return
  const now = Date.parse('2026-09-30T09:00:00Z')
  assert.equal(await overLimitOrClosed(db.pool, 'login-ip:5.6.7.8', 1, now), false)
  assert.equal(await overLimitOrClosed(db.pool, 'login-ip:5.6.7.8', 1, now), true)
})

test('memoryRateLimiter: same count, same window rule, buckets apart, closed windows dropped', () => {
  const rate = memoryRateLimiter()
  const now = Date.parse('2026-09-30T10:15:00Z')
  assert.equal(rate.overLimit('a', 2, now), false)
  assert.equal(rate.overLimit('a', 2, now), false)
  assert.equal(rate.overLimit('a', 2, now), true)
  assert.equal(rate.overLimit('b', 2, now), false)
  // Same hour, later minute: still the same window.
  assert.equal(rate.overLimit('a', 2, now + 40 * 60 * 1000), true)
  // Next hour: fresh.
  assert.equal(rate.overLimit('a', 2, now + 60 * 60 * 1000), false)
  // A different window width is its own count.
  assert.equal(rate.overLimit('a', 1, now, 24 * 3_600_000), false)
  assert.equal(rate.overLimit('a', 1, now, 24 * 3_600_000), true)
})

test('memoryRateLimiter: memory stays one window deep however many buckets pass through', () => {
  const rate = memoryRateLimiter()
  let now = Date.parse('2026-09-30T00:00:00Z')
  for (let hour = 0; hour < 5; hour++, now += 3_600_000) {
    for (let i = 0; i < 1000; i++) rate.overLimit(`login-ip:10.0.${hour}.${i}`, 30, now)
  }
  // Each bucket of the last hour counts from one: older hours were dropped, not merely ignored.
  assert.equal(rate.overLimit('login-ip:10.0.4.1', 1, now - 3_600_000), true)
  assert.equal(rate.overLimit('login-ip:10.0.0.1', 1, now - 5 * 3_600_000), false)
})

test('overLimitBy: counts what a call costs, gives back a refused one, never below zero', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { pool } = db
  const now = Date.parse('2026-01-01T00:00:00Z')
  const day = 86_400_000
  assert.equal(await overLimitBy(pool, 'speak-chars:ana', 400, 1000, now, day), false) // 400
  assert.equal(await overLimitBy(pool, 'speak-chars:ana', 500, 1000, now, day), false) // 900
  assert.equal(await overLimitBy(pool, 'speak-chars:ana', 200, 1000, now, day), true) // 1100 > 1000
  assert.equal(await overLimitBy(pool, 'speak-chars:ana', -200, 1000, now, day), false) // given back: 900
  assert.equal(await overLimitBy(pool, 'speak-chars:ana', -5000, 1000, now, day), false) // floor at 0
  assert.equal(await overLimitBy(pool, 'speak-chars:ana', 1000, 1000, now, day), false) // exactly the limit
  // A give-back on a bucket never counted writes a zero, not a negative count.
  assert.equal(await overLimitBy(pool, 'speak-chars:bob', -50, 1000, now, day), false)
  assert.equal(await overLimitBy(pool, 'speak-chars:bob', 1001, 1000, now, day), true)
})

test('memoryRateLimiter: overLimitBy counts amounts like the pool, overLimit still counts one', () => {
  const limiter = memoryRateLimiter()
  const now = Date.parse('2026-01-01T00:00:00Z')
  const day = 86_400_000
  assert.equal(limiter.overLimitBy('speak-chars', 600, 1000, now, day), false)
  assert.equal(limiter.overLimitBy('speak-chars', 600, 1000, now, day), true)
  assert.equal(limiter.overLimitBy('speak-chars', -600, 1000, now, day), false)
  assert.equal(limiter.overLimitBy('speak-chars', -9000, 1000, now, day), false)
  assert.equal(limiter.overLimitBy('speak-chars', 1000, 1000, now, day), false)
  assert.equal(limiter.overLimitBy('speak-chars', 1000, 1000, now + day, day), false) // a new day
  assert.equal(limiter.overLimit('seat:lee', 1, now), false)
  assert.equal(limiter.overLimit('seat:lee', 1, now), true)
})
