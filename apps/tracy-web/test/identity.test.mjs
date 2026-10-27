import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { identityRoutes } from '../src/identity/route.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { loginMailLimiter } from '../src/lib/login-mail-rate.js'
import { SESSION_TTL_S } from '../src/lib/policy.js'
import { mintSession } from '../src/lib/session.js'

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

function harness(now = () => 1_700_000_000_000, extraEnv = {}) {
  const sent = []
  const mail = {
    send: async (m) => {
      sent.push(m)
    }
  }
  const app = buildApp({
    config: readConfig({ ...env, ...extraEnv }),
    identity: memoryIdentityStore(),
    mail,
    now
  })
  const post = (path, body, cookie) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body)
      })
    )
  return { app, sent, post }
}

test('login mails a six-digit code, verify sets the session cookie, /auth/me reads it back', async () => {
  const { app, sent, post } = harness()
  const started = await post('/login', { email: 'Ceo@tracy.ai' })
  assert.equal(started.status, 200)
  assert.equal(sent.length, 1)
  const code = sent[0].text.match(/\b\d{6}\b/)[0]
  const verified = await post('/verify', { email: 'ceo@tracy.ai', code })
  assert.equal(verified.status, 200)
  const cookie = verified.headers.get('set-cookie')
  assert.match(cookie, /^tracy_sess=v1\./)
  const me = await app.fetch(
    new Request('http://tracy.test/auth/me', { headers: { cookie: cookie.split(';')[0] } })
  )
  const { face, ...rest } = await me.json()
  assert.deepEqual(rest, { email: 'ceo@tracy.ai', defaultSite: null, name: null })
  // The viewer's face (`lib/person-face.js`): the email's letter, a colour keyed by the account.
  assert.equal(face.initial, 'C')
  assert.match(face.color, /^#[0-9a-f]{6}$/)
  assert.equal(face.avatarUrl, null)
})

test('a wrong code five times burns the code; a stale code is refused; signout clears the cookie', async () => {
  let t = 1_700_000_000_000
  const { app, sent, post } = harness(() => t)
  await post('/login', { email: 'a@b.c' })
  for (let i = 0; i < 5; i++)
    assert.equal((await post('/verify', { email: 'a@b.c', code: '000000' })).status, 401)
  const real = sent[0].text.match(/\b\d{6}\b/)[0]
  assert.equal((await post('/verify', { email: 'a@b.c', code: real })).status, 401)
  await post('/login', { email: 'a@b.c' })
  t += 11 * 60 * 1000
  const late = sent[1].text.match(/\b\d{6}\b/)[0]
  assert.equal((await post('/verify', { email: 'a@b.c', code: late })).status, 401)
  const out = await app.fetch(new Request('http://tracy.test/auth/signout', { method: 'POST' }))
  const cleared = out.headers.getSetCookie()
  assert.ok(
    cleared.some((v) => /^tracy_sess=; .*Max-Age=0/.test(v)),
    cleared.join(' | ')
  )
  // The site pointer leaves with the session — measured 14/09: a pointer that outlived sign-out
  // put the NEXT account on "Ask to join" for the previous account's site. Each cookie gets its
  // own header: a browser refuses a comma-joined set-cookie.
  assert.ok(
    cleared.some((v) => /^tracy_site=; .*Max-Age=0/.test(v)),
    cleared.join(' | ')
  )
  assert.ok(cleared.some((v) => /^tracy_widget=; Path=\/widget; .*Max-Age=0/.test(v)))
  // An open admin view (`tracy_view`) goes with the session.
  assert.ok(cleared.some((v) => /^tracy_view=; .*Max-Age=0/.test(v)))
  assert.equal(cleared.length, 4)
})

test('signout: a FORM post lands on a page, a fetch still gets JSON', async () => {
  // `noSitesPage`'s "sign in as someone else" button is a plain `<form>`, and a form handed
  // `{"ok":true}` leaves the person staring at it. Same branch `/login` and `/verify` already
  // take. `next` goes through `safePath`, so the button cannot become an open redirect.
  const { app } = harness()
  const asForm = await app.fetch(
    new Request('http://tracy.test/auth/signout', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ next: '/login' }).toString()
    })
  )
  assert.equal(asForm.status, 303)
  assert.equal(asForm.headers.get('location'), 'http://tracy.test/login')
  assert.match(asForm.headers.get('set-cookie'), /tracy_sess=; .*Max-Age=0/)

  const hostile = await app.fetch(
    new Request('http://tracy.test/auth/signout', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ next: '//evil.example/' }).toString()
    })
  )
  assert.equal(hostile.status, 303)
  assert.ok(!(hostile.headers.get('location') ?? '').includes('evil.example'))

  const asFetch = await app.fetch(new Request('http://tracy.test/auth/signout', { method: 'POST' }))
  assert.deepEqual(await asFetch.json(), { ok: true })
})

test('five wrong codes then the right one still answers 401 — the code was already burned', async () => {
  const { sent, post } = harness()
  await post('/login', { email: 'burn@b.c' })
  for (let i = 0; i < 5; i++)
    assert.equal((await post('/verify', { email: 'burn@b.c', code: '000000' })).status, 401)
  const real = sent[0].text.match(/\b\d{6}\b/)[0]
  assert.equal((await post('/verify', { email: 'burn@b.c', code: real })).status, 401)
})

test('four wrong codes then the right one still succeeds — the fifth try is not spent yet', async () => {
  const { sent, post } = harness()
  await post('/login', { email: 'spare@b.c' })
  for (let i = 0; i < 4; i++)
    assert.equal((await post('/verify', { email: 'spare@b.c', code: '000000' })).status, 401)
  const real = sent[0].text.match(/\b\d{6}\b/)[0]
  assert.equal((await post('/verify', { email: 'spare@b.c', code: real })).status, 200)
})

test('a burst of parallel guesses cannot outrun the five-attempt cap', async () => {
  const { sent, post } = harness()
  await post('/login', { email: 'race@b.c' })
  const real = sent[0].text.match(/\b\d{6}\b/)[0]
  // Seven guesses fired at once, the real code among them at the tail — a sequential attacker
  // would already be capped by guess six, so the real code here must still be refused. Bumping
  // the attempt counter only after comparing the hash (the brief's original order) lets every
  // parallel guess read the same pre-bump attempts count and all slip past the cap at once.
  const guesses = ['111111', '222222', '333333', '444444', '555555', '666666', real]
  const results = await Promise.all(guesses.map((code) => post('/verify', { email: 'race@b.c', code })))
  for (const r of results) assert.equal(r.status, 401)
})

test('/auth/me without a session answers 200 with email null — that is a guest, not an error', async () => {
  const { app } = harness()
  const me = await app.fetch(new Request('http://tracy.test/auth/me'))
  assert.equal(me.status, 200)
  assert.deepEqual(await me.json(), { email: null, defaultSite: null, face: null, name: null })
})

/** `/auth/me` on a router handed a seat book whose account row carries `display_name`. */
async function meWithDisplayName(displayName) {
  const app = identityRoutes({
    store: memoryIdentityStore(),
    mail: { send: async () => {}, signInCodeMail: (code) => ({ text: code }) },
    config: readConfig(env),
    mailRate: loginMailLimiter(),
    pool: {},
    seats: {
      accountByEmail: async (_pool, email) => ({
        id: 'acc-1',
        email,
        display_name: displayName,
        avatar_url: null
      }),
      defaultSiteFor: async () => null
    }
  })
  const cookie = `tracy_sess=${await mintSession('named@b.c', env.SESSION_SECRET)}`
  const res = await app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie } }))
  assert.equal(res.status, 200)
  return res.json()
}

test('/auth/me names the viewer by the account display name, trimmed', async () => {
  const me = await meWithDisplayName('  Sam Tester ')
  assert.equal(me.name, 'Sam Tester')
  assert.equal(me.email, 'named@b.c')
  assert.equal(me.defaultSite, null)
  assert.equal(me.face.initial, 'S')
})

test('/auth/me answers name null when the display name is missing or blank', async () => {
  assert.equal((await meWithDisplayName(null)).name, null)
  assert.equal((await meWithDisplayName('   ')).name, null)
})

// ── GET /login: the shared shell, six OTP boxes, role="alert", escapeHtml ──────────────────────
//
// Task 6's own measurement: `GET /login` used to serve 1107 bytes — two bare forms, no
// stylesheet, no token, no favicon. These cases are what told it so.

async function loginHtml(app, query = '') {
  const res = await app.fetch(new Request(`http://tracy.test/login${query}`))
  assert.equal(res.status, 200)
  return res.text()
}

// 19/09: the sign-in door answered with a form whether or not the visitor already had a session,
// and the Design inspiration page linked straight at it (`/login?next=/agent?…`) — so the first
// press of the product showed a signed-in person a sign-in form. The link was fixed at its source
// (`buildUrl`, `tracy-design-page`), and this is the other half: every `/login?next=…` already
// handed out — inside the badge on customer sites, in old tabs, in anything shared — must stop
// asking a person who is already here.
test('GET /login: a visitor who already holds a session is sent on, not shown the form', async () => {
  const { app, post } = harness()
  const started = await post('/login', { email: 'ceo@tracy.ai' })
  assert.equal(started.status, 200)
  // A real session, minted the way `/verify` mints it.
  const token = await mintSession('ceo@tracy.ai', env.SESSION_SECRET)
  const res = await app.fetch(
    new Request('http://tracy.test/login?next=%2Fnew%2F%3Finspiration%3Dapple', {
      headers: { cookie: `tracy_sess=${token}` }
    })
  )
  assert.equal(res.status, 302, 'a held session is not asked to sign in again')
  // `safePath` answers an absolute address on this origin — the same shape `/verify` redirects to.
  assert.equal(res.headers.get('location'), 'http://tracy.test/new/?inspiration=apple')
})

test('GET /login: a bad `next` is not followed, even for a signed-in visitor', async () => {
  const { app } = harness()
  const token = await mintSession('ceo@tracy.ai', env.SESSION_SECRET)
  const res = await app.fetch(
    new Request('http://tracy.test/login?next=https%3A%2F%2Fevil.example%2Fx', {
      headers: { cookie: `tracy_sess=${token}` }
    })
  )
  assert.equal(res.status, 302)
  assert.equal(
    res.headers.get('location'),
    'http://tracy.test/',
    'an off-site next falls back to this origin'
  )
})

test('GET /login: no session still gets the form', async () => {
  const { app } = harness()
  const res = await app.fetch(new Request('http://tracy.test/login?next=%2Fnew%2F'))
  assert.equal(res.status, 200)
})

test('GET /login: carries the shared shell — token block, color-scheme, favicon', async () => {
  const { app } = harness()
  const html = await loginHtml(app)
  assert.match(html, /<meta name="color-scheme" content="light dark">/)
  assert.match(html, /--primary:oklch\(0\.588 0\.136 37\.4\)/)
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/)
})

test('GET /login: six OTP slots, the first (and only the first) with autocomplete="one-time-code"', async () => {
  const { app } = harness()
  const html = await loginHtml(app)
  const slots = html.match(/class="otp-slot"/g) || []
  assert.equal(slots.length, 6)
  const oneTimeCode = html.match(/autocomplete="one-time-code"/g) || []
  assert.equal(oneTimeCode.length, 1)
})

test('GET /login: both the email step and the code step carry a role="alert" error block', async () => {
  const { app } = harness()
  const html = await loginHtml(app)
  const alerts = html.match(/role="alert"/g) || []
  assert.equal(alerts.length, 2)
})

test('GET /login: a <script> pushed through `email` never reaches the page unescaped', async () => {
  const { app } = harness()
  const html = await loginHtml(app, '?email=' + encodeURIComponent('<script>alert(1)</script>'))
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
})

test('GET /login: a <script> pushed through `next` never reaches the page unescaped', async () => {
  const { app } = harness()
  const html = await loginHtml(app, '?next=' + encodeURIComponent('<script>alert(1)</script>'))
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
})

test('GET /login: the email address prefills from the query, escaped', async () => {
  const { app } = harness()
  const html = await loginHtml(app, '?email=' + encodeURIComponent('ceo@tracy.ai'))
  assert.match(html, /value="ceo@tracy\.ai"/)
})

// ── review round 2, finding 2: the page must work with JavaScript disabled ─────────────────────
//
// Both forms had no method/action/name at all — a browser with script off had nothing to post.
// These tests submit real application/x-www-form-urlencoded bodies, the shape a plain HTML form
// (not fetch) sends, and never set a content-type of application/json.

test('GET /login: both forms post for real — real method, action, and input names', async () => {
  const { app } = harness()
  const html = await loginHtml(app)
  assert.match(html, /<form id="email-form" method="post" action="\/login">/)
  assert.match(html, /<input id="login-email" type="email" name="email"/)
  assert.match(html, /<form id="code-form" method="post" action="\/verify">/)
  // Six same-named `code` inputs — the shape a browser posts them as, joined server-side.
  assert.equal((html.match(/name="code"/g) || []).length, 6)
})

test('POST /login with a plain form body (no JavaScript) sends a code and renders step two', async () => {
  const { app, sent } = harness()
  const res = await app.fetch(
    new Request('http://tracy.test/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'noscript@b.c', next: '/somewhere' }).toString()
    })
  )
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(html, /Check your email/)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'noscript@b.c')
  // The code step is now the one showing; the email step is the one hidden — not the reverse.
  assert.match(html, /id="email-step" hidden/)
  assert.doesNotMatch(html, /id="code-step" hidden/)
})

test('POST /login with a plain form body and an invalid email re-renders step one with role="alert"', async () => {
  const { app, sent } = harness()
  const res = await app.fetch(
    new Request('http://tracy.test/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'not-an-email' }).toString()
    })
  )
  assert.equal(res.status, 400)
  const html = await res.text()
  assert.match(html, /role="alert"/)
  assert.match(html, /Enter a valid email address\./)
  assert.equal(sent.length, 0)
})

test('POST /verify with a plain form body (no JavaScript) sets the session and redirects to next', async () => {
  const { app, sent } = harness()
  await app.fetch(
    new Request('http://tracy.test/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'noscript2@b.c', next: '/somewhere' }).toString()
    })
  )
  const code = sent[0].text.match(/\b\d{6}\b/)[0]
  const form = new URLSearchParams()
  form.append('email', 'noscript2@b.c')
  for (const digit of code) form.append('code', digit)
  form.append('next', '/somewhere')
  const res = await app.fetch(
    new Request('http://tracy.test/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    })
  )
  assert.equal(res.status, 303)
  assert.equal(res.headers.get('location'), 'http://tracy.test/somewhere')
  assert.ok(res.headers.get('set-cookie'))
})

test('POST /verify with a plain form body and a wrong code re-renders step two with role="alert"', async () => {
  const { app, sent } = harness()
  await app.fetch(
    new Request('http://tracy.test/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'noscript3@b.c' }).toString()
    })
  )
  const form = new URLSearchParams()
  form.append('email', 'noscript3@b.c')
  for (const digit of '000000') form.append('code', digit)
  const res = await app.fetch(
    new Request('http://tracy.test/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    })
  )
  assert.equal(res.status, 401)
  const html = await res.text()
  assert.match(html, /role="alert"/)
  assert.match(html, /That code did not work\./)
  assert.equal(sent.length, 1) // no second mail — this is the same code round, just typed wrong
})

test('POST /login and /verify with JSON bodies still answer JSON, unchanged', async () => {
  const { sent, post } = harness()
  const started = await post('/login', { email: 'still-json@b.c' })
  assert.equal(started.status, 200)
  assert.deepEqual(await started.json(), { ok: true })
  const code = sent[0].text.match(/\b\d{6}\b/)[0]
  const verified = await post('/verify', { email: 'still-json@b.c', code })
  assert.equal(verified.status, 200)
  const body = await verified.json()
  assert.equal(body.ok, true)
})

test('local login preview exposes only the newly issued OTP and preserves single-use verification', async () => {
  const normal = harness()
  assert.deepEqual(await (await normal.post('/login', { email: 'dev@example.com' })).json(), { ok: true })
  const { post, sent, app } = harness(undefined, { LOCAL_LOGIN_PREVIEW: '1' })
  const response = await post('/login', { email: 'dev@example.com' })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const { localCode } = await response.json()
  assert.match(localCode, /^\d{6}$/)
  assert.equal(localCode, sent[0].text.match(/\b\d{6}\b/)[0])
  assert.equal((await post('/verify', { email: 'dev@example.com', code: localCode })).status, 200)
  assert.equal((await post('/verify', { email: 'dev@example.com', code: localCode })).status, 401)
  const form = await app.fetch(
    new Request('http://tracy.test/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=dev%40example.com'
    })
  )
  const html = await form.text()
  assert.match(html, /Local development/)
  assert.ok(html.includes(sent[1].text.match(/\b\d{6}\b/)[0]))
  assert.match(html, /Send a new code/)
})

test('local preview resend replaces the code and preview codes expire', async () => {
  let time = 1_700_000_000_000
  const { post } = harness(() => time, { LOCAL_LOGIN_PREVIEW: '1' })
  const email = 'resend@example.com'
  const first = await (await post('/login', { email })).json()
  let latest = await (await post('/login', { email })).json()
  // A randomly generated replacement may legitimately equal its predecessor.
  while (latest.localCode === first.localCode) latest = await (await post('/login', { email })).json()
  assert.equal((await post('/verify', { email, code: first.localCode })).status, 401)
  assert.equal((await post('/verify', { email, code: latest.localCode })).status, 200)
  const expired = await (await post('/login', { email })).json()
  time += 11 * 60 * 1000
  assert.equal((await post('/verify', { email, code: expired.localCode })).status, 401)
})

test('/auth/me accepts the verified session beside a stale cookie in either order', async () => {
  const { app, sent, post } = harness()
  await post('/login', { email: 'qa@example.test' })
  const code = sent[0].text.match(/\b\d{6}\b/)[0]
  const verified = await post('/verify', { email: 'qa@example.test', code })
  const fresh = verified.headers.get('set-cookie').split(';')[0]
  for (const cookie of [`tracy_sess=stale; ${fresh}`, `${fresh}; tracy_sess=stale`]) {
    const response = await app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie } }))
    assert.equal((await response.json()).email, 'qa@example.test')
  }
})

/** Sign in on `app` through the mailed code and return the `tracy_sess=…` pair. */
async function signIn({ sent, post }, email) {
  await post('/login', { email })
  const code = sent.at(-1).text.match(/\b\d{6}\b/)[0]
  const verified = await post('/verify', { email, code })
  return verified.headers.get('set-cookie').split(';')[0]
}

// #294: "the deploy signed everyone out". A second app built from the same environment is what a
// recreated `tracy-web` container is; the session must not notice the swap.
test('a session minted before a restart still answers /auth/me after it', async () => {
  const before = harness()
  const cookie = await signIn(before, 'qc@example.test')
  const after = harness()
  const me = await after.app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie } }))
  assert.equal((await me.json()).email, 'qc@example.test')
})

test('/auth/me renews a session older than an hour, so it slides past the first expiry', async () => {
  let time = 1_700_000_000_000
  const h = harness(() => time)
  const first = await signIn(h, 'qc@example.test')
  const me = (cookie) => h.app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie } }))

  const young = await me(first)
  assert.equal((await young.json()).email, 'qc@example.test')
  assert.equal(young.headers.get('set-cookie'), null, 'a session under an hour old is not rewritten')

  time += (SESSION_TTL_S - 2 * 3600) * 1000 // two hours before the first expiry
  const old = await me(first)
  assert.equal((await old.json()).email, 'qc@example.test')
  const renewed = old.headers.get('set-cookie')
  assert.match(renewed, new RegExp(`^tracy_sess=v1\\.[^;]+; HttpOnly; .*Max-Age=${SESSION_TTL_S}$`))

  time += 10 * 3600 * 1000 // eight hours past the first expiry: the first token is dead, the renewed one is not
  assert.equal((await (await me(first)).json()).email, null)
  assert.equal((await (await me(renewed.split(';')[0])).json()).email, 'qc@example.test')
})

test('/auth/me writes no cookie for a visitor without a session', async () => {
  const { app } = harness()
  const res = await app.fetch(new Request('http://tracy.test/auth/me'))
  assert.equal(res.headers.get('set-cookie'), null)
})

// ── #664: POST /login is a mail sender, so it has a cap ───────────────────────────────────────────
//
// Before 30/09/2026 fifty calls sent fifty mails to any address. The cap counts per inbox (so many
// machines cannot bury one address) and per client address (so one machine cannot walk a list).

function limitHarness({ now = () => 1_700_000_000_000, pool = null, send = null, identity = null } = {}) {
  const sent = []
  const app = buildApp({
    config: readConfig(env),
    identity: identity ?? memoryIdentityStore(),
    mail: { send: send ?? (async (m) => void sent.push(m)) },
    now,
    ...(pool ? { pool } : {})
  })
  const login = (email, { ip, form = false, next } = {}) =>
    app.fetch(
      new Request('http://tracy.test/login', {
        method: 'POST',
        headers: {
          'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json',
          ...(ip === undefined ? {} : { 'cf-connecting-ip': ip })
        },
        body: form
          ? new URLSearchParams({ email, ...(next ? { next } : {}) }).toString()
          : JSON.stringify({ email })
      })
    )
  const verify = (email, code) =>
    app.fetch(
      new Request('http://tracy.test/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code })
      })
    )
  return { app, sent, login, verify }
}

const codeIn = (mail) => mail.text.match(/\b\d{6}\b/)[0]

test('#664: the first login mails one code; the sixth for one address in an hour is refused and mails nothing', async () => {
  const { sent, login, verify } = limitHarness()
  const first = await login('cap@b.c', { ip: '198.51.100.1' })
  assert.equal(first.status, 200)
  assert.equal(sent.length, 1)
  for (let i = 2; i <= 5; i++)
    assert.equal((await login('cap@b.c', { ip: '198.51.100.1' })).status, 200, `call ${i}`)
  assert.equal(sent.length, 5)

  const refused = await login('cap@b.c', { ip: '198.51.100.1' })
  assert.equal(refused.status, 429)
  assert.deepEqual(await refused.json(), { code: 'RATE_LIMITED' })
  assert.equal(refused.headers.get('cache-control'), 'no-store')
  assert.equal(sent.length, 5, 'a refused request must not mail')
  // …and must not replace the code already in the inbox.
  assert.equal((await verify('cap@b.c', codeIn(sent[4]))).status, 200)
})

test('#664: the per-address cap holds across client addresses and spellings of the address', async () => {
  const { sent, login } = limitHarness()
  const spellings = ['Cap@B.c', ' cap@b.c ', 'CAP@B.C', 'cap@b.c', '\tCap@b.C']
  for (const [i, email] of spellings.entries()) {
    assert.equal((await login(email, { ip: `198.51.100.${i + 10}` })).status, 200, email)
  }
  const refused = await login('cAp@b.c', { ip: '198.51.100.99' })
  assert.equal(refused.status, 429)
  assert.equal(sent.length, 5)
  assert.ok(sent.every((m) => m.to === 'cap@b.c'))
  // Another inbox from the same machine is not caught by this one's cap.
  assert.equal((await login('other@b.c', { ip: '198.51.100.99' })).status, 200)
})

test('#664: the per-client-address cap holds across many addresses, and only for that client', async () => {
  const { sent, login } = limitHarness()
  for (let i = 0; i < 30; i++) {
    assert.equal((await login(`walk${i}@b.c`, { ip: '203.0.113.7' })).status, 200, `address ${i}`)
  }
  const refused = await login('walk30@b.c', { ip: '203.0.113.7' })
  assert.equal(refused.status, 429)
  assert.equal(sent.length, 30)
  assert.equal((await login('walk30@b.c', { ip: '203.0.113.8' })).status, 200)
  assert.equal(sent.length, 31)
})

test('#664: a missing or junk client-address header shares one bucket, never a fresh one per request', async () => {
  const { sent, login } = limitHarness()
  const junk = [undefined, '', 'not-an-ip', '1.2.3.4, 5.6.7.8', `x${'1'.repeat(80)}`, '<script>']
  for (let i = 0; i < 30; i++) {
    assert.equal((await login(`anon${i}@b.c`, { ip: junk[i % junk.length] })).status, 200, `call ${i}`)
  }
  for (const ip of junk)
    assert.equal((await login(`late-${junk.indexOf(ip)}@b.c`, { ip })).status, 429, String(ip))
  assert.equal(sent.length, 30)
})

test('#664: a form post over the cap re-renders the page with a message, and shares the JSON bucket', async () => {
  const { sent, login } = limitHarness()
  for (let i = 0; i < 5; i++) await login('mixed@b.c', { ip: '198.51.100.3', form: i % 2 === 0 })
  assert.equal(sent.length, 5)
  const email = '"><script>x@b.c'
  for (let i = 0; i < 5; i++) await login(email, { ip: '198.51.100.4' })
  const refused = await login(email, { ip: '198.51.100.4', form: true, next: '//evil.example/' })
  assert.equal(refused.status, 429)
  assert.match(refused.headers.get('content-type'), /text\/html/)
  const html = await refused.text()
  assert.match(html, /Too many sign-in codes were asked for/)
  assert.match(html, /role="alert"/)
  assert.doesNotMatch(html, /"><script>x@b\.c/)
  assert.match(html, /&quot;&gt;&lt;script&gt;x@b\.c/)
  assert.doesNotMatch(html, /evil\.example/)
  const jsonRefused = await login('mixed@b.c', { ip: '198.51.100.3' })
  assert.equal(jsonRefused.status, 429)
  assert.equal(sent.length, 10)
})

test('#664: the next hour opens a fresh window', async () => {
  let t = 1_700_000_000_000
  const { sent, login } = limitHarness({ now: () => t })
  for (let i = 0; i < 5; i++) await login('hourly@b.c', { ip: '198.51.100.5' })
  assert.equal((await login('hourly@b.c', { ip: '198.51.100.5' })).status, 429)
  t += 60 * 60 * 1000
  assert.equal((await login('hourly@b.c', { ip: '198.51.100.5' })).status, 200)
  assert.equal(sent.length, 6)
})

test('#664: a burst of parallel requests cannot outrun the cap', async () => {
  const { sent, login } = limitHarness()
  const answers = await Promise.all(
    Array.from({ length: 12 }, () => login('burst@b.c', { ip: '198.51.100.6' }))
  )
  assert.equal(answers.filter((r) => r.status === 200).length, 5)
  assert.equal(answers.filter((r) => r.status === 429).length, 7)
  assert.equal(sent.length, 5)
})

test('#664: a rate table the database cannot answer refuses, it does not wave the mail through', async () => {
  const pool = { query: async () => Promise.reject(new Error('connection refused')) }
  const { sent, login } = limitHarness({ pool })
  const res = await login('closed@b.c', { ip: '198.51.100.7' })
  assert.equal(res.status, 429)
  assert.deepEqual(await res.json(), { code: 'RATE_LIMITED' })
  assert.equal(sent.length, 0)
})

test('#664: a malformed body mails nothing and answers a controlled 400', async () => {
  const { app, sent } = limitHarness()
  for (const init of [
    { headers: { 'content-type': 'application/json' }, body: 'null' },
    { headers: { 'content-type': 'application/json' }, body: '[1]' },
    { headers: { 'content-type': 'application/json' }, body: '{nope' },
    { headers: { 'content-type': 'application/json' }, body: '{"email":{"a":1}}' },
    { headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: 'nope' },
    { headers: {} }
  ]) {
    const res = await app.fetch(new Request('http://tracy.test/login', { method: 'POST', ...init }))
    assert.equal(res.status, 400, JSON.stringify(init))
  }
  for (const body of ['null', '[1]', '{nope']) {
    const res = await app.fetch(
      new Request('http://tracy.test/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body
      })
    )
    assert.equal(res.status, 401, body)
  }
  assert.equal(sent.length, 0)
})

test('#664: a mail transport or code store that fails does not answer success', async () => {
  const brokenMail = limitHarness({ send: async () => Promise.reject(new Error('smtp down')) })
  const res = await brokenMail.login('smtp@b.c', { ip: '198.51.100.8' })
  assert.equal(res.status, 500)

  const store = memoryIdentityStore()
  store.putCode = async () => Promise.reject(new Error('db down'))
  const brokenStore = limitHarness({ identity: store })
  const res2 = await brokenStore.login('store@b.c', { ip: '198.51.100.8' })
  assert.equal(res2.status, 500)
  assert.equal(brokenStore.sent.length, 0)
})

// ── #805: the sign-in page's headers, and one limiter for both doors that mail a code ───────────

test('#805: GET /login refuses a frame, a sniffed type, a cached copy and a referrer', async () => {
  const { app } = harness()
  const res = await app.fetch(new Request('http://tracy.test/login?email=a%40b.c&next=%2Facme%2F'))
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /^text\/html/)
  assert.equal(res.headers.get('x-frame-options'), 'DENY')
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
  const policy = res.headers.get('content-security-policy')
  assert.match(policy, /(^|; )frame-ancestors 'none'($|;)/)
  assert.match(policy, /(^|; )object-src 'none'($|;)/)
  assert.match(policy, /(^|; )base-uri 'none'($|;)/)
  assert.doesNotMatch(policy, /\*|\bhttps?:(\s|;|$)/, 'no wildcard and no bare scheme')
})

test('#805: the hardened answers keep their status, their cookie and their words', async () => {
  const { sent, login } = limitHarness()
  const page = await login('keep@b.c', { ip: '198.51.100.40', form: true, next: '/acme/' })
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('x-frame-options'), 'DENY')
  assert.match(await page.text(), /name="code"/)
  for (let i = 0; i < 4; i++) await login('keep@b.c', { ip: '198.51.100.40' })
  const refused = await login('keep@b.c', { ip: '198.51.100.40', form: true })
  assert.equal(refused.status, 429)
  assert.equal(refused.headers.get('x-frame-options'), 'DENY')
  assert.match(await refused.text(), /Too many sign-in codes were asked for/)
  assert.equal(sent.length, 5)

  // A form post that signs in answers with a redirect and the session cookie, as before.
  const { app, sent: mails } = harness()
  const form = (path, fields) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString()
      })
    )
  await form('/login', { email: 'in@b.c' })
  const verified = await form('/verify', { email: 'in@b.c', code: codeIn(mails[0]), next: '/acme/' })
  assert.equal(verified.status, 303)
  assert.match(verified.headers.get('set-cookie'), /^tracy_sess=v1\./)
})

/** `identityRoutes` built by hand, the way a caller outside the composition root would. */
function bareIdentity({ mailRate, sent = [] } = {}) {
  const app = identityRoutes({
    store: memoryIdentityStore(),
    mail: { send: async (m) => void sent.push(m), signInCodeMail: (code) => ({ text: code }) },
    config: readConfig(env),
    ...(mailRate ? { mailRate } : {})
  })
  const login = (email, ip = '198.51.100.50') =>
    app.fetch(
      new Request('http://tracy.test/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
        body: JSON.stringify({ email })
      })
    )
  return { sent, login }
}

test('#805: an identity router built without a limiter still caps — there is no uncapped default', async () => {
  const { sent, login } = bareIdentity()
  for (let i = 0; i < 5; i++) assert.equal((await login('bare@b.c')).status, 200, `call ${i}`)
  assert.equal((await login('bare@b.c')).status, 429)
  assert.equal(sent.length, 5)
})

test('#805: two routers handed one limiter spend one budget; two limiters do not', async () => {
  const sent = []
  const mailRate = loginMailLimiter()
  const first = bareIdentity({ mailRate, sent })
  const second = bareIdentity({ mailRate, sent })
  for (let i = 0; i < 5; i++) {
    assert.equal((await (i % 2 ? first : second).login(' Shared@B.c ')).status, 200, `call ${i}`)
  }
  assert.equal((await first.login('shared@b.c')).status, 429)
  assert.equal((await second.login('shared@b.c', '198.51.100.51')).status, 429)
  assert.equal(sent.length, 5)
  // The limiter is the unit that is shared — a separate one has its own count.
  assert.equal((await bareIdentity().login('shared@b.c')).status, 200)
})

test('#805: the limiter counts both buckets on every request and fails closed', async () => {
  const header = (ip) => ({ req: { header: (name) => (name === 'cf-connecting-ip' ? ip : undefined) } })
  const seen = []
  const pool = {
    query: async (_sql, [bucket]) => {
      seen.push(bucket)
      return { rows: [{ count: bucket.startsWith('login-email:') ? 6 : 1 }] }
    }
  }
  const counted = loginMailLimiter({ pool, now: () => 1_700_000_000_000 })
  // Over on the address: the client bucket is still counted, so it cannot be saved up.
  assert.equal(await counted.over(header('2001:DB8::1'), 'a@b.c'), true)
  assert.deepEqual(seen, ['login-email:a@b.c', 'login-ip:2001:db8::1'])
  for (const ip of [undefined, '', 'junk', '1.2.3.4, 5.6.7.8']) {
    seen.length = 0
    await counted.over(header(ip), 'a@b.c')
    assert.equal(seen[1], 'login-ip:unknown', String(ip))
  }
  const broken = loginMailLimiter({ pool: { query: async () => Promise.reject(new Error('down')) } })
  assert.equal(await broken.over(header('198.51.100.1'), 'a@b.c'), true)
  assert.equal(await broken.overLane(header('198.51.100.1'), 'a@b.c'), true)
})

test('#805: the lane count shares the inbox bucket and keeps its own per-host one', async () => {
  const header = (ip) => ({ req: { header: (name) => (name === 'cf-connecting-ip' ? ip : undefined) } })
  const seen = []
  const pool = {
    query: async (_sql, [bucket]) => {
      seen.push(bucket)
      return { rows: [{ count: bucket.startsWith('login-email:') ? 6 : 1 }] }
    }
  }
  const counted = loginMailLimiter({ pool, now: () => 1_700_000_000_000 })
  // Over on the inbox: the host bucket is still counted, and `login-ip:` is never touched.
  assert.equal(await counted.overLane(header('2001:DB8::1'), 'a@b.c'), true)
  assert.deepEqual(seen, ['login-email:a@b.c', 'lane-mail:2001:db8::1'])
  for (const ip of [undefined, '', 'junk', '1.2.3.4, 5.6.7.8']) {
    seen.length = 0
    await counted.overLane(header(ip), 'a@b.c')
    assert.equal(seen[1], 'lane-mail:unknown', String(ip))
  }
})
