/**
 * The initials avatar (TracyHQ/tracy#134): the substitute of a person picture with no portrait. It is drawn from vector
 * strokes (no font file, so a host without fonts draws the same letters), in the brand's colour and the frame of the slot.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { initialsAvatar } from '../src/lib/picture-cut.js'

/** The share of pixels in a box that differ from `ground` by more than a little: the ink drawn there. */
async function inkShare(bytes, box, ground) {
  const { data, info } = await sharp(bytes).extract(box).raw().toBuffer({ resolveWithObject: true })
  let ink = 0
  for (let i = 0; i < data.length; i += info.channels) {
    const d =
      Math.abs(data[i] - ground[0]) + Math.abs(data[i + 1] - ground[1]) + Math.abs(data[i + 2] - ground[2])
    if (d > 60) ink += 1
  }
  return ink / (box.width * box.height)
}

test('an initials avatar keeps the frame of the slot and draws the letters in the middle on the brand colour', async () => {
  const ground = [31, 59, 77]
  for (const [width, height] of [
    [600, 600],
    [480, 640]
  ]) {
    const avatar = await initialsAvatar({ width, height, initials: 'WE', colours: ['#1f3b4d', '#c99a5b'] })
    const meta = await sharp(avatar.bytes).metadata()
    assert.deepEqual([meta.width, meta.height, meta.format, avatar.ext], [width, height, 'jpeg', 'jpg'])
    const side = Math.round(Math.min(width, height) / 3)
    const middle = {
      left: Math.round((width - side) / 2),
      top: Math.round((height - side) / 2),
      width: side,
      height: side
    }
    assert.ok((await inkShare(avatar.bytes, middle, ground)) > 0.05, 'the letters are drawn in the middle')
    const corner = { left: 0, top: 0, width: 20, height: 20 }
    assert.equal(await inkShare(avatar.bytes, corner, ground), 0, 'the ground is the brand colour')
  }
})

test('different initials draw different pictures, the same initials the same bytes', async () => {
  const draw = (initials) => initialsAvatar({ width: 300, height: 300, initials, colours: ['#1f3b4d'] })
  const [we, js, again] = await Promise.all([draw('WE'), draw('JS'), draw('WE')])
  assert.notEqual(we.sha256, js.sha256)
  assert.equal(we.sha256, again.sha256)
})

test('no initials draw a neutral figure; letters outside A to Z are never drawn as boxes', async () => {
  const none = await initialsAvatar({ width: 300, height: 300, initials: '', colours: [] })
  const odd = await initialsAvatar({ width: 300, height: 300, initials: '\u674e', colours: [] })
  assert.equal(none.sha256, odd.sha256)
  const meta = await sharp(none.bytes).metadata()
  assert.deepEqual([meta.width, meta.height], [300, 300])
})
