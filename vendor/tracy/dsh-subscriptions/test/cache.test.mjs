import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveSessionId } from '../lib/vendors/codex.js'

test('deriveSessionId extracts explicit sessionId if provided', () => {
  const id1 = deriveSessionId({ sessionId: 'session-12345' })
  assert.equal(id1, 'session-12345')

  const id2 = deriveSessionId({ conversationId: 'conv_abc-xyz' })
  assert.equal(id2, 'conv_abc-xyz')
})

test('deriveSessionId creates deterministic id from messages', () => {
  const opts1 = {
    messages: [
      { role: 'user', content: 'Hello world! Write a function in Rust' }
    ]
  }
  const opts2 = {
    messages: [
      { role: 'user', content: 'Hello world! Write a function in Rust' }
    ]
  }
  const id1 = deriveSessionId(opts1)
  const id2 = deriveSessionId(opts2)
  assert.equal(id1, id2)
  assert.ok(id1.startsWith('dsh-sub-'))
})
