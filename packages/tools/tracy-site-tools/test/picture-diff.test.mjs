/**
 * Where two pictures of one window differ (`picture-diff.mjs`): counted from the pixels, joined into
 * places, and each small place cut out of both pictures, enlarged — the fact the visual check hands
 * its comparison so a recoloured menu link is not read as unchanged (B1, dev 25/10/2026).
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import jpeg from 'jpeg-js'

import { CELL, PLACES_ZOOMED, ZOOM_MAX, pictureChanges } from '../src/host/picture-diff.mjs'

const W = 1043
const H = 807
const GROUND = [18, 17, 17]
const WHITE = [255, 255, 255]
const BLUE = [46, 134, 222]

/**
 * A JPEG of a dark window with rectangles painted on it, encoded the way pictures are drawn.
 * @param {{ x: number, y: number, w: number, h: number, rgb: number[] }[]} rects
 * @param {{ w?: number, h?: number }} [size]
 */
function picture(rects, { w = W, h = H } = {}) {
  const data = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i += 1) data.set([...GROUND, 255], i * 4)
  for (const r of rects)
    for (let y = r.y; y < r.y + r.h; y += 1)
      for (let x = r.x; x < r.x + r.w; x += 1) data.set([...r.rgb, 255], (y * w + x) * 4)
  return Buffer.from(jpeg.encode({ width: w, height: h, data }, 80).data)
}

/** The colour at the middle of a JPEG. @param {Buffer} bytes */
function middle(bytes) {
  const image = jpeg.decode(bytes, { useTArray: true })
  const i = (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * 4
  return [image.data[i], image.data[i + 1], image.data[i + 2]]
}

const LINK = { x: 494, y: 45, w: 52, h: 14 }

test('the same window drawn twice: nothing changed, no place, nothing cut out', () => {
  const page = picture([{ ...LINK, rgb: WHITE }])
  const changes = pictureChanges(page, page)
  assert.deepEqual(changes, { width: W, height: H, share: 0, places: [], more: 0, zooms: [] })
})

test('🔒 a menu link recoloured: one place where it is, cut out of both pictures and drawn larger', () => {
  const changes = pictureChanges(picture([{ ...LINK, rgb: WHITE }]), picture([{ ...LINK, rgb: BLUE }]))
  assert.ok(changes !== null)
  assert.equal(changes.places.length, 1)
  const [place] = changes.places
  // The place covers the link, on the cell grid, and not much more.
  assert.ok(place.x <= LINK.x && place.x + place.w >= LINK.x + LINK.w)
  assert.ok(place.y <= LINK.y && place.y + place.h >= LINK.y + LINK.h)
  assert.ok(place.w <= LINK.w + 4 * CELL && place.h <= LINK.h + 4 * CELL)
  assert.ok(changes.share > 0 && changes.share < 0.01)
  assert.equal(changes.zooms.length, 1)
  const [zoom] = changes.zooms
  assert.deepEqual(zoom.place, place)
  assert.equal(zoom.scale, ZOOM_MAX)
  // The cut shows the link itself: white before, blue after.
  const [rb, gb, bb] = middle(zoom.before)
  const [ra, ga, ba] = middle(zoom.after)
  assert.ok(rb > 200 && gb > 200 && bb > 200, `before ${[rb, gb, bb]}`)
  assert.ok(ra < 100 && ba > 180, `after ${[ra, ga, ba]}`)
})

test('places far apart stay apart, in reading order; at most PLACES_ZOOMED are cut out', () => {
  const spots = [
    { x: 40, y: 600, w: 30, h: 12 },
    { x: 900, y: 40, w: 30, h: 12 },
    { x: 40, y: 40, w: 30, h: 12 },
    { x: 500, y: 300, w: 30, h: 12 }
  ]
  const changes = pictureChanges(
    picture(spots.map((s) => ({ ...s, rgb: WHITE }))),
    picture(spots.map((s) => ({ ...s, rgb: BLUE })))
  )
  assert.ok(changes !== null)
  assert.equal(changes.places.length, 4)
  assert.deepEqual(
    changes.places.map((p) => [p.y < 100, p.x < 100]),
    [
      [true, true],
      [true, false],
      [false, false],
      [false, true]
    ]
  )
  assert.equal(changes.zooms.length, PLACES_ZOOMED)
})

test('a large change is named but not cut out; a window that mostly changed has no cut at all', () => {
  const banner = { x: 0, y: 100, w: W, h: 300 }
  const big = pictureChanges(
    picture([]),
    picture([
      { ...banner, rgb: BLUE },
      { ...LINK, rgb: WHITE }
    ])
  )
  assert.ok(big !== null)
  assert.equal(big.places.length, 2)
  assert.equal(big.zooms.length, 1, 'only the small place is cut out')
  const moved = pictureChanges(picture([]), picture([{ x: 0, y: 0, w: W, h: 600, rgb: WHITE }]))
  assert.ok(moved !== null)
  assert.ok(moved.share > 0.5)
  assert.equal(moved.zooms.length, 0)
})

test('two pictures that cannot be compared measure nothing', () => {
  const page = picture([])
  assert.equal(pictureChanges(page, picture([], { w: 800, h: 600 })), null)
  assert.equal(pictureChanges(page, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])), null)
})
