#!/usr/bin/env node
/**
 * "Change design" on the Add site template card opens the Design inspiration tab, with no meta:
 * the gallery is not pre-filtered by the wizard's platform (not decided, 30/09).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DESIGN_TAB, openDesignGallery } from '../src/client/change-design.ts'

test('openDesignGallery: opens the Design inspiration tab type, with no meta', () => {
  const opened = []
  const updated = []
  const sidebar = {
    openTab: (seed) => opened.push(seed),
    updateTab: (id, patch) => updated.push([id, patch])
  }
  openDesignGallery(sidebar, undefined)
  assert.equal(DESIGN_TAB, 'tracy:design-inspiration')
  assert.deepEqual(opened, [{ type: 'tracy:design-inspiration' }])
  // No meta, so no patch of the landed tab either.
  assert.deepEqual(updated, [])
})

test('openDesignGallery: a side card without openTab is left alone', () => {
  assert.doesNotThrow(() => openDesignGallery({}, undefined))
})

test('openDesignGallery: a starting design preview sends its platform and template to the existing gallery', () => {
  const opened = []
  const sidebar = { openTab: (seed) => opened.push(seed) }
  openDesignGallery(sidebar, undefined, 'wordpress', () => 123, 'ja-impact')
  assert.deepEqual(opened, [
    {
      type: DESIGN_TAB,
      meta: { platform: 'wordpress', pressedAt: 123, previewDesign: 'ja-impact' }
    }
  ])
})
