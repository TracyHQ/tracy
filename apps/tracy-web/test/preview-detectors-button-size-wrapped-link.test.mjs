/**
 * button-size reads a "button" the template draws as a bare text link (no fill, no border, no vertical
 * padding, at most an underline: JA Symphony Joomla's blog "Read more: <title>", a.btn.btn-readmore) as blown up when the
 * system's wider face wraps its words onto a second line inside the same column (431×31 to 439×61px
 * under Moxie and Figma, dot 3, 19/10/2026). Its padding and line height are the template's; only the
 * line count changed, which is how a text link reads. A painted button that grew stays found.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sizeChange } from '../scripts/preview-detectors/button-size.mjs'

const link = {
  text: 'Read more: Artist Portraits From',
  padY: 0,
  padX: 0,
  lh: 30,
  font: 16,
  bw: 0,
  radius: 0,
  stretch: false,
  bare: true
}

test('a bare text link whose words wrap in its column is not a blown-up button', () => {
  const was = { ...link, w: 431, h: 31, lh: 31 }
  const now = { ...link, w: 439, h: 61 }
  assert.equal(sizeChange(now, was), null)
})

test('a painted button that grew is still found', () => {
  const was = { ...link, bare: false, w: 129, h: 44, padY: 20, lh: 22 }
  const now = { ...link, bare: false, w: 330, h: 120, padY: 20, lh: 22 }
  assert.match(String(sizeChange(now, was)), /grew from/)
})

test('a bare link that grew wider than its column, or took padding, is still found', () => {
  const was = { ...link, w: 200, h: 31, lh: 31 }
  assert.match(String(sizeChange({ ...link, w: 420, h: 61 }, was)), /grew from/)
  assert.match(String(sizeChange({ ...link, w: 205, h: 71, padY: 40 }, was)), /grew from|vertical padding/)
})
