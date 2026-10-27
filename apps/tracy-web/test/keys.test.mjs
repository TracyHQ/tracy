// Seat keys (`tasks/todo-api-public.md` S1): a person with a live seat mints a key bound to their
// account and ONE site; the key is a Bearer credential for the api host. Two seams under test:
// `lib/api-key.js` (mint, parse, verify, list, revoke — against a real Postgres) and the three
// cookie-authenticated doors at `/api/me/keys` on the cowork host.
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { listKeys, mintKey, parseKey, revokeKey, verifyKey } from '../src/lib/api-key.js'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
const PEPPER = 'p'.repeat(32)

async function accountId(pool, email) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  return rows[0].id
}

async function siteWithSeat(pool, siteKey, email, role = 'owner') {
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [
    siteKey,
    siteKey.split('.')[0],
    'local'
  ])
  const id = await accountId(pool, email)
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [siteKey, id, role]
  )
  return id
}

// ── lib/api-key.js ───────────────────────────────────────────────────────────────────────────────

test('parseKey: only `Bearer trk_<id16>.<secret32>` parses; anything else is null', () => {
  const id = 'abcdefghij234567'
  const secret = 'A'.repeat(32)
  assert.deepEqual(parseKey(`Bearer trk_${id}.${secret}`), { id, secret })
  assert.deepEqual(parseKey(`bearer trk_${id}.${secret}`), { id, secret }, 'scheme is case-insensitive')
  assert.equal(parseKey(null), null)
  assert.equal(parseKey(''), null)
  assert.equal(parseKey(`trk_${id}.${secret}`), null, 'no scheme')
  assert.equal(parseKey(`Basic trk_${id}.${secret}`), null, 'wrong scheme')
  assert.equal(parseKey(`Bearer trk_${id}`), null, 'no secret')
  assert.equal(parseKey(`Bearer trk_${id}.${'A'.repeat(31)}`), null, 'short secret')
  assert.equal(parseKey(`Bearer trk_${id.slice(1)}.${secret}`), null, 'short id')
  assert.equal(parseKey(`Bearer trk_${id}.${secret}.extra`), null, 'trailing junk')
  assert.equal(parseKey(`Bearer v1.${id}.${secret}`), null, 'an actor assertion is not a key')
})

test('mintKey answers the key once, in the documented shape, and verifyKey reads it back', opts, async () => {
  const { pool } = db
  const account = await siteWithSeat(pool, 'lantern.localhost', 'owner@x.y')
  const now = Date.parse('2026-09-28T10:00:00Z')
  const minted = await mintKey({
    pool,
    accountId: account,
    siteKey: 'lantern.localhost',
    label: 'CI robot',
    scopes: ['content'],
    expiresAt: null,
    pepper: PEPPER,
    now
  })
  assert.match(minted.id, /^[a-z2-7]{16}$/, 'id: 16 chars of lower-case base32')
  assert.match(minted.key, /^trk_[a-z2-7]{16}\.[A-Za-z0-9_-]{32}$/, 'key: trk_<id>.<secret>')
  assert.equal(minted.key.startsWith(`trk_${minted.id}.`), true)
  assert.equal(minted.siteKey, 'lantern.localhost')
  assert.equal(minted.label, 'CI robot')
  assert.deepEqual(minted.scopes, ['content'])
  assert.equal(minted.expiresAt, null)
  assert.equal(new Date(minted.createdAt).getTime(), now)
  assert.equal('secretHash' in minted || 'secret_hash' in minted, false, 'the hash never leaves the store')

  const seen = await verifyKey({ pool, header: `Bearer ${minted.key}`, pepper: PEPPER, now })
  assert.deepEqual(seen, {
    keyId: minted.id,
    accountId: account,
    siteKey: 'lantern.localhost',
    scopes: ['content'],
    email: 'owner@x.y'
  })

  // The store holds an HMAC of the secret, never the secret.
  const { rows } = await pool.query('select secret_hash from api_key where id = $1', [minted.id])
  assert.match(rows[0].secret_hash, /^[0-9a-f]{64}$/)
  assert.equal(minted.key.includes(rows[0].secret_hash), false)
})

test(
  'verifyKey: a tampered secret, an unknown id, a wrong pepper and a missing pepper are refused',
  opts,
  async () => {
    const { pool } = db
    const account = await siteWithSeat(pool, 'lantern.localhost', 'owner@x.y')
    const now = Date.now()
    const minted = await mintKey({
      pool,
      accountId: account,
      siteKey: 'lantern.localhost',
      label: 'k',
      scopes: ['content'],
      pepper: PEPPER,
      now
    })
    const [prefix, secret] = minted.key.split('.')
    const flipped = (secret[0] === 'A' ? 'B' : 'A') + secret.slice(1)
    assert.deepEqual(await verifyKey({ pool, header: `Bearer ${prefix}.${flipped}`, pepper: PEPPER, now }), {
      error: 'KEY_INVALID'
    })
    assert.deepEqual(
      await verifyKey({ pool, header: `Bearer trk_${'z'.repeat(16)}.${secret}`, pepper: PEPPER, now }),
      { error: 'KEY_INVALID' }
    )
    assert.deepEqual(await verifyKey({ pool, header: `Bearer ${minted.key}`, pepper: 'other', now }), {
      error: 'KEY_INVALID'
    })
    assert.deepEqual(await verifyKey({ pool, header: null, pepper: PEPPER, now }), { error: 'KEY_INVALID' })
    assert.deepEqual(await verifyKey({ pool, header: `Bearer ${minted.key}`, pepper: null, now }), {
      error: 'API_KEYS_NOT_CONFIGURED'
    })
  }
)

test(
  'verifyKey: revoked → KEY_REVOKED (permanently), expired → KEY_EXPIRED; a wrong secret on either still says KEY_INVALID',
  opts,
  async () => {
    const { pool } = db
    const account = await siteWithSeat(pool, 'lantern.localhost', 'owner@x.y')
    const now = Date.parse('2026-09-28T10:00:00Z')
    const expiring = await mintKey({
      pool,
      accountId: account,
      siteKey: 'lantern.localhost',
      label: 'short-lived',
      scopes: ['content'],
      expiresAt: new Date(now + 60_000),
      pepper: PEPPER,
      now
    })
    assert.equal(
      (await verifyKey({ pool, header: `Bearer ${expiring.key}`, pepper: PEPPER, now })).keyId,
      expiring.id
    )
    assert.deepEqual(
      await verifyKey({ pool, header: `Bearer ${expiring.key}`, pepper: PEPPER, now: now + 60_000 }),
      { error: 'KEY_EXPIRED' }
    )

    const revoked = await mintKey({
      pool,
      accountId: account,
      siteKey: 'lantern.localhost',
      label: 'to revoke',
      scopes: ['content'],
      pepper: PEPPER,
      now
    })
    assert.equal(await revokeKey(pool, account, revoked.id), true)
    assert.equal(await revokeKey(pool, account, revoked.id), false, 'a second revoke changes nothing')
    assert.deepEqual(await verifyKey({ pool, header: `Bearer ${revoked.key}`, pepper: PEPPER, now }), {
      error: 'KEY_REVOKED'
    })
    const [prefix] = revoked.key.split('.')
    assert.deepEqual(
      await verifyKey({ pool, header: `Bearer ${prefix}.${'Q'.repeat(32)}`, pepper: PEPPER, now }),
      { error: 'KEY_INVALID' },
      'a wrong secret learns nothing about the key’s state'
    )
    // Another account cannot revoke it, and revoke is permanent: nothing un-revokes.
    const other = await accountId(pool, 'other@x.y')
    const fresh = await mintKey({
      pool,
      accountId: account,
      siteKey: 'lantern.localhost',
      label: 'mine',
      scopes: ['content'],
      pepper: PEPPER,
      now
    })
    assert.equal(await revokeKey(pool, other, fresh.id), false)
    assert.equal(
      (await verifyKey({ pool, header: `Bearer ${fresh.key}`, pepper: PEPPER, now })).keyId,
      fresh.id
    )
  }
)

test('verifyKey touches last_used_at at most once a minute', opts, async () => {
  const { pool } = db
  const account = await siteWithSeat(pool, 'lantern.localhost', 'owner@x.y')
  const t0 = Date.parse('2026-09-28T10:00:00Z')
  const minted = await mintKey({
    pool,
    accountId: account,
    siteKey: 'lantern.localhost',
    label: 'k',
    scopes: ['content'],
    pepper: PEPPER,
    now: t0
  })
  const lastUsed = async () => {
    const { rows } = await pool.query('select last_used_at from api_key where id = $1', [minted.id])
    return rows[0].last_used_at === null ? null : rows[0].last_used_at.getTime()
  }
  assert.equal(await lastUsed(), null)
  await verifyKey({ pool, header: `Bearer ${minted.key}`, pepper: PEPPER, now: t0 })
  assert.equal(await lastUsed(), t0)
  await verifyKey({ pool, header: `Bearer ${minted.key}`, pepper: PEPPER, now: t0 + 30_000 })
  assert.equal(await lastUsed(), t0, 'thirty seconds later: not touched')
  await verifyKey({ pool, header: `Bearer ${minted.key}`, pepper: PEPPER, now: t0 + 61_000 })
  assert.equal(await lastUsed(), t0 + 61_000)
})

test(
  'listKeys answers the account’s keys without the secret or its hash, revoked ones excluded',
  opts,
  async () => {
    const { pool } = db
    const account = await siteWithSeat(pool, 'lantern.localhost', 'owner@x.y')
    const other = await accountId(pool, 'other@x.y')
    const now = Date.parse('2026-09-28T10:00:00Z')
    const a = await mintKey({
      pool,
      accountId: account,
      siteKey: 'lantern.localhost',
      label: 'a',
      scopes: ['content', 'code'],
      pepper: PEPPER,
      now
    })
    const b = await mintKey({
      pool,
      accountId: account,
      siteKey: 'lantern.localhost',
      label: 'b',
      scopes: ['content'],
      pepper: PEPPER,
      now: now + 1000
    })
    await revokeKey(pool, account, b.id)
    assert.deepEqual(await listKeys(pool, other), [])
    const listed = await listKeys(pool, account)
    assert.equal(listed.length, 1)
    assert.deepEqual(Object.keys(listed[0]).sort(), [
      'createdAt',
      'expiresAt',
      'hint',
      'id',
      'label',
      'lastUsedAt',
      'scopes',
      'siteKey'
    ])
    assert.equal(listed[0].id, a.id)
    assert.equal(listed[0].hint.startsWith(`trk_${a.id}`), true)
    const text = JSON.stringify(listed)
    assert.equal(text.includes(a.key.split('.')[1]), false, 'the secret is not in the listing')
    const { rows } = await pool.query('select secret_hash from api_key where id = $1', [a.id])
    assert.equal(text.includes(rows[0].secret_hash), false, 'nor its hash')
  }
)

// ── /api/me/keys on the cowork host ──────────────────────────────────────────────────────────────

const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  API_KEY_PEPPER: PEPPER
}

function harness(pool, envOverrides = {}) {
  const config = readConfig({ ...env, ...envOverrides })
  const app = buildApp({ config, pool, mail: { send: async () => {} }, host: { hostCall, hostJob } })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  /** `origin` defaults to the public origin, the way a browser on cowork.* sends it. */
  const send = (method, path, cookie, body, { origin = config.origin } = {}) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(origin ? { origin } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  return { app, config, cookieFor, send }
}

const MINT = { siteKey: 'lantern.localhost', label: 'CI robot', scopes: ['content'] }

test(
  'keys doors: no session → 401 NOT_SIGNED_IN on all three; POST without the exact Origin → 403',
  opts,
  async () => {
    const { pool } = db
    const { send, cookieFor } = harness(pool)
    await siteWithSeat(pool, 'lantern.localhost', 'owner@x.y')
    for (const [method, path, body] of [
      ['GET', '/api/me/keys'],
      ['POST', '/api/me/keys', MINT],
      ['DELETE', '/api/me/keys/abcdefghij234567']
    ]) {
      const res = await send(method, path, null, body)
      assert.equal(res.status, 401, `${method} ${path}`)
      assert.deepEqual(await res.json(), { code: 'NOT_SIGNED_IN' })
    }
    const owner = await cookieFor('owner@x.y')
    assert.equal((await send('POST', '/api/me/keys', owner, MINT, { origin: null })).status, 403, 'no Origin')
    assert.equal(
      (await send('POST', '/api/me/keys', owner, MINT, { origin: 'http://evil.test' })).status,
      403,
      'another origin'
    )
    assert.equal(
      (await send('GET', '/api/me/keys', owner, undefined, { origin: null })).status,
      200,
      'reads need no Origin'
    )
  }
)

test(
  'keys doors: mint → 201 with the key once; list never carries it; delete → 204, then 404',
  opts,
  async () => {
    const { pool } = db
    const { send, cookieFor } = harness(pool)
    await siteWithSeat(pool, 'lantern.localhost', 'owner@x.y')
    const owner = await cookieFor('owner@x.y')

    const minted = await send('POST', '/api/me/keys', owner, { ...MINT, expiresInDays: 30 })
    assert.equal(minted.status, 201)
    const made = await minted.json()
    assert.match(made.key, /^trk_[a-z2-7]{16}\.[A-Za-z0-9_-]{32}$/)
    assert.equal(made.id, made.key.slice(4, 20))
    assert.equal(made.siteKey, 'lantern.localhost')
    assert.equal(made.label, 'CI robot')
    assert.deepEqual(made.scopes, ['content'])
    const daysAhead = (Date.parse(made.expiresAt) - Date.parse(made.createdAt)) / 86_400_000
    assert.ok(Math.abs(daysAhead - 30) < 0.01, `expires ${daysAhead} days ahead`)

    const listed = await send('GET', '/api/me/keys', owner)
    assert.equal(listed.status, 200)
    const text = await listed.text()
    const { keys } = JSON.parse(text)
    assert.equal(keys.length, 1)
    assert.deepEqual(Object.keys(keys[0]).sort(), [
      'createdAt',
      'expiresAt',
      'hint',
      'id',
      'label',
      'lastUsedAt',
      'scopes',
      'siteKey'
    ])
    assert.equal(keys[0].id, made.id)
    assert.equal(keys[0].lastUsedAt, null)
    assert.equal(text.includes(made.key.split('.')[1]), false, 'the secret never appears in a listing')

    // Somebody else neither sees nor deletes it.
    await siteWithSeat(pool, 'other.localhost', 'other@x.y')
    const other = await cookieFor('other@x.y')
    assert.deepEqual(await (await send('GET', '/api/me/keys', other)).json(), { keys: [] })
    assert.equal((await send('DELETE', `/api/me/keys/${made.id}`, other)).status, 404)

    assert.equal((await send('DELETE', `/api/me/keys/${made.id}`, owner)).status, 204)
    assert.equal((await send('DELETE', `/api/me/keys/${made.id}`, owner)).status, 404, 'gone is gone')
    assert.deepEqual(await (await send('GET', '/api/me/keys', owner)).json(), { keys: [] })
    assert.deepEqual(await verifyKey({ pool, header: `Bearer ${made.key}`, pepper: PEPPER }), {
      error: 'KEY_REVOKED'
    })
  }
)

test(
  'keys doors: a key needs a live seat on that site and scopes inside what the seat’s role grants',
  opts,
  async () => {
    const { pool } = db
    const { send, cookieFor } = harness(pool)
    await siteWithSeat(pool, 'lantern.localhost', 'owner@x.y')
    await siteWithSeat(pool, 'moon.localhost', 'editor@x.y', 'editor')
    await siteWithSeat(pool, 'star.localhost', 'viewer@x.y', 'viewer')
    const owner = await cookieFor('owner@x.y')
    const editor = await cookieFor('editor@x.y')
    const viewer = await cookieFor('viewer@x.y')

    // No seat on the site named.
    const stranger = await send('POST', '/api/me/keys', editor, MINT)
    assert.equal(stranger.status, 403)
    assert.deepEqual(await stranger.json(), { code: 'SEAT_NOT_AUTHORIZED' })
    // An editor holds content, code and site (ADR 0028), never lifecycle: the refusal names it.
    const tooWide = await send('POST', '/api/me/keys', editor, {
      siteKey: 'moon.localhost',
      label: 'deploy bot',
      scopes: ['content', 'lifecycle']
    })
    assert.equal(tooWide.status, 400)
    assert.deepEqual(await tooWide.json(), {
      code: 'SCOPE_OUTSIDE_ROLE',
      role: 'editor',
      toolsets: ['lifecycle']
    })
    assert.equal(
      (
        await send('POST', '/api/me/keys', editor, {
          siteKey: 'moon.localhost',
          label: 'ok',
          scopes: ['content', 'code', 'site']
        })
      ).status,
      201
    )
    // A viewer holds no toolset, so no scope at all sits inside its role: it mints no key.
    const viewerKey = await send('POST', '/api/me/keys', viewer, {
      siteKey: 'star.localhost',
      label: 'reader',
      scopes: ['content']
    })
    assert.equal(viewerKey.status, 400)
    assert.deepEqual(await viewerKey.json(), {
      code: 'SCOPE_OUTSIDE_ROLE',
      role: 'viewer',
      toolsets: ['content']
    })
    // Owner: every toolset. Bad shapes: unknown scope, empty scopes, no label, bad expiry, junk site.
    assert.equal(
      (
        await send('POST', '/api/me/keys', owner, {
          ...MINT,
          scopes: ['content', 'code', 'site', 'lifecycle']
        })
      ).status,
      201
    )
    for (const bad of [
      { ...MINT, scopes: ['everything'] },
      { ...MINT, scopes: [] },
      { ...MINT, scopes: 'content' },
      { ...MINT, label: '' },
      { ...MINT, label: 'x'.repeat(200) },
      { ...MINT, expiresInDays: 0 },
      { ...MINT, expiresInDays: 'soon' },
      { ...MINT, siteKey: 'not a host' },
      'not an object'
    ]) {
      const res = await send('POST', '/api/me/keys', owner, bad)
      assert.equal(res.status, 400, JSON.stringify(bad))
      assert.deepEqual(await res.json(), { code: 'INVALID_REQUEST' })
    }
    // The site key is canonicalised the way /api/sites/:key is: scheme, www and case are dropped.
    const spelled = await send('POST', '/api/me/keys', owner, {
      ...MINT,
      siteKey: 'https://www.Lantern.localhost/'
    })
    assert.equal(spelled.status, 201)
    assert.equal((await spelled.json()).siteKey, 'lantern.localhost')
  }
)

test('keys doors: without API_KEY_PEPPER every door answers 503 API_KEYS_NOT_CONFIGURED', opts, async () => {
  const { pool } = db
  const { send, cookieFor } = harness(pool, { API_KEY_PEPPER: '' })
  await siteWithSeat(pool, 'lantern.localhost', 'owner@x.y')
  const owner = await cookieFor('owner@x.y')
  for (const [method, path, body] of [
    ['GET', '/api/me/keys'],
    ['POST', '/api/me/keys', MINT],
    ['DELETE', '/api/me/keys/abcdefghij234567']
  ]) {
    const res = await send(method, path, owner, body)
    assert.equal(res.status, 503, `${method} ${path}`)
    assert.deepEqual(await res.json(), { code: 'API_KEYS_NOT_CONFIGURED' })
  }
})

test('keys doors: the 21st mint in an hour is refused 429 RATE_LIMITED', opts, async () => {
  const { pool } = db
  const { send, cookieFor } = harness(pool)
  await siteWithSeat(pool, 'lantern.localhost', 'owner@x.y')
  const owner = await cookieFor('owner@x.y')
  for (let i = 0; i < 20; i += 1) {
    assert.equal(
      (await send('POST', '/api/me/keys', owner, { ...MINT, label: `k${i}` })).status,
      201,
      `mint ${i + 1}`
    )
  }
  const over = await send('POST', '/api/me/keys', owner, MINT)
  assert.equal(over.status, 429)
  assert.deepEqual(await over.json(), { code: 'RATE_LIMITED' })
  assert.equal((await (await send('GET', '/api/me/keys', owner)).json()).keys.length, 20)
})
