/**
 * photo-text (CON-2) finds words on a photograph the system recoloured into the photograph's tones. JA Impact
 * WordPress 1.0.9 (19/10/2026): the fund cards' excerpts stay #dee2e6 under every system, as on the template's
 * page; the system's narrower face only ends the lines over a lighter stretch of the same photograph (3.05:1
 * there, 2.88:1 worn). Words left in the template's own colour were not recoloured: no finding. Words the
 * system recoloured (JA Tour's "ALASKA", light on the template, a dim slate worn) still are.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { detect } from '../scripts/preview-detectors/photo-text.mjs'

const c = (/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) => ({ r, g, b, a: 1 })
const text = (/** @type {any} */ colour, /** @type {any} */ ground) => ({
  path: 'div:1/p:1',
  at: 'p.excerpt',
  text: 'As the city',
  colour,
  ground
})

test('photo-text: words in the template colour over another stretch of the photograph are no finding', () => {
  const plain = { data: [text(c(222, 226, 230), c(134, 125, 98))] }
  const worn = { data: [text(c(222, 226, 230), c(142, 131, 103))] }
  assert.equal(detect({ worn, plain }).count, 0)
})

test('photo-text: words the system recoloured into the photograph still are', () => {
  const plain = { data: [text(c(255, 255, 255), c(40, 40, 40))] }
  const worn = { data: [text(c(80, 90, 100), c(40, 40, 40))] }
  assert.equal(detect({ worn, plain }).count, 1)
})
