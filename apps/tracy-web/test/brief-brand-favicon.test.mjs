/**
 * A brief build's browser-tab icon is made from the business's own mark (spec TracyHQ/tracy#189, COO name rule 3): the
 * picture of its logo with the words cut away, on the logo's own tile colour; else the symbol drawn for it; an upload
 * always wins, and a plain build keeps the template's icon. Every business here is fictional.
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

/** A dental clinic's crest exported as a social avatar: a gold shield on a navy tile, a line of letters below it. */
const crestAvatar = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#14213d"/><path d="M200 60 H400 V250 C400 330 300 380 300 380 C300 380 200 330 200 250 Z" fill="#e8c46a"/>${letters(440)}</svg>`
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

test('a crest avatar gives its picture alone, on the tile colour, as a 512 px square', async () => {
  const icon = await faviconMark(await crestAvatar())
  assert.ok(icon)
  const meta = await sharp(icon.png).metadata()
  assert.deepEqual([meta.width, meta.height], [512, 512])
  assert.match(icon.how, /words cut away/)
  assert.ok(icon.ground, 'the tile colour is kept as the ground')
  const corner = await pixel(icon.png, 2, 2)
  assert.ok(corner.a === 255 && corner.b > corner.r, `navy ground, got ${JSON.stringify(corner)}`)
  // The letters are gone: the bottom band of the icon holds no gold.
  const low = await pixel(icon.png, 256, 500)
  assert.ok(!(low.r > 180 && low.g > 150), `no letter at the bottom, got ${JSON.stringify(low)}`)
})

test('the icon files: an ICO of 16, 32 and 48 px, an opaque 180 px apple icon, and 192 and 512 px PNGs', async () => {
  const set = await faviconSet(await faviconMark(await drawnSymbol()))
  assert.equal(set.ico.readUInt16LE(2), 1)
  assert.equal(set.ico.readUInt16LE(4), ICO_SIZES.length)
  assert.deepEqual(
    ICO_SIZES.map((_, i) => set.ico.readUInt8(6 + i * 16)),
    [16, 32, 48]
  )
  const apple = await sharp(set.apple).metadata()
  assert.deepEqual([apple.width, apple.height], [180, 180])
  assert.equal((await pixel(set.apple, 1, 1)).a, 255)
  assert.equal((await sharp(set.png192).metadata()).width, 192)
  assert.equal((await sharp(set.png512).metadata()).width, 512)
})

test('a brief build: the logo first, a wordmark gives way to the drawn symbol, nothing leaves the template icon', async () => {
  const fromLogo = await buildFavicon({ logo: await crestAvatar(), briefBuild: true })
  assert.match(fromLogo.how, /from the logo/)
  assert.ok(fromLogo.favicon)
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
  assert.equal((await buildFavicon({ logo: await crestAvatar(), briefBuild: false })).favicon, null)
})
