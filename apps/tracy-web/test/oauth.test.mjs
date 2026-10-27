// Task 9: sign in with Google or GitHub, straight to the provider — no Supabase, no PKCE broker.
// `authorizeUrl`/`exchangeCode` are pure and tested directly; the callback door is tested through
// the full app so the state row, the cookie, the `identity` table, and the session cookie are all
// exercised the way a browser would actually hit them.
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { pgIdentityStore, memoryIdentityStore } from '../src/identity/store.js'
import { authorizeUrl, exchangeCode, OAuthError, randomState } from '../src/identity/oauth.js'
import { safePath } from '../src/identity/route.js'
import { personFace } from '../src/lib/person-face.js'
import { dbSitesResolver } from '../src/sites/resolver.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbUrl = process.env.TEST_DATABASE_URL
const opts = { skip: dbUrl ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  GOOGLE_OAUTH_CLIENT_ID: 'g-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'g-secret-do-not-leak',
  GITHUB_OAUTH_CLIENT_ID: 'gh-id',
  GITHUB_OAUTH_CLIENT_SECRET: 'gh-secret-do-not-leak'
}

const SECRETS = [env.GOOGLE_OAUTH_CLIENT_SECRET, env.GITHUB_OAUTH_CLIENT_SECRET]

function config(overrides = {}) {
  return readConfig({ ...env, ...overrides })
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** An unsigned id_token shaped like Google's — the signature is never checked (see oauth.js), so
 * any third segment does. */
function fakeIdToken(claims) {
  return `${b64url({ alg: 'none' })}.${b64url(claims)}.sig`
}

/**
 * A fake Google + GitHub, matched on hostname+pathname the way `fakeGithub` in github.test.mjs
 * mocks the GitHub App's own endpoints. Records every call so a test can assert no secret ever
 * rode along in a way a log line would echo back (it does, in the request body — that is
 * necessarily true of a token exchange — so what's actually asserted is that a *response* this
 * app hands back to the browser never carries one).
 */
function fakeProvider({ googleClaims, githubEmails, githubUser } = {}) {
  const calls = []
  const fetchImpl = async (input) => {
    calls.push(String(input))
    const u = new URL(String(input))
    const respond = (body, status = 200) => new Response(JSON.stringify(body), { status })
    if (u.hostname === 'oauth2.googleapis.com' && u.pathname === '/token') {
      if (!googleClaims) return respond({ error: 'invalid_grant' }, 400)
      return respond({ id_token: fakeIdToken(googleClaims), access_token: 'g-access' })
    }
    if (u.hostname === 'github.com' && u.pathname === '/login/oauth/access_token') {
      return respond({ access_token: 'gh-access' })
    }
    if (u.hostname === 'api.github.com' && u.pathname === '/user/emails') {
      return respond(githubEmails ?? [])
    }
    if (u.hostname === 'api.github.com' && u.pathname === '/user') {
      return respond(githubUser ?? { id: 999 })
    }
    if (u.hostname === 'lh3.googleusercontent.com') {
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        headers: { 'content-type': 'image/png' }
      })
    }
    return new Response('not found', { status: 404 })
  }
  return { calls, fetchImpl }
}

function harness(pool, { fetchImpl, now } = {}) {
  const sent = []
  const mail = { send: async (m) => sent.push(m) }
  const cfg = config()
  const app = buildApp({
    config: cfg,
    identity: pgIdentityStore(pool),
    pool,
    mail,
    sites: dbSitesResolver(pool, cfg),
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(now ? { now } : {})
  })
  return { app, config: cfg, sent }
}

function cookiePair(setCookieHeader) {
  return setCookieHeader.split(';')[0]
}

// ── authorizeUrl: pure, no network ─────────────────────────────────────────────────────────────

test('authorizeUrl: google carries client_id, redirect_uri, response_type, scope, state', () => {
  const u = new URL(authorizeUrl('google', config(), 'STATE1'))
  assert.equal(`${u.origin}${u.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.equal(u.searchParams.get('client_id'), 'g-id')
  assert.equal(u.searchParams.get('redirect_uri'), 'http://tracy.test/signin/google/callback')
  assert.equal(u.searchParams.get('response_type'), 'code')
  // `profile` brings the name and picture into the id_token (the account's face, 09/10/2026).
  assert.equal(u.searchParams.get('scope'), 'openid email profile')
  assert.equal(u.searchParams.get('state'), 'STATE1')
})

test('authorizeUrl: github carries client_id, redirect_uri, scope, state', () => {
  const u = new URL(authorizeUrl('github', config(), 'STATE2'))
  assert.equal(`${u.origin}${u.pathname}`, 'https://github.com/login/oauth/authorize')
  assert.equal(u.searchParams.get('client_id'), 'gh-id')
  assert.equal(u.searchParams.get('redirect_uri'), 'http://tracy.test/signin/github/callback')
  assert.equal(u.searchParams.get('scope'), 'user:email')
  assert.equal(u.searchParams.get('state'), 'STATE2')
})

test('authorizeUrl: an unconfigured provider throws NOT_CONFIGURED, an unknown one throws UNKNOWN_PROVIDER', () => {
  const bare = readConfig({ ...env, GOOGLE_OAUTH_CLIENT_ID: '', GOOGLE_OAUTH_CLIENT_SECRET: '' })
  assert.throws(
    () => authorizeUrl('google', bare, 's'),
    (e) => e instanceof OAuthError && e.code === 'NOT_CONFIGURED'
  )
  assert.throws(
    () => authorizeUrl('facebook', config(), 's'),
    (e) => e instanceof OAuthError && e.code === 'UNKNOWN_PROVIDER'
  )
})

test('randomState: 256 bits, never the same twice', () => {
  const a = randomState()
  const b = randomState()
  assert.notEqual(a, b)
  assert.ok(a.length >= 40) // base64url of 32 bytes, no padding
})

// ── exchangeCode: pure logic, fetchImpl injected, no real network ──────────────────────────────

test('exchangeCode: google trusts email_verified, lowercases the email, uses sub as subject', async () => {
  const { fetchImpl } = fakeProvider({
    googleClaims: { email: 'Ceo@Tracy.AI', email_verified: true, sub: 'g-42' }
  })
  const result = await exchangeCode('google', config(), 'authcode', { fetchImpl })
  assert.deepEqual(result, { email: 'ceo@tracy.ai', subject: 'g-42', name: null, picture: null })
})

test('exchangeCode: google hands over the profile name and picture from the id_token', async () => {
  const { fetchImpl } = fakeProvider({
    googleClaims: {
      email: 'ceo@tracy.ai',
      email_verified: true,
      sub: 'g-42',
      name: '  Lee Nguyen ',
      picture: 'https://lh3.googleusercontent.com/a/ACg8oc=s96-c'
    }
  })
  const result = await exchangeCode('google', config(), 'authcode', { fetchImpl })
  assert.deepEqual(result, {
    email: 'ceo@tracy.ai',
    subject: 'g-42',
    name: 'Lee Nguyen',
    picture: 'https://lh3.googleusercontent.com/a/ACg8oc=s96-c'
  })
})

test('exchangeCode: google refuses an unverified email — this is the account-takeover guard', async () => {
  const { fetchImpl } = fakeProvider({
    googleClaims: { email: 'ceo@tracy.ai', email_verified: false, sub: 'g-42' }
  })
  await assert.rejects(
    exchangeCode('google', config(), 'authcode', { fetchImpl }),
    (e) => e instanceof OAuthError && e.code === 'EMAIL_NOT_VERIFIED'
  )
})

test('exchangeCode: github picks the primary+verified email and uses the numeric id as subject', async () => {
  const { fetchImpl } = fakeProvider({
    githubEmails: [
      { email: 'secondary@tracy.test', primary: false, verified: true },
      { email: 'ceo@tracy.ai', primary: true, verified: true }
    ],
    githubUser: { id: 4242 }
  })
  const result = await exchangeCode('github', config(), 'authcode', { fetchImpl })
  assert.deepEqual(result, { email: 'ceo@tracy.ai', subject: '4242', name: null, picture: null })
})

test('exchangeCode: github hands over the profile name and avatar_url from GET /user', async () => {
  const { fetchImpl } = fakeProvider({
    githubEmails: [{ email: 'ceo@tracy.ai', primary: true, verified: true }],
    githubUser: { id: 4242, name: 'Lee N', avatar_url: 'https://avatars.githubusercontent.com/u/4242?v=4' }
  })
  const result = await exchangeCode('github', config(), 'authcode', { fetchImpl })
  assert.deepEqual(result, {
    email: 'ceo@tracy.ai',
    subject: '4242',
    name: 'Lee N',
    picture: 'https://avatars.githubusercontent.com/u/4242?v=4'
  })
})

test('exchangeCode: github refuses when the primary email is not verified', async () => {
  const { fetchImpl } = fakeProvider({
    githubEmails: [{ email: 'ceo@tracy.ai', primary: true, verified: false }],
    githubUser: { id: 4242 }
  })
  await assert.rejects(
    exchangeCode('github', config(), 'authcode', { fetchImpl }),
    (e) => e instanceof OAuthError && e.code === 'EMAIL_NOT_VERIFIED'
  )
})

test('exchangeCode: a provider that refuses the code answers EXCHANGE_FAILED, never a thrown network error', async () => {
  const { fetchImpl } = fakeProvider({})
  await assert.rejects(
    exchangeCode('google', config(), 'bad-code', { fetchImpl }),
    (e) => e instanceof OAuthError && e.code === 'EXCHANGE_FAILED'
  )
})

test('exchangeCode never calls the real network — every call in this file goes through fetchImpl', async () => {
  const { fetchImpl, calls } = fakeProvider({
    googleClaims: { email: 'a@b.c', email_verified: true, sub: 's' }
  })
  await exchangeCode('google', config(), 'x', { fetchImpl })
  assert.ok(calls.every((u) => u.startsWith('https://oauth2.googleapis.com/')))
})

// ── The doors, end to end ───────────────────────────────────────────────────────────────────────

test(
  'GET /signin/google -> GET /signin/google/callback: cookie set, an identity row exists, /auth/me reads the email back',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeProvider({
      googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-1' }
    })
    const { app } = harness(pool, { fetchImpl })

    const started = await app.fetch(
      new Request('http://tracy.test/signin/google?next=%2Fwpdemo.localhost%2F')
    )
    assert.equal(started.status, 302)
    const authorize = new URL(started.headers.get('location'))
    const state = authorize.searchParams.get('state')
    const stateCookie = cookiePair(started.headers.get('set-cookie'))

    const cb = await app.fetch(
      new Request(`http://tracy.test/signin/google/callback?state=${state}&code=abc`, {
        headers: { cookie: stateCookie }
      })
    )
    assert.equal(cb.status, 302)
    // Absolute since fix round 2 (`safePath` returns `origin + pathname + search`, never a bare
    // relative string a second consumer could reinterpret) — same destination either way.
    assert.equal(cb.headers.get('location'), 'http://tracy.test/wpdemo.localhost/')
    // The page the callback sends the browser to must not learn the provider as its referrer
    // (`accounts.google.com` would otherwise be recorded as where a quickstart download came from).
    assert.equal(cb.headers.get('referrer-policy'), 'no-referrer')
    const setCookies = cb.headers.getSetCookie()
    assert.ok(setCookies.some((c) => c.startsWith('tracy_sess=v1.')))
    // The flow cookie is burned on the way out, whether or not the flow succeeded.
    assert.ok(setCookies.some((c) => c.startsWith('tracy_oauth_state=; ') && /Max-Age=0/.test(c)))

    const { rows } = await pool.query('select provider, subject from identity where provider = $1', [
      'google'
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].subject, 'g-1')

    const sessCookie = cookiePair(setCookies.find((c) => c.startsWith('tracy_sess=')))
    const me = await app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie: sessCookie } }))
    const account = (await pool.query("select id from account where email = 'ceo@tracy.ai'")).rows[0]
    assert.deepEqual(await me.json(), {
      email: 'ceo@tracy.ai',
      defaultSite: null,
      name: null,
      face: personFace({ id: account.id, email: 'ceo@tracy.ai' })
    })
  }
)

test(
  'two sign-ins with the same GitHub subject, even under a different email the second time, land on ONE account',
  opts,
  async () => {
    const { pool } = db
    const first = fakeProvider({
      githubEmails: [{ email: 'ceo@tracy.ai', primary: true, verified: true }],
      githubUser: { id: 777 }
    })
    const { app } = harness(pool, { fetchImpl: first.fetchImpl })

    async function signIn(fetchImplOverride) {
      const app2 = fetchImplOverride ? harness(pool, { fetchImpl: fetchImplOverride }).app : app
      const started = await app2.fetch(new Request('http://tracy.test/signin/github'))
      const state = new URL(started.headers.get('location')).searchParams.get('state')
      const cookie = cookiePair(started.headers.get('set-cookie'))
      return app2.fetch(
        new Request(`http://tracy.test/signin/github/callback?state=${state}&code=x`, {
          headers: { cookie }
        })
      )
    }

    const firstLogin = await signIn()
    assert.equal(firstLogin.status, 302)

    // Same GitHub numeric id, but GitHub now reports a DIFFERENT verified primary email — a
    // realistic case (the person changed their primary email at GitHub). The identity table's
    // whole reason to exist is that this must still be the SAME account, not a second one.
    const second = fakeProvider({
      githubEmails: [{ email: 'lee-new@tracy.test', primary: true, verified: true }],
      githubUser: { id: 777 }
    })
    const secondLogin = await signIn(second.fetchImpl)
    assert.equal(secondLogin.status, 302)

    const { rows: identities } = await pool.query(
      'select account_id from identity where provider = $1 and subject = $2',
      ['github', '777']
    )
    assert.equal(identities.length, 1) // upsert, not a second row
    const { rows: accounts } = await pool.query(
      'select count(*)::int as n from account where email in ($1, $2)',
      ['ceo@tracy.ai', 'lee-new@tracy.test']
    )
    assert.equal(accounts[0].n, 1) // only the FIRST email's account exists — no second was created
  }
)

test(
  'signin/:provider/callback: no state cookie at all -> 400 (the login-CSRF case: an attacker-issued state+code replayed on a fresh browser)',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeProvider({
      googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-1' }
    })
    const { app } = harness(pool, { fetchImpl })
    const started = await app.fetch(new Request('http://tracy.test/signin/google'))
    const state = new URL(started.headers.get('location')).searchParams.get('state')
    // No cookie at all — as if a victim's browser followed a link an attacker built from their OWN
    // (attacker's) successful /signin/google redirect.
    const cb = await app.fetch(
      new Request(`http://tracy.test/signin/google/callback?state=${state}&code=abc`)
    )
    assert.equal(cb.status, 400)
    assert.deepEqual(await cb.json(), { code: 'OAUTH_STATE_INVALID' })
  }
)

test(
  'signin/:provider/callback: cookie present but does not match the state param -> 400',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeProvider({
      googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-1' }
    })
    const { app } = harness(pool, { fetchImpl })
    const started = await app.fetch(new Request('http://tracy.test/signin/google'))
    const state = new URL(started.headers.get('location')).searchParams.get('state')
    const cb = await app.fetch(
      new Request(`http://tracy.test/signin/google/callback?state=${state}&code=abc`, {
        headers: { cookie: 'tracy_oauth_state=not-the-right-value' }
      })
    )
    assert.equal(cb.status, 400)
    assert.deepEqual(await cb.json(), { code: 'OAUTH_STATE_INVALID' })
  }
)

test('signin/:provider/callback: a state nobody ever issued -> 400', opts, async () => {
  const { pool } = db
  const { app } = harness(pool, {})
  const cb = await app.fetch(
    new Request('http://tracy.test/signin/google/callback?state=made-up&code=abc', {
      headers: { cookie: 'tracy_oauth_state=made-up' }
    })
  )
  assert.equal(cb.status, 400)
  assert.equal(cb.headers.get('referrer-policy'), 'no-referrer')
  assert.deepEqual(await cb.json(), { code: 'OAUTH_STATE_INVALID' })
})

test('signin/:provider/callback: an expired state -> 400', opts, async () => {
  const { pool } = db
  let now = Date.parse('2026-01-01T00:00:00Z')
  const { fetchImpl } = fakeProvider({
    googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-1' }
  })
  const { app } = harness(pool, { fetchImpl, now: () => now })
  const started = await app.fetch(new Request('http://tracy.test/signin/google'))
  const state = new URL(started.headers.get('location')).searchParams.get('state')
  const cookie = cookiePair(started.headers.get('set-cookie'))
  now += 11 * 60 * 1000 // past the 10-minute TTL
  const cb = await app.fetch(
    new Request(`http://tracy.test/signin/google/callback?state=${state}&code=abc`, { headers: { cookie } })
  )
  assert.equal(cb.status, 400)
  assert.deepEqual(await cb.json(), { code: 'OAUTH_STATE_INVALID' })
})

test(
  'signin/:provider/callback: a state is single-use — the second attempt with the same state+cookie fails',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeProvider({
      googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-1' }
    })
    const { app } = harness(pool, { fetchImpl })
    const started = await app.fetch(new Request('http://tracy.test/signin/google'))
    const state = new URL(started.headers.get('location')).searchParams.get('state')
    const cookie = cookiePair(started.headers.get('set-cookie'))
    const url = `http://tracy.test/signin/google/callback?state=${state}&code=abc`
    const firstAttempt = await app.fetch(new Request(url, { headers: { cookie } }))
    assert.equal(firstAttempt.status, 302)
    const secondAttempt = await app.fetch(new Request(url, { headers: { cookie } }))
    assert.equal(secondAttempt.status, 400)
    assert.deepEqual(await secondAttempt.json(), { code: 'OAUTH_STATE_INVALID' })
  }
)

test(
  'signin/:provider/callback: a state issued for google cannot be redeemed on the github door',
  opts,
  async () => {
    const { pool } = db
    const { app } = harness(pool, {})
    const started = await app.fetch(new Request('http://tracy.test/signin/google'))
    const state = new URL(started.headers.get('location')).searchParams.get('state')
    const cookie = cookiePair(started.headers.get('set-cookie'))
    const cb = await app.fetch(
      new Request(`http://tracy.test/signin/github/callback?state=${state}&code=abc`, {
        headers: { cookie }
      })
    )
    assert.equal(cb.status, 400)
    assert.deepEqual(await cb.json(), { code: 'OAUTH_STATE_INVALID' })
  }
)

test(
  'signin/:provider and its callback 404 for an unconfigured provider and for an unknown one',
  opts,
  async () => {
    const { pool } = db
    const bareEnv = { ...env, GITHUB_OAUTH_CLIENT_ID: '', GITHUB_OAUTH_CLIENT_SECRET: '' }
    const app = buildApp({
      config: readConfig(bareEnv),
      identity: pgIdentityStore(pool),
      pool,
      mail: { send: async () => {} },
      sites: dbSitesResolver(pool, readConfig(bareEnv))
    })
    assert.equal((await app.fetch(new Request('http://tracy.test/signin/github'))).status, 404)
    assert.equal((await app.fetch(new Request('http://tracy.test/signin/github/callback'))).status, 404)
    assert.equal((await app.fetch(new Request('http://tracy.test/signin/facebook'))).status, 404)
  }
)

test(
  'a response from the callback door never carries the client secret, in success or in error',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeProvider({
      googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-9' }
    })
    const { app } = harness(pool, { fetchImpl })
    const bodies = []

    const started = await app.fetch(new Request('http://tracy.test/signin/google'))
    bodies.push(JSON.stringify([...started.headers.entries()]))
    const state = new URL(started.headers.get('location')).searchParams.get('state')
    const cookie = cookiePair(started.headers.get('set-cookie'))

    const ok = await app.fetch(
      new Request(`http://tracy.test/signin/google/callback?state=${state}&code=abc`, {
        headers: { cookie }
      })
    )
    bodies.push(await ok.clone().text())
    bodies.push(JSON.stringify([...ok.headers.entries()]))

    const badState = await app.fetch(new Request('http://tracy.test/signin/google/callback?state=x&code=abc'))
    bodies.push(await badState.clone().text())

    for (const body of bodies) for (const secret of SECRETS) assert.ok(!body.includes(secret), body)
  }
)

// ── Fix round 1 (Critical): the open redirect through `next`, backslash-folding vectors ─────────
//
// `safePath()` used to be a prefix blocklist (`startsWith('/') && !startsWith('//')`), which
// missed `/\evil.com` — the WHATWG URL parser folds a backslash into a forward slash when
// resolving a relative reference against an http(s) base, so that value survived a full sign-in
// and came back as `302 Location: /\evil.com`, which every browser resolves to `http://evil.com/`.
//
// ── Fix round 2 (Critical, reopened): the dot-segment vectors ───────────────────────────────────
//
// Round 1's fix resolved `raw` against `origin` and checked the RESULT's origin — sound, but it
// then returned `${resolved.pathname}${resolved.search}`, a bare relative string. For `.//evil.com`
// and `/..//evil.com` the WHATWG dot-segment algorithm reduces `pathname` to the literal text
// `//evil.com`: a same-origin RESULT, but a STRING that a second parser — `c.redirect(...)`'s
// `Location` header, `loginPage`'s `location.href=` — resolves all over again with no memory that
// it was ever checked, and a bare value starting with `//` is scheme-relative to every browser,
// full stop. The fix now returns an ABSOLUTE same-origin URL (`origin + pathname + search`)
// instead of a relative path: an absolute URL's scheme and authority are already fixed in the
// string, so there is no second resolution step left for a `//`-shaped pathname to be mistaken for
// a fresh authority — this closes the whole class of "checked value, re-resolved by a consumer
// that forgot it was checked", not just the one dot-segment shape of it.
//
// Every vector here is checked against the ACTUAL `Location` header of a completed sign-in and the
// ACTUAL string embedded in `/login`'s rendered page — not merely that some function returned a
// particular string.

const OPEN_REDIRECT_VECTORS = [
  // Round 1: backslash-folding.
  '//evil.com',
  '/\\evil.com',
  '/\\/evil.com',
  '\\\\evil.com',
  'https://evil.com',
  'http:/\\evil.com',
  '\t//evil.com',
  '\n//evil.com',
  '%2F%2Fevil.com',
  // Round 2: dot-segment reduction to a `//`-shaped pathname.
  './/evil.com',
  '/..//evil.com',
  '/.//evil.com',
  '//./evil.com',
  '/..//..//evil.com'
]

/**
 * The rule fix round 2 enforces: a `next` candidate is safe only if the STRING ultimately handed
 * to a browser can never itself name another origin — not merely that resolving it once, here,
 * happens to land on ours. Checked two ways, matching the two places this value is consumed
 * un-re-checked: it must not start with `//` (scheme-relative to every browser, regardless of what
 * document it appears in), and parsing it fresh (as a second consumer would, with no memory that
 * anyone already checked it) must still land on this app's own origin.
 */
function assertNeverLeavesOrigin(value, why) {
  assert.ok(!value.startsWith('//'), `${why}: itself scheme-relative (starts with //): ${value}`)
  assert.equal(new URL(value, 'http://tracy.test').origin, 'http://tracy.test', `${why}: ${value}`)
}

test('safePath: a fast, direct check on the pure function, for every vector', () => {
  const origin = 'http://tracy.test'
  for (const raw of [...OPEN_REDIRECT_VECTORS, undefined, null, '']) {
    assertNeverLeavesOrigin(safePath(raw, origin), JSON.stringify(raw))
  }
  // A legitimate path survives with its query, and resolving the returned value lands on exactly
  // that page — "intact" is checked by what it resolves to, not by exact-string equality, since
  // the fix now always returns an absolute URL.
  const legit = new URL(safePath('/wpdemo.localhost/agent?x=1', origin))
  assert.equal(legit.origin, origin)
  assert.equal(legit.pathname, '/wpdemo.localhost/agent')
  assert.equal(legit.search, '?x=1')
  // A percent-encoded slash is never decoded into a path separator by the URL parser — it stays a
  // literal, harmless, same-origin path.
  assert.equal(new URL(safePath('%2F%2Fevil.com', origin)).pathname, '/%2F%2Fevil.com')
})

test(
  'signin/google -> callback: every open-redirect vector in `next` lands the FINAL Location on tracy.test, never evil.com',
  opts,
  async () => {
    const { pool } = db
    for (const next of OPEN_REDIRECT_VECTORS) {
      const { fetchImpl } = fakeProvider({
        googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-redirect' }
      })
      const { app } = harness(pool, { fetchImpl })
      const startUrl = new URL('http://tracy.test/signin/google')
      startUrl.searchParams.set('next', next)
      const started = await app.fetch(new Request(startUrl))
      assert.equal(started.status, 302)
      const state = new URL(started.headers.get('location')).searchParams.get('state')
      const cookie = cookiePair(started.headers.get('set-cookie'))
      const cb = await app.fetch(
        new Request(`http://tracy.test/signin/google/callback?state=${state}&code=abc`, {
          headers: { cookie }
        })
      )
      assert.equal(cb.status, 302, `next=${JSON.stringify(next)}`)
      assertNeverLeavesOrigin(cb.headers.get('location'), `next=${JSON.stringify(next)}`)
    }
  }
)

test(
  'signin/google -> callback: a legitimate next survives intact — same page, same query',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeProvider({
      googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-legit' }
    })
    const { app } = harness(pool, { fetchImpl })
    const startUrl = new URL('http://tracy.test/signin/google')
    startUrl.searchParams.set('next', '/wpdemo.localhost/agent?x=1')
    const started = await app.fetch(new Request(startUrl))
    const state = new URL(started.headers.get('location')).searchParams.get('state')
    const cookie = cookiePair(started.headers.get('set-cookie'))
    const cb = await app.fetch(
      new Request(`http://tracy.test/signin/google/callback?state=${state}&code=abc`, {
        headers: { cookie }
      })
    )
    assert.equal(cb.status, 302)
    const location = new URL(cb.headers.get('location'), 'http://tracy.test')
    assert.equal(location.origin, 'http://tracy.test')
    assert.equal(location.pathname, '/wpdemo.localhost/agent')
    assert.equal(location.search, '?x=1')
  }
)

test(
  'signin/google -> callback: an absent or empty next still lands somewhere sane (the root)',
  opts,
  async () => {
    const { pool } = db
    for (const next of [undefined, '']) {
      const { fetchImpl } = fakeProvider({
        googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-bare' }
      })
      const { app } = harness(pool, { fetchImpl })
      const startUrl = new URL('http://tracy.test/signin/google')
      if (next !== undefined) startUrl.searchParams.set('next', next)
      const started = await app.fetch(new Request(startUrl))
      const state = new URL(started.headers.get('location')).searchParams.get('state')
      const cookie = cookiePair(started.headers.get('set-cookie'))
      const cb = await app.fetch(
        new Request(`http://tracy.test/signin/google/callback?state=${state}&code=abc`, {
          headers: { cookie }
        })
      )
      assert.equal(cb.status, 302)
      const location = new URL(cb.headers.get('location'), 'http://tracy.test')
      assert.equal(location.origin, 'http://tracy.test')
      assert.equal(location.pathname, '/')
    }
  }
)

test(
  'GET /login: the client-side redirect it renders is sanitized the same way, for the same vectors',
  opts,
  async () => {
    const { pool } = db
    const { app } = harness(pool, {})
    for (const next of OPEN_REDIRECT_VECTORS) {
      const url = new URL('http://tracy.test/login')
      url.searchParams.set('next', next)
      const res = await app.fetch(new Request(url))
      const html = await res.text()
      const match = html.match(/location\.href=(".*?")/)
      assert.ok(match, `no location.href= found in the page for next=${JSON.stringify(next)}`)
      assertNeverLeavesOrigin(JSON.parse(match[1]), `login next=${JSON.stringify(next)}`)
    }
    // The legitimate case and the absent case land where expected, resolved the same way the
    // malicious vectors above are checked.
    for (const [next, expectPath, expectSearch] of [
      ['/wpdemo.localhost/agent?x=1', '/wpdemo.localhost/agent', '?x=1'],
      [undefined, '/', '']
    ]) {
      const url = new URL('http://tracy.test/login')
      if (next !== undefined) url.searchParams.set('next', next)
      const res = await app.fetch(new Request(url))
      const html = await res.text()
      const match = html.match(/location\.href=(".*?")/)
      const embedded = new URL(JSON.parse(match[1]), 'http://tracy.test')
      assert.equal(embedded.origin, 'http://tracy.test')
      assert.equal(embedded.pathname, expectPath)
      assert.equal(embedded.search, expectSearch)
    }
  }
)

// ── OAuth works without a database too — the same fallback the OTP door already has ────────────

test('sign-in with Google works in memory-store mode (no DATABASE_URL) — OAuth needs no pool', async () => {
  const store = memoryIdentityStore()
  const { fetchImpl } = fakeProvider({
    googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-1' }
  })
  const cfg = config()
  const app = buildApp({ config: cfg, identity: store, mail: { send: async () => {} }, fetchImpl })

  const started = await app.fetch(new Request('http://tracy.test/signin/google'))
  assert.equal(started.status, 302)
  const state = new URL(started.headers.get('location')).searchParams.get('state')
  const cookie = cookiePair(started.headers.get('set-cookie'))
  const cb = await app.fetch(
    new Request(`http://tracy.test/signin/google/callback?state=${state}&code=abc`, { headers: { cookie } })
  )
  assert.equal(cb.status, 302)
  assert.ok(cb.headers.getSetCookie().some((c) => c.startsWith('tracy_sess=v1.')))
})

// ── /auth/me's defaultSite: the first ACCEPTED seat, in granted-order ───────────────────────────

test('/auth/me: one accepted seat -> defaultSite is that site', opts, async () => {
  const { pool } = db
  const { app } = harness(pool, {})
  await pool.query(
    "insert into site (site_key, label, host) values ('wpdemo.localhost', 'wpdemo-1', 'local')"
  )
  const acct = (
    await pool.query(
      "insert into account (email) values ('ceo@tracy.ai') on conflict (email) do update set email = excluded.email returning id"
    )
  ).rows[0]
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('wpdemo.localhost', $1, 'owner', $1, now())`,
    [acct.id]
  )
  const { mintSession } = await import('../src/lib/session.js')
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', config().sessionSecret)}`
  const me = await app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie } }))
  assert.deepEqual(await me.json(), {
    email: 'ceo@tracy.ai',
    defaultSite: 'wpdemo.localhost',
    name: null,
    face: personFace({ id: acct.id, email: 'ceo@tracy.ai' })
  })
})

test('/auth/me: two accepted seats -> the earliest granted one wins', opts, async () => {
  const { pool } = db
  const { app } = harness(pool, {})
  await pool.query("insert into site (site_key, label, host) values ('a.test', 'a-1', 'local')")
  await pool.query("insert into site (site_key, label, host) values ('b.test', 'b-1', 'local')")
  const acct = (
    await pool.query(
      "insert into account (email) values ('ceo@tracy.ai') on conflict (email) do update set email = excluded.email returning id"
    )
  ).rows[0]
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, granted_at, accepted_at) values ('b.test', $1, 'owner', $1, now(), now())`,
    [acct.id]
  )
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, granted_at, accepted_at) values ('a.test', $1, 'owner', $1, now() - interval '1 hour', now())`,
    [acct.id]
  )
  const { mintSession } = await import('../src/lib/session.js')
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', config().sessionSecret)}`
  const me = await app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie } }))
  assert.deepEqual(await me.json(), {
    email: 'ceo@tracy.ai',
    defaultSite: 'a.test',
    name: null,
    face: personFace({ id: acct.id, email: 'ceo@tracy.ai' })
  })
})

test('/auth/me: a pending (not yet accepted) seat is not a default site', opts, async () => {
  const { pool } = db
  const { app } = harness(pool, {})
  await pool.query(
    "insert into site (site_key, label, host) values ('wpdemo.localhost', 'wpdemo-1', 'local')"
  )
  const acct = (
    await pool.query(
      "insert into account (email) values ('pending@tracy.test') on conflict (email) do update set email = excluded.email returning id"
    )
  ).rows[0]
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, requested_at) values ('wpdemo.localhost', $1, 'owner', $1, now())`,
    [acct.id]
  )
  const { mintSession } = await import('../src/lib/session.js')
  const cookie = `tracy_sess=${await mintSession('pending@tracy.test', config().sessionSecret)}`
  const me = await app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie } }))
  assert.deepEqual(await me.json(), {
    email: 'pending@tracy.test',
    defaultSite: null,
    name: null,
    face: personFace({ id: acct.id, email: 'pending@tracy.test' })
  })
})

// ── The account's face from the provider's profile (09/10/2026) ───────────────────────────────

/** One full Google/GitHub round on `app`, answering the session cookie it set. */
async function oauthRound(app, provider) {
  const started = await app.fetch(new Request(`http://tracy.test/signin/${provider}`))
  const state = new URL(started.headers.get('location')).searchParams.get('state')
  const cookie = cookiePair(started.headers.get('set-cookie'))
  const cb = await app.fetch(
    new Request(`http://tracy.test/signin/${provider}/callback?state=${state}&code=x`, {
      headers: { cookie }
    })
  )
  assert.equal(cb.status, 302)
  return cookiePair(cb.headers.getSetCookie().find((c) => c.startsWith('tracy_sess=')))
}

const G_PICTURE = 'https://lh3.googleusercontent.com/a/ACg8oc-lee=s96-c'
const GH_PICTURE = 'https://avatars.githubusercontent.com/u/777?v=4'

test(
  'a Google sign-in stores the picture and the name; /auth/me then answers Tracy’s address for the picture',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeProvider({
      googleClaims: {
        email: 'ceo@tracy.ai',
        email_verified: true,
        sub: 'g-1',
        name: 'Lee Nguyen',
        picture: G_PICTURE
      }
    })
    const { app } = harness(pool, { fetchImpl })
    const session = await oauthRound(app, 'google')
    const row = (
      await pool.query("select id, display_name, avatar_url from account where email = 'ceo@tracy.ai'")
    ).rows[0]
    assert.equal(row.avatar_url, G_PICTURE)
    assert.equal(row.display_name, 'Lee Nguyen')
    const me = await (
      await app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie: session } }))
    ).json()
    assert.equal(me.name, 'Lee Nguyen')
    assert.match(me.face.avatarUrl, new RegExp(`^/auth/avatar/${row.id}\\?v=[0-9a-f]{8}$`))
    // ...and that address answers the picture, read from the account row.
    const picture = await app.fetch(
      new Request(`http://tracy.test${me.face.avatarUrl}`, { headers: { cookie: session } })
    )
    assert.equal(picture.status, 200)
    assert.equal(picture.headers.get('content-type'), 'image/png')
  }
)

test(
  'a later GitHub sign-in refreshes the picture but never overwrites a name the account already has',
  opts,
  async () => {
    const { pool } = db
    const google = fakeProvider({
      googleClaims: {
        email: 'ceo@tracy.ai',
        email_verified: true,
        sub: 'g-1',
        name: 'Lee Nguyen',
        picture: G_PICTURE
      }
    })
    await oauthRound(harness(pool, { fetchImpl: google.fetchImpl }).app, 'google')
    // The person (or an admin) renamed the account since.
    await pool.query("update account set display_name = 'Brian' where email = 'ceo@tracy.ai'")
    const github = fakeProvider({
      githubEmails: [{ email: 'ceo@tracy.ai', primary: true, verified: true }],
      githubUser: { id: 777, name: 'Lee from GitHub', avatar_url: GH_PICTURE }
    })
    await oauthRound(harness(pool, { fetchImpl: github.fetchImpl }).app, 'github')
    const row = (
      await pool.query("select display_name, avatar_url from account where email = 'ceo@tracy.ai'")
    ).rows[0]
    assert.equal(row.display_name, 'Brian')
    assert.equal(row.avatar_url, GH_PICTURE)
  }
)

test(
  'a sign-in whose picture is no provider picture, or that sends none, leaves the stored picture alone',
  opts,
  async () => {
    const { pool } = db
    const first = fakeProvider({
      googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-1', picture: G_PICTURE }
    })
    await oauthRound(harness(pool, { fetchImpl: first.fetchImpl }).app, 'google')
    for (const picture of ['https://evil.example/x.png', undefined]) {
      const again = fakeProvider({
        googleClaims: { email: 'ceo@tracy.ai', email_verified: true, sub: 'g-1', picture }
      })
      await oauthRound(harness(pool, { fetchImpl: again.fetchImpl }).app, 'google')
    }
    const row = (
      await pool.query("select display_name, avatar_url from account where email = 'ceo@tracy.ai'")
    ).rows[0]
    assert.equal(row.avatar_url, G_PICTURE)
    assert.equal(row.display_name, null)
  }
)

test('memory-store mode keeps the picture and name too, so /auth/me shows the photo without a database', async () => {
  const store = memoryIdentityStore()
  const { fetchImpl } = fakeProvider({
    githubEmails: [{ email: 'ceo@tracy.ai', primary: true, verified: true }],
    githubUser: { id: 777, name: 'Lee N', avatar_url: GH_PICTURE }
  })
  const app = buildApp({ config: config(), identity: store, mail: { send: async () => {} }, fetchImpl })
  const session = await oauthRound(app, 'github')
  const me = await (
    await app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie: session } }))
  ).json()
  const account = await store.accountByEmail('ceo@tracy.ai')
  assert.equal(me.name, 'Lee N')
  assert.match(me.face.avatarUrl, new RegExp(`^/auth/avatar/${account.id}\\?v=[0-9a-f]{8}$`))
})

test('memory-store mode: a later sign-in refreshes the picture and never overwrites a name already set', async () => {
  const store = memoryIdentityStore()
  const google = fakeProvider({
    googleClaims: {
      email: 'ceo@tracy.ai',
      email_verified: true,
      sub: 'g-1',
      name: 'Lee Nguyen',
      picture: G_PICTURE
    }
  })
  await oauthRound(
    buildApp({
      config: config(),
      identity: store,
      mail: { send: async () => {} },
      fetchImpl: google.fetchImpl
    }),
    'google'
  )
  const github = fakeProvider({
    githubEmails: [{ email: 'ceo@tracy.ai', primary: true, verified: true }],
    githubUser: { id: 777, name: 'Lee from GitHub', avatar_url: GH_PICTURE }
  })
  await oauthRound(
    buildApp({
      config: config(),
      identity: store,
      mail: { send: async () => {} },
      fetchImpl: github.fetchImpl
    }),
    'github'
  )
  const account = await store.accountByEmail('ceo@tracy.ai')
  assert.equal(account.display_name, 'Lee Nguyen')
  assert.equal(await store.avatarSourceFor(account.id), GH_PICTURE)
})
