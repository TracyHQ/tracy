/**
 * The desktop app's sign-in round (`tasks/todo-desktop-signin-package.md`, "API contract"): the
 * app opens an `auth_link` round with `purpose: "desktop"`, the person approves it in their own
 * browser at `/signin`, and the app trades the approved round for a session cookie of its own at
 * `POST /auth/link/:nonce/session`.
 *
 * WHY EVERY CASE RUNS TWICE. The identity store has two implementations (memory, for a laptop with
 * no `DATABASE_URL`, and Postgres) that must agree on every rule, most of all the one-statement
 * consume. Each case below runs on the memory store always, and on Postgres when
 * `TEST_DATABASE_URL` is set.
 *
 *   node --test apps/tracy-web/test/desktop-signin.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { identityRoutes } from '../src/identity/route.js'
import { memoryIdentityStore, pgIdentityStore } from '../src/identity/store.js'
import { laneRoutes } from '../src/lanes/route.js'
import { sha256Hex } from '../src/lib/hmac.js'
import { matchCode } from '../src/lib/match-code.js'
import { DESKTOP_LINK_SESSION_LIMIT_PER_IP_PER_HOUR } from '../src/lib/policy.js'
import { fileDb } from './_db.mjs'

const ORIGIN = 'https://cowork.example'
const SESSION_SECRET = 'desktop-signin-session-secret'
const ENV = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'example',
  SESSION_SECRET,
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: 'desktop-signin-actor-secret'
}
const HEX64 = /^[a-f0-9]{64}$/
const MATCH = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/

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

for (const backend of BACKENDS) {
  describe(`desktop sign-in round — ${backend.name}`, { skip: backend.skip }, () => {
    /** The app as the composition root builds it; `clock` moves only when a case moves it. */
    function harness() {
      const mailbox = []
      const clock = { now: Date.now() }
      const store = backend.store()
      const pool = backend.pool()
      const app = buildApp({
        config: readConfig(ENV),
        identity: store,
        mail: { send: async (message) => void mailbox.push(message) },
        now: () => clock.now,
        ...(pool ? { pool } : {})
      })
      const call = (path, init) => app.fetch(new Request(`${ORIGIN}${path}`, init))
      const postJson = (path, body, headers = {}) =>
        call(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify(body)
        })
      /** Sign in the way a person does; answers the whole `Set-Cookie` line and the pair. */
      async function signIn(email = 'owner@example.com') {
        await postJson('/login', { email })
        const code = mailbox.at(-1).text.match(/\b(\d{6})\b/)[1]
        const verified = await postJson('/verify', { email, code })
        const setCookie = verified.headers.get('set-cookie')
        return { setCookie, cookie: setCookie.split(';')[0] }
      }
      const open = async (body = { purpose: 'desktop', device: 'MacBook Pro' }) =>
        await (await postJson('/auth/link/browser', body)).json()
      const press = (door, nonce, { cookie, origin = ORIGIN } = {}) =>
        call(`/signin/${door}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            ...(cookie ? { cookie } : {}),
            ...(origin === false ? {} : { origin })
          },
          body: new URLSearchParams({ n: nonce }).toString()
        })
      const poll = async (nonce) => (await (await call(`/auth/link/${nonce}`)).json()).status
      /** The app's redeem: JSON, `Origin` of the deployment, the client secret in the body. */
      const redeem = (nonce, clientSecret, { origin = ORIGIN, headers = {}, raw } = {}) =>
        call(`/auth/link/${nonce}/session`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(origin === false ? {} : { origin }),
            ...headers
          },
          body: raw ?? JSON.stringify({ clientSecret })
        })
      /** A desktop round opened and approved by a signed-in person. */
      async function approvedRound(email = 'owner@example.com') {
        const { cookie } = await signIn(email)
        const round = await open()
        assert.equal((await press('approve', round.nonce, { cookie })).status, 200)
        return { ...round, cookie }
      }
      return {
        app,
        store,
        pool,
        clock,
        mailbox,
        call,
        postJson,
        signIn,
        open,
        press,
        poll,
        redeem,
        approvedRound
      }
    }

    // ── Opening a round ──────────────────────────────────────────────────────────────────────

    test('a desktop round opens with a match code derived from its nonce', async () => {
      const h = harness()
      const round = await h.open()
      assert.match(round.nonce, HEX64)
      assert.match(round.clientSecret, HEX64)
      assert.match(round.matchCode, MATCH)
      assert.equal(round.matchCode, matchCode(round.nonce))
      assert.ok(round.expiresAt > h.clock.now)
    })

    test('a lane opening a round with {} or {device} gets exactly the answer it always got', async () => {
      const h = harness()
      for (const body of [{}, { device: 'site lane' }, { purpose: 'lane' }, { purpose: null }]) {
        const round = await (await h.postJson('/auth/link/browser', body)).json()
        assert.deepEqual(
          Object.keys(round).sort(),
          ['clientSecret', 'expiresAt', 'nonce'],
          JSON.stringify(body)
        )
      }
    })

    test('an unknown purpose is refused rather than read as a lane', async () => {
      const h = harness()
      for (const purpose of ['admin', 42, ['desktop'], { desktop: true }, 'DESKTOP']) {
        const res = await h.postJson('/auth/link/browser', { purpose })
        assert.equal(res.status, 400, JSON.stringify(purpose))
        assert.deepEqual(await res.json(), { code: 'INVALID_REQUEST' })
      }
    })

    // ── The approve page ─────────────────────────────────────────────────────────────────────

    // Under `no-referrer` Chrome sends `Origin: null` on a plain form POST, and /signin/approve and
    // /signin/deny refuse anything but the real origin: no browser could press Approve (measured in
    // Chrome 154 on 07/10/2026, lane and desktop rounds alike). Both pages must keep `same-origin`.
    test('the approve page of a lane round and of a desktop round both send Referrer-Policy: same-origin', async () => {
      const h = harness()
      const { cookie } = await h.signIn()
      for (const body of [{}, { purpose: 'desktop' }]) {
        const round = await h.open(body)
        const page = await h.call(`/signin?n=${round.nonce}`, { headers: { cookie } })
        assert.equal(page.status, 200, JSON.stringify(body))
        assert.equal(page.headers.get('referrer-policy'), 'same-origin', JSON.stringify(body))
      }
    })

    test('the page names the app, the account, the escaped device and the same match code', async () => {
      const h = harness()
      const { cookie } = await h.signIn()
      const round = await h.open({ purpose: 'desktop', device: '<b>Lee\'s "Mac"</b>' })
      const page = await h.call(`/signin?n=${round.nonce}`, { headers: { cookie } })
      assert.equal(page.status, 200)
      assert.equal(page.headers.get('referrer-policy'), 'same-origin')
      const html = await page.text()
      assert.match(html, /Tracy Cowork for Mac/)
      assert.match(html, /owner@example\.com/)
      assert.match(html, /&lt;b&gt;Lee&#39;s &quot;Mac&quot;&lt;\/b&gt;/)
      assert.doesNotMatch(html, /<b>Lee/)
      assert.ok(html.includes(round.matchCode), 'the page shows the code the API answered')
      assert.match(html, /<form method="post" action="\/signin\/approve">/)
      assert.match(html, /<form method="post" action="\/signin\/deny">/)
      assert.doesNotMatch(html, /<script/i)
    })

    test('a lane round keeps its own page: no app name, no match code, no deny button', async () => {
      const h = harness()
      const { cookie } = await h.signIn()
      const round = await h.open({})
      const html = await (await h.call(`/signin?n=${round.nonce}`, { headers: { cookie } })).text()
      assert.doesNotMatch(html, /Tracy Cowork for Mac/)
      assert.doesNotMatch(html, /\/signin\/deny/)
      assert.ok(!html.includes(matchCode(round.nonce)))
      assert.match(html, /<form method="post" action="\/signin\/approve">/)
    })

    // ── Deny ─────────────────────────────────────────────────────────────────────────────────

    test('Deny ends the round: the app reads denied, and it can be neither approved nor redeemed', async () => {
      const h = harness()
      const { cookie } = await h.signIn()
      const round = await h.open()
      const denied = await h.press('deny', round.nonce, { cookie })
      assert.equal(denied.status, 200)
      assert.equal(await h.poll(round.nonce), 'denied')
      assert.equal((await h.press('approve', round.nonce, { cookie })).status, 400)
      assert.equal((await h.redeem(round.nonce, round.clientSecret)).status, 404)
      assert.equal(await h.poll(round.nonce), 'denied')
    })

    test('Deny refuses a missing, null or foreign Origin, and a missing session', async () => {
      const h = harness()
      const { cookie } = await h.signIn()
      const round = await h.open()
      for (const origin of [false, 'null', 'https://evil.example', 'https://site.example']) {
        assert.equal((await h.press('deny', round.nonce, { cookie, origin })).status, 403, String(origin))
      }
      assert.equal((await h.press('deny', round.nonce, {})).status, 401)
      assert.equal(await h.poll(round.nonce), 'pending')
    })

    test('a denied round reads expired once its window has passed', async () => {
      const h = harness()
      const { cookie } = await h.signIn()
      const round = await h.open()
      await h.press('deny', round.nonce, { cookie })
      h.clock.now += 16 * 60 * 1000
      assert.equal(await h.poll(round.nonce), 'expired')
    })

    test('a lane never sees the word denied: its denied round reads expired, as before', async () => {
      const h = harness()
      const { cookie } = await h.signIn()
      const round = await h.open({})
      assert.equal((await h.press('deny', round.nonce, { cookie })).status, 200)
      assert.equal(await h.poll(round.nonce), 'expired')
    })

    // ── Cancel: the app ends its own round ───────────────────────────────────────────────────

    const cancel = (h, nonce, clientSecret, { origin = ORIGIN, headers = {}, raw } = {}) =>
      h.call(`/auth/link/${nonce}/cancel`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(origin === false ? {} : { origin }),
          ...headers
        },
        body: raw ?? JSON.stringify({ clientSecret })
      })

    test('the app cancels its pending round: it reads denied and a later approve cannot be redeemed', async () => {
      const h = harness()
      const { cookie } = await h.signIn()
      const round = await h.open()
      const res = await cancel(h, round.nonce, round.clientSecret)
      assert.equal(res.status, 204)
      assert.equal(res.headers.get('cache-control'), 'no-store')
      assert.equal(await h.poll(round.nonce), 'denied')
      assert.equal((await h.press('approve', round.nonce, { cookie })).status, 400)
      assert.equal((await h.redeem(round.nonce, round.clientSecret)).status, 404)
    })

    test('cancel is idempotent: a second cancel answers the same and changes nothing', async () => {
      const h = harness()
      const round = await h.open()
      assert.equal((await cancel(h, round.nonce, round.clientSecret)).status, 204)
      assert.equal((await cancel(h, round.nonce, round.clientSecret)).status, 204)
      assert.equal(await h.poll(round.nonce), 'denied')
    })

    test('cancel with a wrong secret, or on a lane round, leaves the round pending', async () => {
      const h = harness()
      const round = await h.open()
      assert.equal((await cancel(h, round.nonce, 'b'.repeat(64))).status, 204)
      assert.equal(await h.poll(round.nonce), 'pending')
      const lane = await h.open({})
      assert.equal((await cancel(h, lane.nonce, lane.clientSecret)).status, 204)
      assert.equal(await h.poll(lane.nonce), 'pending')
    })

    test('cancel does not touch a round already approved', async () => {
      const h = harness()
      const round = await h.approvedRound()
      assert.equal((await cancel(h, round.nonce, round.clientSecret)).status, 204)
      assert.equal(await h.poll(round.nonce), 'approved')
    })

    test('cancel keeps the session door rules: exact Origin, JSON only, well-formed secret and nonce', async () => {
      const h = harness()
      const round = await h.open()
      for (const origin of [false, 'null', 'https://evil.example']) {
        assert.equal(
          (await cancel(h, round.nonce, round.clientSecret, { origin })).status,
          403,
          String(origin)
        )
      }
      const form = await cancel(h, round.nonce, round.clientSecret, {
        headers: { 'content-type': 'text/plain' }
      })
      assert.equal(form.status, 415)
      assert.equal((await cancel(h, round.nonce, round.clientSecret, { raw: '{}' })).status, 400)
      assert.equal((await cancel(h, 'not-a-nonce', round.clientSecret)).status, 404)
      assert.equal(await h.poll(round.nonce), 'pending')
    })

    // ── Redeem: the new door ─────────────────────────────────────────────────────────────────

    test('an approved round becomes a session cookie, set exactly as a normal sign-in sets it', async () => {
      const h = harness()
      const round = await h.approvedRound()
      const res = await h.redeem(round.nonce, round.clientSecret)
      assert.equal(res.status, 204)
      assert.equal(res.headers.get('cache-control'), 'no-store')
      assert.equal(await res.text(), '')
      const setCookie = res.headers.get('set-cookie')
      assert.match(setCookie, /^tracy_sess=[^;]+;/)
      // Same attributes as `/verify` gives, token aside.
      const normal = (await h.signIn('other@example.com')).setCookie
      const attrs = (line) => line.replace(/^tracy_sess=[^;]+/, '')
      assert.equal(attrs(setCookie), attrs(normal))
      // And it is a real session for the person who approved.
      const me = await (await h.call('/auth/me', { headers: { cookie: setCookie.split(';')[0] } })).json()
      assert.equal(me.email, 'owner@example.com')
      // One shot: the round is gone.
      assert.equal((await h.redeem(round.nonce, round.clientSecret)).status, 404)
      assert.equal(await h.poll(round.nonce), 'expired')
    })

    test('a wrong client secret is refused and leaves the round redeemable', async () => {
      const h = harness()
      const round = await h.approvedRound()
      const wrong = await h.redeem(round.nonce, 'b'.repeat(64))
      assert.equal(wrong.status, 404)
      assert.equal(wrong.headers.get('set-cookie'), null)
      assert.equal(await h.poll(round.nonce), 'approved')
      assert.equal((await h.redeem(round.nonce, round.clientSecret)).status, 204)
    })

    test('two redeems at once: exactly one session', async () => {
      const h = harness()
      const round = await h.approvedRound()
      const answers = await Promise.all(
        Array.from({ length: 5 }, () => h.redeem(round.nonce, round.clientSecret))
      )
      const statuses = answers.map((r) => r.status).sort()
      assert.deepEqual(statuses, [204, 404, 404, 404, 404])
      assert.equal(answers.filter((r) => r.headers.get('set-cookie')).length, 1)
    })

    test('a pending, denied or expired round is refused, and never burned by the attempt', async () => {
      const h = harness()
      const { cookie } = await h.signIn()
      const pending = await h.open()
      assert.equal((await h.redeem(pending.nonce, pending.clientSecret)).status, 404)
      assert.equal(await h.poll(pending.nonce), 'pending')

      const denied = await h.open()
      await h.press('deny', denied.nonce, { cookie })
      assert.equal((await h.redeem(denied.nonce, denied.clientSecret)).status, 404)

      const stale = await h.open()
      await h.press('approve', stale.nonce, { cookie })
      h.clock.now += 16 * 60 * 1000
      assert.equal((await h.redeem(stale.nonce, stale.clientSecret)).status, 404)
    })

    test('a lane round cannot be redeemed for a session, and the attempt leaves it to the lane', async () => {
      const h = harness()
      const { cookie } = await h.signIn()
      const round = await h.open({})
      await h.press('approve', round.nonce, { cookie })
      assert.equal((await h.redeem(round.nonce, round.clientSecret)).status, 404)
      const exchanged = await h.postJson(`/auth/link/${round.nonce}/exchange`, {
        clientSecret: round.clientSecret
      })
      assert.equal(exchanged.status, 200)
      assert.deepEqual(await exchanged.json(), { email: 'owner@example.com' })
    })

    test('the lane door refuses a desktop round, and does not burn it', async () => {
      const h = harness()
      const round = await h.approvedRound()
      const exchanged = await h.postJson(`/auth/link/${round.nonce}/exchange`, {
        clientSecret: round.clientSecret
      })
      assert.equal(exchanged.status, 400)
      assert.deepEqual(await exchanged.json(), { code: 'LINK_INVALID' })
      assert.equal((await h.redeem(round.nonce, round.clientSecret)).status, 204)
    })

    test('a missing, null, foreign or sibling Origin is refused before anything is read', async () => {
      const h = harness()
      const round = await h.approvedRound()
      for (const origin of [
        false,
        'null',
        '',
        'https://evil.example',
        'https://site.example',
        `${ORIGIN}.evil.net`
      ]) {
        const res = await h.redeem(round.nonce, round.clientSecret, { origin })
        assert.equal(res.status, 403, JSON.stringify(origin))
        assert.equal(res.headers.get('set-cookie'), null)
      }
      assert.equal(await h.poll(round.nonce), 'approved')
    })

    test('only JSON is read: a form or text body is refused and burns nothing', async () => {
      const h = harness()
      const round = await h.approvedRound()
      for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
        const res = await h.redeem(round.nonce, round.clientSecret, { headers: { 'content-type': type } })
        assert.equal(res.status, 415, type)
      }
      const broken = await h.redeem(round.nonce, round.clientSecret, { raw: '{not json' })
      assert.equal(broken.status, 400)
      const noSecret = await h.redeem(round.nonce, round.clientSecret, { raw: '{}' })
      assert.equal(noSecret.status, 400)
      const badNonce = await h.redeem('not-a-nonce', round.clientSecret)
      assert.equal(badNonce.status, 404)
      assert.equal(await h.poll(round.nonce), 'approved')
    })

    test('a stray session cookie in the app does not stand in the way of its own Origin check', async () => {
      const h = harness()
      const round = await h.approvedRound()
      const { cookie } = await h.signIn('previous@example.com')
      // A Chromium `net` request from the app's main process carries no same-origin Fetch Metadata.
      const res = await h.redeem(round.nonce, round.clientSecret, {
        headers: { cookie, 'sec-fetch-site': 'none' }
      })
      assert.equal(res.status, 204)
    })

    test('the door counts per client address and refuses past its cap', async () => {
      const h = harness()
      const ip = { 'cf-connecting-ip': '203.0.113.9' }
      for (let i = 0; i < DESKTOP_LINK_SESSION_LIMIT_PER_IP_PER_HOUR; i++) {
        assert.equal((await h.redeem('a'.repeat(64), 'b'.repeat(64), { headers: ip })).status, 404)
      }
      const over = await h.redeem('a'.repeat(64), 'b'.repeat(64), { headers: ip })
      assert.equal(over.status, 429)
      // Another address still has its own budget.
      const other = await h.redeem('a'.repeat(64), 'b'.repeat(64), {
        headers: { 'cf-connecting-ip': '203.0.113.10' }
      })
      assert.equal(other.status, 404)
    })

    test('a session minted here is written to the audit with source desktop_auth_link', async () => {
      const h = harness()
      const round = await h.approvedRound()
      assert.equal((await h.redeem(round.nonce, round.clientSecret)).status, 204)
      const entries = h.pool
        ? (await h.pool.query('select actor, action, site_key, detail from audit')).rows
        : h.store.audits
      assert.equal(entries.length, 1)
      assert.equal(entries[0].actor, 'owner@example.com')
      assert.equal(entries[0].action, 'session.start')
      assert.equal(entries[0].detail.source, 'desktop_auth_link')
      assert.equal(entries[0].detail.device, 'MacBook Pro')
      assert.ok(!JSON.stringify(entries).includes('tracy_sess'))
    })
  })
}

// ── Admission, re-checked at redeem like `/verify` checks it ───────────────────────────────────

test('with the beta gate on, an address the gate no longer admits gets no session', async () => {
  const store = memoryIdentityStore()
  let verdict = { status: 'allow', badge: 'JoomlArt member', plans: [], gate: true }
  const beta = { access: { enabled: true, decide: async () => verdict }, enqueue: async () => {} }
  const config = readConfig(ENV)
  const app = identityRoutes({ store, mail: { send: async () => {} }, config, beta })
  const lanes = laneRoutes({ pool: null, config, store, mail: null, seats: {}, otp: {} })
  const round = await (
    await lanes.fetch(
      new Request(`${ORIGIN}/auth/link/browser`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purpose: 'desktop' })
      })
    )
  ).json()
  await store.approveLink(await sha256Hex(round.nonce), 'owner@example.com')
  verdict = { status: 'waitlist', badge: 'fallback list', plans: [], gate: true }
  const res = await app.fetch(
    new Request(`${ORIGIN}/auth/link/${round.nonce}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ clientSecret: round.clientSecret })
    })
  )
  assert.equal(res.status, 403)
  assert.equal(res.headers.get('set-cookie'), null)
  assert.deepEqual(await res.json(), { code: 'SIGN_IN_REFUSED', reason: 'NOT_ADMITTED' })
})

// ── The match code itself ──────────────────────────────────────────────────────────────────────

test('the match code is eight unambiguous upper-case characters, stable for one nonce', () => {
  const nonce = 'c'.repeat(64)
  assert.match(matchCode(nonce), MATCH)
  assert.equal(matchCode(nonce), matchCode(nonce))
  assert.notEqual(matchCode('c'.repeat(64)), matchCode('d'.repeat(64)))
  // Pinned value: an app build that shows codes computed from an older server would stop matching
  // the page, so a change to the derivation must be a deliberate one that edits this line.
  assert.equal(matchCode('0'.repeat(64)), '384T-E2EW')
})
