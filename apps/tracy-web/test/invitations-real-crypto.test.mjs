import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { identityKey, open, seal } from '../src/invitations/real-crypto.js'

const context = { campaignId: randomUUID(), recordId: randomUUID(), purpose: 'recipient', version: 1 }
const key = randomBytes(32)

test('aad_and_campaign_isolation: every context coordinate authenticates the payload', () => {
  const bytes = Buffer.from('Synthetic recipient 👋')
  const envelope = seal({ key, context, bytes })
  assert.deepEqual(open({ key, context, envelope }), bytes)
  for (const patch of [
    { campaignId: randomUUID() },
    { recordId: randomUUID() },
    { purpose: 'draft' },
    { version: 2 }
  ])
    assert.throws(() => open({ key, context: { ...context, ...patch }, envelope }))
  assert.throws(() => open({ key: randomBytes(32), context, envelope }))
})

test('randomized envelopes hide equality and preserve empty or binary values', () => {
  const bytes = Buffer.from([0, 255, 17, 32])
  const a = seal({ key, context, bytes })
  const b = seal({ key, context, bytes })
  assert.notDeepEqual(a, b)
  assert.equal(Buffer.from(a.iv, 'base64url').length, 12)
  assert.equal(Buffer.from(a.tag, 'base64url').length, 16)
  assert.deepEqual(open({ key, context, envelope: b }), bytes)
  assert.deepEqual(
    open({ key, context, envelope: seal({ key, context, bytes: Buffer.alloc(0) }) }),
    Buffer.alloc(0)
  )
})

test('tamper_and_missing_key_refuse: no unauthenticated plaintext fallback', () => {
  const envelope = seal({ key, context, bytes: Buffer.from('Synthetic secret') })
  for (const field of ['iv', 'tag', 'bytes']) {
    const bytes = Buffer.from(envelope[field], 'base64url')
    bytes[0] ^= 1
    assert.throws(() =>
      open({ key, context, envelope: { ...envelope, [field]: bytes.toString('base64url') } })
    )
  }
  for (const bad of [
    null,
    {},
    { ...envelope, v: 2 },
    { ...envelope, iv: 'invalid!' },
    { ...envelope, tag: '' }
  ]) {
    assert.throws(() => open({ key, context, envelope: bad }))
  }
  for (const bad of [null, Buffer.alloc(31), 's'.repeat(32)]) {
    assert.throws(() => open({ key: bad, context, envelope }))
    assert.throws(() => seal({ key: bad, context, bytes: Buffer.from('Synthetic') }))
  }
  assert.throws(() => seal({ key, context: { ...context, version: 0 }, bytes: Buffer.alloc(0) }))
  assert.throws(() => seal({ key, context: { ...context, campaignId: '../escape' }, bytes: Buffer.alloc(0) }))
})

test('identity indexes are keyed, namespace separated and unambiguous', () => {
  const indexKey = randomBytes(32)
  const value = 'synthetic@example.test'
  const email = identityKey({ indexKey, kind: 'email', value })
  assert.equal(email, identityKey({ indexKey, kind: 'email', value }))
  assert.notEqual(email, identityKey({ indexKey, kind: 'member', value }))
  assert.notEqual(email, identityKey({ indexKey: randomBytes(32), kind: 'email', value }))
  assert.notEqual(email, identityKey({ indexKey, kind: 'email', value: `${value}x` }))
  for (const bad of ['', '__proto__', 'email\0member'])
    assert.throws(() => identityKey({ indexKey, kind: bad, value }))
  assert.throws(() => identityKey({ indexKey: null, kind: 'email', value }))
})
