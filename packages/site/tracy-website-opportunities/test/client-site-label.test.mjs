/**
 * Site name on Tracy (#519): what the inline editor says while a seller types the site label, and which label a build
 * sent from the Build form uses when one is saved or not.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-site-label.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { siteAddress, siteLabelVerdict } from '../src/client/site-label-model.ts'

const rules = { min: 6, max: 30 }

test('a typed name with anything but lowercase letters, digits and hyphens is refused at once, no check asked', () => {
  // The third name carries a letter outside a to z (an escape keeps this file ASCII).
  for (const typed of ['Pho Ba', 'pho_ba', 'stra\u00dfe-ba', 'PHOBA1'])
    assert.deepEqual(siteLabelVerdict(typed, '', rules, null), { state: 'invalid', key: 'site.name.chars' })
})

test('a name over the limit is too long, one under it too short; neither asks the server', () => {
  assert.deepEqual(siteLabelVerdict('a'.repeat(31), '', rules, null), {
    state: 'invalid',
    key: 'site.name.long'
  })
  assert.deepEqual(siteLabelVerdict('abc', '', rules, null), { state: 'invalid', key: 'site.name.short' })
})

test('a well formed name waits for the check, then reads taken or free from its answer', () => {
  assert.deepEqual(siteLabelVerdict('my-coach', '', rules, null), { state: 'checking', key: null })
  // An answer for an earlier text says nothing about this one.
  assert.deepEqual(siteLabelVerdict('my-coach', '', rules, { label: 'my-coac', available: true }), {
    state: 'checking',
    key: null
  })
  assert.deepEqual(
    siteLabelVerdict('taken-name', '', rules, { label: 'taken-name', available: false, reason: 'taken' }),
    { state: 'invalid', key: 'site.name.taken' }
  )
  assert.deepEqual(siteLabelVerdict('my-coach', '', rules, { label: 'my-coach', available: true }), {
    state: 'free',
    key: null
  })
})

test('the rule only the server knows reads as a plain sentence too', () => {
  assert.deepEqual(
    siteLabelVerdict('webmail', '', rules, { label: 'webmail', available: false, reason: 'reserved' }),
    { state: 'invalid', key: 'site.name.reserved' }
  )
  assert.deepEqual(
    siteLabelVerdict('-coach-', '', rules, { label: '-coach-', available: false, reason: 'shape' }),
    { state: 'invalid', key: 'site.name.edges' }
  )
})

test('the name already saved is no change and needs no check; spaces around it are ignored', () => {
  assert.deepEqual(siteLabelVerdict(' my-coach ', 'my-coach', rules, null), { state: 'unchanged', key: null })
})

test('the address reads label, prefix and domain from the server, no hostname written here', () => {
  assert.equal(siteAddress('my-coach', { prefix: '', domain: 'example.test' }), 'my-coach.example.test')
  assert.equal(
    siteAddress('my-coach', { prefix: 'dev-', domain: 'example.test' }),
    'dev-my-coach.example.test'
  )
})
