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
