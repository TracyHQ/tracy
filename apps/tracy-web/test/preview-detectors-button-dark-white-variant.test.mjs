/**
 * button-dark (BTN-1) finds the template's dark button a system painted as the lightest fill of the page. JA
 * Impact WordPress 1.0.9 (19/10/2026) has white buttons by name (`jim-btn--white`, `btn-white` on the block
 * button wrapper): white on its light look, repainted navy (#28354f) by its dark look. Read on the dark side,
 * the navy took the dark role, and the system's white pair on its call and event cards was an inversion. A
 * button whose class (or its hugging wrapper's) names it white or light has the light role; a btn-dark
 * painted the lightest fill is still found.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { detect } from '../scripts/preview-detectors/button-dark.mjs'

const c = (/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) => ({ r, g, b, a: 1 })
const NAVY = c(40, 53, 79)
const WHITE = c(255, 255, 255)
const GREEN = c(12, 183, 109)
const INDIGO = c(77, 73, 252)
const button = (/** @type {string} */ cls, /** @type {any} */ fill, /** @type {any} */ ground) => ({
  path: `div:1/${cls}`,
  at: 'a.wp-block-button__link',
  text: 'Join our event',
  cls,
  fill,
  ground,
  words: WHITE
})

test('button-dark: a white button by name, navy on the template dark look, kept white is no inversion', () => {
  const plain = {
    data: [
      button('wp-block-button__link wp-element-button wp-block-button jim-btn jim-btn--white', NAVY, GREEN)
    ]
  }
  const worn = {
    data: [
      button('wp-block-button__link wp-element-button wp-block-button jim-btn jim-btn--white', WHITE, INDIGO)
    ]
  }
  assert.equal(detect({ worn, plain }).count, 0)
  const wrapper = 'wp-block-button__link wp-element-button wp-block-button btn jim-arrow btn-action btn-white'
  assert.equal(
    detect({
      worn: { data: [button(wrapper, WHITE, INDIGO)] },
      plain: { data: [button(wrapper, NAVY, GREEN)] }
    }).count,
    0
  )
})

test('button-dark: a btn-dark painted the lightest fill is still found', () => {
  const plain = { data: [button('btn btn-dark', NAVY, GREEN)] }
  const worn = { data: [button('btn btn-dark', WHITE, INDIGO)] }
  assert.equal(detect({ worn, plain }).count, 1)
})
