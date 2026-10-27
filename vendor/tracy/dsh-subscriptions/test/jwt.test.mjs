import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isGoogleClientId, extractGoogleClientIdFromJwt } from '../lib/jwt.js'

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.dummy_sig`
}

test('isGoogleClientId validates Google OAuth client id format', () => {
  assert.equal(isGoogleClientId('123456789-abcdef.apps.googleusercontent.com'), true)
  assert.equal(isGoogleClientId('9876543210-a1b2_c3-d4.apps.googleusercontent.com'), true)
  assert.equal(isGoogleClientId('not-a-google-client-id'), false)
  assert.equal(isGoogleClientId('https://accounts.google.com'), false)
  assert.equal(isGoogleClientId(''), false)
  assert.equal(isGoogleClientId(null), false)
  assert.equal(isGoogleClientId(12345), false)
  assert.equal(isGoogleClientId('  123456789-abcdef.apps.googleusercontent.com  '), true)
})

test('extractGoogleClientIdFromJwt extracts clientId when aud and azp agree', () => {
  const cid = '1234567890-testclient.apps.googleusercontent.com'
  const token = makeJwt({
    iss: 'https://accounts.google.com',
    aud: cid,
    azp: cid,
    email: 'user@example.com',
  })
  assert.equal(extractGoogleClientIdFromJwt(token), cid)
})

test('extractGoogleClientIdFromJwt extracts clientId when aud is array containing azp', () => {
  const cid = '1234567890-testclient.apps.googleusercontent.com'
  const token = makeJwt({
    iss: 'https://accounts.google.com',
    aud: [cid, 'secondary-aud'],
    azp: cid,
  })
  assert.equal(extractGoogleClientIdFromJwt(token), cid)
})

test('extractGoogleClientIdFromJwt extracts clientId when azp is absent and single aud matches', () => {
  const cid = '1234567890-testclient.apps.googleusercontent.com'
  const token = makeJwt({
    iss: 'https://accounts.google.com',
    aud: cid,
  })
  assert.equal(extractGoogleClientIdFromJwt(token), cid)
})

test('extractGoogleClientIdFromJwt returns empty string on conflicting aud and azp', () => {
  const cid1 = '1111111111-client1.apps.googleusercontent.com'
  const cid2 = '2222222222-client2.apps.googleusercontent.com'
  const token = makeJwt({
    iss: 'https://accounts.google.com',
    aud: cid1,
    azp: cid2,
  })
  assert.equal(extractGoogleClientIdFromJwt(token), '')
})

test('extractGoogleClientIdFromJwt returns empty string on non-Google client id in azp/aud', () => {
  const token = makeJwt({
    iss: 'https://accounts.google.com',
    aud: 'my-custom-client-id',
    azp: 'my-custom-client-id',
  })
  assert.equal(extractGoogleClientIdFromJwt(token), '')
})

test('extractGoogleClientIdFromJwt returns empty string on malformed tokens', () => {
  assert.equal(extractGoogleClientIdFromJwt('not-a-jwt'), '')
  assert.equal(extractGoogleClientIdFromJwt(null), '')
  assert.equal(extractGoogleClientIdFromJwt(''), '')
  assert.equal(extractGoogleClientIdFromJwt('header.invalid-base64.sig'), '')
})
