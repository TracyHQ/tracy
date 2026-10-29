/**
 * Where a first sign-in came from (`lib/sign-in-source.js`): read from the link's `utm_*` on
 * `/login` (its own query, or inside `next`), carried through every door that finishes a sign-in,
 * and written on the admission and on the `account.first_sign_in` operation signal.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { loginPage } from '../src/identity/pages.js'
import { pgIdentityStore } from '../src/identity/store.js'
import { createOpsSignal, signalText } from '../src/lib/ops-signal.js'
import { LOGIN_VISITS_PER_IP_PER_HOUR } from '../src/lib/policy.js'
import {
  MEDIUMS,
  cleanSourceValue,
  requestSource,
  signInSource,
  sourceFromNext,
  sourceQuery,
  sourceText,
  visitReferrer,
  withSource
} from '../src/lib/sign-in-source.js'
import { workspaceRoutes } from '../src/workspace/route.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pgOnly = { skip: !process.env.TEST_DATABASE_URL }
const clock = Date.parse('2026-10-01T02:00:00Z')
const ORIGIN = 'http://tracy.test:8080'
const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  BETA_GATE: 'off',
  BETA_WAITLIST_URL: 'https://landing.test/early-access/',
  TRACY_ENVIRONMENT: 'dev'
}
const quiet = { warn() {}, log() {}, error() {} }
const member = { ok: true, user_id: 12, subscriptions: { 10: '2027-03-14' } }
const MEMBERS = {
  utm_source: 'joomlart',
  utm_medium: 'email',
  utm_campaign: 'tracy-beta-2026-10',
  utm_content: 'members-cta'
}
const MEMBERS_SOURCE = {
  source: 'joomlart',
  medium: 'email',
  campaign: 'tracy-beta-2026-10',
  content: 'members-cta'
}
const qs = (params) => new URLSearchParams(params).toString()

function harness(extra = {}, body = member) {
  const sent = []
  const config = readConfig({ ...env, ...extra })
  const app = buildApp({
    config,
    identity: pgIdentityStore(db.pool),
    host: { hostCall, hostJob },
    pool: db.pool,
    now: () => clock,
    signalNow: () => clock,
    mail: { send: async (letter) => sent.push(letter) },
    fetchImpl: async (input) => {
      if (new URL(input).hostname === 'oauth2.googleapis.com') {
        const claims = Buffer.from(
          JSON.stringify({ email: 'google@example.com', email_verified: true, sub: 'google-1' })
        ).toString('base64url')
        return Response.json({ id_token: `e30.${claims}.sig`, access_token: 'provider-secret' })
      }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'text/html' } })
    },
    log: quiet
  })
  const get = (path, headers = {}) => app.fetch(new Request(`${ORIGIN}${path}`, { headers }))
  const postJson = (path, data) =>
    app.fetch(
      new Request(`${ORIGIN}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      })
    )
  const postForm = (path, data) =>
    app.fetch(
      new Request(`${ORIGIN}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
        body: new URLSearchParams(data).toString()
      })
    )
  const lastCode = () => sent.at(-1).text.match(/\b\d{6}\b/)[0]
  return { app, sent, get, postJson, postForm, lastCode }
}

/** Every hidden `utm_*` field of the form with this id, as an object. */
function fieldsOf(html, formId) {
  const form = html.match(new RegExp(`<form[^>]*id="${formId}"[\\s\\S]*?</form>`))?.[0] ?? ''
  return Object.fromEntries(
    [...form.matchAll(/name="(utm_[a-z]+)" value="([^"]*)"/g)].map((m) => [m[1], m[2]])
  )
}
const firstSignIns = async () =>
  (await db.pool.query("select data from ops_signal where kind = 'account.first_sign_in' order by id")).rows
const admissionOf = async (email) =>
  (await db.pool.query('select beta_admission from account where email = $1', [email])).rows[0]
    ?.beta_admission

// ── the cleaning rule ────────────────────────────────────────────────────────────────────────

test('cleanSourceValue keeps a-z 0-9 - _ ., folds accents and case, cuts at 64, drops non-strings', () => {
  const cases = [
    ['joomlart', 'joomlart'],
    ['  JoomlArt  ', 'joomlart'],
    ['tracy-beta-2026-10', 'tracy-beta-2026-10'],
    ['a_b.c', 'a_b.c'],
    ['tiếng Việt đây', 'tiengvietday'],
    ['<script>alert(1)</script>', 'scriptalert1script'],
    ['line\nbreak\u0000', 'linebreak'],
    ['x'.repeat(64), 'x'.repeat(64)],
    ['y'.repeat(65), 'y'.repeat(64)],
    ['😀', null],
    ['', null],
    ['   ', null],
    [undefined, null],
    [42, null],
    [['email'], null],
    [{ toString: () => 'email' }, null]
  ]
  for (const [input, expected] of cases)
    assert.equal(cleanSourceValue(input), expected, JSON.stringify(input))
})

test('signInSource reads only the four utm keys, holds medium to the closed set, and is null when empty', () => {
  assert.deepEqual(signInSource(new URLSearchParams(MEMBERS)), MEMBERS_SOURCE)
  assert.deepEqual(signInSource(MEMBERS), MEMBERS_SOURCE)
  for (const medium of MEDIUMS) assert.equal(signInSource({ utm_medium: medium }).medium, medium)
  assert.deepEqual(signInSource({ utm_medium: 'newsletter' }), { medium: 'other' })
  // The template pages on joomlart.com: the "two ways" block and the quick-info row.
  assert.deepEqual(
    signInSource(
      new URLSearchParams(
        'provider=JoomlArt&open=ja-diner&utm_source=joomlart&utm_medium=product-page&utm_content=two-ways'
      )
    ),
    { source: 'joomlart', medium: 'product-page', content: 'two-ways' }
  )
  // The mediums tracy-marketing already tags links with: Reddit and X posts, YouTube, the blog, helpdesk replies.
  for (const [query, medium] of [
    ['utm_source=reddit&utm_medium=social', 'social'],
    ['utm_source=x&utm_medium=social', 'social'],
    ['utm_source=youtube&utm_medium=video', 'video'],
    ['utm_source=blog&utm_medium=owned', 'owned'],
    ['utm_source=joomlart&utm_medium=helpdesk', 'helpdesk']
  ])
    assert.equal(signInSource(new URLSearchParams(query)).medium, medium, query)
  assert.deepEqual(signInSource({ utm_medium: '<img>' }), { medium: 'other' })
  assert.deepEqual(signInSource({ utm_source: 'joomlart', utm_term: 'x', ref: 'y' }), { source: 'joomlart' })
  assert.equal(signInSource({ utm_source: ['a', 'b'] }), null)
  assert.equal(signInSource(new URLSearchParams('utm_source[]=joomlart')), null)
  assert.equal(signInSource({}), null)
  assert.equal(signInSource(null), null)
  assert.equal(signInSource('utm_source=joomlart'), null)
  const form = new FormData()
  form.set('utm_source', 'joomlart')
  form.set('utm_medium', new Blob(['email']))
  assert.deepEqual(signInSource(form), { source: 'joomlart' })
})

test('sourceFromNext reads a same-origin next only; the link’s own query wins over next', () => {
  assert.deepEqual(sourceFromNext(`/?${qs(MEMBERS)}`, ORIGIN), MEMBERS_SOURCE)
  assert.deepEqual(sourceFromNext(`${ORIGIN}/new/?inspiration=x&${qs(MEMBERS)}`, ORIGIN), MEMBERS_SOURCE)
  assert.equal(sourceFromNext(`https://evil.test/?${qs(MEMBERS)}`, ORIGIN), null)
  assert.equal(sourceFromNext(`//evil.test/?${qs(MEMBERS)}`, ORIGIN), null)
  assert.equal(sourceFromNext('/\\evil.test/?utm_source=x', ORIGIN), null)
  assert.equal(sourceFromNext('', ORIGIN), null)
  assert.equal(sourceFromNext(undefined, ORIGIN), null)
  assert.deepEqual(requestSource(new URLSearchParams('utm_medium=email'), `/?utm_medium=demo`, ORIGIN), {
    medium: 'email'
  })
  assert.deepEqual(requestSource(new URLSearchParams(), `/?utm_medium=demo`, ORIGIN), { medium: 'demo' })
})

test('withSource, sourceQuery and sourceText leave no trace when there is no source', () => {
  const admission = { status: 'allow', badge: 'gate off', plans: [] }
  assert.equal(withSource(admission, null), admission)
  assert.deepEqual(withSource(admission, { medium: 'blog' }), { ...admission, source: { medium: 'blog' } })
  assert.equal(sourceQuery(null), '')
  assert.equal(sourceQuery(MEMBERS_SOURCE), qs(MEMBERS))
  assert.equal(sourceText(MEMBERS_SOURCE), 'joomlart · email · tracy-beta-2026-10 · members-cta')
  assert.equal(sourceText({ medium: 'blog', content: 'launch-post-cta' }), 'blog · launch-post-cta')
  assert.equal(sourceText({ source: '<b>x</b>' }), 'bxb')
  assert.equal(sourceText(null), '')
  assert.equal(sourceText('email'), '')
})

// ── the message ─────────────────────────────────────────────────────────────────────────────

test('the new-user message names the source on one last line, only when there is one', () => {
  const base = { email: 'a@example.com', badge: 'gate off', plans: [], via: 'email code' }
  const withLine = signalText(
    { kind: 'account.first_sign_in', data: { ...base, source: MEMBERS_SOURCE } },
    'PROD'
  )
  assert.equal(withLine.split('\n').at(-1), 'Source: joomlart · email · tracy-beta-2026-10 · members-cta')
  const without = signalText({ kind: 'account.first_sign_in', data: base }, 'PROD')
  assert.doesNotMatch(without, /Source/)
  assert.equal(without.split('\n').at(-1), 'Via: email code')
  const hostile = signalText(
    { kind: 'account.first_sign_in', data: { ...base, source: { source: '<script>', medium: 'a\nb' } } },
    'PROD'
  )
  assert.doesNotMatch(hostile, /[<>]/)
  assert.equal(hostile.split('\n').length, without.split('\n').length + 1)
})

test('the daily message counts new users by medium in a fixed order, and older days read as before', () => {
  const data = {
    day: '2026-09-30',
    counts: { 'account.first_sign_in': 4 },
    badges: { 'gate off': 4 },
    active: 6,
    sources: { none: 1, email: 2, forum: 1 }
  }
  assert.match(
    signalText({ kind: 'ops.daily', data }, 'PROD'),
    /New users: 4 \(4 ⚪ gate off\) · by source: 2 email, 1 forum, 1 none · Active users: 6/
  )
  const { sources, ...older } = data
  void sources
  assert.match(
    signalText({ kind: 'ops.daily', data: older }, 'PROD'),
    /New users: 4 \(4 ⚪ gate off\) · Active users: 6/
  )
})

// ── the page ────────────────────────────────────────────────────────────────────────────────

test('the login page carries the source on the email, code, resend and provider forms, escaped', () => {
  const html = loginPage({
    origin: ORIGIN,
    next: '/',
    oauth: { google: {} },
    source: { ...MEMBERS_SOURCE, content: 'a"b<c' }
  })
  const expected = { ...MEMBERS, utm_content: 'abc' }
  assert.deepEqual(fieldsOf(html, 'email-form'), expected)
  assert.deepEqual(fieldsOf(html, 'code-form'), expected)
  assert.deepEqual(fieldsOf(html, 'resend-form'), expected)
  const provider = html.match(/<form method="get" action="\/signin\/google">[\s\S]*?<\/form>/)[0]
  assert.match(provider, /name="utm_medium" value="email"/)
  assert.match(
    html,
    /useDifferentAddress|<a href="\/login\?next=[^"]*&amp;utm_source=joomlart&amp;utm_medium=email/
  )
  assert.doesNotMatch(html, /a"b<c/)
  const plain = loginPage({ origin: ORIGIN, next: '/', oauth: { google: {} } })
  assert.doesNotMatch(plain, /name="utm_/)
  assert.match(plain, /sent\[input\.name\] = input\.value/)
})

// ── through the doors, on a real database ───────────────────────────────────────────────────

/** The root door alone, as `onboarding-scope.test.mjs` mounts it: no site, no guest landing. */
function rootDoor(guestSiteKey = null) {
  return workspaceRoutes({
    config: { sessionSecret: 's'.repeat(32), secure: false, defaultHost: 'local', guestSiteKey },
    sites: {
      hostOf: async (key) => (key === 'guest.localhost' ? 'local' : null),
      dshOf: () => ({ origin: 'http://127.0.0.1:1', seatSecret: 'k' }),
      labelOf: async (key) => key,
      siteScope: async () => 'guest'
    }
  })
}

test('a signed-out visit to /?utm_… goes to /login with only the cleaned utm on its query; the rest only inside next', async () => {
  const app = rootDoor()
  const location = (
    await app.fetch(new Request(`http://tracy.test/?${qs(MEMBERS)}&ref=x&next=//evil.test`))
  ).headers.get('location')
  // 06/10/2026 (Sarah): an address with more than utm keeps its destination, whole, in `next`,
  // which `/login` runs through `safePath`: `/?…&next=//evil.test` is a path on this origin.
  assert.equal(
    location,
    `/login?next=${encodeURIComponent(`/?${qs(MEMBERS)}&ref=x&next=//evil.test`)}&${qs(MEMBERS)}`
  )
  assert.equal(new URL(location, 'http://tracy.test').searchParams.get('next').startsWith('/?'), true)
  const dirty = (
    await app.fetch(new Request(`http://tracy.test/?utm_source=%3Cscript%3E&utm_medium=Newsletter`))
  ).headers.get('location')
  assert.equal(dirty, '/login?utm_source=script&utm_medium=other')
  assert.equal((await app.fetch(new Request('http://tracy.test/'))).headers.get('location'), '/login')
  assert.equal(
    (await app.fetch(new Request('http://tracy.test/?ref=x'))).headers.get('location'),
    '/login?next=%2F%3Fref%3Dx'
  )
  // A deployment with a guest landing sends a stranger there, as before.
  assert.equal(
    (await rootDoor('guest.localhost').fetch(new Request(`http://tracy.test/?${qs(MEMBERS)}`))).headers.get(
      'location'
    ),
    '/guest.localhost/'
  )
})

test('the mail link’s whole road: / → /login → the form carries the source', pgOnly, async () => {
  const h = harness()
  const location = (await rootDoor().fetch(new Request(`http://tracy.test/?${qs(MEMBERS)}`))).headers.get(
    'location'
  )
  const page = await (await h.get(location)).text()
  assert.deepEqual(fieldsOf(page, 'email-form'), MEMBERS)
})

test(
  'a guarded page’s next carries the source to the form (the /new door keeps its query)',
  pgOnly,
  async () => {
    const h = harness()
    const door = await rootDoor().fetch(
      new Request(`http://tracy.test/new/?inspiration=ja-vega&platform=joomla&${qs(MEMBERS)}`)
    )
    const location = door.headers.get('location')
    assert.match(location, /^\/login\?next=/)
    const page = await (await h.get(location)).text()
    assert.deepEqual(fieldsOf(page, 'email-form'), MEMBERS)
  }
)

test('own query beats next; a next to another origin gives nothing', pgOnly, async () => {
  const h = harness()
  const own = await (
    await h.get(`/login?utm_medium=blog&next=${encodeURIComponent('/?utm_medium=demo')}`)
  ).text()
  assert.deepEqual(fieldsOf(own, 'email-form'), { utm_medium: 'blog' })
  const foreign = await (
    await h.get(`/login?next=${encodeURIComponent(`https://evil.test/?${qs(MEMBERS)}`)}`)
  ).text()
  assert.deepEqual(fieldsOf(foreign, 'email-form'), {})
})

test('form path, gate off: the source reaches the account, the signal and the message', pgOnly, async () => {
  const h = harness()
  const page = await (await h.get(`/login?${qs(MEMBERS)}`)).text()
  const asked = await h.postForm('/login', {
    email: 'Person@Example.com',
    next: '/',
    ...fieldsOf(page, 'email-form')
  })
  assert.equal(asked.status, 200)
  const codeStep = await asked.text()
  assert.deepEqual(fieldsOf(codeStep, 'resend-form'), MEMBERS)
  const verified = await h.postForm('/verify', { email: 'person@example.com', code: h.lastCode(), next: '/' })
  assert.equal(verified.status, 303)
  const [event] = await firstSignIns()
  assert.deepEqual(event.data.source, MEMBERS_SOURCE)
  assert.equal(event.data.badge, 'gate off')
  assert.deepEqual((await admissionOf('person@example.com')).source, MEMBERS_SOURCE)
  assert.match(
    signalText({ kind: 'account.first_sign_in', data: event.data }, 'DEV'),
    /\nSource: joomlart · email · tracy-beta-2026-10 · members-cta$/
  )
})

test('script path (JSON), gate off: the body’s utm fields are read and cleaned', pgOnly, async () => {
  const h = harness()
  assert.equal(
    (
      await h.postJson('/login', {
        email: 'person@example.com',
        utm_source: 'JoomlArt',
        utm_medium: 'Blog',
        utm_content: 'x'.repeat(200)
      })
    ).status,
    200
  )
  assert.equal((await h.postJson('/verify', { email: 'person@example.com', code: h.lastCode() })).status, 200)
  const [event] = await firstSignIns()
  assert.deepEqual(event.data.source, { source: 'joomlart', medium: 'blog', content: 'x'.repeat(64) })
})

test('no utm anywhere: no source key, no Source line, nothing else changes', pgOnly, async () => {
  const h = harness()
  await h.postJson('/login', { email: 'person@example.com' })
  await h.postJson('/verify', { email: 'person@example.com', code: h.lastCode() })
  const [event] = await firstSignIns()
  assert.equal('source' in event.data, false)
  assert.equal('source' in (await admissionOf('person@example.com')), false)
  assert.doesNotMatch(signalText({ kind: 'account.first_sign_in', data: event.data }, 'DEV'), /Source/)
  const row = (await db.pool.query('select count(*)::int as n from otp_code')).rows[0].n
  assert.equal(row, 0)
})

test('a tampered form post is cleaned at the door, not trusted as drawn', pgOnly, async () => {
  const h = harness()
  await h.postForm('/login', {
    email: 'person@example.com',
    next: '/',
    utm_source: '<img src=x onerror=alert(1)>',
    utm_medium: '<b>email</b>',
    utm_campaign: "'; drop table account; --"
  })
  await h.postForm('/verify', { email: 'person@example.com', code: h.lastCode(), next: '/' })
  const [event] = await firstSignIns()
  assert.deepEqual(event.data.source, {
    source: 'imgsrcxonerroralert1',
    medium: 'other',
    campaign: 'droptableaccount--'
  })
  assert.equal((await db.pool.query('select count(*)::int as n from account')).rows[0].n, 1)
})

test('a page drawn again keeps its source: a bad address, and a wrong code', pgOnly, async () => {
  const h = harness()
  const bad = await h.postForm('/login', { email: 'not-an-address', next: '/', ...MEMBERS })
  assert.equal(bad.status, 400)
  assert.deepEqual(fieldsOf(await bad.text(), 'email-form'), MEMBERS)
  await h.postForm('/login', { email: 'person@example.com', next: '/', ...MEMBERS })
  const wrong = await h.postForm('/verify', {
    email: 'person@example.com',
    code: '000000',
    next: '/',
    ...MEMBERS
  })
  assert.equal(wrong.status, 401)
  assert.deepEqual(fieldsOf(await wrong.text(), 'resend-form'), MEMBERS)
})

test('a second sign-in with another utm changes nothing about the first', pgOnly, async () => {
  const h = harness()
  await h.postJson('/login', { email: 'person@example.com', ...MEMBERS })
  await h.postJson('/verify', { email: 'person@example.com', code: h.lastCode() })
  await h.postJson('/login', { email: 'person@example.com', utm_medium: 'demo' })
  await h.postJson('/verify', { email: 'person@example.com', code: h.lastCode() })
  const events = await firstSignIns()
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].data.source, MEMBERS_SOURCE)
  assert.deepEqual((await admissionOf('person@example.com')).source, MEMBERS_SOURCE)
})

test(
  'legacy gate on: public sign-in preserves the marketing source without a queued membership check',
  pgOnly,
  async () => {
    const h = harness({ BETA_GATE: 'on', AMEMBER_API_KEY: 'dedicated-test-key' })
    await h.postJson('/login', { email: 'person@example.com', ...MEMBERS })
    assert.equal((await db.pool.query('select source from beta_login_job')).rowCount, 0)
    await h.app.betaLogin.drain()
    assert.equal(
      (await h.postJson('/verify', { email: 'person@example.com', code: h.lastCode() })).status,
      200
    )
    const [event] = await firstSignIns()
    // Sign-in is public; the member is labelled for /ops and the source survives the relabel.
    assert.equal(event.data.badge, 'JoomlArt member')
    assert.deepEqual(event.data.source, MEMBERS_SOURCE)
    await h.app.betaLogin.stop()
  }
)

test(
  'a code keeps its marketing source when legacy BETA_GATE changes between request and verification',
  pgOnly,
  async () => {
    const off = harness()
    await off.postJson('/login', { email: 'person@example.com', ...MEMBERS })
    const code = off.lastCode()
    const on = harness({ BETA_GATE: 'on', AMEMBER_API_KEY: 'dedicated-test-key' })
    assert.equal((await on.postJson('/verify', { email: 'person@example.com', code })).status, 200)
    const [event] = await firstSignIns()
    // Sign-in is public; the member is labelled for /ops and the source survives the relabel.
    assert.equal(event.data.badge, 'JoomlArt member')
    assert.deepEqual(event.data.source, MEMBERS_SOURCE)
    await on.app.betaLogin.stop()
  }
)

test('Google: the source rides the state row to the callback', pgOnly, async () => {
  const h = harness({ GOOGLE_OAUTH_CLIENT_ID: 'test-id', GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret' })
  const page = await (await h.get(`/login?${qs(MEMBERS)}`)).text()
  const button = page.match(/<form method="get" action="\/signin\/google">[\s\S]*?<\/form>/)[0]
  const query = qs(
    Object.fromEntries([...button.matchAll(/name="([a-z_]+)" value="([^"]*)"/g)].map((m) => [m[1], m[2]]))
  )
  const started = await h.get(`/signin/google?${query}`)
  assert.equal(started.status, 302)
  assert.deepEqual((await db.pool.query('select source from oauth_state')).rows[0].source, MEMBERS_SOURCE)
  const state = new URL(started.headers.get('location')).searchParams.get('state')
  const callback = await h.get(`/signin/google/callback?state=${state}&code=mock`, {
    cookie: started.headers.get('set-cookie').split(';')[0]
  })
  assert.equal(callback.status, 302)
  const [event] = await firstSignIns()
  assert.equal(event.data.via, 'Google')
  assert.deepEqual(event.data.source, MEMBERS_SOURCE)
})

test('Google with no utm: the state row has no source and the signal has none', pgOnly, async () => {
  const h = harness({ GOOGLE_OAUTH_CLIENT_ID: 'test-id', GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret' })
  const started = await h.get('/signin/google')
  assert.equal((await db.pool.query('select source from oauth_state')).rows[0].source, null)
  const state = new URL(started.headers.get('location')).searchParams.get('state')
  await h.get(`/signin/google/callback?state=${state}&code=mock`, {
    cookie: started.headers.get('set-cookie').split(';')[0]
  })
  const [event] = await firstSignIns()
  assert.equal('source' in event.data, false)
})

test(
  'the daily summary counts yesterday’s new users by medium, none and other included',
  pgOnly,
  async () => {
    const signal = createOpsSignal({ pool: db.pool, config: readConfig(env), now: () => clock, log: quiet })
    await db.pool.query(
      `insert into ops_signal(kind,data,occurred_at) values
       ('account.first_sign_in','{"badge":"gate off","source":{"medium":"email"}}','2026-09-30T03:00:00Z'),
       ('account.first_sign_in','{"badge":"gate off","source":{"medium":"email"}}','2026-09-30T04:00:00Z'),
       ('account.first_sign_in','{"badge":"gate off"}','2026-09-30T05:00:00Z'),
       ('account.first_sign_in','{"badge":"gate off","source":{"medium":"<made-up>"}}','2026-09-30T06:00:00Z')`
    )
    await signal.daily()
    const [row] = (await db.pool.query("select data from ops_signal where kind = 'ops.daily'")).rows
    assert.deepEqual(row.data.sources, { email: 2, none: 1, other: 1 })
    assert.match(
      signalText({ kind: 'ops.daily', data: row.data }, 'PROD'),
      /by source: 2 email, 1 other, 1 none/
    )
  }
)

// ── visits to /login from a link with a source (`POST /login/visit`) ──────────────────────────

test('the login page tells /login/visit once per tab, with its source and the linking host when there are any', () => {
  const html = loginPage({ origin: ORIGIN, next: '/', source: MEMBERS_SOURCE })
  assert.match(html, /fetch\('\/login\/visit'/)
  assert.match(html, /sessionStorage\.getItem\('tracy-login-visit'\)/)
  assert.ok(html.includes(JSON.stringify(MEMBERS)), 'the cleaned utm fields, as the door reads them')
  // Another site's host only, never its path, and never this page's own host.
  assert.match(html, /new URL\(document\.referrer\)\.hostname/)
  assert.match(html, /from !== location\.hostname\) body\.referrer = from/)
  // A page opened with no source still counts as a visit: the direct one.
  const direct = loginPage({ origin: ORIGIN, next: '/' })
  assert.match(direct, /fetch\('\/login\/visit'/)
  assert.match(direct, /var body = \{\};/)
})

test('visitReferrer keeps a cleaned host and refuses anything past one', () => {
  assert.equal(visitReferrer({ referrer: 'www.Google.com' }), 'www.google.com')
  assert.equal(visitReferrer({ referrer: 'tracy.ai' }), 'tracy.ai')
  for (const referrer of ['www.google.com/search?q=x', 'localhost:8080', 'a@b.com', 'x.com#y', ''])
    assert.equal(visitReferrer({ referrer }), null, referrer)
  assert.equal(visitReferrer({ referrer: ['x.com'] }), null)
  assert.equal(visitReferrer({}), null)
  assert.equal(visitReferrer(null), null)
})

const visits = async () =>
  (await db.pool.query("select account_id, data from ops_signal where kind = 'login.visited' order by id"))
    .rows

test(
  'POST /login/visit keeps one cleaned source per visit from the page’s own origin, and nothing else',
  pgOnly,
  async () => {
    const h = harness()
    const visit = (data, headers = { origin: ORIGIN }) =>
      h.app.fetch(
        new Request(`${ORIGIN}/login/visit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify(data)
        })
      )
    assert.equal(
      (await visit({ utm_source: 'JoomlArt', utm_medium: 'Forum', utm_content: 'forum-123' })).status,
      204
    )
    assert.deepEqual(await visits(), [
      { account_id: null, data: { source: 'joomlart', medium: 'forum', content: 'forum-123' } }
    ])
    // Another origin, by either header, is refused; a body that is not an object is kept nowhere.
    assert.equal((await visit(MEMBERS, { origin: 'https://evil.example' })).status, 403)
    assert.equal((await visit(MEMBERS, { 'sec-fetch-site': 'cross-site', origin: ORIGIN })).status, 403)
    assert.equal((await visit(['x'])).status, 204)
    assert.equal((await visit('x')).status, 204)
    assert.equal((await visits()).length, 1)
    // A same-origin fetch from an alias host is still the page's own.
    assert.equal((await visit(MEMBERS, { 'sec-fetch-site': 'same-origin' })).status, 204)
    assert.equal((await visits()).length, 2)
    // No source is the direct visit, kept empty; a linking host is kept as a host, with or without a source.
    assert.equal((await visit({ ref: 'x' })).status, 204)
    assert.equal((await visit({ referrer: 'www.google.com' })).status, 204)
    assert.equal((await visit({ utm_source: 'joomlart', referrer: 'www.joomlart.com' })).status, 204)
    assert.equal((await visit({ referrer: 'www.google.com/search?q=secret' })).status, 204)
    assert.deepEqual(
      (await visits()).slice(2).map((row) => row.data),
      [{}, { referrer: 'www.google.com' }, { source: 'joomlart', referrer: 'www.joomlart.com' }, {}]
    )
  }
)

test('POST /login/visit stops at the hourly cap of one client address', pgOnly, async () => {
  const h = harness()
  const visit = () =>
    h.app.fetch(
      new Request(`${ORIGIN}/login/visit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify(MEMBERS)
      })
    )
  for (let i = 0; i < LOGIN_VISITS_PER_IP_PER_HOUR; i++) assert.equal((await visit()).status, 204)
  assert.equal((await visit()).status, 429)
  assert.equal((await visits()).length, LOGIN_VISITS_PER_IP_PER_HOUR)
})

// ── starting to sign in (`login.code_requested`, `login.oauth_started`) ────────────────────────

const starts = async (kind) =>
  (await db.pool.query('select account_id, data from ops_signal where kind = $1 order by id', [kind])).rows

test(
  'POST /login records one login.code_requested per accepted request, with the source and never the address',
  pgOnly,
  async () => {
    const h = harness()
    assert.equal((await h.postJson('/login', { email: 'person@example.com', ...MEMBERS })).status, 200)
    assert.equal((await h.postJson('/login', { email: 'other@example.com' })).status, 200)
    // A refused address is not a start.
    assert.equal((await h.postJson('/login', { email: 'not-an-address' })).status, 400)
    const rows = await starts('login.code_requested')
    assert.deepEqual(rows, [
      { account_id: null, data: MEMBERS_SOURCE },
      { account_id: null, data: {} }
    ])
    assert.doesNotMatch(JSON.stringify(rows), /example\.com/)
  }
)

test(
  'GET /signin/google records one login.oauth_started with the provider and the source',
  pgOnly,
  async () => {
    const h = harness({ GOOGLE_OAUTH_CLIENT_ID: 'test-id', GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret' })
    assert.equal((await h.get(`/signin/google?${qs(MEMBERS)}`)).status, 302)
    assert.equal((await h.get('/signin/google')).status, 302)
    // A provider this deployment did not light up starts nothing.
    assert.equal((await h.get('/signin/github')).status, 404)
    assert.deepEqual(await starts('login.oauth_started'), [
      { account_id: null, data: { provider: 'google', ...MEMBERS_SOURCE } },
      { account_id: null, data: { provider: 'google' } }
    ])
  }
)

test(
  'sign-in starts stop being recorded at the hourly cap of one client address, and sign-in goes on',
  pgOnly,
  async () => {
    const h = harness({ GOOGLE_OAUTH_CLIENT_ID: 'test-id', GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret' })
    for (let i = 0; i <= LOGIN_VISITS_PER_IP_PER_HOUR; i++)
      assert.equal((await h.get('/signin/google')).status, 302)
    assert.equal((await starts('login.oauth_started')).length, LOGIN_VISITS_PER_IP_PER_HOUR)
  }
)
