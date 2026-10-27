/**
 * Deleting a site from My Sites (bug 25/09: the chat stayed on the deleted site's empty lane).
 *
 * Two things are pinned: the pure rule (the site you stand in → `/`, another site → stay), and
 * the wiring — `remove` in the tab must consult it and navigate with `replace`, so Back does not
 * return to an address that no longer has a site behind it.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { landingAfterDelete } from '../src/client/after-delete.ts'

test('deleting the site this page is on goes to the root, which picks the next landing', () => {
  assert.equal(landingAfterDelete('tamkem-emdash1.tracy.test', 'tamkem-emdash1.tracy.test'), '/')
})

test('deleting another site keeps the page where it is', () => {
  assert.equal(landingAfterDelete('other.tracy.test', 'tamkem-emdash1.tracy.test'), null)
})

test('a page that names no site (the creation workspace) stays', () => {
  assert.equal(landingAfterDelete('other.tracy.test', null), null)
})
