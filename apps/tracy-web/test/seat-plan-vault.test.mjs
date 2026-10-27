import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createVault } from '../src/seat-plan/vault.js'

test('subscription secrets are encrypted and bound to their account and connection', () => {
  const vault = createVault(Buffer.alloc(32, 7).toString('base64'))
  const key = { account: 'alice', id: 'connection-a', provider: 'claude' }
  const sealed = vault.seal(key, { accessToken: 'private-access-token' })
  assert.equal(JSON.stringify(sealed).includes('private-access-token'), false)
  assert.deepEqual(vault.open(key, sealed), { accessToken: 'private-access-token' })
  assert.throws(() => vault.open({ ...key, account: 'bob' }, sealed))
  assert.throws(() => vault.open({ ...key, id: 'connection-b' }, sealed))
  assert.throws(() => createVault(Buffer.alloc(32, 8).toString('base64')).open(key, sealed))
})
test('subscription vault refuses missing or malformed encryption keys', () => {
  for (const key of ['', undefined, 'secret', Buffer.alloc(31).toString('base64')]) {
    assert.throws(() => createVault(key))
  }
})
