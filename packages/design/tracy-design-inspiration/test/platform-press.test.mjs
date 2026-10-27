#!/usr/bin/env node
/**
 * The CMS chip a "Change design" press from Add site preselects: read from the tab's meta, applied
 * once per press, and nothing for a tab opened any other way.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { claimPress, platformPressOf, withPlatformChip } from '../src/client/platform-press.mjs'

test('platformPressOf: a press from Add site names an offered platform, keyed by its time', () => {
  assert.deepEqual(platformPressOf({ platform: 'wordpress', pressedAt: 42 }), {
    platform: 'wordpress',
    key: '42:wordpress'
  })
})

test('platformPressOf: a tab opened any other way preselects nothing', () => {
  assert.equal(platformPressOf(undefined), null)
  assert.equal(platformPressOf({ siteKey: 'javoyara' }), null)
  assert.equal(platformPressOf({ platform: 'drupal', pressedAt: 1 }), null)
})

test('claimPress: each press applies once, a new press applies again', () => {
  const seen = new Set()
  assert.equal(claimPress('1:joomla', seen), true)
  assert.equal(claimPress('1:joomla', seen), false)
  assert.equal(claimPress('2:joomla', seen), true)
})

test('withPlatformChip: the pressed platform becomes the only CMS chip, the rest is kept', () => {
  const before = {
    ticked: new Set(['Business']),
    picked: new Set(),
    platforms: new Set(['joomla', 'emdash'])
  }
  const after = withPlatformChip(before, 'wordpress')
  assert.deepEqual([...after.platforms], ['wordpress'])
  assert.deepEqual([...after.ticked], ['Business'])
  assert.deepEqual([...before.platforms], ['joomla', 'emdash'])
})
