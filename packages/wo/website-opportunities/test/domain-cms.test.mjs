import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CMS, DEFAULT_CMS, parseCms, resolveCms } from '../domain/cms.mjs'

test('CMS list and default are fixed by the contract', () => {
  assert.deepEqual(CMS, ['joomla', 'wordpress', 'emdash'])
  assert.equal(DEFAULT_CMS, 'joomla')
})

test('parseCms accepts known values case-insensitively and rejects the rest', () => {
  assert.equal(parseCms('WordPress'), 'wordpress')
  assert.equal(parseCms(' emdash '), 'emdash')
  assert.equal(parseCms('drupal'), null)
  assert.equal(parseCms(null), null)
  assert.equal(parseCms(42), null)
})

test('resolveCms uses the account preference when valid', () => {
  const now = new Date('2026-10-18T10:00:00Z')
  assert.deepEqual(resolveCms({ cms: 'emdash' }, now), {
    cms: 'emdash',
    cmsSource: 'account',
    resolvedAt: '2026-10-18T10:00:00.000Z'
  })
})

test('resolveCms falls back to joomla when there is no or an invalid preference', () => {
  const now = () => new Date('2026-10-18T10:00:00Z')
  assert.deepEqual(resolveCms(null, now), {
    cms: 'joomla',
    cmsSource: 'default',
    resolvedAt: '2026-10-18T10:00:00.000Z'
  })
  assert.equal(resolveCms({ cms: 'drupal' }, now).cmsSource, 'default')
})
