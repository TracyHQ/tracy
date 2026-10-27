/**
 * The card-sized copy of a stored screenshot (`src/lib/shot-thumb.js`): which widths the door
 * serves, and that the copy is the page's first screen, small, as WebP — never enlarged, and never
 * an error when the picture cannot be read (the door then serves the original).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import sharp from 'sharp'

import { shotThumb, THUMB_WIDTHS, thumbWidth } from '../src/lib/shot-thumb.js'

/** A full-page desktop shot as stored: 2880 wide, many screens tall. */
async function tallShot(width = 2880, height = 7200) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: '#bf5b3d' } })
    .png()
    .toBuffer()
  return { bytes, sha256: `test-${width}x${height}` }
}

test('only the widths a card asks for are served; anything else is the original', () => {
  for (const w of THUMB_WIDTHS) assert.equal(thumbWidth(String(w)), w)
  for (const raw of [undefined, '', '0', '721', '99999', '720px', '-720', '7e2']) {
    assert.equal(thumbWidth(raw), null, String(raw))
  }
})

test('a full-page shot becomes its first 16:10 screen, 720 wide, as WebP', async () => {
  const out = await shotThumb(await tallShot(), 720)
  assert.ok(out)
  const meta = await sharp(out).metadata()
  assert.equal(meta.format, 'webp')
  assert.equal(meta.width, 720)
  assert.equal(meta.height, 450)
})

test('a picture narrower than the width asked for is not enlarged', async () => {
  const out = await shotThumb(await tallShot(390, 2400), 720)
  assert.ok(out)
  const meta = await sharp(out).metadata()
  assert.equal(meta.width, 390)
})

test('bytes that are not a picture give null, so the door falls back to the original', async () => {
  assert.equal(await shotThumb({ bytes: Buffer.from('not a picture'), sha256: 'garbage' }, 720), null)
})
