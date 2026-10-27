// lane.mjs measures a release through the slot contract a site built from it wears (contractFor), not the
// line's base file: JA Podcast 1.0.6 measured through joomla-ja-podcast hid the theme switch (MODE-2) and
// dropped the release's role rules (CON-1) on every system (17/10/2026).
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { laneContract } from '../scripts/lane-contract.mjs'

const TAG = 'quickstart/ja-podcast/j6'

test('lane contract: each JA Podcast release is measured through the contract of its own range', () => {
  assert.deepEqual(laneContract('ja-podcast', TAG, '1.0.4'), { contract: 'joomla-ja-podcast' })
  assert.deepEqual(laneContract('ja-podcast', TAG, '1.0.5'), { contract: 'joomla-ja-podcast-modes' })
  if (existsSync(new URL('../templates/joomla-ja-podcast-roles.json', import.meta.url)))
    assert.deepEqual(laneContract('ja-podcast', TAG, '1.0.6'), { contract: 'joomla-ja-podcast-roles' })
})

test('lane contract: an unknown version keeps the base contract, and says why when no range holds it', () => {
  assert.deepEqual(laneContract('ja-podcast', TAG, null), { contract: 'joomla-ja-podcast' })
  const past = laneContract('ja-podcast', TAG, '9.9.9')
  assert.equal(past.contract, 'joomla-ja-podcast')
  assert.equal(past.reason, 'TEMPLATE_VERSION_UNCHECKED')
})

test('lane contract: Tracy Apple is measured through the Tracy Base contract that names it', () => {
  assert.deepEqual(laneContract('tracy-apple', 'tracy-apple/j6', '1.3.0'), { contract: 'joomla-tracy-base' })
})
