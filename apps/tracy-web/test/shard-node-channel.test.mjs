// apps/tracy-web/test/shard-node-channel.test.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { signHostCall } from '../src/host/client.js'
import * as channel from '../src/lib/shard-channel.js'
import {
  SHARD_FRESHNESS_MS,
  SHARD_HEADERS,
  canonicalString,
  signShardRequest,
  verifyShardRequest
} from '../src/lib/shard-channel.js'

const secret = 'ab'.repeat(32) // the shape of `openssl rand -hex 32`
const at = 1_760_000_000_000
const body = JSON.stringify({ email: 'a@b.c' })
const N1 = `${'0'.repeat(31)}1`
const EMPTY_SHA256 = createHash('sha256').update('').digest('hex')

test('the module answers exactly the five names of the contract, and the three functions are synchronous', () => {
  assert.deepEqual(Object.keys(channel).sort(), [
    'SHARD_FRESHNESS_MS',
    'SHARD_HEADERS',
    'canonicalString',
    'signShardRequest',
    'verifyShardRequest'
  ])
  assert.deepEqual(
    { ...SHARD_HEADERS },
    { timestamp: 'x-shard-timestamp', nonce: 'x-shard-nonce', signature: 'x-shard-signature' }
  )
  // test-quality: contract hop-dong-cua-shard.md §2 fixes the 120 s window on both sides of the channel
  assert.equal(SHARD_FRESHNESS_MS, 120_000)
  // W1 may `await` these; a Promise here would hide a wrong string until runtime on the master.
  assert.equal(
    typeof canonicalString({ timestamp: '1', nonce: N1, method: 'GET', path: '/x', body: '' }),
    'string'
  )
  assert.equal(
    typeof signShardRequest({ secret, method: 'GET', path: '/x', body: '' })['x-shard-signature'],
    'string'
  )
  assert.equal(verifyShardRequest({ secret, headers: {}, method: 'GET', path: '/x', body: '' }).ok, false)
})

test('the canonical string: timestamp, nonce, the real method, the path without its query, the body hash', () => {
  assert.equal(
    canonicalString({ timestamp: '1', nonce: N1, method: 'get', path: '/_shard/status?x=1', body: '' }),
    `1\n${N1}\nGET\n/_shard/status\n${EMPTY_SHA256}`
  )
})

test('a POST signs byte for byte like the tracy-host channel, under x-shard-* names; a GET does not', async () => {
  const shard = signShardRequest({ secret, method: 'POST', path: '/_shard/adopt', body, now: at, nonce: N1 })
  const host = await signHostCall({ secret, path: '/_shard/adopt', body, now: at, nonce: N1 })
  assert.deepEqual(shard, {
    'x-shard-timestamp': host['x-host-timestamp'],
    'x-shard-nonce': N1,
    'x-shard-signature': host['x-host-signature']
  })
  const get = signShardRequest({ secret, method: 'GET', path: '/_shard/adopt', body, now: at, nonce: N1 })
  assert.notEqual(get['x-shard-signature'], shard['x-shard-signature'], 'the method is signed')
  assert.match(
    signShardRequest({ secret, method: 'POST', path: '/x', body: '' })['x-shard-nonce'],
    /^[0-9a-f]{32}$/
  )
})

test('a signed request verifies once; replay, clock and every other change say why', () => {
  const headers = signShardRequest({ secret, method: 'POST', path: '/_shard/adopt', body, now: at })
  const call = { secret, headers, method: 'POST', path: '/_shard/adopt', body, now: at }
  // The caller owns the replay table (`seen`): the same Map across two calls is what refuses the second.
  const seen = new Map()
  assert.deepEqual(verifyShardRequest({ ...call, seen }), { ok: true })
  assert.deepEqual(verifyShardRequest({ ...call, seen }), { ok: false, why: 'replay' })
  assert.deepEqual(
    verifyShardRequest({ ...call, seen: new Map() }),
    { ok: true },
    'a fresh table forgets: that is why the caller keeps it'
  )
  const verdict = (over) => verifyShardRequest({ ...call, seen: new Map(), ...over })
  assert.deepEqual(
    verdict({ headers: new Headers(headers) }),
    { ok: true },
    'a Headers object reads the same'
  )
  assert.deepEqual(verdict({ path: '/_shard/adopt?ignored=1' }), { ok: true }, 'the query is never signed')
  assert.equal(verdict({ path: '/_shard/status' }).why, 'signature')
  assert.equal(verdict({ method: 'GET' }).why, 'signature')
  assert.equal(verdict({ body: '{}' }).why, 'signature')
  assert.equal(verdict({ secret: 'cd'.repeat(32) }).why, 'signature')
  assert.equal(verdict({ headers: {} }).why, 'signature')
  assert.equal(
    verdict({ headers: { ...headers, 'x-shard-nonce': 'n1' } }).why,
    'signature',
    'a nonce is 32 hex'
  )
  assert.equal(verdict({ headers: { ...headers, 'x-shard-timestamp': 'x' } }).why, 'signature')
  assert.equal(verdict({ now: at + 121_000 }).why, 'clock')
  assert.equal(verdict({ now: at - 121_000 }).why, 'clock')
})

test('a nonce is remembered to the end of ITS OWN window: a signer whose clock runs ahead cannot replay it', () => {
  // The signer's clock is 100 s ahead; the request is fresh (|now - ts| = 100 s <= 120 s) and its
  // window runs to ts + 120 s = at + 220 s. Remembering it to `now + 120 s` = at + 120 s would let a
  // replay at at + 150 s through (still inside the window, no longer in the table).
  const ahead = at + 100_000
  const headers = signShardRequest({ secret, method: 'POST', path: '/_shard/adopt', body, now: ahead })
  const call = { secret, headers, method: 'POST', path: '/_shard/adopt', body }
  const seen = new Map()
  assert.deepEqual(verifyShardRequest({ ...call, now: at, seen }), { ok: true })
  assert.deepEqual(verifyShardRequest({ ...call, now: at + 150_000, seen }), { ok: false, why: 'replay' })
  assert.equal(seen.get(headers['x-shard-nonce']), ahead + SHARD_FRESHNESS_MS)
  // Past its own window it is `clock` anyway, and the table forgets it.
  assert.equal(verifyShardRequest({ ...call, now: ahead + 121_000, seen }).why, 'clock')
})

test('no secret is unknown_shard, read before anything else, and the nonce is not remembered', () => {
  const headers = signShardRequest({ secret, method: 'POST', path: '/_shard/adopt', body, now: at })
  const call = { headers, method: 'POST', path: '/_shard/adopt', body, now: at }
  const seen = new Map()
  // On the master this is "no row in the `shard` table for that name" (contract §2): dead, not a retry.
  assert.deepEqual(verifyShardRequest({ ...call, secret: null, seen }), { ok: false, why: 'unknown_shard' })
  assert.deepEqual(verifyShardRequest({ ...call, secret: '', seen }), { ok: false, why: 'unknown_shard' })
  assert.deepEqual(verifyShardRequest({ ...call, secret: undefined, seen }), {
    ok: false,
    why: 'unknown_shard'
  })
  // Even with no headers at all, or a stale timestamp: the missing secret is said first.
  assert.equal(verifyShardRequest({ ...call, secret: null, headers: {}, seen }).why, 'unknown_shard')
  assert.equal(verifyShardRequest({ ...call, secret: '', now: at + 121_000, seen }).why, 'unknown_shard')
  assert.equal(seen.size, 0, 'a refused call never fills the replay table')
  assert.deepEqual(verifyShardRequest({ ...call, secret, seen }), { ok: true })
})
