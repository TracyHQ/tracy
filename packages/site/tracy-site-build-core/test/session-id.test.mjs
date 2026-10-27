import assert from 'node:assert/strict'
import { test } from 'node:test'

import { currentSessionId } from '../src/client/session-id.mjs'

test('reads the session out of a dsh address', () => {
  assert.equal(
    currentSessionId('/s/session-225a1325-2f8a-4cb8-86e9-501cc4216482'),
    'session-225a1325-2f8a-4cb8-86e9-501cc4216482'
  )
  assert.equal(currentSessionId('/s/session-abc/'), 'session-abc')
})

test('finds it under a lane mounted on a path, the way production serves dsh', () => {
  assert.equal(currentSessionId('/bakery.tracy.ai/s/session-abc'), 'session-abc')
})

test('a page that is not on a session answers null, and the call stays as it was', () => {
  assert.equal(currentSessionId('/'), null)
  assert.equal(currentSessionId('/bakery.tracy.ai/'), null)
  assert.equal(currentSessionId('/s/'), null)
  assert.equal(currentSessionId('/settings/s/other'), null)
})
