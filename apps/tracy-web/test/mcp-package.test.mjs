import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync, strFromU8 } from 'fflate'
import sharp from 'sharp'
import { pluginArchive } from '../scripts/package-chatgpt-plugin.mjs'

const apiOrigin = 'https://api.example.test'
const tracyOrigin = 'https://tracy.example.test'
function endpoints({
  missing = false,
  wrongIssuer = false,
  noPkce = false,
  resourceOrigin = apiOrigin,
  issuer = tracyOrigin
} = {}) {
  return async (url, init) => {
    if (missing) return new Response('', { status: 404 })
    if (url.endsWith('/.well-known/oauth-protected-resource'))
      return Response.json({
        resource: `${resourceOrigin}/mcp`,
        authorization_servers: [issuer],
        scopes_supported: ['content']
      })
    if (url.endsWith('/.well-known/oauth-authorization-server'))
      return Response.json({
        issuer: wrongIssuer ? 'https://evil.test' : issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${resourceOrigin}/oauth/token`,
        code_challenge_methods_supported: noPkce ? [] : ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        authorization_response_iss_parameter_supported: true
      })
    assert.equal(init.method, 'POST')
    assert.equal(init.headers.authorization, undefined)
    assert.equal(JSON.parse(init.body).method, 'tools/list')
    return Response.json(
      { code: 'NOT_SIGNED_IN' },
      {
        status: 401,
        headers: {
          'www-authenticate': `Bearer resource_metadata="${resourceOrigin}/.well-known/oauth-protected-resource"`
        }
      }
    )
  }
}

test('plugin packaging refuses unverified endpoints, wrong issuers and servers without PKCE', async () => {
  for (const options of [{ missing: true }, { wrongIssuer: true }, { noPkce: true }])
    await assert.rejects(pluginArchive({ apiOrigin, tracyOrigin, fetchImpl: endpoints(options) }))
  for (const bad of [
    'http://api.example.test',
    'https://api.example.test/path',
    'https://user:secret@api.example.test',
    'https://api.example.test/?secret=x'
  ])
    await assert.rejects(pluginArchive({ apiOrigin: bad, tracyOrigin, fetchImpl: endpoints() }))
})

test('plugin ZIP contains one portable Tracy plugin, real branded PNG and OAuth connection, with no credentials or App binding', async () => {
  const archive = await pluginArchive({ apiOrigin, tracyOrigin, fetchImpl: endpoints() })
  const files = unzipSync(archive)
  assert.deepEqual(Object.keys(files).sort(), [
    'tracy/assets/icon.png',
    'tracy/mcp.json',
    'tracy/plugin.json',
    'tracy/skills/manage-site/SKILL.md'
  ])
  const plugin = JSON.parse(strFromU8(files['tracy/plugin.json']))
  assert.equal(plugin.name, 'tracy')
  assert.equal(plugin.extensions['com.openai'].interface.displayName, 'Tracy')
  assert.ok(plugin.extensions['com.openai'].interface.shortDescription.length <= 30)
  assert.equal(plugin.extensions['com.openai'].apps, undefined)
  const connection = JSON.parse(strFromU8(files['tracy/mcp.json'])).mcpServers.tracy
  assert.equal(connection.url, `${apiOrigin}/mcp`)
  assert.deepEqual(connection.extensions['com.openai'].auth.client, {
    mode: 'provided',
    clientId: 'tracy-chatgpt',
    tokenEndpointAuthMethod: 'none'
  })
  assert.equal(connection.extensions['com.openai'].auth.resource, `${apiOrigin}/mcp`)
  assert.ok(!JSON.stringify(connection).includes('clientSecret'))
  const icon = await sharp(files['tracy/assets/icon.png']).metadata()
  assert.equal(icon.format, 'png')
  assert.equal(icon.width, 512)
  assert.equal(icon.height, 512)
  assert.match(strFromU8(files['tracy/skills/manage-site/SKILL.md']), /never bypass|Never bypass/)
})

test('packaging supports MCP and sign-in on cowork.tracy.ai together', async () => {
  const origin = 'https://cowork.tracy.ai'
  const archive = await pluginArchive({
    apiOrigin: origin,
    tracyOrigin: origin,
    fetchImpl: endpoints({ resourceOrigin: origin, issuer: origin })
  })
  const connection = JSON.parse(strFromU8(unzipSync(archive)['tracy/mcp.json'])).mcpServers.tracy
  assert.equal(connection.url, 'https://cowork.tracy.ai/mcp')
  assert.equal(connection.extensions['com.openai'].auth.tokenUrl, 'https://cowork.tracy.ai/oauth/token')
})
