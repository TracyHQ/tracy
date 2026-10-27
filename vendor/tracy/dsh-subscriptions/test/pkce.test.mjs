import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPkce } from '../lib/pkce.js'

test('pkce challenge is long enough', async () => {
  const pkce = await createPkce()
  assert.ok(pkce.challenge.length > 20)
  assert.ok(pkce.verifier.length > 20)
  assert.ok(pkce.state.length > 10)
})
