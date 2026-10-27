#!/usr/bin/env node
/**
 * Which card and platform the Add site wizard lands on after a "Create with <CMS>" press: the
 * starting pill and template, what a later press moves, what a repeat of it leaves alone, and the
 * pill shown when the operator switched the picked platform off (#381, #386).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CREATE_PLATFORMS, DEFAULT_CREATE_PLATFORM, platformPressOf } from '../src/client/platforms.ts'
import { applyPress, chosenPlatform, initialPress } from '../src/client/press-state.mjs'

const DEFAULT = DEFAULT_CREATE_PLATFORM

test('initialPress: a tab opened with no press starts on the default platform and the address template', () => {
  assert.deepEqual(initialPress({ defaultPlatform: DEFAULT, addressDesign: 'tracy' }), {
    platform: 'joomla',
    design: 'tracy',
    origin: 'create'
  })
  assert.deepEqual(initialPress({ defaultPlatform: DEFAULT }), {
    platform: 'joomla',
    design: undefined,
    origin: 'create'
  })
})

test('initialPress: a press wins over the default and over the address', () => {
  const start = initialPress({
    pressedPlatform: 'emdash',
    pressedDesign: 'tracy-business',
    addressDesign: 'tracy',
    defaultPlatform: DEFAULT
  })
  assert.deepEqual(start, { platform: 'emdash', design: 'tracy-business', origin: 'create' })
})

test('initialPress: a press naming no platform keeps the default pill and still carries its card', () => {
  const start = initialPress({ pressedDesign: 'tracy', defaultPlatform: DEFAULT })
  assert.deepEqual(start, { platform: 'joomla', design: 'tracy', origin: 'create' })
})

test('applyPress: a new press moves the pill and the card together', () => {
  const next = applyPress('5:wordpress:tracy', {
    pressKey: '6:joomla:tracy-business',
    pressedPlatform: 'joomla',
    pressedDesign: 'tracy-business'
  })
  assert.deepEqual(next, { key: '6:joomla:tracy-business', platform: 'joomla', design: 'tracy-business' })
})

test('applyPress: the first press on a tab opened bare is applied', () => {
  const next = applyPress(undefined, {
    pressKey: '1:emdash:tracy',
    pressedPlatform: 'emdash',
    pressedDesign: 'tracy'
  })
  assert.equal(next?.platform, 'emdash')
  assert.equal(next?.design, 'tracy')
})

test('applyPress: the same press landing again changes nothing, so a manual pick survives', () => {
  const again = {
    pressKey: '5:wordpress:tracy-business',
    pressedPlatform: 'wordpress',
    pressedDesign: 'tracy-business'
  }
  assert.equal(applyPress('5:wordpress:tracy-business', again), null)
})

test('applyPress: a tab carrying no press changes nothing', () => {
  assert.equal(applyPress('5:wordpress:tracy', { addressDesign: 'tracy' }), null)
  assert.equal(applyPress(undefined, {}), null)
})

test('applyPress: a press naming no platform leaves the pill where it is', () => {
  const next = applyPress('5:wordpress:tracy', {
    pressKey: '6::tracy-business',
    pressedDesign: 'tracy-business'
  })
  assert.deepEqual(next, { key: '6::tracy-business', design: 'tracy-business' })
  assert.equal('platform' in next, false)
})

test('applyPress: a press naming no template falls back to the address, not the previous card', () => {
  const next = applyPress('5:wordpress:tracy-business', {
    pressKey: '6:emdash:',
    pressedPlatform: 'emdash',
    addressDesign: 'tracy'
  })
  assert.equal(next?.design, 'tracy')
})

test('chosenPlatform: the picked platform shows while the operator leaves it on', () => {
  assert.equal(chosenPlatform(CREATE_PLATFORMS, 'emdash')?.value, 'emdash')
})

test('chosenPlatform: a picked platform the operator switched off falls back to the first enabled one', () => {
  const enabled = CREATE_PLATFORMS.filter((entry) => entry.value !== 'wordpress')
  assert.equal(chosenPlatform(enabled, 'wordpress')?.value, 'joomla')
})

test('chosenPlatform: with every platform switched off nothing is chosen', () => {
  assert.equal(chosenPlatform([], 'joomla'), undefined)
})

// What the tab's `meta` becomes for the wizard (`platformPressOf`).
const PRESS_CASES = [
  [
    'a platform and a card from buildOpener',
    { platform: 'wordpress', design: 'tracy', pressedAt: 3 },
    { platform: 'wordpress', design: 'tracy' }
  ],
  [
    'a card from tracy-tab-link (`id`)',
    { platform: 'emdash', id: 'tracy-business', pressedAt: 3 },
    { platform: 'emdash', design: 'tracy-business' }
  ],
  ['a card and no platform', { id: 'tracy' }, { design: 'tracy' }],
  ['a platform and no card', { platform: 'joomla' }, { platform: 'joomla' }]
]
for (const [name, meta, want] of PRESS_CASES) {
  test(`platformPressOf: ${name}`, () => {
    const press = platformPressOf(meta)
    assert.equal(press?.platform, want.platform)
    assert.equal(press?.design, want.design)
  })
}

test('platformPressOf: a platform the wizard does not create on is dropped, never sent to the create door', () => {
  const press = platformPressOf({ platform: 'shopify', design: 'tracy' })
  assert.equal(press?.platform, undefined)
  assert.equal(press?.design, 'tracy')
  assert.equal(platformPressOf({ platform: 'shopify' }), undefined)
})

test('platformPressOf: a tab with no press (plus menu, plain link, restored) yields none', () => {
  for (const meta of [undefined, null, 'x', {}, { siteKey: 'a' }, { design: '  ' }]) {
    assert.equal(platformPressOf(meta), undefined, JSON.stringify(meta))
  }
})

test('platformPressOf: a new press gets a new key, an update of the same one keeps it', () => {
  const first = platformPressOf({ platform: 'wordpress', design: 'tracy', pressedAt: 5, setupPending: true })
  const update = platformPressOf({
    platform: 'wordpress',
    design: 'tracy',
    pressedAt: 5,
    setupPending: false
  })
  const next = platformPressOf({ platform: 'wordpress', design: 'tracy', pressedAt: 6 })
  assert.equal(update?.key, first?.key)
  assert.notEqual(next?.key, first?.key)
})

test('platformPressOf: the start screen names an origin card and nothing else', () => {
  assert.deepEqual(platformPressOf({ origin: 'import', pressedAt: 7 }), {
    origin: 'import',
    key: '7:::import'
  })
  assert.deepEqual(platformPressOf({ origin: 'create', pressedAt: 8 }), {
    origin: 'create',
    key: '8:::create'
  })
  // Build from my business has its own start card (24/10/2026).
  assert.deepEqual(platformPressOf({ origin: 'business', pressedAt: 10 }), {
    origin: 'business',
    key: '10:::business'
  })
  // The fork card is chosen by hand only; an unknown origin is no press at all.
  assert.equal(platformPressOf({ origin: 'fork', pressedAt: 9 }), undefined)
})

test('initialPress and applyPress: an origin press selects that card, a press without one leaves it', () => {
  assert.equal(initialPress({ pressedOrigin: 'import', defaultPlatform: DEFAULT }).origin, 'import')
  assert.deepEqual(applyPress('7:::import', { pressKey: '8:::create', pressedOrigin: 'create' }), {
    key: '8:::create',
    origin: 'create',
    design: undefined
  })
  const design = applyPress('8:::create', {
    pressKey: '9:wordpress:tracy',
    pressedPlatform: 'wordpress',
    pressedDesign: 'tracy'
  })
  assert.equal(design?.origin, undefined)
})
