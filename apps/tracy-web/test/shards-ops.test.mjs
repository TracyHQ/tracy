/**
 * /ops › Shards (spec §5; review amendment 8; docs/sre/hop-dong-cua-shard.md §8): read by any staff
 * seat, changed and added by owner and admin, a secret written once and never read back.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readConfig } from '../src/config.js'
import { denied } from '../src/ops/admit.js'
import { shardOpsRoutes } from '../src/shards/ops-routes.js'
import { createShardBook } from '../src/shards/store.js'
import { fileDb } from './_db.mjs'
import { MASTER_ENV, SESSION_SECRET, SHARD_SECRETS, TUNNELS, healthy, seedTestShards } from './_shards.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

function harness(pool) {
  const book = createShardBook({ pool, sessionSecret: SESSION_SECRET })
  const app = shardOpsRoutes({
    pool,
    config: readConfig(MASTER_ENV),
    book,
    // `x-test-role` absent: signed out; `none`: a session that is not staff; else that tracy_admin role.
    admit: async (c) => {
      const role = c.req.header('x-test-role')
      if (role === undefined) return 'sign-in'
      return role === 'none' ? null : { email: 'ops@tracy.test', role }
    },
    denied,
    tags: {
      read: async () => ({ appTag: 'app-0123456789ab', dshTag: 'ctx-abcdef012345', sourceCommit: 'abcdef0' })
    },
    masterHead: async () => '122-shard-master.sql',
    dnsOn: true
  })
  const call = (method, path, role, body) =>
    app.request(`https://cowork.tracy.test${path}`, {
      method,
      headers: {
        ...(role ? { 'x-test-role': role } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    })
  return { book, call }
}

test(
  'the list shows every shard with its counts and the master s tags, and never a secret',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1', 's2'])
    await healthy(pool, 's1')
    await pool.query("update shard set last_seen_at = now() - interval '5 minutes' where name = 's2'")
    await pool.query(
      "insert into directory_site (site_key, label, shard) values ('shop.tracy.test', 'shop', 's1')"
    )
    await pool.query(
      "insert into directory_email (email, shard) values ('a@tracy.test', 's1'), ('b@tracy.test', 's0')"
    )
    const res = await harness(pool).call('GET', '/api/ops/shards', 'member')
    assert.equal(res.status, 200)
    const raw = await res.text()
    for (const secret of Object.values(SHARD_SECRETS)) assert.equal(raw.includes(secret), false)
    assert.equal(raw.includes('secret'), false)
    const body = JSON.parse(raw)
    assert.equal(body.writable, false)
    assert.deepEqual(body.master, {
      appTag: 'app-0123456789ab',
      dshTag: 'ctx-abcdef012345',
      sourceCommit: 'abcdef0',
      migrationHead: '122-shard-master.sql',
      people: 1
    })
    assert.deepEqual([body.adopt, body.dns], ['everyone', true])
    const [s1, s2] = body.shards
    assert.deepEqual([s1.name, s1.sites, s1.people, s1.silent, s1.accepting], ['s1', 1, 1, false, true])
    assert.deepEqual([s2.name, s2.sites, s2.people, s2.silent, s2.accepting], ['s2', 0, 0, true, false])
    assert.equal(s1.heartbeat.mem_available_mb, 8000)
    assert.deepEqual([s1.pinned, s1.pinnedAppTag, s1.degradedUntil, s1.region], [false, null, null, 'asia'])
  }
)

test(
  'signed out goes to sign in, a non-staff session gets a bare 403, a member may read but not change',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1'])
    const { call } = harness(pool)
    const out = await call('GET', '/api/ops/shards')
    assert.equal(out.status, 302)
    assert.equal(out.headers.get('location'), '/login?next=%2Fapi%2Fops%2Fshards')
    const stranger = await call('GET', '/api/ops/shards', 'none')
    assert.equal(stranger.status, 403)
    assert.equal(await stranger.text(), '')
    const member = await call('PATCH', '/api/ops/shards/s1', 'member', { accepting: true })
    assert.deepEqual([member.status, await member.json()], [403, { code: 'FORBIDDEN' }])
  }
)

test(
  'an admin opens, pins at the running tags and points one shard at a target tag; the book sees it at once; nonsense changes nothing',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1'])
    const { book, call } = harness(pool)
    assert.equal((await book.get('s1')).accepting, false)
    const early = await call('PATCH', '/api/ops/shards/s1', 'admin', { pinned: true })
    assert.deepEqual(
      [early.status, await early.json()],
      [409, { code: 'NOTHING_TO_PIN' }],
      'no heartbeat yet: nothing runs to pin'
    )
    await pool.query('update shard set last_heartbeat = $1 where name = $2', [
      { app_tag: 'app-run000000000', dsh_tag: 'ctx-run000000000' },
      's1'
    ])
    const res = await call('PATCH', '/api/ops/shards/s1', 'admin', {
      accepting: true,
      pinned: true,
      targetAppTag: 'app-try000000000'
    })
    assert.deepEqual(await res.json(), {
      name: 's1',
      accepting: true,
      pinned: true,
      pinnedAppTag: 'app-run000000000',
      pinnedDshTag: 'ctx-run000000000',
      maxSites: 200,
      targetAppTag: 'app-try000000000',
      targetDshTag: null
    })
    assert.equal((await book.get('s1')).accepting, true)
    const unpinned = await (
      await call('PATCH', '/api/ops/shards/s1', 'owner', { pinned: false, targetAppTag: null })
    ).json()
    assert.deepEqual([unpinned.pinned, unpinned.pinnedAppTag, unpinned.targetAppTag], [false, null, null])
    for (const body of [
      {},
      { accepting: 'yes' },
      { maxSites: 0 },
      { targetDshTag: 'bad tag!' },
      { secret: 'x' },
      { pinnedAppTag: 'x' },
      [true]
    ])
      assert.equal(
        (await call('PATCH', '/api/ops/shards/s1', 'admin', body)).status,
        400,
        JSON.stringify(body)
      )
    assert.equal((await call('PATCH', '/api/ops/shards/s9', 'admin', { accepting: true })).status, 404)
  }
)

test(
  'an admin adds a shard: sealed, closed, its secret never echoed; a taken name or origin and a bad field add nothing',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1'])
    const { book, call } = harness(pool)
    const row = {
      name: 's3',
      origin: 'https://s3.tracy.test/',
      secret: SHARD_SECRETS.s3,
      tunnelId: TUNNELS.s3,
      provider: 'vultr',
      region: 'unknown'
    }
    const res = await call('POST', '/api/ops/shards', 'admin', row)
    assert.equal(res.status, 201)
    const raw = await res.text()
    assert.equal(raw.includes(SHARD_SECRETS.s3), false)
    assert.deepEqual(JSON.parse(raw), {
      name: 's3',
      origin: 'https://s3.tracy.test',
      provider: 'vultr',
      region: 'unknown',
      accepting: false
    })
    assert.equal(
      (await book.get('s3')).secret,
      SHARD_SECRETS.s3,
      'the book sees it at once, its secret opened'
    )
    assert.notEqual(
      (await pool.query("select secret_box from shard where name = 's3'")).rows[0].secret_box,
      SHARD_SECRETS.s3
    )
    assert.deepEqual(await (await call('POST', '/api/ops/shards', 'admin', row)).json(), {
      code: 'SHARD_EXISTS'
    })
    assert.equal(
      (await call('POST', '/api/ops/shards', 'admin', { ...row, name: 's4' })).status,
      409,
      'the origin is taken'
    )
    const {
      provider: _p,
      region: _r,
      ...bare
    } = {
      ...row,
      name: 's5',
      origin: 'https://s5.tracy.test',
      tunnelId: '55555555-5555-4555-8555-555555555555'
    }
    assert.deepEqual(await (await call('POST', '/api/ops/shards', 'owner', bare)).json(), {
      name: 's5',
      origin: 'https://s5.tracy.test',
      provider: null,
      region: 'unknown',
      accepting: false
    })
    for (const body of [
      { ...row, name: 's0' },
      { ...row, name: 'S6' },
      { ...row, name: 's6', origin: 'https://s6.tracy.test/app' },
      { ...row, name: 's6', origin: 'https://s6.tracy.test', secret: 'short' },
      { ...row, name: 's6', origin: 'https://s6.tracy.test', tunnelId: 'not-a-tunnel' },
      { ...row, name: 's6', origin: 'https://s6.tracy.test', region: 'mars' },
      { ...row, name: 's6', origin: 'https://s6.tracy.test', maxSites: 5 },
      [row]
    ])
      assert.equal((await call('POST', '/api/ops/shards', 'admin', body)).status, 400, JSON.stringify(body))
    assert.deepEqual([...(await book.all()).keys()].sort(), ['s1', 's3', 's5'])
    const member = await call('POST', '/api/ops/shards', 'member', {
      ...row,
      name: 's7',
      origin: 'https://s7.tracy.test'
    })
    assert.deepEqual([member.status, await member.json()], [403, { code: 'FORBIDDEN' }])
  }
)
