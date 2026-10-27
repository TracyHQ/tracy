import test from 'node:test'
import assert from 'node:assert/strict'
import { createPkce } from '../lib/pkce.js'

// claude.ai/oauth/authorize answers "Invalid request format" to a 22-character
// state (16 random bytes) and accepts the 43-character one Claude Code sends.
test('pkce state carries 32 random bytes, like the official clients', async () => {
  const { state, verifier } = await createPkce()
  assert.match(state, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(state, verifier)
})
