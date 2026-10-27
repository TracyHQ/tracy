/**
 * The `shard` table and the six tables of the master's directory (migration 122-shard-master):
 * seeding from SHARDS, adding from /ops, the sealed secret, the per-process book, and the backfill
 * that keeps everyone who existed before shards on this master (s0).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { migrate } from '../src/db/index.js'
import {
  addShard,
  createShardBook,
  markDegraded,
  readShards,
  seedShards,
  updateShard
} from '../src/shards/store.js'
import { fileDb, scratchPool } from './_db.mjs'
import { SESSION_SECRET, SHARD_SECRETS, TUNNELS, seedTestShards } from './_shards.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const MIGRATIONS = new URL('../src/db/migrations/', import.meta.url).pathname

test(
  'the seed writes a shard sealed, keeps what it is in step with SHARDS, and never what /ops decided',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1'])
    const row = (await pool.query('select * from shard where name = $1', ['s1'])).rows[0]
    assert.notEqual(row.secret_box, SHARD_SECRETS.s1, 'the secret is sealed, never stored as typed')
    assert.equal(row.accepting, false, 'a seeded shard takes nobody until /ops opens it')
    await updateShard(pool, 's1', { accepting: true, maxSites: 50 })
    const rotated = await seedShards(
      pool,
      [
        {
          name: 's1',
          origin: 'https://s1.tracy.test',
          secret: 'd'.repeat(64),
          tunnelId: row.tunnel_id,
          maxSites: 999
        }
      ],
      SESSION_SECRET
    )
    assert.equal(rotated, 1)
    const shard = (await readShards(pool, SESSION_SECRET)).get('s1')
    assert.equal(shard.secret, 'd'.repeat(64), 'a rotated SHARD_s1_SECRET takes effect at the next boot')
    assert.equal(shard.region, 'unknown', 'a seed without a region is the region unknown')
    assert.equal(shard.accepting, true)
    assert.equal(shard.maxSites, 50, 'the limit /ops set stays')
  }
)

test(
  '/ops adds a shard sealed and closed; a taken name or origin adds nothing; a later seed of that name wins',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1'])
    const row = {
      name: 's3',
      origin: 'https://s3.tracy.test',
      secret: SHARD_SECRETS.s3,
      tunnelId: TUNNELS.s3,
      provider: 'vultr',
      region: 'unknown'
    }
    assert.equal(await addShard(pool, row, SESSION_SECRET), true)
    const stored = (await pool.query("select * from shard where name = 's3'")).rows[0]
    assert.notEqual(stored.secret_box, SHARD_SECRETS.s3)
    assert.equal(stored.accepting, false)
    assert.equal(
      await addShard(pool, { ...row, origin: 'https://s3b.tracy.test' }, SESSION_SECRET),
      false,
      'the name is taken'
    )
    assert.equal(await addShard(pool, { ...row, name: 's4' }, SESSION_SECRET), false, 'the origin is taken')
    assert.equal((await readShards(pool, SESSION_SECRET)).get('s3').secret, SHARD_SECRETS.s3)
    await seedShards(pool, [{ ...row, secret: 'e'.repeat(64), region: 'europe' }], SESSION_SECRET)
    const seeded = (await readShards(pool, SESSION_SECRET)).get('s3')
    assert.deepEqual(
      [seeded.secret, seeded.region],
      ['e'.repeat(64), 'europe'],
      'env wins for the seeded columns'
    )
  }
)

test('a secret sealed under another SESSION_SECRET reads as no secret, not as a crash', opts, async () => {
  const { pool } = db
  await seedTestShards(pool, ['s1'])
  const shard = (await readShards(pool, 'x'.repeat(32))).get('s1')
  assert.equal(shard.secret, null)
  assert.equal(shard.origin, 'https://s1.tracy.test')
})

test('the book answers from memory for its ttl, by name and by origin, until invalidated', opts, async () => {
  const { pool } = db
  await seedTestShards(pool, ['s1'])
  let t = 1_000
  const book = createShardBook({ pool, sessionSecret: SESSION_SECRET, ttlMs: 30_000, now: () => t })
  assert.equal((await book.get('s1')).name, 's1')
  await seedTestShards(pool, ['s2'])
  assert.equal(await book.get('s2'), null, 'still the first read')
  t += 31_000
  assert.equal((await book.byOrigin('https://s2.tracy.test')).name, 's2')
  await pool.query("update shard set origin = 'https://s2b.tracy.test' where name = 's2'")
  book.invalidate()
  assert.equal(await book.byOrigin('https://s2.tracy.test'), null)
  assert.equal(await book.get(undefined), null)
})

test(
  'updateShard writes only the named columns, a null clears a tag, markDegraded sets until when',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1'])
    const row = await updateShard(pool, 's1', { accepting: true, targetAppTag: 'app-0123456789ab' })
    assert.equal(row.accepting, true)
    assert.equal(row.target_app_tag, 'app-0123456789ab')
    assert.equal(row.pinned_app_tag, null)
    const pinned = await updateShard(pool, 's1', {
      pinnedAppTag: 'app-old000000000',
      pinnedDshTag: 'ctx-old000000000'
    })
    assert.equal((await readShards(pool, SESSION_SECRET)).get('s1').pinned, true)
    assert.equal(pinned.pinned_dsh_tag, 'ctx-old000000000')
    assert.equal((await updateShard(pool, 's1', { targetAppTag: null })).target_app_tag, null)
    assert.equal(await updateShard(pool, 's1', {}), null)
    assert.equal(
      await updateShard(pool, 's1', { pinned: true }),
      null,
      'pinned is not a column: the tags are'
    )
    assert.equal(await updateShard(pool, 'nope', { accepting: true }), null)
    const until = new Date('2026-10-20T03:00:00Z')
    await markDegraded(pool, 's1', until)
    assert.deepEqual((await readShards(pool, SESSION_SECRET)).get('s1').degradedUntil, until)
  }
)

test('the migration files every account that existed before it under this master (s0)', opts, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shard-migration-'))
  const scratch = await scratchPool()
  try {
    const lockId = createHash('sha256').update(scratch.url).digest().readUInt32BE(0)
    for (const name of readdirSync(MIGRATIONS).filter(
      (f) => f.endsWith('.sql') && f < '122-shard-master.sql'
    ))
      cpSync(join(MIGRATIONS, name), join(dir, name))
    await migrate(scratch.pool, dir, { lockId })
    await scratch.pool.query("insert into account (email) values ('before@tracy.test')")
    cpSync(join(MIGRATIONS, '122-shard-master.sql'), join(dir, '122-shard-master.sql'))
    await migrate(scratch.pool, dir, { lockId })
    const { rows } = await scratch.pool.query('select email, shard, source from directory_email')
    assert.deepEqual(rows, [{ email: 'before@tracy.test', shard: 's0', source: 'master' }])
  } finally {
    await scratch.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
