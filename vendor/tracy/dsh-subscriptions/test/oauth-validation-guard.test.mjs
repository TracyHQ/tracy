import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAuthorizeUrl } from '../lib/oauth.js'
import { getVendor } from '../lib/vendors/index.js'
import { Config, plainConfig, publicConfig } from '../lib/config-schema.js'

test('buildAuthorizeUrl throws if clientId is missing or empty', () => {
  assert.throws(
    () => buildAuthorizeUrl({ authUrl: 'https://example.com/auth', clientId: '', redirectUri: 'http://localhost' }),
    { message: /Missing required parameter: clientId/ }
  )
  assert.throws(
    () => buildAuthorizeUrl({ authUrl: 'https://example.com/auth', clientId: '   ', redirectUri: 'http://localhost' }),
    { message: /Missing required parameter: clientId/ }
  )
  assert.throws(
    () => buildAuthorizeUrl({ authUrl: 'https://example.com/auth', clientId: null, redirectUri: 'http://localhost' }),
    { message: /Missing required parameter: clientId/ }
  )
})

test('buildAuthorizeUrl constructs valid URL when clientId is present', () => {
  const urlStr = buildAuthorizeUrl({
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: 'custom-google-client-id.apps.googleusercontent.com',
    redirectUri: 'http://localhost:8085/oauth/callback',
    challenge: 'challenge-xyz',
    state: 'state-123',
  })
  const url = new URL(urlStr)
  assert.equal(url.searchParams.get('client_id'), 'custom-google-client-id.apps.googleusercontent.com')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('state'), 'state-123')
})

test('antigravity authorizeUrl throws descriptive error if clientId is empty (GitHub #2)', () => {
  const agy = getVendor('antigravity')
  assert.throws(
    () => agy.authorizeUrl({ clientId: '' }, { challenge: 'c', state: 's' }),
    { message: /Google OAuth requires a custom Client ID/ }
  )
  assert.throws(
    () => agy.authorizeUrl({}, { challenge: 'c', state: 's' }),
    { message: /Google OAuth requires a custom Client ID/ }
  )
})

test('antigravity authorizeUrl builds valid URL when clientId is configured', () => {
  const agy = getVendor('antigravity')
  const url = agy.authorizeUrl({
    clientId: 'valid-client-id.apps.googleusercontent.com',
    redirectUri: 'http://localhost:8085/oauth/callback',
  }, { challenge: 'c', state: 's' })
  assert.ok(url.includes('client_id=valid-client-id.apps.googleusercontent.com'))
  assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth'))
})

test('glm authorizeUrl points to active bigmodel api keys console without 404 (GitHub #3)', () => {
  const glm = getVendor('glm')
  const url = glm.authorizeUrl()
  assert.equal(url, 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys')
})

test('#252: config schema excludes antigravityClientSecret (stored in credentials)', () => {
  const schemaKeys = Object.keys(Config.dict || {})
  assert.ok(!schemaKeys.includes('antigravityClientSecret'), 'antigravityClientSecret must NOT exist in Config')
  assert.ok(schemaKeys.includes('antigravityClientId'), 'antigravityClientId must exist in Config')

  const parsed = plainConfig(Config({ antigravityClientId: 'my-id' }))
  assert.equal(parsed.antigravityClientId, 'my-id')

  const pub = publicConfig(parsed)
  assert.equal(pub.antigravityClientId, 'my-id')
  assert.equal(pub.antigravityClientSecret, undefined)
})
