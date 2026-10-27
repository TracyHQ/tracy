/**
 * `slotRolesOfRelease` (src/lib/slot-roles-of-release.js): the slot roles of the contract that seals a release, for the
 * Joomla, WordPress and EmDash contracts that were released with a `slot-roles.json` sidecar (ADR 0037).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readContracts } from '../src/lib/contracts.js'
import { slotRolesOfRelease } from '../src/lib/slot-roles-of-release.js'

const release = (over) => ({ kind: 'quickstart', github: 'published', setting: {}, ...over })

test('slotRolesOfRelease resolves the three committed sidecars (Joomla, WordPress, EmDash) as ready', () => {
  const contracts = readContracts()
  const joomla = slotRolesOfRelease(
    release({ tag: 'tracy-base/j6', platform: 'joomla', setting: { version: '1.0.5' } }),
    contracts
  )
  assert.equal(joomla.state, 'ready')
  assert.deepEqual(joomla.gaps, [])

  const wp = slotRolesOfRelease(
    release({ tag: 'quickstart/ja-restaurant/wp7', platform: 'wordpress', setting: { version: '1.0.1' } }),
    contracts
  )
  assert.equal(wp.state, 'ready')
  assert.deepEqual(wp.gaps, [])

  const emdash = slotRolesOfRelease(
    release({
      tag: 'tracy-base/emdash-0.x',
      platform: 'emdash',
      setting: { platform: 'emdash', template: 'tracy-base', version: '0.5.6' }
    }),
    contracts
  )
  assert.equal(emdash.state, 'ready')
  assert.deepEqual(emdash.gaps, [])
})
