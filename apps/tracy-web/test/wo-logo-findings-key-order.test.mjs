import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sameLogoFindings } from 'website-opportunities/src/place-logo.js'

// jsonb hands an object back with its keys reordered (shortest first); reverse them to the same effect.
const reordered = (v) =>
  Array.isArray(v)
    ? v.map(reordered)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .reverse()
            .map(([k, x]) => [k, reordered(x)])
        )
      : v

test('the same logo findings read back from jsonb with keys reordered are the same findings', () => {
  const candidate = {
    mediaId: 'm1',
    url: 'https://saga.test/logo.png',
    via: 'website',
    width: 120,
    height: 40,
    sha256: 'ab'
  }
  const found = {
    version: 'logo/3',
    at: '2026-10-24T00:00:00.000Z',
    status: 'found',
    chosen: { mediaId: 'm1', reason: 'header' },
    candidates: [candidate],
    vision: { calls: 0 }
  }
  const held = { ...reordered(found), at: '2026-10-20T00:00:00.000Z' }
  assert.equal(sameLogoFindings(found, held), true)
  assert.equal(sameLogoFindings(found, { ...held, status: 'none' }), false)
})
