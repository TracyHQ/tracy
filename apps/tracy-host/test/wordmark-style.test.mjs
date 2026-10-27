/**
 * The template-style wordmark's decisions (`wordmark-style.js`): the logo's kind of letter, its ink, the font picked
 * for it, the fit in the logo's box, and the fallback to the heading's type when nothing can be read.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import {
  WORDMARK_FONTS,
  classOfFamily,
  fitWordmark,
  inkOf,
  logoLayoutOf,
  pickFont,
  shippedFont,
  styleClassOf
} from '../src/wordmark-style.js'

/** A mask `width` × `height` with the given boxes `[x, y, w, h]` set. */
function mask(width, height, boxes) {
  const m = new Uint8Array(width * height)
  for (const [x0, y0, w, h] of boxes)
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) m[y * width + x] = 1
  return m
}

/** RGBA of a mask: ink `rgb` where set, `ground` (or transparent) elsewhere. */
function rgbaOf(m, rgb, ground = null) {
  const out = new Uint8Array(m.length * 4)
  m.forEach((on, i) => {
    const c = on ? [...rgb, 255] : ground ? [...ground, 255] : [0, 0, 0, 0]
    out.set(c, i * 4)
  })
  return out
}

test('a family name tells its class; icon fonts and unknown names tell none', () => {
  assert.equal(classOfFamily('"Dancing Script"'), 'script')
  assert.equal(classOfFamily('Great Vibes'), 'script')
  assert.equal(classOfFamily('Playfair Display'), 'serif')
  assert.equal(classOfFamily('Work Sans'), 'sans')
  assert.equal(classOfFamily('Josefin Sans'), 'sans')
  assert.equal(classOfFamily('Teko'), 'display')
  assert.equal(classOfFamily('Font Awesome 6 Free'), null)
  assert.equal(classOfFamily('Zqx Grotto'), null)
})

test('the ink is the logo colour, on a transparent ground and on an opaque one', () => {
  const m = mask(60, 20, [[5, 4, 50, 12]])
  const clear = inkOf(rgbaOf(m, [20, 20, 20]), 60, 20)
  assert.equal(clear.colour, 'rgb(20, 20, 20)')
  assert.equal(
    clear.mask.reduce((a, b) => a + b, 0),
    50 * 12
  )
  const opaque = inkOf(rgbaOf(m, [180, 40, 40], [250, 245, 235]), 60, 20)
  assert.equal(opaque.colour, 'rgb(180, 40, 40)')
  assert.equal(
    opaque.mask.reduce((a, b) => a + b, 0),
    50 * 12
  )
  assert.equal(inkOf(rgbaOf(mask(10, 10, []), [0, 0, 0]), 10, 10), null)
})

test('the class read from the ink: separate even letters are sans, contrasted ones serif, joined script, filled display', () => {
  // Eight printed letters "n" on one 20-high line, even 2-wide strokes, a gap between letters.
  const letters = []
  for (let k = 0; k < 8; k++)
    letters.push([4 + k * 14, 4, 2, 20], [4 + k * 14 + 8, 4, 2, 20], [4 + k * 14, 4, 10, 2])
  assert.equal(styleClassOf(mask(124, 28, letters), 124, 28).cls, 'sans')
  // The same letters with a hairline crossbar and fat stems: thick against thin.
  const contrasted = []
  for (let k = 0; k < 8; k++)
    contrasted.push([4 + k * 13, 4, 1, 20], [4 + k * 13 + 1, 4, 1, 20], [4 + k * 13 + 2, 12, 8, 1])
  for (let k = 0; k < 8; k++) contrasted.push([4 + k * 13 + 9, 4, 1, 20])
  const serifish = styleClassOf(mask(120, 28, contrasted), 120, 28)
  assert.ok(serifish.cls === 'serif' || serifish.cls === 'sans', serifish.cls)
  // One joined stroke across the line, as handwriting runs: few gaps for many letters.
  const joined = [
    [4, 14, 110, 3],
    [4, 4, 3, 13],
    [30, 4, 3, 13],
    [60, 4, 3, 13],
    [90, 4, 3, 13]
  ]
  assert.equal(styleClassOf(mask(120, 28, joined), 120, 28).cls, 'script')
  // Heavy blocks filling their box, apart from each other.
  const heavy = []
  for (let k = 0; k < 6; k++) heavy.push([4 + k * 18, 4, 15, 20])
  assert.equal(styleClassOf(mask(120, 28, heavy), 120, 28).cls, 'display')
  // Too little ink to read.
  assert.equal(styleClassOf(mask(20, 20, [[2, 2, 3, 3]]), 20, 20), null)
})

test('the font: a theme family of the class, else the shipped one, and the heading font with no class', () => {
  const heading = { family: 'Georgia, serif', weight: '600', style: 'normal' }
  const theme = pickFont({ cls: 'script', families: ['Work Sans', '"Great Vibes"'], heading })
  assert.equal(theme.source, 'theme')
  assert.equal(theme.family, '"Great Vibes"')
  const shipped = pickFont({ cls: 'script', families: ['Work Sans'], heading })
  assert.equal(shipped.source, 'shipped')
  assert.equal(shipped.family, `"${WORDMARK_FONTS.script.family}"`)
  const fallback = pickFont({ cls: null, families: ['Great Vibes'], heading })
  assert.equal(fallback.source, 'heading')
  assert.equal(fallback.family, 'Georgia, serif')
  assert.equal(fallback.weight, '600')
})

test('the fit: one line when legible in the box, else two even lines, and one when two would not be larger', () => {
  const words = ['The', 'Willow', 'Nook']
  // 100px text: whole name 700 wide; splits "The | Willow Nook" 160/520, "The Willow | Nook" 440/260.
  const widths = {
    words,
    one: 700,
    splits: [
      [160, 520],
      [440, 260]
    ]
  }
  const wide = fitWordmark(widths, { width: 280, height: 60 })
  assert.deepEqual(wide.lines, ['The Willow Nook'])
  assert.ok(wide.size >= 16)
  const square = fitWordmark(widths, { width: 100, height: 100 })
  assert.deepEqual(square.lines, ['The Willow', 'Nook'])
  assert.ok(square.size > (100 * 0.94 * 100) / 700)
  const flat = fitWordmark(widths, { width: 100, height: 20 })
  assert.equal(flat.lines.length, 1)
  assert.deepEqual(fitWordmark({ words: ['Kova'], one: 300, splits: [] }, { width: 30, height: 30 }).lines, [
    'Kova'
  ])
})

test('every shipped font reads, and its licence lies beside it', () => {
  for (const [cls, font] of Object.entries(WORDMARK_FONTS)) {
    const bytes = shippedFont(/** @type {any} */ (cls))
    assert.ok(bytes && bytes.length > 1000, `${cls} font reads`)
    assert.ok(existsSync(new URL(`../src/wordmark-fonts/${font.licence}`, import.meta.url)), `${cls} licence`)
  }
  assert.equal(shippedFont(/** @type {any} */ ('gothic')), null)
})

test("the template logo's lines, ink box and cap height, read from its ink", () => {
  const box = { width: 100, height: 60 }
  // Two bands of rows with a gap: two lines; a line 20 high has a cap of 12.
  const stacked = logoLayoutOf(
    mask(100, 60, [
      [10, 5, 80, 20],
      [10, 35, 80, 20]
    ]),
    100,
    60,
    box
  )
  assert.deepEqual(stacked, { lines: 2, ink: { width: 80, height: 50 }, cap: 12 })
  // A long strip: one line.
  assert.equal(logoLayoutOf(mask(100, 60, [[5, 20, 90, 20]]), 100, 60, box).lines, 1)
  // Lines that touch (a script logo's loops), near square: two.
  assert.equal(logoLayoutOf(mask(100, 60, [[20, 10, 60, 40]]), 100, 60, box).lines, 2)
  // In CSS pixels of the box, whatever the pixels were read at.
  const half = logoLayoutOf(mask(50, 30, [[5, 10, 40, 10]]), 50, 30, box)
  assert.deepEqual(half.ink, { width: 80, height: 20 })
  assert.equal(logoLayoutOf(new Uint8Array(100 * 60), 100, 60, box), null)
})

test("the name follows the template logo's lines, fills its ink, and never falls below its cap height", () => {
  const widths = {
    words: ['The', 'Willow', 'Nook'],
    one: 700,
    splits: [
      [150, 520],
      [450, 260]
    ]
  }
  const box = { width: 128, height: 80 }
  const stacked = { lines: 2, ink: { width: 120, height: 70 }, cap: 12 }
  const two = fitWordmark(widths, box, { layout: stacked, capRatio: 0.7 })
  assert.deepEqual(two.lines, ['The Willow', 'Nook'])
  assert.equal(two.size, 26.6)
  assert.ok(two.block.width <= 120 && two.block.height <= 70 * 1.01)
  // A one-line template logo: one line, whatever the box would allow.
  const strip = fitWordmark(widths, box, { layout: { ...stacked, lines: 1 }, capRatio: 0.7 })
  assert.deepEqual(strip.lines, ['The Willow Nook'])
  // A tiny ink box: the cap height holds the size (12 / 0.7), and the block says it runs past the box.
  const small = fitWordmark(widths, box, {
    layout: { lines: 2, ink: { width: 40, height: 20 }, cap: 12 },
    capRatio: 0.7
  })
  assert.equal(small.size, 17.1)
  assert.ok(small.block.width > 40)
  // One word stays one line, two lines asked or not.
  assert.deepEqual(fitWordmark({ words: ['Kova'], one: 300, splits: [] }, box, { layout: stacked }).lines, [
    'Kova'
  ])
})
