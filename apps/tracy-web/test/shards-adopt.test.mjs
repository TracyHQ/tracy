/**
 * The adopt round (spec §4.2, §4.3; docs/sre/hop-dong-cua-shard.md §4): who goes to which shard, with
 * what signed call, and what the master does when a shard is full or refuses. A shard here is a fake
 * that verifies the signature for real with the shard half's own verifier.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readConfig } from '../src/config.js'
import { sha256Hex } from '../src/lib/hmac.js'
import { createOpsSignal } from '../src/lib/ops-signal.js'
import { verifyShardRequest } from '../src/lib/shard-channel.js'
import { ADOPT_PATH, NONE_ALERT_WINDOW_MS, createHandoff, noneAlert } from '../src/shards/adopt-client.js'
import { placesOf, recordHome } from '../src/shards/directory.js'
import { createShardBook } from '../src/shards/store.js'
import { fileDb } from './_db.mjs'
import { MASTER_ENV, SESSION_SECRET, SHARD_SECRETS, healthy, seedTestShards } from './_shards.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const TICKET = 'T'.repeat(43)

/** Shards answering `/_shard/adopt` as `mode[name]` says: ok (default), full, broken, down, garbage, not-a-shard, mirror-conflict or bad-body. */
function shardNetwork(mode = {}) {
  const calls = []
  const fetchImpl = async (input, init) => {
    const url = new URL(String(input))
    const name = url.hostname.split('.')[0]
    const verdict = await verifyShardRequest({
      secret: SHARD_SECRETS[name],
      method: init.method,
      path: url.pathname,
      body: init.body,
      headers: init.headers,
      now: Date.now()
    })
    calls.push({ name, path: url.pathname, signed: verdict.ok, body: JSON.parse(init.body) })
    if (mode[name] === 'down') throw new TypeError('fetch failed')
    if (mode[name] === 'full') return Response.json({ code: 'SHARD_FULL' }, { status: 503 })
    if (mode[name] === 'broken') return Response.json({ code: 'INTERNAL' }, { status: 500 })
    if (mode[name] === 'garbage') return Response.json({ handoff: 'short' })
    if (mode[name] === 'not-a-shard') return Response.json({ code: 'NOT_A_SHARD' }, { status: 404 })
    if (mode[name] === 'mirror-conflict') return Response.json({ code: 'MIRROR_CONFLICT' }, { status: 409 })
    if (mode[name] === 'bad-body') return Response.json({ code: 'BAD_BODY' }, { status: 400 })
    return Response.json({
      accountId: 'mirror-1',
      handoff: TICKET,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    })
  }
  return { calls, fetchImpl }
}

function harness(pool, net, env = {}) {
  const alerts = []
  const signal = {
    record: async (kind, input) => {
      alerts.push({ kind, ...input })
      return {}
    }
  }
  const book = createShardBook({ pool, sessionSecret: SESSION_SECRET })
  const config = readConfig({ ...MASTER_ENV, ...env })
  return { alerts, handoff: createHandoff({ pool, book, config, signal, fetchImpl: net.fetchImpl }) }
}

const person = (pool, email) =>
  pool.query("insert into account (email, display_name, language) values ($1, 'Mai', 'vi') returning id", [
    email
  ])
const shardsOf = async (pool, email) => (await placesOf(pool, email)).map((place) => place.shard)

async function twoHealthyShards(pool) {
  await seedTestShards(pool)
  await healthy(pool, 's1')
  await healthy(pool, 's2', { sites: 100 })
}

test(
  'a new person goes to the emptiest shard by a signed call that carries the nonce hash and next, never the nonce',
  opts,
  async () => {
    const { pool } = db
    await twoHealthyShards(pool)
    const accountId = (await person(pool, 'new@tracy.test')).rows[0].id
    const net = shardNetwork()
    const decision = await harness(pool, net).handoff.handoffFor({
      email: 'new@tracy.test',
      nextPath: '/new/'
    })
    assert.equal(decision.kind, 'handoff')
    assert.equal(decision.shard.name, 's1')
    assert.equal(
      decision.url,
      `https://s1.tracy.test/handoff?t=${TICKET}`,
      'next rides in the adopt body, never in the URL'
    )
    assert.match(decision.nonce, /^[0-9a-f]{32}$/)
    assert.equal(net.calls.length, 1)
    assert.equal(net.calls[0].path, ADOPT_PATH)
    assert.equal(net.calls[0].signed, true)
    assert.deepEqual(net.calls[0].body, {
      email: 'new@tracy.test',
      displayName: 'Mai',
      locale: 'vi',
      source: 'master',
      idempotencyKey: accountId,
      nonceHash: await sha256Hex(decision.nonce),
      next: '/new/'
    })
    assert.equal(JSON.stringify(net.calls[0].body).includes(decision.nonce), false)
    assert.deepEqual(await shardsOf(pool, 'new@tracy.test'), ['s1'])
  }
)

test('without a next the body carries none, and the shard opens its own default', opts, async () => {
  const { pool } = db
  await twoHealthyShards(pool)
  await person(pool, 'new@tracy.test')
  const net = shardNetwork()
  await harness(pool, net).handoff.handoffFor({ email: 'new@tracy.test' })
  assert.equal(Object.hasOwn(net.calls[0].body, 'next'), false)
})

test('the shard the pointer named wins for a new person while it may still take people', opts, async () => {
  const { pool } = db
  await twoHealthyShards(pool)
  await person(pool, 'new@tracy.test')
  const decision = await harness(pool, shardNetwork()).handoff.handoffFor({
    email: 'new@tracy.test',
    wanted: 's2'
  })
  assert.equal(decision.shard.name, 's2')
})

test(
  'a full shard is passed for the next one once, without being marked degraded or told',
  opts,
  async () => {
    const { pool } = db
    await twoHealthyShards(pool)
    await person(pool, 'new@tracy.test')
    const net = shardNetwork({ s1: 'full' })
    const { alerts, handoff } = harness(pool, net)
    const decision = await handoff.handoffFor({ email: 'new@tracy.test' })
    assert.equal(decision.shard.name, 's2')
    assert.deepEqual(
      net.calls.map((call) => call.name),
      ['s1', 's2']
    )
    assert.equal(
      (await pool.query("select degraded_until from shard where name = 's1'")).rows[0].degraded_until,
      null
    )
    assert.deepEqual(alerts, [])
    assert.deepEqual(await shardsOf(pool, 'new@tracy.test'), ['s2'])
  }
)

test(
  'a shard that fails otherwise is marked degraded and the next one takes the person: one retry',
  opts,
  async () => {
    const { pool } = db
    await twoHealthyShards(pool)
    await person(pool, 'new@tracy.test')
    const net = shardNetwork({ s1: 'broken' })
    const { alerts, handoff } = harness(pool, net)
    const decision = await handoff.handoffFor({ email: 'new@tracy.test' })
    assert.equal(decision.shard.name, 's2')
    assert.deepEqual(
      net.calls.map((call) => call.name),
      ['s1', 's2']
    )
    const until = (await pool.query("select degraded_until from shard where name = 's1'")).rows[0]
      .degraded_until
    assert.ok(until.getTime() > Date.now(), 'passed over until a later moment')
    assert.deepEqual(
      alerts.map((a) => [a.kind, a.data]),
      [['shard.degraded', { shard: 's1', status: 500 }]]
    )
    assert.deepEqual(await shardsOf(pool, 'new@tracy.test'), ['s2'])
  }
)

test(
  'NOT_A_SHARD, MIRROR_CONFLICT and BAD_BODY end the round: no other shard is asked, nothing is marked degraded, and shard.adopt_failed names the shard and the code',
  opts,
  async () => {
    const { pool } = db
    await twoHealthyShards(pool)
    await person(pool, 'new@tracy.test')
    for (const [mode, code] of [
      ['mirror-conflict', 'MIRROR_CONFLICT'],
      ['not-a-shard', 'NOT_A_SHARD'],
      ['bad-body', 'BAD_BODY']
    ]) {
      const net = shardNetwork({ s1: mode })
      const { alerts, handoff } = harness(pool, net)
      assert.deepEqual(await handoff.handoffFor({ email: 'new@tracy.test' }), { kind: 'none' }, mode)
      assert.deepEqual(
        net.calls.map((call) => call.name),
        ['s1'],
        `${mode}: the next shard is not tried`
      )
      assert.equal(
        (await pool.query("select degraded_until from shard where name = 's1'")).rows[0].degraded_until,
        null,
        `${mode}: not degraded`
      )
      assert.deepEqual(
        alerts.map((a) => [a.kind, a.data]),
        [
          ['shard.adopt_failed', { shard: 's1', code }],
          ['shard.none', { reason: 'ADOPT_FAILED' }]
        ],
        mode
      )
      assert.equal(
        JSON.stringify(alerts).includes('new@tracy.test'),
        false,
        `${mode}: no address in any alert`
      )
      assert.deepEqual(await shardsOf(pool, 'new@tracy.test'), [], `${mode}: nothing written`)
    }
    // Somebody who already lives on that shard is told it is unavailable, and is never moved.
    await person(pool, 'old@tracy.test')
    await recordHome(pool, 'old@tracy.test', 's1')
    const net = shardNetwork({ s1: 'not-a-shard' })
    const { alerts, handoff } = harness(pool, net)
    assert.deepEqual(await handoff.handoffFor({ email: 'old@tracy.test' }), {
      kind: 'unavailable',
      shard: 's1'
    })
    assert.deepEqual(
      alerts.map((a) => a.kind),
      ['shard.adopt_failed']
    )
    assert.deepEqual(await shardsOf(pool, 'old@tracy.test'), ['s1'])
  }
)

test(
  'when both refuse, nobody takes the person: no row, no place here either, and the ops topic hears it',
  opts,
  async () => {
    const { pool } = db
    await twoHealthyShards(pool)
    await person(pool, 'new@tracy.test')
    const { alerts, handoff } = harness(pool, shardNetwork({ s1: 'down', s2: 'garbage' }))
    assert.deepEqual(await handoff.handoffFor({ email: 'new@tracy.test' }), { kind: 'none' })
    assert.deepEqual(
      alerts.map((a) => a.kind),
      ['shard.degraded', 'shard.degraded', 'shard.none']
    )
    assert.deepEqual(alerts[2].data, { reason: 'ADOPT_FAILED' })
    assert.deepEqual(await shardsOf(pool, 'new@tracy.test'), [])
  }
)

test(
  'shards in the table but none fit to take anybody: the person is refused and the reason says so',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool)
    await person(pool, 'new@tracy.test')
    const net = shardNetwork()
    const { alerts, handoff } = harness(pool, net)
    assert.deepEqual(await handoff.handoffFor({ email: 'new@tracy.test' }), { kind: 'none' })
    assert.equal(net.calls.length, 0)
    assert.deepEqual(
      alerts.map((a) => [a.kind, a.data]),
      [['shard.none', { reason: 'NO_ELIGIBLE_SHARD' }]]
    )
    assert.deepEqual(await shardsOf(pool, 'new@tracy.test'), [])
  }
)

test(
  'with no shard in the table the master is still the only place: nothing is refused, nothing is told',
  opts,
  async () => {
    const { pool } = db
    await person(pool, 'new@tracy.test')
    const net = shardNetwork()
    const { alerts, handoff } = harness(pool, net)
    assert.deepEqual(await handoff.handoffFor({ email: 'new@tracy.test' }), { kind: 'master' })
    assert.equal(net.calls.length, 0)
    assert.deepEqual(alerts, [])
  }
)

test('shard.none is told once per quarter hour, whatever its reason', async () => {
  const T = Date.parse('2026-10-20T03:00:00Z')
  assert.equal(
    noneAlert('NO_ELIGIBLE_SHARD', T).dedupeKey,
    noneAlert('ADOPT_FAILED', T + 14 * 60_000).dedupeKey
  )
  assert.notEqual(
    noneAlert('NO_ELIGIBLE_SHARD', T).dedupeKey,
    noneAlert('NO_ELIGIBLE_SHARD', T + NONE_ALERT_WINDOW_MS).dedupeKey
  )
  assert.deepEqual(noneAlert('ADOPT_FAILED', T).data, { reason: 'ADOPT_FAILED' })
  let now = T
  const signal = createOpsSignal({
    pool: null,
    config: { environment: 'dev' },
    log: { warn() {} },
    now: () => now
  })
  assert.ok(await signal.record('shard.none', noneAlert('NO_ELIGIBLE_SHARD', now)))
  now += 5 * 60_000
  assert.equal(
    await signal.record('shard.none', noneAlert('ADOPT_FAILED', now)),
    null,
    'the same quarter hour is one alert'
  )
  now += 10 * 60_000
  assert.ok(
    await signal.record('shard.none', noneAlert('NO_ELIGIBLE_SHARD', now)),
    'the next quarter hour is told again'
  )
})

test('somebody who lives on a shard that does not answer is never moved', opts, async () => {
  const { pool } = db
  await twoHealthyShards(pool)
  await person(pool, 'old@tracy.test')
  await recordHome(pool, 'old@tracy.test', 's1')
  const net = shardNetwork({ s1: 'down' })
  assert.deepEqual(await harness(pool, net).handoff.handoffFor({ email: 'old@tracy.test' }), {
    kind: 'unavailable',
    shard: 's1'
  })
  assert.deepEqual(
    net.calls.map((call) => call.name),
    ['s1']
  )
  assert.deepEqual(await shardsOf(pool, 'old@tracy.test'), ['s1'])
})

test(
  'an s0 person stays here whatever the pointer says, but a shard they were invited onto hands them over',
  opts,
  async () => {
    const { pool } = db
    await twoHealthyShards(pool)
    await person(pool, 'legacy@tracy.test')
    await recordHome(pool, 'legacy@tracy.test', 's0')
    const net = shardNetwork()
    const { handoff } = harness(pool, net)
    assert.deepEqual(await handoff.handoffFor({ email: 'legacy@tracy.test', wanted: 's1' }), {
      kind: 'master'
    })
    assert.equal(net.calls.length, 0)
    await recordHome(pool, 'legacy@tracy.test', 's2')
    assert.equal((await handoff.handoffFor({ email: 'legacy@tracy.test', wanted: 's2' })).shard.name, 's2')
    assert.deepEqual(await handoff.handoffFor({ email: 'legacy@tracy.test' }), { kind: 'master' })
  }
)

test('a closed gate and an unknown account both stay here without calling any shard', opts, async () => {
  const { pool } = db
  await twoHealthyShards(pool)
  await person(pool, 'new@tracy.test')
  const net = shardNetwork()
  const closed = harness(pool, net, { SHARD_ADOPT_ALLOW: '' })
  assert.deepEqual(await closed.handoff.handoffFor({ email: 'new@tracy.test' }), { kind: 'master' })
  assert.deepEqual(await harness(pool, net).handoff.handoffFor({ email: 'ghost@tracy.test' }), {
    kind: 'master'
  })
  assert.equal(net.calls.length, 0)
})

test(
  'a fresh start for somebody whose shard takes nobody new adopts them on another shard and keeps both places',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1', 's2', 's3'])
    await healthy(pool, 's1', { accepting: false })
    await healthy(pool, 's2')
    await healthy(pool, 's3', { sites: 150 })
    await person(pool, 'full@tracy.test')
    await recordHome(pool, 'full@tracy.test', 's1')
    const net = shardNetwork()
    const decision = await harness(pool, net, { SHARD_ADOPT_ALLOW: '' }).handoff.handoffFor({
      email: 'full@tracy.test',
      fresh: true,
      nextPath: '/new/'
    })
    assert.equal(decision.kind, 'handoff', 'somebody already on a shard is not held back by the adopt gate')
    assert.equal(decision.shard.name, 's2')
    assert.deepEqual(
      net.calls.map((call) => [call.name, call.body.next]),
      [['s2', '/new/']]
    )
    assert.deepEqual((await shardsOf(pool, 'full@tracy.test')).sort(), ['s1', 's2'])
    const again = shardNetwork()
    assert.equal(
      (await harness(pool, again).handoff.handoffFor({ email: 'full@tracy.test', fresh: true })).shard.name,
      's2'
    )
    assert.deepEqual(
      again.calls.map((call) => call.name),
      ['s2'],
      'a stale fresh=1 goes to the shard that still takes them'
    )
  }
)

test(
  'a fresh start with no other shard able to take them is refused: no new row, their place kept, and the ops topic hears it',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1'])
    await healthy(pool, 's1', { accepting: false })
    await person(pool, 'full@tracy.test')
    await recordHome(pool, 'full@tracy.test', 's1')
    const net = shardNetwork()
    const { alerts, handoff } = harness(pool, net)
    assert.deepEqual(await handoff.handoffFor({ email: 'full@tracy.test', fresh: true }), { kind: 'none' })
    assert.equal(net.calls.length, 0, 'their full shard is not asked, and there is no other')
    assert.deepEqual(
      alerts.map((a) => [a.kind, a.data]),
      [['shard.none', { reason: 'NO_ELIGIBLE_SHARD' }]]
    )
    assert.deepEqual(await shardsOf(pool, 'full@tracy.test'), ['s1'], 'their sites stay where they are')
  }
)
