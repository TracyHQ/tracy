import { test } from 'node:test'
import assert from 'node:assert/strict'
import { droppedCredentialRefs } from '../lib/refs.js'

test('droppedCredentialRefs returns refs removed from slots', () => {
  const prev = [
    { provider: 'codex', index: 1, label: 'a' },
    { provider: 'grok', index: 1, label: 'b' },
  ]
  const next = [{ provider: 'codex', index: 1, label: 'a' }]
  assert.deepEqual(droppedCredentialRefs(prev, next), ['GROK_OAUTH_1'])
})
