// What the site's Slot fit check accepts, met before a brief build writes (spec TracyHQ/tracy#189): a picture at least as
// wide as `fit.minWidth`, and a line planned within its measured box. Fixtures are fictional (a bakery and a racket club).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { meetSlotFit, minWidthOf } from '../src/sites/brief-engines/picture-slot-fit.js'
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
  const [photo, cutOut] = await meetSlotFit(shaped, MAP)
  const p = await sharp(photo.bytes).metadata()
  assert.equal(p.width, 1056, 'the widest minWidth of the slots it serves')
  assert.equal(p.height, 704)
  assert.equal(p.format, 'jpeg')
  assert.notEqual(photo.hash, 'a')
  assert.equal(photo.receipt.width, 1056)
  assert.deepEqual(photo.receipt.fittedFrom, { width: 360, height: 240, changed: ['width'] })
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
  const out = await meetSlotFit([wide, free], MAP)
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

const FITS = {
  slots: [
    {
      key: 'module-20.0',
      type: 'image',
      fit: { measured: true, aspect: 1.5, tolerance: 0.02, minWidth: 2160, crop: 'cover', focus: 'top' }
    },
    {
      key: 'module-21.0',
      type: 'image',
      fit: { measured: true, aspect: 3.8571, minWidth: 324, crop: 'cover', transparent: true }
    },
    {
      key: 'module-22.0',
      type: 'image',
      fit: {
        measured: true,
        crop: 'contain',
        source: { width: 400, height: 100 },
        transparent: true,
        minWidth: 300
      }
    }
  ]
}

test('#189 a drawing in the demo file shape is cropped to the slot box aspect before it is written', async () => {
  // A 2:1 drawing for a hero whose desktop box is 1440 x 960: the plugin holds the slot to 1.5, not to the demo file.
  const [hero] = await meetSlotFit(
    [
      {
        group: { slots: [{ key: 'module-20.0' }] },
        bytes: await jpeg(2160, 1080),
        ext: 'jpg',
        hash: 'h',
        receipt: {}
      }
    ],
    FITS
  )
  const m = await sharp(hero.bytes).metadata()
  assert.equal(m.width, 2160)
  assert.ok(Math.abs(m.width / m.height / 1.5 - 1) <= 0.02, `${m.width}x${m.height}`)
  assert.deepEqual(hero.receipt.fittedFrom.changed, ['aspect', 'width'])
})

test('#189 an opaque picture in a slot that shows a cut-out gets clear corners, as PNG', async () => {
  const [proof] = await meetSlotFit(
    [{ group: { slots: [{ key: 'module-21.0' }] }, bytes: await jpeg(324, 84), ext: 'jpg', hash: 'p' }],
    FITS
  )
  assert.equal(proof.ext, 'png')
  const { data, info } = await sharp(proof.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(data[3], 0, 'the top left corner is clear')
  assert.equal(data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3], 255)
})

test('#189 a contained picture is padded clear to the demo file shape, never cropped', async () => {
  const [logo] = await meetSlotFit(
    [{ group: { slots: [{ key: 'module-22.0' }] }, bytes: await png(300, 300), ext: 'png', hash: 'l' }],
    FITS
  )
  const m = await sharp(logo.bytes).metadata()
  assert.equal(m.width / m.height, 4)
  assert.ok(m.width >= 300)
})
