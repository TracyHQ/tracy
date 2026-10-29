/**
 * A brief build's logo stays readable on the ground of the spot it goes to: a logo whose marks do not reach 3:1 against a
 * dark (or light) spot is set on a plate of the colour that contrasts with the logo. Logos are fictional drawings.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import {
  DARK_GROUND,
  LIGHT_GROUND,
  logoContrast,
  logosByContrast,
  platedDrawingHeight
} from '../src/sites/brief-engines/brand-joomla-logo-contrast.js'
import { logoForSlot } from '../src/sites/brief-engines/brand-joomla-logo-fallback.js'

/** A mark of one colour, `drawn` pixels high, on a transparent canvas. */
const mark = async (colour, width = 300, height = 90, drawn = 60) =>
  sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      {
        input: await sharp({
          create: { width: drawn * 2, height: drawn, channels: 4, background: { ...colour, alpha: 1 } }
        })
          .png()
          .toBuffer(),
        gravity: 'centre'
      }
    ])
    .png()
    .toBuffer()

/** The colour at the centre column, `y` pixels from the top. */
const pixel = async (bytes, x, y) => {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const o = (y * info.width + x) * 4
  return [data[o], data[o + 1], data[o + 2], data[o + 3]]
}

test('a dark green mark does not read on a dark spot, and reads on a light one', async () => {
  const forest = await mark({ r: 12, g: 40, b: 20 })
  assert.ok((await logoContrast(forest, DARK_GROUND)) < 0.5)
  assert.ok((await logoContrast(forest, LIGHT_GROUND)) > 0.9)
})

test('a single dark logo becomes a pair: itself on light spots, a light plate behind it on dark spots, same frame', async () => {
  const forest = await mark({ r: 12, g: 40, b: 20 })
  const said = []
  const out = await logosByContrast({ single: forest }, (where, reason) => said.push(`${where}: ${reason}`))
  assert.equal(out.single, undefined)
  assert.equal(out.light, forest)
  const meta = await sharp(out.dark).metadata()
  assert.deepEqual([meta.width, meta.height], [300, 90])
  // Above the mark and inside the plate: the plate's light colour, where the original was transparent.
  const plate = await pixel(out.dark, 150, 12)
  assert.ok(plate[0] > 240 && plate[3] === 255, `plate pixel ${plate}`)
  assert.match(said.join(), /plate on dark backgrounds/)
})

test('a white logo gets a dark plate on light spots only; a logo that reads on both is left alone', async () => {
  const chalk = await mark({ r: 250, g: 250, b: 250 })
  const out = await logosByContrast({ single: chalk })
  assert.equal(out.dark, chalk)
  assert.ok((await pixel(out.light, 150, 12))[0] < 40)
  // A mid teal reaches 3:1 against both grounds.
  const teal = await mark({ r: 0, g: 140, b: 130 })
  assert.deepEqual(await logosByContrast({ single: teal }), { single: teal })
})

test('an owner pair is checked side by side: only the variant that fails its own side is plated', async () => {
  const light = await mark({ r: 20, g: 20, b: 90 })
  const dark = await mark({ r: 30, g: 30, b: 30 })
  const out = await logosByContrast({ light, dark })
  assert.equal(out.light, light)
  assert.notEqual(out.dark, dark)
})

test('a plate never makes a too-small logo legible: the slot judges the drawing, not the plate', async () => {
  const tiny = await mark({ r: 12, g: 40, b: 20 }, 160, 49, 14)
  const { dark } = await logosByContrast({ single: tiny })
  assert.equal(platedDrawingHeight(dark), 14)
  assert.ok('text' in (await logoForSlot(dark, { minWidth: 600, aspect: 160 / 49 })))
})
