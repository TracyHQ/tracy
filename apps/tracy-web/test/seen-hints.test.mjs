import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const config = readConfig({
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

async function call(email, method = 'GET', body, headers = {}) {
  const app = buildApp({ config, pool: db.pool, mail: { send: async () => {} } })
  const all = Object.fromEntries(
    Object.entries({ 'sec-fetch-site': 'same-origin', ...headers }).filter(([, value]) => value !== undefined)
  )
  if (email) all.cookie = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  if (body !== undefined) all['content-type'] ??= 'application/json'
  const res = await app.fetch(
    new Request(`${config.origin}/api/seen-hints`, {
      method,
      headers: all,
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
    })
  )
  const text = await res.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { raw: text }
  }
  return { status: res.status, body: parsed, cache: res.headers.get('cache-control') }
}

test('seen hints require the signed-in account for both reads and writes', opts, async () => {
  for (const method of ['GET', 'POST']) {
    const res = await call(null, method, method === 'POST' ? { hint: 'site-tour' } : undefined)
    assert.equal(res.status, 401)
    assert.equal(res.body.code, 'NOT_SIGNED_IN')
  }
})

for (const hint of ['site-tour', 'voice-tip', 'welcome']) {
  test(
    `${hint} is shared across sessions of one account and isolated from another account`,
    opts,
    async () => {
      assert.deepEqual((await call('a@tracy.test')).body, { hints: [] })
      const first = await call('a@tracy.test', 'POST', { hint })
      assert.equal(first.status, 200)
      assert.equal(first.cache, 'no-store')
      assert.deepEqual(first.body, { hints: [hint] })
      assert.deepEqual((await call('A@tracy.test')).body, { hints: [hint] })
      assert.deepEqual((await call('b@tracy.test')).body, { hints: [] })
      const { rows } = await db.pool.query('select seen_at from account_seen_hint where hint = $1', [hint])
      assert.ok(rows[0].seen_at instanceof Date)
      const original = rows[0].seen_at.toISOString()
      await call('a@tracy.test', 'POST', { hint })
      const repeated = await db.pool.query('select seen_at from account_seen_hint where hint = $1', [hint])
      assert.equal(repeated.rows[0].seen_at.toISOString(), original, 'the first timestamp is kept')
    }
  )
}

test('every hint can be recorded concurrently, and account deletion removes them', opts, async () => {
  const responses = await Promise.all(
    ['voice-tip', 'welcome', 'site-tour'].map((hint) => call('new@tracy.test', 'POST', { hint }))
  )
  assert.ok(responses.every((r) => r.status === 200))
  assert.deepEqual((await call('new@tracy.test')).body, { hints: ['site-tour', 'voice-tip', 'welcome'] })
  await db.pool.query("delete from account where email = 'new@tracy.test'")
  assert.equal((await db.pool.query('select * from account_seen_hint')).rows.length, 0)
})

test('the database also refuses hint names outside the closed allow-list', opts, async () => {
  const account = await db.pool.query("insert into account (email) values ('closed@tracy.test') returning id")
  await assert.rejects(
    db.pool.query("insert into account_seen_hint (account_id, hint) values ($1, 'unknown')", [
      account.rows[0].id
    ]),
    { code: '23514' }
  )
})

test('unknown or malformed hint bodies are refused without creating an account', opts, async () => {
  for (const body of [{ hint: 'unknown' }, {}, { hint: ['site-tour'] }, null, '{broken']) {
    const res = await call('invalid@tracy.test', 'POST', body)
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'INVALID_REQUEST')
  }
  assert.equal((await db.pool.query('select * from account')).rows.length, 0)
})

test(
  'the same-origin JSON guard refuses sibling hosts, foreign origins and simple bodies',
  opts,
  async () => {
    for (const headers of [
      { 'sec-fetch-site': 'same-site' },
      { 'sec-fetch-site': 'cross-site', origin: config.origin },
      { 'sec-fetch-site': undefined, origin: 'http://customer.tracy.test:8080' }
    ]) {
      const res = await call('guard@tracy.test', 'POST', { hint: 'voice-tip' }, headers)
      assert.equal(res.status, 403)
      assert.equal(res.body.code, 'CSRF_ORIGIN')
    }
    const simple = await call(
      'guard@tracy.test',
      'POST',
      { hint: 'voice-tip' },
      { 'content-type': 'text/plain' }
    )
    assert.equal(simple.status, 415)
    assert.equal(simple.body.code, 'UNSUPPORTED_MEDIA_TYPE')
    assert.deepEqual((await call('guard@tracy.test')).body, { hints: [] })
  }
)
