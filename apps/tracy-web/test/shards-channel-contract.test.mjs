// apps/tracy-web/test/shards-channel-contract.test.mjs
/**
 * The signed channel between a master and its shards, as the master half relies on it
 * (docs/sre/hop-dong-cua-shard.md §1, §2). The module is the shard half's (`lib/shard-channel.js`,
 * W2); this file pins what the master calls: the real method, the path without its query, the
 * `x-shard-*` names, a 120-second window and the four reasons a call is refused.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyHostCall } from '../../tracy-host/src/auth.js'
import { sha256Hex } from '../src/lib/hmac.js'
import * as channel from '../src/lib/shard-channel.js'
import {
  SHARD_FRESHNESS_MS,
  SHARD_HEADERS,
  canonicalString,
  signShardRequest,
  verifyShardRequest
} from '../src/lib/shard-channel.js'

const SECRET = 'a'.repeat(64)
const PATH = '/api/shards/s1/events'
const BODY = JSON.stringify({
  eventId: '0'.repeat(32),
  kind: 'site.created',
  at: '2026-10-16T01:00:00Z',
  data: {}
})
const NOW = 1_760_000_000_000

test("the names and the window are the contract's, and the module exports exactly five names", () => {
  assert.deepEqual(
    { ...SHARD_HEADERS },
    {
      timestamp: 'x-shard-timestamp',
      nonce: 'x-shard-nonce',
      signature: 'x-shard-signature'
    }
  )
  // test-quality: contract hop-dong-cua-shard.md §2 fixes the 120 s window on both sides of the channel
  assert.equal(SHARD_FRESHNESS_MS, 120_000)
  assert.deepEqual(Object.keys(channel).sort(), [
    'SHARD_FRESHNESS_MS',
    'SHARD_HEADERS',
    'canonicalString',
    'signShardRequest',
    'verifyShardRequest'
  ])
})

test('the canonical string carries the real method and the path without its query, synchronously', async () => {
  const empty = await sha256Hex('')
  // No `await` on the channel's functions: the contract says they are synchronous (§2).
  assert.equal(
    canonicalString({
      timestamp: String(NOW),
      nonce: 'n1',
      method: 'get',
      path: '/_shard/status?x=1',
      body: ''
    }),
    `${NOW}\nn1\nGET\n/_shard/status\n${empty}`
  )
  assert.equal(
    canonicalString({ timestamp: String(NOW), nonce: 'n1', method: 'POST', path: PATH, body: BODY }),
    `${NOW}\nn1\nPOST\n${PATH}\n${await sha256Hex(BODY)}`
  )
})

test("a POST is the host channel's string byte for byte: tracy-host's verifier accepts it", async () => {
  const signed = signShardRequest({
    secret: SECRET,
    method: 'POST',
    path: PATH,
    body: BODY,
    now: NOW,
    nonce: 'n1'
  })
  assert.equal(typeof signed.then, 'undefined', 'signShardRequest answers headers, not a promise')
  assert.match(signed['x-shard-signature'], /^[0-9a-f]{64}$/)
  const verdict = await verifyHostCall({
    secret: SECRET,
    path: PATH,
    body: BODY,
    now: NOW,
    headers: {
      'x-host-timestamp': signed['x-shard-timestamp'],
      'x-host-nonce': signed['x-shard-nonce'],
      'x-host-signature': signed['x-shard-signature']
    }
  })
  assert.deepEqual(verdict, { ok: true })
})

test('a request verifies once with its own method; a query added on the way is not part of it', () => {
  const headers = signShardRequest({ secret: SECRET, method: 'POST', path: PATH, body: BODY, now: NOW })
  assert.match(headers['x-shard-nonce'], /^[0-9a-f]{32}$/)
  assert.equal(headers['x-shard-timestamp'], String(NOW))
  const seen = new Map()
  const verify = (over = {}) =>
    verifyShardRequest({
      secret: SECRET,
      method: 'POST',
      path: PATH,
      body: BODY,
      headers,
      now: NOW,
      seen: new Map(),
      ...over
    })
  assert.deepEqual(verify({ path: `${PATH}?retry=1`, seen }), { ok: true })
  assert.deepEqual(verify({ seen }), { ok: false, why: 'replay' })
  assert.equal(verify({ method: 'GET' }).why, 'signature')
})

test('replay is rejected when the caller keeps the nonce table', () => {
  // The master's doors keep ONE `seen` map per process (Task 12 `doors.js`): the same request twice
  // through the same map is a replay. A verifier that ignored `seen` and made its own map each call
  // — or read the table under another name — would let every replay through, silently (review
  // round 4, item 2).
  const headers = signShardRequest({ secret: SECRET, method: 'POST', path: PATH, body: BODY, now: NOW })
  const seen = new Map()
  const request = { secret: SECRET, method: 'POST', path: PATH, body: BODY, headers, now: NOW, seen }
  assert.deepEqual(verifyShardRequest(request), { ok: true })
  assert.deepEqual(verifyShardRequest(request), { ok: false, why: 'replay' })
  assert.equal(seen.size, 1, 'the nonce was written into the table the caller handed over')
  assert.ok(seen.has(headers['x-shard-nonce']), 'under the nonce itself')
  // The same request through a fresh table is not a replay: the table is the caller's memory, not the module's.
  assert.deepEqual(verifyShardRequest({ ...request, seen: new Map() }), { ok: true })
  // Without a table at all the module makes one for that call only: nothing is remembered across calls.
  assert.deepEqual(verifyShardRequest({ ...request, seen: undefined }), { ok: true })
  assert.deepEqual(verifyShardRequest({ ...request, seen: undefined }), { ok: true })
})

test('the four refusals: unknown_shard, clock, signature, replay', () => {
  const headers = signShardRequest({ secret: SECRET, method: 'POST', path: PATH, body: BODY, now: NOW })
  const why = (over) =>
    verifyShardRequest({
      secret: SECRET,
      method: 'POST',
      path: PATH,
      body: BODY,
      headers,
      now: NOW,
      seen: new Map(),
      ...over
    }).why
  assert.equal(why({ secret: null }), 'unknown_shard')
  assert.equal(why({ secret: '' }), 'unknown_shard')
  assert.equal(why({ now: NOW + 121_000 }), 'clock')
  assert.equal(why({ now: NOW - 121_000 }), 'clock')
  assert.equal(why({ path: '/api/shards/s2/events' }), 'signature')
  assert.equal(why({ body: `${BODY} ` }), 'signature')
  assert.equal(why({ secret: 'b'.repeat(64) }), 'signature')
  assert.equal(why({ headers: {} }), 'signature')
  assert.equal(why({ headers: { ...headers, 'x-shard-timestamp': 'x' } }), 'signature')
  const seen = new Map()
  assert.equal(why({ seen }), undefined, 'first time through: ok')
  assert.equal(why({ seen }), 'replay')
})
