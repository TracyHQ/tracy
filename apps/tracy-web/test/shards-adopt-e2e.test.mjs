/**
 * The adopt round end to end (review C1): the master's adopt client talks to a REAL shard door —
 * `buildApp` as a shard — through `fetchImpl`, for a person who has neither a display name nor a
 * language (email-code sign-ups). Before the fix the shard answered 400 BAD_BODY, the master read it
 * as a broken shard and marked it degraded, and the next shard failed the same way.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { pgIdentityStore } from '../src/identity/store.js'
import { createHandoff } from '../src/shards/adopt-client.js'
import { placesOf } from '../src/shards/directory.js'
import { createShardBook } from '../src/shards/store.js'
import { fileDb } from './_db.mjs'
import { MASTER_ENV, SESSION_SECRET, SHARD_SECRETS, healthy, seedTestShards } from './_shards.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

/** A shard `s1` on `https://s1.tracy.test` answering from its own app, in the database the test shares with the master. */
function shardApp() {
  return buildApp({
    config: readConfig({
      TRACY_ORIGIN: 'https://s1.tracy.test',
      SITE_DOMAIN: 'tracy.test',
      SESSION_DOMAIN: 'tracy.test',
      SESSION_SECRET: 'x'.repeat(32),
      HOSTS: 's1',
      HOST_NAME: 's1',
      HOST_s1_ORIGIN: 'http://host',
      HOST_s1_DSH_ORIGIN: 'http://dsh',
      HOST_s1_SECRET: 'h',
      SEAT_s1_SECRET: 'k',
      TRACY_DEPLOYMENT_ROLE: 'shard',
      MASTER_ORIGIN: 'https://cowork.tracy.test',
      SHARD_SECRET: SHARD_SECRETS.s1,
      SESSION_COOKIE_NAME: 'tracy_sess_s1'
    }),
    pool: db.pool,
    identity: pgIdentityStore(db.pool),
    mail: { send: async () => {} }
  })
}

test(
  'a person with no display name and no language is adopted by a real shard door, and nothing is marked degraded',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1'])
    await healthy(pool, 's1')
    await pool.query(
      "insert into quickstart_releases (tag, release, tracy) values ('test/none', '{}', 'no-setting')"
    )
    const shard = shardApp()
    const answers = []
    const fetchImpl = async (input, init) => {
      const res = await shard.fetch(new Request(String(input), init))
      answers.push(res.status)
      return res
    }
    const handoff = createHandoff({
      pool,
      book: createShardBook({ pool, sessionSecret: SESSION_SECRET }),
      config: readConfig(MASTER_ENV),
      fetchImpl
    })
    // `account.display_name` and `account.language` are null: what an email-code sign-up leaves.
    await pool.query("insert into account (email) values ('bare@tracy.test')")
    const decision = await handoff.handoffFor({ email: 'bare@tracy.test', nextPath: '/new/' })
    assert.deepEqual(answers, [200], 'the shard took the person')
    assert.equal(decision.kind, 'handoff')
    assert.equal(decision.shard.name, 's1')
    assert.match(decision.url, /^https:\/\/s1\.tracy\.test\/handoff\?t=[A-Za-z0-9_-]{43}$/)
    assert.deepEqual(
      (await placesOf(pool, 'bare@tracy.test')).map((place) => place.shard),
      ['s1']
    )
    assert.equal(
      (await pool.query("select degraded_until from shard where name = 's1'")).rows[0].degraded_until,
      null,
      'a person with an empty profile is no reason to pass a shard over'
    )
  }
)
