/**
 * `/login?onboard=1` — the sign-in form inside the desktop app's Setup frame (contract item 1 of
 * `tasks/todo-desktop-onboard-v2.md`), and `GET /signin/email`, the door its email form points at.
 *
 *   node --test apps/tracy-web/test/login-onboard.test.mjs
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { loginPage } from '../src/identity/pages.js'
import { memoryIdentityStore } from '../src/identity/store.js'

const ORIGIN = 'https://cowork.example'
const ENV = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'example',
  SESSION_SECRET: 'login-onboard-session-secret',
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  GOOGLE_OAUTH_CLIENT_ID: 'g-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'g-secret',
  GITHUB_OAUTH_CLIENT_ID: 'gh-id',
  GITHUB_OAUTH_CLIENT_SECRET: 'gh-secret'
}

const sha = (text) => createHash('sha256').update(text).digest('hex')

function harness() {
  const mailbox = []
  const app = buildApp({
    config: readConfig(ENV),
    identity: memoryIdentityStore(),
    mail: { send: async (message) => void mailbox.push(message) }
  })
  const call = (path, init) => app.fetch(new Request(`${ORIGIN}${path}`, init))
  return { app, call, mailbox }
}

// ── Without `onboard`, the page is the page it was ─────────────────────────────────────────────

// Hashes of the plain `loginPage` (first taken on 11/10/2026 from commit 00614d9cd0, before the
// onboard mode existed). A change to the plain page must be a deliberate one that edits these lines:
// retaken 12/10/2026 after dca654424 changed the hero copy ("Claude Design, but for CMS", subtitle
// removed); the commit before it still renders the old three hashes exactly. Retaken 17/10/2026
// after the shard beta (S40) taught `submitCode` the `503 NO_SHARD_ACCEPTING` answer: only that
// inline-script branch and its sentence changed; the previous pages.js still renders the old hashes.
// Retaken 24/10/2026 after the local stand's sign-in learned to fill the shown code and send it
// (`fillLocalCode`, LOCAL_LOGIN_PREVIEW only): only the inline script changed.
test('without onboard the sign-in page is byte-for-byte what it was', () => {
  const cases = [
    [{ origin: ORIGIN }, 'd5f3bd6174e3eb14490676d97832385dfc6a6f54395ae31233f824482588cce0'],
    [
      {
        origin: ORIGIN,
        oauth: { google: { clientId: 'x' } },
        next: '/agent?x=1',
        email: 'a@b.co',
        lang: 'vi'
      },
      'be6cdb1a1a16a838e0bb886fe323a2e23a9e07a4ef172d8d7a9aab3719afc5c7'
    ],
    [
      {
        origin: ORIGIN,
        step: 'code',
        email: 'a@b.co',
        error: 'bad',
        lang: 'de',
        explicitLang: 'de',
        localPreview: true,
        localCode: '123456'
      },
      '47c35ddf049b7ca8983d94cacbb17b14360ee587f55075d880e8ae437d31102f'
    ]
  ]
  for (const [params, hash] of cases) {
    assert.equal(sha(loginPage(params)), hash, JSON.stringify(params))
    assert.equal(sha(loginPage({ ...params, onboard: false })), hash, 'onboard:false is the plain page')
  }
})

test('GET /login with no onboard, or any value but 1, draws no Setup frame', async () => {
  const h = harness()
  for (const query of ['', '?onboard=0', '?onboard=true', '?onboard=']) {
    const html = await (await h.call(`/login${query}`)).text()
    assert.doesNotMatch(html, /class="setup/, query)
    assert.match(html, /<form id="email-form" method="post" action="\/login">/, query)
  }
})

// ── With `onboard=1` ──────────────────────────────────────────────────────────────────────────

test('GET /login?onboard=1 draws the sign-in step inside the four-step Setup frame', async () => {
  const h = harness()
  const res = await h.call('/login?onboard=1')
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(html, /Welcome to Tracy Cowork/)
  const rows = [...html.matchAll(/<button class="setup-step"[^>]*>/g)].map((m) => m[0])
  assert.equal(rows.length, 4)
  assert.match(rows[0], /aria-current="step"/)
  assert.doesNotMatch(rows[0], /disabled/)
  for (const row of rows.slice(1)) assert.match(row, /disabled/)
  for (const name of ['Sign in', 'Pick your AI account', 'Appearance &amp; language', 'Notifications'])
    assert.ok(html.includes(name), name)
  assert.match(html, /Sign in first to open the next steps/)
  assert.doesNotMatch(html, />Skip</)
  assert.doesNotMatch(html, />Continue</)
})

test('the onboard email form goes to GET /signin/email; Google stays, GitHub does not show', async () => {
  const h = harness()
  const html = await (await h.call('/login?onboard=1')).text()
  assert.match(html, /<form id="email-form" method="get" action="\/signin\/email">/)
  assert.match(html, /<input id="login-email" type="email" name="email"/)
  assert.doesNotMatch(html, /action="\/login"/, 'no POST /login form: the code is entered in the browser')
  assert.doesNotMatch(html, /action="\/verify"/)
  assert.match(html, /<form method="get" action="\/signin\/google">/)
  assert.doesNotMatch(html, /\/signin\/github/)
  assert.doesNotMatch(html, /<script/i, 'nothing intercepts the form: the app watches the navigation')
})

test('a signed-in browser opening /login?onboard=1 is sent on, as on /login', async () => {
  const h = harness()
  await h.call('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'lee@example.com' })
  })
  const code = h.mailbox.at(-1).text.match(/\b(\d{6})\b/)[1]
  const verified = await h.call('/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'lee@example.com', code })
  })
  const cookie = verified.headers.get('set-cookie').split(';')[0]
  const res = await h.call('/login?onboard=1', { headers: { cookie } })
  assert.equal(res.status, 302)
})

// ── GET /signin/email — the app catches it; a browser that is not the app lands on /login ────

test('GET /signin/email sends a browser to /login with the address filled in', async () => {
  const h = harness()
  const res = await h.call('/signin/email?email=%20Lee@Example.com%20')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/login?email=lee%40example.com')
  assert.equal(h.mailbox.length, 0, 'a GET sends no code')
})

test('GET /signin/email keeps a safe next and drops anything else', async () => {
  const h = harness()
  const kept = await h.call('/signin/email?email=a@b.co&next=%2Fagent')
  assert.equal(kept.headers.get('location'), '/login?email=a%40b.co&next=%2Fagent')
  const foreign = await h.call('/signin/email?email=a@b.co&next=https%3A%2F%2Fevil.example')
  assert.equal(foreign.headers.get('location'), '/login?email=a%40b.co')
  const bad = await h.call('/signin/email?email=nope')
  assert.equal(bad.headers.get('location'), '/login')
  const none = await h.call('/signin/email')
  assert.equal(none.headers.get('location'), '/login')
})

// ── `reason`: why the desktop app came back to the sign-in page ──────────────────────────────

test('a refused desktop sign-in lands on the onboard page with the waitlist wording', async () => {
  const h = harness()
  const html = await (await h.call('/login?onboard=1&reason=not-admitted')).text()
  assert.match(html, /role="alert"/)
  assert.match(html, /This address is not on the Tracy whitelist yet/)
})

test('an expired, denied or failed round says the sign-in did not finish', async () => {
  const h = harness()
  for (const reason of ['expired', 'denied', 'failed']) {
    const html = await (await h.call(`/login?onboard=1&reason=${reason}`)).text()
    assert.match(html, /The sign-in did not finish\. Try again\./, reason)
  }
})

test('the reason shows on the plain sign-in page too, translated', async () => {
  const h = harness()
  const html = await (await h.call('/login?reason=failed&lang=vi')).text()
  assert.match(html, /<div class="alert destructive" role="alert" id="email-error">/)
  assert.doesNotMatch(html, /The sign-in did not finish/)
})

test('an unknown or empty reason draws nothing and is never echoed', async () => {
  const h = harness()
  for (const query of ['?onboard=1&reason=%3Cb%3Ehi', '?onboard=1&reason=', '?reason=hello-world']) {
    const html = await (await h.call(`/login${query}`)).text()
    assert.doesNotMatch(html, /role="alert" id="email-error">/, query)
    assert.doesNotMatch(html, /hello-world|&lt;b&gt;hi|<b>hi/, query)
    // The plain page's script carries the waitlist wording for its own use; only a drawn alert counts.
    assert.doesNotMatch(html, /did not finish/, query)
  }
})
