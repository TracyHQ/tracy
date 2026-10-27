import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validationFromHttpError,
  validationFromLoadCodeAssist,
  noticeFromLoadCodeAssist,
  validationRequiredError,
} from '../lib/google-validation.js'

test('403 VALIDATION_REQUIRED reads validation_url metadata', () => {
  const body = JSON.stringify({
    error: {
      code: 403,
      message: 'Verify your account to continue.',
      status: 'PERMISSION_DENIED',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'VALIDATION_REQUIRED',
          domain: 'cloudcode-pa.googleapis.com',
          metadata: {
            validation_error_message: 'Verify your account to continue.',
            validation_url: 'https://accounts.google.com/signin/continue?example',
          },
        },
      ],
    },
  })
  const row = validationFromHttpError(403, body)
  assert.equal(row.validationUrl, 'https://accounts.google.com/signin/continue?example')
})

test('403 VALIDATION_REQUIRED extracts validation link from Help detail', () => {
  const body = JSON.stringify({
    error: {
      code: 403,
      message: 'Verify your account to continue.',
      status: 'PERMISSION_DENIED',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'VALIDATION_REQUIRED',
          domain: 'cloudcode-pa.googleapis.com',
          metadata: { validation_error_message: 'Verify your account to continue.' },
        },
        {
          '@type': 'type.googleapis.com/google.rpc.Help',
          links: [
            { description: 'Verify your account', url: 'https://example.com/verify' },
            { description: 'Learn more', url: 'https://support.google.com/foo' },
          ],
        },
      ],
    },
  })
  const row = validationFromHttpError(403, body)
  assert.equal(row.validationUrl, 'https://example.com/verify')
  const err = validationRequiredError(row)
  assert.equal(err.code, 'VALIDATION_REQUIRED')
})

test('loadCodeAssist ineligible tier surfaces validationUrl', () => {
  const row = validationFromLoadCodeAssist({
    ineligibleTiers: [{
      reasonCode: 'VALIDATION_REQUIRED',
      reasonMessage: 'Verify your account to continue.',
      validationUrl: 'https://example.com/verify',
    }],
  })
  assert.equal(row.validationUrl, 'https://example.com/verify')
})

test('loadCodeAssist unsupported client becomes account notice', () => {
  const row = noticeFromLoadCodeAssist({
    ineligibleTiers: [{
      reasonCode: 'UNSUPPORTED_CLIENT',
      reasonMessage: 'migrate to Antigravity',
    }],
  })
  assert.match(row.message, /Antigravity/i)
})
