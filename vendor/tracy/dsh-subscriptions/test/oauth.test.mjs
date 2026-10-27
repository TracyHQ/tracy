import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAuthorizeUrl, parseCallbackInput } from '../lib/oauth.js'

test('authorize URL includes S256', () => {
  const url = buildAuthorizeUrl({
    authUrl: 'https://example.com/oauth/authorize',
    clientId: 'YOUR_CLIENT_ID',
    redirectUri: 'https://example.com/dsh-subscriptions/oauth/callback',
    challenge: 'abc',
    state: 'st',
    extra: { foo: 'bar' },
  })
  assert.match(url, /code_challenge_method=S256/)
  assert.match(url, /code_challenge=abc/)
  assert.match(url, /foo=bar/)
})

test('parseCallbackInput accepts URL or raw code', () => {
  assert.equal(parseCallbackInput('https://example.com/cb?code=abc&state=s').code, 'abc')
  assert.equal(parseCallbackInput('plaincode').code, 'plaincode')
  assert.equal(parseCallbackInput('authcode#stateval').state, 'stateval')
})
