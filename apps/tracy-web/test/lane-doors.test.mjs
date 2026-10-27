/**
 * The doors a site's dsh lane signs people in through (`src/lanes/route.js`), and the `/signin`
 * page that approves a round.
 *
 * WHY THESE ARE PINNED HARD. Until 16/09/2026 this contract lived in a Cloudflare Worker, so the
 * only proof it still held was production itself. Now it is ours: every case below is one the
 * Worker answered a particular way, and the lane (`vendor/tracy/dsh-passwords/src/gateway.ts`)
 * reads those answers without asking twice — a poll that leaks an address, an exchange that can be
 * replayed, or an unsigned roster would each be a real hole rather than a failing assertion.
 *
 *   node --test apps/tracy-web/test/lane-doors.test.mjs
 */
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { test } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { laneRoutes } from '../src/lanes/route.js'
import { LANE_MAIL_LIMIT_PER_HOST_PER_HOUR, SESSION_TTL_S } from '../src/lib/policy.js'

const SESSION_SECRET = 'lane-doors-session-secret'
const ACTOR_SECRET = 'lane-doors-actor-secret'

/** The assertion `gateway.ts` signs (`actorAssertion`): `v1.<payload>.<hmac>`, 60 seconds. */
function actor(email, { secret = ACTOR_SECRET, exp = Math.floor(Date.now() / 1000) + 60 } = {}) {
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString('base64url')
  return `v1.${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}

const ENV = {
  TRACY_ORIGIN: 'https://cowork.example',
  SITE_DOMAIN: 'example',
  SESSION_SECRET,
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: ACTOR_SECRET
}

/** The app as the composition root builds it, with the memory identity store a laptop gets when
 * `DATABASE_URL` is unset — the configuration this whole change exists to make work. */
function makeApp({ pool = null, now = null, identity = memoryIdentityStore() } = {}) {
  const mailbox = []
  const app = buildApp({
    config: readConfig(ENV),
    identity,
    mail: { send: async (message) => void mailbox.push(message) },
    ...(pool ? { pool } : {}),
    ...(now ? { now } : {})
  })
  return { app, mailbox }
}

const call = (app, path, init) => app.fetch(new Request(`https://cowork.example${path}`, init))
const postJson = (body, headers = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body)
})

const ORIGIN = 'https://cowork.example'

/** Sign in the way a person does, so the approval carries a real session cookie. */
async function signIn(app, mailbox, email = 'owner@example.com') {
  await call(app, '/login', postJson({ email }))
  const code = mailbox.at(-1).text.match(/\b(\d{6})\b/)[1]
  const verified = await call(app, '/verify', postJson({ email, code }))
  return verified.headers.get('set-cookie').split(';')[0]
}

/** The press on the confirmation page: the form `GET /signin` renders, posted by the browser.
 * `origin: false` sends no Origin header at all. */
function approve(app, nonce, { cookie, origin = ORIGIN } = {}) {
  return call(app, '/signin/approve', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
      ...(origin === false ? {} : { origin })
    },
    body: new URLSearchParams({ n: nonce }).toString()
  })
}

const poll = async (app, nonce) => (await (await call(app, `/auth/link/${nonce}`)).json()).status
const openRound = async (app, body = {}) =>
  await (await call(app, '/auth/link/browser', postJson(body))).json()

test('a round opens with two fresh secrets and an expiry', async () => {
  const { app } = makeApp()
  const first = await (await call(app, '/auth/link/browser', postJson({}))).json()
  const second = await (await call(app, '/auth/link/browser', postJson({}))).json()
  assert.match(first.nonce, /^[a-f0-9]{64}$/)
  assert.match(first.clientSecret, /^[a-f0-9]{64}$/)
  assert.notEqual(first.nonce, second.nonce)
  assert.notEqual(first.clientSecret, second.clientSecret)
  assert.ok(first.expiresAt > Date.now())
})

test('a poll says pending, and says nothing else — no address, ever', async () => {
  const { app } = makeApp()
  const { nonce } = await (await call(app, '/auth/link/browser', postJson({}))).json()
  const body = await (await call(app, `/auth/link/${nonce}`)).json()
  assert.deepEqual(body, { status: 'pending' })
})

test('an unknown nonce and a malformed one both read as expired', async () => {
  const { app } = makeApp()
  assert.deepEqual(await (await call(app, `/auth/link/${'a'.repeat(64)}`)).json(), { status: 'expired' })
  assert.deepEqual(await (await call(app, '/auth/link/not-a-nonce')).json(), { status: 'expired' })
})

test('the whole browser round: open, approve while signed in, poll, exchange', async () => {
  const { app, mailbox } = makeApp()
  const { nonce, clientSecret } = await (await call(app, '/auth/link/browser', postJson({}))).json()
  const cookie = await signIn(app, mailbox)

  const asked = await call(app, `/signin?n=${nonce}&provider=google`, { headers: { cookie } })
  assert.equal(asked.status, 200)
  assert.match(await asked.text(), /owner@example\.com/)
  assert.equal(await poll(app, nonce), 'pending', 'opening the page must not approve anything')

  const approved = await approve(app, nonce, { cookie })
  assert.equal(approved.status, 200)
  assert.match(await approved.text(), /owner@example\.com/)

  assert.deepEqual(await (await call(app, `/auth/link/${nonce}`)).json(), { status: 'approved' })

  const exchanged = await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))
  assert.equal(exchanged.status, 200)
  assert.deepEqual(await exchanged.json(), { email: 'owner@example.com' })
})

test('a visitor with no session is sent to sign in, and comes back to the same round', async () => {
  const { app } = makeApp()
  const { nonce } = await (await call(app, '/auth/link/browser', postJson({}))).json()
  const res = await call(app, `/signin?n=${nonce}`)
  assert.equal(res.status, 302)
  const to = new URL(res.headers.get('location'), 'https://cowork.example')
  assert.equal(to.pathname, '/login')
  assert.match(to.searchParams.get('next'), new RegExp(`^/signin\\?n=${nonce}`))
})

test('an exchange is one shot: the second attempt finds nothing', async () => {
  const { app, mailbox } = makeApp()
  const { nonce, clientSecret } = await (await call(app, '/auth/link/browser', postJson({}))).json()
  const cookie = await signIn(app, mailbox)
  assert.equal((await approve(app, nonce, { cookie })).status, 200)

  assert.equal((await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))).status, 200)
  assert.equal((await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))).status, 400)
})

test('a wrong client secret burns the round instead of failing politely', async () => {
  const { app, mailbox } = makeApp()
  const { nonce, clientSecret } = await (await call(app, '/auth/link/browser', postJson({}))).json()
  const cookie = await signIn(app, mailbox)
  assert.equal((await approve(app, nonce, { cookie })).status, 200)

  const wrong = await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret: 'b'.repeat(64) }))
  assert.equal(wrong.status, 400)
  // The right secret afterwards must find nothing: a leaked nonce does not stay useful.
  const right = await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))
  assert.equal(right.status, 400)
})

test('an unapproved round cannot be exchanged', async () => {
  const { app } = makeApp()
  const { nonce, clientSecret } = await (await call(app, '/auth/link/browser', postJson({}))).json()
  assert.equal((await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))).status, 400)
})

test('an approved round left past its window cannot be exchanged, and the attempt burns it', async () => {
  let t = Date.now()
  const { app, mailbox } = makeApp({ now: () => t })
  const { nonce, clientSecret, expiresAt } = await openRound(app)
  const cookie = await signIn(app, mailbox)
  assert.equal((await approve(app, nonce, { cookie })).status, 200)
  assert.equal(await poll(app, nonce), 'approved')

  // Approved in time, never collected: one millisecond past the window the right secret gets
  // the same refusal as a wrong one, and no address.
  const approvedAt = t
  t = expiresAt + 1
  const late = await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))
  assert.equal(late.status, 400)
  assert.deepEqual(await late.json(), { code: 'LINK_INVALID' })

  // The late attempt was still the one shot: back inside the window the round is gone.
  t = approvedAt
  const again = await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))
  assert.equal(again.status, 400)
  assert.deepEqual(await again.json(), { code: 'LINK_INVALID' })
})

test('an approved round is still exchangeable at the last instant of its window', async () => {
  let t = Date.now()
  const { app, mailbox } = makeApp({ now: () => t })
  const { nonce, clientSecret, expiresAt } = await openRound(app)
  const cookie = await signIn(app, mailbox)
  assert.equal((await approve(app, nonce, { cookie })).status, 200)

  t = expiresAt
  const exchanged = await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))
  assert.equal(exchanged.status, 200)
  assert.deepEqual(await exchanged.json(), { email: 'owner@example.com' })
})

test('the exchange door refuses a round whose status is not approved, even one that names an address', async () => {
  // THE STATUS CHECK ON ITS OWN. Both stores leave `email` empty until a round is approved, so
  // through the real flow a pending round is refused twice over (its status, its empty address)
  // and the case above cannot tell the two checks apart. The store here is the memory store with
  // one change: the round it hands the door already names an address while its status is whatever
  // the round really has. Not a state either store produces today; it is what the door would be
  // handed if a later write filled `email` before approval.
  const addressedStore = () => {
    const identity = memoryIdentityStore()
    const takeLink = identity.takeLink.bind(identity)
    identity.takeLink = async (nonceHash) => {
      const row = await takeLink(nonceHash)
      return row ? { ...row, email: 'owner@example.com' } : row
    }
    return identity
  }
  for (const settle of ['pending', 'denied']) {
    const identity = addressedStore()
    const { app } = makeApp({ identity })
    const { nonce, clientSecret } = await openRound(app)
    if (settle === 'denied') {
      const hash = createHash('sha256').update(nonce).digest('hex')
      assert.equal(await identity.denyLink(hash), true)
    }

    const res = await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))
    assert.equal(res.status, 400, settle)
    assert.deepEqual(await res.json(), { code: 'LINK_INVALID' }, settle)
  }

  // The same store does not stand in the way of a round somebody approved.
  const identity = addressedStore()
  const { app, mailbox } = makeApp({ identity })
  const { nonce, clientSecret } = await openRound(app)
  const cookie = await signIn(app, mailbox)
  assert.equal((await approve(app, nonce, { cookie })).status, 200)
  const ok = await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))
  assert.equal(ok.status, 200)
  assert.deepEqual(await ok.json(), { email: 'owner@example.com' })
})

// ── #661: opening the link is not approving it ─────────────────────────────────────────────────
//
// The session cookie is `SameSite=Lax; Domain=<site domain>`, so ANY page under the site domain — a
// customer's own site included — can make a signed-in person's browser GET `/signin?n=<nonce>` with
// the cookie attached (an <img>, a redirect, a link). Before #661 that GET alone approved the round,
// and the attacker who opened it exchanged it for the victim's address.

test('#661: a bare GET /signin with a signed-in cookie does not approve the round', async () => {
  const { app, mailbox } = makeApp()
  const cookie = await signIn(app, mailbox)
  const { nonce, clientSecret } = await openRound(app)

  const page = await call(app, `/signin?n=${nonce}&provider=google`, { headers: { cookie } })
  assert.equal(page.status, 200)
  const html = await page.text()
  // The page is a question with one real form on it, posting to the approve door with the nonce.
  assert.match(html, /<form method="post" action="\/signin\/approve">/)
  assert.match(html, new RegExp(`<input type="hidden" name="n" value="${nonce}">`))
  assert.match(html, /<button type="submit">/)
  // Nothing on it presses the button by itself.
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /http-equiv="refresh"/i)
  // It cannot be put in a frame on somebody else's page and pressed through a disguise.
  assert.match(page.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/)
  assert.equal(page.headers.get('x-frame-options'), 'DENY')
  assert.equal(page.headers.get('cache-control'), 'no-store')

  assert.equal(await poll(app, nonce), 'pending')
  // The attacker's exchange right after the GET finds a round nobody approved.
  const exchanged = await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))
  assert.equal(exchanged.status, 400)
  assert.deepEqual(await exchanged.json(), { code: 'LINK_INVALID' })
})

test('#661: a GET repeated with every query shape still approves nothing', async () => {
  const { app, mailbox } = makeApp()
  const cookie = await signIn(app, mailbox)
  const { nonce } = await openRound(app)
  for (const query of [
    `n=${nonce}`,
    `n=${nonce}&provider=github`,
    `n=${nonce}&approve=1`,
    `n=${nonce}&confirm=yes`
  ]) {
    const res = await call(app, `/signin?${query}`, { headers: { cookie } })
    assert.equal(res.status, 200, query)
  }
  assert.equal(await poll(app, nonce), 'pending')
})

test('#661: the approve door refuses a missing, null, foreign or sibling Origin', async () => {
  const { app, mailbox } = makeApp()
  const cookie = await signIn(app, mailbox)
  const { nonce, clientSecret } = await openRound(app)
  for (const origin of [
    false, // no Origin header at all
    'null', // a sandboxed frame or an opaque redirect
    'https://evil.example.net',
    'https://acme.example', // a customer site under the same cookie domain
    'http://cowork.example', // same host, wrong scheme
    'https://cowork.example:8443', // same host, wrong port
    'https://cowork.example.evil.net'
  ]) {
    const res = await approve(app, nonce, { cookie, origin })
    assert.equal(res.status, 403, String(origin))
    assert.equal(await poll(app, nonce), 'pending', String(origin))
  }
  // The round is still good for the person who does press the button on the real page.
  assert.equal((await approve(app, nonce, { cookie })).status, 200)
  const exchanged = await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))
  assert.deepEqual(await exchanged.json(), { email: 'owner@example.com' })
})

test('#661: the approve door refuses a missing, forged or expired session', async () => {
  let t = Date.now()
  const { app, mailbox } = makeApp({ now: () => t })
  const cookie = await signIn(app, mailbox)
  const { nonce } = await openRound(app)
  for (const bad of [undefined, 'tracy_sess=v1.forged.forged', `${cookie}x`]) {
    const res = await approve(app, nonce, { cookie: bad })
    assert.equal(res.status, 401, String(bad))
    assert.equal(await poll(app, nonce), 'pending', String(bad))
  }
  // A session past its life, on a round still inside its own.
  const { nonce: fresh } = await openRound(app)
  t += (SESSION_TTL_S + 60 * 60) * 1000
  const late = await openRound(app)
  assert.equal((await approve(app, late.nonce, { cookie })).status, 401)
  assert.equal(await poll(app, late.nonce), 'pending')
  assert.equal(await poll(app, fresh), 'expired')
})

test('#661: a malformed, unknown, expired or already-approved round changes nothing on POST', async () => {
  let t = Date.now()
  const { app, mailbox } = makeApp({ now: () => t })
  const cookie = await signIn(app, mailbox)

  for (const bad of ['', 'zz', 'A'.repeat(64), `${'a'.repeat(63)}g`, 'a'.repeat(65)]) {
    const res = await approve(app, bad, { cookie })
    assert.equal(res.status, 400, JSON.stringify(bad))
  }
  // No body, a JSON body, and a body that is not even a form.
  for (const init of [
    { headers: { cookie, origin: ORIGIN } },
    { headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: '{"n":null}' },
    { headers: { cookie, origin: ORIGIN, 'content-type': 'multipart/form-data; boundary=x' }, body: 'nope' }
  ]) {
    const res = await call(app, '/signin/approve', { method: 'POST', ...init })
    assert.equal(res.status, 400, JSON.stringify(init.headers))
  }

  const unknown = await approve(app, 'b'.repeat(64), { cookie })
  assert.equal(unknown.status, 400)
  assert.match(await unknown.text(), /expired, or somebody has already approved it/)

  // Opened, then left past its window before the press.
  const { nonce: stale } = await openRound(app)
  assert.equal((await call(app, `/signin?n=${stale}`, { headers: { cookie } })).status, 200)
  t += 16 * 60 * 1000
  assert.equal((await approve(app, stale, { cookie })).status, 400)
  assert.equal(await poll(app, stale), 'expired')
})

test('#661: a second approval, or two at once, cannot re-point the round at another address', async () => {
  const { app, mailbox } = makeApp()
  const owner = await signIn(app, mailbox, 'owner@example.com')
  const other = await signIn(app, mailbox, 'other@example.com')

  const { nonce, clientSecret } = await openRound(app)
  assert.equal((await approve(app, nonce, { cookie: owner })).status, 200)
  const again = await approve(app, nonce, { cookie: other })
  assert.equal(again.status, 400)
  assert.match(await again.text(), /somebody has already approved it/)
  // The page for an approved round says so, rather than asking again.
  const page = await call(app, `/signin?n=${nonce}`, { headers: { cookie: other } })
  assert.equal(page.status, 400)
  assert.doesNotMatch(await page.text(), /action="\/signin\/approve"/)
  const exchanged = await call(app, `/auth/link/${nonce}/exchange`, postJson({ clientSecret }))
  assert.deepEqual(await exchanged.json(), { email: 'owner@example.com' })

  const race = await openRound(app)
  const answers = await Promise.all([
    approve(app, race.nonce, { cookie: owner }),
    approve(app, race.nonce, { cookie: other }),
    approve(app, race.nonce, { cookie: owner })
  ])
  assert.deepEqual(answers.map((r) => r.status).sort(), [200, 400, 400])
})

test('#661: an unknown or expired round, and a malformed nonce, keep their old answers on GET', async () => {
  let t = Date.now()
  const { app, mailbox } = makeApp({ now: () => t })
  const cookie = await signIn(app, mailbox)
  assert.equal((await call(app, '/signin?n=not-a-nonce', { headers: { cookie } })).status, 404)
  assert.equal((await call(app, '/signin', { headers: { cookie } })).status, 404)
  const unknown = await call(app, `/signin?n=${'c'.repeat(64)}`, { headers: { cookie } })
  assert.equal(unknown.status, 400)
  assert.match(await unknown.text(), /expired, or somebody has already approved it/)
  const { nonce } = await openRound(app)
  t += 16 * 60 * 1000
  const expired = await call(app, `/signin?n=${nonce}`, { headers: { cookie } })
  assert.equal(expired.status, 400)
  assert.doesNotMatch(await expired.text(), /action="\/signin\/approve"/)
})

test('#661: the page names the account and the device the lane said it was, escaped', async () => {
  const { app, mailbox } = makeApp()
  const cookie = await signIn(app, mailbox)

  const told = await openRound(app, { device: '<script>alert(1)</script> Lee\'s "laptop"' })
  const html = await (await call(app, `/signin?n=${told.nonce}`, { headers: { cookie } })).text()
  assert.match(html, /owner@example\.com/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; Lee&#39;s &quot;laptop&quot;/)
  assert.doesNotMatch(html, /<script>alert/)
  // Told, not proven: the page does not dress the lane's own words up as a verified name.
  assert.match(html, /as the requesting device describes itself/)

  // Every lane in the field today sends `{}`: the page says it does not know, and still works.
  const silent = await openRound(app)
  const quiet = await (await call(app, `/signin?n=${silent.nonce}`, { headers: { cookie } })).text()
  assert.match(quiet, /did not say which device it is/)
  assert.equal((await approve(app, silent.nonce, { cookie })).status, 200)
})

test('#661: a device description that is not a short string is refused when the round opens', async () => {
  const { app } = makeApp()
  for (const device of [42, { name: 'x' }, ['x'], true, 'x'.repeat(121)]) {
    const res = await call(app, '/auth/link/browser', postJson({ device }))
    assert.equal(res.status, 400, JSON.stringify(device))
    assert.deepEqual(await res.json(), { code: 'INVALID_REQUEST' })
  }
  // Null, empty and a malformed body are what a lane without a description sends: accepted.
  for (const init of [
    postJson({ device: null }),
    postJson({ device: '   ' }),
    postJson(null),
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' }
  ]) {
    const res = await call(app, '/auth/link/browser', init)
    assert.equal(res.status, 200, String(init.body))
    const opened = await res.json()
    assert.deepEqual(Object.keys(opened).sort(), ['clientSecret', 'expiresAt', 'nonce'])
  }
})

test('a null, array or broken JSON body on a lane door is a controlled 400, not a crash', async () => {
  const { app, mailbox } = makeApp()
  const { nonce } = await openRound(app)
  const signed = { 'x-tracy-actor': actor('lane@example.com') }
  for (const body of ['null', '[1]', '{nope', '7']) {
    const init = (headers = {}) => ({
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body
    })
    assert.equal((await call(app, `/auth/link/${nonce}/exchange`, init())).status, 400, body)
    assert.equal((await call(app, '/auth/otp/start', init(signed))).status, 400, body)
    assert.equal((await call(app, '/auth/otp/verify', init(signed))).status, 400, body)
  }
  assert.deepEqual(mailbox, [])
})

test('the mail branch: signed lane asks for a code, then proves the address with it', async () => {
  const { app, mailbox } = makeApp()
  const started = await call(
    app,
    '/auth/otp/start',
    postJson({ email: 'editor@example.com' }, { 'x-tracy-actor': actor('lane@example.com') })
  )
  assert.equal(started.status, 200)
  assert.deepEqual(await started.json(), { ok: true })
  const code = mailbox.at(-1).text.match(/\b(\d{6})\b/)[1]

  const bad = await call(
    app,
    '/auth/otp/verify',
    postJson({ email: 'editor@example.com', code: '000000' }, { 'x-tracy-actor': actor('lane@example.com') })
  )
  assert.equal(bad.status, 401)
  assert.equal((await bad.json()).code, 'BAD_CODE')

  const good = await call(
    app,
    '/auth/otp/verify',
    postJson({ email: 'editor@example.com', code }, { 'x-tracy-actor': actor('lane@example.com') })
  )
  assert.equal(good.status, 200)
  assert.deepEqual(await good.json(), { ok: true, email: 'editor@example.com' })
})

test('the mail doors and the roster refuse an unsigned or wrongly-signed caller', async () => {
  const { app, mailbox } = makeApp()
  for (const headers of [
    {},
    { 'x-tracy-actor': 'v1.nonsense.nonsense' },
    { 'x-tracy-actor': actor('lane@example.com', { secret: 'another-secret' }) },
    // An assertion whose expiry is a session cookie's, not a lane's sixty seconds.
    { 'x-tracy-actor': actor('lane@example.com', { exp: Math.floor(Date.now() / 1000) + 12 * 3600 }) }
  ]) {
    const res = await call(app, '/auth/otp/start', postJson({ email: 'editor@example.com' }, headers))
    assert.equal(res.status, 401, JSON.stringify(headers))
    assert.equal((await res.json()).code, 'UNAUTHENTICATED')
    assert.equal((await call(app, '/sites/site-key/seats', { headers })).status, 401)
  }
  assert.deepEqual(mailbox, [], 'an unsigned caller must not be able to send mail')
})

test('a malformed address never reaches the mail transport', async () => {
  const { app, mailbox } = makeApp()
  const res = await call(
    app,
    '/auth/otp/start',
    postJson({ email: 'not-an-address' }, { 'x-tracy-actor': actor('lane@example.com') })
  )
  assert.equal(res.status, 400)
  assert.equal((await res.json()).code, 'INVALID_REQUEST')
  assert.deepEqual(mailbox, [])
})

test('the roster door answers the seat book, mapped the way the lane reads it', async () => {
  const rows = [
    {
      account_id: 'acc-1',
      role: 'owner',
      granted_at: '2026-09-01T00:00:00.000Z',
      accepted_at: '2026-09-01T00:00:00.000Z',
      revoked_at: null,
      declined_at: null,
      requested_at: null,
      scope: 'site',
      account_email: 'owner@example.com',
      account_display_name: 'Owner'
    },
    {
      account_id: 'acc-2',
      role: 'editor',
      granted_at: '2026-09-02T00:00:00.000Z',
      accepted_at: null,
      revoked_at: '2026-09-03T00:00:00.000Z',
      declined_at: null,
      requested_at: null,
      scope: 'site',
      account_email: 'gone@example.com',
      account_display_name: null
    }
  ]
  // A pool stub that answers the store's own query, so what is under test is the real
  // `seatsOfSite` + `rosterRow` pair the lane reads — not a fake of the mapping.
  const { app } = makeApp({ pool: { query: async () => ({ rows }) } })
  const res = await call(app, '/sites/tracy-ai-8836f920/seats', {
    headers: { 'x-tracy-actor': actor('lane@example.com') }
  })
  assert.equal(res.status, 200)
  const { seats } = await res.json()
  assert.deepEqual(
    seats.map((s) => ({ email: s.email, role: s.role, status: s.status })),
    [
      { email: 'owner@example.com', role: 'owner', status: 'active' },
      { email: 'gone@example.com', role: 'editor', status: 'revoked' }
    ]
  )
})

test('the roster door says the store is unavailable rather than inventing an empty book', async () => {
  const { app } = makeApp()
  const res = await call(app, '/sites/tracy-ai-8836f920/seats', {
    headers: { 'x-tracy-actor': actor('lane@example.com') }
  })
  assert.equal(res.status, 502)
  assert.equal((await res.json()).code, 'SEAT_STORE_UNAVAILABLE')
})

test('the pairing door answers yes to an assertion it can read, and nothing about who signed it', async () => {
  const { app } = makeApp()
  const res = await call(app, '/auth/actor-check', {
    headers: { 'x-tracy-actor': actor('lane@example.com') }
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  // 🔒 The address is NOT echoed: the question is whether the signature reads, and answering with
  // a name would make this the one door that hands an address back for holding a token.
  assert.deepEqual(body, { ok: true })
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('the pairing door says no in exactly the cases the other signed doors do', async () => {
  const { app } = makeApp()
  for (const headers of [
    {},
    { 'x-tracy-actor': 'v1.nonsense.nonsense' },
    // The case this door exists for: two halves of one fleet holding different actor secrets.
    // Measured 17/09 on the dev machine, unnoticed for ten days.
    { 'x-tracy-actor': actor('lane@example.com', { secret: 'another-secret' }) },
    { 'x-tracy-actor': actor('lane@example.com', { exp: Math.floor(Date.now() / 1000) + 12 * 3600 }) },
    { 'x-tracy-actor': actor('lane@example.com', { exp: Math.floor(Date.now() / 1000) - 5 }) }
  ]) {
    const res = await call(app, '/auth/actor-check', { headers })
    assert.equal(res.status, 401, JSON.stringify(headers))
    assert.equal((await res.json()).code, 'UNAUTHENTICATED')
  }
})

// ── #805 (F-S1-023): the mail branch counts in the same per-inbox bucket as `/login` ────────────
//
// `POST /auth/otp/start` mailed a code for every signed request, with no cap of its own: a lane
// (or anything holding the actor secret) could fill one inbox, and each call replaced the code
// already sent. It now counts, before a code exists or a mail leaves, in the per-inbox bucket
// `POST /login` counts in (five an hour) and in a per-caller bucket of its own (three hundred an
// hour) — never in `/login`'s thirty per client address, because the caller is a fleet host that
// serves every site on it.

/** The composition root again, with the parts these cases swap: clock, pool, transport, store. */
function otpHarness({ now = Date.now, pool = null, send = null, identity = null } = {}) {
  const sent = []
  const app = buildApp({
    config: readConfig(ENV),
    identity: identity ?? memoryIdentityStore(),
    mail: { send: send ?? (async (message) => void sent.push(message)) },
    now,
    ...(pool ? { pool } : {})
  })
  // The assertion's sixty seconds are read against the app's own clock.
  const signed = () => actor('lane@example.com', { exp: Math.floor(now() / 1000) + 60 })
  const start = (email, { ip, headers } = {}) =>
    call(
      app,
      '/auth/otp/start',
      postJson(
        { email },
        {
          ...(headers ?? { 'x-tracy-actor': signed() }),
          ...(ip === undefined ? {} : { 'cf-connecting-ip': ip })
        }
      )
    )
  const verify = (email, code) =>
    call(app, '/auth/otp/verify', postJson({ email, code }, { 'x-tracy-actor': signed() }))
  const login = (email, { ip } = {}) =>
    call(app, '/login', postJson({ email }, ip === undefined ? {} : { 'cf-connecting-ip': ip }))
  return { app, sent, start, verify, login, signed }
}

const codeOf = (message) => message.text.match(/\b(\d{6})\b/)[1]

test('#805: the sixth code for one address in an hour is refused, mails nothing and keeps the last code', async () => {
  const { sent, start, verify } = otpHarness()
  for (let i = 1; i <= 5; i++) {
    const res = await start('cap@example.com', { ip: '198.51.100.1' })
    assert.equal(res.status, 200, `call ${i}`)
    assert.deepEqual(await res.json(), { ok: true })
  }
  assert.equal(sent.length, 5)

  const refused = await start('cap@example.com', { ip: '198.51.100.1' })
  assert.equal(refused.status, 429)
  assert.deepEqual(await refused.json(), { code: 'RATE_LIMITED' })
  assert.equal(refused.headers.get('cache-control'), 'no-store')
  assert.equal(sent.length, 5, 'a refused request must not mail')
  // …and must not replace the code already in the inbox.
  const proven = await verify('cap@example.com', codeOf(sent[4]))
  assert.equal(proven.status, 200)
  assert.deepEqual(await proven.json(), { ok: true, email: 'cap@example.com' })
})

test('#805: the per-address cap holds across client addresses and spellings of the address', async () => {
  const { sent, start } = otpHarness()
  const spellings = [
    'Cap@Example.com',
    ' cap@example.com ',
    'CAP@EXAMPLE.COM',
    'cap@example.com',
    '\tCap@example.Com'
  ]
  for (const [i, email] of spellings.entries()) {
    assert.equal((await start(email, { ip: `198.51.100.${i + 10}` })).status, 200, email)
  }
  assert.equal((await start('cAp@example.com', { ip: '198.51.100.99' })).status, 429)
  assert.equal(sent.length, 5)
  assert.ok(sent.every((message) => message.to === 'cap@example.com'))
  // Another inbox from the same client is not caught by this one's cap.
  assert.equal((await start('other@example.com', { ip: '198.51.100.99' })).status, 200)
})

test('#805: one host mails more than thirty different inboxes — the lane door is not person-sized', async () => {
  const { sent, start } = otpHarness()
  for (let i = 0; i < 31; i++) {
    assert.equal((await start(`site${i}@example.com`, { ip: '203.0.113.7' })).status, 200, `inbox ${i}`)
  }
  assert.equal(sent.length, 31)
})

test('#805: the per-host cap holds across many addresses, and only for that host', async () => {
  const { sent, start } = otpHarness()
  for (let i = 0; i < LANE_MAIL_LIMIT_PER_HOST_PER_HOUR; i++) {
    assert.equal((await start(`walk${i}@example.com`, { ip: '203.0.113.7' })).status, 200, `address ${i}`)
  }
  assert.equal((await start('walk-over@example.com', { ip: '203.0.113.7' })).status, 429)
  assert.equal(sent.length, LANE_MAIL_LIMIT_PER_HOST_PER_HOUR)
  assert.equal((await start('walk-over@example.com', { ip: '203.0.113.8' })).status, 200)
  assert.equal(sent.length, LANE_MAIL_LIMIT_PER_HOST_PER_HOUR + 1)
})

test('#805: a missing or junk client-address header shares one bucket, never a fresh one per request', async () => {
  const { sent, start } = otpHarness()
  const junk = [undefined, '', 'not-an-ip', '1.2.3.4, 5.6.7.8', `x${'1'.repeat(80)}`, '<script>']
  for (let i = 0; i < LANE_MAIL_LIMIT_PER_HOST_PER_HOUR; i++) {
    assert.equal(
      (await start(`anon${i}@example.com`, { ip: junk[i % junk.length] })).status,
      200,
      `call ${i}`
    )
  }
  for (const [i, ip] of junk.entries()) {
    assert.equal((await start(`late-${i}@example.com`, { ip })).status, 429, String(ip))
  }
  assert.equal(sent.length, LANE_MAIL_LIMIT_PER_HOST_PER_HOUR)
})

test('#805: /login and the lane door spend ONE per-inbox budget, and separate per-address ones', async () => {
  // Per inbox: alternate the two doors.
  const byAddress = otpHarness()
  for (let i = 0; i < 5; i++) {
    const res = await (i % 2 === 0
      ? byAddress.start('mixed@example.com', { ip: '198.51.100.20' })
      : byAddress.login('Mixed@Example.com', { ip: '198.51.100.21' }))
    assert.equal(res.status, 200, `call ${i}`)
  }
  assert.equal((await byAddress.start('mixed@example.com', { ip: '198.51.100.22' })).status, 429)
  assert.equal((await byAddress.login('mixed@example.com', { ip: '198.51.100.23' })).status, 429)
  assert.equal(byAddress.sent.length, 5)

  // Per client address: lane calls spend nothing of `/login`'s thirty…
  const byClient = otpHarness()
  for (let i = 0; i < 31; i++) {
    assert.equal((await byClient.start(`lane${i}@example.com`, { ip: '203.0.113.9' })).status, 200)
  }
  for (let i = 0; i < 30; i++) {
    assert.equal(
      (await byClient.login(`walk${i}@example.com`, { ip: '203.0.113.9' })).status,
      200,
      `login ${i}`
    )
  }
  assert.equal(byClient.sent.length, 61)
  // …`/login` is still refused at its own thirty-first, exactly as before…
  assert.equal((await byClient.login('fresh@example.com', { ip: '203.0.113.9' })).status, 429)
  // …and a spent `/login` address does not close the lane door for the host behind it.
  assert.equal((await byClient.start('fresh@example.com', { ip: '203.0.113.9' })).status, 200)
  assert.equal(byClient.sent.length, 62)
})

test('#805: the cap reopens only when the next fixed hour starts', async () => {
  const hour = 60 * 60 * 1000
  let t = Math.floor(1_700_000_000_000 / hour) * hour + 1000
  const { sent, start } = otpHarness({ now: () => t })
  for (let i = 0; i < 5; i++) await start('hourly@example.com', { ip: '198.51.100.5' })
  assert.equal((await start('hourly@example.com', { ip: '198.51.100.5' })).status, 429)
  // The last millisecond of the same window is still closed…
  t = Math.floor(t / hour) * hour + hour - 1
  assert.equal((await start('hourly@example.com', { ip: '198.51.100.5' })).status, 429)
  assert.equal(sent.length, 5)
  // …and the first of the next one is open.
  t += 1
  assert.equal((await start('hourly@example.com', { ip: '198.51.100.5' })).status, 200)
  assert.equal(sent.length, 6)
})

test('#805: a burst of parallel requests cannot outrun the cap, through one door or both', async () => {
  const { sent, start, login } = otpHarness()
  const answers = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      i % 3 === 0
        ? login('burst@example.com', { ip: '198.51.100.6' })
        : start('burst@example.com', { ip: '198.51.100.6' })
    )
  )
  assert.equal(answers.filter((res) => res.status === 200).length, 5)
  assert.equal(answers.filter((res) => res.status === 429).length, 7)
  assert.equal(sent.length, 5)
})

test('#805: a rate table the database cannot answer refuses, it does not wave the mail through', async () => {
  const pool = { query: async () => Promise.reject(new Error('connection refused')) }
  const { sent, start } = otpHarness({ pool })
  const res = await start('closed@example.com', { ip: '198.51.100.7' })
  assert.equal(res.status, 429)
  assert.deepEqual(await res.json(), { code: 'RATE_LIMITED' })
  assert.equal(sent.length, 0)
})

test('#805: an unsigned, expired or malformed request spends nothing from either budget', async () => {
  let t = 1_700_000_000_000
  const { app, sent, start, signed } = otpHarness({ now: () => t })
  const ip = '198.51.100.30'
  const refusals = [
    [{}, 401],
    [{ 'x-tracy-actor': 'v1.nonsense.nonsense' }, 401],
    [
      {
        'x-tracy-actor': actor('lane@example.com', {
          secret: 'another-secret',
          exp: Math.floor(t / 1000) + 60
        })
      },
      401
    ],
    [{ 'x-tracy-actor': actor('lane@example.com', { exp: Math.floor(t / 1000) - 1 }) }, 401]
  ]
  // More refused calls than either cap, all naming the one address and the one client.
  for (let i = 0; i < 40; i++) {
    const [headers, status] = refusals[i % refusals.length]
    assert.equal((await start('quiet@example.com', { ip, headers })).status, status, `refusal ${i}`)
  }
  for (const body of [
    'null',
    '[1]',
    '{nope',
    '"text"',
    '7',
    '{"email":{"a":1}}',
    '{"email":"not-an-address"}',
    ''
  ]) {
    for (let i = 0; i < 5; i++) {
      const res = await call(app, '/auth/otp/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tracy-actor': signed(), 'cf-connecting-ip': ip },
        body
      })
      assert.equal(res.status, 400, body)
      assert.equal((await res.json()).code, 'INVALID_REQUEST')
    }
  }
  assert.equal(sent.length, 0)
  // Both budgets are untouched: the address still has its five, the host its three hundred.
  for (let i = 0; i < 5; i++)
    assert.equal((await start('quiet@example.com', { ip })).status, 200, `call ${i}`)
  for (let i = 0; i < LANE_MAIL_LIMIT_PER_HOST_PER_HOUR - 5; i++)
    assert.equal((await start(`q${i}@example.com`, { ip })).status, 200, `walk ${i}`)
  assert.equal((await start('q-over@example.com', { ip })).status, 429)
  assert.equal(sent.length, LANE_MAIL_LIMIT_PER_HOST_PER_HOUR)
})

test('#805: a mail transport or code store that fails does not answer success', async () => {
  const brokenMail = otpHarness({ send: async () => Promise.reject(new Error('smtp down')) })
  assert.equal((await brokenMail.start('smtp@example.com', { ip: '198.51.100.8' })).status, 500)

  const store = memoryIdentityStore()
  store.putCode = async () => Promise.reject(new Error('db down'))
  const brokenStore = otpHarness({ identity: store })
  assert.equal((await brokenStore.start('store@example.com', { ip: '198.51.100.8' })).status, 500)
  assert.equal(brokenStore.sent.length, 0)
})

/** `laneRoutes` built by hand, the way a caller outside the composition root would. */
function bareLane({ beta = null, mailRate } = {}) {
  const sent = []
  const store = memoryIdentityStore()
  const app = laneRoutes({
    beta,
    pool: null,
    config: readConfig(ENV),
    store,
    mail: { send: async (message) => void sent.push(message), signInCodeMail: (code) => ({ text: code }) },
    seats: {},
    otp: { generateCode: () => '123456', hashCode: async (code) => `hash:${code}` },
    ...(mailRate ? { mailRate } : {})
  })
  const start = (email, ip = '198.51.100.40') =>
    app.fetch(
      new Request('https://cowork.example/auth/otp/start', {
        ...postJson({ email }, { 'x-tracy-actor': actor('lane@example.com'), 'cf-connecting-ip': ip })
      })
    )
  return { sent, store, start }
}

test('#805: a lane router built without a limiter still caps — there is no uncapped default', async () => {
  const { sent, start } = bareLane()
  for (let i = 0; i < 5; i++) assert.equal((await start('bare@example.com')).status, 200, `call ${i}`)
  assert.equal((await start('bare@example.com')).status, 429)
  assert.equal(sent.length, 5)
})

test('#805: with the beta gate on, an over-limit request gets the same quiet answer and queues nothing', async () => {
  const queued = []
  const beta = { access: { enabled: true }, enqueue: async (email) => void queued.push(email) }
  const { sent, store, start } = bareLane({ beta })
  await store.putCode({ email: 'gate@example.com', codeHash: 'kept', expiresAt: Date.now() + 60_000 })
  for (let i = 0; i < 9; i++) {
    const res = await start(' Gate@Example.com ')
    // The gate's own rule: the answer never says whether the address is known — or counted.
    assert.equal(res.status, 200, `call ${i}`)
    assert.deepEqual(await res.json(), { ok: true })
  }
  assert.deepEqual(queued, Array(5).fill('gate@example.com'))
  assert.equal(sent.length, 0)
  assert.equal((await store.takeCode('gate@example.com')).codeHash, 'kept')
})
