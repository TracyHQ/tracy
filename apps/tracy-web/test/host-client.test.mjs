import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signHostCall, hostCall, hostJob } from '../src/host/client.js'
import { signSeatCall } from '../src/workspace/seat-door.js'

const config = {
  hosts: new Map([
    [
      'contabo',
      {
        origin: 'http://127.0.0.1:8090',
        // Decoys: hostCall/hostJob must use origin+hostSecret, never these two — they belong to
        // the seat door, a completely different door with a completely different secret.
        dshOrigin: 'http://127.0.0.1:51790',
        hostSecret: 'host-secret',
        seatSecret: 'seat-secret'
      }
    ]
  ])
}

test('signHostCall agrees with signSeatCall on the same inputs — same canonical, different header names', async () => {
  const input = {
    secret: 'k',
    path: '/_host/jobs/abc',
    body: '{"a":1}',
    now: 1_700_000_000_000,
    nonce: 'n'.repeat(32)
  }
  const host = await signHostCall(input)
  const seat = await signSeatCall(input)
  assert.equal(host['x-host-timestamp'], seat['x-seat-timestamp'])
  assert.equal(host['x-host-nonce'], seat['x-seat-nonce'])
  assert.equal(host['x-host-signature'], seat['x-seat-signature'])
  assert.deepEqual(Object.keys(host).sort(), ['x-host-nonce', 'x-host-signature', 'x-host-timestamp'])
})

test('signHostCall: a different secret, path, or body changes the signature', async () => {
  const base = { secret: 'k', path: '/_host/jobs/abc', body: '{}', now: 1, nonce: 'n'.repeat(32) }
  const a = await signHostCall(base)
  const b = await signHostCall({ ...base, secret: 'other' })
  const c = await signHostCall({ ...base, path: '/_host/jobs/xyz' })
  const d = await signHostCall({ ...base, body: '{"x":1}' })
  assert.notEqual(a['x-host-signature'], b['x-host-signature'])
  assert.notEqual(a['x-host-signature'], c['x-host-signature'])
  assert.notEqual(a['x-host-signature'], d['x-host-signature'])
})

test('hostCall: POSTs to origin + /_host + path, signed with hostSecret, never dshOrigin/seatSecret', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  const result = await hostCall(config, 'contabo', '/jobs', { kind: 'seed' }, { fetchImpl })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://127.0.0.1:8090/_host/jobs')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
  assert.ok(calls[0].init.headers['x-host-signature'])
  assert.equal(calls[0].init.body, JSON.stringify({ kind: 'seed' }))

  // The signature must have been computed with hostSecret, not seatSecret.
  const expected = await signHostCall({
    secret: 'host-secret',
    path: '/_host/jobs',
    body: JSON.stringify({ kind: 'seed' }),
    now: Number(calls[0].init.headers['x-host-timestamp']),
    nonce: calls[0].init.headers['x-host-nonce']
  })
  assert.equal(calls[0].init.headers['x-host-signature'], expected['x-host-signature'])

  assert.deepEqual(result, { ok: true, status: 200, body: { ok: true } })
})

test('hostCall: two calls never reuse the same nonce', async () => {
  const nonces = []
  const fetchImpl = async (url, init) => {
    nonces.push(init.headers['x-host-nonce'])
    return new Response('{}', { status: 200 })
  }
  await hostCall(config, 'contabo', '/jobs', {}, { fetchImpl })
  await hostCall(config, 'contabo', '/jobs', {}, { fetchImpl })
  assert.notEqual(nonces[0], nonces[1])
})

test('hostJob: GETs /_host/jobs/:id with the same signing scheme, body signed as empty string', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ status: 'running' }), { status: 200 })
  }
  const result = await hostJob(config, 'contabo', 'job-1', { fetchImpl })
  assert.equal(calls[0].url, 'http://127.0.0.1:8090/_host/jobs/job-1')
  assert.equal(calls[0].init.method, 'GET')
  assert.ok(calls[0].init.headers['x-host-signature'])
  assert.equal(calls[0].init.body, undefined)

  const expected = await signHostCall({
    secret: 'host-secret',
    path: '/_host/jobs/job-1',
    body: '',
    now: Number(calls[0].init.headers['x-host-timestamp']),
    nonce: calls[0].init.headers['x-host-nonce']
  })
  assert.equal(calls[0].init.headers['x-host-signature'], expected['x-host-signature'])
  assert.deepEqual(result, { ok: true, status: 200, body: { status: 'running' } })
})

test('hostCall: an unknown host name is refused without ever calling fetch', async () => {
  const fetchImpl = async () => {
    throw new Error('must not be called')
  }
  const result = await hostCall(config, 'nowhere', '/jobs', {}, { fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.status, 0)
})

test('hostCall: a host missing its secret is refused without ever calling fetch', async () => {
  const noSecret = { hosts: new Map([['contabo', { origin: 'http://127.0.0.1:8090', hostSecret: '' }]]) }
  const fetchImpl = async () => {
    throw new Error('must not be called')
  }
  const result = await hostCall(noSecret, 'contabo', '/jobs', {}, { fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.status, 0)
})

test('hostJob: an unknown host name is refused without ever calling fetch', async () => {
  const fetchImpl = async () => {
    throw new Error('must not be called')
  }
  const result = await hostJob(config, 'nowhere', 'job-1', { fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.status, 0)
})

test('hostCall: a network error (fetch throws) comes back as a refusal, never an exception', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED')
  }
  const result = await hostCall(config, 'contabo', '/jobs', {}, { fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.status, 0)
  assert.equal(result.body, null)
})

test('hostCall: a non-2xx status with a JSON error body is passed through, not thrown', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ code: 'BUSY' }), { status: 409 })
  const result = await hostCall(config, 'contabo', '/jobs', {}, { fetchImpl })
  assert.deepEqual(result, { ok: false, status: 409, body: { code: 'BUSY' } })
})

test('hostCall: an empty response body comes back as a null body, not a thrown parse error', async () => {
  // A 204 Response can only carry a null body (the Response constructor throws on '' here) —
  // that null body is exactly the "nothing to parse" case this test is after.
  const fetchImpl = async () => new Response(null, { status: 204 })
  const result = await hostCall(config, 'contabo', '/jobs', {}, { fetchImpl })
  assert.deepEqual(result, { ok: true, status: 204, body: null })
})

test('hostCall: a non-JSON response body comes back as a null body, not a thrown parse error', async () => {
  const fetchImpl = async () => new Response('not json', { status: 200 })
  const result = await hostCall(config, 'contabo', '/jobs', {}, { fetchImpl })
  assert.deepEqual(result, { ok: true, status: 200, body: null })
})
