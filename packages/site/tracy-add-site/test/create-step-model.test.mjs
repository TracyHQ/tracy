import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createDesignGuidance, createRefusalGuidance } from '../src/client/create-step-model.mjs'

test('Create guidance distinguishes retained refusal codes without interpreting arbitrary diagnostics', () => {
  for (const [code, expected] of Object.entries({
    UNSUPPORTED_PLATFORM: 'platform',
    UNSUPPORTED_QUICKSTART: 'template',
    UNSUPPORTED_DESIGN: 'template',
    UNKNOWN_DESIGN: 'template',
    DESIGN_SYSTEMS_OFF: 'systems_off',
    DS_UNKNOWN: 'system'
  }))
    assert.equal(createRefusalGuidance({ refusal: 'other', code }), expected)
  for (const code of [
    'HTTP_400',
    'HTTP_500',
    'NETWORK',
    'FLEET_ANSWERED_UNREADABLY',
    'DATABASE_FULL',
    'Cowork token probe failed'
  ]) {
    assert.equal(createRefusalGuidance({ refusal: 'other', code }), 'unconfirmed')
  }
})

test('server capacity is confirmed only when the response retained a safe alternative address', () => {
  assert.equal(createRefusalGuidance({ refusal: 'other', code: 'SHARD_FULL' }), 'unconfirmed')
  assert.equal(createRefusalGuidance({ refusal: 'elsewhere', code: 'SHARD_FULL' }), 'capacity')
})

test('name, session, pending and conflict refusals keep distinct recovery instructions', () => {
  for (const [refusal, expected] of Object.entries({
    shape: 'shape',
    reserved: 'reserved',
    looks_imported: 'looks_imported',
    taken: 'taken',
    signed_out: 'signed_out',
    pending: 'pending',
    host_updating: 'updating',
    conflict: 'conflict',
    elsewhere: 'elsewhere'
  })) {
    assert.equal(createRefusalGuidance({ refusal, code: '' }), expected)
  }
  assert.equal(createRefusalGuidance({ refusal: 'other', code: 'BUILD_GONE' }), 'gone')
})

test('late design reasons use only the exact retained code, preserving a generic fallback', () => {
  for (const reason of ['DS_UNKNOWN', 'DS_REFUSED: not available'])
    assert.equal(createDesignGuidance(reason), 'design_unavailable')
  for (const reason of ['DS_TEMPLATE_CANNOT_WEAR', 'PLATFORM_HAS_NO_SLOT'])
    assert.equal(createDesignGuidance(reason), 'design_incompatible')
  for (const [reason, expected] of Object.entries({
    DS_TEMPLATE_LOCKED: 'design_locked',
    DS_THEME_CANNOT_WEAR: 'design_theme',
    DS_IMPORTED_SITE: 'design_imported',
    DS_READ_FAILED: 'design_read',
    DS_WRITE_FAILED: 'design_write'
  }))
    assert.equal(createDesignGuidance(reason), expected)
  assert.equal(createDesignGuidance('SITE_BUSY: still writing'), 'design_busy')
  assert.equal(createDesignGuidance('SITE_UNKNOWN'), 'design_gone')
  for (const reason of [
    null,
    '',
    'DS_WRITE_REFUSED',
    'HTTP_503',
    'Error mentions SITE_BUSY inside free text'
  ])
    assert.equal(createDesignGuidance(reason), 'design')
})

test('proven early refusals offer the correction rather than an unknown creation outcome', () => {
  for (const [code, expected] of Object.entries({
    CSRF_ORIGIN: 'reload',
    INVALID_REQUEST: 'request',
    UNSUPPORTED_MEDIA_TYPE: 'request',
    INVALID_BUILD_ID: 'request',
    TEMPLATE_VERSION_CHANGED: 'template',
    DESIGN_PLAN_CHANGED: 'template',
    DS_TEMPLATE_LOCKED: 'system_locked',
    DEMO_WORKFLOW_INVALID: 'request',
    AGENT_DEMO_CREATE_REFUSED: 'request',
    ACCOUNT_NOT_ON_SHARD: 'account'
  }))
    assert.equal(createRefusalGuidance({ refusal: 'other', code }), expected, code)
})
