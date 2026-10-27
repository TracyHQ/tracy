/** Ages, compact, in the interface language, by Intl: no phrase of ours to translate. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { relativeTime } from '../src/client/relative-time.ts'

const NOW = Date.parse('2026-10-03T12:00:00.000Z')
const ago = (ms) => new Date(NOW - ms).toISOString()

test('English: now, then 5m, 3h, 1d, 3d, 2w (no "ago")', () => {
  assert.equal(relativeTime(ago(10_000), NOW, 'en'), 'now')
  assert.equal(relativeTime(ago(5 * 60_000), NOW, 'en'), '5m')
  assert.equal(relativeTime(ago(3 * 3_600_000), NOW, 'en'), '3h')
  assert.equal(relativeTime(ago(26 * 3_600_000), NOW, 'en'), '1d')
  assert.equal(relativeTime(ago(3 * 86_400_000), NOW, 'en'), '3d')
  assert.equal(relativeTime(ago(14 * 86_400_000), NOW, 'en'), '2w')
})

test('the language follows the tag it is given', () => {
  assert.equal(relativeTime(ago(2 * 3_600_000), NOW, 'vi'), '2 giờ')
  assert.equal(relativeTime(ago(10_000), NOW, 'de'), 'jetzt')
})

test('a stamp that does not parse shows nothing', () => {
  assert.equal(relativeTime('not a date', NOW, 'en'), '')
})
