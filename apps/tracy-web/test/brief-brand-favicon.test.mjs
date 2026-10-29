/**
 * A brief build's browser-tab icon is made from the business's own mark (spec TracyHQ/tracy#189, COO name rule 3): the
 * PUNCHED mark (transparent only outside its outer outline, the inside filled with the logo's ground colour, the drawing
 * flattened and cleaned), else the symbol drawn for it; an upload always wins, and a plain build keeps the template's
 * icon. Every business here is fictional.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { buildFavicon, faviconMark, faviconSet, ICO_SIZES } from '../src/sites/brief-engines/brand-favicon.js'

const svgPng = (svg) => sharp(Buffer.from(svg)).png().toBuffer()
const letters = (y) =>
  Array.from(
    { length: 7 },
    (_, i) => `<rect x="${120 + i * 52}" y="${y}" width="34" height="44" fill="#e8c46a"/>`
  ).join('')

/** The mesh of thin lines inside the crest's top half: AI-like fine detail no favicon can show. */
const mesh = Array.from(
  { length: 12 },
  (_, i) =>
    `<line x1="${230 + i * 12}" y1="90" x2="${230 + i * 12}" y2="200" stroke="#e8c46a" stroke-width="2"/>`
).join('')
/** A dental clinic's crest exported as a social avatar: a gold shield outline on a navy tile, a fine mesh and a solid
 * tooth inside, a line of letters below it. */
const crestAvatar = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#14213d"/><path d="M200 60 H400 V250 C400 330 300 380 300 380 C300 380 200 330 200 250 Z" fill="none" stroke="#e8c46a" stroke-width="14"/>${mesh}<circle cx="300" cy="275" r="40" fill="#e8c46a"/>${letters(440)}</svg>`
  )
/** A bakery's round badge on transparency: a brown disc with a cream ring and a cream dot. */
const roundBadge = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><circle cx="300" cy="300" r="260" fill="#5a3418"/><circle cx="300" cy="300" r="190" fill="none" stroke="#f2d9a6" stroke-width="26"/><circle cx="300" cy="300" r="80" fill="#f2d9a6"/></svg>`
  )
/** A florist's line mark with no ground colour: one dark green ring on transparency, nothing inside. */
const lineRing = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="200" fill="none" stroke="#1f4d2b" stroke-width="30"/></svg>`
  )
/** A bakery's wide wordmark: letters only, nothing to make an icon of. */
const wordmark = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="160">${Array.from({ length: 12 }, (_, i) => `<rect x="${20 + i * 72}" y="50" width="48" height="60" fill="#5a3418"/>`).join('')}</svg>`
  )
/** A symbol the picture door drew for a business with no logo: one dark shape on transparency. */
const drawnSymbol = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="180" fill="#2f4f3a"/></svg>`
  )

const pixel = async (png, x, y) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * 4
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }
}

/** The opaque colours of an icon (alpha 255), and the width of its alpha edge along the middle row. */
async function measure(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const colours = new Set()
  for (let o = 0; o < data.length; o += 4)
    if (data[o + 3] === 255) colours.add(`${data[o]},${data[o + 1]},${data[o + 2]}`)
  const y = Math.floor(info.height / 2)
  let soft = 0
  for (let x = 0; x < info.width; x += 1) {
    const a = data[(y * info.width + x) * 4 + 3]
    if (a > 0 && a < 255) soft += 1
  }
  return { colours, softPerSide: soft / 2 }
}

test('a crest: punched (transparent outside, filled inside on its tile colour), flat colours, crisp edge, mesh gone', async () => {
  const icon = await faviconMark(await crestAvatar())
  assert.ok(icon)
  const meta = await sharp(icon.png).metadata()
  assert.deepEqual([meta.width, meta.height], [512, 512])
  assert.match(icon.how, /punched mark, its words left out, on the logo's own ground colour/)
  // 🔒 Transparent outside the outline only: the corners are clear, the inside is the navy ground, never hollow.
  assert.equal((await pixel(icon.png, 2, 2)).a, 0)
  const inside = await pixel(icon.png, 256, 240)
  assert.ok(inside.a === 255 && inside.b > inside.r, JSON.stringify(inside))
  const { colours, softPerSide } = await measure(icon.png)
  assert.ok(colours.size <= 4, `flat palette, got ${colours.size} colours`)
  assert.ok(softPerSide <= 1.5, `crisp edge, got ${softPerSide} px`)
  // The fine mesh leaves: the mesh area is all ground.
  for (const x of [240, 252, 264, 276])
    assert.ok((await pixel(icon.png, x, 150)).b > (await pixel(icon.png, x, 150)).r, `mesh gone at ${x}`)
  // The letters are gone: the bottom band of the icon is clear.
  assert.equal((await pixel(icon.png, 256, 505)).a, 0)
})

test('small sizes keep the outline the crest draws around itself, at least one pixel wide', async () => {
  const icon = await faviconMark(await crestAvatar())
  const at16 = await icon.at(16)
  const gold = (p) => p.a > 128 && p.r > 150 && p.g > 120
  let rim = 0
  for (let x = 0; x < 16; x += 1) if (gold(await pixel(at16, x, 6))) rim += 1
  assert.ok(rim >= 2, `the gold outline shows on both sides at 16 px, got ${rim} pixels`)
})

/** A tennis club's crest: a gold outline, two rackets crossed in the middle (two rings, two handles), a hill at the bottom
 * leaning on the outline, and two stray dots. */
const racketCrest = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#14213d"/><path d="M150 60 H450 V280 C450 400 300 520 300 520 C300 520 150 400 150 280 Z" fill="none" stroke="#e8c46a" stroke-width="14"/><circle cx="245" cy="170" r="50" fill="none" stroke="#e8c46a" stroke-width="8"/><circle cx="355" cy="170" r="50" fill="none" stroke="#e8c46a" stroke-width="8"/><line x1="270" y1="215" x2="340" y2="320" stroke="#e8c46a" stroke-width="8"/><line x1="330" y1="215" x2="260" y2="320" stroke="#e8c46a" stroke-width="8"/><path d="M160 400 C220 350 260 420 300 380 C340 340 380 420 440 380 L440 420 L300 520 L160 420 Z" fill="#e8c46a"/><circle cx="200" cy="330" r="4" fill="#e8c46a"/><circle cx="400" cy="330" r="4" fill="#e8c46a"/></svg>`
  )

/** The gold cells of a small icon inside the box [x0, y0, x1, y1] (inclusive). */
async function goldIn(png, [x0, y0, x1, y1]) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let n = 0
  for (let y = y0; y <= y1; y += 1)
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * info.width + x) * 4
      if (data[i + 3] >= 128 && data[i] > 120) n += 1
    }
  return n
}

test('small sizes keep the main symbol whole and drop every other part whole, never a fragment', async () => {
  const icon = await faviconMark(await racketCrest())
  const at32 = await icon.at(32)
  // The crossed rackets stay, thickened: a ring of gold around an open head, and the handles below.
  assert.ok((await goldIn(at32, [9, 8, 10, 8])) >= 1, 'the left racket head is drawn')
  assert.equal(await goldIn(at32, [12, 8, 13, 8]), 0, 'its head stays open')
  assert.ok((await goldIn(at32, [13, 13, 18, 16])) >= 4, 'the handles are drawn')
  // The hill leaning on the outline and the stray dots leave whole: inside the outline below the symbol is all ground.
  assert.equal(await goldIn(at32, [10, 19, 21, 23]), 0)
  assert.equal(await goldIn(at32, [8, 15, 11, 18]), 0)
  assert.ok((await goldIn(await icon.at(48), [16, 14, 31, 22])) >= 10, 'the rackets at 48 px')
  // At 16 px the rackets would close up: the icon is the clean silhouette with its outline, nothing inside.
  assert.equal(await goldIn(await icon.at(16), [5, 3, 10, 10]), 0)
})

test('a round badge and a line mark with no ground colour are punched too, never on a square', async () => {
  const badge = await faviconMark(await roundBadge())
  assert.equal((await pixel(badge.png, 3, 3)).a, 0)
  assert.equal((await pixel(badge.png, 256, 256)).a, 255)
  assert.ok((await measure(badge.png)).colours.size <= 4)
  const ring = await faviconMark(await lineRing())
  assert.match(ring.how, /the colour that stands out most from it/)
  // The ring's inside is filled (no hole), with the colour that stands out from the green ring.
  const centre = await pixel(ring.png, 256, 256)
  assert.equal(centre.a, 255)
  assert.ok(centre.r > 200 && centre.g > 200, JSON.stringify(centre))
  assert.equal((await pixel(ring.png, 3, 3)).a, 0)
})

test('the icon files: punched ICO of 16, 32 and 48 px and 192/512 PNGs; the 180 px apple icon alone is opaque', async () => {
  const icon = await faviconMark(await crestAvatar())
  const set = await faviconSet(icon)
  assert.equal(set.ico.readUInt16LE(2), 1)
  assert.equal(set.ico.readUInt16LE(4), ICO_SIZES.length)
  assert.deepEqual(
    ICO_SIZES.map((_, i) => set.ico.readUInt8(6 + i * 16)),
    [16, 32, 48]
  )
  assert.equal((await pixel(set.png192, 1, 1)).a, 0)
  assert.equal((await sharp(set.png512).metadata()).width, 512)
  const apple = await sharp(set.apple).metadata()
  assert.deepEqual([apple.width, apple.height], [180, 180])
  // 🔒 Platform rule: the apple icon is opaque, on the same navy ground.
  const corner = await pixel(set.apple, 1, 1)
  assert.ok(corner.a === 255 && corner.b > corner.r, JSON.stringify(corner))
})

test('a brief build: the logo first, a wordmark gives way to the drawn symbol, nothing leaves the template icon', async () => {
  const fromLogo = await buildFavicon({ logo: await crestAvatar(), briefBuild: true })
  assert.match(fromLogo.how, /from the logo/)
  assert.ok(fromLogo.favicon)
  // The tab's file: an ICO of the cleaned 16, 32 and 48 px drawings, so the browser never shrinks the 512 itself.
  assert.deepEqual([...fromLogo.ico.subarray(0, 4)], [0, 0, 1, 0])
  assert.equal(fromLogo.ico.readUInt16LE(4), 3)
  const fromSymbol = await buildFavicon({
    logo: await wordmark(),
    symbol: await drawnSymbol(),
    briefBuild: true
  })
  assert.match(fromSymbol.how, /from the drawn symbol/)
  const none = await buildFavicon({ logo: await wordmark(), briefBuild: true })
  assert.equal(none.favicon, null)
})

test('an uploaded favicon always wins, and a plain build never makes one', async () => {
  const uploaded = await drawnSymbol()
  assert.equal(
    (await buildFavicon({ uploaded, logo: await crestAvatar(), briefBuild: true })).favicon,
    uploaded
  )
  assert.equal((await buildFavicon({ uploaded, briefBuild: true })).ico, undefined)
  assert.equal((await buildFavicon({ logo: await crestAvatar(), briefBuild: false })).favicon, null)
})
