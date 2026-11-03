// The icon half of the picture bench (#345): the style of a demo icon is measured as a Phosphor weight, and a rendered
// icon of each weight reads back as itself. Every demo icon here is invented and drawn by code.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { iconColourOf } from '../src/site-pictures/icons/icon-ink.js'
import { iconPicture } from '../src/site-pictures/icons/icon-render.js'
import { iconStyleOf, sectionWeightOf } from '../src/site-pictures/icons/icon-style.js'
import { PHOSPHOR_WEIGHTS, phosphorCatalog } from '../src/site-pictures/icons/phosphor-set.js'

/** An invented demo icon: a house as a line of the given width on a 100 px box, or solid, or two-tone. */
async function demoIcon({
  stroke = 6,
  solid = false,
  tint = null,
  second = null,
  ground = null,
  ink = '#c0392b'
} = {}) {
  const house = 'M20 48 L50 20 L80 48 L80 82 L20 82 Z'
  const door = 'M42 82 L42 60 L58 60 L58 82'
  const line = ground ? '#ffffff' : ink
  const body = solid
    ? `<path d="${house}" fill="${ink}"/><path d="${door} Z" fill="#ffffff00"/>`
    : `${tint ? `<path d="${house}" fill="${tint}"/>` : ''}<path d="${house}" fill="none" stroke="${line}" stroke-width="${stroke}" stroke-linejoin="round"/><path d="${door}" fill="none" stroke="${second ?? line}" stroke-width="${stroke}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${ground ? `<circle cx="50" cy="50" r="50" fill="${ground}"/>` : ''}${body}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

test('an outline demo icon maps to the Phosphor weight of its stroke', async () => {
  assert.equal((await iconStyleOf(await demoIcon({ stroke: 2.2 })))?.weight, 'thin')
  assert.equal((await iconStyleOf(await demoIcon({ stroke: 3.6 })))?.weight, 'light')
  assert.equal((await iconStyleOf(await demoIcon({ stroke: 5 })))?.weight, 'regular')
  assert.equal((await iconStyleOf(await demoIcon({ stroke: 8 })))?.weight, 'bold')
})

test('a solid demo icon maps to fill; a tint or a second ink colour maps to duotone', async () => {
  assert.equal((await iconStyleOf(await demoIcon({ solid: true })))?.weight, 'fill')
  assert.equal((await iconStyleOf(await demoIcon({ stroke: 5, tint: '#c0392b33' })))?.weight, 'duotone')
  assert.equal((await iconStyleOf(await demoIcon({ stroke: 8, second: '#f5c26b' })))?.weight, 'duotone')
})

test('a line glyph on its own disc is read as the glyph with a plate', async () => {
  const style = await iconStyleOf(await demoIcon({ stroke: 5, ground: '#111111' }))
  assert.equal(style?.ground, true)
  assert.ok(style?.groundShape)
  assert.notEqual(style?.weight, 'fill')
  assert.notEqual(style?.weight, 'duotone')
})

test('the ink colour is read from the glyph, not from the plate behind it', async () => {
  const plain = await iconColourOf(await demoIcon({ stroke: 6, ink: '#2f5d8a' }))
  assert.match(plain, /^#[0-9a-f]{6}$/)
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(plain.slice(i, i + 2), 16))
  assert.ok(Math.abs(r - 0x2f) < 12 && Math.abs(g - 0x5d) < 12 && Math.abs(b - 0x8a) < 12, plain)
  assert.equal(await iconColourOf(null), null)
})

test('a section takes one weight: the most common, the first winning a tie, regular when none is read', () => {
  assert.equal(sectionWeightOf([{ weight: 'bold' }, { weight: 'thin' }, { weight: 'bold' }]), 'bold')
  assert.equal(sectionWeightOf([{ weight: 'thin' }, { weight: 'bold' }]), 'thin')
  assert.equal(sectionWeightOf([null, null]), 'regular')
})

for (const weight of PHOSPHOR_WEIGHTS) {
  test(`one rendered sample of the ${weight} weight: a transparent PNG of the frame size that reads back as ${weight}`, async () => {
    const styles = []
    let sample
    for (const glyph of ['house', 'heart', 'coffee', 'trophy', 'key']) {
      sample = await iconPicture({ glyph, weight, width: 100, height: 100, colour: '#2f5d8a' })
      styles.push(await iconStyleOf(sample.bytes))
    }
    const meta = await sharp(sample.bytes).metadata()
    assert.deepEqual([meta.format, meta.width, meta.height, meta.hasAlpha], ['png', 100, 100, true])
    assert.equal(sectionWeightOf(styles), weight)
  })
}

test('the library is the 1512 icons of Phosphor Icons 2.1', () => {
  assert.equal(phosphorCatalog().length, 1512)
})
