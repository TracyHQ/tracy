#!/usr/bin/env node
/**
 * My opportunities' view (spec #512, ticket #518): Cards or Rows, remembered on this device
 * (`src/client/column-prefs.ts`); Map only where the deployment has a browser map key.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-my-view.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MY_VIEW_KEY, myViews, readMyView, shownMyView, writeMyView } from '../src/client/column-prefs.ts'

const memory = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = String(v)), data }
}

test('nothing chosen yet: Cards', () => {
  assert.equal(readMyView(memory()), 'rows')
  assert.equal(readMyView(null), 'rows')
})

test('the chosen view is saved and read back after a reload', () => {
  const store = memory()
  writeMyView(store, 'rows')
  assert.equal(store.data[MY_VIEW_KEY], 'rows')
  assert.equal(readMyView(memory(store.data)), 'rows')
  writeMyView(store, 'map')
  assert.equal(readMyView(memory(store.data)), 'map')
})

test('the old Table and Grid choices and garbage read as Cards; storage that throws is ignored', () => {
  for (const old of ['table', 'grid', 'bogus'])
    assert.equal(readMyView(memory({ [MY_VIEW_KEY]: old })), 'rows')
  const broken = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    }
  }
  assert.equal(readMyView(broken), 'rows')
  assert.doesNotThrow(() => writeMyView(broken, 'rows'))
})

test('Map is offered only when the deployment reports a browser map key; Table is never offered', () => {
  assert.deepEqual(myViews(null), ['cards', 'rows'])
  assert.deepEqual(myViews(''), ['cards', 'rows'])
  assert.deepEqual(myViews(undefined), ['cards', 'rows'])
  assert.deepEqual(myViews('fake-browser-key'), ['cards', 'rows', 'map'])
})

test('a remembered Map on a deployment without a key shows Cards, without an error', () => {
  assert.equal(shownMyView('map', myViews(null)), 'cards')
  assert.equal(shownMyView('map', myViews('fake-browser-key')), 'map')
  assert.equal(shownMyView('rows', myViews(null)), 'rows')
})
