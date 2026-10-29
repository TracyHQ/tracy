// What the site's Slot fit check accepts, met before a brief build writes (spec TracyHQ/tracy#189): a picture at least as
// wide as `fit.minWidth`, and a line planned within its measured box. Fixtures are fictional (a bakery and a racket club).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { meetSlotMinWidth, minWidthOf } from '../src/sites/brief-engines/picture-min-width.js'
import { boxLimitOf, withBoxLimits } from '../src/sites/brief-engines/slot-box-limits.js'

const jpeg = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: '#c08040' } })
    .jpeg()
    .toBuffer()
const png = (width, height) =>
  sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toBuffer()
const MAP = {
  slots: [
    { key: 'module-7.0', type: 'image', fit: { measured: true, minWidth: 672, aspect: 1.5 } },
    { key: 'module-7.1', type: 'image', fit: { measured: true, minWidth: 1056, aspect: 1.5 } },
    { key: 'module-8.0', type: 'image', fit: { measured: true, kind: 'cutout', minWidth: 900 } },
    { key: 'module-9.0', type: 'image' }
  ]
}

test('#189 a picture narrower than its slot minWidth is enlarged to it, keeping its shape and format', async () => {
  const shaped = [
    {
      group: { slots: [{ key: 'module-7.0' }, { key: 'module-7.1' }] },
      bytes: await jpeg(360, 240),
      ext: 'jpg',
      hash: 'a',
      receipt: { kind: 'photo', width: 360, height: 240 }
    },
    { group: { slots: [{ key: 'module-8.0' }] }, bytes: await png(300, 400), ext: 'png', hash: 'b' }
  ]
  const [photo, cutOut] = await meetSlotMinWidth(shaped, MAP)
  const p = await sharp(photo.bytes).metadata()
  assert.equal(p.width, 1056, 'the widest minWidth of the slots it serves')
  assert.equal(p.height, 704)
  assert.equal(p.format, 'jpeg')
  assert.notEqual(photo.hash, 'a')
  assert.equal(photo.receipt.width, 1056)
  const c = await sharp(cutOut.bytes).metadata()
  assert.equal(c.width, 900)
  assert.equal(c.format, 'png')
  assert.equal(c.hasAlpha, true, 'a cut-out stays transparent')
})

test('#189 a picture already wide enough, or a slot with no minWidth, is left byte for byte', async () => {
  const wide = {
    group: { slots: [{ key: 'module-7.0' }] },
    bytes: await jpeg(800, 533),
    ext: 'jpg',
    hash: 'w'
  }
  const free = {
    group: { slots: [{ key: 'module-9.0' }] },
    bytes: await jpeg(100, 100),
    ext: 'jpg',
    hash: 'f'
  }
  const out = await meetSlotMinWidth([wide, free], MAP)
  assert.equal(out[0], wide)
  assert.equal(out[1], free)
  assert.equal(minWidthOf(free.group, new Map(MAP.slots.map((s) => [s.key, s]))), 0)
})

test('#189 a text slot is planned within its measured box when the box is tighter than the contract', () => {
  const slots = withBoxLimits([
    { key: 'module-1.2', type: 'text', maxCharacters: 110, fit: { measured: true, maxCharacters: 45 } },
    {
      key: 'module-1.3',
      type: 'text',
      maxCharacters: 128,
      fit: { measured: true, maxChars: { desktop: 59, phone: 86 } }
    },
    { key: 'module-1.4', type: 'text', maxCharacters: 30, fit: { measured: true, maxCharacters: 80 } },
    { key: 'module-1.5', type: 'text', maxCharacters: 60, fit: { measured: false, maxCharacters: 10 } },
    { key: 'module-1.6', type: 'image', fit: { measured: true, maxCharacters: 5 } }
  ])
  assert.deepEqual(
    slots.map((s) => s.maxCharacters),
    [45, 59, 30, 60, undefined]
  )
  assert.equal(boxLimitOf({ fit: { measured: true, maxChars: { desktop: 70 } } }), 70)
  assert.equal(boxLimitOf({}), null)
})
