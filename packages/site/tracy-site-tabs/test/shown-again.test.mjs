/**
 * `paneShown`: Site changes moves its "seen" watermark only while its pane is on screen
 * (E2E dev 04/10 E9.2b — a tab mounted behind the Browser tab put the badge out unseen).
 *
 *   node --test packages/site/tracy-site-tabs/test/shown-again.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { paneShown } from '../src/client/shown-again.mjs'

/** An element with `boxes` layout boxes in a document whose page is `visibilityState`. */
const pane = (boxes, visibilityState = 'visible') => ({
  ownerDocument: { visibilityState },
  getClientRects: () => ({ length: boxes })
})

test('a laid-out pane in a page in front is shown', () => {
  assert.equal(paneShown(pane(1)), true)
})

test('an unpicked tab (display: none, no boxes) is not shown', () => {
  assert.equal(paneShown(pane(0)), false)
})

test('a pane in a browser tab at the back is not shown', () => {
  assert.equal(paneShown(pane(1, 'hidden')), false)
})

test('no root yet is not shown', () => {
  assert.equal(paneShown(null), false)
})
