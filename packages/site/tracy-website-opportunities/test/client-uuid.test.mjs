// The place box's typing session must be a UUID (the doors refuse anything else), also on a plain
// http:// stand, where the browser has no `crypto.randomUUID` (not a secure context).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { newUuid } from '../src/client/uuid.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('a v4 UUID with or without crypto.randomUUID', () => {
  assert.match(newUuid(), UUID)
  const native = crypto.randomUUID
  try {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    const a = newUuid()
    const b = newUuid()
    assert.match(a, UUID)
    assert.notEqual(a, b)
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { value: native, configurable: true })
  }
})
