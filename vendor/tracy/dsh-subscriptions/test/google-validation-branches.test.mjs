import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isCloudCodeDomain,
  parseGoogleApiError,
  validationFromLoadCodeAssist,
  googleRateLimitMessage,
  googleLicenseMessage,
} from '../lib/google-validation.js'

// #288 follow-up: branch coverage for the Google error-mapping layer
// that feeds throwHttpError (429 hints, 403 licence, validation links).

test('isCloudCodeDomain accepts only the known Cloud Code hosts', () => {
  assert.equal(isCloudCodeDomain('cloudcode-pa.googleapis.com'), true)
  assert.equal(isCloudCodeDomain('staging-cloudcode-pa.googleapis.com'), true)
  assert.equal(isCloudCodeDomain('autopush-cloudcode-pa.googleapis.com'), true)
  assert.equal(isCloudCodeDomain('evil.example.com'), false)
  assert.equal(isCloudCodeDomain(''), false)
  assert.equal(isCloudCodeDomain(undefined), false)
})

test('isCloudCodeDomain requires a bare hostname and never over-matches', () => {
  // Sanitizing only drops disallowed characters, it does not parse a URL:
  // callers must pass a hostname. Prefixed/suffixed values stay rejected.
  assert.equal(isCloudCodeDomain('https://cloudcode-pa.googleapis.com/v1'), false)
  assert.equal(isCloudCodeDomain('cloudcode-pa.googleapis.com:443'), false)
  assert.equal(isCloudCodeDomain('xcloudcode-pa.googleapis.com'), false)
  assert.equal(isCloudCodeDomain('cloudcode-pa.googleapis.com.evil.test'), false)
})

test('parseGoogleApiError reads nested and flat error shapes', () => {
  const nested = parseGoogleApiError(JSON.stringify({ error: { code: 403, message: 'm', status: 'PERMISSION_DENIED', details: [1] } }))
  assert.equal(nested.code, 403)
  assert.equal(nested.message, 'm')
  assert.equal(nested.status, 'PERMISSION_DENIED')
  assert.deepEqual(nested.details, [1])
  const flat = parseGoogleApiError(JSON.stringify({ code: 429, message: 'slow down' }))
  assert.equal(flat.code, 429)
  assert.equal(flat.message, 'slow down')
  assert.deepEqual(flat.details, [])
})

test('parseGoogleApiError returns null for junk or non-object payloads', () => {
  assert.equal(parseGoogleApiError('not json'), null)
  assert.equal(parseGoogleApiError(''), null)
  assert.equal(parseGoogleApiError(undefined), null)
  assert.equal(parseGoogleApiError('"just a string"'), null)
  assert.equal(parseGoogleApiError('123'), null)
})

test('validationFromLoadCodeAssist is null without usable input', () => {
  assert.equal(validationFromLoadCodeAssist(null), null)
  assert.equal(validationFromLoadCodeAssist({}), null)
  assert.equal(validationFromLoadCodeAssist({ ineligibleTiers: [] }), null)
})

test('googleRateLimitMessage only fires for 429 with quota wording', () => {
  assert.equal(googleRateLimitMessage(500, 'quota'), '')
  assert.equal(googleRateLimitMessage(429, 'something else'), '')
  const msg = googleRateLimitMessage(429, JSON.stringify({ error: { message: 'Resource has been exhausted' } }))
  assert.ok(msg.includes('quota or rate limit'))
  const viaPlainText = googleRateLimitMessage(429, 'RESOURCE_EXHAUSTED for project')
  assert.ok(viaPlainText.includes('antigravity.google'))
})

test('googleLicenseMessage only fires for the licence wording on 403', () => {
  assert.equal(googleLicenseMessage(401, 'no license'), '')
  assert.equal(googleLicenseMessage(403, 'totally fine'), '')
  const msg = googleLicenseMessage(403, JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }))
  assert.ok(msg.includes('one.google.com'))
  assert.ok(msg.includes('#3501'))
})
