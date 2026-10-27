import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeGrokCreditsFrame } from '../lib/vendors/grok.js'

test('decodeGrokCreditsFrame returns undefined for empty buffer', () => {
  assert.equal(decodeGrokCreditsFrame(Buffer.from([])), undefined)
})

test('decodeGrokCreditsFrame decodes valid protobuf float fixed32', () => {
  // field 1 (tag 0x0d = 1 << 3 | 5 fixed32), followed by float 0.25 (25%)
  const buf = Buffer.alloc(9)
  buf.writeUInt8(0, 0) // gRPC flags
  buf.writeUInt32BE(4, 1) // length
  // Tag 0x0d (field 1, wire 5)
  const inner = Buffer.from([0x0d, 0x00, 0x00, 0x00, 0x00])
  inner.writeFloatLE(0.25, 1)
  const frame = Buffer.concat([Buffer.from([0, 0, 0, 0, 5]), inner])
  const res = decodeGrokCreditsFrame(frame)
  assert.equal(res, 25)
})
