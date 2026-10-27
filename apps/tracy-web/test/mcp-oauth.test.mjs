import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { mintKey, parseKey, revokeKey } from '../src/lib/api-key.js'
import { CLIENT_ID, REDIRECT_URI } from '../src/mcp/oauth-store.js'
import { writeComponent } from '../src/sites/store.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { consentPage } from '../src/mcp/pages.js'
import { WEB_LANGUAGES } from '../src/lib/i18n/index.js'
import { CLAUDE_REDIRECT_URI, NATIVE_CLIENTS } from '../src/mcp/clients.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const ORIGIN = 'http://tracy.test:8080'
const API = 'http://api.test'
const SITE = 'lantern.localhost'
const OTHER = 'other.localhost'
const PEPPER = 'p'.repeat(32)
const VERIFIER = 'v'.repeat(43)
const challenge = createHash('sha256').update(VERIFIER).digest('base64url')
const base = {
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  resource: `${API}/mcp`,
  scope: 'content',
  state: 'client-state',
  code_challenge: challenge,
  code_challenge_method: 'S256'
}

test(
  'Claude CIMD consent and token rotation stay bound to their client on the canonical product origin',
  opts,
  async () => {
    const mcpOrigin = ORIGIN
    const clientId = 'https://claude.ai/oauth/example-client-metadata'
    const clientFetch = async () =>
      Response.json({
        client_id: clientId,
        token_endpoint_auth_method: 'none',
        redirect_uris: [CLAUDE_REDIRECT_URI],
        client_name: 'Forged app name'
      })
    const h = await setup({ mcpOrigin, clientFetch })
    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp'
    ]) {
      const r = await h.app.request(`${mcpOrigin}${path}`)
      assert.equal(r.status, 200)
      assert.equal((await r.json()).resource, `${mcpOrigin}/mcp`)
    }
    assert.equal((await h.app.request(`${API}/mcp`)).status, 404)
    const consent = await h.getConsent({ client_id: clientId, redirect_uri: CLAUDE_REDIRECT_URI })
    assert.equal(consent.response.status, 200, consent.html)
    assert.match(consent.html, /data-mcp-client-host>claude\.ai<\/code>/)
    assert.ok(!consent.html.includes('ChatGPT') && !consent.html.includes('Forged app name'))
    const approved = await h.approve(consent)
    assert.equal(approved.status, 303)
    const callback = new URL(approved.headers.get('location'))
    assert.equal(callback.origin + callback.pathname, CLAUDE_REDIRECT_URI)
    const code = callback.searchParams.get('code')
    // Another valid client cannot consume the code or revoke/rotate the resulting connection.
    assert.equal((await h.redeem(code)).status, 400)
    const issued = await h.redeem(code, { client_id: clientId, redirect_uri: CLAUDE_REDIRECT_URI })
    assert.equal(issued.status, 200, await issued.clone().text())
    const tokens = await issued.json()
    assert.equal((await h.refresh(tokens.refresh_token)).status, 400)
    const rotated = await h.token({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token
    })
    assert.equal(rotated.status, 200)
    const refreshed = await rotated.json()
    const revoked = await h.app.request(`${mcpOrigin}/oauth/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, token: refreshed.refresh_token })
    })
    assert.equal(revoked.status, 200)
    assert.equal(
      (
        await h.mcp(rpc('initialize', { protocolVersion: '2025-11-25' }), refreshed.access_token, {
          origin: 'https://claude.ai',
          cookie: await h.cookie()
        })
      ).status,
      200
    )
    assert.equal((await h.mcp(rpc('tools/list'), null, { cookie: await h.cookie() })).status, 401)
    assert.equal(
      (
        await h.token({
          client_id: clientId,
          grant_type: 'refresh_token',
          refresh_token: refreshed.refresh_token
        })
      ).status,
      200
    )
  }
)
const rpc = (method, params = {}) => ({ jsonrpc: '2.0', id: 1, method, params })

async function setup({ mcpOrigin, clientFetch } = {}) {
  const { pool } = db
  const config = readConfig({
    TRACY_ORIGIN: ORIGIN,
    API_ORIGIN: API,
    ...(mcpOrigin === ORIGIN ? {} : { MCP_ORIGIN: mcpOrigin || API }),
    API_KEY_PEPPER: PEPPER,
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  })
  for (const [key, label] of [
    [SITE, 'lantern'],
    [OTHER, 'other']
  ])
    await pool.query("insert into site (site_key,label,host,platform) values ($1,$2,'local','joomla')", [
      key,
      label
    ])
  const users = {}
  for (const [email, role, accepted, key] of [
    ['owner@x.y', 'owner', true, SITE],
    ['other@x.y', 'owner', true, OTHER],
    ['viewer@x.y', 'viewer', true, SITE],
    ['pending@x.y', 'editor', false, SITE]
  ]) {
    const account = (await pool.query('insert into account (email) values ($1) returning id', [email]))
      .rows[0]
    users[email] = account.id
    await pool.query(
      'insert into seat (site_key,account_id,role,granted_by,accepted_at) values ($1,$2,$3,$2,$4)',
      [key, account.id, role, accepted ? new Date() : null]
    )
  }
  await writeComponent(
    pool,
    SITE,
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
  const calls = []
  const app = buildApp({
    ...(clientFetch ? { mcpClientFetch: clientFetch } : {}),
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body)
      calls.push(body)
      return Response.json({ ok: true, updated: true })
    }
  })
  const cookie = async (email = 'owner@x.y') => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const getConsent = async (overrides = {}, email = 'owner@x.y') => {
    const response = await app.request(
      `${ORIGIN}/oauth/authorize?${new URLSearchParams({ ...base, resource: `${mcpOrigin || API}/mcp`, ...overrides })}`,
      { headers: { cookie: await cookie(email) } }
    )
    const html = await response.text()
    return {
      response,
      html,
      request: /name="request" value="([^"]+)"/.exec(html)?.[1],
      signature: /name="signature" value="([^"]+)"/.exec(html)?.[1]
    }
  }
  const approve = async (
    consent,
    {
      email = 'owner@x.y',
      siteKey = SITE,
      origin = ORIGIN,
      decision = 'allow',
      signature = consent.signature
    } = {}
  ) =>
    app.request(`${ORIGIN}/oauth/authorize`, {
      method: 'POST',
      headers: {
        cookie: await cookie(email),
        origin,
        'content-type': 'application/x-www-form-urlencoded',
        'sec-fetch-site': origin === ORIGIN ? 'same-origin' : 'same-site'
      },
      body: new URLSearchParams({ request: consent.request, signature, siteKey, decision }).toString()
    })
  const token = (body) =>
    app.request(`${mcpOrigin || API}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        resource: `${mcpOrigin || API}/mcp`,
        ...body
      }).toString()
    })
  const redeem = (code, extra = {}) =>
    token({
      grant_type: 'authorization_code',
      code,
      code_verifier: VERIFIER,
      redirect_uri: REDIRECT_URI,
      ...extra
    })
  const refresh = (value) => token({ grant_type: 'refresh_token', refresh_token: value })
  const connect = async () => {
    const approved = await approve(await getConsent())
    assert.equal(approved.status, 303, await approved.text())
    const callback = new URL(approved.headers.get('location'))
    assert.equal(callback.searchParams.get('state'), base.state)
    assert.equal(callback.searchParams.get('iss'), ORIGIN)
    const code = callback.searchParams.get('code')
    const redeemed = await redeem(code)
    assert.equal(redeemed.status, 200, await redeemed.clone().text())
    return { ...(await redeemed.json()), code }
  }
  const mcp = (message, access = null, extra = {}) =>
    app.request(`${mcpOrigin || API}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...(access ? { authorization: `Bearer ${access}` } : {}),
        ...extra
      },
      body: JSON.stringify(message)
    })
  return {
    app,
    pool,
    config,
    cookie,
    users,
    calls,
    getConsent,
    approve,
    token,
    redeem,
    refresh,
    connect,
    mcp
  }
}

test(
  'OAuth discovery names the exact issuer, resource, PKCE and endpoints on their correct hosts',
  opts,
  async () => {
    const { app } = await setup()
    const protectedResource = await (await app.request(`${API}/.well-known/oauth-protected-resource`)).json()
    assert.equal(protectedResource.resource, `${API}/mcp`)
    assert.deepEqual(protectedResource.authorization_servers, [ORIGIN])
    const metadata = await (await app.request(`${ORIGIN}/.well-known/oauth-authorization-server`)).json()
    assert.equal(metadata.issuer, ORIGIN)
    assert.equal(metadata.token_endpoint, `${API}/oauth/token`)
    assert.deepEqual(metadata.code_challenge_methods_supported, ['S256'])
    assert.equal(metadata.authorization_response_iss_parameter_supported, true)
  }
)

test(
  'OAuth validates client, exact callback, resource, scope and S256 before redirecting or showing consent',
  opts,
  async () => {
    const { app, getConsent } = await setup()
    for (const overrides of [
      { client_id: 'evil' },
      { redirect_uri: 'https://evil.test/callback' },
      { resource: 'https://evil.test' },
      { scope: 'content code' },
      { code_challenge_method: 'plain' },
      { code_challenge: '' },
      { state: '' }
    ]) {
      const { response } = await getConsent(overrides)
      assert.equal(response.status, 400)
      assert.equal(response.headers.get('location'), null)
    }
    const signedOut = await app.request(`${ORIGIN}/oauth/authorize?${new URLSearchParams(base)}`)
    assert.equal(signedOut.status, 302)
    assert.ok(signedOut.headers.get('location').startsWith('/login?next='))
  }
)

test(
  'OAuth consent names only accepted editable sites, escapes names, and binds consent to the signed-in account',
  opts,
  async () => {
    const { getConsent, approve } = await setup()
    const consent = await getConsent()
    assert.equal(consent.response.status, 200)
    assert.ok(consent.html.includes('data-mcp-client-host>chatgpt.com</code>'))
    assert.ok(consent.html.includes(SITE))
    assert.ok(!consent.html.includes(OTHER))
    assert.match(consent.response.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    assert.equal((await approve(consent, { siteKey: OTHER })).status, 403)
    assert.equal((await approve(consent, { email: 'other@x.y' })).status, 403)
    assert.equal((await approve(consent, { signature: 'wrong' })).status, 400)
    assert.equal((await approve(consent, { signature: 'é'.repeat(64) })).status, 400)
    assert.equal((await approve(consent, { origin: 'https://customer.test' })).status, 403)
    for (const email of ['viewer@x.y', 'pending@x.y'])
      assert.match((await getConsent({}, email)).html, /value="allow" disabled/)
  }
)

test(
  'OAuth cancellation returns access_denied and preserves client state and issuer without issuing a key',
  opts,
  async () => {
    const { getConsent, approve, pool } = await setup()
    const res = await approve(await getConsent(), { decision: 'deny' })
    assert.equal(res.status, 303)
    const url = new URL(res.headers.get('location'))
    assert.equal(url.searchParams.get('error'), 'access_denied')
    assert.equal(url.searchParams.get('state'), base.state)
    assert.equal((await pool.query('select * from api_key')).rows.length, 0)
  }
)

test(
  'OAuth PKCE: wrong verifier cannot redeem a code; the correct verifier can; replay revokes the issued grant',
  opts,
  async () => {
    const { getConsent, approve, redeem, mcp } = await setup()
    const res = await approve(await getConsent())
    const code = new URL(res.headers.get('location')).searchParams.get('code')
    assert.equal((await redeem(code, { code_verifier: 'w'.repeat(43) })).status, 400)
    const issued = await redeem(code)
    assert.equal(issued.status, 200)
    const key = (await issued.json()).access_token
    assert.equal((await mcp(rpc('tools/list'), key)).status, 200)
    assert.equal((await redeem(code)).status, 400)
    assert.equal((await mcp(rpc('tools/list'), key)).status, 401)
  }
)

test(
  'OAuth through buildApp reaches REST with the key’s real site principal and refuses cookies and cross-site calls',
  opts,
  async () => {
    const { connect, mcp, cookie, calls } = await setup()
    const issued = await connect()
    assert.equal((await mcp(rpc('tools/list'), null, { cookie: await cookie() })).status, 401)
    const me = (
      await (
        await mcp(rpc('tools/call', { name: 'tracy_get_me', arguments: {} }), issued.access_token)
      ).json()
    ).result
    assert.equal(me.structuredContent.body.siteKey, SITE)
    assert.equal(me.structuredContent.body.email, 'owner@x.y')
    const other = (
      await (
        await mcp(
          rpc('tools/call', { name: 'tracy_get_sites_by_key', arguments: { path: { key: OTHER } } }),
          issued.access_token
        )
      ).json()
    ).result
    assert.equal(other.isError, true)
    assert.equal(other.structuredContent.status, 403)
    assert.equal(calls.length, 0)
    const updated = (
      await (
        await mcp(
          rpc('tools/call', {
            name: 'tracy_patch_sites_by_key_records_by_kind_by_id',
            arguments: {
              path: { key: SITE, kind: 'article', id: '1' },
              header: { 'Tracy-Apply-Id': 'mcp-change-1' },
              body: { fields: { title: 'New title' } }
            }
          }),
          issued.access_token
        )
      ).json()
    ).result
    assert.equal(updated.isError, false, JSON.stringify(updated))
    assert.equal(updated.structuredContent.headers['tracy-apply-id'], 'mcp-change-1')
    assert.equal(calls.length, 1)
    const history = (
      await (
        await mcp(
          rpc('tools/call', { name: 'tracy_get_sites_by_key_applies', arguments: { path: { key: SITE } } }),
          issued.access_token
        )
      ).json()
    ).result
    assert.ok(history.structuredContent.body.applyIds.includes('mcp-change-1'), JSON.stringify(history))
  }
)

test(
  'OAuth: refresh rotates secrets under one key id, preserving the audit identity; replay ends the connection',
  opts,
  async () => {
    const { connect, refresh, mcp, pool } = await setup()
    const first = await connect()
    const res = await refresh(first.refresh_token)
    assert.equal(res.status, 200, await res.clone().text())
    const second = await res.json()
    assert.notEqual(second.access_token, first.access_token)
    assert.notEqual(second.refresh_token, first.refresh_token)
    assert.equal(parseKey(`Bearer ${second.access_token}`).id, parseKey(`Bearer ${first.access_token}`).id)
    assert.equal((await pool.query('select * from api_key')).rows.length, 1)
    assert.equal((await mcp(rpc('tools/list'), first.access_token)).status, 401)
    assert.equal((await mcp(rpc('tools/list'), second.access_token)).status, 200)
    assert.equal((await refresh(first.refresh_token)).status, 400)
    assert.equal((await mcp(rpc('tools/list'), second.access_token)).status, 401)
    assert.equal((await refresh(second.refresh_token)).status, 400)
  }
)

test('OAuth: API key revocation in Settings and seat revocation each prevent refresh', opts, async () => {
  const { connect, refresh, mcp, pool, users } = await setup()
  const first = await connect()
  await revokeKey(pool, users['owner@x.y'], parseKey(`Bearer ${first.access_token}`).id)
  assert.equal((await refresh(first.refresh_token)).status, 400)
  const second = await connect()
  await pool.query(
    "insert into seat (site_key,account_id,role,granted_by,accepted_at) values ($1,$2,'owner',$2,now())",
    [SITE, users['other@x.y']]
  )
  await pool.query('update seat set revoked_at = now() where account_id = $1', [users['owner@x.y']])
  assert.equal((await mcp(rpc('tools/list'), second.access_token)).status, 403)
  assert.equal((await refresh(second.refresh_token)).status, 400)
})

test('OAuth: tokens minted without ChatGPT consent cannot authenticate MCP', opts, async () => {
  const { pool, users, mcp } = await setup()
  const ordinary = await mintKey({
    pool,
    accountId: users['owner@x.y'],
    siteKey: SITE,
    label: 'ordinary',
    scopes: ['content'],
    pepper: PEPPER
  })
  assert.equal((await mcp(rpc('tools/list'), ordinary.key)).status, 401)
})

test(
  'OAuth revoke checks possession, ignores unknown tokens, and invalidates both access and refresh',
  opts,
  async () => {
    const { connect, app, refresh, mcp } = await setup()
    const issued = await connect()
    const revoke = (token) =>
      app.request(`${API}/oauth/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, token }).toString()
      })
    const guessed = issued.access_token.slice(0, -32) + 'a'.repeat(32)
    assert.equal((await revoke(guessed)).status, 200)
    assert.equal((await mcp(rpc('tools/list'), issued.access_token)).status, 200)
    assert.equal((await revoke(issued.refresh_token)).status, 200)
    assert.equal((await mcp(rpc('tools/list'), issued.access_token)).status, 401)
    assert.equal((await refresh(issued.refresh_token)).status, 400)
  }
)

test('OAuth consent uses translated copy for all supported languages and escapes account/site data', () => {
  for (const lang of WEB_LANGUAGES) {
    const html = consentPage({
      email: '<script>',
      sites: [{ site_key: 'x.test', display_name: '<img>' }],
      request: 'request',
      signature: 'signature',
      lang
    })
    assert.ok(!html.includes('mcp.title'))
    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('data-mcp-client-host>chatgpt.com</code>'))
    assert.ok(html.includes('&lt;script&gt;'))
    assert.ok(html.includes('&lt;img&gt;'))
    if (lang !== 'en') assert.ok(!html.includes('Connect Tracy to ChatGPT'))
  }
})

test(
  'OAuth lifetimes: expired access can refresh; expired consent and authorization codes cannot',
  opts,
  async () => {
    const { connect, refresh, mcp, pool, getConsent, approve, redeem } = await setup()
    const issued = await connect()
    await pool.query("update api_key set expires_at = now() - interval '1 minute'")
    assert.equal((await mcp(rpc('tools/list'), issued.access_token)).status, 401)
    const rotated = await refresh(issued.refresh_token)
    assert.equal(rotated.status, 200)
    const second = await rotated.json()
    assert.equal((await mcp(rpc('tools/list'), second.access_token)).status, 200)
    await pool.query("update mcp_oauth_grant set expires_at = now() - interval '1 minute'")
    assert.equal((await mcp(rpc('tools/list'), second.access_token)).status, 401)
    assert.equal((await refresh(second.refresh_token)).status, 400)
    const approved = await approve(await getConsent())
    const code = new URL(approved.headers.get('location')).searchParams.get('code')
    await pool.query("update mcp_oauth_code set expires_at = now() - interval '1 minute'")
    assert.equal((await redeem(code)).status, 400)
  }
)

test(
  'OAuth concurrent refresh: exactly one rotation wins, reuse revokes the entire connection',
  opts,
  async () => {
    const { connect, refresh, mcp } = await setup()
    const issued = await connect()
    const answers = await Promise.all([refresh(issued.refresh_token), refresh(issued.refresh_token)])
    assert.deepEqual(answers.map((a) => a.status).sort(), [200, 400])
    const winner = await answers.find((a) => a.status === 200).json()
    assert.equal((await mcp(rpc('tools/list'), winner.access_token)).status, 401)
  }
)

for (const client of NATIVE_CLIENTS) {
  for (const uri of client.redirectUris) {
    test(
      `${client.id} ${uri}: consent, PKCE, resource, client/grant isolation, rotation and revoke`,
      opts,
      async () => {
        const h = await setup({ mcpOrigin: ORIGIN })
        const identity = { client_id: client.id, redirect_uri: uri }
        const consent = await h.getConsent(identity)
        assert.equal(consent.response.status, 200)
        assert.ok(consent.html.includes(client.name))
        assert.ok(consent.html.includes(new URL(uri).host))
        const approved = await h.approve(consent)
        assert.equal(approved.status, 303)
        const callback = new URL(approved.headers.get('location'))
        assert.equal(callback.origin + callback.pathname, uri)
        assert.equal(callback.searchParams.get('iss'), ORIGIN)
        assert.equal(callback.searchParams.get('state'), base.state)
        const code = callback.searchParams.get('code')
        assert.equal((await h.redeem(code, { ...identity, code_verifier: 'x'.repeat(43) })).status, 400)
        assert.equal((await h.redeem(code, { ...identity, resource: 'https://evil.test/mcp' })).status, 400)
        for (const other of NATIVE_CLIENTS.filter((entry) => entry.id !== client.id)) {
          assert.equal(
            (await h.redeem(code, { client_id: other.id, redirect_uri: other.redirectUris[0] })).status,
            400
          )
        }
        if (client.redirectUris.length > 1) {
          const different = client.redirectUris.find((value) => value !== uri)
          assert.equal((await h.redeem(code, { ...identity, redirect_uri: different })).status, 400)
        }
        const issued = await h.redeem(code, identity)
        assert.equal(issued.status, 200, await issued.clone().text())
        const tokens = await issued.json()
        const invoke = (token, siteKey) =>
          h.mcp(
            rpc('tools/call', { name: 'tracy_get_sites_by_key', arguments: { path: { key: siteKey } } }),
            token
          )
        assert.equal((await h.mcp(rpc('tools/list'), tokens.access_token)).status, 200)
        // The ordinary REST scope fence is exercised through the real MCP router below.
        const foreign = await invoke(tokens.access_token, OTHER)
        assert.equal(foreign.status, 200)
        const foreignBody = await foreign.json()
        assert.equal(foreignBody.result.isError, true)
        assert.equal(foreignBody.result.structuredContent.status, 403)
        assert.equal(h.calls.length, 0)
        for (const other of NATIVE_CLIENTS.filter((entry) => entry.id !== client.id)) {
          assert.equal(
            (
              await h.token({
                client_id: other.id,
                grant_type: 'refresh_token',
                refresh_token: tokens.refresh_token
              })
            ).status,
            400
          )
          const refusedRevoke = await h.app.request(`${ORIGIN}/oauth/revoke`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: other.id, token: tokens.refresh_token })
          })
          assert.equal(refusedRevoke.status, 200)
        }
        const rotated = await h.token({
          client_id: client.id,
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token
        })
        assert.equal(rotated.status, 200)
        const next = await rotated.json()
        assert.equal(parseKey(`Bearer ${tokens.access_token}`).id, parseKey(`Bearer ${next.access_token}`).id)
        assert.equal((await h.mcp(rpc('tools/list'), tokens.access_token)).status, 401)
        assert.equal((await h.mcp(rpc('tools/list'), next.access_token)).status, 200)
        const revoked = await h.app.request(`${ORIGIN}/oauth/revoke`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: client.id, token: next.access_token })
        })
        assert.equal(revoked.status, 200)
        assert.equal((await h.mcp(rpc('tools/list'), next.access_token)).status, 401)
        assert.equal(
          (
            await h.token({
              client_id: client.id,
              grant_type: 'refresh_token',
              refresh_token: next.refresh_token
            })
          ).status,
          400
        )
      }
    )
  }
}
