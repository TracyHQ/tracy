/**
 * My Sites lists the newest site first (Akemi, 29/09). `createdAt` comes from `/api/sites`; a row
 * without one (the site row was not found) goes to the end rather than jumping to the top.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { newestFirst } from '../src/client/newest-first.ts'

test('the newest site comes first', () => {
  const rows = [
    { siteKey: 'old', createdAt: '2026-09-01T00:00:00Z' },
    { siteKey: 'new', createdAt: '2026-09-29T00:00:00Z' },
    { siteKey: 'mid', createdAt: '2026-09-15T00:00:00Z' }
  ]
  assert.deepEqual(
    newestFirst(rows).map((r) => r.siteKey),
    ['new', 'mid', 'old']
  )
})

test('a row without a readable createdAt goes last, and the input is not reordered in place', () => {
  const rows = [
    { siteKey: 'none', createdAt: null },
    { siteKey: 'bad', createdAt: 'not a date' },
    { siteKey: 'dated', createdAt: '2026-09-10T00:00:00Z' },
    { siteKey: 'missing' }
  ]
  assert.deepEqual(
    newestFirst(rows).map((r) => r.siteKey),
    ['dated', 'none', 'bad', 'missing']
  )
  assert.equal(rows[0].siteKey, 'none')
})
