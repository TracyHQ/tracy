import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkReadRow } from '../ui/public/link-read-rows.js'

test('a pasted source reports counts or a plain recovery message for every failure kind', () => {
  assert.equal(
    linkReadRow({ readStatus: 'read', counts: { photos: 2, reviews: 1, contacts: 0 } }).text,
    'Read: 2 photos, 1 review, 0 contact items'
  )
  for (const reason of ['not-configured', 'unresolved', 'fetch-failed', 'blocked']) {
    const row = linkReadRow({ readStatus: 'could-not-read', readReason: reason })
    assert.match(row.text, /^Could not read:/)
    assert.match(row.text, /link/)
    assert.equal(row.tone, 'error')
    assert.doesNotMatch(row.text, /credential|API|key/)
  }
  assert.equal(linkReadRow({ readStatus: 'pending' }).text, 'Waiting to read')
})

test('standalone counts distinguish zero, one and several contributions', () => {
  for (const [count, expected] of [
    [0, 'Read: 0 photos, 0 reviews, 0 contact items'],
    [1, 'Read: 1 photo, 1 review, 1 contact item'],
    [2, 'Read: 2 photos, 2 reviews, 2 contact items']
  ]) {
    assert.equal(
      linkReadRow({ readStatus: 'read', counts: { photos: count, reviews: count, contacts: count } }).text,
      expected
    )
  }
})
