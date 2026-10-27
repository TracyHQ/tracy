import { test } from 'node:test'
import assert from 'node:assert/strict'
// The signing half of this door lives in the OTHER app, `apps/tracy-web/src/host/client.js`.
// Importing it here — the ONE place allowed to cross the apps/tracy-web ↔ apps/tracy-host
// boundary — is what proves `verifyHostCall` (this app) and `signHostCall` (that app) still
// agree on the exact same canonical string, instead of two independent readings of a shared
// paragraph of prose that could silently drift apart.
import { signHostCall } from '../../tracy-web/src/host/client.js'
import { verifyHostCall } from '../src/auth.js'

const secret = 'host-secret'
const path = '/_host/jobs'
const body = JSON.stringify({ kind: 'seed' })

/** `signHostCall` returns header names as written (`x-host-timestamp`, …); this just guards
 * against a future casing change on either side breaking these tests for the wrong reason. */
function lowerKeys(headers) {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
}

test('verifyHostCall: ok on a request signed by signHostCall — same canonical on both sides', async () => {
  const now = 1_700_000_000_000
  const headers = lowerKeys(await signHostCall({ secret, path, body, now }))
  const result = await verifyHostCall({ secret, path, body, headers, now, seen: new Map() })
  assert.deepEqual(result, { ok: true })
})

test('verifyHostCall: the same nonce twice is a replay, not a second ok', async () => {
  const now = 1_700_000_000_000
  const headers = lowerKeys(await signHostCall({ secret, path, body, now }))
  const seen = new Map()
  assert.deepEqual(await verifyHostCall({ secret, path, body, headers, now, seen }), { ok: true })
  assert.deepEqual(await verifyHostCall({ secret, path, body, headers, now, seen }), {
    ok: false,
    why: 'replay'
  })
})

test('verifyHostCall: a timestamp five minutes off is refused as skew', async () => {
  const now = 1_700_000_000_000
  const headers = lowerKeys(await signHostCall({ secret, path, body, now }))
  const fiveMinutesLater = now + 5 * 60_000
  const result = await verifyHostCall({
    secret,
    path,
    body,
    headers,
    now: fiveMinutesLater,
    seen: new Map()
  })
  assert.deepEqual(result, { ok: false, why: 'skew' })
})

test('verifyHostCall: one changed byte in the body is refused as a signature mismatch', async () => {
  const now = 1_700_000_000_000
  const headers = lowerKeys(await signHostCall({ secret, path, body, now }))
  const tamperedBody = JSON.stringify({ kind: 'seee' }) // one byte different from what was signed
  const result = await verifyHostCall({ secret, path, body: tamperedBody, headers, now, seen: new Map() })
  assert.deepEqual(result, { ok: false, why: 'signature' })
})

test('verifyHostCall: a request with no signature headers is refused as missing, not thrown', async () => {
  const result = await verifyHostCall({ secret, path, body, headers: {}, now: Date.now(), seen: new Map() })
  assert.deepEqual(result, { ok: false, why: 'missing' })
})

test('verifyHostCall: the wrong secret is refused as a signature mismatch', async () => {
  const now = 1_700_000_000_000
  const headers = lowerKeys(await signHostCall({ secret, path, body, now }))
  const result = await verifyHostCall({ secret: 'wrong-secret', path, body, headers, now, seen: new Map() })
  assert.deepEqual(result, { ok: false, why: 'signature' })
})

test('verifyHostCall: a request signed for a different path is refused as a signature mismatch', async () => {
  const now = 1_700_000_000_000
  const headers = lowerKeys(await signHostCall({ secret, path, body, now }))
  const result = await verifyHostCall({
    secret,
    path: '/_host/jobs/other',
    body,
    headers,
    now,
    seen: new Map()
  })
  assert.deepEqual(result, { ok: false, why: 'signature' })
})
