import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withoutKnown } from '../lib/known-errors.mjs'

test('a known Tracy error moves to the notes, tagged with its id', () => {
  const { fails, known } = withoutKnown([
    { url: 'https://cowork.tracy.site/dsh-subscriptions/status', message: 'HTTP 404' },
    { url: 'https://cowork.tracy.site/plugins/@tracy/dsh-chat-input/client.js', message: 'boom' }
  ])
  assert.deepEqual(
    known.map((k) => k.known),
    ['dsh-subscriptions-status-404']
  )
  assert.deepEqual(
    fails.map((f) => f.message),
    ['boom']
  )
})

test('a URL that only contains the known path as a prefix of another path still fails', () => {
  const { fails, known } = withoutKnown([
    { url: 'https://cowork.tracy.site/dsh-subscriptions/status-other', message: 'HTTP 500' }
  ])
  assert.equal(known.length, 0)
  assert.equal(fails.length, 1)
})
