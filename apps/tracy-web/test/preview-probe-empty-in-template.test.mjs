/**
 * PREV-1 counts the main blocks a worn preview renders empty: a section-like box with no text, picture or
 * control, the sign of a preview that lost its content (scripts that never ran, a door that served half a
 * page). JA Impact WordPress 1.0.9 (19/10/2026) declares its menu parent pages (/pages/, /pages/j-page/,
 * /pages/user/, /pages/j-content/): each is a title band over an empty padded body section on the
 * template's own page too. The system did not empty it, so it is not a preview fault: a block empty on the
 * plain page as well is left out; a block the worn page alone shows empty is still counted.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { comparePreview } from '../src/sites/design-system-preview-probe.js'

const read = (/** @type {string[]} */ empty) => ({
  width: 1440,
  height: 2000,
  page: { r: 255, g: 255, b: 255, a: 1 },
  said: {},
  blocks: [],
  texts: [],
  buttons: [],
  empty,
  failedFonts: [],
  docs: 1
})

test('preview probe: a block empty on the template page too is no empty preview block', () => {
  const plain = read(['section.wp-block-group.jim-main-body'])
  assert.deepEqual(
    comparePreview(read(['section.wp-block-group.jim-main-body']), plain, []).conformance.empty,
    []
  )
})

test('preview probe: a block only the worn page shows empty is still counted', () => {
  const plain = read([])
  assert.deepEqual(comparePreview(read(['section.jim-hero']), plain, []).conformance.empty, [
    'section.jim-hero'
  ])
  // one of two: the template's own empty block is left out, the new one stays
  const both = comparePreview(
    read(['section.jim-main-body', 'section.jim-hero']),
    read(['section.jim-main-body']),
    []
  )
  assert.deepEqual(both.conformance.empty, ['section.jim-hero'])
})
