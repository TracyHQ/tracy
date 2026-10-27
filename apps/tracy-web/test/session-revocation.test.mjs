// Sign-out ends the session on the server, not only in the browser (J1.3, 11/10/2026).
//
// Until this change `POST /auth/signout` only sent a `Set-Cookie` that cleared `tracy_sess`; the
// token itself stayed valid for its full seventy-two hours, and `/auth/me` kept re-minting it, so a
// copied cookie outlived sign-out indefinitely. Every token now carries a `jti` (one per sign-in,
// kept across renewals), sign-out records it, and every reader of the cookie refuses it.
import { createHmac } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { mintSession, sessionWithExpiry } from '../src/lib/session.js'
import { SESSION_RENEW_AFTER_S } from '../src/lib/policy.js'
import { pgSessionRevocations } from '../src/lib/session-revocation.js'
import { fileDb } from './_db.mjs'

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const secret = env.SESSION_SECRET

function harness(clock) {
  const app = buildApp({
    config: readConfig(env),
    identity: memoryIdentityStore(),
    mail: { send: async () => {} },
    now: () => clock.t
  })
  const me = async (cookie) =>
    app.fetch(new Request('http://tracy.test/auth/me', { headers: cookie ? { cookie } : {} }))
  const signOut = (cookie) =>
    app.fetch(new Request('http://tracy.test/auth/signout', { method: 'POST', headers: { cookie } }))
  return { app, me, signOut }
}

test('a cookie used after sign-out no longer signs anyone in', async () => {
  const clock = { t: Date.now() }
  const { me, signOut } = harness(clock)
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', secret, clock.t)}`
  assert.equal((await (await me(cookie)).json()).email, 'ceo@tracy.ai')
  assert.equal((await signOut(cookie)).status, 200)
  assert.equal((await (await me(cookie)).json()).email, null)
})

test('a signed-out session cannot be renewed back to life', async () => {
  const clock = { t: Date.now() }
  const { me, signOut } = harness(clock)
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', secret, clock.t)}`
  await signOut(cookie)
  clock.t += (SESSION_RENEW_AFTER_S + 60) * 1000
  const res = await me(cookie)
  assert.equal((await res.json()).email, null)
  assert.equal(res.headers.get('set-cookie'), null)
})

test('a renewed cookie belongs to the same sign-in: signing out with the old one ends both', async () => {
  const clock = { t: Date.now() }
  const { me, signOut } = harness(clock)
  const first = `tracy_sess=${await mintSession('ceo@tracy.ai', secret, clock.t)}`
  clock.t += (SESSION_RENEW_AFTER_S + 60) * 1000
  const renewed = (await me(first)).headers.get('set-cookie')
  assert.match(renewed ?? '', /^tracy_sess=v1\./)
  const second = renewed.split(';')[0]
  assert.notEqual(second, first)
  await signOut(first)
  assert.equal((await (await me(second)).json()).email, null)
})

test('signing out one sign-in leaves another sign-in of the same person alone', async () => {
  const clock = { t: Date.now() }
  const { me, signOut } = harness(clock)
  const laptop = `tracy_sess=${await mintSession('ceo@tracy.ai', secret, clock.t)}`
  const phone = `tracy_sess=${await mintSession('ceo@tracy.ai', secret, clock.t)}`
  await signOut(laptop)
  assert.equal((await (await me(phone)).json()).email, 'ceo@tracy.ai')
})

/**
 * Tokens minted before this change carry no `jti`. They keep working until their own expiry, so
 * the deploy signs nobody out. Signed here exactly the way the old `mintSession` signed:
 * `v1.<base64url {"email","exp"}>.<base64url HMAC-SHA256>`, expiring at 1_700_259_200.
 */
const b64url = (buf) => Buffer.from(buf).toString('base64url')
const oldPayload = b64url(JSON.stringify({ email: 'ceo@tracy.ai', exp: 1_700_259_200 }))
const OLD_TOKEN_WITHOUT_JTI = `v1.${oldPayload}.${b64url(createHmac('sha256', secret).update(oldPayload).digest())}`

test('a token minted before jti existed is still accepted until it expires', async () => {
  const clock = { t: 1_700_000_000_000 + 60_000 }
  const { me } = harness(clock)
  const res = await me(`tracy_sess=${OLD_TOKEN_WITHOUT_JTI}`)
  assert.equal((await res.json()).email, 'ceo@tracy.ai')
  clock.t = 1_700_259_200_000 + 1000
  assert.equal((await (await me(`tracy_sess=${OLD_TOKEN_WITHOUT_JTI}`)).json()).email, null)
})

test('renewing an old jti-less token hands out one that sign-out can end', async () => {
  const clock = { t: 1_700_000_000_000 + (SESSION_RENEW_AFTER_S + 60) * 1000 }
  const { me, signOut } = harness(clock)
  const renewed = (await me(`tracy_sess=${OLD_TOKEN_WITHOUT_JTI}`)).headers.get('set-cookie')
  const cookie = renewed.split(';')[0]
  const session = await sessionWithExpiry(cookie, secret, clock.t)
  assert.equal(typeof session?.jti, 'string')
  await signOut(cookie)
  assert.equal((await (await me(cookie)).json()).email, null)
})

// ── the table behind it (migration 093), and the same doors with a database ────────────────────
const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

test(
  'session_revocation: a revoked jti reads revoked until its row expires; old rows are pruned',
  dbOpts,
  async () => {
    const book = pgSessionRevocations(db.pool)
    assert.equal(await book.isRevoked('a'), false)
    await book.revoke('a', new Date(Date.now() + 60_000))
    assert.equal(await book.isRevoked('a'), true)
    // Revoking again never shortens a row's life.
    await book.revoke('a', new Date(Date.now() - 1000))
    assert.equal(await book.isRevoked('a'), true)
    await db.pool.query(
      "insert into session_revocation (jti, expires_at) values ('old', now() - interval '1 minute')"
    )
    assert.equal(await book.isRevoked('old'), false)
    await book.revoke('b', new Date(Date.now() + 60_000))
    const { rows } = await db.pool.query('select jti from session_revocation order by jti')
    assert.deepEqual(
      rows.map((r) => r.jti),
      ['a', 'b']
    )
  }
)

test(
  'with a database: sign-out ends the cookie, and another app on the same database sees it',
  dbOpts,
  async () => {
    const clock = { t: Date.now() }
    const build = () =>
      buildApp({
        config: readConfig(env),
        identity: memoryIdentityStore(),
        mail: { send: async () => {} },
        pool: db.pool,
        now: () => clock.t
      })
    const first = build()
    const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', secret, clock.t)}`
    await first.fetch(new Request('http://tracy.test/auth/signout', { method: 'POST', headers: { cookie } }))
    // A second process (here: a second app, whose own cache is empty) reads the table.
    const second = build()
    const me = await second.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie } }))
    assert.equal((await me.json()).email, null)
  }
)
