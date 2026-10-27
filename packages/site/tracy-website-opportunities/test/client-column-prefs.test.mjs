/**
 * The Columns menu is remembered per device in localStorage `tracy-wo:columns`; a private window or
 * blocked storage falls back to the default (Type hidden) without breaking the tab.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { COLUMNS_KEY, readHiddenColumns, writeHiddenColumns } from '../src/client/column-prefs.ts'

const memory = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = String(v)), data }
}

test('nothing stored: Type is hidden', () => {
  assert.deepEqual(readHiddenColumns(memory()), ['type'])
  assert.deepEqual(readHiddenColumns(null), ['type'])
})

test('a stored choice is read back, unknown ids dropped; an empty list means every column shows', () => {
  assert.deepEqual(readHiddenColumns(memory({ [COLUMNS_KEY]: '["social","bogus","status"]' })), [
    'social',
    'status'
  ])
  assert.deepEqual(readHiddenColumns(memory({ [COLUMNS_KEY]: '[]' })), [])
  assert.deepEqual(readHiddenColumns(memory({ [COLUMNS_KEY]: 'not json' })), ['type'])
})

test('writing stores the hidden ids; a storage that throws is ignored', () => {
  const store = memory()
  writeHiddenColumns(store, new Set(['contact']))
  assert.equal(store.data[COLUMNS_KEY], '["contact"]')
  const broken = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    }
  }
  assert.doesNotThrow(() => writeHiddenColumns(broken, new Set()))
  assert.deepEqual(readHiddenColumns(broken), ['type'])
})

test('My opportunities remembers its own Columns choice: Opportunity and Demo on, the other optional columns off until shown', async () => {
  const { MY_COLUMNS, MY_COLUMNS_KEY, readMyHiddenColumns, writeMyHiddenColumns } = await import(
    '../src/client/column-prefs.ts'
  )
  // Opportunity and Demo show by default (Lee 19/10); the other optional columns wait to be turned on.
  assert.deepEqual(readMyHiddenColumns(memory()), ['web', 'google', 'social', 'contact'])
  // Demo sits after Website, before Contact (the Columns menu lists them in this order).
  assert.deepEqual(MY_COLUMNS, ['score', 'web', 'demo', 'google', 'social', 'contact'])
  assert.deepEqual(readMyHiddenColumns(memory({ [MY_COLUMNS_KEY]: '["social","type","demo"]' })), [
    'social',
    'demo'
  ])
  assert.deepEqual(readMyHiddenColumns(memory({ [MY_COLUMNS_KEY]: '["score","web"]' })), ['score', 'web'])
  const store = memory({ [COLUMNS_KEY]: '["type"]' })
  writeMyHiddenColumns(store, new Set(['contact']))
  assert.equal(store.data[MY_COLUMNS_KEY], '["contact"]')
  // Find's choice is its own.
  assert.equal(store.data[COLUMNS_KEY], '["type"]')
})
