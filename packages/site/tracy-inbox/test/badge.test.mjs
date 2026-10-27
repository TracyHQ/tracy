/** The left column's unread count: hidden at 0, the number up to 9, then "9+". */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { badgeText } from '../src/client/badge.ts'

test('no badge at zero, or for a count that is not one', () => {
  assert.equal(badgeText(0), null)
  assert.equal(badgeText(-2), null)
  assert.equal(badgeText(Number.NaN), null)
})

test('the number up to 9, then 9+', () => {
  assert.equal(badgeText(1), '1')
  assert.equal(badgeText(9), '9')
  assert.equal(badgeText(10), '9+')
  assert.equal(badgeText(250), '9+')
})
