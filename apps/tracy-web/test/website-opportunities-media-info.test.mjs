/**
 * A collected picture's size as the picture planner reads it (`wo_media.width/height`): the size it is shown at, so a crop
 * planned from it has the shape the cut makes.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)

const photo = (width, height, orientation) =>
  sharp({ create: { width, height, channels: 3, background: '#8a6d4b' } })
    .withMetadata(orientation ? { orientation } : {})
    .jpeg()
    .toBuffer()

test('a phone photo stored on its side is measured upright, as every cut turns it', async () => {
  // EXIF 6 and 8 are a quarter turn: the stored 1200×900 is shown 900×1200.
  for (const orientation of [6, 8]) {
    const info = await imageInfo(await photo(1200, 900, orientation))
    assert.deepEqual([info.width, info.height], [900, 1200], `orientation ${orientation}`)
  }
  // Upright or upside down keeps its stored size.
  for (const orientation of [undefined, 1, 3]) {
    const info = await imageInfo(await photo(1200, 900, orientation))
    assert.deepEqual([info.width, info.height], [1200, 900], `orientation ${orientation}`)
  }
})
