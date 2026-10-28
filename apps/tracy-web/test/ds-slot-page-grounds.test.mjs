/**
 * The page grounds a quickstart's template paints, read from its slot contract (`baseTokens`/`darkTokens` `--bg`):
 * what the demo's brand accent is measured against before it paints the links (ADR 0023 amended 26/10/2026).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pageGroundsOf } from '../src/lib/ds-slot.js'

test('a template with one recorded ground gives that one', () => {
  assert.deepEqual(pageGroundsOf({ platform: 'joomla', tag: 'quickstart/ja-alpha/j6' }), ['#ffffff'])
})

test('a template with a light and a dark ground gives both', () => {
  assert.deepEqual(pageGroundsOf({ platform: 'joomla', tag: 'quickstart/ja-voyara/j6' }), [
    '#faf6f0',
    '#15110e'
  ])
})

test('a dark template reads its dark ground through the contract it extends', () => {
  assert.deepEqual(pageGroundsOf({ platform: 'joomla', tag: 'quickstart/ja-boxing/j6' }), ['#121111'])
})

test('no contract, no grounds', () => {
  assert.deepEqual(pageGroundsOf({ platform: 'joomla', tag: 'quickstart/no-such-template/j6' }), [])
  assert.deepEqual(pageGroundsOf({ platform: 'shopify', tag: 'x' }), [])
  assert.deepEqual(pageGroundsOf({ platform: 'joomla', tag: null }), [])
})
