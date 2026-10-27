import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NATIVE_CLIENTS } from '../src/mcp/clients.js'
import { oauthRoutes } from '../src/mcp/oauth.js'

const origin = 'https://cowork.tracy.test'
const portalCallback = 'https://chatgpt.com/connector_platform_oauth_redirect'
const app = () =>
  oauthRoutes({
    config: {
      origin,
      apiOrigin: 'https://api.tracy.test',
      apiKeyPepper: 'test-pepper',
      sessionSecret: 's'.repeat(32)
    },
    pool: {
      async query(sql) {
        assert.match(sql, /insert into rate_bucket/)
        return { rows: [{ count: 1 }] }
      }
    },
    seats: { accountByEmail: () => assert.fail('signed-out request must not read accounts') },
    listSites: () => assert.fail('signed-out request must not list sites'),
    resolvePrincipal: () => assert.fail('authorization must not mint a principal'),
    isApiHost: () => true
  })
const authorize = (redirectUri) => {
  const url = new URL('/oauth/authorize', origin)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: 'tracy-chatgpt',
    redirect_uri: redirectUri,
    scope: 'content',
    resource: `${origin}/mcp`,
    code_challenge_method: 'S256',
    code_challenge: 'a'.repeat(43),
    state: 'portal-relay-test'
  }).toString()
  return url.href
}

test('OpenAI Portal callback reaches sign-in instead of invalid_request', async () => {
  const response = await app().request(authorize(portalCallback))
  assert.equal(response.status, 302)
  const location = new URL(response.headers.get('location'), origin)
  assert.equal(location.pathname, '/login')
  const next = new URL(location.searchParams.get('next'), origin)
  assert.equal(next.pathname, '/oauth/authorize')
  assert.equal(next.searchParams.get('redirect_uri'), portalCallback)
  assert.equal(next.searchParams.get('resource'), `${origin}/mcp`)
  assert.equal(response.headers.get('set-cookie'), null)
})

test('OpenAI callback lookalikes and the obsolete callback are refused without redirect', async () => {
  for (const bad of [
    `${portalCallback}/`,
    `${portalCallback}?next=evil`,
    'http://chatgpt.com/connector_platform_oauth_redirect',
    'https://chatgpt.com.evil.test/connector_platform_oauth_redirect',
    'https://evil.test/callback',
    'https://chatgpt.com/connector/oauth/8hQHsvBfEjAn'
  ]) {
    const response = await app().request(authorize(bad))
    assert.equal(response.status, 400, bad)
    assert.equal(response.headers.get('location'), null, bad)
    assert.deepEqual(await response.json(), { error: 'invalid_request' })
  }
})

test('native callback discovery reaches sign-in and binds the request to the exact client', async () => {
  for (const client of NATIVE_CLIENTS) {
    for (const uri of client.redirectUris) {
      const url = new URL(authorize(uri))
      url.searchParams.set('client_id', client.id)
      const response = await app().request(url.href)
      assert.equal(response.status, 302, `${client.id}: ${uri}`)
      const csp = response.headers.get('content-security-policy')
      assert.ok(csp.includes(uri))
      assert.ok(!csp.includes('localhost:*') && !csp.includes('127.0.0.1:*'))
      for (const bad of [
        uri + '?x=y',
        uri.replace('/callback', '/evil'),
        uri.replace(':17833', ':17834'),
        portalCallback
      ]) {
        if (bad === uri) continue
        url.searchParams.set('redirect_uri', bad)
        const refused = await app().request(url.href)
        assert.equal(refused.status, 400, bad)
        assert.equal(refused.headers.get('location'), null)
      }
    }
  }
})
