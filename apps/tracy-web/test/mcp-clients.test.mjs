import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oauthClient, CLAUDE_REDIRECT_URI, NATIVE_CLIENTS, acceptsRedirect } from '../src/mcp/clients.js'

const id = 'https://claude.ai/oauth/example-client-metadata'
const metadata = {
  client_id: id,
  token_endpoint_auth_method: 'none',
  redirect_uris: [CLAUDE_REDIRECT_URI],
  client_name: 'Untrusted document label'
}

test('CIMD never fetches arbitrary hosts, credentials, redirects or non-JSON/oversized metadata', async () => {
  const never = () => {
    throw new Error('must not fetch')
  }
  for (const bad of [
    'http://claude.ai/oauth/a',
    'https://claude.ai.evil.test/a',
    'https://evil.test/a',
    'https://user@claude.ai/a',
    `${id}?x=y`,
    `${id}#x`
  ])
    assert.equal(await oauthClient(bad, never), null)
  for (const doc of [
    { ...metadata, client_id: 'https://evil.test/a' },
    { ...metadata, redirect_uris: ['https://evil.test/callback'] },
    { ...metadata, token_endpoint_auth_method: 'client_secret_post' }
  ])
    assert.equal(await oauthClient(id, async () => Response.json(doc)), null)
  assert.equal(
    await oauthClient(
      id,
      async () => new Response('x'.repeat(16385), { headers: { 'content-type': 'application/json' } })
    ),
    null
  )
  assert.equal(await oauthClient(id, async () => new Response(JSON.stringify(metadata))), null)
  assert.equal(
    await oauthClient(id, async (_url, init) => {
      assert.equal(init.redirect, 'error')
      throw new Error('redirect refused')
    }),
    null
  )
})

test('CIMD uses the trusted client host on consent, never the self-asserted document name', async () => {
  const client = await oauthClient(id, async (url, init) => {
    assert.equal(url, id)
    assert.deepEqual(init.headers, { accept: 'application/json' })
    return Response.json(metadata)
  })
  assert.deepEqual(client, { id, name: 'claude.ai', redirectUri: CLAUDE_REDIRECT_URI })
})

test('native public clients accept only their exact callbacks without fetching metadata', async () => {
  for (const expected of NATIVE_CLIENTS) {
    const client = await oauthClient(expected.id, () => assert.fail('static clients never fetch'))
    assert.equal(client.id, expected.id)
    for (const uri of expected.redirectUris) {
      assert.equal(acceptsRedirect(client, uri), true)
      for (const bad of [
        uri + '/',
        uri + '?next=evil',
        uri + '#fragment',
        uri.replace('/callback', '/other')
      ])
        assert.equal(acceptsRedirect(client, bad), false, bad)
    }
    for (const other of NATIVE_CLIENTS.filter((entry) => entry.id !== client.id))
      for (const uri of other.redirectUris) assert.equal(acceptsRedirect(client, uri), false)
    for (const bad of [
      'http://localhost:9999/callback',
      'http://127.0.0.2:17833/callback',
      'http://localhost.evil.test:17832/callback',
      'https://www.cursor.com.evil.test/agents/mcp/oauth/callback',
      'http://user@localhost:17832/callback',
      'http://[::1]:17833/callback'
    ])
      assert.equal(acceptsRedirect(client, bad), false, bad)
  }
  assert.equal(await oauthClient('tracy-unknown'), null)
  assert.equal(acceptsRedirect(null, 'http://localhost:17832/callback'), false)
})
