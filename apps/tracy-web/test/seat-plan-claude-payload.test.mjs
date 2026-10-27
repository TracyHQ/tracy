import assert from 'node:assert/strict'
import { test } from 'node:test'

import { anthropicPayload } from '../src/seat-plan/wire/messages.js'

const ask = (extra = {}) => ({
  model: 'claude-sonnet-5',
  messages: [{ role: 'user', content: 'Change the footer phone' }],
  ...extra
})

test('a Claude request dsh gives no ceiling asks for 32000 output tokens, room for adaptive thinking and the answer', () => {
  // 8192 was too low once thinking runs: thinking counts toward max_tokens, and long agent steps
  // stopped at max_tokens with "Send continue".
  assert.equal(anthropicPayload(ask()).max_tokens, 32000)
  // a ceiling dsh names is kept
  assert.equal(anthropicPayload(ask({ maxTokens: 4000 })).max_tokens, 4000)
  assert.equal(anthropicPayload(ask()).stream, true)
})
