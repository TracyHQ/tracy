/**
 * The Find box's parts per mode (`src/client/find-parts.ts`): links mode shows only the links form, never the area
 * search's results or their "Searching…" spinner.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-find-parts.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { findParts } from '../src/client/find-parts.ts'

test('search mode: the search form and its results, no links form', () => {
  assert.deepEqual(findParts('search', false), { linksForm: false, searchForm: true, results: true })
})

test('links mode: the links form alone, no area results under it', () => {
  assert.deepEqual(findParts('links', false), { linksForm: true, searchForm: false, results: false })
})

test('the public Find always searches, whatever the mode says', () => {
  assert.deepEqual(findParts('links', true), { linksForm: false, searchForm: true, results: true })
})
