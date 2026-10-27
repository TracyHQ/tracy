import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeBlob, parseBlob, normalizeExpiresAt } from '../lib/blob.js'

test('blob round-trip does not drop refreshToken', () => {
  const raw = serializeBlob({
    accessToken: 'at', refreshToken: 'rt', expiresAt: 1, label: 'acct', email: 'a@b.c',
  })
  const parsed = parseBlob(raw)
  assert.equal(parsed.refreshToken, 'rt')
  assert.equal(JSON.parse(raw).refreshToken, 'rt')
})

test('serializeBlob rejects empty access and refresh', () => {
  assert.throws(() => serializeBlob({ accessToken: '', refreshToken: '' }))
})

test('blob round-trip preserves clientId, clientSecret, and idToken', () => {
  const original = {
    accessToken: 'at-123',
    refreshToken: 'rt-123',
    expiresAt: 1780064966476,
    label: 'antigravity-account',
    email: 'user@example.com',
    clientId: '123456789-abcdef.apps.googleusercontent.com',
    clientSecret: 'secret-xyz',
    idToken: 'eyJhbGciOi...test',
  }
  const serialized = serializeBlob(original)
  const parsed = parseBlob(serialized)
  assert.equal(parsed.clientId, original.clientId)
  assert.equal(parsed.clientSecret, original.clientSecret)
  assert.equal(parsed.idToken, original.idToken)
  assert.equal(parsed.expiresAt, original.expiresAt)
})

test('normalizeExpiresAt parses ISO strings with timezone offsets and nanoseconds', () => {
  const isoWithOffset = '2026-05-29T17:29:26.476509737+03:00'
  const expectedMs = Date.parse(isoWithOffset)
  assert.ok(expectedMs > 0, 'Date.parse must succeed on ISO string')
  assert.equal(normalizeExpiresAt(isoWithOffset), expectedMs)

  const isoUtc = '2026-10-02T14:06:05Z'
  assert.equal(normalizeExpiresAt(isoUtc), Date.parse(isoUtc))
})

test('normalizeExpiresAt converts epoch seconds into milliseconds', () => {
  const sec = 1787252123
  assert.equal(normalizeExpiresAt(sec), sec * 1000)
  assert.equal(normalizeExpiresAt(String(sec)), sec * 1000)
})

test('normalizeExpiresAt preserves epoch milliseconds', () => {
  const ms = 1787252123978
  assert.equal(normalizeExpiresAt(ms), ms)
  assert.equal(normalizeExpiresAt(String(ms)), ms)
})

test('normalizeExpiresAt handles Date objects', () => {
  const d = new Date('2026-06-01T12:00:00Z')
  assert.equal(normalizeExpiresAt(d), d.getTime())
})

test('normalizeExpiresAt returns 0 for invalid, empty, or non-positive values without fabricating', () => {
  assert.equal(normalizeExpiresAt(null), 0)
  assert.equal(normalizeExpiresAt(undefined), 0)
  assert.equal(normalizeExpiresAt(''), 0)
  assert.equal(normalizeExpiresAt('   '), 0)
  assert.equal(normalizeExpiresAt(0), 0)
  assert.equal(normalizeExpiresAt(-500), 0)
  assert.equal(normalizeExpiresAt('not-a-date'), 0)
  assert.equal(normalizeExpiresAt(NaN), 0)
  assert.equal(normalizeExpiresAt(Infinity), 0)
})
