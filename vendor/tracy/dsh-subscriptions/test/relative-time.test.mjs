import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatRelativeReset } from '../lib/relative-time.js'

test('formatRelativeReset returns empty string for invalid timestamp', () => {
  assert.equal(formatRelativeReset(null), '')
  assert.equal(formatRelativeReset(undefined), '')
  assert.equal(formatRelativeReset(0), '')
  assert.equal(formatRelativeReset(-100), '')
})

test('formatRelativeReset handles soon / past timestamp', () => {
  const now = 1000000
  assert.equal(formatRelativeReset(now - 5000, 'en', now), 'just now')
  assert.equal(formatRelativeReset(now - 5000, 'zh', now), '刚刚')
})

test('formatRelativeReset formats minutes and hours in en and zh', () => {
  const now = 1000000
  // 45 minutes = 45 * 60 * 1000
  const t45m = now + 45 * 60 * 1000
  assert.equal(formatRelativeReset(t45m, 'en', now), 'in 45m')
  assert.equal(formatRelativeReset(t45m, 'zh', now), '45分后')

  // 2 hours 15 minutes
  const t2h15m = now + (2 * 60 + 15) * 60 * 1000
  assert.equal(formatRelativeReset(t2h15m, 'en', now), 'in 2h 15m')
  assert.equal(formatRelativeReset(t2h15m, 'zh', now), '2小时 15分后')

  // 3 days 4 hours
  const t3d4h = now + (3 * 24 + 4) * 3600 * 1000
  assert.equal(formatRelativeReset(t3d4h, 'en', now), 'in 3d 4h')
  assert.equal(formatRelativeReset(t3d4h, 'zh', now), '3天 4小时后')
})
