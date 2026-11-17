// An owner photo is cut to its slot around its subject, never padded (#575 pictures gap audit, port 3): the step chain
// cuts the largest box of the frame's shape around the labelled subject and never through a head
// (`site-pictures/cut-photo.js` `cutPhoto`), enlarges at most 1.5 times, and writes a JPEG at quality 84. The build
// chat padded every picture with transparency to a PNG and enlarged it twice. A logo is still padded, never cut.
// Invented pictures drawn with sharp; no real photo.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-photo-cut.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { slotPictureOf } from '../src/step-chain-draft-picture-fit.js'

const photo = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: '#4b7a9c' } })
    .composite([
      {
        input: {
          create: {
            width: Math.round(width / 5),
            height: Math.round(height / 3),
            channels: 3,
            background: '#e0c040'
          }
        },
        left: Math.round(width * 0.7),
        top: Math.round(height * 0.3)
      }
    ])
    .jpeg({ quality: 95 })
    .toBuffer()
const fit = (more = {}) => ({
  width: 800,
  height: 800,
  aspect: 1,
  minWidth: 0,
  transparent: false,
  slots: ['s1'],
  ...more
})
const op = (more = {}) => ({
  key: 'picture:p1',
  picture: 'p1',
  pictureKind: 'offering.image',
  ref: 'https://larkspur-florist.example/img/p1.jpg',
  slotFit: fit(),
  slotOptional: true,
  ...more
})
const ctx = (labels = new Map()) => ({ report: { unproven: [] }, state: {}, pictureLabels: labels })

test('a landscape photo is cut to the square slot as a JPEG, around its labelled subject', async () => {
  const bytes = await photo(1600, 1000)
  const labels = new Map([
    ['https://larkspur-florist.example/img/p1.jpg', { subjectBox: [0.7, 0.3, 0.2, 0.33] }]
  ])
  const got = await slotPictureOf(op(), { bytes, mime: 'image/jpeg' }, ctx(labels))
  assert.equal(got.mime, 'image/jpeg')
  const meta = await sharp(got.bytes).metadata()
  assert.equal(meta.format, 'jpeg')
  assert.equal(meta.width, meta.height, 'cut to the slot shape, not padded')
  // The cut sits on the subject: the yellow box stays whole (about a tenth of the cut), where a centred cut would
  // keep little more than half of it.
  const { data } = await sharp(got.bytes).raw().toBuffer({ resolveWithObject: true })
  let yellow = 0
  for (let i = 0; i < data.length; i += 3)
    if (data[i] > 180 && data[i + 1] > 150 && data[i + 2] < 120) yellow += 1
  assert.ok(yellow / (data.length / 3) > 0.09, `yellow share ${yellow / (data.length / 3)}`)
})

test('a photo too small for the slot within 1.5 times is left out at an optional place, never blown up', async () => {
  const bytes = await photo(400, 400)
  const c = ctx()
  const got = await slotPictureOf(op(), { bytes, mime: 'image/jpeg' }, c)
  assert.equal(got, null)
  assert.equal(c.state.left['picture:p1'], 'slot_picture_too_small')
})

test('a logo slot is still padded with a clear ground, never cut', async () => {
  const bytes = await sharp({ create: { width: 400, height: 400, channels: 4, background: '#7a4b9c' } })
    .png()
    .toBuffer()
  const got = await slotPictureOf(
    op({
      pictureKind: 'business.logo',
      slotFit: fit({ width: 393, height: 113, aspect: 393 / 113, transparent: true })
    }),
    { bytes, mime: 'image/png' },
    ctx()
  )
  assert.equal(got.mime, 'image/png')
})
