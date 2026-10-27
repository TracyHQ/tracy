import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { pgIdentityStore } from '../src/identity/store.js'
import { signShardRequest } from '../src/lib/shard-channel.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const SECRET = 'ab'.repeat(32)
const at = Date.now()
const env = {
  TRACY_ORIGIN: 'https://s2.tracy.ai',
  SITE_DOMAIN: 'tracy.ai',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 's2',
  HOST_NAME: 's2',
  HOST_s2_ORIGIN: 'http://host',
  HOST_s2_DSH_ORIGIN: 'http://dsh',
  HOST_s2_SECRET: 'h',
  SEAT_s2_SECRET: 'k',
  TRACY_DEPLOYMENT_ROLE: 'shard',
  MASTER_ORIGIN: 'https://cowork.tracy.ai',
  SHARD_SECRET: SECRET,
  SESSION_COOKIE_NAME: 'tracy_sess_s2'
}

test(
  'the heartbeat reads sites, catalogue read time, migration head and accepting, signed as a GET',
  opts,
  async () => {
    const app = buildApp({
      config: readConfig(env),
      pool: db.pool,
      identity: pgIdentityStore(db.pool),
      mail: { send: async () => {} },
      now: () => at
    })
    const unsigned = await app.fetch(new Request('http://127.0.0.1:51710/_shard/status'))
    assert.deepEqual(
      [unsigned.status, await unsigned.json()],
      [403, { code: 'SIGNATURE_INVALID', why: 'signature' }]
    )
    const asPost = signShardRequest({
      secret: SECRET,
      method: 'POST',
      path: '/_shard/status',
      body: '',
      now: at
    })
    assert.equal(
      (await app.fetch(new Request('http://127.0.0.1:51710/_shard/status', { headers: asPost }))).status,
      403,
      'the method is signed'
    )
    const headers = signShardRequest({
      secret: SECRET,
      method: 'GET',
      path: '/_shard/status',
      body: '',
      now: at
    })
    const res = await app.fetch(new Request('http://127.0.0.1:51710/_shard/status', { headers }))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(Object.keys(body).sort(), ['accepting', 'migration_head', 'releases_read_at', 'sites'])
    assert.equal(body.accepting, false)
    assert.equal(body.releases_read_at, null)
    const names = (await db.pool.query('select name from schema_migration')).rows.map((r) => r.name)
    assert.equal(body.migration_head, [...names].sort().at(-1), 'JavaScript string order, not SQL max()')
    assert.match(body.migration_head, /^\d{3}-.+\.sql$/)
    const late = signShardRequest({
      secret: SECRET,
      method: 'GET',
      path: '/_shard/status',
      body: '',
      now: at - 121_000
    })
    assert.equal(
      (await (await app.fetch(new Request('http://127.0.0.1:51710/_shard/status', { headers: late }))).json())
        .why,
      'clock'
    )
  }
)

test('the heartbeat’s shell signature (W3) is the same as signShardRequest for GET /_shard/status', {
  skip: spawnSync('openssl', ['version']).status === 0 ? false : 'no openssl on this machine'
}, () => {
  const script =
    `printf '%s\\n%s\\nGET\\n%s\\n%s' "$TS" "$NONCE" /_shard/status ` +
    `"$(printf '' | openssl dgst -sha256 -hex | sed 's/^.* //')" ` +
    `| openssl dgst -sha256 -hmac "$SHARD_SECRET" -hex | sed 's/^.* //'`
  const NONCE = '0123456789abcdef0123456789abcdef'
  const out = spawnSync('bash', ['-c', script], {
    env: { ...process.env, TS: String(at), NONCE, SHARD_SECRET: SECRET },
    encoding: 'utf8'
  })
  const js = signShardRequest({
    secret: SECRET,
    method: 'GET',
    path: '/_shard/status',
    body: '',
    now: at,
    nonce: NONCE
  })
  assert.equal(out.stdout.trim(), js['x-shard-signature'])
})
