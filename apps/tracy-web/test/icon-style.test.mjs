// A new item icon takes the look of the demo icon it replaces (spec TracyHQ/tracy#189): outline weight, solid or
// two-tone, measured on the demo picture. Every demo icon here is fictional, drawn in the test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { iconStyleOf, sectionWeightOf } from '../src/lib/icon-style.js'
import { iconPicture } from '../src/lib/icon-glyphs.js'

/** A fictional demo icon: a house drawn as a line of the given width on a 100 px box, or solid, or two-tone. */
async function demoIcon({
  stroke = 6,
  solid = false,
  tint = null,
  second = null,
  ground = null,
  size = 100
} = {}) {
  const house = 'M20 48 L50 20 L80 48 L80 82 L20 82 Z'
  const door = 'M42 82 L42 60 L58 60 L58 82'
  const body = solid
    ? `<path d="${house}" fill="#c0392b"/><path d="${door} Z" fill="#ffffff00"/>`
    : `${tint ? `<path d="${house}" fill="${tint}"/>` : ''}<path d="${house}" fill="none" stroke="${ground ? '#ffffff' : '#c0392b'}" stroke-width="${stroke}" stroke-linejoin="round"/><path d="${door}" fill="none" stroke="${second ?? (ground ? '#ffffff' : '#c0392b')}" stroke-width="${stroke}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${ground ? `<circle cx="50" cy="50" r="50" fill="${ground}"/>` : ''}${body}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

test('#189 an outline demo icon maps to the Phosphor weight of its stroke', async () => {
  // Strokes against a 60 px wide glyph box: about 3, 4, 5 and 8 percent.
  assert.equal((await iconStyleOf(await demoIcon({ stroke: 2.2 })))?.weight, 'thin')
  assert.equal((await iconStyleOf(await demoIcon({ stroke: 3.6 })))?.weight, 'light')
  assert.equal((await iconStyleOf(await demoIcon({ stroke: 5 })))?.weight, 'regular')
  assert.equal((await iconStyleOf(await demoIcon({ stroke: 8 })))?.weight, 'bold')
})

test('#189 a solid demo icon maps to fill; a tinted fill or a second ink colour maps to duotone', async () => {
  assert.equal((await iconStyleOf(await demoIcon({ solid: true })))?.weight, 'fill')
  const tinted = await iconStyleOf(await demoIcon({ stroke: 5, tint: '#c0392b33' }))
  assert.equal(tinted?.weight, 'duotone')
  const twoInks = await iconStyleOf(await demoIcon({ stroke: 8, second: '#f5c26b' }))
  assert.equal(twoInks?.weight, 'duotone')
})

test('#189 a line glyph on its own disc is read as the glyph, not as a solid icon', async () => {
  const style = await iconStyleOf(await demoIcon({ stroke: 5, ground: '#111111' }))
  assert.equal(style?.ground, true)
  assert.notEqual(style?.weight, 'fill')
  assert.notEqual(style?.weight, 'duotone')
})

test('#189 a thin line glyph on a half-clear disc is a thin outline, the disc being its ground', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#ffffff" fill-opacity="0.25"/><path d="M20 48 L50 20 L80 48 L80 82 L20 82 Z" fill="none" stroke="#c0392b" stroke-width="2.2"/></svg>`
  const style = await iconStyleOf(await sharp(Buffer.from(svg)).png().toBuffer())
  assert.equal(style?.twoTone, false)
  assert.equal(style?.weight, 'thin')
})

test('#189 every Phosphor weight rendered as a demo icon is read back as itself, for most icons', async () => {
  const names = ['tooth', 'house', 'heart', 'coffee', 'trophy', 'key']
  for (const weight of ['thin', 'light', 'regular', 'bold', 'fill', 'duotone']) {
    const styles = []
    for (const glyph of names) {
      const { bytes } = await iconPicture({ glyph, weight, width: 100, height: 100, colour: '#2f5d8a' })
      styles.push(await iconStyleOf(bytes))
    }
    // One weight per section: the most common reading.
    assert.equal(sectionWeightOf(styles), weight, weight)
  }
})

test('#189 a section takes one weight: the most common, the first winning a tie, regular when none is read', () => {
  assert.equal(sectionWeightOf([{ weight: 'bold' }, { weight: 'regular' }, { weight: 'bold' }]), 'bold')
  assert.equal(sectionWeightOf([{ weight: 'light' }, { weight: 'fill' }]), 'light')
  assert.equal(sectionWeightOf([null, null]), 'regular')
})

test('#189 an icon renders in the weight asked, in the colour asked, on a clear ground', async () => {
  const thin = await iconPicture({ glyph: 'tooth', weight: 'thin', width: 80, height: 80, colour: '#2f5d8a' })
  const fill = await iconPicture({ glyph: 'tooth', weight: 'fill', width: 80, height: 80, colour: '#2f5d8a' })
  const ink = async (bytes) => {
    const { data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
    let n = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 128) n += 1
    return n
  }
  assert.ok((await ink(fill.bytes)) > (await ink(thin.bytes)) * 2, 'a fill icon carries much more ink')
  const meta = await sharp(thin.bytes).metadata()
  assert.deepEqual([meta.width, meta.height, meta.hasAlpha], [80, 80, true])
  const unknown = await iconPicture({ glyph: 'not-an-icon', width: 40, height: 40 })
  assert.equal(unknown.width, 40, 'a name outside the set draws the neutral mark, never fails')
})
