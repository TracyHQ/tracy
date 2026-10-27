import { workspaceUnavailablePage } from '../src/bar/pages.js'
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { WebSocketServer } from 'ws'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { outgoingCookieHeader, relabelSetCookie, seatTokenCookieName } from '../src/lib/cookies.js'
import {
  ENTERED_WINDOW_MS,
  enteredKey,
  SITE_COOKIE,
  resolveSite,
  siteFromReferer,
  workspaceRoutes
} from '../src/workspace/route.js'
import { createOpsSignal } from '../src/lib/ops-signal.js'
import { grantFingerprint, seatCookieValue } from '../src/workspace/scope.js'
import { forwardHttp, forwardUpgrade } from '../src/workspace/proxy.js'
import { start } from '../src/server.js'
import { mintSession, mintViewSession, withViewAs } from '../src/lib/session.js'
import { buildApp } from '../src/app.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbUrl = process.env.TEST_DATABASE_URL
const dbOpts = { skip: dbUrl ? false : 'set TEST_DATABASE_URL' }

test('cookies: Tracy cookies never reach dsh, the seat token goes as dsh_gateway_token', () => {
  assert.equal(outgoingCookieHeader('tracy_sess=a; tracy_tok_x__y=b; wp=1', 'T'), 'wp=1; dsh_gateway_token=T')
  assert.equal(outgoingCookieHeader('tracy_sess=a', null), null)
  assert.deepEqual(relabelSetCookie(['dsh_gateway_token=z; Path=/', 'other=1'], 'tracy_tok_h__s'), [
    'tracy_tok_h__s=z; Path=/',
    'other=1'
  ])
  assert.equal(seatTokenCookieName('http://127.0.0.1:51790', 'wpdemo'), 'tracy_tok_127_0_0_1_51790__wpdemo')
})

test('outgoingCookieHeader: the tracy_ filter is case-insensitive', () => {
  assert.equal(
    outgoingCookieHeader('Tracy_Sess=a; DSH_GATEWAY_TOKEN=old; wp=1', 'T'),
    'wp=1; dsh_gateway_token=T'
  )
})

test('seatTokenCookieName: scope is sanitized exactly like dshOrigin, so no value can inject cookie attributes', () => {
  const injected = seatTokenCookieName('http://127.0.0.1:51790', 'evil; Path=/;Domain=evil.com')
  assert.doesNotMatch(injected, /[;\s]/)
  assert.equal(injected, 'tracy_tok_127_0_0_1_51790__evil__path___domain_evil_com')

  const spaced = seatTokenCookieName('http://127.0.0.1:51790', 'wp demo')
  assert.doesNotMatch(spaced, /\s/)
  assert.equal(spaced, 'tracy_tok_127_0_0_1_51790__wp_demo')
})

test('resolveSite: a dotted first segment is a site, anything else is the root', () => {
  assert.deepEqual(resolveSite('/wpdemo.localhost/agent/x'), {
    siteKey: 'wpdemo.localhost',
    mount: '/wpdemo.localhost',
    rest: '/agent/x'
  })
  assert.deepEqual(resolveSite('/wpdemo.localhost'), {
    siteKey: 'wpdemo.localhost',
    mount: '/wpdemo.localhost',
    rest: '/'
  })
  assert.deepEqual(resolveSite('/assets/a.js'), { siteKey: null, mount: '', rest: '/assets/a.js' })
})

test("resolveSite: dsh's own root files are never mistaken for a site, even though they are a dotted single segment too", () => {
  // Measured live: /manifest.webmanifest and /favicon.svg match the same "dotted first segment"
  // shape a real site key has (wpdemo.localhost), so without this exclusion a request for either
  // gets treated as "the path names a site called manifest.webmanifest" — minting it a seat and
  // mounting it as a prefix, instead of falling through to the Referer/cookie resolution these
  // dsh-served root files actually need.
  assert.deepEqual(resolveSite('/manifest.webmanifest'), {
    siteKey: null,
    mount: '',
    rest: '/manifest.webmanifest'
  })
  assert.deepEqual(resolveSite('/favicon.svg'), { siteKey: null, mount: '', rest: '/favicon.svg' })
})

// --- workspaceRoutes: dsh's public root files must never sit behind the session gate ----------
//
// Measured live (chrome-acceptance.md): `GET /manifest.webmanifest` fell into the ordinary
// `!email` branch and came back a `302` to `/login?next=…`, then a `200` HTML login page under
// that `.webmanifest` URL — a PWA manifest is a public static document and must never answer
// with HTML, gated or not.

test('workspaceRoutes: /manifest.webmanifest is forwarded straight to dsh, with no session cookie at all', async (t) => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/manifest+json' })
    res.end('{"name":"Tracy"}')
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) })
  })
  // No `tracy_sess` at all — a manifest fetch commonly rides without one — only the site
  // pointer, standing in for a Referer that named a site earlier in the same tab.
  const res = await app.fetch(
    new Request('http://tracy.test/manifest.webmanifest', {
      headers: { cookie: `${SITE_COOKIE}=wpdemo.localhost` }
    })
  )
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('location'), null)
  assert.equal(await res.text(), '{"name":"Tracy"}')
})

test('workspaceRoutes: /manifest.webmanifest with no site resolvable at all is a plain 404, never the login page', async () => {
  const app = workspaceRoutes({ config: routeConfig, sites: fakeSites() })
  const res = await app.fetch(new Request('http://tracy.test/manifest.webmanifest'))
  assert.equal(res.status, 404)
  assert.equal(res.headers.get('location'), null)
  const body = await res.text()
  assert.doesNotMatch(body, /<html/i)
  assert.doesNotMatch(body, /sign in/i)
})

// --- workspaceRoutes' three error branches, exercised directly against the Hono app it
// returns (no server.js / real sockets needed for these) ---

const routeSessionSecret = 's'.repeat(32)
const routeConfig = { sessionSecret: routeSessionSecret, secure: false }

function fakeSites(overrides = {}) {
  return {
    hostOf: async () => 'local',
    dshOf: () => ({ origin: 'http://127.0.0.1:1', seatSecret: 'k' }),
    labelOf: async (key) => key,
    siteScope: async () => 'wpdemo',
    ...overrides
  }
}

/**
 * A seat cookie AS THE ROUTE WRITES IT since 13/09: the fingerprint of the grant it was minted
 * for, then the lane's token. A bare token is read as "minted for something else" and re-minted —
 * so every test that wants the proxy to USE its token has to spell the cookie this way, with the
 * exact grant `workspaceResolver` builds for the fixture (`fakeSites().labelOf` answers the key
 * itself, and `fakeSeats()` carries no toolset reader, so the grant holds NO toolsets — sent as
 * an empty list, never left out, ADR 0028).
 */
async function siteSeatCookie({ dshOrigin, email = 'ceo@tracy.ai', role = 'owner', token = 'tok' }) {
  const grant = { role, email, folders: ['/site/wpdemo.localhost'], site: 'wpdemo.localhost', toolsets: [] }
  const fp = await grantFingerprint(grant, 'wpdemo', routeSessionSecret)
  return `${seatTokenCookieName(dshOrigin, 'wpdemo')}=${seatCookieValue(fp, token)}`
}

// A truthy stand-in for `pool` — `roleOnSite` (`../src/lib/role-on-site.js`) only ever checks it
// for truthiness before handing it to `seats.accountByEmail`/`seats.grantFor`, both mocked below,
// so these unit tests never need a real Postgres connection to exercise a viewer WITH a live seat.
const fakePool = {}

/** An accepted, live seat for whoever asks — the fixture every test below that exercises the
 * "seat found, proceed to mint/proxy" path needs, now that `workspaceRoutes` actually consults
 * the seat book (Plan 2) instead of minting `owner` unconditionally (Plan 1's bug). Tests that
 * exercise the SEAT-LESS path build their own `{ accountByEmail, grantFor }` instead — see the
 * "no live seat" test group below. */
function fakeSeats(role = 'owner') {
  return {
    defaultSiteFor: async () => null,
    accountByEmail: async () => ({ id: 'acct-1' }),
    grantFor: async () => ({ role })
  }
}

test('workspaceRoutes: a site whose host has no dsh answers 501 HOST_NOT_CONFIGURED', async () => {
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => null }),
    pool: fakePool,
    seats: fakeSeats()
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie } }))
  assert.equal(res.status, 501)
  assert.deepEqual(await res.json(), { code: 'HOST_NOT_CONFIGURED', host: 'local' })
})

test('workspaceRoutes: a refusing seat door answers 502 SEAT_DOOR_REFUSED and plants no cookie', async () => {
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites(),
    seatDoor: { mintSeatSession: async () => null },
    pool: fakePool,
    seats: fakeSeats()
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie } }))
  assert.equal(res.status, 502)
  assert.deepEqual(await res.json(), { code: 'SEAT_DOOR_REFUSED' })
  assert.equal(res.headers.get('set-cookie'), null)
})

for (const [name, location] of [
  ['the host dsh’s bare Tracy origin', 'http://tracy-web:51710'],
  ['its own sign-in door', '/wpdemo.localhost/gateway/tracy?next=%2Fwpdemo.localhost%2F']
]) {
  test(`workspaceRoutes: a dsh redirect to ${name} is a refused seat too — cleared with a terminal unavailable response`, async (t) => {
    // dsh-passwords answers a navigation with no live session by REDIRECTING to its sign-in target
    // (`noSessionAnswer` in vendor/tracy/dsh-passwords/src/tracy/seat.ts): on a host dsh that target is
    // Tracy's own origin, absolute, and it is only a 401 for a caller carrying the Worker's Access
    // header. Handed to the browser as it stood, a revoked seat cookie sent the viewer to
    // `http://tracy-web:51710` — a compose-internal name no browser resolves (measured 25/09 after
    // a site was deleted and added back under the same name).
    const upstream = http.createServer((req, res) => {
      res.writeHead(302, { location })
      res.end()
    })
    await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
    t.after(() => upstream.close())
    const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
    const app = workspaceRoutes({
      config: routeConfig,
      sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
      pool: fakePool,
      seats: fakeSeats()
    })
    const seatCookieName = seatTokenCookieName(dshOrigin, 'wpdemo')
    const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin, token: 'revoked' })}`
    const res = await app.fetch(
      new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie, accept: 'text/html' } })
    )
    assert.equal(res.status, 502)
    assert.equal(res.headers.get('location'), null)
    assert.equal(
      res.headers.get('set-cookie'),
      `${seatCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    )
  })
}

test('workspaceRoutes: an ordinary dsh redirect inside the site is forwarded, and the seat is kept', async (t) => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(302, { location: '/wpdemo.localhost/s/session-1' })
    res.end()
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    pool: fakePool,
    seats: fakeSeats()
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin, token: 'live' })}`
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie, accept: 'text/html' } })
  )
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/wpdemo.localhost/s/session-1')
  assert.ok(!(res.headers.get('set-cookie') ?? '').includes('Max-Age=0'))
})

// --- The dsh-passwords card's own Sign out behind this proxy (`POST <mount>/gateway/logout`) ---
// dsh revokes the seat token and answers with its sign-in redirect. Read as a stale seat, that
// answer became a 302 back to `/<site>/gateway/logout`: the browser re-sent it as a GET, a new
// seat was minted on the way, and dsh answered 405 — the person was never signed out (measured
// 09/10 on a private stand). A seat is minted from the Tracy session, so ending the seat alone
// ends nothing: the card's Sign out is Tracy's sign-out, the same cookies `/auth/signout` clears.

async function logoutDsh(
  t,
  answer = (req, res) => {
    res.writeHead(302, { location: 'http://tracy-web:51710' })
    res.end()
  }
) {
  const seen = []
  const upstream = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, cookie: req.headers.cookie ?? '' })
    answer(req, res)
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  return { dshOrigin: `http://127.0.0.1:${upstream.address().port}`, seen }
}

function signOutCleared(res, seatCookieName) {
  const planted = res.headers.getSetCookie()
  assert.ok(
    planted.some((c) => /^tracy_sess=; .*Max-Age=0$/.test(c)),
    `the Tracy session is cleared: ${planted.join(' | ')}`
  )
  assert.ok(planted.some((c) => c.startsWith('tracy_site=;') && c.includes('Max-Age=0')))
  if (seatCookieName)
    assert.ok(planted.some((c) => c.startsWith(`${seatCookieName}=;`) && c.includes('Max-Age=0')))
}

test('workspaceRoutes: the card’s Sign out ends the seat at dsh, then signs out of Tracy — never a loop back to itself', async (t) => {
  const { dshOrigin, seen } = await logoutDsh(t)
  let mints = 0
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    seatDoor: {
      mintSeatSession: async () => {
        mints += 1
        return 'fresh'
      }
    },
    pool: fakePool,
    seats: fakeSeats()
  })
  const seatCookieName = seatTokenCookieName(dshOrigin, 'wpdemo')
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin, token: 'live' })}`
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/gateway/logout', { method: 'POST', headers: { cookie } })
  )
  assert.equal(seen.length, 1, 'dsh is asked once, so it revokes the seat token and closes its sockets')
  assert.equal(seen[0].method, 'POST')
  assert.match(seen[0].cookie, /dsh_gateway_token=live/)
  assert.equal(mints, 0, 'no seat is minted to sign out')
  assert.equal(res.status, 303)
  assert.equal(res.headers.get('location'), '/login')
  signOutCleared(res, seatCookieName)
})

test('workspaceRoutes: the card’s Sign out on /new/ signs out of Tracy too', async (t) => {
  const { dshOrigin, seen } = await logoutDsh(t, (req, res) => {
    res.writeHead(302, { location: '/new/gateway/login' })
    res.end()
  })
  const app = workspaceRoutes({
    config: { ...routeConfig, defaultHost: 'local', onboardingHome: '/home' },
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    seatDoor: { mintSeatSession: async () => 'fresh' },
    pool: fakePool,
    seats: fakeSeats()
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(
    new Request('http://tracy.test/new/gateway/logout', { method: 'POST', headers: { cookie } })
  )
  assert.equal(seen.length, 0, 'no seat held: nothing at dsh to end, and none is minted to end it')
  assert.equal(res.status, 303)
  assert.equal(res.headers.get('location'), '/login')
  signOutCleared(res, null)
})

test('workspaceRoutes: the card’s Sign out still signs out of Tracy when dsh is not answering', async () => {
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: 'http://127.0.0.1:1', seatSecret: 'k' }) }),
    pool: fakePool,
    seats: fakeSeats()
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin: 'http://127.0.0.1:1', token: 'live' })}`
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/gateway/logout', { method: 'POST', headers: { cookie } })
  )
  assert.equal(res.status, 303)
  assert.equal(res.headers.get('location'), '/login')
  signOutCleared(res, seatTokenCookieName('http://127.0.0.1:1', 'wpdemo'))
})

test('workspaceRoutes: a GET of the logout path is not a sign-out (only the POST is)', async (t) => {
  const { dshOrigin, seen } = await logoutDsh(t, (req, res) => {
    res.writeHead(405)
    res.end()
  })
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    pool: fakePool,
    seats: fakeSeats()
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin, token: 'live' })}`
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/gateway/logout', { headers: { cookie } })
  )
  assert.equal(seen.length, 1)
  assert.equal(res.status, 405)
  assert.ok(!res.headers.getSetCookie().some((c) => c.startsWith('tracy_sess=')))
})

// After its Sign out the card sends the browser to `<mount>/gateway/login`, dsh-passwords' own
// password page. Every dsh behind this proxy has a seat secret, and that page is a 404 there (the
// sign-in door is Tracy's). The address is the site's sign-in, so it goes to the site: `/login`
// first when signed out, the site itself when not.
for (const path of ['/wpdemo.localhost/gateway/login', '/new/gateway/login']) {
  test(`workspaceRoutes: GET ${path} goes to its mount, never to dsh's password page`, async () => {
    const app = workspaceRoutes({
      config: routeConfig,
      sites: fakeSites(),
      pool: fakePool,
      seats: fakeSeats()
    })
    const mount = path.slice(0, path.indexOf('/gateway/'))
    const anonymous = await app.fetch(new Request(`http://tracy.test${path}?next=%2F`))
    assert.equal(anonymous.status, 302)
    assert.equal(anonymous.headers.get('location'), `${mount}/`)
    const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
    const signedIn = await app.fetch(new Request(`http://tracy.test${path}`, { headers: { cookie } }))
    assert.equal(signedIn.status, 302)
    assert.equal(signedIn.headers.get('location'), `${mount}/`)
  })
}

// --- Root paths belong to the lane (Task 8b): dsh IS the shell, so its own assets sit at the
// origin root under `<base href="/">`. The site for a root path comes from the Referer, then
// the tracy_site cookie — ported from siteOf/siteFromReferer in
// workers/cowork-web/src/worker.js. ---

test('siteFromReferer: same-origin only, and the site is whatever resolveSite says of its path', () => {
  assert.equal(
    siteFromReferer('http://tracy.test/wpdemo.localhost/', 'http://tracy.test'),
    'wpdemo.localhost'
  )
  assert.equal(
    siteFromReferer('http://tracy.test/wpdemo.localhost/agent', 'http://tracy.test'),
    'wpdemo.localhost'
  )
  assert.equal(siteFromReferer('http://evil.example/wpdemo.localhost/', 'http://tracy.test'), null)
  assert.equal(siteFromReferer(null, 'http://tracy.test'), null)
  assert.equal(siteFromReferer('not a url', 'http://tracy.test'), null)
})

// ── Part A of tasks/pa-dia-chi-mot-duong-cho-site.md (Lee, 20/09): a site keeps its prefix ────

/** A dsh stand-in that records what reached it and answers like the real one under a prefix:
 * a redirect it hands back already carries the mount (`webserver.mountOf`). */
async function prefixAwareDsh(answer) {
  const seen = []
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, prefix: req.headers['x-forwarded-prefix'] })
    if (answer) return answer(req, res)
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<base href="/wpdemo.localhost/">')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  // `unref`: a test that fails before its `close()` must not hold the runner open forever.
  server.unref()
  return { seen, origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

async function siteApp(dsh, overrides = {}) {
  return workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }), ...overrides }),
    pool: fakePool,
    seats: fakeSeats()
  })
}

// ── #519: a workspace's PWA manifest under its mount answers a viewer with no session ─────────
// Browsers fetch `<link rel="manifest">` without cookies; measured 28/09 on cowork.tracy.site,
// `/<siteKey>/manifest.webmanifest` and `/new/manifest.webmanifest` came back a 302 to
// `/login?next=…` and every workspace page logged a manifest syntax error twice.

/** A dsh stand-in answering the manifest the way dsh-passwords does to an anonymous request. */
async function manifestDsh(answer) {
  const methods = []
  const dsh = await prefixAwareDsh((req, res) => {
    methods.push(req.method)
    if (answer) return answer(req, res)
    res.writeHead(200, { 'content-type': 'application/manifest+json' })
    res.end('{"name":"Tracy"}')
  })
  return { ...dsh, methods }
}

/** A door that fails the test if anything asks it for a seat. */
const noMint = {
  mintSeatSession: async () => {
    throw new Error('an anonymous manifest must never mint a seat')
  }
}

function manifestApp(dsh, { sites: siteOverrides = {}, config = {} } = {}) {
  return workspaceRoutes({
    config: { ...routeConfig, defaultHost: 'local', ...config },
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }), ...siteOverrides }),
    seatDoor: noMint,
    pool: fakePool,
    seats: fakeSeats()
  })
}

const MANIFEST_MOUNTS = ['/wpdemo.localhost', '/new']

for (const mount of MANIFEST_MOUNTS) {
  for (const method of ['GET', 'HEAD']) {
    test(`workspaceRoutes: anonymous ${method} ${mount}/manifest.webmanifest is forwarded to dsh under its mount, not sent to /login`, async (t) => {
      const dsh = await manifestDsh()
      t.after(() => dsh.close())
      const app = manifestApp(dsh)
      const res = await app.fetch(new Request(`http://tracy.test${mount}/manifest.webmanifest`, { method }))
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('location'), null)
      assert.equal(res.headers.get('set-cookie'), null, 'no seat, no pointer is planted')
      assert.deepEqual(dsh.methods, [method])
      assert.equal(dsh.seen[0].url, `${mount}/manifest.webmanifest`)
      assert.equal(dsh.seen[0].prefix, mount)
      assert.equal(res.headers.get('content-type'), 'application/manifest+json')
      assert.equal(await res.text(), method === 'GET' ? '{"name":"Tracy"}' : '')
    })
  }

  test(`workspaceRoutes: a query on ${mount}/manifest.webmanifest is forwarded as it came`, async (t) => {
    const dsh = await manifestDsh()
    t.after(() => dsh.close())
    const app = manifestApp(dsh)
    const res = await app.fetch(new Request(`http://tracy.test${mount}/manifest.webmanifest?v=2`))
    assert.equal(res.status, 200)
    assert.equal(dsh.seen[0].url, `${mount}/manifest.webmanifest?v=2`)
  })

  // Every near miss stays behind the session check: suffixes, extra segments, an encoded name, a
  // doubled slash, a neighbour root file, and the manifest's name smuggled in through the query.
  for (const rest of [
    '/',
    '/manifest.webmanifest/x',
    '/manifest.webmanifest.js',
    '/manifest.webmanifest/',
    '/favicon.svg',
    '/manifest%2Ewebmanifest',
    '/manifest.webmanifest%2F',
    '//manifest.webmanifest',
    '/x/manifest.webmanifest',
    '/x?p=/manifest.webmanifest',
    '/s/abc?next=manifest.webmanifest'
  ]) {
    test(`workspaceRoutes: anonymous GET ${mount}${rest} is still sent to /login`, async (t) => {
      const dsh = await manifestDsh()
      t.after(() => dsh.close())
      const app = manifestApp(dsh)
      const url = new URL(`http://tracy.test${mount}${rest}`)
      const res = await app.fetch(new Request(url))
      assert.equal(res.status, 302)
      assert.equal(
        res.headers.get('location'),
        `/login?next=${encodeURIComponent(url.pathname + url.search)}`
      )
      assert.equal(dsh.seen.length, 0, 'nothing reached dsh')
    })
  }

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    test(`workspaceRoutes: anonymous ${method} ${mount}/manifest.webmanifest is still sent to /login`, async (t) => {
      const dsh = await manifestDsh()
      t.after(() => dsh.close())
      const app = manifestApp(dsh)
      const res = await app.fetch(
        new Request(`http://tracy.test${mount}/manifest.webmanifest`, {
          method,
          ...(method === 'GET' || method === 'OPTIONS' ? {} : { body: '{}' })
        })
      )
      assert.equal(res.status, 302)
      assert.equal(
        res.headers.get('location'),
        `/login?next=${encodeURIComponent(`${mount}/manifest.webmanifest`)}`
      )
      assert.equal(dsh.seen.length, 0, 'nothing reached dsh')
    })
  }

  test(`workspaceRoutes: an empty or forged session cookie changes nothing — ${mount}/manifest.webmanifest answers, ${mount}/ does not`, async (t) => {
    const dsh = await manifestDsh()
    t.after(() => dsh.close())
    const app = manifestApp(dsh)
    for (const cookie of ['tracy_sess=', 'tracy_sess=not-a-session', 'tracy_sess=a.b.c']) {
      const manifest = await app.fetch(
        new Request(`http://tracy.test${mount}/manifest.webmanifest`, { headers: { cookie } })
      )
      assert.equal(manifest.status, 200, cookie)
      const page = await app.fetch(new Request(`http://tracy.test${mount}/`, { headers: { cookie } }))
      assert.equal(page.status, 302, cookie)
      assert.match(page.headers.get('location'), /^\/login\?next=/)
    }
    assert.equal(dsh.seen.length, 3, 'only the three manifest requests reached dsh')
  })

  test(`workspaceRoutes: an error dsh answers for ${mount}/manifest.webmanifest is passed through, not dressed up`, async (t) => {
    const dsh = await manifestDsh((req, res) => {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('Not found')
    })
    t.after(() => dsh.close())
    const app = manifestApp(dsh)
    const res = await app.fetch(new Request(`http://tracy.test${mount}/manifest.webmanifest`))
    assert.equal(res.status, 404)
    assert.equal(res.headers.get('location'), null)
    assert.equal(await res.text(), 'Not found')
  })

  test(`workspaceRoutes: a dsh that is not answering ${mount}/manifest.webmanifest is the proxy's readable 502`, async () => {
    const app = manifestApp({ origin: 'http://127.0.0.1:1' })
    const res = await app.fetch(new Request(`http://tracy.test${mount}/manifest.webmanifest`))
    assert.equal(res.status, 502)
    assert.equal((await res.json()).code, 'WORKSPACE_UNREACHABLE')
  })
}

test('workspaceRoutes: an unknown site keeps its old answer for an anonymous manifest — /login, no host guessed', async (t) => {
  const dsh = await manifestDsh()
  t.after(() => dsh.close())
  const app = manifestApp(dsh, { sites: { hostOf: async () => null } })
  const res = await app.fetch(new Request('http://tracy.test/nosuch.localhost/manifest.webmanifest'))
  assert.equal(res.status, 302)
  assert.equal(
    res.headers.get('location'),
    `/login?next=${encodeURIComponent('/nosuch.localhost/manifest.webmanifest')}`
  )
  assert.equal(dsh.seen.length, 0)
})

test('workspaceRoutes: a site whose host has no dsh keeps its old answer for an anonymous manifest', async () => {
  const app = manifestApp({ origin: 'http://127.0.0.1:1' }, { sites: { dshOf: () => null } })
  for (const mount of MANIFEST_MOUNTS) {
    const res = await app.fetch(new Request(`http://tracy.test${mount}/manifest.webmanifest`))
    assert.equal(res.status, 302, mount)
    assert.match(res.headers.get('location'), /^\/login\?next=/)
  }
})

test('workspaceRoutes: /new with no default host keeps its old answer for an anonymous manifest', async (t) => {
  const dsh = await manifestDsh()
  t.after(() => dsh.close())
  const app = manifestApp(dsh, { config: { defaultHost: undefined } })
  const res = await app.fetch(new Request('http://tracy.test/new/manifest.webmanifest'))
  assert.equal(res.status, 302)
  assert.match(res.headers.get('location'), /^\/login\?next=/)
  assert.equal(dsh.seen.length, 0)
})

test('workspaceRoutes: an anonymous manifest for a site with prefix_aware=false is forwarded at the root', async (t) => {
  const dsh = await manifestDsh()
  t.after(() => dsh.close())
  const app = manifestApp(dsh, { sites: { prefixAwareOf: async () => false } })
  const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/manifest.webmanifest'))
  assert.equal(res.status, 200)
  assert.equal(dsh.seen[0].url, '/manifest.webmanifest')
})

test('workspaceRoutes: an anonymous manifest asks the canonical site key for its host', async (t) => {
  const dsh = await manifestDsh()
  t.after(() => dsh.close())
  const asked = []
  const app = manifestApp(dsh, {
    sites: {
      canonicalKey: async () => 'wpdemo.localhost',
      hostOf: async (key) => {
        asked.push(key)
        return key === 'wpdemo.localhost' ? 'local' : null
      }
    }
  })
  const res = await app.fetch(new Request('http://tracy.test/old-name.localhost/manifest.webmanifest'))
  assert.equal(res.status, 200)
  assert.deepEqual(asked, ['wpdemo.localhost'])
})

test('workspaceRoutes: a page under /<siteKey>/ is forwarded WITH its mount on the path, so dsh honours the prefix', async (t) => {
  const dsh = await prefixAwareDsh()
  t.after(() => dsh.close())
  const app = await siteApp(dsh)
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin: dsh.origin })}`
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/s/abc?tab=x', { headers: { cookie } })
  )
  assert.equal(res.status, 200)
  // The forwarded path still begins with the mount — the one condition `unmount` puts on the header.
  assert.equal(dsh.seen[0].url, '/wpdemo.localhost/s/abc?tab=x')
  assert.equal(dsh.seen[0].prefix, '/wpdemo.localhost')
})

test('workspaceRoutes: a site whose row says prefix_aware=false is forwarded at the root, as until today', async (t) => {
  const dsh = await prefixAwareDsh()
  t.after(() => dsh.close())
  const app = await siteApp(dsh, { prefixAwareOf: async () => false })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin: dsh.origin })}`
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/s/abc', { headers: { cookie } })
  )
  assert.equal(res.status, 200)
  assert.equal(dsh.seen[0].url, '/s/abc')
})

test('workspaceRoutes: a redirect dsh answers under a prefix already carries the mount and is NOT prefixed again', async (t) => {
  const dsh = await prefixAwareDsh((req, res) => {
    // What a prefix-aware dsh really sends back for `/wpdemo.localhost/x`: the mount is on it.
    res.writeHead(302, { location: `http://127.0.0.1:${req.socket.localPort}/wpdemo.localhost/next` })
    res.end()
  })
  t.after(() => dsh.close())
  const app = await siteApp(dsh)
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin: dsh.origin })}`
  const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/x', { headers: { cookie } }))
  assert.equal(res.status, 302)
  assert.equal(
    res.headers.get('location'),
    '/wpdemo.localhost/next',
    'not /wpdemo.localhost/wpdemo.localhost/next'
  )
})

// Links written before today — `/s/<id>` at the root, tied to a site only by the pointer cookie —
// sit in open tabs, history and messages. A NAVIGATION to one is sent to the address the site now
// has; a fetch from a page that is still on the old shape keeps being served at the root (that page
// has `<base href="/">` and asks for `/assets/…` — the test above this block covers it).
test('workspaceRoutes: an old root link with a tracy_site pointer is redirected to /<siteKey>/… on navigation only', async (t) => {
  const dsh = await prefixAwareDsh()
  t.after(() => dsh.close())
  const app = await siteApp(dsh)
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin: dsh.origin })}; ${SITE_COOKIE}=wpdemo.localhost`
  const nav = await app.fetch(
    new Request('http://tracy.test/s/abc?tab=x', { headers: { cookie, accept: 'text/html,*/*' } })
  )
  assert.equal(nav.status, 302)
  assert.equal(nav.headers.get('location'), '/wpdemo.localhost/s/abc?tab=x')
  const fetchLike = await app.fetch(
    new Request('http://tracy.test/api/x', { headers: { cookie, accept: 'application/json' } })
  )
  assert.equal(fetchLike.status, 200)
  assert.equal(dsh.seen[0].url, '/api/x')
  assert.equal(dsh.seen[0].prefix, undefined)
})

test('workspaceRoutes: a root asset path with a tracy_site cookie is proxied unchanged, with no x-forwarded-prefix', async (t) => {
  const seen = []
  const upstream = http.createServer((req, res) => {
    seen.push({ url: req.url, prefix: req.headers['x-forwarded-prefix'] })
    res.writeHead(200, { 'content-type': 'application/javascript' })
    res.end('asset')
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    pool: fakePool,
    seats: fakeSeats()
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin })}; ${SITE_COOKIE}=wpdemo.localhost`
  const res = await app.fetch(new Request('http://tracy.test/assets/index.js', { headers: { cookie } }))
  assert.equal(res.status, 200)
  assert.equal(seen[0].url, '/assets/index.js')
  assert.equal(seen[0].prefix, undefined)
  assert.equal(await res.text(), 'asset')
})

test('workspaceRoutes: a root asset path with no tracy_site cookie and no Referer gets the open-a-site 404', async () => {
  const app = workspaceRoutes({ config: routeConfig, sites: fakeSites() })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(new Request('http://tracy.test/assets/index.js', { headers: { cookie } }))
  assert.equal(res.status, 404)
})

// ── Task 9: the bare-root landing (spec §10 #11) ──────────────────────────────────────────────

test('workspaceRoutes: no session, no site, no guestSiteKey -> /login', async () => {
  const app = workspaceRoutes({ config: routeConfig, sites: fakeSites() })
  const res = await app.fetch(new Request('http://tracy.test/'))
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/login')
})

test('workspaceRoutes: no session, no site, guestSiteKey configured AND registered -> that site', async () => {
  const app = workspaceRoutes({
    config: { ...routeConfig, guestSiteKey: 'demo.tracy.ai' },
    sites: fakeSites()
  })
  const res = await app.fetch(new Request('http://tracy.test/'))
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/demo.tracy.ai/')
})

test('workspaceRoutes: a guestSiteKey naming a site this deployment does not have sends a stranger to /login, not to a door that says "Unknown site"', async () => {
  // Measured 14/09 on dev and local: `GUEST_SITE_KEY` was set so the public landing's brand door
  // had a guest seat to mint (a folder is all that door needs), but the SAME key is the landing
  // for strangers — and with no site row behind it, a new account signing in from `/` came out
  // at `/<label>/join?next=/tracy.test/` → "Unknown site". The key does two jobs; the landing
  // half only holds when the site is real.
  const app = workspaceRoutes({
    config: { ...routeConfig, guestSiteKey: 'tracy.test' },
    sites: fakeSites({ hostOf: async () => null })
  })
  const res = await app.fetch(new Request('http://tracy.test/'))
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/login')
})

test('workspaceRoutes: signed in, no site named, and no seats dependency wired -> the honest 404 (unchanged)', async () => {
  const app = workspaceRoutes({ config: routeConfig, sites: fakeSites() })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(new Request('http://tracy.test/', { headers: { cookie } }))
  assert.equal(res.status, 404)
})

test('workspaceRoutes: signed in with no sites, a NAVIGATION opens the creation workspace with Design inspiration in sight', async () => {
  // Until 13/09 this was a "no sites" page (measured 11/09 as the white `Open a site:` line before
  // that). Both stood between a signed-in person and the one thing they can do here — create a
  // site — so the root now opens their own creation workspace, Design inspiration tab first.
  const { noSitesPage } = await import('../src/bar/pages.js')
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites(),
    pool: fakePool,
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] },
    pages: { noSites: noSitesPage }
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(new Request('http://tracy.test/', { headers: { cookie, accept: 'text/html' } }))
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/new/')
})

test('workspaceRoutes: an UNANSWERED invitation opens the creation workspace on the Inbox (C1)', async () => {
  // `defaultSiteFor` counts only ACCEPTED seats, so somebody invited an hour ago arrives at this
  // branch looking exactly like a stranger. Since 04/10 (Akemi, C1) they go to the Inbox, where the
  // invitation is a card with Accept and Decline, instead of a page listing join links.
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites(),
    pool: fakePool,
    seats: {
      defaultSiteFor: async () => null,
      pendingInvitesFor: async () => [{ siteKey: 'wpdemo.localhost', label: 'wpdemo' }]
    }
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(new Request('http://tracy.test/', { headers: { cookie, accept: 'text/html' } }))
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/new/?tab=tracy:inbox')
})

test('workspaceRoutes: signed in with no sites, a FETCH gets a code, never the HTML', async () => {
  // The other half of the same rule: the dsh client's own `fetch` does not ask for html, and
  // handing it a page is handing it something it parses into rubbish.
  const { noSitesPage } = await import('../src/bar/pages.js')
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites(),
    pool: fakePool,
    seats: { defaultSiteFor: async () => null },
    pages: { noSites: noSitesPage }
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(
    new Request('http://tracy.test/api/whatever', { headers: { cookie, accept: 'application/json' } })
  )
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { code: 'NO_SITES' })
})

test('workspaceRoutes: a guest landing is for STRANGERS — a signed-in viewer with no sites gets their own workspace instead', async () => {
  // 11/09 sent a signed-in, site-less viewer to the guest site too (the Worker's
  // `landingSite = siteKey ?? env.GUEST_SITE_KEY`). Since 13/09 they have a workspace of their own
  // where a site can be created; the guest site is still where a stranger lands.
  const app = workspaceRoutes({
    config: { ...routeConfig, guestSiteKey: 'demo.tracy.ai' },
    sites: fakeSites(),
    pool: fakePool,
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] }
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(new Request('http://tracy.test/', { headers: { cookie, accept: 'text/html' } }))
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/new/')
  const stranger = await app.fetch(new Request('http://tracy.test/', { headers: { accept: 'text/html' } }))
  assert.equal(stranger.headers.get('location'), '/demo.tracy.ai/')
})

test(
  'workspaceRoutes: signed in, no site named, an accepted seat on record -> redirected to that site',
  dbOpts,
  async () => {
    const { pool } = db
    const { accountByEmail, defaultSiteFor } = await import('../src/seats/store.js')
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
    const app = workspaceRoutes({
      config: routeConfig,
      sites: fakeSites(),
      pool,
      seats: { defaultSiteFor }
    })
    const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
    const res = await app.fetch(new Request('http://tracy.test/', { headers: { cookie } }))
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/wpdemo.localhost/')

    // The SAME branch answers a plugin's root-absolute door, and there the path is the whole
    // point. dsh is served with `<base href="/">`, so a plugin client builds
    // `/api/tracy-design-inspiration/catalog` on purpose and the site is recovered from the
    // Referer or the `tracy_site` pointer; with neither, this branch used to redirect to
    // `/<landing>/` and throw the API path away. `fetch` follows, gets the workspace's HTML,
    // and the plugin renders a generic "couldn't load" with nothing naming a cause — measured
    // 10/09 in a browser, and it cost a test agent most of an item to chase.
    const door = await app.fetch(
      new Request('http://tracy.test/api/tracy-design-inspiration/catalog?x=1', {
        headers: { cookie }
      })
    )
    assert.equal(door.status, 302)
    assert.equal(door.headers.get('location'), '/wpdemo.localhost/api/tracy-design-inspiration/catalog?x=1')

    // Sanity: accountByEmail agrees on who this is.
    assert.equal((await accountByEmail(pool, 'ceo@tracy.ai')).id, acct.id)
  }
)

test(
  'workspaceRoutes: signed in, only a pending (not accepted) seat -> no default, the honest 404',
  dbOpts,
  async () => {
    const { pool } = db
    const { defaultSiteFor } = await import('../src/seats/store.js')
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
    const app = workspaceRoutes({
      config: routeConfig,
      sites: fakeSites(),
      pool,
      seats: { defaultSiteFor }
    })
    const cookie = `tracy_sess=${await mintSession('pending@tracy.test', routeSessionSecret)}`
    const res = await app.fetch(new Request('http://tracy.test/', { headers: { cookie } }))
    assert.equal(res.status, 404)
  }
)

test('workspaceRoutes: a same-origin Referer naming a site resolves it with no tracy_site cookie needed', async (t) => {
  const seen = []
  const upstream = http.createServer((req, res) => {
    seen.push({ url: req.url, prefix: req.headers['x-forwarded-prefix'] })
    res.writeHead(200)
    res.end('asset')
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    pool: fakePool,
    seats: fakeSeats()
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin })}`
  const res = await app.fetch(
    new Request('http://tracy.test/assets/index.js', {
      headers: { cookie, referer: 'http://tracy.test/wpdemo.localhost/' }
    })
  )
  assert.equal(res.status, 200)
  assert.equal(seen[0].url, '/assets/index.js')
  assert.equal(seen[0].prefix, undefined)
})

test('workspaceRoutes: a cross-origin Referer is ignored', async () => {
  const app = workspaceRoutes({ config: routeConfig, sites: fakeSites() })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(
    new Request('http://tracy.test/assets/index.js', {
      headers: { cookie, referer: 'http://evil.example/wpdemo.localhost/' }
    })
  )
  assert.equal(res.status, 404)
})

test('workspaceRoutes: a request naming a site by path plants tracy_site once the seat is minted', async () => {
  let grantSeen = null
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites(),
    pool: fakePool,
    seats: fakeSeats('admin'),
    seatDoor: {
      mintSeatSession: async ({ grant }) => {
        grantSeen = grant
        return 'tok'
      }
    }
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie } }))
  assert.equal(res.status, 302)
  const setCookies = res.headers.getSetCookie()
  // The value is `<fingerprint>~<token>`: the fingerprint is what a later request compares
  // against the grant then in force, the token is what dsh sees.
  assert.ok(
    setCookies.some((c) => /^tracy_tok_.*=[0-9a-f]{24}~tok;/.test(c)),
    'seat token cookie missing'
  )
  assert.ok(
    setCookies.includes(`${SITE_COOKIE}=wpdemo.localhost; Path=/; SameSite=Lax; Max-Age=2592000`),
    'tracy_site cookie missing or malformed'
  )
  // The bug this whole file is here to catch: the grant used to hardcode `role: 'owner'` no
  // matter what the seat book said. It must now carry the seat's REAL role.
  assert.equal(grantSeen.role, 'admin')
})

// ── Plan 2: the seat book actually gates the grant now — measured in a browser as the defect this
// task exists to fix (`workspace/route.js:142` used to mint `owner` for ANY signed-in email,
// never asking the seat book at all: a revoked teammate kept the whole workspace, and a stranger
// who had never been invited got full owner access on first visit). Every test below fails
// against the pre-fix code, which called `seatDoor.mintSeatSession` with the literal `role:
// 'owner'` unconditionally and never redirected anyone away for lack of a seat. ──────────────────

async function seatFixture(
  pool,
  { email, role = 'owner', accepted = true, revoked = false, requested = false }
) {
  await pool.query(
    "insert into site (site_key, label, host) values ('wpdemo.localhost', 'wpdemo-1', 'local') on conflict (site_key) do nothing"
  )
  const acct = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0]
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at, requested_at, revoked_at)
     values ('wpdemo.localhost', $1, $2, $1, $3, $4, $5)`,
    [acct.id, role, accepted ? new Date() : null, requested ? new Date() : null, revoked ? new Date() : null]
  )
  return acct
}

test(
  'workspaceRoutes: a viewer with an accepted seat gets a session carrying THEIR OWN role, not the hardcoded owner',
  dbOpts,
  async () => {
    const { pool } = db
    const { accountByEmail, grantFor } = await import('../src/seats/store.js')
    await seatFixture(pool, { email: 'editor@tracy.test', role: 'editor' })
    let grantSeen = null
    const app = workspaceRoutes({
      config: routeConfig,
      sites: fakeSites(),
      pool,
      seats: { accountByEmail, grantFor },
      seatDoor: {
        mintSeatSession: async ({ grant }) => {
          grantSeen = grant
          return 'tok'
        }
      }
    })
    const cookie = `tracy_sess=${await mintSession('editor@tracy.test', routeSessionSecret)}`
    const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie } }))
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/wpdemo.localhost/')
    assert.ok(grantSeen, 'mintSeatSession was never called for a viewer with a live seat')
    assert.equal(grantSeen.role, 'editor')
    assert.notEqual(grantSeen.role, 'owner')
  }
)

test(
  'workspaceRoutes: a REVOKED seat is refused — no session minted, redirected to the join door instead',
  dbOpts,
  async () => {
    const { pool } = db
    const { accountByEmail, grantFor } = await import('../src/seats/store.js')
    await seatFixture(pool, { email: 'revoked@tracy.test', role: 'owner', accepted: true, revoked: true })
    let minted = false
    const app = workspaceRoutes({
      config: routeConfig,
      sites: fakeSites(),
      pool,
      seats: { accountByEmail, grantFor },
      seatDoor: {
        mintSeatSession: async () => {
          minted = true
          return 'tok'
        }
      }
    })
    const cookie = `tracy_sess=${await mintSession('revoked@tracy.test', routeSessionSecret)}`
    const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie } }))
    assert.equal(minted, false, 'a revoked seat must never mint a session')
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/wpdemo.localhost/join?next=%2Fwpdemo.localhost%2F')
    assert.equal(res.headers.get('set-cookie'), null)
  }
)

test(
  'workspaceRoutes: a PENDING (invited, not yet accepted) seat is refused the same way',
  dbOpts,
  async () => {
    const { pool } = db
    const { accountByEmail, grantFor } = await import('../src/seats/store.js')
    await seatFixture(pool, { email: 'pending@tracy.test', role: 'editor', accepted: false, requested: true })
    let minted = false
    const app = workspaceRoutes({
      config: routeConfig,
      sites: fakeSites(),
      pool,
      seats: { accountByEmail, grantFor },
      seatDoor: {
        mintSeatSession: async () => {
          minted = true
          return 'tok'
        }
      }
    })
    const cookie = `tracy_sess=${await mintSession('pending@tracy.test', routeSessionSecret)}`
    const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie } }))
    assert.equal(minted, false, 'an unaccepted invite must never mint a session')
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/wpdemo.localhost/join?next=%2Fwpdemo.localhost%2F')
  }
)

test(
  'workspaceRoutes: a signed-in viewer with NO seat row at all (never invited) is refused, not made owner',
  dbOpts,
  async () => {
    const { pool } = db
    const { accountByEmail, grantFor } = await import('../src/seats/store.js')
    await pool.query(
      "insert into site (site_key, label, host) values ('wpdemo.localhost', 'wpdemo-1', 'local')"
    )
    // A stranger: a valid session cookie (they really did sign in to Tracy) but no account row,
    // no seat row, nothing that ever named them alongside this site.
    let minted = false
    const app = workspaceRoutes({
      config: routeConfig,
      sites: fakeSites(),
      pool,
      seats: { accountByEmail, grantFor },
      seatDoor: {
        mintSeatSession: async () => {
          minted = true
          return 'tok'
        }
      }
    })
    const cookie = `tracy_sess=${await mintSession('stranger@tracy.test', routeSessionSecret)}`
    const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie } }))
    assert.equal(minted, false, 'a never-invited stranger must never mint a session')
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/wpdemo.localhost/join?next=%2Fwpdemo.localhost%2F')
    assert.equal(res.headers.get('set-cookie'), null)
  }
)

test('workspaceRoutes: no pool/seats wired at all — fails CLOSED, never falls back to owner', async () => {
  let minted = false
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites(),
    // pool/seats both default to null — the exact shape a caller that forgot to wire them hands in.
    seatDoor: {
      mintSeatSession: async () => {
        minted = true
        return 'tok'
      }
    }
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie } }))
  assert.equal(minted, false, 'missing pool/seats must refuse, never grant owner by default')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/wpdemo.localhost/join?next=%2Fwpdemo.localhost%2F')
})

test('workspaceRoutes: the seat lookup throwing refuses rather than granting', async () => {
  let minted = false
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites(),
    pool: fakePool,
    seats: {
      accountByEmail: async () => {
        throw new Error('connection reset')
      },
      grantFor: async () => ({ role: 'owner' })
    },
    seatDoor: {
      mintSeatSession: async () => {
        minted = true
        return 'tok'
      }
    }
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie } }))
  assert.equal(minted, false, 'a thrown lookup must refuse, never grant owner')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/wpdemo.localhost/join?next=%2Fwpdemo.localhost%2F')
})

test("workspaceRoutes cannot shadow Tracy's own doors: /auth/me still answers with tracy_site set", async () => {
  const app = buildApp({
    config: routeConfig,
    identity: memoryIdentityStore(),
    mail: { send: async () => {} },
    sites: fakeSites({
      dshOf: () => {
        throw new Error('workspaceRoutes must not be reached for /auth/me')
      }
    })
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${SITE_COOKIE}=wpdemo.localhost`
  const res = await app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie } }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { email: 'ceo@tracy.ai', defaultSite: null, face: null, name: null })
})

test("workspaceRoutes cannot shadow seatsRoutes' doors either: /api/sites answers 401 without ever touching the pool or a dsh", async () => {
  const app = buildApp({
    config: { ...routeConfig, siteDomain: 'tracy.test', origin: 'http://tracy.test' },
    identity: memoryIdentityStore(),
    mail: { send: async () => {} },
    pool: {
      query: () => {
        throw new Error('seatsRoutes must answer an unauthenticated /api/sites before touching Postgres')
      }
    },
    sites: fakeSites({
      dshOf: () => {
        throw new Error('workspaceRoutes must not be reached for /api/sites')
      }
    })
  })
  const res = await app.fetch(new Request('http://tracy.test/api/sites'))
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { code: 'NOT_SIGNED_IN' })
})

test('forwardHttp: prefix header, cookies rewritten, redirects relativised, set-cookie relabelled', async (t) => {
  const seen = []
  const upstream = http
    .createServer((req, res) => {
      seen.push({ url: req.url, prefix: req.headers['x-forwarded-prefix'], cookie: req.headers.cookie })
      res.writeHead(302, {
        location: 'http://127.0.0.1:' + upstream.address().port + '/next',
        'set-cookie': 'dsh_gateway_token=NEW; Path=/'
      })
      res.end()
    })
    .listen(0, '127.0.0.1')
  await new Promise((r) => upstream.once('listening', r))
  t.after(() => upstream.close())
  const target = new URL(`http://127.0.0.1:${upstream.address().port}/agent/x`)
  const res = await forwardHttp(
    new Request('http://tracy.test/wpdemo.localhost/agent/x', { headers: { cookie: 'tracy_sess=a; k=v' } }),
    target,
    { mount: '/wpdemo.localhost', seatToken: 'T', seatCookieName: 'tracy_tok_h__s', viewerHost: 'tracy.test' }
  )
  assert.equal(seen[0].url, '/agent/x')
  assert.equal(seen[0].prefix, '/wpdemo.localhost')
  assert.equal(seen[0].cookie, 'k=v; dsh_gateway_token=T')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/wpdemo.localhost/next')
  assert.deepEqual(res.headers.getSetCookie(), ['tracy_tok_h__s=NEW; Path=/'])
})

// 🔒 THE VIEWER'S IDENTITY HAS TO CROSS THIS HOP AS A HEADER, and the cookie cannot carry it.
// `outgoingCookieHeader` drops every `tracy_*` cookie before dsh sees the request — deliberately,
// dsh has no business reading Tracy's session — but a plugin's host half INSIDE that dsh calls
// back here as the viewer (`packages/site/tracy-add-site/src/host/index.ts:78` refuses with
// NOT_SIGNED_IN when it has neither cookie nor origin). The Worker this proxy replaced stated it
// outright (`workers/cowork-web/src/worker.js:249-251`); without it every import dies at its first
// call, after the person already typed their site's admin password.
test('forwardHttp: the viewer session crosses to dsh as x-tracy-session', async (t) => {
  const seen = []
  const upstream = http.createServer((req, res) => {
    seen.push(req.headers['x-tracy-session'])
    res.writeHead(200)
    res.end()
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const target = new URL(`http://127.0.0.1:${upstream.address().port}/api/tracy-add-site/start`)
  await forwardHttp(
    new Request('http://tracy.test/wpdemo.localhost/api/tracy-add-site/start', {
      headers: { cookie: 'tracy_sess=THE_SESSION; k=v' }
    }),
    target,
    { mount: '/wpdemo.localhost', seatToken: 'T', seatCookieName: 'x', viewerHost: 'tracy.test' }
  )
  assert.equal(seen[0], 'THE_SESSION')
})

// ⚠ ALWAYS SET, NEVER MERGED — the same rule the Worker wrote down. Anything reachable through
// this proxy can put this header on its own request, and the host half sends the viewer's session
// wherever it is told; a forged one is a session belonging to nobody.
test('forwardHttp: a client cannot forge x-tracy-session', async (t) => {
  const seen = []
  const upstream = http.createServer((req, res) => {
    seen.push(req.headers['x-tracy-session'] ?? null)
    res.writeHead(200)
    res.end()
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const target = new URL(`http://127.0.0.1:${upstream.address().port}/api/tracy-add-site/start`)
  await forwardHttp(
    new Request('http://tracy.test/wpdemo.localhost/api/tracy-add-site/start', {
      headers: { 'x-tracy-session': 'FORGED', cookie: 'k=v' }
    }),
    target,
    { mount: '/wpdemo.localhost', seatToken: 'T', seatCookieName: 'x', viewerHost: 'tracy.test' }
  )
  assert.equal(seen[0], null)
})

test('forwardHttp: a gzipped upstream body is already decoded by fetch, so the encoding/length framing must not survive the copy', async (t) => {
  const original = 'Hello from a gzip response, decoded before it ever reaches forwardHttp.'
  const compressed = zlib.gzipSync(original)
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, {
      'content-type': 'text/plain',
      'content-encoding': 'gzip',
      'content-length': String(compressed.length)
    })
    res.end(compressed)
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const target = new URL(`http://127.0.0.1:${upstream.address().port}/agent/x`)
  const res = await forwardHttp(new Request('http://tracy.test/wpdemo.localhost/agent/x'), target, {
    mount: '/wpdemo.localhost',
    seatToken: null,
    seatCookieName: 'x',
    viewerHost: 'tracy.test'
  })
  // fetch already decoded the body — the header framing describing the WIRE bytes (compressed
  // encoding, compressed length) must not be forwarded alongside the now-decoded body, or the
  // browser tries to gunzip plain text and fails the whole request.
  assert.equal(res.headers.get('content-encoding'), null)
  assert.equal(res.headers.get('content-length'), null)
  assert.equal(await res.text(), original)
})

test('forwardHttp: an identity (uncompressed) upstream response still forwards its body untouched', async (t) => {
  const original = 'plain body, no compression involved'
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, {
      'content-type': 'text/plain',
      'content-length': String(Buffer.byteLength(original))
    })
    res.end(original)
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const target = new URL(`http://127.0.0.1:${upstream.address().port}/agent/x`)
  const res = await forwardHttp(new Request('http://tracy.test/wpdemo.localhost/agent/x'), target, {
    mount: '/wpdemo.localhost',
    seatToken: null,
    seatCookieName: 'x',
    viewerHost: 'tracy.test'
  })
  assert.equal(res.headers.get('content-encoding'), null)
  assert.equal(await res.text(), original)
})

test('forwardHttp: hop-by-hop headers coming back from dsh describe the upstream connection, not ours, and must not survive', async (t) => {
  const upstream = http.createServer((req, res) => {
    // fetch() does not strip these on the way in — measured directly: connection/keep-alive
    // pass straight through `upstream.headers` untouched, since they're ordinary response
    // headers as far as the Fetch spec is concerned, not something fetch() itself interprets.
    res.writeHead(200, {
      'content-type': 'text/plain',
      connection: 'keep-alive',
      'keep-alive': 'timeout=5',
      'proxy-connection': 'keep-alive',
      te: 'trailers',
      trailer: 'x-checksum',
      upgrade: 'h2c'
    })
    res.end('hi')
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const target = new URL(`http://127.0.0.1:${upstream.address().port}/agent/x`)
  const res = await forwardHttp(new Request('http://tracy.test/wpdemo.localhost/agent/x'), target, {
    mount: '/wpdemo.localhost',
    seatToken: null,
    seatCookieName: 'x',
    viewerHost: 'tracy.test'
  })
  for (const h of ['connection', 'keep-alive', 'proxy-connection', 'te', 'trailer', 'upgrade']) {
    assert.equal(res.headers.get(h), null, `${h} must not survive`)
  }
  assert.equal(await res.text(), 'hi')
})

test('forwardHttp: a dsh that is not answering is a readable 502, not an uncaught fetch failure', async () => {
  // Measured 11/09 on the dev machine: `build-dsh-image.yml` redeploys dsh routinely (its
  // `start_period` alone is 180s), and for that whole window every door through this proxy died
  // with an uncaught `TypeError: fetch failed` whose stack named an IP and a port and nothing
  // else. The person saw a dialog that simply did nothing; the log did not say which dialog.
  const dead = new URL('http://127.0.0.1:1/agent/x') // port 1: nothing listens, connection refused
  const res = await forwardHttp(new Request('http://tracy.test/wpdemo.localhost/agent/x'), dead, {
    mount: '/wpdemo.localhost',
    seatToken: null,
    seatCookieName: 'x',
    viewerHost: 'tracy.test'
  })
  assert.equal(res.status, 502)
  const body = await res.json()
  assert.equal(body.code, 'WORKSPACE_UNREACHABLE')
  assert.ok(body.reason, 'the reason the connection failed is carried, not swallowed')
})

test('forwardHttp: aborting the incoming request aborts the outbound fetch, not just the local promise', async (t) => {
  let sawAbort
  let sawRequest
  const sawAbortP = new Promise((resolve) => {
    sawAbort = resolve
  })
  const sawRequestP = new Promise((resolve) => {
    sawRequest = resolve
  })
  const upstream = http.createServer((req, res) => {
    // Deliberately never call res.end() — the only way this connection ever closes is the
    // client (tracy-web's outbound fetch) tearing it down, which is exactly what a wired
    // AbortSignal should do.
    req.on('aborted', () => sawAbort('aborted'))
    res.on('close', () => sawAbort('closed'))
    sawRequest()
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const target = new URL(`http://127.0.0.1:${upstream.address().port}/agent/x`)
  const controller = new AbortController()
  const request = new Request('http://tracy.test/wpdemo.localhost/agent/x', {
    signal: controller.signal
  })
  const outcome = forwardHttp(request, target, {
    mount: '/wpdemo.localhost',
    seatToken: null,
    seatCookieName: 'x',
    viewerHost: 'tracy.test'
  })
  const rejected = assert.rejects(outcome)
  // A fixed sleep can abort before the upstream callback runs when the event loop is under load.
  const bounded = (promise, message) => {
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 2000)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
  }
  try {
    await bounded(sawRequestP, 'upstream never received the request')
    controller.abort()
    const which = await bounded(sawAbortP, 'upstream never saw the abort')
    assert.ok(which === 'aborted' || which === 'closed')
    await rejected
  } finally {
    if (!controller.signal.aborted) controller.abort()
    upstream.closeAllConnections?.()
    await new Promise((resolve) => upstream.close(resolve))
  }
})

// --- forwardUpgrade: the handshake dsh actually receives ---

test('forwardUpgrade: the handshake names the viewer host and carries no browser Origin', async (t) => {
  // The gateway refuses any upgrade whose `Origin` disagrees with the host it believes it serves,
  // and that check runs before it reads a seat or a role. It reads `x-forwarded-host` only from a
  // loopback peer, which a gateway inside a container never sees us as. Sending the browser's
  // `Origin` untouched therefore refused EVERY socket with 403, the client treated its first
  // stream as the whole connection's lifeline, and the workspace looped on "Loading
  // workspaces..." — with a green test suite the whole time, because no test spoke to the real
  // gateway. Assert the shape of the bytes we write, which is the part that was wrong.
  const upstream = http.createServer()
  t.after(() => new Promise((r) => upstream.close(r)))
  const seen = await new Promise((resolve, reject) => {
    upstream.on('upgrade', (req, socket) => {
      socket.destroy()
      resolve(req.headers)
    })
    upstream.on('error', reject)
    upstream.listen(0, '127.0.0.1', () => {
      const target = new URL(`http://127.0.0.1:${upstream.address().port}/api/remote.mux`)
      const req = {
        method: 'GET',
        headers: {
          host: 'localhost:8080',
          origin: 'http://localhost:8080',
          referer: 'http://localhost:8080/wpdemo.localhost/',
          cookie: 'tracy_sess=abc; tracy_tok_x=t0k',
          upgrade: 'websocket',
          connection: 'Upgrade'
        }
      }
      const client = new PassThrough()
      forwardUpgrade(req, client, Buffer.alloc(0), target, {
        seatToken: 't0k',
        mount: '/wpdemo.localhost',
        viewerHost: 'localhost:8080'
      })
    })
  })
  assert.equal(seen['x-forwarded-host'], 'localhost:8080')
  assert.equal(seen.origin, undefined)
  assert.equal(seen.referer, undefined)
  assert.equal(seen['x-forwarded-prefix'], '/wpdemo.localhost')
  assert.equal(seen.cookie, 'dsh_gateway_token=t0k')
})

// --- forwardUpgrade: the upstream socket must not outlive the client, in either direction ---
//
// Two complementary styles here, not belt-and-suspenders for its own sake:
//
// - The mock-based tests below give deterministic, unambiguous control over exactly when
//   net.connect's callback fires relative to the client leaving — the "before the callback ever
//   runs" window is a genuine race with real sockets (measured: on loopback, net.connect's own
//   TCP handshake routinely completes and fires forwardUpgrade's callback, attaching `.pipe()`,
//   *before* a same-tick `clientSocket.destroy()`'s effects even reach the peer — so a real-socket
//   test of that specific window is not reliably reproducible, only occasionally so).
// - The real-socket integration test after them proves the fix holds under actual TCP/half-open
//   semantics, not just against a hand-rolled stand-in for a socket.
//
// Both check something directly attributable to OUR side, not the far end's cooperation: whether
// a real dsh's own accepted connection ever reaches 'close' depends on dsh choosing to end its
// own writable half once it sees ours end — genuinely realistic (and not implausible) dsh
// behavior is to keep a still-open connection alive from its own side, so asserting *dsh's*
// connection count hits zero would pass only for a dsh that happens to reciprocate, and could
// pass even with NO fix at all here (`.pipe()`'s own pre-existing auto-end cascades through a
// cooperating remote regardless of whether `forwardUpgrade` ever destroys anything itself —
// confirmed by reproducing exactly that false-pass against the pre-fix code during this work).
// `.destroyed` on the socket the test itself holds a reference to has no such ambiguity.

function fakeSocket() {
  const socket = new EventEmitter()
  socket.destroyed = false
  socket.destroy = () => {
    if (socket.destroyed) return
    socket.destroyed = true
    socket.emit('close')
  }
  socket.pipe = () => socket
  socket.write = () => true
  return socket
}

test("forwardUpgrade: a client that disconnects before net.connect's own callback fires still destroys the upstream, and the late callback is a no-op", (t) => {
  const clientSocket = fakeSocket()
  const upstreamSocket = fakeSocket()
  let connectCallback = null
  t.mock.method(net, 'connect', (_port, _host, cb) => {
    connectCallback = cb
    return upstreamSocket
  })

  forwardUpgrade(
    { headers: {}, method: 'GET' },
    clientSocket,
    Buffer.alloc(0),
    new URL('http://127.0.0.1:1/agent'),
    { seatToken: null, mount: '' }
  )
  assert.equal(typeof connectCallback, 'function')
  // The client leaves before net.connect's callback has run at all — no pipe was ever attached.
  clientSocket.destroy()
  assert.equal(upstreamSocket.destroyed, true)

  // A connection that was already in flight when the client left can still complete a moment
  // later; firing that stale callback against an already-destroyed upstream must not throw.
  assert.doesNotThrow(() => connectCallback())
})

test('forwardUpgrade: a client that disconnects mid-session destroys the upstream', async (t) => {
  const clientSocket = fakeSocket()
  const upstreamSocket = fakeSocket()
  t.mock.method(net, 'connect', (_port, _host, cb) => {
    // Real net.connect never calls back synchronously — its own `const upstream =` assignment
    // hasn't finished by the time this closure would run, so a synchronous callback here would
    // test an impossible ordering (and, tried once, threw a TDZ ReferenceError on `upstream`
    // inside forwardUpgrade for exactly that reason).
    queueMicrotask(cb)
    return upstreamSocket
  })

  forwardUpgrade(
    { headers: {}, method: 'GET' },
    clientSocket,
    Buffer.alloc(0),
    new URL('http://127.0.0.1:1/agent'),
    { seatToken: null, mount: '' }
  )
  await Promise.resolve() // let the queued connect callback run — the splice is now piped
  assert.equal(upstreamSocket.destroyed, false)
  clientSocket.destroy()
  assert.equal(upstreamSocket.destroyed, true)
})

test('forwardUpgrade: the upstream closing destroys the client socket too', async (t) => {
  const clientSocket = fakeSocket()
  const upstreamSocket = fakeSocket()
  t.mock.method(net, 'connect', (_port, _host, cb) => {
    queueMicrotask(cb)
    return upstreamSocket
  })

  forwardUpgrade(
    { headers: {}, method: 'GET' },
    clientSocket,
    Buffer.alloc(0),
    new URL('http://127.0.0.1:1/agent'),
    { seatToken: null, mount: '' }
  )
  await Promise.resolve()
  assert.equal(clientSocket.destroyed, false)
  upstreamSocket.destroy()
  assert.equal(clientSocket.destroyed, true)
})

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

async function until(check, { timeoutMs = 2000, intervalMs = 10 } = {}) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for the condition')
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

test('forwardUpgrade (real sockets): a client that disconnects mid-session gets its own hijacked socket destroyed, even against a dsh that never reciprocates', async (t) => {
  // `allowHalfOpen: true` on BOTH ends matters: `http.Server`'s own underlying `net.Server` sets
  // it (see lib/_http_server.js) for real hijacked upgrade sockets, and a real dsh is a server we
  // don't control — it may or may not choose to end its own side back. Neither default
  // (`false`, which auto-closes on the peer's FIN) may paper over this test.
  const dsh = net.createServer({ allowHalfOpen: true }, (socket) => socket.resume())
  const dshPort = await listen(dsh)
  t.after(() => dsh.close())
  const browser = net.createServer({ allowHalfOpen: true })
  const browserPort = await listen(browser)
  t.after(() => browser.close())

  const serverSocketP = new Promise((resolve) => browser.once('connection', resolve))
  const clientSocket = net.connect(browserPort, '127.0.0.1')
  const serverSocket = await serverSocketP

  forwardUpgrade(
    { headers: {}, method: 'GET' },
    serverSocket,
    Buffer.alloc(0),
    new URL(`http://127.0.0.1:${dshPort}/agent`),
    { seatToken: null, mount: '' }
  )
  // Give the splice a moment to actually connect and pipe before pulling the rug.
  await new Promise((r) => setTimeout(r, 50))
  clientSocket.destroy()

  await until(() => serverSocket.destroyed)
})

// --- End-to-end with a fake upstream dsh, standing in for Step 5's real-browser smoke test ---
// (deferred: no local dsh cluster running on this machine — see task-8-report.md).

function fakeDsh() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`path=${req.url} cookie=${req.headers.cookie ?? ''}`)
  })
  // Every hijacked socket, not just the newest: a test that upgrades twice would otherwise leave
  // the first one open and `close()` would never resolve.
  server.upgradeSockets = []
  // Once a connection is hijacked by an `upgrade` handler, the http.Server stops tracking it —
  // closeAllConnections()/close() never sees it again on either side of the splice. Keep our own
  // handle so `after` can destroy it directly instead of waiting on bookkeeping that will never fire.
  const sockets = new WebSocketServer({ noServer: true, perMessageDeflate: false })
  server.on('upgrade', (req, socket, head) => {
    server.lastUpgradeSocket = socket
    server.upgradeSockets.push(socket)
    sockets.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', (data, binary) => ws.send(data, { binary }))
    })
  })
  return server
}

function encodeFrame(text) {
  const payload = Buffer.from(text)
  const mask = Buffer.from([1, 2, 3, 4])
  const masked = Buffer.alloc(payload.length)
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4]
  return Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked])
}

test(
  'end-to-end: HTTP mints a seat cookie then forwards it, a WebSocket upgrade splices through',
  dbOpts,
  async (t) => {
    const upstream = fakeDsh()
    await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
    t.after(() => upstream.close())
    const upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`

    // Plan 2: `hostOf` now reads the `site` table (`sites/resolver.js`'s `dbSitesResolver`), so
    // this end-to-end run needs a real pool with a row for the site it opens — Plan 1's `DATABASE_URL:
    // ''` (an in-memory identity store, and the old `hostsResolver` always answering
    // `config.defaultHost` with no book to read) no longer carries this test.
    const { pool, url: dbUrlForApp } = db
    await pool.query(
      "insert into site (site_key, label, host) values ('wpdemo.localhost', 'wpdemo', 'local')"
    )
    // Plan 2: `workspaceRoutes` now consults the seat book before minting anything (the bug this
    // whole task exists to fix) — an end-to-end run needs a real, live, accepted seat for the
    // viewer it signs in as, or it never gets past the new "no live seat" redirect.
    const e2eAccount = (
      await pool.query(
        "insert into account (email) values ('ceo@tracy.ai') on conflict (email) do update set email = excluded.email returning id"
      )
    ).rows[0]
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('wpdemo.localhost', $1, 'owner', $1, now())`,
      [e2eAccount.id]
    )

    const sessionSecret = 's'.repeat(32)
    const env = {
      TRACY_ORIGIN: 'http://tracy.test',
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: sessionSecret,
      // the SAME scratch schema the row above went into, not the bare database
      DATABASE_URL: dbUrlForApp,
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://127.0.0.1:1',
      HOST_local_DSH_ORIGIN: upstreamOrigin,
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k',
      PORT: '0'
    }
    const seatDoor = { mintSeatSession: async () => 't0k' }
    const { port, close } = await start({ env, log: { log: () => {}, warn: () => {} }, deps: { seatDoor } })
    let wsSocket = null
    let rootWsSocket = null
    t.after(async () => {
      // Both ends of the hijacked WebSocket connection need an explicit destroy — see the note on
      // `fakeDsh` above.
      wsSocket?.destroy()
      rootWsSocket?.destroy()
      for (const s of upstream.upgradeSockets ?? []) s.destroy()
      upstream.lastUpgradeSocket?.destroy()
      await close()
    })

    const sessionToken = await mintSession('ceo@tracy.ai', sessionSecret)
    const sessCookie = `tracy_sess=${sessionToken}`

    const get = (path, cookie) =>
      new Promise((resolve, reject) => {
        http
          .get({ host: '127.0.0.1', port, path, headers: cookie ? { cookie } : {} }, (res) => {
            const chunks = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () =>
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString()
              })
            )
          })
          .on('error', reject)
      })

    // 1) First GET: no seat cookie yet — the door mints one and redirects back to the same path.
    const first = await get('/wpdemo.localhost/', sessCookie)
    assert.equal(first.status, 302)
    assert.equal(first.headers.location, '/wpdemo.localhost/')
    const setCookie = Array.isArray(first.headers['set-cookie'])
      ? first.headers['set-cookie'][0]
      : first.headers['set-cookie']
    // `<fingerprint>~<token>` — the fingerprint is the route's, the token the door's.
    assert.match(setCookie, /^tracy_tok_.*=[0-9a-f]{24}~t0k;/)
    const seatCookiePair = setCookie.split(';')[0]

    // 2) Second GET with both cookies: the request reaches the fake upstream carrying only the
    // seat token as dsh_gateway_token — no tracy_ cookie of any kind.
    const second = await get('/wpdemo.localhost/', `${sessCookie}; ${seatCookiePair}`)
    assert.equal(second.status, 200)
    assert.match(second.body, /^path=\//)
    assert.match(second.body, /cookie=dsh_gateway_token=t0k$/)
    assert.doesNotMatch(second.body, /tracy_/)
    // The reply carries the `tracy_site` pointer and nothing else: it is re-planted on every
    // request that names a site and passes the seat check, so a viewer whose seat outlives the
    // pointer still gets one back. Without it, a root path — and a WebSocket handshake in
    // particular, which carries no Referer — has no way to say which site it belongs to.
    assert.deepEqual(second.headers['set-cookie'], [
      `${SITE_COOKIE}=wpdemo.localhost; Path=/; SameSite=Lax; Max-Age=2592000`
    ])

    // 3) A raw WebSocket upgrade with the same cookies splices through to the fake upstream and
    // gets its handshake and echoed frame back.
    const ws = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: '/wpdemo.localhost/agent',
        headers: {
          cookie: `${sessCookie}; ${seatCookiePair}`,
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64')
        }
      })
      req.on('upgrade', (res, socket, head) => resolve({ status: res.statusCode, socket, head }))
      req.on('error', reject)
      req.end()
    })
    wsSocket = ws.socket
    assert.equal(ws.status, 101)
    const payload = JSON.stringify({ type: 'hello' })
    const sentFrame = encodeFrame(payload)
    const echoed = await new Promise((resolve) => {
      ws.socket.once('data', resolve)
      ws.socket.write(sentFrame)
    })
    // Server frames are unmasked; the JSON message survives both directions of the relay.
    assert.deepEqual(
      echoed,
      Buffer.concat([Buffer.from([0x81, Buffer.byteLength(payload)]), Buffer.from(payload)])
    )

    // 4) THE UPGRADE dsh ACTUALLY MAKES: a ROOT path, because its page is anchored at
    // `<base href="/">`, and no Referer, because a browser sends none with a handshake. The only
    // thing naming the site is the `tracy_site` pointer. Measured live before this case existed:
    // without it the socket was destroyed unread and the workspace sat on "Loading workspaces..."
    // forever, with no line in any log to say why.
    const rootWs = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: '/api/ws',
        headers: {
          cookie: `${sessCookie}; ${seatCookiePair}; ${SITE_COOKIE}=wpdemo.localhost`,
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64')
        }
      })
      req.on('upgrade', (res, socket, head) => resolve({ status: res.statusCode, socket, head }))
      req.on('response', (res) => reject(new Error(`no upgrade, status ${res.statusCode}`)))
      req.on('error', reject)
      req.end()
    })
    rootWsSocket = rootWs.socket
    assert.equal(rootWs.status, 101)
    const rootPayload = JSON.stringify({ type: 'root' })
    const rootFrame = encodeFrame(rootPayload)
    const rootEchoed = await new Promise((resolve) => {
      rootWs.socket.once('data', resolve)
      rootWs.socket.write(rootFrame)
    })
    assert.deepEqual(
      rootEchoed,
      Buffer.concat([Buffer.from([0x81, Buffer.byteLength(rootPayload)]), Buffer.from(rootPayload)])
    )
  }
)

// Usage (plan tasks/todo-do-dung-that.md U3): opening a site's workspace page is a visit, recorded by
// the door that serves it — one `site.entered` per person, site and half hour, never for a fetch.
test(
  'workspaceRoutes: a navigation to a site workspace records site.entered once per half hour; a fetch records none',
  dbOpts,
  async (t) => {
    const { pool } = db
    createOpsSignal({ pool, config: { environment: 'test' }, log: { warn() {}, info() {} } })
    const upstream = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html></html>')
    })
    await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
    t.after(() => upstream.close())
    const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
    let at = Date.parse('2026-10-17T03:00:00Z')
    const app = workspaceRoutes({
      config: routeConfig,
      sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
      pool,
      seats: fakeSeats(),
      now: () => at
    })
    const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin, token: 'live' })}`
    const open = (accept) =>
      app.fetch(new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie, accept } }))
    const entered = async () =>
      (await pool.query(`select site_key, data from ops_signal where kind = 'site.entered' order by id`)).rows
    const settle = async (n) => {
      for (let i = 0; i < 100 && (await entered()).length < n; i++)
        await new Promise((r) => setTimeout(r, 10))
    }
    assert.equal((await open('text/html')).status, 200)
    assert.equal((await open('text/html')).status, 200)
    assert.equal((await open('application/json')).status, 200)
    await settle(1)
    await new Promise((r) => setTimeout(r, 50))
    assert.deepEqual(await entered(), [{ site_key: 'wpdemo.localhost', data: { email: 'ceo@tracy.ai' } }])
    at += ENTERED_WINDOW_MS
    assert.equal((await open('text/html')).status, 200)
    await settle(2)
    assert.equal((await entered()).length, 2, 'a new half hour is a new visit')
    assert.equal(
      enteredKey('Ceo@Tracy.ai', 'a.b', 0),
      enteredKey('ceo@tracy.ai', 'a.b', ENTERED_WINDOW_MS - 1)
    )
  }
)

// /ops › View as user: an admin looking at a customer's workspace is not that customer's visit.
test('workspaceRoutes: a view as a customer records no site.entered for the customer', dbOpts, async (t) => {
  const { pool } = db
  createOpsSignal({ pool, config: { environment: 'test' }, log: { warn() {}, info() {} } })
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<html></html>')
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    pool,
    seats: fakeSeats(),
    now: () => Date.parse('2026-10-17T03:00:00Z')
  })
  const view = await mintViewSession('customer@example.com', 'ceo@tracy.ai', routeSessionSecret)
  const cookie = `tracy_view=${view}; ${await siteSeatCookie({ dshOrigin, email: 'customer@example.com', token: 'live' })}`
  const res = await withViewAs(true, () =>
    app.fetch(
      new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie, accept: 'text/html' } })
    )
  )
  assert.equal(res.status, 200, await res.clone().text())
  await new Promise((r) => setTimeout(r, 100))
  const rows = (await pool.query(`select 1 from ops_signal where kind = 'site.entered'`)).rows
  assert.equal(rows.length, 0)
})

test('workspaceRoutes: a persistent dsh 401 retries once, then returns unavailable without redirecting', async (t) => {
  let forwards = 0
  const minted = []
  const upstream = http.createServer((req, res) => {
    forwards++
    res.writeHead(401)
    res.end()
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    seatDoor: {
      mintSeatSession: async ({ grant }) => {
        minted.push(grant)
        return `fresh-${minted.length}`
      }
    },
    pool: fakePool,
    seats: fakeSeats()
  })
  const seatCookieName = seatTokenCookieName(dshOrigin, 'wpdemo')
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin, token: 'stale' })}`
  const res = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/x', { headers: { cookie } }))
  assert.equal(res.status, 502)
  assert.deepEqual(await res.json(), {
    code: 'SEAT_UPSTREAM_UNAVAILABLE',
    reason: 'the workspace lane rejected the session'
  })
  assert.equal(res.headers.get('location'), null)
  assert.equal(forwards, 2)
  assert.equal(minted.length, 1)
  assert.equal(minted[0].site, 'wpdemo.localhost')
  assert.equal(res.headers.get('set-cookie'), `${seatCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
})

test('workspaceRoutes: terminal HTML rejection clears only its scoped cookie on the composed page', async (t) => {
  let forwards = 0
  const upstream = http.createServer((_req, res) => {
    forwards++
    res.writeHead(401)
    res.end()
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    seatDoor: { mintSeatSession: async () => 'fresh' },
    pool: fakePool,
    seats: fakeSeats(),
    pages: { workspaceUnavailable: workspaceUnavailablePage }
  })
  const seatCookieName = seatTokenCookieName(dshOrigin, 'wpdemo')
  const session = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const cookie = `${session}; ${await siteSeatCookie({ dshOrigin, token: 'old' })}`
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/s/abc?tab=team', {
      headers: { cookie, accept: 'text/html' }
    })
  )
  assert.equal(res.status, 503)
  assert.equal(res.headers.get('location'), null)
  assert.match(await res.text(), /workspace is not available right now/i)
  assert.equal(forwards, 2)
  assert.equal(res.headers.get('set-cookie'), `${seatCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
})

for (const [name, location] of [
  ['the host dsh’s bare Tracy origin', 'http://tracy-web:51710'],
  ['its own sign-in door', '/wpdemo.localhost/gateway/tracy?next=%2Fwpdemo.localhost%2F']
]) {
  test(`workspaceRoutes: a dsh redirect to ${name} retries once, then returns unavailable`, async (t) => {
    let forwards = 0
    // dsh-passwords answers a navigation with no live session by REDIRECTING to its sign-in target
    // (`noSessionAnswer` in vendor/tracy/dsh-passwords/src/seat.ts): on a host dsh that target is
    // Tracy's own origin, absolute, and it is only a 401 for a caller carrying the Worker's Access
    // header. Handed to the browser as it stood, a revoked seat cookie sent the viewer to
    // `http://tracy-web:51710` — a compose-internal name no browser resolves (measured 25/09 after
    // a site was deleted and added back under the same name).
    const upstream = http.createServer((req, res) => {
      forwards++
      res.writeHead(302, { location })
      res.end()
    })
    await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
    t.after(() => upstream.close())
    const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
    const app = workspaceRoutes({
      config: routeConfig,
      sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
      seatDoor: { mintSeatSession: async () => 'fresh' },
      pool: fakePool,
      seats: fakeSeats()
    })
    const seatCookieName = seatTokenCookieName(dshOrigin, 'wpdemo')
    const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin, token: 'revoked' })}`
    const res = await app.fetch(
      new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie, accept: 'text/html' } })
    )
    assert.equal(res.status, 502)
    assert.equal(res.headers.get('location'), null)
    assert.equal(forwards, 2)
    assert.deepEqual(await res.json(), {
      code: 'SEAT_UPSTREAM_UNAVAILABLE',
      reason: 'the workspace lane rejected the session'
    })
    assert.equal(
      res.headers.get('set-cookie'),
      `${seatCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    )
  })
}

test('workspaceRoutes: transient 401 remints and recovers in one safe request with the identical grant', async (t) => {
  const seen = []
  const upstream = http.createServer((req, res) => {
    seen.push({ path: req.url, cookies: req.headers.cookie })
    if (seen.length === 1) {
      res.writeHead(401)
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('healthy')
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
  const grants = []
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    seatDoor: {
      mintSeatSession: async ({ grant }) => {
        grants.push(grant)
        return 'recovered'
      }
    },
    pool: fakePool,
    seats: fakeSeats()
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin, token: 'old' })}`
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/s/abc?tab=team', { headers: { cookie } })
  )
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'healthy')
  assert.deepEqual(
    seen.map((x) => x.path),
    ['/wpdemo.localhost/s/abc?tab=team', '/wpdemo.localhost/s/abc?tab=team']
  )
  assert.match(seen[0].cookies, /dsh_gateway_token=old/)
  assert.match(seen[1].cookies, /dsh_gateway_token=recovered/)
  assert.equal(grants.length, 1)
  assert.deepEqual(grants[0], {
    role: 'owner',
    email: 'ceo@tracy.ai',
    folders: ['/site/wpdemo.localhost'],
    site: 'wpdemo.localhost',
    toolsets: []
  })
  assert.match(res.headers.get('set-cookie'), /tracy_tok_.*recovered/)
})

test('workspaceRoutes: cancels discarded upstream bodies before retry and terminal response', async (t) => {
  const closed = []
  let forwards = 0
  const upstream = http.createServer((_req, res) => {
    forwards++
    res.writeHead(401, { 'content-type': 'text/plain' })
    res.write('discarded')
    res.on('close', () => closed.push(forwards))
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  t.after(() => upstream.close())
  const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    seatDoor: { mintSeatSession: async () => 'fresh' },
    pool: fakePool,
    seats: fakeSeats()
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin, token: 'old' })}`
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/s/abc', { headers: { cookie } })
  )
  assert.equal(res.status, 502)
  assert.equal(forwards, 2)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(closed.length, 2)
})

test('workspaceRoutes: POST rejection is forwarded once, never replayed, and has no response body replay', async (t) => {
  let forwards = 0
  let received = ''
  const upstream = http.createServer((req, res) => {
    forwards++
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      received += chunk
    })
    req.on('end', () => {
      res.writeHead(401)
      res.end()
    })
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
  let minted = 0
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    seatDoor: {
      mintSeatSession: async () => {
        minted++
        return 'fresh'
      }
    },
    pool: fakePool,
    seats: fakeSeats()
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}; ${await siteSeatCookie({ dshOrigin, token: 'old' })}`
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/api/write?x=1', {
      method: 'POST',
      headers: { cookie, 'content-type': 'text/plain' },
      body: 'keep-this-body'
    })
  )
  assert.equal(res.status, 502)
  assert.equal(forwards, 1)
  assert.equal(minted, 0)
  assert.equal(received, 'keep-this-body')
  assert.equal(res.headers.get('location'), null)
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/)
})

test('workspaceRoutes: recovery updates only its own scope cookie and preserves another scope cookie', async (t) => {
  const byPath = new Map()
  const upstream = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://upstream').pathname
    const count = (byPath.get(path) ?? 0) + 1
    byPath.set(path, count)
    if (path.endsWith('/recover') && count === 1) {
      res.writeHead(401)
      res.end()
      return
    }
    res.writeHead(200)
    res.end(path)
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  t.after(() => upstream.close())
  const dshOrigin = `http://127.0.0.1:${upstream.address().port}`
  const app = workspaceRoutes({
    config: routeConfig,
    sites: fakeSites({ dshOf: () => ({ origin: dshOrigin, seatSecret: 'k' }) }),
    seatDoor: { mintSeatSession: async ({ grant }) => `fresh-${grant.site}` },
    pool: fakePool,
    seats: fakeSeats()
  })
  const session = `tracy_sess=${await mintSession('ceo@tracy.ai', routeSessionSecret)}`
  const tokenA = await siteSeatCookie({ dshOrigin, token: 'old-A' })
  const otherName = seatTokenCookieName(dshOrigin, 'other-scope')
  const tokenB = await siteSeatCookie({ dshOrigin, token: 'old-B' })
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/s/recover', {
      headers: { cookie: `${session}; ${tokenA}; ${otherName}=old-B; ${tokenB}` }
    })
  )
  assert.equal(res.status, 200)
  const setCookie = res.headers.get('set-cookie')
  assert.match(setCookie, /tracy_tok_.*~fresh-wpdemo\.localhost/)
  assert.doesNotMatch(setCookie, new RegExp(`${otherName}=`))
  assert.equal(byPath.get('/wpdemo.localhost/s/recover'), 2)
})
