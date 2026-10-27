import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { brandFromSocial, logoColorsOf } from '../domain/brand-social.mjs'
import { logoPaletteOf } from '../src/media-info.js'

const LOGO = new URL('./fixtures/logos/harbour-sport-club.jpg', import.meta.url)
// What the old brand step kept of the same place on dev (26/10/2026): photo colours, the logo green as "neutral".
const PHOTO_PALETTE = [
  { r: 24, g: 52, b: 28, weight: 0.3 },
  { r: 4, g: 36, b: 20, weight: 0.25 },
  { r: 170, g: 167, b: 152, weight: 0.2 }
]
const distance = (hex, [r, g, b]) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return Math.hypot((n >> 16) - r, ((n >> 8) & 255) - g, (n & 255) - b)
}

test('the Harbour Sport Club logo: its dark green is the primary colour and its gold the accent', async () => {
  const palette = await logoPaletteOf(readFileSync(LOGO))
  const brand = brandFromSocial({ palette: PHOTO_PALETTE, logoPalette: palette, name: 'Harbour Sport Club' })
  const primary = brand.colors.find((c) => c.role === 'primary')
  assert.ok(distance(primary.hex, [5, 37, 20]) < 12, `primary ${primary.hex} is the logo's dark forest green`)
  assert.ok(distance(brand.accent.hex, [170, 146, 71]) < 16, `accent ${brand.accent.hex} is the logo's gold`)
  assert.equal(brand.accent.source, 'logo')
  assert.ok(
    brand.accent.share > 0.02 && brand.accent.share < 0.1,
    `gold covers about 5%: ${brand.accent.share}`
  )
  assert.ok(
    brand.colors.some((c) => c.role === 'accent' && c.hex === brand.accent.hex),
    'the accent is one of the colours'
  )
  assert.equal(brand.colorsFrom, 'logo')
  assert.ok(brand.evidence.some((e) => e.kind === 'palette' && /logo/.test(e.detail)))
  assert.ok(!brand.colors.some((c) => c.hex === '#aaa798'), 'no colour of the photographs')
})

test('another dark logo, read from an image: deep purple stays a brand colour, orange is the accent', async () => {
  // A 100 x 100 logo: deep purple ground (lightness about 0.08), a white word, a small orange mark.
  const raw = Buffer.alloc(100 * 100 * 3)
  for (let y = 0; y < 100; y += 1)
    for (let x = 0; x < 100; x += 1) {
      const at = (y * 100 + x) * 3
      const colour =
        y >= 80 && x >= 80
          ? [240, 120, 20]
          : y >= 40 && y < 55 && x >= 10 && x < 90
            ? [250, 250, 250]
            : [36, 4, 44]
      raw.set(colour, at)
    }
  const png = await sharp(raw, { raw: { width: 100, height: 100, channels: 3 } })
    .png()
    .toBuffer()
  const brand = brandFromSocial({ logoPalette: await logoPaletteOf(png) })
  assert.equal(brand.colors[0].role, 'primary')
  assert.ok(distance(brand.colors[0].hex, [36, 4, 44]) < 4, `primary ${brand.colors[0].hex}`)
  assert.ok(distance(brand.accent.hex, [240, 120, 20]) < 4, `accent ${brand.accent.hex}`)
  assert.ok(brand.colors.some((c) => c.role === 'neutral' && distance(c.hex, [250, 250, 250]) < 4))
})

test('a transparent logo: the see-through pixels are no colour of it', async () => {
  const raw = Buffer.alloc(40 * 40 * 4)
  for (let i = 0; i < 40 * 40; i += 1) raw.set(i < 400 ? [10, 40, 120, 255] : [0, 0, 0, 0], i * 4)
  const png = await sharp(raw, { raw: { width: 40, height: 40, channels: 4 } })
    .png()
    .toBuffer()
  const palette = await logoPaletteOf(png)
  assert.equal(palette.length, 1)
  assert.equal(palette[0].weight, 1)
})

test('the accent: the most colourful logo colour that is not near black or white, never a speck', () => {
  const read = logoColorsOf([
    { r: 5, g: 37, b: 20, weight: 0.85 },
    { r: 250, g: 250, b: 250, weight: 0.08 },
    { r: 170, g: 146, b: 71, weight: 0.05 },
    // A speck under 1%: JPEG noise, not a brand colour.
    { r: 255, g: 0, b: 0, weight: 0.005 },
    { r: 2, g: 2, b: 2, weight: 0.015 }
  ])
  assert.deepEqual(read.accent, { hex: '#aa9247', source: 'logo', share: 0.05 })
  assert.deepEqual(read.colors, [
    { hex: '#052514', role: 'primary' },
    { hex: '#aa9247', role: 'accent' },
    { hex: '#fafafa', role: 'neutral' },
    { hex: '#020202', role: 'neutral' }
  ])
})

test('a black and white logo has no accent and no invented colour', () => {
  const read = logoColorsOf([
    { r: 0, g: 0, b: 0, weight: 0.6 },
    { r: 255, g: 255, b: 255, weight: 0.4 }
  ])
  assert.equal(read.accent, null)
  assert.deepEqual(
    read.colors.map((c) => c.role),
    ['neutral', 'neutral']
  )
})

test('without a logo palette the photo reading is unchanged and there is no accent', () => {
  const brand = brandFromSocial({ palette: PHOTO_PALETTE })
  assert.equal(brand.accent, undefined)
  assert.equal(brand.colorsFrom, undefined)
  assert.deepEqual(brand.colors[0], { hex: '#18341c', role: 'primary' })
})
