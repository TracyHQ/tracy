import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oauthRef, parseOauthRef } from '../lib/refs.js'

test('oauthRef is an env-style name', () => {
  assert.equal(oauthRef('codex', 1), 'CODEX_OAUTH_1')
  assert.equal(oauthRef('antigravity', 2), 'ANTIGRAVITY_OAUTH_2')
  assert.match(oauthRef('codex', 1), /^[A-Za-z_][A-Za-z0-9_]*$/)
})

test('parseOauthRef round-trips', () => {
  assert.deepEqual(parseOauthRef('CLAUDE_OAUTH_3'), { provider: 'claude', index: 3 })
  assert.equal(parseOauthRef('OPENAI_API_KEY'), null)
})
