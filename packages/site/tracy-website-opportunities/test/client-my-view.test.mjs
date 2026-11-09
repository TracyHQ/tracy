#!/usr/bin/env node
/**
 * My opportunities' view (spec #512, ticket #518): Cards or Compact rows, remembered through the same preference
 * door as Columns (`src/client/column-prefs.ts`); Map only where the deployment has a browser map key; the
 * secondary fields the Columns menu adds, remembered the same way.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-my-view.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  MY_FIELDS_KEY,
  MY_VIEW_KEY,
  myViews,
  readMyFields,
  readMyView,
  shownMyView,
  writeMyFields,
  writeMyView
} from '../src/client/column-prefs.ts'

const memory = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = String(v)), data }
}

test('nothing chosen yet: Cards', () => {
  assert.equal(readMyView(memory()), 'cards')
  assert.equal(readMyView(null), 'cards')
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
    assert.equal(readMyView(memory({ [MY_VIEW_KEY]: old })), 'cards')
  const broken = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    }
  }
  assert.equal(readMyView(broken), 'cards')
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

test('secondary fields: none by default, the chosen ones remembered in menu order, unknown ids dropped', () => {
  assert.deepEqual(readMyFields(memory()), [])
  const store = memory()
  writeMyFields(store, new Set(['phone', 'type']))
  assert.deepEqual(readMyFields(memory(store.data)), ['type', 'phone'])
  assert.deepEqual(readMyFields(memory({ [MY_FIELDS_KEY]: '["stage","bogus"]' })), ['stage'])
  assert.deepEqual(readMyFields(memory({ [MY_FIELDS_KEY]: 'not json' })), [])
})
