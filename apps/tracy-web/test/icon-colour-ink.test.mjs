/**
 * A drawn item icon takes the demo icon's INK, not the average of the demo picture: a demo icon that carries its own ground
 * (a filled disc behind a line glyph) gives the glyph's colour, held to 3:1 against that ground. Icons here are fictional.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { iconColourOf } from '../src/lib/icon-glyphs.js'

const svg = (body) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">${body}</svg>`))
    .png()
    .toBuffer()
const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
const lum = ([r, g, b]) => {
  const l = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b)
}
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

test('a line glyph on its own dark disc gives the glyph colour, not the disc', async () => {
  const icon = await svg(
    '<circle cx="75" cy="75" r="74" fill="#050505"/><path d="M40 75h70M75 40v70" stroke="#e04848" stroke-width="8"/>'
  )
  const colour = rgb(await iconColourOf(icon))
  assert.ok(colour[0] > 150 && colour[1] < 100, `ink ${colour}`)
  assert.ok(ratio(colour, [5, 5, 5]) >= 3)
})

test('an icon with no ground keeps the mean of its marks', async () => {
  const icon = await svg('<path d="M40 75h70M75 40v70" stroke="#2a6f4e" stroke-width="10"/>')
  const [r, g, b] = rgb(await iconColourOf(icon))
  assert.ok(Math.abs(r - 0x2a) < 12 && Math.abs(g - 0x6f) < 12 && Math.abs(b - 0x4e) < 12)
})

test('ink too close to its own ground is moved until it reaches 3:1', async () => {
  const icon = await svg(
    '<rect width="150" height="150" rx="20" fill="#101010"/><path d="M30 75h90M75 30v90" stroke="#3a3030" stroke-width="10"/>'
  )
  assert.ok(ratio(rgb(await iconColourOf(icon)), [16, 16, 16]) >= 3)
})
