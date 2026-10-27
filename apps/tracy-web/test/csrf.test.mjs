/**
 * The cross-site request guard (#662, `src/lib/csrf.js`), through `buildApp` so the mount order is
 * what is tested: a cookie-carrying write must come from Tracy's own origin — `Sec-Fetch-Site:
 * same-origin` when the browser sends Fetch Metadata, otherwise no foreign `Origin` — and declare
 * the body its door reads; doors that never read the session, the API host and reads are left
 * exactly as they were, and the dsh workspace proxy — the one route the router may hand a request
 * to on its own terms — keeps any body type, never a foreign origin.
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { MIDDLEWARE, WORKSPACE_PROXY, csrfGuard } from '../src/lib/csrf.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const ORIGIN = 'http://tracy.test'
const SECRET = 's'.repeat(32)
const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: SECRET,
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

/** What a hostile page on a customer site sends: its own Origin, a `text/plain` "simple" body. */
const FOREIGN = 'http://acme.tracy.test'

/** Every `Sec-Fetch-Site` that is not exactly `same-origin` — the customer-page case is `same-site`. */
const BAD_SITES = [
  'same-site',
  'cross-site',
  'none',
  '',
  'Same-Origin', // a browser never sends this spelling; the comparison is exact
  'same-origin, same-origin', // repeated
  'same-origin-ish'
]

/** Every way an `Origin` can fail to be exactly ours. */
const BAD_ORIGINS = [
  FOREIGN,
  'null',
  '',
  'https://tracy.test', // scheme
  'http://tracy.test:8080', // port
  'http://tracy.test.evil.test', // our name as a prefix
  'http://evil-tracy.test', // our name as a suffix
  'http://TRACY.test', // a browser never sends this spelling; the comparison is exact
  `${ORIGIN}, ${ORIGIN}`, // repeated
  'not a url'
]

/**
 * A memory-store app (no pool) with a fake site book behind the dsh catch-all, so every request
 * that reaches the workspace proxy is recorded.
 */
function harness(extraEnv = {}, { now = () => Date.now() } = {}) {
  const sent = []
  const proxied = []
  const config = readConfig({ ...env, ...extraEnv })
  const app = buildApp({
    config,
    identity: memoryIdentityStore(),
    mail: { send: async (m) => sent.push(m) },
    now,
    sites: {
      hostOf: async (key) => {
        proxied.push(key)
        return 'local'
      },
      dshOf: () => ({ origin: 'http://127.0.0.1:1', seatSecret: 'k' }),
      labelOf: async (key) => key,
      siteScope: async () => 'wpdemo',
      canonicalKey: async (key) => {
        proxied.push(key)
        return key
      }
    }
  })
  const cookieFor = async (email, at = Date.now()) => `tracy_sess=${await mintSession(email, SECRET, at)}`
  const send = (method, path, headers = {}, body) =>
    app.fetch(new Request(`${ORIGIN}${path}`, { method, headers, ...(body === undefined ? {} : { body }) }))
  return { app, sent, proxied, config, cookieFor, send }
}

const LOGIN_BODY = JSON.stringify({ email: 'target@x.y' })

test('#662: /login with the visitor’s cookie from a customer page is refused before any mail', async () => {
  const { sent, cookieFor, send } = harness()
  const cookie = await cookieFor('victim@x.y')
  for (const origin of BAD_ORIGINS) {
    const res = await send('POST', '/login', { cookie, origin, 'content-type': 'text/plain' }, LOGIN_BODY)
    assert.equal(res.status, 403, JSON.stringify(origin))
    assert.deepEqual(await res.json(), { code: 'CSRF_ORIGIN' })
    assert.equal(res.headers.get('cache-control'), 'no-store')
  }
  // A Fetch-Metadata browser says where the page is: a customer page on a sibling subdomain is
  // `same-site` (its Lax cookie rides along), and anything but exactly `same-origin` is refused —
  // even when `Origin` claims ours, with it absent, and with a JSON body.
  for (const site of BAD_SITES) {
    for (const origin of [ORIGIN, null, FOREIGN]) {
      const res = await send(
        'POST',
        '/login',
        { cookie, 'sec-fetch-site': site, ...(origin ? { origin } : {}), 'content-type': 'application/json' },
        LOGIN_BODY
      )
      assert.equal(res.status, 403, `${JSON.stringify(site)} ${origin}`)
      assert.deepEqual(await res.json(), { code: 'CSRF_ORIGIN' })
      assert.equal(res.headers.get('cache-control'), 'no-store')
    }
  }
  assert.equal(sent.length, 0)
})

test('Sec-Fetch-Site: same-origin decides alone: it passes with Origin ours, absent or anything else', async () => {
  const { sent, cookieFor, send } = harness()
  const cookie = await cookieFor('ceo@tracy.ai')
  for (const origin of [ORIGIN, null, FOREIGN]) {
    const res = await send(
      'POST',
      '/login',
      {
        cookie,
        'sec-fetch-site': 'same-origin',
        ...(origin ? { origin } : {}),
        'content-type': 'application/json'
      },
      LOGIN_BODY
    )
    assert.equal(res.status, 200, String(origin))
  }
  assert.equal(sent.length, 3)
})

test('no other header stands in for a refused Sec-Fetch-Site or a foreign Origin', async () => {
  const { sent, cookieFor, send } = harness()
  const cookie = await cookieFor('victim@x.y')
  const vouching = {
    cookie,
    'content-type': 'application/json',
    referer: `${ORIGIN}/login`,
    host: 'tracy.test',
    'x-forwarded-host': 'tracy.test',
    'x-forwarded-proto': 'http'
  }
  assert.equal((await send('POST', '/login', { ...vouching, origin: FOREIGN }, LOGIN_BODY)).status, 403)
  assert.equal(
    (await send('POST', '/login', { ...vouching, origin: ORIGIN, 'sec-fetch-site': 'same-site' }, LOGIN_BODY))
      .status,
    403
  )
  // A forged actor, signature or session marker buys no exemption on a door that reads the session.
  for (const marker of [{ 'x-tracy-actor': 'v1.x.y' }, { 'x-tracy-session': 'sess-1' }]) {
    const forged = { cookie, 'content-type': 'application/json', ...marker }
    assert.equal((await send('POST', '/login', { ...forged, origin: FOREIGN }, LOGIN_BODY)).status, 403)
    assert.equal(
      (await send('POST', '/login', { ...forged, 'sec-fetch-site': 'same-site' }, LOGIN_BODY)).status,
      403
    )
  }
  assert.equal(sent.length, 0)
})

test('the exact Origin passes; the body must then be declared as JSON (or a form, where a form is read)', async () => {
  const { sent, cookieFor, send } = harness()
  const cookie = await cookieFor('ceo@tracy.ai')
  const from = { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin' }

  const plain = await send('POST', '/login', { ...from, 'content-type': 'text/plain' }, LOGIN_BODY)
  assert.equal(plain.status, 415)
  assert.deepEqual(await plain.json(), { code: 'UNSUPPORTED_MEDIA_TYPE' })
  // A body with no declared type at all.
  const bare = await send('POST', '/login', from, new TextEncoder().encode(LOGIN_BODY))
  assert.equal(bare.status, 415)
  assert.equal(sent.length, 0)

  const asJson = await send(
    'POST',
    '/login',
    { ...from, 'content-type': 'Application/JSON; charset=UTF-8' },
    LOGIN_BODY
  )
  assert.equal(asJson.status, 200)
  assert.equal(sent.length, 1)

  const asForm = await send(
    'POST',
    '/login',
    { ...from, 'content-type': 'application/x-www-form-urlencoded' },
    new URLSearchParams({ email: 'form@x.y' }).toString()
  )
  assert.equal(asForm.status, 200)
  assert.equal(sent.length, 2)

  // Malformed JSON under the right type is still the door's to refuse.
  const malformed = await send('POST', '/login', { ...from, 'content-type': 'application/json' }, '{"email":')
  assert.equal(malformed.status, 400)
  assert.equal(sent.length, 2)
})

test('POST, PUT, PATCH and DELETE are all guarded; GET, HEAD and OPTIONS are not', async () => {
  const { cookieFor, send } = harness()
  const cookie = await cookieFor('ceo@tracy.ai')
  for (const [method, path] of [
    ['POST', '/api/team/invite'],
    ['PUT', '/api/ops/ui'],
    ['PUT', '/api/ops/desktop'],
    ['PATCH', '/workspaces/w1'],
    ['DELETE', '/api/me/keys/k1'],
    ['DELETE', '/tracy-admin/members/a1']
  ]) {
    const hostile = await send(method, path, { cookie, origin: FOREIGN })
    assert.equal(hostile.status, 403, `${method} ${path}`)
    assert.deepEqual(await hostile.json(), { code: 'CSRF_ORIGIN' })
  }
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const res = await send(method, '/auth/me', { cookie, origin: FOREIGN })
    assert.notEqual(res.status, 403, method)
  }
})

test('a request carrying no valid session is not the guard’s: nothing in it can be forged', async () => {
  const { sent, cookieFor, send } = harness()
  const hostile = { origin: FOREIGN, 'content-type': 'application/json' }
  // No cookie, an unsigned one, a stale one, and two valid ones naming different people — each is
  // "signed out" to every door, so the door answers as it always did.
  const stale = await cookieFor('victim@x.y', Date.now() - 400 * 24 * 3600 * 1000)
  const mixed = `${await cookieFor('a@x.y')}; ${await cookieFor('b@x.y')}`
  for (const cookie of [undefined, 'tracy_sess=v1.forged.sig', stale, mixed]) {
    const res = await send('POST', '/login', { ...hostile, ...(cookie ? { cookie } : {}) }, LOGIN_BODY)
    assert.equal(res.status, 200, String(cookie))
  }
  assert.equal(sent.length, 4)
  // Two copies of the SAME person's session are that session.
  const twice = `${await cookieFor('victim@x.y')}; ${await cookieFor('victim@x.y')}`
  assert.equal((await send('POST', '/login', { ...hostile, cookie: twice }, LOGIN_BODY)).status, 403)
  assert.equal(sent.length, 4)
})

test('a session valid on the app’s own clock is guarded even when the wall clock calls it expired', async () => {
  const at = 1_700_000_000_000
  const { sent, cookieFor, send } = harness({}, { now: () => at })
  const cookie = await cookieFor('victim@x.y', at)
  const res = await send(
    'POST',
    '/auth/signout',
    { cookie, origin: FOREIGN, 'content-type': 'application/json' },
    '{}'
  )
  assert.equal(res.status, 403)
  assert.equal(res.headers.get('set-cookie'), null)
  assert.equal(sent.length, 0)
})

test('no Fetch Metadata and no Origin (a server-side caller) reaches the door, under the body rule', async () => {
  // Node's `fetch` — the dsh host half calling a Tracy door with the viewer's cookie — sends
  // `sec-fetch-mode` and neither `Origin` nor `Sec-Fetch-Site`. It is not a browser page, so there
  // is no page to forge from; it still declares the body its door reads, so this is no blanket pass.
  const { sent, proxied, cookieFor, send } = harness()
  const cookie = await cookieFor('ceo@tracy.ai')
  for (const headers of [
    { cookie, 'content-type': 'application/json' },
    { cookie, 'sec-fetch-mode': 'cors', 'content-type': 'application/json' },
    { cookie, 'content-type': 'application/x-www-form-urlencoded' }
  ]) {
    const body = headers['content-type'] === 'application/json' ? LOGIN_BODY : 'email=form%40x.y'
    const res = await send('POST', '/login', headers, body)
    assert.equal(res.status, 200, JSON.stringify(headers))
  }
  assert.equal(sent.length, 3)
  for (const headers of [{ cookie, 'content-type': 'text/plain' }, { cookie }]) {
    const res = await send('POST', '/login', headers, new TextEncoder().encode(LOGIN_BODY))
    assert.equal(res.status, 415, JSON.stringify(headers))
    assert.deepEqual(await res.json(), { code: 'UNSUPPORTED_MEDIA_TYPE' })
  }
  assert.equal(sent.length, 3)
  // A bodiless write has nothing to declare.
  const signout = await send('POST', '/auth/signout', { cookie })
  assert.notEqual(signout.status, 403)
  assert.notEqual(signout.status, 415)
  assert.deepEqual(proxied, [])
})

test('doors that never read the session answer a cookie from anywhere exactly as before', async () => {
  const { cookieFor, send } = harness({ MCP_TRACY_ACTOR_SECRET: 'a'.repeat(32) })
  const cookie = await cookieFor('ceo@tracy.ai')
  const hostile = { cookie, origin: FOREIGN, 'content-type': 'application/json' }

  const round = await send('POST', '/auth/link/browser', hostile, '{}')
  assert.equal(round.status, 200)
  assert.match((await round.json()).nonce, /^[a-f0-9]{64}$/)

  const exchange = await send(
    'POST',
    `/auth/link/${'0'.repeat(64)}/exchange`,
    hostile,
    '{"clientSecret":"x"}'
  )
  assert.equal(exchange.status, 400)
  assert.deepEqual(await exchange.json(), { code: 'LINK_INVALID' })

  // The actor doors still demand their actor, cookie or not — and a forged one is still nobody.
  for (const actor of [undefined, 'v1.forged.sig']) {
    for (const path of ['/auth/otp/start', '/auth/otp/verify', '/auth/otp/%73tart']) {
      const res = await send(
        'POST',
        path,
        { ...hostile, ...(actor ? { 'x-tracy-actor': actor } : {}) },
        '{"email":"a@x.y","code":"1"}'
      )
      assert.equal(res.status, 401, `${path} ${actor}`)
      assert.deepEqual(await res.json(), { code: 'UNAUTHENTICATED' })
    }
  }
})

test('another spelling of a guarded path is still guarded, and nothing behind it runs', async () => {
  const { sent, proxied, cookieFor, send } = harness()
  const cookie = await cookieFor('victim@x.y')
  const hostile = { cookie, origin: FOREIGN, 'content-type': 'text/plain' }
  for (const path of ['/%6Cogin', '/login/', '/auth/link/browser/', '/auth/link/browser/../../login']) {
    const res = await send('POST', path, hostile, LOGIN_BODY)
    assert.equal(res.status, 403, path)
  }
  assert.equal(sent.length, 0)
  assert.deepEqual(proxied, [])
})

test('the dsh workspace proxy refuses a foreign page, and takes its own page or a caller with no Origin', async () => {
  const { proxied, cookieFor, send } = harness()
  const cookie = await cookieFor('ceo@tracy.ai')
  const rpc = '/wpdemo.localhost/api/rpc'

  const hostile = await send(
    'POST',
    rpc,
    { cookie, origin: FOREIGN, 'content-type': 'application/json' },
    '{}'
  )
  assert.equal(hostile.status, 403)
  assert.deepEqual(proxied, [], 'a refused request never reaches the site book or dsh')
  for (const site of BAD_SITES) {
    const res = await send(
      'POST',
      rpc,
      { cookie, origin: ORIGIN, 'sec-fetch-site': site, 'content-type': 'application/json' },
      '{}'
    )
    assert.equal(res.status, 403, JSON.stringify(site))
  }
  assert.deepEqual(proxied, [], 'a refused request never reaches the site book or dsh')

  // The dsh page's own request (same origin), and one with no Origin (the proxy strips it anyway), reach the
  // catch-all — where its own seat check answers (no pool here: no seat, so the join door).
  for (const headers of [
    { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    { cookie, 'content-type': 'application/json' }
  ]) {
    proxied.length = 0
    const res = await send('POST', rpc, headers, '{}')
    assert.notEqual(res.status, 403)
    assert.notEqual(res.status, 415)
    assert.ok(proxied.length > 0, 'the catch-all was reached')
  }
})

test('dsh reads its own bodies: a same-origin binary write the router hands to the proxy keeps its type', async () => {
  const { proxied, cookieFor, send } = harness()
  const cookie = await cookieFor('ceo@tracy.ai')
  const bytes = new Uint8Array([0, 1, 2, 3])
  const binary = {
    cookie,
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/octet-stream'
  }

  // The dsh client's upload, at the root RPC path and under a site's prefix. At the root the page
  // it comes from names the site through its same-origin Referer (`workspace/route.js`'s
  // `siteFromReferer`), as the dsh page's own requests do.
  for (const [path, page] of [
    ['/api/session/uploadFileBinary', { referer: `${ORIGIN}/wpdemo.localhost/` }],
    ['/wpdemo.localhost/api/session/uploadFileBinary', {}]
  ]) {
    proxied.length = 0
    const res = await send('POST', path, { ...binary, ...page }, bytes)
    assert.notEqual(res.status, 415, path)
    assert.notEqual(res.status, 403, path)
    assert.ok(proxied.length > 0, `${path}: the catch-all was reached`)

    // With no Fetch Metadata and no Origin at all (the proxy strips Origin before dsh anyway), the same.
    proxied.length = 0
    const { origin: _, 'sec-fetch-site': __, ...noMetadata } = binary
    const bare = await send('POST', path, { ...noMetadata, ...page }, bytes)
    assert.notEqual(bare.status, 415, `${path} without Origin`)
    assert.notEqual(bare.status, 403, `${path} without Origin`)
    assert.ok(proxied.length > 0, `${path} without Origin: the catch-all was reached`)

    // Rule 1 still stands on the same path: a page that names itself gets nothing through.
    for (const origin of BAD_ORIGINS) {
      proxied.length = 0
      const hostile = await send('POST', path, { ...noMetadata, ...page, origin }, bytes)
      assert.equal(hostile.status, 403, `${path} from ${JSON.stringify(origin)}`)
      assert.deepEqual(proxied, [], `${path}: a refused request never reaches the site book or dsh`)
    }
    for (const site of BAD_SITES) {
      proxied.length = 0
      const hostile = await send('POST', path, { ...binary, ...page, 'sec-fetch-site': site }, bytes)
      assert.equal(hostile.status, 403, `${path} as ${JSON.stringify(site)}`)
      assert.deepEqual(proxied, [], `${path} as ${JSON.stringify(site)}`)
    }
  }

  // A Tracy door the router picks first keeps the JSON rule, whatever the catch-all would take.
  for (const path of ['/login', '/verify']) {
    proxied.length = 0
    const res = await send('POST', path, binary, bytes)
    assert.equal(res.status, 415, path)
    assert.deepEqual(proxied, [], path)
  }

  // So does a door mounted with `app.all`, which the router records under the same `ALL` as
  // middleware: the Design inspiration page's JSON doors are Tracy's, not the catch-all's.
  for (const path of ['/design-inspiration/api/words', '/design-inspiration/api/brand']) {
    for (const type of ['text/plain', 'application/octet-stream', 'application/x-www-form-urlencoded']) {
      proxied.length = 0
      const res = await send('POST', path, { ...binary, 'content-type': type }, '{"words":"x"}')
      assert.equal(res.status, 415, `${path} as ${type}`)
      assert.deepEqual(proxied, [], `${path} as ${type}`)
    }
    const res = await send('POST', path, { ...binary, 'content-type': 'application/json' }, '{}')
    await assertPassedGuard(res, path)
    assert.deepEqual(proxied, [], `${path}: answered by its own door`)
    // …and, being Tracy's, a caller with no Fetch Metadata and no Origin still owes the JSON rule.
    const { origin: _, 'sec-fetch-site': __, ...bareHeaders } = binary
    const bare = await send('POST', path, { ...bareHeaders, 'content-type': 'text/plain' }, '{}')
    assert.equal(bare.status, 415, `${path} without Origin as text/plain`)
    assert.deepEqual(proxied, [], `${path} without Origin`)
  }
})

test('with the beta gate on, a dsh upload still reaches the proxy with its own body type', async () => {
  // BETA_GATE=on with the waitlist on another origin (the default `tracy.ai/whitelist/`, as on
  // cowork.tracy.site) mounts a `formAction` middleware in front of every route. The guard must
  // still see the dsh catch-all as the route that answers, not that middleware.
  const { config, proxied, cookieFor, send } = harness({ BETA_GATE: 'on', AMEMBER_API_KEY: 'k' })
  assert.notEqual(config.beta.waitlistOrigin, config.origin)
  const cookie = await cookieFor('ceo@tracy.ai')
  const headers = {
    cookie,
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/octet-stream'
  }
  for (const [path, page] of [
    ['/api/session/uploadFileBinary', { referer: `${ORIGIN}/wpdemo.localhost/` }],
    ['/wpdemo.localhost/api/session/uploadFileBinary', {}]
  ]) {
    proxied.length = 0
    const res = await send('POST', path, { ...headers, ...page }, new Uint8Array([0, 1, 2, 3]))
    assert.notEqual(res.status, 415, path)
    assert.notEqual(res.status, 403, path)
    assert.ok(proxied.length > 0, `${path}: the catch-all was reached`)
  }
  // A Tracy door keeps the JSON rule under the gate too.
  const login = await send('POST', '/login', headers, new Uint8Array([0]))
  assert.equal(login.status, 415)
})

test('ownership is the declared owner of the route the router picks; an undeclared one is a Tracy door', async () => {
  const { Hono } = await import('hono')
  const config = readConfig(env)
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', SECRET)}`
  const reached = []
  const proxy = (c) => {
    reached.push('proxy')
    return c.body(null, 204)
  }
  const build = (declare) => {
    const owners = new Map()
    const app = new Hono()
    const guard = csrfGuard({ config, owners })
    owners.set(guard, MIDDLEWARE)
    app.use('*', guard)
    // A router with its own error handler: `Hono#route` wraps each of its handlers.
    const sub = new Hono()
    sub.onError((err, c) => c.text(String(err), 500))
    const door = async (c, next) => {
      if (c.req.header('x-step-aside')) return next()
      reached.push('door')
      return c.body(null, 204)
    }
    sub.all('/thing', door)
    app.route('/', sub)
    declare(owners, sub.routes[0].handler)
    const catchAll = new Hono()
    catchAll.all('/*', proxy)
    app.route('/', catchAll)
    for (const route of catchAll.routes) owners.set(route.handler, WORKSPACE_PROXY)
    return app
  }
  const post = (app, headers) =>
    app.fetch(
      new Request(`${ORIGIN}/thing`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/octet-stream', ...headers },
        body: new Uint8Array([1])
      })
    )

  // Undeclared `ALL` door that sits in front of the catch-all: Tracy's rule, even when at run time
  // it would step aside — only a declaration can say that.
  const undeclared = build(() => {})
  assert.equal((await post(undeclared, {})).status, 415)
  assert.equal((await post(undeclared, { 'sec-fetch-site': 'same-site' })).status, 403)
  assert.equal((await post(undeclared, { origin: ORIGIN })).status, 415)
  assert.equal((await post(undeclared, { origin: ORIGIN, 'x-step-aside': '1' })).status, 415)
  assert.deepEqual(reached, [])

  // Declared as stepping aside by its own predicate, through the wrapper: the catch-all's policy
  // applies exactly when the predicate says so, per request.
  const conditional = build((owners, handler) =>
    owners.set(handler, { stepsAside: (c) => Boolean(c.req.header('x-step-aside')) })
  )
  assert.equal((await post(conditional, { 'x-step-aside': '1' })).status, 204)
  assert.equal((await post(conditional, { origin: ORIGIN, 'x-step-aside': '1' })).status, 204)
  assert.equal((await post(conditional, { origin: FOREIGN, 'x-step-aside': '1' })).status, 403)
  assert.equal(
    (await post(conditional, { origin: ORIGIN, 'sec-fetch-site': 'same-site', 'x-step-aside': '1' })).status,
    403
  )
  assert.deepEqual(reached, ['proxy', 'proxy'])
  assert.equal((await post(conditional, {})).status, 415)
  assert.equal((await post(conditional, { origin: ORIGIN })).status, 415)
  assert.deepEqual(reached, ['proxy', 'proxy'])
})

test('the guard never reads a body: a hostile stream that cannot be read is refused all the same', async () => {
  const { sent, cookieFor, app } = harness()
  const cookie = await cookieFor('victim@x.y')
  let pulled = false
  // `highWaterMark: 0`: nothing is pulled until somebody reads.
  const body = new ReadableStream(
    {
      pull() {
        pulled = true
        throw new Error('unreadable')
      }
    },
    { highWaterMark: 0 }
  )
  const res = await app.fetch(
    new Request(`${ORIGIN}/login`, {
      method: 'POST',
      headers: { cookie, origin: FOREIGN, 'content-type': 'text/plain' },
      body,
      duplex: 'half'
    })
  )
  assert.equal(res.status, 403)
  assert.equal(pulled, false)
  assert.equal(sent.length, 0)
})

test('a legitimate request whose body cannot be read is the door’s failure, never a success', async () => {
  const { sent, cookieFor, app } = harness()
  const cookie = await cookieFor('ceo@tracy.ai')
  const body = new ReadableStream({
    pull() {
      throw new Error('unreadable')
    }
  })
  const res = await app.fetch(
    new Request(`${ORIGIN}/login`, {
      method: 'POST',
      headers: {
        cookie,
        origin: ORIGIN,
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json'
      },
      body,
      duplex: 'half'
    })
  )
  assert.notEqual(res.status, 200)
  assert.equal(sent.length, 0)
})

test('verdicts are per request: interleaved hostile and legitimate calls each get their own', async () => {
  const { sent, cookieFor, send } = harness()
  const cookie = await cookieFor('ceo@tracy.ai')
  const calls = Array.from({ length: 24 }, (_, i) =>
    send(
      'POST',
      '/login',
      { cookie, origin: i % 2 ? FOREIGN : ORIGIN, 'content-type': 'application/json' },
      JSON.stringify({ email: `p${i}@x.y` })
    )
  )
  const statuses = (await Promise.all(calls)).map((r) => r.status)
  assert.deepEqual(
    statuses,
    statuses.map((_, i) => (i % 2 ? 403 : 200))
  )
  assert.equal(sent.length, 12)
  assert.ok(sent.every((m) => Number(m.to.slice(1, m.to.indexOf('@'))) % 2 === 0))
})

test('the API host drops the cookie first, so its doors never meet the guard', async () => {
  const { cookieFor, send } = harness({ API_ORIGIN: 'http://api.tracy.test' })
  const cookie = await cookieFor('ceo@tracy.ai')
  const res = await send('POST', '/v1/sites/lantern.example/apply/content.replace', {
    host: 'api.tracy.test',
    cookie,
    origin: FOREIGN,
    'content-type': 'text/plain'
  })
  assert.notEqual(res.status, 403)
  assert.notEqual(res.status, 415)
})

// ── Against Postgres: the reproduced invite, and the signed doors ────────────────────────────────

function dbHarness(pool, extraEnv = {}, { seatDoor } = {}) {
  const sent = []
  const proxied = []
  const config = readConfig({ ...env, ...extraEnv })
  const book = dbSitesResolver(pool, config)
  const app = buildApp({
    config,
    pool,
    identity: memoryIdentityStore(),
    mail: { send: async (m) => sent.push(m) },
    ...(seatDoor ? { seatDoor } : {}),
    // The real site book, with every lookup the dsh catch-all makes recorded.
    sites: {
      ...book,
      hostOf: async (key) => {
        proxied.push(key)
        return book.hostOf(key)
      },
      canonicalKey: async (key) => {
        proxied.push(key)
        return book.canonicalKey(key)
      }
    },
    // Mounts the doors that need a host (comments, attachments); no test here reaches one.
    host: {
      hostCall: async () => ({ ok: false, status: 503, body: null }),
      hostJob: async () => ({ ok: false, status: 503, body: null })
    }
  })
  const send = (path, headers, body, method = 'POST') =>
    app.fetch(new Request(`${ORIGIN}${path}`, { method, headers, ...(body === undefined ? {} : { body }) }))
  return { sent, proxied, send }
}

async function owner(pool, siteKey, email) {
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [
    siteKey,
    siteKey.split('.')[0],
    'local'
  ])
  const { rows } = await pool.query('insert into account (email) values ($1) returning id', [email])
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'owner', $2, now())`,
    [siteKey, rows[0].id]
  )
}

/**
 * Asserts the guard let `res` through to its door. A door may refuse on its own terms — a missing
 * seat is its own 403 — so the guard's verdict is told by its code, never by the status alone.
 */
async function assertPassedGuard(res, label) {
  const text = await res.text()
  let code = null
  try {
    code = JSON.parse(text)?.code ?? null
  } catch {}
  assert.ok(code !== 'CSRF_ORIGIN' && code !== 'UNSUPPORTED_MEDIA_TYPE', `${label}: ${res.status} ${text}`)
}

const seatsOf = async (pool, email) =>
  (
    await pool.query('select s.role from seat s join account a on a.id = s.account_id where a.email = $1', [
      email
    ])
  ).rows

test(
  'the doors that read a form, multipart or raw bytes keep them; every other door does not',
  dbOpts,
  async () => {
    // Against the full set of doors (pool + host): without them these paths are not mounted, and the
    // router would hand them to the dsh catch-all, which keeps any declared type.
    const { send } = dbHarness(db.pool)
    const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', SECRET)}`
    const from = { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin' }
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }))
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

    // Reaching the door (no seat here, so it refuses on its own terms) is "the guard let it through".
    const attachment = await send('/api/sites/lantern.example/comments/attachments', from, form)
    await assertPassedGuard(attachment, 'attachment')
    const shot = await send(
      '/api/ops/templates/tracy-business/shots/home.png',
      { ...from, 'content-type': 'image/png' },
      bytes,
      'PUT'
    )
    await assertPassedGuard(shot, 'shot')

    for (const [method, path, headers, body] of [
      ['POST', '/api/sites/lantern.example/comments', {}, form],
      ['POST', '/api/team/invite', { 'content-type': 'application/x-www-form-urlencoded' }, 'role=admin'],
      ['PUT', '/api/ops/ui', { 'content-type': 'image/png' }, bytes],
      ['PUT', '/api/ops/desktop', { 'content-type': 'text/plain' }, '{"llm":{"connect":true}}'],
      ['POST', '/api/sites/lantern.example/comments/attachments', { 'content-type': 'text/plain' }, 'x'],
      // A dsh-looking body on a Tracy door: the router picks the door, so the JSON rule stands.
      ['POST', '/api/team/invite', { 'content-type': 'application/octet-stream' }, bytes]
    ]) {
      const res = await send(path, { ...from, ...headers }, body, method)
      assert.equal(res.status, 415, `${method} ${path}`)
    }

    // A write with no body has nothing to declare — the plain `<form>` buttons on the seat pages
    // (`/:label/join`, `/api/sites/:key/accept`) post an empty form, and a `fetch` posts nothing.
    const empty = await send('/api/sites/lantern.example/accept', {
      ...from,
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': '0'
    })
    await assertPassedGuard(empty, 'empty accept')
  }
)

test('#662: a customer page cannot invite an editor with the owner’s cookie', dbOpts, async () => {
  const { pool } = db
  await owner(pool, 'lantern.example', 'owner@x.y')
  const { sent, send } = dbHarness(pool)
  const cookie = `tracy_sess=${await mintSession('owner@x.y', SECRET)}`
  const invite = JSON.stringify({ emails: ['mallory@x.y'], role: 'editor', siteKeys: ['lantern.example'] })

  for (const headers of [
    { cookie, origin: FOREIGN, 'content-type': 'text/plain' },
    { cookie, origin: FOREIGN, 'content-type': 'application/json' },
    { cookie, 'sec-fetch-site': 'same-site', 'content-type': 'text/plain' },
    // The customer page's real request: the browser marks it `same-site`, and a JSON body (after a
    // preflight the page is allowed to make) changes nothing.
    { cookie, origin: FOREIGN, 'sec-fetch-site': 'same-site', 'content-type': 'application/json' },
    { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-site', 'content-type': 'application/json' },
    { cookie, origin: FOREIGN, 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
    { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'text/plain' },
    { cookie, 'content-type': 'text/plain' }
  ]) {
    const res = await send('/api/team/invite', headers, invite)
    assert.ok(res.status === 403 || res.status === 415, `${JSON.stringify(headers)} → ${res.status}`)
    assert.deepEqual(await seatsOf(pool, 'mallory@x.y'), [])
  }
  assert.equal(sent.length, 0)

  // The owner's own page still invites.
  const ok = await send(
    '/api/team/invite',
    { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    invite
  )
  assert.equal(ok.status, 200)
  assert.deepEqual(await seatsOf(pool, 'mallory@x.y'), [{ role: 'editor' }])
})

test('the signed doors answer a stray cookie from anywhere exactly as they answer none', dbOpts, async () => {
  const { pool } = db
  const { send } = dbHarness(pool)
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', SECRET)}`
  for (const path of ['/fleet/git-token', '/github/push', '/github/release', '/_site-mail']) {
    const signed = { 'content-type': 'text/plain', 'x-hub-signature-256': 'sha256=00' }
    const bare = await send(path, signed, '{}')
    const withCookie = await send(path, { ...signed, cookie, origin: FOREIGN }, '{}')
    assert.equal(withCookie.status, bare.status, path)
    assert.notEqual(withCookie.status, 403, path)
    assert.notEqual(withCookie.status, 415, path)
  }
})

test(
  'a site named by its public name is guarded on both passes, and a let-through write runs once',
  dbOpts,
  async () => {
    const { pool } = db
    await owner(pool, 'lantern.example', 'owner@x.y')
    await pool.query(
      "insert into site_name (name, site_key, state) values ('lantern-shop.test', 'lantern.example', 'active')"
    )
    const { sent, send } = dbHarness(pool)
    const cookie = `tracy_sess=${await mintSession('owner@x.y', SECRET)}`
    const invite = JSON.stringify({ emails: ['ed@x.y'], role: 'editor', siteKeys: ['lantern-shop.test'] })

    const hostile = await send(
      '/api/team/invite',
      { cookie, origin: FOREIGN, 'content-type': 'application/json' },
      invite
    )
    assert.equal(hostile.status, 403)
    assert.deepEqual(await seatsOf(pool, 'ed@x.y'), [])

    const ours = await send(
      '/api/team/invite',
      { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      invite
    )
    assert.equal(ours.status, 200)
    assert.deepEqual(await seatsOf(pool, 'ed@x.y'), [{ role: 'editor' }])
    assert.equal(sent.length, 1)
  }
)

test(
  'the dsh host half’s calls — cookie, no Origin, no Sec-Fetch-Site — reach their doors',
  dbOpts,
  async () => {
    const { pool } = db
    await owner(pool, 'lantern.example', 'owner@x.y')
    const { proxied, send } = dbHarness(pool)
    const cookie = `tracy_sess=${await mintSession('owner@x.y', SECRET)}`
    // What `tracy-site-tools`, `tracy-add-site` and `tracy-site-tabs` send from Node: a JSON body
    // with the viewer's cookie, and the session marker the lease reads. No page, so nothing to forge.
    const host = { cookie, 'content-type': 'application/json', accept: 'application/json' }
    const calls = [
      [
        '/api/sites/lantern.example/apply',
        { 'x-tracy-session': 'sess-1' },
        { action: 'content.replace', params: {} }
      ],
      ['/api/sites/lantern.example/lease/release', { 'x-tracy-session': 'sess-1' }, {}],
      ['/api/sites/_conversation/changed', { 'x-tracy-workspace-label': 'lantern' }, { tool: 'look.revert' }],
      ['/api/sites/lantern.example/artifacts/begin', {}, { kind: 'db' }],
      ['/api/sites/lantern.example/moment', {}, { title: 'A moment' }]
    ]
    for (const [path, extra, body] of calls) {
      const res = await send(path, { ...host, ...extra }, JSON.stringify(body))
      await assertPassedGuard(res.clone(), path)
      assert.notEqual(res.status, 415, path)
      // The same call from a customer page (the browser marks it `same-site`) never reaches the door.
      const hostile = await send(
        path,
        { ...host, ...extra, origin: ORIGIN, 'sec-fetch-site': 'same-site' },
        JSON.stringify(body)
      )
      assert.equal(hostile.status, 403, `${path} from a customer page`)
      assert.deepEqual(await hostile.json(), { code: 'CSRF_ORIGIN' })
    }
    assert.deepEqual(proxied, [], 'every call was answered by its own Tracy door')
    // The lease door still reads its own session marker: the guard grants no authority.
    const released = await send('/api/sites/lantern.example/lease/release', host, '{}')
    assert.equal(released.status, 400)
    assert.deepEqual(await released.json(), { code: 'INVALID_REQUEST', field: 'x-tracy-session' })
  }
)

test(
  '#662: with no Fetch Metadata, the invite door still refuses a foreign Origin and a simple body',
  dbOpts,
  async () => {
    const { pool } = db
    await owner(pool, 'lantern.example', 'owner@x.y')
    const { sent, proxied, send } = dbHarness(pool)
    const cookie = `tracy_sess=${await mintSession('owner@x.y', SECRET)}`
    const invite = JSON.stringify({ emails: ['mallory@x.y'], role: 'editor', siteKeys: ['lantern.example'] })
    for (const [headers, status] of [
      ...BAD_ORIGINS.map((origin) => [{ cookie, origin, 'content-type': 'application/json' }, 403]),
      [{ cookie, 'content-type': 'text/plain' }, 415],
      [{ cookie, 'sec-fetch-mode': 'cors', 'content-type': 'text/plain' }, 415]
    ]) {
      const res = await send('/api/team/invite', headers, invite)
      assert.equal(res.status, status, JSON.stringify(headers))
      assert.equal(res.headers.get('cache-control'), 'no-store')
    }
    assert.deepEqual(await seatsOf(pool, 'mallory@x.y'), [])
    assert.deepEqual(
      (await pool.query("select 1 from account where email = 'mallory@x.y'")).rows,
      [],
      'no account was made'
    )
    assert.equal(sent.length, 0)
    assert.deepEqual(proxied, [])
  }
)

test(
  '/v1 off the API host is the catch-all’s, with every door mounted; on the API host it is the API’s',
  dbOpts,
  async () => {
    const { pool } = db
    await owner(pool, 'lantern.example', 'ceo@tracy.ai')
    const API = 'http://api.tracy.test'
    const { proxied, send } = dbHarness(pool, { API_ORIGIN: API })
    const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', SECRET)}`
    const bytes = new Uint8Array([0, 1, 2, 3])
    const binary = {
      cookie,
      referer: `${ORIGIN}/lantern.example/`,
      'content-type': 'application/octet-stream'
    }
    // Unclaimed paths (`ALL /v1`, `ALL /v1/*`) and one a method-specific row (`POST …/contract/:operation`) claims.
    const paths = [
      '/v1',
      '/v1/unclaimed',
      '/v1/sites/lantern.example/apply/content.replace',
      '/v1/sites/lantern.example/contract/content.replace'
    ]
    for (const path of paths) {
      for (const headers of [{ ...binary, origin: ORIGIN }, binary]) {
        proxied.length = 0
        const res = await send(path, headers, bytes)
        await assertPassedGuard(res.clone(), `${path} ${headers.origin ?? 'no Origin'}`)
        assert.equal(res.headers.get('x-tracy-api-version'), null, `${path}: not answered by /v1`)
        assert.ok(proxied.length > 0, `${path} ${headers.origin ?? 'no Origin'}: the catch-all was reached`)
      }
      proxied.length = 0
      const hostile = await send(path, { ...binary, origin: FOREIGN }, bytes)
      assert.equal(hostile.status, 403, `${path} from a customer page`)
      assert.deepEqual(proxied, [], `${path} from a customer page`)
    }

    // The same paths on the API host: the cookie is dropped, so /v1 answers as itself — the
    // unclaimed ones are its 404, the claimed one wants its Bearer key — and never the catch-all.
    for (const path of paths) {
      proxied.length = 0
      const res = await send(path, { ...binary, host: 'api.tracy.test', origin: FOREIGN }, bytes)
      assert.ok([401, 404].includes(res.status), `${path} on the API host: ${res.status}`)
      assert.ok(res.headers.get('x-tracy-api-version'), `${path} on the API host: answered by /v1`)
      assert.deepEqual(proxied, [], `${path} on the API host`)
    }
  }
)

test(
  'Tracy’s own ALL doors get no proxy leniency: Design inspiration and the read-only CMS surface',
  dbOpts,
  async () => {
    const { proxied, send } = dbHarness(db.pool)
    const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', SECRET)}`
    const from = { cookie, origin: ORIGIN }
    const paths = [
      '/design-inspiration/api/words',
      '/design-inspiration/api/brand',
      '/api/ops/cms',
      '/api/ops/cms/runtime'
    ]
    for (const path of paths) {
      for (const type of ['text/plain', 'application/octet-stream', 'application/x-www-form-urlencoded']) {
        const res = await send(path, { ...from, 'content-type': type }, '{}')
        assert.equal(res.status, 415, `${path} as ${type}`)
      }
      const bare = await send(path, { cookie, 'content-type': 'text/plain' }, '{}')
      assert.equal(bare.status, 415, `${path} without Origin as text/plain`)
      const sibling = await send(
        path,
        { ...from, 'sec-fetch-site': 'same-site', 'content-type': 'application/json' },
        '{}'
      )
      assert.equal(sibling.status, 403, `${path} from a sibling site`)
      const ok = await send(path, { ...from, 'content-type': 'application/json' }, '{}')
      await assertPassedGuard(ok.clone(), path)
      if (path.startsWith('/api/ops/cms')) assert.notEqual(ok.status, 200, `${path}: still no write door`)
    }
    assert.deepEqual(proxied, [])
  }
)

/** A live stand-in for a host's dsh: every request that reaches it is kept, bytes and headers. */
async function liveDsh(t) {
  const seen = []
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => server.close())
  return { seen, origin: `http://127.0.0.1:${server.address().port}` }
}

test(
  'a binary upload through the proxy reaches dsh byte for byte, typed, and stripped of Origin and Referer',
  dbOpts,
  async (t) => {
    const { pool } = db
    const dsh = await liveDsh(t)
    await owner(pool, 'wpdemo.localhost', 'ceo@tracy.ai')
    const { send } = dbHarness(
      pool,
      { HOST_local_DSH_ORIGIN: dsh.origin },
      { seatDoor: { mintSeatSession: async () => 'tok' } }
    )
    const session = `tracy_sess=${await mintSession('ceo@tracy.ai', SECRET)}`
    // The dsh page that uploads was opened first, and that visit planted its seat cookie (a mint
    // answers with a redirect back to the same address, never a forwarded write).
    const opened = await send('/wpdemo.localhost/', { cookie: session }, undefined, 'GET')
    assert.equal(opened.status, 302)
    const seat = opened.headers.getSetCookie().map((c) => c.split(';')[0])
    assert.ok(seat.length > 0, 'the page visit planted a seat cookie')
    const cookie = [session, ...seat].join('; ')
    // Every byte value, so nothing on the way can have read the body as text.
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    const binary = { cookie, 'content-type': 'application/octet-stream' }

    // The root RPC path names its site through the dsh page's own Referer; the prefixed one by its path.
    for (const [path, page] of [
      ['/api/session/uploadFileBinary', { referer: `${ORIGIN}/wpdemo.localhost/` }],
      ['/wpdemo.localhost/api/session/uploadFileBinary', {}]
    ]) {
      for (const origin of [ORIGIN, null]) {
        dsh.seen.length = 0
        const headers = { ...binary, ...page, ...(origin ? { origin, 'sec-fetch-site': 'same-origin' } : {}) }
        const res = await send(path, headers, bytes)
        const label = `${path} ${origin ?? 'no Origin'}`
        assert.equal(res.status, 200, `${label}: ${res.status} ${await res.clone().text()}`)
        assert.deepEqual(await res.json(), { ok: true }, label)
        assert.equal(dsh.seen.length, 1, `${label}: one write reached dsh`)
        const [got] = dsh.seen
        assert.equal(got.method, 'POST', label)
        assert.match(got.url, /\/api\/session\/uploadFileBinary$/, label)
        assert.equal(got.headers['content-type'], 'application/octet-stream', label)
        assert.deepEqual(new Uint8Array(got.body), bytes, `${label}: the bytes arrive unchanged`)
        assert.equal(got.headers.origin, undefined, `${label}: Origin is not forwarded`)
        assert.equal(got.headers.referer, undefined, `${label}: Referer is not forwarded`)
        assert.match(
          got.headers.cookie ?? '',
          /dsh_gateway_token=tok/,
          `${label}: rides the seat, not the session`
        )
        assert.doesNotMatch(got.headers.cookie ?? '', /tracy_sess/, label)
      }

      // A customer page gets nothing to dsh on the same path, whatever it names itself.
      for (const origin of BAD_ORIGINS) {
        dsh.seen.length = 0
        const res = await send(path, { ...binary, ...page, origin }, bytes)
        assert.equal(res.status, 403, `${path} from ${JSON.stringify(origin)}`)
        assert.deepEqual(dsh.seen, [], `${path} from ${JSON.stringify(origin)}: no upstream write`)
      }
      for (const site of BAD_SITES) {
        const res = await send(path, { ...binary, ...page, origin: ORIGIN, 'sec-fetch-site': site }, bytes)
        assert.equal(res.status, 403, `${path} as ${JSON.stringify(site)}`)
        assert.deepEqual(dsh.seen, [], `${path} as ${JSON.stringify(site)}: no upstream write`)
      }
    }
  }
)

test(
  'a proxy upload from a viewer with no live seat — none, pending or revoked — writes nothing upstream',
  dbOpts,
  async (t) => {
    const { pool } = db
    const dsh = await liveDsh(t)
    await owner(pool, 'wpdemo.localhost', 'owner@x.y')
    const { rows } = await pool.query(
      "insert into account (email) values ('pending@x.y'), ('gone@x.y') returning id"
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by) values ('wpdemo.localhost', $1, 'editor', $1)`,
      [rows[0].id]
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at, revoked_at)
       values ('wpdemo.localhost', $1, 'editor', $1, now(), now())`,
      [rows[1].id]
    )
    let minted = 0
    const { send } = dbHarness(
      pool,
      { HOST_local_DSH_ORIGIN: dsh.origin },
      {
        seatDoor: {
          mintSeatSession: async () => {
            minted++
            return 'tok'
          }
        }
      }
    )
    const bytes = new Uint8Array([0, 1, 2, 3])
    for (const email of ['nobody@x.y', 'pending@x.y', 'gone@x.y']) {
      const cookie = `tracy_sess=${await mintSession(email, SECRET)}`
      const res = await send(
        '/wpdemo.localhost/api/session/uploadFileBinary',
        { cookie, origin: ORIGIN, 'content-type': 'application/octet-stream' },
        bytes
      )
      assert.notEqual(res.status, 200, email)
      assert.notEqual(res.status, 403, `${email}: refused by the seat check, not the guard`)
    }
    assert.deepEqual(dsh.seen, [], 'no upstream write')
    assert.equal(minted, 0, 'no seat session minted')
  }
)
