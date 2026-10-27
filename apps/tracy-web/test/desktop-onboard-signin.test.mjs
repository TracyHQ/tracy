/**
 * The desktop app's first-run sign-in (`tasks/todo-desktop-onboard-v2.md`, contract items 1–3 and
 * council decisions (a) and (b)): the app opens a desktop round carrying the address the person
 * typed (`email_hint`), the browser verifies that address with a code bound to THAT round, and the
 * one press "Verify and sign in to the app" both proves the inbox and approves the round.
 *
 * Every case runs on the memory store, and on Postgres when `TEST_DATABASE_URL` is set: the two
 * stores must agree on every rule, most of all the one-transaction consume.
 *
 *   node --test apps/tracy-web/test/desktop-onboard-signin.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'

import { Hono } from 'hono'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { identityRoutes } from '../src/identity/route.js'
import { memoryIdentityStore, pgIdentityStore } from '../src/identity/store.js'
import { laneRoutes } from '../src/lanes/route.js'
import { signInCodeMail } from '../src/mail/emails.js'
import { sha256Hex } from '../src/lib/hmac.js'
import { fileDb } from './_db.mjs'

const ORIGIN = 'https://cowork.example'
const ENV = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'example',
  SESSION_SECRET: 'desktop-onboard-session-secret',
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: 'desktop-onboard-actor-secret'
}

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const BACKENDS = [
  { name: 'memory store', skip: false, store: () => memoryIdentityStore(), pool: () => null },
  {
    name: 'Postgres store',
    skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL to run against a real Postgres',
    store: () => pgIdentityStore(db.pool),
    pool: () => db.pool
  }
]

/** The `name=value` pairs of every `Set-Cookie` line, joined as a `Cookie` header. */
function cookiesOf(response) {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .filter((pair) => !pair.endsWith('='))
    .join('; ')
}

/** Merge two `Cookie` headers, the later value of a name winning — what a browser jar does. */
function jar(...headers) {
  const map = new Map()
  for (const header of headers) {
    for (const pair of String(header ?? '').split(/;\s*/)) {
      if (!pair) continue
      const at = pair.indexOf('=')
      map.set(pair.slice(0, at), pair.slice(at + 1))
    }
  }
  return [...map].map(([k, v]) => `${k}=${v}`).join('; ')
}

/** The value of a hidden `<input name="…">` on a page. */
function field(html, name) {
  return new RegExp(`<input type="hidden" name="${name}" value="([^"]*)"`).exec(html)?.[1] ?? null
}

for (const backend of BACKENDS) {
  describe(`desktop first-run sign-in — ${backend.name}`, { skip: backend.skip }, () => {
    function harness({ beta } = {}) {
      const mailbox = []
      const clock = { now: Date.now() }
      const store = backend.store()
      const pool = backend.pool()
      const app = buildApp({
        config: readConfig(ENV),
        identity: store,
        mail: { send: async (message) => void mailbox.push(message) },
        now: () => clock.now,
        ...(beta ? { beta } : {}),
        ...(pool ? { pool } : {})
      })
      const call = (path, init) => app.fetch(new Request(`${ORIGIN}${path}`, init))
      const postJson = (path, body, headers = {}) =>
        call(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify(body)
        })
      const postForm = (path, fields, { cookie, origin = ORIGIN } = {}) =>
        call(path, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            ...(cookie ? { cookie } : {}),
            ...(origin === false ? {} : { origin })
          },
          body: new URLSearchParams(fields).toString()
        })
      const lastCode = () => mailbox.at(-1).text.match(/\b(\d{6})\b/)[1]
      async function signIn(email) {
        await postJson('/login', { email })
        const verified = await postJson('/verify', { email, code: lastCode() })
        return cookiesOf(verified)
      }
      const open = async (body) =>
        await (
          await postJson('/auth/link/browser', { purpose: 'desktop', device: 'MacBook Pro', ...body })
        ).json()
      const poll = async (nonce) => (await (await call(`/auth/link/${nonce}`)).json()).status
      /** Open the round's page in a browser jar; answers the page, its token and the jar. */
      async function visit(nonce, cookie = '') {
        const page = await call(`/signin?n=${nonce}`, cookie ? { headers: { cookie } } : undefined)
        const html = await page.text()
        return { page, html, token: field(html, 't'), cookie: jar(cookie, cookiesOf(page)) }
      }
      /** Visit, press "Email me a code"; answers the code page and everything needed to press on. */
      async function askCode(nonce, cookie = '') {
        const v = await visit(nonce, cookie)
        const sent = await postForm('/signin/code', { n: nonce, t: v.token }, { cookie: v.cookie })
        return { ...v, sent, sentHtml: await sent.text() }
      }
      const verify = (nonce, fields, opts) => postForm('/signin/verify', { n: nonce, ...fields }, opts)
      const redeem = (nonce, clientSecret) =>
        call(`/auth/link/${nonce}/session`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: JSON.stringify({ clientSecret })
        })
      const me = async (cookie) => (await (await call('/auth/me', { headers: { cookie } })).json()).email
      return {
        app,
        store,
        pool,
        clock,
        mailbox,
        call,
        postJson,
        postForm,
        lastCode,
        signIn,
        open,
        poll,
        visit,
        askCode,
        verify,
        redeem,
        me
      }
    }

    // ── The round carries the address typed in the app ─────────────────────────────────────

    test('every page of the round that holds a form keeps Referrer-Policy: same-origin, so Chrome sends a real Origin', async () => {
      // Under `no-referrer` Chrome posts the page's forms with `Origin: null`, and the Origin check
      // refuses the press (measured on a stand 11/10/2026: the code step from POST /signin/code, then
      // "Verify and sign in to the app" → "This approval did not come from the Tracy sign-in page").
      const h = harness()
      const round = await h.open({ email: 'lee@example.com' })
      const asked = await h.askCode(round.nonce)
      assert.equal(asked.page.headers.get('referrer-policy'), 'same-origin', 'GET /signin?n=')
      assert.match(asked.sentHtml, /action="\/signin\/verify"/)
      assert.equal(
        asked.sent.headers.get('referrer-policy'),
        'same-origin',
        'POST /signin/code (the code step)'
      )
      const wrong = await h.verify(round.nonce, { t: asked.token, code: '000000' }, { cookie: asked.cookie })
      assert.equal(wrong.status, 401)
      assert.match(await wrong.text(), /action="\/signin\/verify"/)
      assert.equal(
        wrong.headers.get('referrer-policy'),
        'same-origin',
        'POST /signin/verify (a wrong code, the form again)'
      )
    })

    test('with no session, a round carrying an address renders the send-code step for that address', async () => {
      const h = harness()
      const round = await h.open({ email: '  Lee@Example.COM ' })
      const page = await h.call(`/signin?n=${round.nonce}`)
      assert.equal(page.status, 200)
      const html = await page.text()
      assert.match(html, /lee@example\.com/)
      assert.ok(html.includes(round.matchCode), 'the page shows the match code')
      assert.match(html, /<form method="post" action="\/signin\/code">/)
      assert.equal(h.mailbox.length, 0, 'a GET never sends a code')
      assert.doesNotMatch(html, /<script/i)
    })

    test('one press verifies the code, approves the round, and signs this browser in as the typed address', async () => {
      const h = harness()
      const round = await h.open({ email: 'lee@example.com' })
      const asked = await h.askCode(round.nonce)
      assert.equal(asked.sent.status, 200)
      assert.equal(h.mailbox.length, 1)
      assert.equal(h.mailbox[0].to, 'lee@example.com')
      assert.ok(asked.sentHtml.includes(round.matchCode), 'the code step shows the match code')
      assert.match(asked.sentHtml, /Verify and sign in to the app/)
      assert.match(asked.sentHtml, /on this computer/)
      assert.match(asked.sentHtml, /Approve only if you just started this sign-in yourself/)
      assert.doesNotMatch(asked.sentHtml, /<script/i, 'nothing submits by itself')
      assert.equal(await h.poll(round.nonce), 'pending')
      const res = await h.verify(
        round.nonce,
        { t: asked.token, code: h.lastCode() },
        { cookie: asked.cookie }
      )
      assert.equal(res.status, 200)
      assert.match(await res.text(), /lee@example\.com/)
      assert.equal(await h.poll(round.nonce), 'approved')
      assert.equal(await h.me(jar(asked.cookie, cookiesOf(res))), 'lee@example.com')
      // The app's own redeem now works, for the same address.
      const redeemed = await h.redeem(round.nonce, round.clientSecret)
      assert.equal(redeemed.status, 204)
      assert.equal(await h.me(cookiesOf(redeemed)), 'lee@example.com')
    })

    // ── Opening a round with an address ───────────────────────────────────────────────────────

    test('the address is optional, normalised, and refused when malformed, too long or on a lane round', async () => {
      const h = harness()
      for (const email of [undefined, null, '', '   ']) {
        const res = await h.postJson('/auth/link/browser', { purpose: 'desktop', email })
        assert.equal(res.status, 200, JSON.stringify(email))
      }
      const long = `${'a'.repeat(250)}@x.co`
      for (const body of [
        { purpose: 'desktop', email: 'not-an-address' },
        { purpose: 'desktop', email: 42 },
        { purpose: 'desktop', email: ['a@b.co'] },
        { purpose: 'desktop', email: long },
        { email: 'a@b.co' },
        { purpose: 'lane', email: 'a@b.co' }
      ]) {
        const res = await h.postJson('/auth/link/browser', body)
        assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80))
        assert.deepEqual(await res.json(), { code: 'INVALID_REQUEST' })
      }
      const round = await h.open({ email: ' Lee@Example.com ' })
      const row = await h.store.linkByNonce(await sha256Hex(round.nonce))
      assert.equal(row.emailHint, 'lee@example.com')
      const plain = await h.open({})
      assert.equal((await h.store.linkByNonce(await sha256Hex(plain.nonce))).emailHint, null)
    })

    test('a round without an address, or one named for a provider, keeps the old road to sign-in', async () => {
      const h = harness()
      const plain = await h.open({})
      const res = await h.call(`/signin?n=${plain.nonce}`)
      assert.equal(res.status, 302)
      assert.match(res.headers.get('location'), /^\/login\?next=/)
      const typed = await h.open({ email: 'lee@example.com' })
      const viaGoogle = await h.call(`/signin?n=${typed.nonce}&provider=google`)
      assert.equal(viaGoogle.status, 302)
    })

    // ── Only this round's code, from this page, approves this round ─────────────────────────

    test('a code mailed for an ordinary web sign-in does not approve the round', async () => {
      const h = harness()
      const round = await h.open({ email: 'lee@example.com' })
      const asked = await h.askCode(round.nonce)
      await h.postJson('/login', { email: 'lee@example.com' })
      const webCode = h.lastCode()
      const res = await h.verify(round.nonce, { t: asked.token, code: webCode }, { cookie: asked.cookie })
      // The round's own code was replaced by nothing: the web code is not this round's.
      if (res.status === 200) assert.fail('a web sign-in code approved a desktop round')
      assert.equal(res.status, 401)
      assert.equal(await h.poll(round.nonce), 'pending')
      assert.equal(res.headers.get('set-cookie'), null)
    })

    test("another round's code does not approve this round, and the form cannot name the address", async () => {
      const h = harness()
      const mine = await h.open({ email: 'lee@example.com' })
      const theirs = await h.open({ email: 'lee@example.com' })
      const a = await h.askCode(mine.nonce)
      await h.askCode(theirs.nonce, a.cookie)
      const theirCode = h.lastCode()
      const res = await h.verify(
        mine.nonce,
        { t: a.token, code: theirCode, email: 'attacker@example.com' },
        { cookie: a.cookie }
      )
      assert.equal(res.status, 401)
      assert.equal(await h.poll(mine.nonce), 'pending')
      assert.equal(h.mailbox.filter((m) => m.to !== 'lee@example.com').length, 0)
    })

    test('a foreign, null or missing Origin is refused on both doors, with or without a session', async () => {
      const h = harness()
      const round = await h.open({ email: 'lee@example.com' })
      const v = await h.visit(round.nonce)
      const session = await h.signIn('other@example.com')
      for (const cookie of [v.cookie, jar(v.cookie, session)]) {
        for (const origin of [
          false,
          'null',
          'https://evil.example',
          'https://site.example',
          `${ORIGIN}.evil.net`
        ]) {
          const sent = await h.postForm('/signin/code', { n: round.nonce, t: v.token }, { cookie, origin })
          assert.ok([403].includes(sent.status), `code ${String(origin)} → ${sent.status}`)
          const verified = await h.verify(round.nonce, { t: v.token, code: '000000' }, { cookie, origin })
          assert.equal(verified.status, 403, `verify ${String(origin)}`)
        }
      }
      assert.equal(h.mailbox.filter((m) => m.to === 'lee@example.com').length, 0)
    })

    test('a missing token, a token of another round or of another browser is refused', async () => {
      const h = harness()
      const round = await h.open({ email: 'lee@example.com' })
      const other = await h.open({ email: 'lee@example.com' })
      const v = await h.visit(round.nonce)
      const w = await h.visit(other.nonce, v.cookie)
      const stranger = await h.visit(round.nonce) // a second browser: its own id
      const cases = [
        [{ n: round.nonce }, v.cookie],
        [{ n: round.nonce, t: '' }, v.cookie],
        [{ n: round.nonce, t: w.token }, v.cookie],
        [{ n: round.nonce, t: stranger.token }, v.cookie],
        [{ n: round.nonce, t: v.token }, ''],
        [{ n: round.nonce, t: v.token }, stranger.cookie]
      ]
      for (const [fields, cookie] of cases) {
        const res = await h.postForm('/signin/code', fields, { cookie })
        assert.equal(res.status, 403, JSON.stringify(fields).slice(0, 60))
      }
      assert.equal(h.mailbox.length, 0)
      // The two tabs of one browser each keep a working token of their own.
      assert.equal(v.cookie, w.cookie, 'one browser id, reused')
      assert.equal(
        (await h.postForm('/signin/code', { n: other.nonce, t: w.token }, { cookie: v.cookie })).status,
        200
      )
      assert.equal(
        (await h.postForm('/signin/code', { n: round.nonce, t: v.token }, { cookie: v.cookie })).status,
        200
      )
    })

    test('an expired, approved or denied round answers nothing on either door', async () => {
      const h = harness()
      const expired = await h.open({ email: 'lee@example.com' })
      const ve = await h.askCode(expired.nonce)
      h.clock.now += 16 * 60 * 1000
      assert.equal(
        (await h.verify(expired.nonce, { t: ve.token, code: h.lastCode() }, { cookie: ve.cookie })).status,
        400
      )
      assert.equal(
        (await h.postForm('/signin/code', { n: expired.nonce, t: ve.token }, { cookie: ve.cookie })).status,
        400
      )

      const done = await h.open({ email: 'lee@example.com' })
      const vd = await h.askCode(done.nonce)
      const code = h.lastCode()
      assert.equal((await h.verify(done.nonce, { t: vd.token, code }, { cookie: vd.cookie })).status, 200)
      const again = await h.verify(done.nonce, { t: vd.token, code }, { cookie: vd.cookie })
      assert.equal(again.status, 400, 'an approved round is not approved twice')
      assert.equal(
        (await h.postForm('/signin/code', { n: done.nonce, t: vd.token }, { cookie: vd.cookie })).status,
        400
      )
    })

    test('two parallel presses with the right code: exactly one approves', async () => {
      const h = harness()
      const round = await h.open({ email: 'lee@example.com' })
      const asked = await h.askCode(round.nonce)
      const code = h.lastCode()
      const answers = await Promise.all(
        [1, 2, 3].map(() => h.verify(round.nonce, { t: asked.token, code }, { cookie: asked.cookie }))
      )
      const statuses = answers.map((r) => r.status).sort()
      assert.equal(statuses.filter((s) => s === 200).length, 1, statuses.join(','))
      assert.equal(await h.poll(round.nonce), 'approved')
    })

    test('a new code kills the old one', async () => {
      const h = harness()
      const round = await h.open({ email: 'lee@example.com' })
      const asked = await h.askCode(round.nonce)
      const first = h.lastCode()
      assert.equal(
        (await h.postForm('/signin/code', { n: round.nonce, t: asked.token }, { cookie: asked.cookie }))
          .status,
        200
      )
      const second = h.lastCode()
      if (first !== second) {
        const old = await h.verify(round.nonce, { t: asked.token, code: first }, { cookie: asked.cookie })
        assert.equal(old.status, 401, 'the replaced code no longer works')
      }
      const ok = await h.verify(round.nonce, { t: asked.token, code: second }, { cookie: asked.cookie })
      assert.equal(ok.status, 200)
    })

    test('the code dies after five wrong tries, even when the sixth is right', async () => {
      const h = harness()
      const round = await h.open({ email: 'lee@example.com' })
      const asked = await h.askCode(round.nonce)
      const code = h.lastCode()
      const wrong = code === '000000' ? '111111' : '000000'
      for (let i = 0; i < 5; i += 1)
        assert.equal(
          (await h.verify(round.nonce, { t: asked.token, code: wrong }, { cookie: asked.cookie })).status,
          401
        )
      const late = await h.verify(round.nonce, { t: asked.token, code }, { cookie: asked.cookie })
      assert.equal(late.status, 401)
      assert.equal(await h.poll(round.nonce), 'pending')
    })

    test('a wrong code keeps the step, says so, and signs nobody in', async () => {
      const h = harness()
      const round = await h.open({ email: 'lee@example.com' })
      const asked = await h.askCode(round.nonce)
      const wrong = h.lastCode() === '000000' ? '111111' : '000000'
      const res = await h.verify(round.nonce, { t: asked.token, code: wrong }, { cookie: asked.cookie })
      assert.equal(res.status, 401)
      const html = await res.text()
      assert.match(html, /That code did not work/)
      assert.match(html, /action="\/signin\/verify"/)
      assert.equal(res.headers.get('set-cookie'), null)
    })

    // ── The browser is already signed in ────────────────────────────────────────────────────

    test('signed in as the typed address: the ordinary approve page, and no code is sent', async () => {
      const h = harness()
      const session = await h.signIn('lee@example.com')
      const mailed = h.mailbox.length
      const round = await h.open({ email: 'lee@example.com' })
      const html = await (await h.call(`/signin?n=${round.nonce}`, { headers: { cookie: session } })).text()
      assert.match(html, /<form method="post" action="\/signin\/approve">/)
      assert.doesNotMatch(html, /\/signin\/code/)
      assert.equal(h.mailbox.length, mailed)
      const res = await h.postForm(
        '/signin/approve',
        { n: round.nonce, email: 'lee@example.com' },
        { cookie: session }
      )
      assert.equal(res.status, 200)
      assert.equal(await h.poll(round.nonce), 'approved')
    })

    test('signed in as another address: the page names both and says Google is not signed out', async () => {
      const h = harness()
      const session = await h.signIn('x@example.com')
      const round = await h.open({ email: 'y@example.com' })
      const res = await h.call(`/signin?n=${round.nonce}`, { headers: { cookie: session } })
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /x@example\.com/)
      assert.match(html, /y@example\.com/)
      assert.match(html, /does not sign you out of Google/)
      assert.ok(html.includes(round.matchCode))
      assert.match(html, /action="\/signin\/code"/)
      assert.match(html, /name="use" value="session"/)
      assert.equal(await h.me(session), 'x@example.com', 'opening the page signs nobody out')
    })

    test('"Use Y": the browser stays X through a wrong code and becomes Y only once Y is verified', async () => {
      const h = harness()
      const session = await h.signIn('x@example.com')
      const round = await h.open({ email: 'y@example.com' })
      const asked = await h.askCode(round.nonce, session)
      assert.equal(asked.sent.status, 200)
      assert.equal(h.mailbox.at(-1).to, 'y@example.com')
      assert.equal(await h.me(asked.cookie), 'x@example.com')
      const code = h.lastCode()
      const wrong = code === '000000' ? '111111' : '000000'
      const bad = await h.verify(round.nonce, { t: asked.token, code: wrong }, { cookie: asked.cookie })
      assert.equal(bad.status, 401)
      assert.equal(bad.headers.get('set-cookie'), null)
      assert.equal(await h.me(asked.cookie), 'x@example.com', 'a wrong code never falls back to X')
      assert.equal(await h.poll(round.nonce), 'pending')
      const good = await h.verify(round.nonce, { t: asked.token, code }, { cookie: asked.cookie })
      assert.equal(good.status, 200)
      assert.equal(await h.me(jar(asked.cookie, cookiesOf(good))), 'y@example.com')
      const redeemed = await h.redeem(round.nonce, round.clientSecret)
      assert.equal(await h.me(cookiesOf(redeemed)), 'y@example.com')
    })

    test('"Use X": a deliberate choice on the confirm page; the round records X', async () => {
      const h = harness()
      const session = await h.signIn('x@example.com')
      const round = await h.open({ email: 'y@example.com' })
      const html = await (
        await h.call(`/signin?n=${round.nonce}&use=session`, { headers: { cookie: session } })
      ).text()
      assert.match(html, /<form method="post" action="\/signin\/approve">/)
      assert.equal(field(html, 'email'), 'x@example.com')
      const res = await h.postForm(
        '/signin/approve',
        { n: round.nonce, email: 'x@example.com' },
        { cookie: session }
      )
      assert.equal(res.status, 200)
      const redeemed = await h.redeem(round.nonce, round.clientSecret)
      assert.equal(await h.me(cookiesOf(redeemed)), 'x@example.com')
    })

    test('the session changed between the page and the press: approve refuses', async () => {
      const h = harness()
      const x = await h.signIn('x@example.com')
      const round = await h.open({ email: 'y@example.com' })
      await h.call(`/signin?n=${round.nonce}&use=session`, { headers: { cookie: x } })
      const z = await h.signIn('z@example.com') // another tab signed in as Z
      const res = await h.postForm(
        '/signin/approve',
        { n: round.nonce, email: 'x@example.com' },
        { cookie: z }
      )
      assert.equal(res.status, 409)
      assert.equal(await h.poll(round.nonce), 'pending')
      // A press that names no account cannot approve a typed round for a different session either.
      const bare = await h.postForm('/signin/approve', { n: round.nonce }, { cookie: x })
      assert.equal(bare.status, 409)
      assert.equal(await h.poll(round.nonce), 'pending')
    })
  })
}

// ── The beta gate (memory store; `buildApp` builds its own gate, so the doors are mounted here) ──

test('with the gate on, an address it does not admit gets the same page and no working code', async () => {
  const queued = []
  const mailbox = []
  let verdict = { status: 'waitlist', badge: 'fallback list', plans: [], gate: true }
  const beta = {
    access: { enabled: true, decide: async () => verdict },
    enqueue: async (email) => void queued.push(email)
  }
  const store = memoryIdentityStore()
  const config = readConfig(ENV)
  const mail = { send: async (m) => void mailbox.push(m), signInCodeMail }
  const app = new Hono()
  app.route('/', laneRoutes({ pool: null, config, store, mail, seats: {}, otp: {} }))
  app.route('/', identityRoutes({ store, mail, config, beta }))
  const call = (path, init) => app.fetch(new Request(`${ORIGIN}${path}`, init))
  const form = (path, fields, cookie) =>
    call(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, cookie },
      body: new URLSearchParams(fields).toString()
    })
  const round = await (
    await call('/auth/link/browser', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'desktop', email: 'lee@example.com' })
    })
  ).json()
  const page = await call(`/signin?n=${round.nonce}`)
  const cookie = cookiesOf(page)
  const token = field(await page.text(), 't')
  const sent = await form('/signin/code', { n: round.nonce, t: token }, cookie)
  assert.equal(sent.status, 200)
  assert.match(await sent.text(), /action="\/signin\/verify"/)
  assert.deepEqual(queued, ['lee@example.com'])
  assert.equal(mailbox.length, 0, 'no code was mailed')
  // Admitted now: a code is mailed, but the gate is asked again when it is used.
  verdict = { status: 'allow', badge: 'JoomlArt member', plans: [], gate: true }
  await form('/signin/code', { n: round.nonce, t: token }, cookie)
  const code = mailbox.at(-1).text.match(/\b(\d{6})\b/)[1]
  verdict = { status: 'waitlist', badge: 'fallback list', plans: [], gate: true }
  const refused = await form('/signin/verify', { n: round.nonce, t: token, code }, cookie)
  assert.equal(refused.status, 401)
  assert.match(await refused.text(), /whitelist/)
  const status = (await (await call(`/auth/link/${round.nonce}`)).json()).status
  assert.equal(status, 'pending')
})
