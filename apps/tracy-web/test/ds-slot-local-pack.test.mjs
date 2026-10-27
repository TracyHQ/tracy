/**
 * A site built from a local pack (`local/tracy-base/j6`) is judged by the release the pack is a candidate
 * for (`tracy-base/j6`): the slot contract lists published tags only, so the local namespace is dropped
 * before the lookup, the same way contracts and pins are looked up (`publishedTagOf`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { contractFor, versionKeyOf } from '../src/lib/ds-slot.js'

test('a Joomla site built from a local pack is keyed by the tag the pack stands for', () => {
  assert.deepEqual(
    versionKeyOf({ platform: 'joomla', quickstartTag: 'local/tracy-base/j6', quickstartVersion: '1.0.5' }),
    { key: 'tracy-base/j6', version: '1.0.5' }
  )
  // a published tag is kept as it is
  assert.deepEqual(
    versionKeyOf({ platform: 'joomla', quickstartTag: 'tracy-base/j6', quickstartVersion: '1.0.5' }),
    { key: 'tracy-base/j6', version: '1.0.5' }
  )
})

test('a local pack inside the contract range wears a system', () => {
  const site = versionKeyOf({
    platform: 'joomla',
    quickstartTag: 'local/tracy-base/j6',
    quickstartVersion: '1.0.5'
  })
  assert.ok('contract' in contractFor('joomla/tracy-base', site))
  const apple = versionKeyOf({
    platform: 'joomla',
    quickstartTag: 'local/tracy-apple/j6',
    quickstartVersion: '1.3.1'
  })
  assert.ok('contract' in contractFor('joomla/tracy-base', apple))
})
