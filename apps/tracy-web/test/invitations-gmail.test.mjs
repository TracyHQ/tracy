import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { GMAIL_SCOPES, gmailStatus, invitationsGmailRoutes } from '../src/invitations/gmail.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pg = { skip: !process.env.TEST_DATABASE_URL }
const origin = 'http://localhost:8080'
const config = {
  origin,
  secure: false,
  invitationsGmail: {
    clientId: 'fixture-client',
    clientSecret: 'fixture-secret',
    keyId: 'fixture-key-1',
    key: Buffer.alloc(32, 7).toString('base64'),
    address: 'sender@example.com'
  }
}
const session = 'tracy_sess=fixture-signed-session'
function harness(profileAddress = 'sender@example.com', scopes = GMAIL_SCOPES) {
  const calls = []
  const fetcher = async (url, init) => {
    calls.push({ url, init })
    if (url.endsWith('/token'))
      return Response.json({
        access_token: 'fixture-access',
        refresh_token: 'fixture-refresh',
        scope: scopes.join(' ')
      })
    if (url.endsWith('/profile')) return Response.json({ emailAddress: profileAddress })
    if (url.endsWith('/revoke')) return Response.json({})
    throw new Error('unexpected provider request')
  }
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('invitationsActor', { email: 'owner@fixture.test', role: 'owner' })
    await next()
  })
  app.route('/gmail', invitationsGmailRoutes({ pool: db.pool, config, fetcher }))
  const request = (path, { method = 'GET', cookie = session, requestOrigin = origin } = {}) =>
    app.fetch(
      new Request(`${origin}/gmail${path}`, {
        method,
        redirect: 'manual',
        headers: { cookie, ...(method === 'POST' ? { origin: requestOrigin } : {}) }
      })
    )
  return { request, calls }
}
async function begin(h) {
  const response = await h.request('/connect', { method: 'POST' })
  assert.equal(response.status, 200)
  const stateCookie = response.headers.get('set-cookie')
  assert.match(stateCookie, /tracy_invitations_gmail_state=/)
  assert.match(stateCookie, /HttpOnly; SameSite=Lax/)
  assert.match(stateCookie, /Path=\/api\/ops\/invitations\/gmail\/callback; Max-Age=600/)
  const authorizationUrl = new URL((await response.json()).authorizationUrl)
  assert.equal(
    authorizationUrl.searchParams.get('redirect_uri'),
    `${origin}/api/ops/invitations/gmail/callback`
  )
  assert.equal(authorizationUrl.searchParams.get('access_type'), 'offline')
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256')
  const state = authorizationUrl.searchParams.get('state')
  return { state, cookie: `${session}; tracy_invitations_gmail_state=${state}` }
}
test(
  'OAuth verifies mailbox/scopes, stores only encrypted refresh token and blocks callback replay',
  pg,
  async () => {
    const h = harness()
    const flow = await begin(h)
    const result = await h.request(`/callback?state=${flow.state}&code=fixture-code`, { cookie: flow.cookie })
    assert.equal(result.status, 303)
    assert.match(result.headers.get('set-cookie'), /Max-Age=0/)
    assert.equal(result.headers.get('location'), '/ops/invitations?gmail=connected')
    const status = await (await h.request('')).json()
    assert.equal(status.status, 'connected')
    assert.equal(status.address, 'sender@example.com')
    assert.equal(status.read, true)
    assert.equal(status.send, true)
    assert.equal(status.sendingEnabled, false)
    const row = (await db.pool.query("select * from invitations_mailbox where id='gmail'")).rows[0]
    assert.equal(row.refresh_cipher.includes('fixture-refresh'), false)
    assert.equal(row.key_id, 'fixture-key-1')
    const lostKey = await gmailStatus(db.pool, {
      ...config,
      invitationsGmail: { ...config.invitationsGmail, key: Buffer.alloc(32, 8).toString('base64') }
    })
    assert.equal(lostKey.status, 'reconnect_required')
    assert.equal(lostKey.send, false)
    assert.equal(
      (
        await h.request(`/callback?state=${flow.state}&code=fixture-code`, { cookie: flow.cookie })
      ).headers.get('location'),
      '/ops/invitations?gmail=invalid_state'
    )
    assert.equal(h.calls.filter((call) => call.url.endsWith('/token')).length, 1)
    const disconnected = await (await h.request('/disconnect', { method: 'POST' })).json()
    assert.equal(disconnected.status, 'disconnected')
    assert.equal(disconnected.revocation, 'succeeded')
    assert.equal(disconnected.generation, 2)
  }
)
test('expired OAuth state fails closed on the database clock', pg, async () => {
  const h = harness()
  const flow = await begin(h)
  await db.pool.query("update invitations_mailbox_oauth set expires_at=now()-interval '1 second'")
  const result = await h.request(`/callback?state=${flow.state}&code=x`, { cookie: flow.cookie })
  assert.equal(result.headers.get('location'), '/ops/invitations?gmail=invalid_state')
  assert.equal(h.calls.length, 0)
})

test('wrong mailbox, missing scope, cross-origin mutation and stale flow fail closed', pg, async () => {
  const wrong = harness('other@fixture.test')
  assert.equal(
    (await wrong.request('/connect', { method: 'POST', requestOrigin: 'http://elsewhere.test' })).status,
    403
  )
  const first = await begin(wrong)
  const second = await begin(wrong)
  assert.equal(
    (await wrong.request(`/callback?state=${first.state}&code=x`, { cookie: first.cookie })).headers.get(
      'location'
    ),
    '/ops/invitations?gmail=invalid_state'
  )
  assert.equal(
    (await wrong.request(`/callback?state=${second.state}&code=x`, { cookie: second.cookie })).headers.get(
      'location'
    ),
    '/ops/invitations?gmail=wrong_mailbox'
  )
  assert.equal((await (await wrong.request('')).json()).status, 'reconnect_required')
  const limited = harness('sender@example.com', [GMAIL_SCOPES[0]])
  const third = await begin(limited)
  assert.equal(
    (await limited.request(`/callback?state=${third.state}&code=x`, { cookie: third.cookie })).headers.get(
      'location'
    ),
    '/ops/invitations?gmail=missing_scope'
  )
  assert.equal((await (await limited.request('')).json()).send, false)
})
