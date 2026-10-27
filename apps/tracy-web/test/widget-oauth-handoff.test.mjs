import assert from 'node:assert/strict'
import { test } from 'node:test'
import { identityRoutes } from '../src/identity/route.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { verifySession } from '../src/lib/session.js'

const origin = 'https://widget.example.test',
  secret = 'widget-test-secret'
const claims = Buffer.from(
  JSON.stringify({ sub: 'widget-subject', email: 'widget-auth@example.test', email_verified: true })
).toString('base64url')
test('widget receives a fresh OAuth session only after the provider and both state checks succeeded', async () => {
  const delivered = []
  const app = identityRoutes({
    store: memoryIdentityStore(),
    mail: { send: async () => {} },
    config: {
      origin,
      sessionSecret: secret,
      secure: true,
      oauth: { google: { id: 'client', secret: 'test-secret' } }
    },
    onOAuthSession: (session) => delivered.push(session),
    fetchImpl: async () => Response.json({ id_token: 'e30.' + claims + '.mock', access_token: 'mock-access' })
  })
  const start = await app.request(
    origin + '/signin/google?next=' + encodeURIComponent('/widget/oauth/complete?flow=test-flow')
  )
  const state = new URL(start.headers.get('location')).searchParams.get('state')
  const stateCookie = start.headers.get('set-cookie').split(';')[0]
  const refused = await app.request(origin + '/signin/google/callback?state=' + state + '&code=mock-code')
  assert.equal(refused.status, 400)
  assert.equal(delivered.length, 0)
  const done = await app.request(origin + '/signin/google/callback?state=' + state + '&code=mock-code', {
    headers: { cookie: stateCookie }
  })
  assert.equal(done.status, 302)
  assert.equal(delivered.length, 1)
  assert.equal(delivered[0].next, origin + '/widget/oauth/complete?flow=test-flow')
  assert.equal(await verifySession(delivered[0].token, secret), 'widget-auth@example.test')
})
