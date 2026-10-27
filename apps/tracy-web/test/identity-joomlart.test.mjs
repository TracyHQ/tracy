// "Login with JoomlArt" (`src/identity/route.js`, doors `/signin/joomlart` and
// `/signin/joomlart/callback`) through the whole app, the way a browser and aMember hit them:
// the state row, the `tracy_oauth_state` cookie, the signed redirect out, the signed redirect back,
// the `identity` row, the session cookie. aMember is played by `respond()`, signing with the same
// shared secret the way `JoomlartSso_Payload::buildResponse` does.
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore, pgIdentityStore } from '../src/identity/store.js'
import { decodePayload, encodePayload, sign, verify } from '../src/identity/joomlart-sso.js'
import { parseCookies } from '../src/lib/cookies.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pgOnly = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const SECRET = 'dev-joomlart-sso-shared-secret-change-me'
const AUTHORIZE = 'https://www.joomlart.com/member/sso/v1/authorize'
const ORIGIN = 'http://tracy.test'
const CLOCK = Date.parse('2026-10-10T08:00:00Z')

const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  JOOMLART_SSO_URL: AUTHORIZE,
  JOOMLART_SSO_SECRET: SECRET,
  JOOMLART_SSO_CLIENT: 'tracy-dev'
}

const quiet = { warn() {}, log() {}, error() {} }

/** aMember's by-email answer for someone who is not a member: the beta gate says "waitlist". */
const NOT_A_MEMBER = { ok: true, user_id: 12, subscriptions: [] }

function harness({
  extra = {},
  now = () => CLOCK,
  identity = memoryIdentityStore(),
  pool,
  amember = NOT_A_MEMBER
} = {}) {
  const sent = []
  const app = buildApp({
    config: readConfig({ ...env, ...extra }),
    identity,
    ...(pool ? { pool } : {}),
    mail: { send: async (letter) => sent.push(letter) },
    now,
    signalNow: now,
    fetchImpl: async () => new Response(JSON.stringify(amember), { status: 200 }),
    log: quiet
  })
  const get = (path, headers = {}) =>
    app.fetch(new Request(`${ORIGIN}${path}`, { headers, redirect: 'manual' }))
  return { app, get, sent, identity }
}

/** The outcome of `GET /signin/joomlart`: the cookie to send back, and what was signed. */
async function start(get, next = '/agent') {
  const res = await get(`/signin/joomlart?next=${encodeURIComponent(next)}`)
  const setCookie = res.headers.get('set-cookie') ?? ''
  const cookie = setCookie.split(';')[0]
  const location = res.headers.get('location')
  const url = location ? new URL(location) : null
  const payload = url ? decodePayload(url.searchParams.get('sso')) : null
  return { res, setCookie, cookie, url, payload, nonce: payload?.nonce ?? '' }
}

/** aMember's signed answer, the way `JoomlartSso_Payload::buildResponse` writes it. */
function respond(fields, secret = SECRET) {
  const entitlement = fields.entitlement ?? []
  const sso = encodePayload([
    ['nonce', fields.nonce ?? ''],
    ['external_id', fields.external_id ?? '9001'],
    ['email', fields.email ?? 'fixture@example.com'],
    ['email_verified', fields.email_verified === false ? 'false' : 'true'],
    ['username', fields.username ?? 'fixt'],
    ['name', fields.name ?? 'Fixture User'],
    ['entitlement', typeof entitlement === 'string' ? entitlement : JSON.stringify(entitlement)]
  ])
  return { sso, sig: sign(sso, secret) }
}

function callbackPath({ sso, sig }, extra = '') {
  return `/signin/joomlart/callback?sso=${encodeURIComponent(sso)}&sig=${encodeURIComponent(sig)}${extra}`
}

const sessionCookieOf = (res) => res.headers.getSetCookie().find((c) => c.startsWith('tracy_sess=')) ?? null
const stateCookieOf = (res) =>
  res.headers.getSetCookie().find((c) => c.startsWith('tracy_oauth_state=')) ?? null

/** A whole round for one person: start, answer, and the callback response. */
async function signIn(get, fields = {}, next = '/agent') {
  const started = await start(get, next)
  const res = await get(callbackPath(respond({ nonce: started.nonce, ...fields })), {
    cookie: started.cookie
  })
  return { started, res }
}

// ── feature off ────────────────────────────────────────────────────────────────────────────────

test('with no JOOMLART_SSO_* the two doors do not exist: 404, no cookie, no redirect', async () => {
  const { get } = harness({ extra: { JOOMLART_SSO_URL: '', JOOMLART_SSO_SECRET: '' } })
  const started = await get('/signin/joomlart?next=/agent')
  assert.equal(started.status, 404)
  assert.equal(started.headers.get('set-cookie'), null)
  assert.equal(started.headers.get('location'), null)
  const back = await get(callbackPath(respond({ nonce: 'x' })))
  assert.equal(back.status, 404)
  assert.equal(back.headers.get('set-cookie'), null)
})

// ── start ──────────────────────────────────────────────────────────────────────────────────────

test('start: a 32-byte nonce, a state cookie, and a signed redirect to aMember with return_url = origin + callback', async () => {
  const { get } = harness()
  const { res, setCookie, url, payload, nonce } = await start(get, '/agent?site=x')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(`${url.origin}${url.pathname}`, AUTHORIZE)
  assert.equal(url.searchParams.get('client'), 'tracy-dev')
  assert.deepEqual([...url.searchParams.keys()].sort(), ['client', 'sig', 'sso'])
  // The signature is over the base64 string exactly as it rides in the URL.
  assert.equal(verify(url.searchParams.get('sso'), url.searchParams.get('sig'), SECRET), true)
  assert.deepEqual(Object.keys(payload), ['nonce', 'return_url', 'exp'])
  assert.equal(payload.return_url, `${ORIGIN}/signin/joomlart/callback`)
  assert.equal(payload.exp, String(Math.floor(CLOCK / 1000) + 5 * 60))
  assert.match(nonce, /^[A-Za-z0-9_-]{43}$/) // 32 random bytes, base64url, unpadded
  assert.match(setCookie, /^tracy_oauth_state=/)
  assert.equal(parseCookies(setCookie.split(';')[0]).get('tracy_oauth_state'), nonce)
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Lax/)
})

test('start: two starts get two different nonces', async () => {
  const { get } = harness()
  const a = await start(get)
  const b = await start(get)
  assert.notEqual(a.nonce, b.nonce)
})

test('start: production says it is client `tracy`, and its callback is on its own origin', async () => {
  const app = buildApp({
    config: readConfig({
      ...env,
      TRACY_ORIGIN: 'https://cowork.tracy.ai',
      SITE_DOMAIN: 'tracy.ai',
      JOOMLART_SSO_CLIENT: 'tracy'
    }),
    identity: memoryIdentityStore(),
    mail: { send: async () => {} },
    now: () => CLOCK,
    log: quiet
  })
  const res = await app.fetch(new Request('https://cowork.tracy.ai/signin/joomlart', { redirect: 'manual' }))
  const url = new URL(res.headers.get('location'))
  assert.equal(url.searchParams.get('client'), 'tracy')
  assert.equal(
    decodePayload(url.searchParams.get('sso')).return_url,
    'https://cowork.tracy.ai/signin/joomlart/callback'
  )
})

// ── callback: the happy path ───────────────────────────────────────────────────────────────────

test('callback: a correctly signed answer sets the session cookie, clears the state cookie and goes to next', async () => {
  const { app, get } = harness()
  const { started, res } = await signIn(get, {}, '/agent?site=x')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), `${ORIGIN}/agent?site=x`)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
  const session = sessionCookieOf(res)
  assert.match(session, /^tracy_sess=v1\./)
  assert.match(stateCookieOf(res), /Max-Age=0/)
  // The session is a real one: /auth/me reads the address aMember vouched for.
  const me = await app.fetch(new Request(`${ORIGIN}/auth/me`, { headers: { cookie: session.split(';')[0] } }))
  assert.equal(me.status, 200)
  const body = await me.json()
  assert.equal(body.email, 'fixture@example.com')
  assert.equal(body.name, 'Fixture User')
  // The payload never comes back in any header a log line would echo.
  for (const [, value] of res.headers)
    assert.ok(!value.includes(started.nonce) || value.startsWith('tracy_oauth_state='))
})

test('callback: the same external_id keeps its account when aMember reports a new email', async () => {
  const { app, get } = harness()
  const first = await signIn(get, { external_id: '77', email: 'old@example.com' })
  assert.equal(first.res.status, 302)
  const second = await signIn(get, { external_id: '77', email: 'new@example.com' })
  assert.equal(second.res.status, 302)
  const me = await app.fetch(
    new Request(`${ORIGIN}/auth/me`, { headers: { cookie: sessionCookieOf(second.res).split(';')[0] } })
  )
  assert.equal((await me.json()).email, 'old@example.com')
})

// ── callback: every refusal, and no session cookie on any of them ──────────────────────────────

const refused = (res, status, code) => {
  assert.equal(res.status, status)
  assert.equal(sessionCookieOf(res), null)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
  return res.json().then((body) => assert.equal(body.code, code))
}

test('callback: a wrong signature is refused before any state is touched, so a real answer can still follow', async () => {
  const { get } = harness()
  const started = await start(get)
  const forged = respond({ nonce: started.nonce, email: 'attacker@example.com' }, 'not-the-secret')
  await refused(await get(callbackPath(forged), { cookie: started.cookie }), 400, 'SSO_INVALID')
  const real = await get(callbackPath(respond({ nonce: started.nonce })), { cookie: started.cookie })
  assert.equal(real.status, 302)
})

test('callback: a tampered payload under a valid-looking signature is refused', async () => {
  const { get } = harness()
  const started = await start(get)
  const { sso, sig } = respond({ nonce: started.nonce })
  const query = Buffer.from(sso, 'base64').toString('utf8')
  assert.match(query, /email=fixture%40example\.com/) // the replacement below really changes a byte
  const tampered = Buffer.from(query.replace('fixture%40', 'other%40')).toString('base64')
  await refused(
    await get(callbackPath({ sso: tampered, sig }), { cookie: started.cookie }),
    400,
    'SSO_INVALID'
  )
})

test('callback: no state cookie → refused, even with a perfectly signed answer', async () => {
  const { get } = harness()
  const started = await start(get)
  await refused(await get(callbackPath(respond({ nonce: started.nonce }))), 400, 'OAUTH_STATE_INVALID')
})

test('callback: a nonce nobody started → refused', async () => {
  const { get } = harness()
  const nonce = 'A'.repeat(43)
  await refused(
    await get(callbackPath(respond({ nonce })), { cookie: `tracy_oauth_state=${nonce}` }),
    400,
    'OAUTH_STATE_INVALID'
  )
})

test("callback: the nonce inside the signed payload must be the cookie's own", async () => {
  const { get } = harness()
  const victim = await start(get)
  const attacker = await start(get)
  // The victim's browser carries the victim's cookie, the URL carries an answer for another round.
  await refused(
    await get(callbackPath(respond({ nonce: attacker.nonce })), { cookie: victim.cookie }),
    400,
    'OAUTH_STATE_INVALID'
  )
})

test('callback: a round older than its exp is refused', async () => {
  let t = CLOCK
  const { get } = harness({ now: () => t })
  const started = await start(get)
  t += 5 * 60 * 1000 + 1
  await refused(
    await get(callbackPath(respond({ nonce: started.nonce })), { cookie: started.cookie }),
    400,
    'OAUTH_STATE_INVALID'
  )
})

test('callback: a replay of the same signed answer loses', async () => {
  const { get } = harness()
  const started = await start(get)
  const answer = respond({ nonce: started.nonce })
  assert.equal((await get(callbackPath(answer), { cookie: started.cookie })).status, 302)
  await refused(await get(callbackPath(answer), { cookie: started.cookie }), 400, 'OAUTH_STATE_INVALID')
})

test('callback: of two concurrent callbacks for one nonce exactly one signs in', async () => {
  const { get } = harness()
  const started = await start(get)
  const answer = respond({ nonce: started.nonce })
  const [a, b] = await Promise.all([
    get(callbackPath(answer), { cookie: started.cookie }),
    get(callbackPath(answer), { cookie: started.cookie })
  ])
  assert.deepEqual([a.status, b.status].sort(), [302, 400])
  assert.equal([a, b].filter((res) => sessionCookieOf(res)).length, 1)
})

test('callback: email_verified=false is refused with a sentence that sends the person to joomlart.com', async () => {
  const { get } = harness()
  const started = await start(get)
  const answer = respond({ nonce: started.nonce, email_verified: false })
  await refused(await get(callbackPath(answer), { cookie: started.cookie }), 400, 'EMAIL_NOT_VERIFIED')
  // The same refusal as a page, for a browser navigation.
  const again = await start(get)
  const page = await get(callbackPath(respond({ nonce: again.nonce, email_verified: false })), {
    cookie: again.cookie,
    accept: 'text/html'
  })
  assert.equal(page.status, 400)
  assert.equal(sessionCookieOf(page), null)
  const html = await page.text()
  assert.match(html, /joomlart\.com/)
  assert.match(html, /JoomlArt/)
})

test('callback: email_verified is only ever the exact string "true"', async () => {
  const { get } = harness()
  const started = await start(get)
  const sso = encodePayload([
    ['nonce', started.nonce],
    ['external_id', '1'],
    ['email', 'a@example.com'],
    ['email_verified', 'True'],
    ['username', 'a'],
    ['name', 'A'],
    ['entitlement', '[]']
  ])
  await refused(
    await get(callbackPath({ sso, sig: sign(sso, SECRET) }), { cookie: started.cookie }),
    400,
    'EMAIL_NOT_VERIFIED'
  )
})

test('callback: a missing external_id or email is refused', async () => {
  const { get } = harness()
  for (const fields of [{ external_id: '' }, { email: '' }, { email: 'not an address' }]) {
    const started = await start(get)
    await refused(
      await get(callbackPath(respond({ nonce: started.nonce, ...fields })), { cookie: started.cookie }),
      400,
      'SSO_INVALID'
    )
  }
})

test('callback: next comes from the state row through safePath, never from the query', async () => {
  const { get } = harness()
  for (const bad of ['//evil.com', 'https://evil.com/x', '/\\evil.com', 'javascript:alert(1)']) {
    const { res } = await signIn(get, {}, bad)
    assert.equal(res.status, 302, bad)
    assert.equal(res.headers.get('location'), `${ORIGIN}/`, bad)
  }
  const started = await start(get, '/agent')
  const res = await get(callbackPath(respond({ nonce: started.nonce }), '&next=https://evil.com'), {
    cookie: started.cookie
  })
  assert.equal(res.headers.get('location'), `${ORIGIN}/agent`)
})

test('start: the referring page rides on a template next and comes back from the callback', async () => {
  const { get } = harness()
  const next = '/new?template=ja-kinetic&platform=joomla'
  const page = 'https://www.joomlart.com/joomla/templates/ja-kinetic'
  const round = async (query, headers = {}) => {
    const res = await get(`/signin/joomlart?next=${encodeURIComponent(next)}${query}`, headers)
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
    const nonce = decodePayload(new URL(res.headers.get('location')).searchParams.get('sso')).nonce
    const back = await get(callbackPath(respond({ nonce })), { cookie })
    assert.equal(back.status, 302)
    return new URL(back.headers.get('location'))
  }
  // An explicit ref wins over the browser's Referer.
  const explicit = await round(`&ref=${encodeURIComponent(page)}`, { referer: 'https://www.joomlart.com/' })
  assert.equal(explicit.origin, ORIGIN)
  assert.equal(explicit.pathname, '/new')
  assert.equal(explicit.searchParams.get('template'), 'ja-kinetic')
  assert.equal(explicit.searchParams.get('ref'), page)
  // joomlart.com sets no Referrer-Policy: a browser sends its origin only, and that is kept.
  const origin = await round('', { referer: 'https://www.joomlart.com/' })
  assert.equal(origin.searchParams.get('ref'), 'https://www.joomlart.com/')
  // Nothing usable → no ref; a script URL is never carried.
  assert.equal((await round('&ref=javascript%3Aalert(1)')).searchParams.get('ref'), null)
  // Our own pages are not a referrer.
  assert.equal((await round('', { referer: `${ORIGIN}/login` })).searchParams.get('ref'), null)
})

test('start: a ref never turns next into another origin', async () => {
  const { get } = harness()
  for (const bad of ['//evil.com', 'https://evil.com/new?template=x']) {
    const res = await get(
      `/signin/joomlart?next=${encodeURIComponent(bad)}&ref=${encodeURIComponent('https://evil.com/')}`
    )
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
    const nonce = decodePayload(new URL(res.headers.get('location')).searchParams.get('sso')).nonce
    const back = await get(callbackPath(respond({ nonce })), { cookie })
    assert.equal(back.headers.get('location'), `${ORIGIN}/`, bad)
  }
})

// ── admission ──────────────────────────────────────────────────────────────────────────────────

const GATE_ON = {
  BETA_GATE: 'on',
  AMEMBER_API_KEY: 'k',
  BETA_WAITLIST_URL: 'https://landing.test/early-access/',
  TRACY_ENVIRONMENT: 'dev'
}

test('beta gate on: a paid, unexpired entitlement admits the person without asking aMember by email', async () => {
  const { get, sent } = harness({ extra: GATE_ON })
  const entitlement = [
    { product_id: '42', name: 'Dev Club', expires_at: null, paid: true },
    { product_id: '7', name: 'Old', expires_at: '2020-01-01T00:00:00+00:00', paid: true }
  ]
  const { res } = await signIn(get, { entitlement })
  assert.equal(res.status, 302)
  assert.match(sessionCookieOf(res), /^tracy_sess=v1\./)
  assert.equal(sent.length, 0)
})

test('legacy beta gate on: free, expired and absent memberships still receive a session', async () => {
  const { get } = harness({ extra: GATE_ON })
  for (const entitlement of [
    [],
    [{ product_id: '42', name: 'Trial', expires_at: null, paid: false }],
    [{ product_id: '42', name: 'Lapsed', expires_at: '2026-10-09T00:00:00+00:00', paid: true }],
    [{ product_id: '42', name: 'No paid flag', expires_at: null }],
    'not json'
  ]) {
    const { res } = await signIn(get, { entitlement })
    assert.equal(res.status, 302, JSON.stringify(entitlement))
    assert.match(sessionCookieOf(res), /^tracy_sess=v1\./)
    assert.equal(new URL(res.headers.get('location'), ORIGIN).pathname, '/agent')
  }
})

test('beta gate on: no entitlement, but aMember by email says member → admitted by the gate', async () => {
  const { get } = harness({
    extra: GATE_ON,
    amember: { ok: true, user_id: 12, subscriptions: { 10: '2027-03-14' } }
  })
  const { res } = await signIn(get, { entitlement: [] })
  assert.equal(res.status, 302)
  assert.match(sessionCookieOf(res), /^tracy_sess=v1\./)
})

// ── the database twin: the identity row and its entitlement ────────────────────────────────────

test(
  'pg: the callback links provider joomlart to the account and keeps the entitlement on the identity row',
  pgOnly,
  async () => {
    const pool = db.pool
    const { get } = harness({ identity: pgIdentityStore(pool), pool })
    const entitlement = [{ product_id: '42', name: 'Dev Club', expires_at: null, paid: true }]
    const { res } = await signIn(get, { external_id: '9001', entitlement })
    assert.equal(res.status, 302)
    const { rows } = await pool.query(
      `select acc.email, i.entitlement from identity i join account acc on acc.id = i.account_id
     where i.provider = 'joomlart' and i.subject = '9001'`
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].email, 'fixture@example.com')
    assert.deepEqual(rows[0].entitlement, entitlement)
    // A later sign-in replaces it with what aMember says now.
    const later = await signIn(get, { external_id: '9001', entitlement: [] })
    assert.equal(later.res.status, 302)
    const again = await pool.query(
      `select entitlement from identity where provider = 'joomlart' and subject = '9001'`
    )
    assert.deepEqual(again.rows[0].entitlement, [])
  }
)

test('pg: a replay against the database row loses too', pgOnly, async () => {
  const pool = db.pool
  const { get } = harness({ identity: pgIdentityStore(pool), pool })
  const started = await start(get)
  const answer = respond({ nonce: started.nonce })
  assert.equal((await get(callbackPath(answer), { cookie: started.cookie })).status, 302)
  await refused(await get(callbackPath(answer), { cookie: started.cookie }), 400, 'OAUTH_STATE_INVALID')
})

test('callback: a round started for /new?template=<id> leaves that template waiting on the account', async () => {
  const { get, identity } = harness()
  const { res } = await signIn(get, {}, '/new?template=ja-kinetic')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), `${ORIGIN}/new?template=ja-kinetic`)
  // The round names no platform: the app's landing picks the template's default quickstart.
  assert.deepEqual(await identity.peekDesktopIntent('fixture@example.com'), {
    template: 'ja-kinetic',
    platform: null
  })
  // Consumed once by the template page; the root landing does not send the person there again.
  assert.equal(await identity.takeDesktopIntent('fixture@example.com', 'ja-kinetic'), 'ja-kinetic')
  assert.equal(await identity.peekDesktopIntent('fixture@example.com'), null)
})

/**
 * Both stores keep the template waiting on an account the same way: the platform the page named
 * rides with it (null = unsaid), the newest row wins, and `take` consumes it once.
 * @param {ReturnType<typeof memoryIdentityStore>} identity
 */
async function intentRoundTrip(identity) {
  const account = await identity.touchAccount('intent@example.com')
  await identity.putDesktopIntent(account.id, 'ja-kinetic', 'wordpress')
  assert.deepEqual(await identity.peekDesktopIntent('intent@example.com'), {
    template: 'ja-kinetic',
    platform: 'wordpress'
  })
  await identity.putDesktopIntent(account.id, 'ja-civica')
  assert.deepEqual(await identity.peekDesktopIntent('intent@example.com'), {
    template: 'ja-civica',
    platform: null
  })
  assert.equal(await identity.takeDesktopIntent('intent@example.com', 'ja-kinetic'), null)
  assert.equal(await identity.takeDesktopIntent('intent@example.com', 'ja-civica'), 'ja-civica')
  assert.equal(await identity.peekDesktopIntent('intent@example.com'), null)
  assert.equal(await identity.peekDesktopIntent('nobody@example.com'), null)
}

test('store: a waiting template carries its platform, the newest wins, take consumes it', async () => {
  await intentRoundTrip(memoryIdentityStore())
})

test('pg: a waiting template carries its platform, the newest wins, take consumes it', pgOnly, async () => {
  await intentRoundTrip(pgIdentityStore(db.pool))
})

test('callback: a next that is not a template ask leaves nothing waiting', async () => {
  const { get, identity } = harness()
  for (const next of ['/agent?site=x', '/new?template=JA%20Kinetic', '/x?template=ja-kinetic']) {
    const { res } = await signIn(get, {}, next)
    assert.equal(res.status, 302, next)
    assert.equal(await identity.peekDesktopIntent('fixture@example.com'), null, next)
  }
})
