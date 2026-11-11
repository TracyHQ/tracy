/**
 * A collected picture's size as the picture planner reads it (`wo_media.width/height`): the size it is shown at, so a crop
 * planned from it has the shape the cut makes.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { imageInfoWith, logoPaletteOf } from 'website-opportunities/src/media-info.js'
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

test('native picture measurement is bounded across adapters while preserving input and features', async () => {
  const bytes = await photo(120, 90)
  const measured = { dhash: '010203', top2Share: 0.8, edgeDensity: 0.2, centreLuminance: 0.4 }
  let active = 0
  let peak = 0
  const host = {
    async pictureFeatures(input) {
      assert.deepEqual(input, bytes)
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 30))
      active -= 1
      return measured
    }
  }
  const first = imageInfoWith(host)
  const second = imageInfoWith(host)
  const results = await Promise.all([first(bytes), second(bytes), first(bytes), second(bytes), first(bytes)])
  assert.equal(peak, 1, 'only one native picture decoder may be in flight process-wide')
  for (const info of results) {
    assert.deepEqual([info.width, info.height], [120, 90])
    assert.equal(info.dhash, measured.dhash)
    assert.deepEqual(info.features, { v: 1, top2Share: 0.8, edgeDensity: 0.2, centreLuminance: 0.4 })
    assert.equal(info.palette.length, 1)
    assert.equal(info.palette[0].weight, 1)
  }
})

test('malformed images and failed optional features release the native image permit', async () => {
  const bytes = await photo(120, 90)
  const read = imageInfoWith({
    pictureFeatures: async () => {
      throw new Error('Features unavailable')
    }
  })
  const [bad, good, logo] = await Promise.allSettled([
    read(Buffer.from('invalid picture')),
    read(bytes),
    logoPaletteOf(bytes)
  ])
  assert.equal(bad.status, 'rejected')
  assert.equal(good.status, 'fulfilled')
  assert.deepEqual([good.value.width, good.value.height], [120, 90])
  assert.equal(good.value.features, null)
  assert.equal(good.value.dhash, null)
  assert.equal(logo.status, 'fulfilled')
  assert.ok(logo.value.length > 0)
  assert.equal(await logoPaletteOf(Buffer.from('invalid logo')), null)
  assert.equal((await read(bytes)).width, 120)
})

test('logo decoding waits for a picture feature decoder to finish', async () => {
  const bytes = await photo(120, 90)
  let enter
  const entered = new Promise((resolve) => {
    enter = resolve
  })
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  const read = imageInfoWith({
    pictureFeatures: async () => {
      enter()
      await held
      return null
    }
  })
  const picture = read(bytes)
  await entered
  let logoDone = false
  const logo = logoPaletteOf(bytes).then((value) => {
    logoDone = true
    return value
  })
  try {
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.equal(logoDone, false)
  } finally {
    release()
    await Promise.all([picture, logo])
  }
  assert.equal(logoDone, true)
})
