// The JoomlArt SSO wire contract (`src/identity/joomlart-sso.js`) against aMember's own
// implementation. Every `*_SSO` / `*_SIG` literal below was produced by PHP, never by this module:
// REQ_* and RESP_* are the cross-implementation fixtures of
// `TracyHQ/member/application/joomlartsso/tests/payload-contract-test.php`, REQEXP_* and RESP2_*
// were produced by running that repo's `library/JoomlartSso/Payload.php` in `php:8-cli` on
// 10/10/2026 (an `exp`-bearing request, and values holding the five characters PHP's
// `rawurlencode` and JS's `encodeURIComponent` escape differently: `!'()*`). A byte that differs
// from these is a sign aMember will refuse or a signature Tracy will refuse — never "close enough".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRequest,
  decodePayload,
  encodePayload,
  parseResponse,
  sign,
  verify
} from '../src/identity/joomlart-sso.js'

const SECRET = 'dev-joomlart-sso-shared-secret-change-me'

const REQ_SSO =
  'bm9uY2U9Zml4ZWRub25jZTEyM2FiYyZyZXR1cm5fdXJsPWh0dHAlM0ElMkYlMkZsb2NhbGhvc3QlM0E4NjEwJTJGYXV0aCUyRmpvb21sYXJ0JTJGY2FsbGJhY2s='
const REQ_SIG = 'b7bd4dcc55232bf7d829940ccf64b08293243c3f7ba1c21f514c029a3d40a718'
const RESP_SSO =
  'bm9uY2U9Zml4ZWRub25jZTEyM2FiYyZleHRlcm5hbF9pZD05MDAxJmVtYWlsPWZpeHR1cmUlNDBleGFtcGxlLmNvbSZlbWFpbF92ZXJpZmllZD10cnVlJnVzZXJuYW1lPWZpeHQmbmFtZT1GaXh0dXJlJTIwVXNlciZlbnRpdGxlbWVudD0lNUIlN0IlMjJwcm9kdWN0X2lkJTIyJTNBJTIyNDIlMjIlMkMlMjJuYW1lJTIyJTNBJTIyRGV2JTIwQ2x1YiUyMiUyQyUyMmV4cGlyZXNfYXQlMjIlM0FudWxsJTdEJTVE'
const RESP_SIG = '6c914b82f671c561075ba7b967f3d8b8039500af205ce25671b8eee6336fe9f7'

const REQEXP_SSO =
  'bm9uY2U9Zml4ZWRub25jZTEyM2FiYyZyZXR1cm5fdXJsPWh0dHAlM0ElMkYlMkZ0cmFjeS50ZXN0JTJGc2lnbmluJTJGam9vbWxhcnQlMkZjYWxsYmFjayZleHA9MTc2MDAwMDMwMA=='
const REQEXP_SIG = '06828b3bbeac682ef3f4fd2b1b9825f6bc5d96c4928ca76c0e02a2965ab96785'

const RESP2_SSO =
  'bm9uY2U9biUyMTEmZXh0ZXJuYWxfaWQ9NzcmZW1haWw9byUyN2JyaWVuJTJCeCU0MGV4YW1wbGUuY29tJmVtYWlsX3ZlcmlmaWVkPXRydWUmdXNlcm5hbWU9b2ImbmFtZT1PJTI3QnJpZW4lMjAlMjhKQSUyOSUyMCUyQSZlbnRpdGxlbWVudD0lNUIlN0IlMjJwcm9kdWN0X2lkJTIyJTNBJTIyNSUyMiUyQyUyMm5hbWUlMjIlM0ElMjJQcm8lMkZDbHViJTIyJTJDJTIyZXhwaXJlc19hdCUyMiUzQSUyMjIwMjctMDEtMDFUMDAlM0EwMCUzQTAwJTJCMDAlM0EwMCUyMiUyQyUyMnBhaWQlMjIlM0F0cnVlJTdEJTVE'
const RESP2_SIG = '6cb34af30bf9adc9272a42628e5c1a097f7dde861ef4cdcaf8d2c2fdbf2f3ed7'

// ── encode / sign: byte-for-byte what PHP produced ─────────────────────────────────────────────

test('encodePayload + sign reproduce the PHP request fixture byte for byte', () => {
  const sso = encodePayload([
    ['nonce', 'fixednonce123abc'],
    ['return_url', 'http://localhost:8610/auth/joomlart/callback']
  ])
  assert.equal(sso, REQ_SSO)
  assert.equal(sign(sso, SECRET), REQ_SIG)
})

test('encodePayload escapes the five characters PHP rawurlencode and JS encodeURIComponent disagree on', () => {
  // `php -r 'echo rawurlencode("a!b\'c(d)e*f ~-_.é/?&=");'` → the literal below (php:8-cli, 10/10/2026).
  const query = Buffer.from(encodePayload([['v', "a!b'c(d)e*f ~-_.é/?&="]]), 'base64').toString('utf8')
  assert.equal(query, 'v=a%21b%27c%28d%29e%2Af%20~-_.%C3%A9%2F%3F%26%3D')
})

test('buildRequest signs nonce, return_url, exp in that order — the exp-bearing PHP vector', () => {
  const { sso, sig } = buildRequest({
    nonce: 'fixednonce123abc',
    returnUrl: 'http://tracy.test/signin/joomlart/callback',
    exp: 1760000300,
    secret: SECRET
  })
  assert.equal(sso, REQEXP_SSO)
  assert.equal(sig, REQEXP_SIG)
})

// ── verify: constant-time, and false (never a throw) for every malformed input ─────────────────

test('verify accepts the PHP signatures and refuses tampering, the wrong secret, and bad shapes', () => {
  assert.equal(verify(REQ_SSO, REQ_SIG, SECRET), true)
  assert.equal(verify(RESP_SSO, RESP_SIG, SECRET), true)
  assert.equal(verify(REQ_SSO, '0'.repeat(64), SECRET), false)
  assert.equal(verify(REQ_SSO, REQ_SIG, 'not-the-secret'), false)
  assert.equal(verify(REQ_SSO, REQ_SIG.toUpperCase(), SECRET), false)
  assert.equal(verify(REQ_SSO, REQ_SIG.slice(0, 63), SECRET), false) // unequal length: no throw
  assert.equal(verify(REQ_SSO, `${REQ_SIG}0`, SECRET), false)
  assert.equal(verify('', '', SECRET), false)
  assert.equal(verify(REQ_SSO, REQ_SIG, ''), false)
  assert.equal(verify(null, REQ_SIG, SECRET), false)
  assert.equal(verify(REQ_SSO, 12, SECRET), false)
})

// ── decodePayload ──────────────────────────────────────────────────────────────────────────────

test('decodePayload reads the PHP response fixture as ordered string fields', () => {
  assert.deepEqual(decodePayload(RESP_SSO), {
    nonce: 'fixednonce123abc',
    external_id: '9001',
    email: 'fixture@example.com',
    email_verified: 'true',
    username: 'fixt',
    name: 'Fixture User',
    entitlement: '[{"product_id":"42","name":"Dev Club","expires_at":null}]'
  })
})

test('decodePayload answers null for a non-string, bad base64, a duplicate key, and over 8 KB', () => {
  assert.equal(decodePayload(undefined), null)
  assert.equal(decodePayload(42), null)
  assert.equal(decodePayload(''), null)
  assert.equal(decodePayload('not base64!'), null)
  assert.equal(decodePayload(`${RESP_SSO}x`), null) // length no longer a multiple of four
  assert.equal(Buffer.from('nonce=~~~').toString('base64'), 'bm9uY2U9fn5+') // the vector below really holds a `+`
  assert.equal(decodePayload('bm9uY2U9fn5-'), null) // base64url is not base64
  assert.equal(decodePayload(Buffer.from('nonce=a&nonce=b').toString('base64')), null)
  assert.equal(decodePayload(Buffer.from('nonce=\xff\xfe', 'latin1').toString('base64')), null) // not UTF-8
  const big = Buffer.from(`nonce=${'a'.repeat(8 * 1024)}`).toString('base64')
  assert.equal(decodePayload(big), null)
  const fits = Buffer.from(`nonce=${'a'.repeat(100)}`).toString('base64')
  assert.equal(decodePayload(fits)?.nonce, 'a'.repeat(100))
})

test('decodePayload is tolerant where PHP is: a key with no `=` reads as empty, an empty pair is skipped', () => {
  assert.deepEqual(decodePayload(Buffer.from('a=1&&flag&c=%2F').toString('base64')), {
    a: '1',
    flag: '',
    c: '/'
  })
})

// ── parseResponse ──────────────────────────────────────────────────────────────────────────────

test('parseResponse turns a signed PHP response into typed fields', () => {
  assert.deepEqual(parseResponse({ sso: RESP_SSO, sig: RESP_SIG, secret: SECRET }), {
    nonce: 'fixednonce123abc',
    externalId: '9001',
    email: 'fixture@example.com',
    emailVerified: true,
    username: 'fixt',
    name: 'Fixture User',
    entitlement: [{ product_id: '42', name: 'Dev Club', expires_at: null }]
  })
  // The vector with every differently-escaped character, and a paid entitlement.
  assert.deepEqual(parseResponse({ sso: RESP2_SSO, sig: RESP2_SIG, secret: SECRET }), {
    nonce: 'n!1',
    externalId: '77',
    email: "o'brien+x@example.com",
    emailVerified: true,
    username: 'ob',
    name: "O'Brien (JA) *",
    entitlement: [{ product_id: '5', name: 'Pro/Club', expires_at: '2027-01-01T00:00:00+00:00', paid: true }]
  })
})

test('parseResponse is null for a bad signature or payload, and never trusts what it cannot read', () => {
  assert.equal(parseResponse({ sso: RESP_SSO, sig: REQ_SIG, secret: SECRET }), null)
  assert.equal(parseResponse({ sso: RESP_SSO, sig: RESP_SIG, secret: 'other' }), null)
  assert.equal(parseResponse({ sso: undefined, sig: RESP_SIG, secret: SECRET }), null)
  // Signed, but the payload is not a payload: the signature proves aMember sent it, not that it
  // is readable, so the answer is still null rather than a half-read record.
  const junk = Buffer.from('nonce=a&nonce=b').toString('base64')
  assert.equal(parseResponse({ sso: junk, sig: sign(junk, SECRET), secret: SECRET }), null)
})

const signed = (pairs) => {
  const sso = encodePayload(pairs)
  return { sso, sig: sign(sso, SECRET), secret: SECRET }
}

test('parseResponse: email_verified is true only for the exact string "true"', () => {
  for (const value of ['True', 'TRUE', '1', 'yes', ' true', 'false', ''])
    assert.equal(parseResponse(signed([['email_verified', value]])).emailVerified, false, value)
  assert.equal(parseResponse(signed([['email_verified', 'true']])).emailVerified, true)
  assert.equal(parseResponse(signed([['nonce', 'x']])).emailVerified, false) // absent
})

test('parseResponse: entitlement is [] for bad JSON, a non-array, or absence; a missing field is ""', () => {
  assert.deepEqual(parseResponse(signed([['entitlement', 'not json']])).entitlement, [])
  assert.deepEqual(parseResponse(signed([['entitlement', '{"paid":true}']])).entitlement, [])
  assert.deepEqual(parseResponse(signed([['entitlement', 'null']])).entitlement, [])
  assert.deepEqual(parseResponse(signed([['entitlement', '[1,"x",{"paid":true}]']])).entitlement, [
    { paid: true }
  ])
  const bare = parseResponse(signed([['nonce', 'only']]))
  assert.deepEqual(bare, {
    nonce: 'only',
    externalId: '',
    email: '',
    emailVerified: false,
    username: '',
    name: '',
    entitlement: []
  })
})
