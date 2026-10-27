/**
 * A refusal a person can read, with a next step (#796).
 *
 * Every case here is a failure that used to reach a browser as raw JSON, a bare `text/plain` 404, an
 * unstyled English page or a sentence carrying an internal word. Each one drives the real route (or
 * the real page function) and reads the answer the way a browser would: `Accept: text/html` for a
 * navigation, none for a `fetch`. The machine answers (`{code}` for a fetch) are pinned beside the
 * pages, because the dsh client and the lane gateway still read them.
 *
 * What these tests cannot show: a real provider, a real host outage, PostgreSQL (the memory store
 * stands in), a real browser's rendering, and anything an edge in front of the app adds.
 *
 *   node --test apps/tracy-web/test/error-next-step.test.mjs
 *
 * `TRACY_TEST_DEPS_ROOT`: where jsdom is resolved from when this file runs from a copy of the tree
 * that has no install of its own (the red-before-fix run against the base sources).
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'

import { barRoutes } from '../src/bar/route.js'
import { refusedHostPage, unknownSitePage, workspaceUnavailablePage } from '../src/bar/pages.js'
import { hashCode } from '../src/identity/otp.js'
import { loginPage } from '../src/identity/pages.js'
import { identityRoutes } from '../src/identity/route.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { createBetaAccess } from '../src/lib/beta-access.js'
import { translate, WEB_LANGUAGES } from '../src/lib/i18n/index.js'
import { mintSession } from '../src/lib/session.js'
import { opsRoutes } from '../src/ops/route.js'
import { workspaceRoutes } from '../src/workspace/route.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..')
const depsRoot = process.env.TRACY_TEST_DEPS_ROOT || repo

/** jsdom, from a workspace member that declares it. */
function loadJsdom() {
  const homes = ['vendor/tracy/dsh-better-sidebar', 'vendor/tracy/deepseek-harness']
  for (const home of homes) {
    try {
      return createRequire(path.join(depsRoot, home, 'package.json'))('jsdom')
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error
    }
  }
  throw new Error(`jsdom is not installed under ${homes.join(' or ')}; run pnpm install`)
}

const ORIGIN = 'http://tracy.test'
const SECRET = 's'.repeat(32)
const NOW = 1_700_000_000_000
const HTML = { accept: 'text/html,application/xhtml+xml' }
const WAITLIST = 'https://tracy.example/whitelist/'

const config = {
  origin: ORIGIN,
  sessionSecret: SECRET,
  sessionDomain: 'tracy.test',
  siteDomain: 'tracy.test',
  secure: false,
  defaultHost: 'local',
  oauth: { google: { id: 'fixture-id', secret: 'fixture-secret' } },
  beta: { enabled: false, waitlistUrl: WAITLIST, waitlistMode: 'wordpress' }
}

const isHtml = (response) => (response.headers.get('content-type') ?? '').includes('text/html')
const sessionCookies = (response) =>
  response.headers.getSetCookie().filter((v) => v.startsWith('tracy_sess=v1.'))

/** Internal words and machine codes no customer page may carry. */
const INTERNAL =
  /OAUTH_STATE_INVALID|EXCHANGE_FAILED|EMAIL_NOT_VERIFIED|HOST_NOT_CONFIGURED|SEAT_DOOR_REFUSED|private-host|no host is configured|the workspace door|seat book/

/** Every `href` of an `<a>` in a page. */
const links = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1])

async function assertRecoveryPage(response, { status, hrefs }) {
  assert.equal(response.status, status)
  assert.ok(isHtml(response), `expected text/html, got ${response.headers.get('content-type')}`)
  const html = await response.text()
  assert.match(html, /<!doctype html>/i)
  // The shared shell: its token block is what makes a page "styled" (`lib/page-shell.js`).
  assert.match(html, /--primary:/)
  assert.doesNotMatch(html, INTERNAL)
  for (const href of hrefs) assert.ok(links(html).includes(href), `no link to ${href} in ${links(html)}`)
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/)
  return html
}

// ── F-S1-002: the OAuth callback ────────────────────────────────────────────────────────────────

/** A Google token answer whose id_token carries `claims`. */
function googleAnswer(claims, ok = true) {
  const segment = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const id_token = `${segment({ alg: 'none' })}.${segment(claims)}.sig`
  return new Response(JSON.stringify({ id_token }), { status: ok ? 200 : 400 })
}

function identity({ fetchImpl, now = () => NOW, beta = null, extraConfig = {} } = {}) {
  const store = memoryIdentityStore()
  const app = identityRoutes({
    config: { ...config, ...extraConfig },
    store,
    mail: { send: async () => {}, signInCodeMail: () => ({ subject: '', text: '' }) },
    now,
    beta,
    fetchImpl
  })
  return { app, store }
}

/** Start a Google round and hand back what the provider would send the browser back with. */
async function startRound(app, next = '/acme/') {
  const started = await app.request(`${ORIGIN}/signin/google?next=${encodeURIComponent(next)}`)
  assert.equal(started.status, 302)
  const state = new URL(started.headers.get('location')).searchParams.get('state')
  const cookie = started.headers.getSetCookie()[0].split(';')[0]
  return { state, cookie }
}

const callback = (app, { state, cookie, code = 'code-1', headers = HTML }) =>
  app.request(
    `${ORIGIN}/signin/google/callback?state=${encodeURIComponent(state ?? '')}${code ? `&code=${code}` : ''}`,
    { headers: { ...headers, ...(cookie ? { cookie } : {}) } }
  )

test('F-S1-002: a callback with no state, a mismatched cookie or no code is a page with a way back, and signs nobody in', async () => {
  const { app } = identity({ fetchImpl: async () => googleAnswer({}) })
  const bare = await app.request(`${ORIGIN}/signin/google/callback`, { headers: HTML })
  await assertRecoveryPage(bare, { status: 400, hrefs: ['/login'] })
  assert.deepEqual(sessionCookies(bare), [])

  const round = await startRound(app)
  const mismatched = await callback(app, { state: round.state, cookie: 'tracy_oauth_state=other' })
  await assertRecoveryPage(mismatched, { status: 400, hrefs: ['/login'] })
  assert.deepEqual(sessionCookies(mismatched), [])

  // The state was not consumed by the mismatch; a callback with no code consumes it and refuses.
  const noCode = await callback(app, { ...round, code: '' })
  await assertRecoveryPage(noCode, {
    status: 400,
    hrefs: [`/login?next=${encodeURIComponent(`${ORIGIN}/acme/`)}`]
  })
  assert.deepEqual(sessionCookies(noCode), [])
})

test('F-S1-002: an expired or replayed state is refused with the same page; the state stays single-use', async () => {
  let t = NOW
  const calls = []
  const { app } = identity({
    now: () => t,
    fetchImpl: async (url) => {
      calls.push(String(url))
      return googleAnswer({ email: 'a@b.c', email_verified: true, sub: 'g-1' })
    }
  })
  const expired = await startRound(app)
  t += 11 * 60 * 1000
  const late = await callback(app, expired)
  await assertRecoveryPage(late, { status: 400, hrefs: ['/login'] })
  assert.deepEqual(sessionCookies(late), [])
  assert.equal(calls.length, 0, 'an expired state never reaches the provider')

  const round = await startRound(app)
  const first = await callback(app, round)
  assert.equal(first.status, 302)
  assert.equal(sessionCookies(first).length, 1)
  const replay = await callback(app, round)
  await assertRecoveryPage(replay, { status: 400, hrefs: ['/login'] })
  assert.deepEqual(sessionCookies(replay), [])
  assert.equal(calls.length, 1, 'a replayed state never reaches the provider')
})

for (const [name, fetchImpl, status] of [
  ['the provider refuses the code', async () => googleAnswer({}, false), 400],
  ['the provider answers with no body', async () => new Response('', { status: 200 }), 400],
  ['the provider answers malformed JSON', async () => new Response('{"id_token":', { status: 200 }), 400],
  [
    'the provider answers a token that is not a token',
    async () => new Response(JSON.stringify({ id_token: 'not-a-jwt' }), { status: 200 }),
    400
  ],
  ['the provider leaves the email unverified', async () => googleAnswer({ email: 'a@b.c', sub: 'g-1' }), 400],
  [
    'the request to the provider is rejected',
    async () => {
      throw new Error('getaddrinfo ENOTFOUND oauth2.googleapis.com secret-upstream-detail')
    },
    502
  ]
]) {
  test(`F-S1-002: ${name} → a translated page with a way back, no session, no upstream detail`, async () => {
    const { app } = identity({ fetchImpl })
    const round = await startRound(app, '/acme/?tab=1')
    const response = await callback(app, {
      ...round,
      headers: { ...HTML, 'accept-language': 'vi' }
    })
    const html = await assertRecoveryPage(response, {
      status,
      hrefs: [`/login?next=${encodeURIComponent(`${ORIGIN}/acme/?tab=1`)}`]
    })
    assert.deepEqual(sessionCookies(response), [])
    assert.match(html, /<html lang="vi"/)
    assert.ok(html.includes(translate('vi', 'signin.failedHeading')))
    assert.doesNotMatch(html, /secret-upstream-detail|ENOTFOUND|oauth2\.googleapis/)
  })
}

test('F-S1-002: a fetch caller keeps the machine answer, and a rejected provider request is a code, not a crash', async () => {
  const { app } = identity({
    fetchImpl: async () => {
      throw new Error('socket hang up')
    }
  })
  const bare = await app.request(`${ORIGIN}/signin/google/callback`)
  assert.equal(bare.status, 400)
  assert.deepEqual(await bare.json(), { code: 'OAUTH_STATE_INVALID' })
  const round = await startRound(app)
  const rejected = await callback(app, { ...round, headers: {} })
  assert.equal(rejected.status, 502)
  assert.deepEqual(await rejected.json(), { code: 'EXCHANGE_FAILED' })
  assert.deepEqual(sessionCookies(rejected), [])
})

test('F-S1-002: a hostile `next` never becomes the way back', async () => {
  const { app } = identity({ fetchImpl: async () => googleAnswer({}, false) })
  for (const next of [
    '//evil.example/x',
    'https://evil.example/',
    '/\\evil.example',
    'javascript:alert(1)'
  ]) {
    const round = await startRound(app, next)
    const response = await callback(app, round)
    const html = await response.text()
    assert.equal(response.status, 400)
    for (const href of links(html)) {
      assert.ok(href.startsWith('/login'), `link leaves Tracy: ${href}`)
      const back = new URL(href, ORIGIN).searchParams.get('next') ?? '/'
      assert.equal(new URL(back, ORIGIN).origin, ORIGIN, `way back leaves Tracy: ${back}`)
    }
    assert.doesNotMatch(html, /evil\.example|javascript:/)
  }
})

// ── F-S1-002: a sign-in the person cancelled at the provider ────────────────────────────────────
//
// Reported 06/10/2026: choosing an account at Google and then refusing landed on "The sign-in took
// too long, or it was started in another browser", which is false for that person. Google and
// GitHub both send the browser back with `error=access_denied` and no `code`.

const BOTH_PROVIDERS = {
  oauth: {
    google: { id: 'fixture-id', secret: 'fixture-secret' },
    github: { id: 'fixture-id', secret: 'fixture-secret' }
  }
}
const PROVIDER_LABEL = { google: 'Google', github: 'GitHub' }
/** What a provider adds to a refusal; none of it may reach the page. */
const PROVIDER_DETAIL =
  'error_description=secret-provider-text%3Cscript%3E&error_uri=https%3A%2F%2Fevil.example%2Fwhy'
const NEVER_SHOWN = /secret-provider-text|evil\.example|access_denied|error_description|error_uri|<script>/

/** An identity app with both providers lit, counting every exchange and every identity write. */
function watchedIdentity({ now = () => NOW } = {}) {
  const exchanges = []
  const writes = []
  const { app, store } = identity({
    now,
    extraConfig: BOTH_PROVIDERS,
    fetchImpl: async (url) => {
      exchanges.push(String(url))
      return googleAnswer({ email: 'a@b.c', email_verified: true, sub: 'g-1' })
    }
  })
  const upsert = store.upsertOAuthIdentity
  store.upsertOAuthIdentity = async (...args) => {
    writes.push(args[0])
    return upsert.call(store, ...args)
  }
  return { app, store, exchanges, writes }
}

/** Start a round with `provider`: the state and the cookie its browser holds. */
async function startRoundWith(app, provider, next = '/acme/') {
  const started = await app.request(`${ORIGIN}/signin/${provider}?next=${encodeURIComponent(next)}`)
  assert.equal(started.status, 302)
  const state = new URL(started.headers.get('location')).searchParams.get('state')
  const cookie = started.headers.getSetCookie()[0].split(';')[0]
  return { state, cookie }
}

/** The provider sends the browser back with `query` after `state`. */
const providerReturn = (app, provider, { state, cookie, query = 'error=access_denied', headers = HTML }) =>
  app.request(
    `${ORIGIN}/signin/${provider}/callback?${state === undefined ? '' : `state=${encodeURIComponent(state)}&`}${query}`,
    { headers: { ...headers, ...(cookie ? { cookie } : {}) } }
  )

const clearsStateCookie = (response) =>
  response.headers.getSetCookie().some((v) => v.startsWith('tracy_oauth_state=;') && v.includes('Max-Age=0'))

for (const provider of ['google', 'github']) {
  const label = PROVIDER_LABEL[provider]
  test(`F-S1-002: a sign-in cancelled at ${label} says so, with a way back, and never the "took too long" sentence`, async () => {
    for (const lang of WEB_LANGUAGES) {
      const { app, exchanges, writes } = watchedIdentity()
      const round = await startRoundWith(app, provider, '/acme/?tab=1')
      const response = await providerReturn(app, provider, {
        ...round,
        query: `error=access_denied&${PROVIDER_DETAIL}`,
        headers: { ...HTML, 'accept-language': lang }
      })
      const html = await assertRecoveryPage(response, {
        status: 400,
        hrefs: [`/login?next=${encodeURIComponent(`${ORIGIN}/acme/?tab=1`)}`]
      })
      const cancelled = translate(lang, 'signin.cancelledBody', { provider: label })
      assert.ok(cancelled.includes(label), `${lang}: the sentence names ${label}`)
      assert.ok(html.includes(cancelled), `${lang}: the cancelled sentence is shown`)
      assert.ok(!html.includes(translate(lang, 'signin.stateBody')), `${lang}: the state sentence is not`)
      assert.ok(html.includes(translate(lang, 'signin.backToSignIn')), `${lang}: the way back is named`)
      assert.doesNotMatch(html, NEVER_SHOWN)
      assert.deepEqual(sessionCookies(response), [])
      assert.ok(clearsStateCookie(response), 'the state cookie is cleared')
      assert.equal(exchanges.length, 0, 'a cancelled sign-in never reaches the provider')
      assert.equal(writes.length, 0, 'a cancelled sign-in writes no identity')
    }
  })
}

test('F-S1-002: a cancelled sign-in keeps 400 and OAUTH_STATE_INVALID for a fetch caller', async () => {
  for (const provider of ['google', 'github']) {
    const { app, exchanges } = watchedIdentity()
    const round = await startRoundWith(app, provider)
    const machine = await providerReturn(app, provider, { ...round, headers: {} })
    assert.equal(machine.status, 400)
    assert.ok(!isHtml(machine))
    assert.deepEqual(await machine.json(), { code: 'OAUTH_STATE_INVALID' })
    assert.deepEqual(sessionCookies(machine), [])
    assert.ok(clearsStateCookie(machine))
    assert.equal(exchanges.length, 0)
  }
})

test('F-S1-002: a cancellation consumes the state: a replay, a late code and a second tab get the state sentence', async () => {
  const stateSentence = translate('en', 'signin.stateBody')
  for (const provider of ['google', 'github']) {
    const cancelledSentence = translate('en', 'signin.cancelledBody', { provider: PROVIDER_LABEL[provider] })
    const { app, exchanges, writes } = watchedIdentity()
    const round = await startRoundWith(app, provider)
    const first = await (await providerReturn(app, provider, round)).text()
    assert.ok(first.includes(cancelledSentence))

    const replay = await providerReturn(app, provider, round)
    const replayed = await assertRecoveryPage(replay, { status: 400, hrefs: ['/login'] })
    assert.ok(replayed.includes(stateSentence) && !replayed.includes(cancelledSentence))

    // The same state arriving later with a code: nothing left to redeem.
    const late = await providerReturn(app, provider, { ...round, query: 'code=code-1' })
    const lateHtml = await assertRecoveryPage(late, { status: 400, hrefs: ['/login'] })
    assert.ok(lateHtml.includes(stateSentence))
    assert.deepEqual(sessionCookies(late), [])

    // Two returns racing for one state: one is the cancellation, the other is refused.
    const raced = await startRoundWith(app, provider)
    const pages = await Promise.all(
      [1, 2].map(async () => (await providerReturn(app, provider, raced)).text())
    )
    assert.equal(pages.filter((html) => html.includes(cancelledSentence)).length, 1)
    assert.equal(pages.filter((html) => html.includes(stateSentence)).length, 1)
    assert.equal(exchanges.length, 0)
    assert.equal(writes.length, 0)
  }
})

test('F-S1-002: only `error=access_denied`, once and exactly, with no code is a cancellation', async () => {
  const stateSentence = translate('en', 'signin.stateBody')
  const { app, exchanges } = watchedIdentity()
  for (const provider of ['google', 'github']) {
    const cancelledSentence = translate('en', 'signin.cancelledBody', { provider: PROVIDER_LABEL[provider] })
    for (const query of ['error=access_denied', 'code=&error=access_denied', 'error=access_denied&code=']) {
      const round = await startRoundWith(app, provider)
      const html = await (await providerReturn(app, provider, { ...round, query })).text()
      assert.ok(html.includes(cancelledSentence), `${provider} ${query}`)
    }
    // A missing code with no such error keeps the answer it always had.
    for (const query of [
      '',
      'code=',
      'error=',
      'error',
      'error=Access_Denied',
      'error=ACCESS_DENIED',
      'error=access_denied%20',
      'error=%20access_denied',
      'error=access-denied',
      'error=access_denied_by_policy',
      'error=access',
      'error=server_error',
      'error=temporarily_unavailable',
      'error=interaction_required',
      'error=redirect_uri_mismatch',
      'error=access_denied&error=server_error',
      'error=server_error&error=access_denied',
      'error=access_denied&error=access_denied',
      'error%5B%5D=access_denied',
      'error_description=access_denied',
      'error_reason=access_denied',
      'Error=access_denied',
      `${PROVIDER_DETAIL}`
    ]) {
      const round = await startRoundWith(app, provider, '/acme/')
      const response = await providerReturn(app, provider, { ...round, query })
      const html = await assertRecoveryPage(response, {
        status: 400,
        hrefs: [`/login?next=${encodeURIComponent(`${ORIGIN}/acme/`)}`]
      })
      assert.ok(html.includes(stateSentence), `${provider} ?${query}: the state sentence`)
      assert.ok(!html.includes(cancelledSentence), `${provider} ?${query}: not a cancellation`)
      assert.doesNotMatch(html, NEVER_SHOWN)
      assert.deepEqual(sessionCookies(response), [])
      const machine = await providerReturn(app, provider, {
        ...(await startRoundWith(app, provider)),
        query,
        headers: {}
      })
      assert.equal(machine.status, 400)
      assert.deepEqual(await machine.json(), { code: 'OAUTH_STATE_INVALID' })
    }
  }
  assert.equal(exchanges.length, 0)
})

test('F-S1-002: a callback that carries a code is exchanged as before, whatever `error` says beside it', async () => {
  const { app, exchanges, writes } = watchedIdentity()
  const round = await startRoundWith(app, 'google')
  const response = await providerReturn(app, 'google', { ...round, query: 'code=code-1&error=access_denied' })
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), `${ORIGIN}/acme/`)
  assert.equal(sessionCookies(response).length, 1)
  assert.equal(exchanges.length, 1)
  assert.deepEqual(writes, ['google'])
})

test('F-S1-002: `error=access_denied` never gets past the state check', async () => {
  let t = NOW
  const { app, exchanges, writes } = watchedIdentity({ now: () => t })
  const stateSentence = translate('en', 'signin.stateBody')
  const refusedAsState = async (response, where) => {
    const html = await assertRecoveryPage(response, { status: 400, hrefs: ['/login'] })
    assert.ok(html.includes(stateSentence), `${where}: the state sentence`)
    for (const label of Object.values(PROVIDER_LABEL))
      assert.ok(!html.includes(translate('en', 'signin.cancelledBody', { provider: label })), where)
    assert.deepEqual(sessionCookies(response), [], where)
    assert.ok(clearsStateCookie(response), where)
  }
  const round = await startRoundWith(app, 'google')
  const unknown = 'u'.repeat(43)
  for (const [where, attempt] of [
    ['no state', { cookie: round.cookie }],
    ['an empty state', { state: '', cookie: round.cookie }],
    ['no cookie', { state: round.state }],
    ['an empty cookie', { state: round.state, cookie: 'tracy_oauth_state=' }],
    ['a cookie of another round', { state: round.state, cookie: 'tracy_oauth_state=other' }],
    ['a malformed cookie', { state: round.state, cookie: 'tracy_oauth_state' }],
    ['a state nobody issued', { state: unknown, cookie: `tracy_oauth_state=${unknown}` }]
  ])
    await refusedAsState(await providerReturn(app, 'google', attempt), where)

  // None of those consumed the round: its own browser can still cancel it, once.
  const own = await (await providerReturn(app, 'google', round)).text()
  assert.ok(own.includes(translate('en', 'signin.cancelledBody', { provider: 'Google' })))

  // A Google round answered at GitHub's door is refused, and consumed.
  const crossed = await startRoundWith(app, 'google')
  await refusedAsState(await providerReturn(app, 'github', crossed), 'another provider')
  await refusedAsState(await providerReturn(app, 'google', crossed), 'the crossed round, replayed')

  // Past its ten minutes.
  const expired = await startRoundWith(app, 'github')
  t += 11 * 60 * 1000
  await refusedAsState(await providerReturn(app, 'github', expired), 'an expired state')

  assert.equal(exchanges.length, 0)
  assert.equal(writes.length, 0)
})

test('F-S1-002: a cancelled sign-in with a hostile `next` leads back to Tracy only', async () => {
  const { app } = watchedIdentity()
  for (const next of [
    '//evil.example/x',
    'https://evil.example/',
    '/\\evil.example',
    'javascript:alert(1)'
  ]) {
    const round = await startRoundWith(app, 'github', next)
    const response = await providerReturn(app, 'github', round)
    const html = await response.text()
    assert.equal(response.status, 400)
    assert.ok(html.includes(translate('en', 'signin.cancelledBody', { provider: 'GitHub' })))
    assert.ok(links(html).length > 0)
    for (const href of links(html)) {
      assert.ok(href.startsWith('/login'), `link leaves Tracy: ${href}`)
      const back = new URL(href, ORIGIN).searchParams.get('next') ?? '/'
      assert.equal(new URL(back, ORIGIN).origin, ORIGIN, `way back leaves Tracy: ${back}`)
    }
    assert.doesNotMatch(html, /evil\.example|javascript:/)
  }
})

// ── F-S1-012: the sign-in doors that answered a bare 404 ────────────────────────────────────────

test('F-S1-012: a malformed /signin link and an unavailable provider are pages with a way to sign in', async () => {
  const { app } = identity()
  for (const address of [
    '/signin',
    '/signin?n=bad',
    `/signin?n=${'g'.repeat(64)}`,
    '/signin/github',
    '/signin/gitlab',
    '/signin/github/callback?state=x&code=y',
    '/signin/gitlab/callback'
  ]) {
    const response = await app.request(`${ORIGIN}${address}`, {
      headers: { ...HTML, 'accept-language': 'de' }
    })
    const html = await assertRecoveryPage(response, { status: 404, hrefs: ['/login'] })
    assert.match(html, /<html lang="de"/, address)
    assert.deepEqual(sessionCookies(response), [])
  }
  // A provider this deployment never lit up and one it does not know read the same.
  const disabled = await (await app.request(`${ORIGIN}/signin/github`, { headers: HTML })).text()
  const unknown = await (await app.request(`${ORIGIN}/signin/gitlab`, { headers: HTML })).text()
  assert.equal(disabled, unknown)
  // A caller that did not ask for a page keeps the plain 404.
  const machine = await app.request(`${ORIGIN}/signin/github`)
  assert.equal(machine.status, 404)
  assert.ok(!isHtml(machine))
})

// ── F-S1-003 / F-S1-004: a site's workspace that cannot be opened ───────────────────────────────

const sessionCookie = async (email = 'fixture@example.test') =>
  `tracy_sess=${await mintSession(email, SECRET)}`

function workspace({ dsh, mint = async () => null }) {
  return workspaceRoutes({
    config,
    pool: {},
    sites: {
      hostOf: async () => 'private-host',
      dshOf: () => dsh,
      labelOf: async () => 'fixture',
      siteScope: async () => 'fixture'
    },
    seats: { accountByEmail: async () => ({ id: 1 }), grantFor: async () => ({ role: 'owner' }) },
    seatDoor: { mintSeatSession: mint },
    pages: { noSites: null, workspaceUnavailable: workspaceUnavailablePage }
  })
}

for (const [name, dsh, code, machineStatus] of [
  ['no service configured for the site', null, 'HOST_NOT_CONFIGURED', 501],
  [
    'the site service refuses a session',
    { origin: 'http://dsh.test', seatSecret: 'fixture' },
    'SEAT_DOOR_REFUSED',
    502
  ]
]) {
  test(`F-S1-003: ${name} → a navigation gets a retryable page, a fetch keeps ${code}`, async () => {
    const app = workspace({ dsh })
    const cookie = await sessionCookie()
    const address = '/fixture.tracy.test/s/abc?tab=tracy:site-team&q=a%26b'
    const page = await app.request(`${ORIGIN}${address}`, {
      headers: { cookie, ...HTML, 'accept-language': 'fr' }
    })
    const html = await assertRecoveryPage(page, {
      status: 503,
      hrefs: [address.replace(/&/g, '&amp;')]
    })
    assert.match(html, /<html lang="fr"/)
    assert.ok(html.includes(translate('fr', 'bar.workspaceUnavailableHeading')))
    assert.equal(page.headers.get('retry-after'), '5')
    assert.equal(page.headers.get('set-cookie'), null)

    const fetched = await app.request(`${ORIGIN}${address}`, { headers: { cookie } })
    assert.equal(fetched.status, machineStatus)
    assert.equal((await fetched.json()).code, code)
    assert.equal(fetched.headers.get('set-cookie'), null)
  })
}

/** Addresses a browser would read as another host if they were handed back as they are. */
const TWO_SLASHES = [
  ['//evil.example', (cookie) => ({ cookie, referer: `${ORIGIN}/fixture.tracy.test/` })],
  ['//evil.example/path?x=1', (cookie) => ({ cookie, referer: `${ORIGIN}/fixture.tracy.test/` })],
  ['///evil.example', (cookie) => ({ cookie, referer: `${ORIGIN}/fixture.tracy.test/` })],
  ['//evil.example', (cookie) => ({ cookie: `${cookie}; tracy_site=fixture.tracy.test` })]
]
const staysHere = (reference, asked) => {
  assert.doesNotMatch(reference, /^[/\\]{2}/, `${asked}: a browser reads ${reference} as another host`)
  assert.equal(new URL(reference, ORIGIN).origin, ORIGIN, `${asked} → ${reference}`)
}

test('F-S1-003: an address that begins with two slashes gets a retry link that stays on the address it was asked on', async () => {
  const cookie = await sessionCookie()
  for (const [asked, located] of TWO_SLASHES) {
    const page = await workspace({ dsh: null }).request(`${ORIGIN}${asked}`, {
      headers: { ...HTML, ...located(cookie) }
    })
    assert.equal(page.status, 503, `${asked}: the page under test was not reached`)
    const hrefs = links(await page.text())
    assert.ok(hrefs.length > 0, `${asked}: no link`)
    for (const href of hrefs) staysHere(href, asked)
  }
})

test('F-S1-003: an address that begins with two slashes is never handed back as a redirect to another host', async () => {
  const cookie = await sessionCookie()
  const dsh = { origin: 'http://dsh.test', seatSecret: 'fixture' }
  for (const [asked, located] of TWO_SLASHES) {
    // A navigation, and a fetch whose seat was just minted: both are answered with a redirect.
    for (const accept of [HTML, {}]) {
      const response = await workspace({ dsh, mint: async () => 'fixture-seat-token' }).request(
        `${ORIGIN}${asked}`,
        { headers: { ...accept, ...located(cookie) } }
      )
      assert.equal(response.status, 302, `${asked}: no redirect to look at`)
      staysHere(response.headers.get('location'), asked)
    }
  }
})

test('F-S1-003: the unavailable page writes a retry link only for a path on its own address', async () => {
  for (const retryHref of [
    '//evil.example',
    '//evil.example/x?y=1',
    '/\\evil.example',
    '\\\\evil.example',
    'https://evil.example/',
    'javascript:alert(1)',
    'evil.example',
    '',
    undefined,
    7
  ]) {
    const html = await workspaceUnavailablePage('a@example.test', { retryHref, origin: ORIGIN }).text()
    assert.deepEqual(links(html), [`${ORIGIN}/`], String(retryHref))
  }
  const kept = await workspaceUnavailablePage('a@example.test', {
    retryHref: '/x/y?z=1',
    origin: ORIGIN
  }).text()
  assert.deepEqual(links(kept), ['/x/y?z=1'])
})

test('F-S1-003: a form POST refused before it is passed on is told it was not saved, and is not offered a GET of it', async () => {
  for (const dsh of [null, { origin: 'http://dsh.test', seatSecret: 'fixture' }]) {
    const app = workspace({ dsh })
    const cookie = await sessionCookie()
    const address = '/fixture.tracy.test/s/abc/save?step=2'
    for (const lang of ['en', 'fr']) {
      const page = await app.request(`${ORIGIN}${address}`, {
        method: 'POST',
        headers: {
          cookie,
          ...HTML,
          'accept-language': lang,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: 'title=typed+by+hand'
      })
      // The way out is Tracy's own configured address, never a relative `/`.
      const html = await assertRecoveryPage(page, { status: 503, hrefs: [`${ORIGIN}/`] })
      assert.ok(html.includes(translate(lang, 'bar.workspaceUnavailableUnsavedBody')), lang)
      // No promise that nothing was lost, and no link that would repeat the POST as a GET.
      assert.ok(!html.includes(translate(lang, 'bar.workspaceUnavailableBody')), lang)
      assert.deepEqual(links(html), [`${ORIGIN}/`])
      assert.doesNotMatch(html, /typed by hand|typed\+by\+hand/)
    }
    // Asked on another address (a customer site's): the link still leads to Tracy, not to that
    // address's own root, which is the workspace that just refused.
    const elsewhere = await app.request(`https://shop.customer.example${address}`, {
      method: 'POST',
      headers: { cookie, ...HTML, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'title=typed+by+hand'
    })
    const elsewhereLinks = links(await assertRecoveryPage(elsewhere, { status: 503, hrefs: [`${ORIGIN}/`] }))
    assert.deepEqual(elsewhereLinks, [`${ORIGIN}/`])
    for (const href of elsewhereLinks) assert.equal(new URL(href).origin, ORIGIN)
    // A GET of the same address keeps the retry and the assurance: its whole input is the address.
    const get = await app.request(`${ORIGIN}${address}`, { headers: { cookie, ...HTML } })
    const getHtml = await assertRecoveryPage(get, { status: 503, hrefs: [address] })
    assert.ok(getHtml.includes(translate('en', 'bar.workspaceUnavailableBody')))
    // A fetch POST keeps the machine answer.
    const fetched = await app.request(`${ORIGIN}${address}`, { method: 'POST', headers: { cookie } })
    assert.equal((await fetched.json()).code, dsh ? 'SEAT_DOOR_REFUSED' : 'HOST_NOT_CONFIGURED')
  }
})

test('F-S1-003: no session and no seat are refused before the site service is ever asked', async () => {
  let asked = 0
  const mint = async () => {
    asked += 1
    return null
  }
  const signedOut = await workspace({ dsh: { origin: 'http://dsh.test', seatSecret: 'x' }, mint }).request(
    `${ORIGIN}/fixture.tracy.test/?x=1`,
    { headers: HTML }
  )
  assert.equal(signedOut.status, 302)
  assert.match(signedOut.headers.get('location'), /^\/login\?next=/)
  const noSeat = workspaceRoutes({
    config,
    pool: {},
    sites: {
      hostOf: async () => 'private-host',
      dshOf: () => ({ origin: 'http://dsh.test', seatSecret: 'x' }),
      labelOf: async () => 'fixture',
      siteScope: async () => 'fixture'
    },
    seats: { accountByEmail: async () => ({ id: 1 }), grantFor: async () => null },
    seatDoor: { mintSeatSession: mint },
    pages: { noSites: null, workspaceUnavailable: workspaceUnavailablePage }
  })
  const refused = await noSeat.request(`${ORIGIN}/fixture.tracy.test/`, {
    headers: { cookie: await sessionCookie(), ...HTML }
  })
  assert.equal(refused.status, 302)
  assert.match(refused.headers.get('location'), /\/join\?next=/)
  assert.equal(asked, 0)
})

test('F-S1-004: the unavailable page says nothing internal, in every language, and escapes what it is handed', async () => {
  for (const lang of WEB_LANGUAGES) {
    const response = workspaceUnavailablePage('<b>x</b>@example.test', {
      retryHref: '/new/?a=1&b="><script>alert(1)</script>',
      reason: 'no host is configured',
      lang
    })
    const html = await response.text()
    assert.doesNotMatch(html, INTERNAL, lang)
    assert.doesNotMatch(html, /\{reason\}|\(\s*\)/, lang)
    assert.doesNotMatch(html, /<script>alert|<b>x<\/b>/, lang)
    if (lang !== 'en') {
      assert.ok(
        !html.includes(translate('en', 'bar.workspaceUnavailableBody')),
        `${lang}: the body is still English`
      )
    }
    const unsaved = await workspaceUnavailablePage('a@example.test', {
      retryHref: '/x/save',
      kept: false,
      lang
    }).text()
    assert.doesNotMatch(unsaved, INTERNAL, lang)
    assert.ok(unsaved.includes(translate(lang, 'bar.workspaceUnavailableUnsavedBody')), lang)
    // No configured address, or one that is not http(s): no link at all, never a relative one.
    assert.deepEqual(links(unsaved), [], lang)
    for (const origin of ['javascript:alert(1)', 'not an address']) {
      const page = workspaceUnavailablePage('a@example.test', { retryHref: '/x', kept: false, lang, origin })
      assert.deepEqual(links(await page.text()), [], origin)
    }
    if (lang !== 'en') {
      assert.ok(!unsaved.includes(translate('en', 'bar.workspaceUnavailableUnsavedBody')), lang)
    }
  }
  // The JSON a fetch gets keeps its `reason`: the dsh client reads it, a person does not.
  const app = workspaceRoutes({
    config,
    pool: {},
    sites: {
      hostOf: async () => 'local',
      dshOf: () => null,
      labelOf: async () => 'x',
      siteScope: async () => 'x'
    },
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] },
    pages: { noSites: null, workspaceUnavailable: workspaceUnavailablePage }
  })
  const fetched = await app.request(`${ORIGIN}/new/api/x`, { headers: { cookie: await sessionCookie() } })
  assert.equal(fetched.status, 501)
  assert.deepEqual(await fetched.json(), { code: 'HOST_NOT_CONFIGURED', reason: 'no host is configured' })
})

// ── F-S1-012: pages on an address that is not a site ────────────────────────────────────────────

test('F-S1-012: an unknown site and a refused hostname are pages that lead back to Tracy, not to the address they stand on', async () => {
  for (const lang of WEB_LANGUAGES) {
    const unknown = unknownSitePage('nope.tracy.test', lang, ORIGIN)
    assert.equal(unknown.status, 404)
    const unknownHtml = await unknown.text()
    assert.deepEqual(links(unknownHtml), [`${ORIGIN}/`], lang)
    // Shown inside Tracy's own preview frame: the way out must leave the frame.
    assert.match(unknownHtml, /<a\b[^>]*target="_top"/)

    const refused = refusedHostPage({ lang, origin: ORIGIN })
    assert.equal(refused.status, 404)
    assert.ok(isHtml(refused), `refused host (${lang}) is ${refused.headers.get('content-type')}`)
    const refusedHtml = await refused.text()
    assert.match(refusedHtml, /--primary:/)
    assert.deepEqual(links(refusedHtml), [`${ORIGIN}/`], lang)
    assert.match(refusedHtml, new RegExp(`<html lang="${lang === 'zh' ? 'zh-CN' : lang}"`))
  }
  // A hostile hostname is shown escaped, and never becomes a link.
  const hostile = await unknownSitePage('"><a href="https://evil.example">x</a>', 'en', ORIGIN).text()
  assert.deepEqual(links(hostile), [`${ORIGIN}/`])
  // A deployment whose origin is not an http(s) address gets a page without a link, not a bad one.
  assert.deepEqual(links(await refusedHostPage({ origin: 'javascript:alert(1)' }).text()), [])
  assert.deepEqual(links(await unknownSitePage('x.tracy.test', 'en', '').text()), [])
})

test('F-S1-012: the route answers a `--` label with that page', async () => {
  const app = new Hono()
  app.route('/', barRoutes({ pool: null, config, sites: {} }))
  const response = await app.request('http://a--b.tracy.test/', {
    headers: { host: 'a--b.tracy.test', ...HTML, 'accept-language': 'es' }
  })
  assert.equal(response.status, 404)
  assert.ok(isHtml(response), `got ${response.headers.get('content-type')}`)
  const html = await response.text()
  assert.match(html, /<html lang="es"/)
  assert.deepEqual(links(html), [`${ORIGIN}/`])
})

/** A sentence of the web table; a key the tree under test does not have is a failed assertion. */
const said = (lang, key) => {
  try {
    return translate(lang, key)
  } catch (error) {
    return assert.fail(`${key}: ${error.message}`)
  }
}

/** A sentence as the shell writes it into `<title>`. */
const escapeForTitle = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** The staff door over a stubbed workspaces store; `accept` is what accepting a grant answers. */
function ops(accept) {
  const app = new Hono()
  app.route(
    '/',
    opsRoutes({
      pool: {},
      config,
      workspaces: {
        tracyAdminWorkspace: async () => ({ id: 'ws-1' }),
        accountByEmail: async () => ({ id: 'acct-1' }),
        acceptWorkspaceGrant: accept
      }
    })
  )
  return app
}

test('F-S1-012: a staff invitation that is not open for this address is a translated page in the shared shell, 410, with a way on', async () => {
  const app = ops(async () => null)
  const cookie = await sessionCookie('staff@example.test')
  const english = await app.request(`${ORIGIN}/ops/invite/any`, { headers: { cookie, ...HTML } })
  const html = await assertRecoveryPage(english, { status: 410, hrefs: ['/'] })
  assert.ok(html.includes(said('en', 'ops.inviteNotOpenHeading')))
  assert.match(html, /staff@example\.test/)
  const vietnamese = await app.request(`${ORIGIN}/ops/invite/any`, {
    headers: { cookie, ...HTML, 'accept-language': 'vi' }
  })
  const viHtml = await assertRecoveryPage(vietnamese, { status: 410, hrefs: ['/'] })
  assert.match(viHtml, /<html lang="vi"/)
  assert.ok(!viHtml.includes(said('en', 'ops.inviteNotOpenHeading')))
  // Signed out: still sent to sign in first, as before.
  const signedOut = await app.request(`${ORIGIN}/ops/invite/any`, { headers: HTML })
  assert.equal(signedOut.status, 302)
  assert.match(signedOut.headers.get('location'), /^\/login\?next=/)
})

test('F-S1-012: an invitation not open for this address offers signing in with another one, back to the same link', async () => {
  const app = ops(async () => null)
  const cookie = await sessionCookie('wrong@example.test')
  const response = await app.request(`${ORIGIN}/ops/invite/tok%22en`, { headers: { cookie, ...HTML } })
  const html = await assertRecoveryPage(response, { status: 410, hrefs: ['/'] })
  // The door cannot tell a withdrawn invitation from one sent to another address, so the page
  // does not claim it was withdrawn or used.
  assert.doesNotMatch(html, /It was withdrawn|has already been used\. Ask/)
  assert.ok(html.includes(translate('en', 'bar.signInAsSomeoneElse')))
  const dom = new (loadJsdom().JSDOM)(html)
  const form = dom.window.document.querySelector('form')
  assert.ok(form, 'no sign-in action')
  assert.equal(form.getAttribute('method'), 'post')
  assert.equal(form.getAttribute('action'), '/auth/signout')
  assert.equal(
    form.querySelector('button[type="submit"]').textContent,
    translate('en', 'bar.signInAsSomeoneElse')
  )
  // Signing out leads to sign-in and from there back to this same invitation.
  const next = form.querySelector('input[name="next"]').getAttribute('value')
  assert.equal(next, `/login?next=${encodeURIComponent('/ops/invite/tok%22en')}`)
  assert.equal(response.headers.get('set-cookie'), null)
})

for (const [name, build] of [
  [
    'no database',
    () => {
      const app = new Hono()
      app.route('/', opsRoutes({ pool: null, config }))
      return app
    }
  ],
  [
    'a database that does not answer',
    () =>
      ops(async () => {
        throw new Error('connect ECONNREFUSED secret-db-host')
      })
  ]
]) {
  test(`F-S1-012: ${name} is "cannot be checked right now" (503), never a closed invitation`, async (context) => {
    context.mock.method(console, 'error', () => {})
    const cookie = await sessionCookie('staff@example.test')
    for (const lang of ['en', 'vi']) {
      const response = await build().request(`${ORIGIN}/ops/invite/any`, {
        headers: { cookie, ...HTML, 'accept-language': lang }
      })
      const html = await assertRecoveryPage(response, { status: 503, hrefs: ['/ops/invite/any'] })
      assert.equal(response.headers.get('retry-after'), '5')
      assert.ok(html.includes(translate(lang, 'ops.inviteUnavailableHeading')))
      assert.ok(!html.includes(said(lang, 'ops.inviteNotOpenHeading')))
      assert.doesNotMatch(html, /secret-db-host|ECONNREFUSED/)
      // Nothing to sign out for: the address was never looked up.
      assert.doesNotMatch(html, /<form/)
    }
  })
}

test('F-S1-012: the title of that page claims only what the door knows — no open invitation for this address — never that the invitation is closed', async () => {
  // The invitation may be open and simply sent to another address of the reader's.
  const CLOSED =
    /\bclosed\b|geschlossen|cerrad[ao]|ferm[ée]e?\b|chius[oa]|gesloten|đã đóng|已关闭|withdrawn|\bused\b/i
  const app = ops(async () => null)
  const cookie = await sessionCookie('other@example.test')
  const titles = new Set()
  for (const lang of WEB_LANGUAGES) {
    const response = await app.request(`${ORIGIN}/ops/invite/any`, {
      headers: { cookie, ...HTML, 'accept-language': lang }
    })
    assert.equal(response.status, 410)
    const [, title] = /<title>([^<]*)<\/title>/.exec(await response.text()) ?? []
    assert.ok(title, `${lang}: no title`)
    assert.doesNotMatch(title, CLOSED, lang)
    assert.match(said(lang, 'ops.inviteNotOpenTitle'), /Tracy/, lang)
    assert.equal(title, escapeForTitle(said(lang, 'ops.inviteNotOpenTitle')), lang)
    titles.add(title)
  }
  assert.equal(titles.size, WEB_LANGUAGES.length, 'a language shows another language’s title')
})

test('F-S1-012: an open invitation is still accepted and sent on to /ops', async () => {
  const accepted = []
  const app = ops(async (_pool, workspaceId, accountId) => {
    accepted.push([workspaceId, accountId])
    return { id: 'grant-1' }
  })
  const response = await app.request(`${ORIGIN}/ops/invite/any`, {
    headers: { cookie: await sessionCookie('staff@example.test'), ...HTML }
  })
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), '/ops')
  assert.deepEqual(accepted, [['ws-1', 'acct-1']])
})

// ── F-S1-013: the sign-in form ──────────────────────────────────────────────────────────────────

/** The login page in jsdom with its own script running and `fetch` answered by `answer`. */
async function scriptedLogin(pageOptions, answer) {
  const { JSDOM } = loadJsdom()
  const dom = new JSDOM(loginPage({ origin: ORIGIN, ...pageOptions }), {
    url: `${ORIGIN}/login`,
    runScripts: 'outside-only'
  })
  const calls = []
  dom.window.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    return answer(String(url))
  }
  for (const script of dom.window.document.querySelectorAll('script')) dom.window.eval(script.textContent)
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
  return { dom, document: dom.window.document, calls, settle }
}

const submit = (dom, id) =>
  dom.window.document
    .getElementById(id)
    .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))

test('F-S1-013: with script on, each refusal of the address form says its own sentence', async () => {
  for (const [status, body, key] of [
    [400, { code: 'INVALID_EMAIL' }, 'login.invalidEmail'],
    [429, { code: 'RATE_LIMITED' }, 'login.rateLimited'],
    [500, { code: 'ANYTHING_ELSE' }, 'login.sendFailed'],
    [502, null, 'login.sendFailed']
  ]) {
    for (const lang of ['en', 'vi']) {
      const { dom, document, settle } = await scriptedLogin(
        { lang },
        () => new Response(body === null ? '<html>bad gateway</html>' : JSON.stringify(body), { status })
      )
      try {
        document.getElementById('login-email').value = 'a@b'
        submit(dom, 'email-form')
        await settle()
        assert.equal(document.getElementById('email-error').hidden, false)
        assert.equal(document.getElementById('email-error-text').textContent, translate(lang, key))
        assert.equal(document.getElementById('email-step').hidden, false)
      } finally {
        dom.window.close()
      }
    }
  }
})

/** What the membership service answers for an address, as `fetch` would hand it over. */
const memberAnswer =
  (body, status = 200) =>
  async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
/** The service knows no such member: the answer `parseAccess` reads as "not admitted yet". */
const NO_MEMBER = memberAnswer({ ok: false, code: -1, msg: 'Failure' })

/**
 * The beta gate itself (`createBetaAccess`, not a stand-in), closed, over a membership service
 * that answers `answer`. The statuses the route sees are the ones the gate really gives; `seen`
 * counts how often it was asked and what was queued.
 */
function realBeta(store, answer = NO_MEMBER) {
  const seen = { decided: 0, queued: 0 }
  const access = createBetaAccess({
    config: {
      beta: { enabled: true, apiUrl: 'https://members.example/api/check-access', apiKey: 'fixture-key' }
    },
    identity: store,
    fetchImpl: answer,
    now: () => NOW,
    log: { warn() {}, error() {} }
  })
  return {
    seen,
    beta: {
      access: {
        enabled: access.enabled,
        decide: async (...args) => {
          seen.decided += 1
          return access.decide(...args)
        }
      },
      enqueue: async () => {
        seen.queued += 1
      }
    }
  }
}

/** A gate answering one fixed status — only for a status `createBetaAccess` does not define. */
function fixedBeta(status) {
  const seen = { decided: 0, queued: 0 }
  return {
    seen,
    beta: {
      access: {
        enabled: true,
        decide: async () => {
          seen.decided += 1
          return { status, plans: [], gate: true }
        }
      },
      enqueue: async () => {
        seen.queued += 1
      }
    }
  }
}

/** The identity doors behind a closed gate built over their own store. */
function gatedIdentity(makeBeta, options = {}) {
  const store = memoryIdentityStore()
  const { beta, seen } = makeBeta(store)
  const app = identityRoutes({
    config: { ...config, beta: { ...config.beta, enabled: true } },
    store,
    mail: { send: async () => {}, signInCodeMail: () => ({ subject: '', text: '' }) },
    now: options.now ?? (() => NOW),
    beta
  })
  return { app, store, seen }
}

async function verifiedCode(store, email, code = '123456') {
  await store.putCode({ email, codeHash: await hashCode(code, email, SECRET), expiresAt: NOW + 60_000 })
  return code
}

/**
 * A correct code the gate then refuses, on the form post and on the page's own fetch: the
 * sentence `key`, the reason `reason`, the whitelist link shown only when the address is simply
 * not admitted, nobody signed in, and the code spent.
 */
async function assertRefusedByAdmission(makeBeta, { key, reason }) {
  const { app, store, seen } = gatedIdentity(makeBeta)

  // A real form post: the page comes back on the code step with the sentence and the link.
  const code = await verifiedCode(store, 'new@example.test')
  const form = new URLSearchParams({ email: 'new@example.test', next: '/acme/' })
  for (const digit of code) form.append('code', digit)
  const posted = await app.request(`${ORIGIN}/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept-language': 'vi' },
    body: form.toString()
  })
  assert.equal(posted.status, 401)
  const html = await posted.text()
  // The alert the server rendered (the page's script carries every sentence as a constant).
  const alert = html.match(/<span id="code-error-text">([^<]*)<\/span>/)?.[1] ?? ''
  assert.notEqual(alert, translate('vi', 'login.codeInvalid'), 'a correct code was answered as a wrong code')
  assert.equal(alert, translate('vi', key))
  assert.equal(/id="waitlist-note" hidden/.test(html), reason !== 'NOT_ADMITTED')
  assert.ok(links(html).includes(WAITLIST), `no whitelist link in ${links(html)}`)
  assert.deepEqual(sessionCookies(posted), [])
  // The code is spent: a second try with the same digits is an ordinary wrong code.
  assert.equal(await store.takeCode('new@example.test'), null)

  // The page's own fetch: same refusal, the same status and code as any failed verify.
  await verifiedCode(store, 'new@example.test')
  const fetched = await app.request(`${ORIGIN}/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'new@example.test', code })
  })
  assert.equal(fetched.status, 401)
  assert.deepEqual(await fetched.json(), { code: 'CODE_INVALID', reason })
  assert.deepEqual(sessionCookies(fetched), [])
  assert.equal(await store.accountByEmail('new@example.test'), null)
  assert.equal(seen.decided, 2)
}

// What the membership service says about an address that is not admitted: each is the gate's
// `waitlist`, and the person is told so and shown the whitelist — on the form and on the fetch.
for (const [label, answer] of [
  ['the service knows no such member', NO_MEMBER],
  ['the member has no subscription', memberAnswer({ ok: true, user_id: 7, subscriptions: [] })],
  [
    'the member has only a lapsed plan and a plan that does not count',
    memberAnswer({ ok: true, user_id: 7, subscriptions: { 10: '2020-01-01', 18: '2999-01-01' } })
  ]
]) {
  test(`F-S1-013: a correct code for an address the beta gate has not admitted (${label}) says so and shows the whitelist — form and fetch`, async () => {
    await assertRefusedByAdmission((store) => realBeta(store, answer), {
      key: 'login.notAdmitted',
      reason: 'NOT_ADMITTED'
    })
  })
}

// The service could not say: that is not "not admitted", and nobody is sent to the whitelist.
for (const [label, answer] of [
  ['the service answers 500', memberAnswer({}, 500)],
  ['the service is not reached', async () => Promise.reject(new TypeError('fetch failed'))],
  ['the service answers something that is not JSON', memberAnswer('<html>gateway</html>')],
  ['the service reports its own failure', memberAnswer({ error: true, message: 'API Error 10001' })],
  ['the service answers a shape nobody knows', memberAnswer({ ok: true, subscriptions: 'none' })]
]) {
  test(`F-S1-013: a correct code while admission cannot be checked (${label}) says that, never "not admitted" — form and fetch`, async () => {
    await assertRefusedByAdmission((store) => realBeta(store, answer), {
      key: 'login.accessUnavailable',
      reason: 'ACCESS_UNAVAILABLE'
    })
  })
}

// A status the gate does not define is never read as a decision about the address.
for (const status of ['error', 'deny', 'denied', '', undefined]) {
  test(`F-S1-013: a correct code refused with a status the beta gate does not define (${JSON.stringify(status) ?? 'none'}) is "cannot be checked" — form and fetch`, async () => {
    await assertRefusedByAdmission(() => fixedBeta(status), {
      key: 'login.accessUnavailable',
      reason: 'ACCESS_UNAVAILABLE'
    })
  })
}

test('F-S1-013: a correct code for a member the beta gate admits still signs in', async () => {
  const { app, store, seen } = gatedIdentity((s) =>
    realBeta(s, memberAnswer({ ok: true, user_id: 7, subscriptions: { 10: '2999-01-01' } }))
  )
  const code = await verifiedCode(store, 'member@example.test')
  const response = await app.request(`${ORIGIN}/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'member@example.test', code })
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, email: 'member@example.test' })
  assert.equal(sessionCookies(response).length, 1)
  assert.equal(seen.decided, 1)
})

test('F-S1-013: a wrong, expired or exhausted code never learns anything about admission', async () => {
  let t = NOW
  const { app, store, seen } = gatedIdentity(realBeta, { now: () => t })
  const post = (body) =>
    app.request(`${ORIGIN}/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  for (const body of [{}, { email: 'nobody@example.test', code: '000000' }, { email: 5, code: [] }]) {
    const response = await post(body)
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { code: 'CODE_INVALID' })
  }
  const code = await verifiedCode(store, 'new@example.test')
  const wrong = await post({ email: 'new@example.test', code: '000000' })
  assert.deepEqual(await wrong.json(), { code: 'CODE_INVALID' })
  t += 61_000
  const expired = await post({ email: 'new@example.test', code })
  assert.deepEqual(await expired.json(), { code: 'CODE_INVALID' })
  t = NOW
  await verifiedCode(store, 'burn@example.test')
  for (let i = 0; i < 5; i++) await post({ email: 'burn@example.test', code: '000000' })
  const burned = await post({ email: 'burn@example.test', code })
  assert.deepEqual(await burned.json(), { code: 'CODE_INVALID' })
  assert.equal(seen.decided, 0, 'admission is only asked about an inbox that proved itself')
  assert.equal(seen.queued, 0)
})

test('F-S1-013: with script on, a code refused by admission shows the sentence and the whitelist link; a wrong code does not', async () => {
  for (const [body, key, linkShown] of [
    [{ code: 'CODE_INVALID', reason: 'NOT_ADMITTED' }, 'login.notAdmitted', true],
    [{ code: 'CODE_INVALID', reason: 'ACCESS_UNAVAILABLE' }, 'login.accessUnavailable', false],
    [{ code: 'CODE_INVALID' }, 'login.codeInvalid', false],
    [{ code: 'CODE_INVALID', reason: 'https://evil.example/' }, 'login.codeInvalid', false]
  ]) {
    const { dom, document, settle } = await scriptedLogin(
      { step: 'code', email: 'new@example.test', waitlistUrl: WAITLIST, lang: 'de' },
      () => new Response(JSON.stringify(body), { status: 401 })
    )
    try {
      const link = document.getElementById('waitlist-link')
      assert.ok(link, 'the code step carries the whitelist link, rendered by the server')
      assert.equal(link.getAttribute('href'), WAITLIST)
      assert.equal(document.getElementById('waitlist-note').hidden, true)
      for (const slot of document.querySelectorAll('.otp-slot')) slot.value = '1'
      submit(dom, 'code-form')
      await settle()
      assert.equal(document.getElementById('code-error-text').textContent, translate('de', key))
      assert.equal(document.getElementById('waitlist-note').hidden, !linkShown)
      // The link's address is the server's, whatever the answer carried.
      assert.equal(link.getAttribute('href'), WAITLIST)
    } finally {
      dom.window.close()
    }
  }
})

test('F-S1-013: with script on, a failed answer (5xx) is not read as the refusal its body names', async () => {
  // The address form: INVALID_EMAIL is the door's answer only on its 400.
  for (const status of [500, 502, 503]) {
    const { dom, document, settle } = await scriptedLogin(
      { lang: 'de' },
      () => new Response(JSON.stringify({ code: 'INVALID_EMAIL' }), { status })
    )
    try {
      document.getElementById('login-email').value = 'a@b.example'
      submit(dom, 'email-form')
      await settle()
      assert.equal(
        document.getElementById('email-error-text').textContent,
        translate('de', 'login.sendFailed'),
        String(status)
      )
    } finally {
      dom.window.close()
    }
  }
  // The code form: an admission reason is the door's answer only on its 401.
  for (const [status, reason] of [
    [500, 'NOT_ADMITTED'],
    [502, 'NOT_ADMITTED'],
    [503, 'ACCESS_UNAVAILABLE'],
    [403, 'NOT_ADMITTED']
  ]) {
    const { dom, document, settle } = await scriptedLogin(
      { step: 'code', email: 'new@example.test', waitlistUrl: WAITLIST, lang: 'de' },
      () => new Response(JSON.stringify({ code: 'CODE_INVALID', reason }), { status })
    )
    try {
      for (const slot of document.querySelectorAll('.otp-slot')) slot.value = '1'
      submit(dom, 'code-form')
      await settle()
      assert.equal(
        document.getElementById('code-error-text').textContent,
        translate('de', 'login.codeInvalid'),
        `${status} ${reason}`
      )
      const note = document.getElementById('waitlist-note')
      assert.ok(note, 'the code step carries no whitelist note')
      assert.equal(note.hidden, true, `${status} ${reason}`)
    } finally {
      dom.window.close()
    }
  }
})

test('F-S1-013: the whitelist link is only ever the configured http(s) address', () => {
  for (const waitlistUrl of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', '', undefined]) {
    const html = loginPage({ origin: ORIGIN, step: 'code', waitlistUrl, showWaitlist: true })
    assert.doesNotMatch(html, /id="waitlist-link"/, String(waitlistUrl))
  }
  const html = loginPage({
    origin: ORIGIN,
    step: 'code',
    waitlistUrl: 'https://tracy.example/w/?a=1&b="x"',
    showWaitlist: true
  })
  assert.match(html, /id="waitlist-link" href="https:\/\/tracy\.example\/w\/\?a=1&amp;b=&quot;x&quot;"/)
})
