// A replaced icon takes its size, line weight and backing from the template icon it replaces, read from that icon's file.
// Every template icon here is invented and drawn by code.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { iconPicture } from '../src/lib/picture-paint/icons/icon-render.js'
import {
  iconLookOf,
  looksDiffer,
  sectionLineDiffers,
  sectionLooks
} from '../src/lib/picture-paint/icons/template-icon-look.js'
import { templateIcon } from './_template-icon-fixtures.mjs'

const near = (a, b, within, what) => assert.ok(Math.abs(a - b) <= within, `${what}: ${a} against ${b}`)

test('a dark disc under a thin line: file size, thin, the disc in its colour, the glyph in its place', async () => {
  const look = await iconLookOf(await templateIcon({ disc: '#17171b', stroke: 2 }))
  assert.equal(look.width, 150)
  assert.equal(look.height, 150)
  assert.equal(look.weight, 'thin')
  assert.equal(look.plate.colour, '#17171b')
  assert.equal(look.plate.opacity, 1)
  near(look.plate.radius, 0.5, 0.02, 'radius')
  near(look.plate.box.w, 1, 0.02, 'disc width')
  near(look.glyph.w, 0.5, 0.04, 'glyph width')
})

test('a faint tint is a backing too, however faint', async () => {
  for (const opacity of [0.1, 0.06]) {
    const look = await iconLookOf(await templateIcon({ disc: '#d83a3a', opacity, stroke: 2 }))
    assert.ok(look.plate, `a tint at ${opacity} is seen`)
    near(look.plate.opacity, opacity, 0.015, 'opacity')
    assert.equal(look.weight, 'thin')
  }
})

test('an icon with no backing has none, and its glyph still has its place', async () => {
  const look = await iconLookOf(await templateIcon({ stroke: 6 }))
  assert.equal(look.plate, null)
  near(look.glyph.w, 0.5, 0.05, 'glyph width')
})

test('a file that holds no icon has no look', async () => {
  assert.equal(await iconLookOf(Buffer.from('not a picture')), null)
  const clear = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .png()
    .toBuffer()
  assert.equal(await iconLookOf(clear), null)
})

test('a section takes one weight: a stray measure does not change one card', () => {
  const look = (weight) => ({ weight })
  const looks = sectionLooks(
    new Map([
      ['block-1.a', look('thin')],
      ['block-1.b', look('light')],
      ['block-1.c', look('thin')],
      ['block-2.a', look('bold')]
    ])
  )
  assert.deepEqual(
    [...looks.values()].map((l) => l.weight),
    ['thin', 'thin', 'thin', 'bold']
  )
})

const draw = (look, colour = '#106b5a', plateColour = look.plate?.colour) =>
  iconPicture({
    glyph: 'star',
    weight: look.weight,
    width: look.width,
    height: look.height,
    colour,
    ground: look.plate ? { ...look.plate, colour: plateColour, glyph: look.glyph } : null,
    glyphBox: look.glyph
  })

test('an icon drawn to a look reads back as that look', async () => {
  for (const given of [
    { disc: '#17171b', stroke: 3 },
    { disc: '#d83a3a', opacity: 0.1, stroke: 3 },
    { stroke: 3 },
    { stroke: 6 }
  ]) {
    const was = await iconLookOf(await templateIcon(given))
    const made = await draw(was)
    assert.deepEqual([made.width, made.height], [was.width, was.height])
    const now = await iconLookOf(made.bytes)
    assert.deepEqual(looksDiffer(was, now), [], JSON.stringify(given))
    assert.equal(sectionLineDiffers([{ was, now }]), null, JSON.stringify(given))
  }
})

test('without a backing the glyph keeps the place and size of the one it replaces, it does not fill the box', async () => {
  const was = await iconLookOf(await templateIcon({ stroke: 2 }))
  const now = await iconLookOf((await draw(was)).bytes)
  assert.ok(Math.max(now.glyph.w, now.glyph.h) < 0.7, JSON.stringify(now.glyph))
})

test('what differs is named: no backing, another size, another weight, another backing', async () => {
  const was = await iconLookOf(await templateIcon({ disc: '#17171b', stroke: 2 }))
  const bare = await iconLookOf(
    (await iconPicture({ glyph: 'star', weight: 'regular', width: 100, height: 100, colour: '#106b5a' }))
      .bytes
  )
  const said = looksDiffer(was, bare).join(' ')
  assert.match(said, /backing/)
  assert.match(said, /size/)
  assert.match(sectionLineDiffers([{ was, now: bare }]), /line/)
  const otherDisc = await iconLookOf(await templateIcon({ disc: '#17171b', stroke: 2, inset: 20 }))
  assert.match(looksDiffer(was, otherDisc).join(' '), /backing/)
  const faint = await iconLookOf(await templateIcon({ disc: '#17171b', opacity: 0.4, stroke: 2 }))
  assert.match(looksDiffer(was, faint).join(' '), /backing/)
  const thick = await iconLookOf(await templateIcon({ disc: '#17171b', stroke: 7 }))
  assert.match(sectionLineDiffers([{ was, now: thick }]), /line/)
})

test('one stray read does not make a section heavy; the whole section drawn heavier does', async () => {
  const was = await iconLookOf(await templateIcon({ disc: '#17171b', stroke: 3 }))
  const same = await iconLookOf(await templateIcon({ disc: '#17171b', stroke: 3 }))
  const heavy = await iconLookOf(await templateIcon({ disc: '#17171b', stroke: 7 }))
  const pair = (now) => ({ was, now })
  assert.equal(sectionLineDiffers([pair(same), pair(same), pair(heavy)]), null)
  assert.match(sectionLineDiffers([pair(heavy), pair(heavy), pair(same)]), /line/)
})
