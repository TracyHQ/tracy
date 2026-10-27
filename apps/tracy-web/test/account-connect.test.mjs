// "Connect Tracy" for Website Opportunities: RFC 8628 device flow → account-level `demos` token.
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { mintKey } from '../src/lib/api-key.js'
import { writeComponent } from '../src/sites/store.js'
import { hostCall, hostJob } from '../src/host/client.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const ORIGIN = 'http://tracy.test:8080'
const API = 'http://api.test'
const SITE = 'lantern.localhost'
const PEPPER = 'p'.repeat(32)
const CLIENT = 'website-opportunities'
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'

async function setup() {
  const { pool } = db
  let clock = Date.parse('2026-10-24T10:00:00Z')
  const config = readConfig({
    TRACY_ORIGIN: ORIGIN,
    API_ORIGIN: API,
    API_KEY_PEPPER: PEPPER,
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  })
  await pool.query("insert into site (site_key,label,host,platform) values ($1,'lantern','local','joomla')", [
    SITE
  ])
  const users = {}
  for (const [email, name] of [
    ['owner@x.y', 'Olive Owner'],
    ['other@x.y', null]
  ]) {
    users[email] = (
      await pool.query('insert into account (email, display_name) values ($1,$2) returning id', [email, name])
    ).rows[0].id
  }
  await pool.query(
    "insert into seat (site_key,account_id,role,granted_by,accepted_at) values ($1,$2,'owner',$2,now())",
    [SITE, users['owner@x.y']]
  )
  await writeComponent(
    pool,
    SITE,
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl: async () => Response.json({ ok: true }),
    now: () => clock
  })
  const form = (body) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  })
  const cookie = async (email = 'owner@x.y') => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const deviceCode = async (body = {}, ip = '203.0.113.9') => {
    const r = await app.request(`${ORIGIN}/oauth/device/code`, {
      ...form({ client_id: CLIENT, scope: 'demos', ...body }),
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': ip }
    })
    return { status: r.status, body: await r.json() }
  }
  const connectPage = async (code, email = 'owner@x.y') => {
    const r = await app.request(`${ORIGIN}/connect${code ? `?code=${encodeURIComponent(code)}` : ''}`, {
      headers: email ? { cookie: await cookie(email) } : {}
    })
    const html = await r.text()
    return {
      status: r.status,
      location: r.headers.get('location'),
      html,
      request: /name="request" value="([^"]+)"/.exec(html)?.[1],
      signature: /name="signature" value="([^"]+)"/.exec(html)?.[1]
    }
  }
  const decide = async (
    page,
    userCode,
    { decision = 'allow', email = 'owner@x.y', origin = ORIGIN } = {}
  ) => {
    const r = await app.request(`${ORIGIN}/connect`, {
      method: 'POST',
      headers: {
        cookie: await cookie(email),
        origin,
        'content-type': 'application/x-www-form-urlencoded',
        'sec-fetch-site': origin === ORIGIN ? 'same-origin' : 'cross-site',
        'cf-connecting-ip': '198.51.100.7'
      },
      body: new URLSearchParams({
        request: page.request,
        signature: page.signature,
        user_code: userCode,
        decision
      }).toString()
    })
    return { status: r.status, html: await r.text() }
  }
  const poll = async (device_code, client_id = CLIENT) => {
    const r = await app.request(
      `${ORIGIN}/oauth/token`,
      form({ grant_type: DEVICE_GRANT, device_code, client_id })
    )
    return { status: r.status, body: await r.json() }
  }
  const refresh = async (refresh_token) => {
    const r = await app.request(
      `${ORIGIN}/oauth/token`,
      form({ grant_type: 'refresh_token', refresh_token, client_id: CLIENT })
    )
    return { status: r.status, body: await r.json() }
  }
  const api = (path, bearer, init = {}) =>
    app.request(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${bearer}`, ...init.headers }
    })
  const tick = (ms) => {
    clock += ms
  }
  /** Device code → approve on /connect → first poll answers tokens. */
  const connected = async () => {
    const issued = await deviceCode()
    tick(5000)
    const page = await connectPage(issued.body.user_code)
    const decided = await decide(page, issued.body.user_code)
    assert.equal(decided.status, 200, decided.html)
    const tokens = await poll(issued.body.device_code)
    assert.equal(tokens.status, 200, JSON.stringify(tokens.body))
    return { ...tokens.body, device_code: issued.body.device_code }
  }
  return {
    app,
    pool,
    config,
    users,
    deviceCode,
    connectPage,
    decide,
    poll,
    refresh,
    api,
    tick,
    cookie,
    connected
  }
}

test(
  'the device door hands out a readable user code and a /connect link, and discovery names it',
  opts,
  async () => {
    const h = await setup()
    const issued = await h.deviceCode()
    assert.equal(issued.status, 200, JSON.stringify(issued.body))
    assert.match(issued.body.device_code, /^[A-Za-z0-9_-]{43}$/)
    assert.match(issued.body.user_code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/)
    assert.equal(issued.body.verification_uri, `${ORIGIN}/connect`)
    assert.equal(
      issued.body.verification_uri_complete,
      `${ORIGIN}/connect?code=${encodeURIComponent(issued.body.user_code)}`
    )
    assert.equal(issued.body.interval, 5)
    assert.equal(issued.body.expires_in, 600)
    // Only the registered device client, only the `demos` scope.
    assert.equal((await h.deviceCode({ client_id: 'tracy-chatgpt' })).body.error, 'invalid_client')
    assert.equal((await h.deviceCode({ scope: 'content' })).body.error, 'invalid_scope')
    const meta = await (await h.app.request(`${ORIGIN}/.well-known/oauth-authorization-server`)).json()
    assert.equal(meta.device_authorization_endpoint, `${ORIGIN}/oauth/device/code`)
    assert.ok(meta.grant_types_supported.includes(DEVICE_GRANT))
    assert.ok(meta.scopes_supported.includes('demos'))
  }
)

test(
  'a signed-in person compares the code, allows, and the app gets an account token that reads /v1/me',
  opts,
  async () => {
    const h = await setup()
    const issued = await h.deviceCode()
    const code = issued.body.user_code
    // Not signed in: through the existing sign-in, then back to this very page.
    const anonymous = await h.connectPage(code, null)
    assert.equal(anonymous.status, 302)
    assert.equal(anonymous.location, `/login?next=${encodeURIComponent(`/connect?code=${code}`)}`)
    // Before anything is decided the app is told to wait.
    assert.equal((await h.poll(issued.body.device_code)).body.error, 'authorization_pending')
    const page = await h.connectPage(code)
    assert.equal(page.status, 200)
    assert.match(page.html, /data-connect-account><!--email_off-->owner@x\.y<!--email_on--></)
    assert.match(page.html, /Website Opportunities/)
    // The link pre-fills the code but the page still shows it to compare; nothing is approved yet.
    assert.match(page.html, new RegExp(`name="user_code" value="${code}"`))
    assert.match(page.html, /Check that this code matches/)
    assert.match(page.html, /Connect to create demo sites\./)
    h.tick(5000)
    assert.equal((await h.poll(issued.body.device_code)).body.error, 'authorization_pending')
    // A form posted from another origin decides nothing.
    assert.equal((await h.decide(page, code, { origin: 'https://evil.example' })).status, 403)
    const allowed = await h.decide(page, code)
    assert.equal(allowed.status, 200)
    assert.match(allowed.html, /data-device-connect-result="allowed"/)
    h.tick(5000)
    const tokens = await h.poll(issued.body.device_code)
    assert.equal(tokens.status, 200, JSON.stringify(tokens.body))
    assert.match(tokens.body.access_token, /^tra_[a-z2-7]{16}\.[A-Za-z0-9_-]{32}$/)
    assert.equal(tokens.body.token_type, 'Bearer')
    assert.equal(tokens.body.expires_in, 3600)
    assert.equal(tokens.body.scope, 'demos')
    assert.match(tokens.body.refresh_token, /^[A-Za-z0-9_-]{43}$/)
    const me = await h.api('/v1/me', tokens.body.access_token)
    assert.equal(me.status, 200)
    assert.deepEqual(await me.json(), { email: 'owner@x.y', displayName: 'Olive Owner' })
    // The same token opens the demos doors (`/v1/demos*`, mounted on this resolver in app.js).
    const options = await h.api('/v1/demos/options', tokens.body.access_token)
    assert.equal(options.status, 200)
    assert.equal((await options.json()).demos.live, 0)
    // The device code is one-use: presenting it again fails and ends the connection it made.
    h.tick(5000)
    assert.equal((await h.poll(issued.body.device_code)).body.error, 'invalid_grant')
    assert.equal((await h.api('/v1/me', tokens.body.access_token)).status, 401)
  }
)

test(
  'a demos token is refused on every site door, and an account door refuses a seat key',
  opts,
  async () => {
    const h = await setup()
    const tokens = await h.connected()
    for (const path of [`/v1/sites/${SITE}`, `/v1/sites/${SITE}/contents`, `/v1/sites/${SITE}/design`]) {
      const r = await h.api(path, tokens.access_token)
      assert.equal(r.status, 403, path)
      assert.equal((await r.json()).error.code, 'ACCOUNT_TOKEN_NOT_ALLOWED')
    }
    const seat = await mintKey({
      pool: h.pool,
      accountId: h.users['owner@x.y'],
      siteKey: SITE,
      label: 'ci',
      scopes: ['content'],
      pepper: PEPPER
    })
    const requireAccountToken = h.app.requireAccountToken
    const ctx = (bearer) => ({
      req: { header: (name) => (name === 'authorization' ? `Bearer ${bearer}` : undefined) },
      json: (body, status) => Response.json(body, { status })
    })
    const refused = await requireAccountToken(ctx(seat.key), 'demos')
    assert.equal(refused.error.status, 403)
    assert.equal((await refused.error.json()).error.code, 'ACCOUNT_TOKEN_REQUIRED')
    const accepted = await requireAccountToken(ctx(tokens.access_token), 'demos')
    assert.equal(accepted.accountId, h.users['owner@x.y'])
    assert.equal(accepted.email, 'owner@x.y')
    assert.equal((await requireAccountToken(ctx(tokens.access_token), 'sites')).error.status, 403)
  }
)

test('polling faster than the interval is told slow_down, and each one adds five seconds', opts, async () => {
  const h = await setup()
  const issued = await h.deviceCode()
  assert.equal((await h.poll(issued.body.device_code)).body.error, 'authorization_pending')
  h.tick(1000)
  const fast = await h.poll(issued.body.device_code)
  assert.equal(fast.status, 400)
  assert.equal(fast.body.error, 'slow_down')
  // The interval is now 10 s: 9 s later is still too fast, 10 s after that is not.
  h.tick(9000)
  assert.equal((await h.poll(issued.body.device_code)).body.error, 'slow_down')
  h.tick(15_000)
  assert.equal((await h.poll(issued.body.device_code)).body.error, 'authorization_pending')
})

test(
  'Deny tells the app access_denied, and an expired code is expired_token and cannot be approved',
  opts,
  async () => {
    const h = await setup()
    const denied = await h.deviceCode()
    const page = await h.connectPage()
    const result = await h.decide(page, denied.body.user_code.toLowerCase().replace('-', ' '), {
      decision: 'deny'
    })
    assert.equal(result.status, 200, result.html)
    assert.match(result.html, /data-device-connect-result="denied"/)
    assert.equal((await h.poll(denied.body.device_code)).body.error, 'access_denied')

    const late = await h.deviceCode()
    h.tick(601_000)
    assert.equal((await h.poll(late.body.device_code)).body.error, 'expired_token')
    const fresh = await h.connectPage()
    const refused = await h.decide(fresh, late.body.user_code)
    assert.equal(refused.status, 400)
    assert.match(refused.html, /data-connect-error="badCode"/)
    assert.equal((await h.poll(late.body.device_code, 'tracy-chatgpt')).status, 400)
  }
)

test('wrong codes are limited per account and address, and a right code then waits too', opts, async () => {
  const h = await setup()
  const issued = await h.deviceCode()
  const page = await h.connectPage()
  for (let i = 0; i < 10; i++) {
    const wrong = await h.decide(page, 'BBBB-BBBB')
    assert.equal(wrong.status, 400)
  }
  const blocked = await h.decide(page, issued.body.user_code)
  assert.equal(blocked.status, 429)
  assert.match(blocked.html, /data-connect-error="tooMany"/)
  assert.equal((await h.poll(issued.body.device_code)).body.error, 'authorization_pending')
})

test(
  'refresh rotates both tokens on one id; a spent refresh token presented again ends the connection',
  opts,
  async () => {
    const h = await setup()
    const first = await h.connected()
    h.tick(3_601_000)
    assert.equal((await h.api('/v1/me', first.access_token)).status, 401)
    const second = await h.refresh(first.refresh_token)
    assert.equal(second.status, 200, JSON.stringify(second.body))
    assert.notEqual(second.body.refresh_token, first.refresh_token)
    assert.equal(second.body.access_token.split('.')[0], first.access_token.split('.')[0])
    assert.equal((await h.api('/v1/me', second.body.access_token)).status, 200)
    // Replay of the spent refresh token: refused, and the whole grant is revoked.
    assert.equal((await h.refresh(first.refresh_token)).body.error, 'invalid_grant')
    const after = await h.api('/v1/me', second.body.access_token)
    assert.equal(after.status, 401)
    assert.equal((await after.json()).error.code, 'KEY_REVOKED')
    assert.equal((await h.refresh(second.body.refresh_token)).body.error, 'invalid_grant')
  }
)

test('/oauth/revoke and Settings › Connected apps both end a connection', opts, async () => {
  const h = await setup()
  const viaApp = await h.connected()
  const revoked = await h.app.request(`${ORIGIN}/oauth/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT, token: viaApp.access_token }).toString()
  })
  assert.equal(revoked.status, 200)
  assert.equal((await h.api('/v1/me', viaApp.access_token)).status, 401)
  assert.equal((await h.refresh(viaApp.refresh_token)).body.error, 'invalid_grant')

  const viaSettings = await h.connected()
  const cookie = await h.cookie()
  const listed = await h.app.request(`${ORIGIN}/api/me/connected-apps`, { headers: { cookie } })
  assert.equal(listed.status, 200)
  const { apps } = await listed.json()
  assert.equal(apps.length, 1)
  assert.equal(apps[0].clientId, CLIENT)
  assert.equal(apps[0].name, 'Website Opportunities')
  assert.deepEqual(apps[0].scopes, ['demos'])
  // Another account cannot see or revoke it.
  const stranger = await h.cookie('other@x.y')
  assert.deepEqual(
    (await (await h.app.request(`${ORIGIN}/api/me/connected-apps`, { headers: { cookie: stranger } })).json())
      .apps,
    []
  )
  const del = (c) =>
    h.app.request(`${ORIGIN}/api/me/connected-apps/${apps[0].id}`, {
      method: 'DELETE',
      headers: { cookie: c, origin: ORIGIN, 'sec-fetch-site': 'same-origin' }
    })
  assert.equal((await del(stranger)).status, 404)
  assert.equal((await del(cookie)).status, 204)
  assert.equal((await h.api('/v1/me', viaSettings.access_token)).status, 401)
  assert.deepEqual(
    (await (await h.app.request(`${ORIGIN}/api/me/connected-apps`, { headers: { cookie } })).json()).apps,
    []
  )
})
