// The finder's compact input (#448): one page's viewport tiles become a few stitched sheets per width, the 1440 px tiles
// shrunk by at most a fifth and the 390 px tiles never, so a fault stays readable while the call carries fewer pixels and
// bytes. The pages are invented: striped JPEG tiles drawn here, shot the way the host shoots them (900 px desktop and
// 844 px phone viewports, the next tile 128 px before the last one ended).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import {
  DESKTOP_SCALE,
  imageBudget,
  pageSheets,
  SHEET_MAX_HEIGHT,
  SHEET_OVERLAP
} from '../src/write-step/finder/finder-sheets.js'

const VIEW = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } }
const OVERLAP = 128

/** The page's rows: 100 px bands, dark on even bands and light on odd, so where a row came from can be read back. */
const bandAt = (docY) => (Math.floor(docY / 100) % 2 === 0 ? 30 : 225)

/** One viewport tile of an invented page whose document is `documentHeight` tall, drawn from the page's bands. */
async function tileAt(viewport, y) {
  const { width, height } = VIEW[viewport]
  const raw = Buffer.alloc(width * height * 3)
  for (let r = 0; r < height; r++) raw.fill(bandAt(y + r), r * width * 3, (r + 1) * width * 3)
  const jpeg = await sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

/** Every tile of an invented page at one width, as lib/page-shots.js keeps them. */
async function tilesOf(page, viewport, documentHeight) {
  const { height } = VIEW[viewport]
  const tiles = []
  for (let y = 0; ; y += height - OVERLAP) {
    const top = Math.max(0, Math.min(y, documentHeight - height))
    tiles.push({
      page,
      viewport,
      index: tiles.length,
      y: top,
      height,
      documentHeight,
      image: await tileAt(viewport, top)
    })
    if (top + height >= documentHeight) break
  }
  return tiles
}

const decoded = async (image) => {
  const { data, info } = await sharp(Buffer.from(image.split(',')[1], 'base64'))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

test('a long invented page at both widths goes in as fewer, smaller sheets that still cover every row', async () => {
  const tiles = [...(await tilesOf('/menu', 'desktop', 5200)), ...(await tilesOf('/menu', 'phone', 9100))]
  const sheets = await pageSheets(tiles)
  const before = await imageBudget(tiles)
  const after = await imageBudget(sheets)
  console.log(
    `finder input of one invented page: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`
  )
  assert.ok(after.images <= before.images * 0.6, `${after.images} sheets for ${before.images} tiles`)
  assert.ok(after.bytes < before.bytes * 0.7, `${after.bytes} bytes for ${before.bytes}`)
  assert.ok(after.tokens < before.tokens * 0.7, `${after.tokens} image tokens for ${before.tokens}`)
  for (const viewport of ['desktop', 'phone']) {
    const mine = sheets.filter((s) => s.viewport === viewport)
    assert.deepEqual(
      mine.map((s) => s.index),
      mine.map((_, i) => i),
      'sheets are numbered from 0 per width'
    )
    // Coverage: the sheets of a width run from the top of the page to its end with no gap; each starts a little before
    // the last one ended, so a line cut at the foot of one sheet shows whole at the head of the next.
    assert.equal(mine[0].y, 0)
    for (let i = 1; i < mine.length; i++) {
      const end = mine[i - 1].y + mine[i - 1].height
      assert.ok(
        mine[i].y > mine[i - 1].y && mine[i].y <= end - SHEET_OVERLAP,
        `sheet ${i} starts at ${mine[i].y}`
      )
    }
    const last = mine.at(-1)
    assert.equal(last.y + last.height, viewport === 'desktop' ? 5200 : 9100)
    for (const s of mine) {
      const { width, height } = await decoded(s.image)
      assert.equal(
        width,
        viewport === 'desktop' ? Math.round(1440 * DESKTOP_SCALE) : 390,
        'phone tiles are never shrunk'
      )
      assert.ok(height <= SHEET_MAX_HEIGHT[viewport], `a ${viewport} sheet is ${height} px tall`)
    }
  }
  assert.ok(DESKTOP_SCALE >= 0.8, 'desktop text shrinks by a fifth at most')
})

test('each sheet row shows the page row it says it shows, across every seam', async () => {
  const tiles = await tilesOf('/', 'phone', 3000)
  const sheets = await pageSheets(tiles)
  for (const s of sheets) {
    const { data, width, height } = await decoded(s.image)
    // Sample the middle of each band: a seam that dropped or repeated rows shifts the bands and the sample flips.
    for (let docY = s.y + 50; docY < s.y + height; docY += 100) {
      const value = data[(docY - s.y) * width + Math.floor(width / 2)]
      const want = bandAt(docY)
      assert.ok(Math.abs(value - want) < 40, `row ${docY} of the page reads ${value}, wants ${want}`)
    }
  }
})

test('a page shot in one tile per width stays one image per width', async () => {
  const tiles = [...(await tilesOf('/contact', 'desktop', 900)), ...(await tilesOf('/contact', 'phone', 700))]
  const sheets = await pageSheets(tiles)
  assert.deepEqual(
    sheets.map((s) => [s.viewport, s.index, s.y, s.height]),
    [
      ['desktop', 0, 0, 900],
      ['phone', 0, 0, 844]
    ]
  )
})
