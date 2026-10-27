/** Where the sign-in doors call the shard hooks (`shards/sign-in.js`), with the hooks faked. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readConfig } from '../src/config.js'
import { hashCode } from '../src/identity/otp.js'
import { identityRoutes } from '../src/identity/route.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { mintSession } from '../src/lib/session.js'
import { signInCodeMail } from '../src/mail/emails.js'
import { MASTER_ENV } from './_shards.mjs'

const config = readConfig(MASTER_ENV)
const SHARD_NEXT = 'https://s1.tracy.test/x'

function harness() {
  const calls = []
  const store = memoryIdentityStore()
  const shards = {
    // `full@` is the one person no shard takes (S40): the hook refuses them with the API shape. There
    // is no hook before a code: `POST /login` sends one as always (no pre-OTP check, #794).
    afterSignIn: async (c, email, o) => {
      calls.push(['after', email, o.json])
      if (email === 'full@tracy.test') return Response.json({ code: 'NO_SHARD_ACCEPTING' }, { status: 503 })
      c.header('set-cookie', 'tracy_shard=s1; Path=/', { append: true })
      return null
    },
    atLogin: async (c, email, next) => {
      calls.push(['login', email, next])
      if (next !== SHARD_NEXT) return null
      return email
        ? c.redirect('https://s1.tracy.test/handoff?t=T', 302)
        : { next: `/login?next=${encodeURIComponent(next)}` }
    }
  }
  const app = identityRoutes({
    store,
    mail: { send: async () => {}, available: true, signInCodeMail },
    config,
    shards
  })
  return { app, calls, store }
}

test('a verified code asks the shard hook before any session: the pointer, then the session, on one answer; a refusal is the hook answer and mints none', async () => {
  const { app, calls, store } = harness()
  const verify = (email) =>
    app.request('https://cowork.tracy.test/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code: '123456' })
    })
  const email = 'mai@tracy.test'
  await store.putCode({
    email,
    codeHash: await hashCode('123456', email, config.sessionSecret),
    expiresAt: Date.now() + 60_000
  })
  const res = await verify(email)
  assert.equal(res.status, 200)
  const cookies = res.headers.getSetCookie()
  assert.equal(cookies[0], 'tracy_shard=s1; Path=/')
  assert.match(cookies[1], /^tracy_sess=v1\./)
  assert.deepEqual(calls, [['after', email, true]])
  await store.putCode({
    email: 'full@tracy.test',
    codeHash: await hashCode('123456', 'full@tracy.test', config.sessionSecret),
    expiresAt: Date.now() + 60_000
  })
  const refused = await verify('full@tracy.test')
  assert.equal(refused.status, 503)
  assert.deepEqual(await refused.json(), { code: 'NO_SHARD_ACCEPTING' })
  assert.equal(
    refused.headers.getSetCookie().some((value) => value.startsWith('tracy_sess=')),
    false,
    'no session for somebody no shard took'
  )
})

test('asked for a code, the shard model is not consulted: the code goes out for everybody, as before (no pre-OTP check, #794)', async () => {
  const { app, calls, store } = harness()
  const ask = (email, form = false) =>
    app.request('https://cowork.tracy.test/login', {
      method: 'POST',
      headers: { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
      body: form ? new URLSearchParams({ email }).toString() : JSON.stringify({ email })
    })
  assert.equal((await ask('full@tracy.test')).status, 200, 'the one person no shard takes still gets a code')
  assert.ok(await store.takeCode('full@tracy.test'), 'a code was written for them')
  assert.equal((await ask('full@tracy.test', true)).status, 200)
  assert.equal((await ask('mai@tracy.test')).status, 200)
  assert.deepEqual(calls, [], 'no shard hook runs before a code')
})

test('signed out, a next on a shard reaches the login page as a master path', async () => {
  const { app } = harness()
  const res = await app.request(`https://cowork.tracy.test/login?next=${encodeURIComponent(SHARD_NEXT)}`)
  assert.equal(res.status, 200)
  assert.match(
    await res.text(),
    /name="next" value="https:\/\/cowork\.tracy\.test\/login\?next=https%3A%2F%2Fs1\.tracy\.test%2Fx"/
  )
})

test('signed in, the shard hook answers a next on a shard; any other next is redirected as before', async () => {
  const { app } = harness()
  const cookie = `tracy_sess=${await mintSession('mai@tracy.test', config.sessionSecret)}`
  const onShard = await app.request(
    `https://cowork.tracy.test/login?next=${encodeURIComponent(SHARD_NEXT)}`,
    { headers: { cookie } }
  )
  assert.equal(onShard.status, 302)
  assert.equal(onShard.headers.get('location'), 'https://s1.tracy.test/handoff?t=T')
  const plain = await app.request('https://cowork.tracy.test/login?next=%2Fsites', { headers: { cookie } })
  assert.equal(plain.headers.get('location'), 'https://cowork.tracy.test/sites')
})
