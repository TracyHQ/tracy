/**
 * The browser-tab icon of a brief build, made from the business's own mark (spec TracyHQ/tracy#189, COO name rule 3 of
 * 29/10/2026). The template's favicon is a demo leftover like its logo: a brief build that has a logo of the business,
 * or a symbol drawn for one that gave none (`brand-logo-symbol.js`), shows that mark in the tab.
 *
 *   faviconMark  the PUNCHED mark (`favicon-silhouette.js`): the same cut the logo work makes (`brand-logo-fit.js
 *                markVariants`: tile cut away, words left out when they stand apart), then cut only outside its outer
 *                outline; inside, the logo's own ground colour with the drawing on it in a few flat colours, cleaned of
 *                noise. Measured on a light and a dark tab bar (`TAB_LIGHT`, `TAB_DARK`), and the result says how it reads
 *   faviconSet   `favicon.ico` (16, 32 and 48 px) and 192 and 512 px PNGs, each drawn down from its own cleaned master
 *                (thinner details leave the smaller sizes, a light sharpen at 16 and 32); a 180 px apple touch icon on the
 *                ground colour
 *
 * 🔒 TRANSPARENT ONLY OUTSIDE THE SILHOUETTE (COO 29/10/2026): no square tile, and the inside is never hollowed out. Only
 * the apple touch icon is opaque, because iOS paints transparency black (a platform rule).
 * 🔒 THE OWNER'S DRAWING, NEVER REDRAWN: only cut, flattened to its own colours, cleaned, padded and scaled. A wide wordmark
 * makes no icon (letters shrunk to 16 px read as a smudge); the caller then uses the drawn symbol, and with neither the
 * template's icon stays and the build says so.
 */
import sharp from 'sharp'

import { logoContrast } from './brand-joomla-logo-contrast.js'
import { markVariants } from './brand-logo-fit.js'
import {
  cleaned,
  flatLabels,
  MASTER,
  outlineOf,
  paletteFor,
  rendered,
  silhouetteOf,
  withOutline
} from './favicon-silhouette.js'

/** Margin around the mark, as a share of the side, so it does not touch the tab's edge. */
const MARGIN = 0.06
/** A mark at most this far from square fills an icon; a wider one is a wordmark. */
const SQUARE_ENOUGH = 1.6
/** The tab bars an icon must read on: a browser's light and dark tab strip. */
export const TAB_LIGHT = Object.freeze({ r: 241, g: 243, b: 244 })
export const TAB_DARK = Object.freeze({ r: 32, g: 33, b: 36 })
/** An icon reads on a bar when this share of its pixels reaches 3:1 there (the logo work's own measure). */
const READABLE_SHARE = 0.5
/** The sizes `favicon.ico` carries. */
export const ICO_SIZES = Object.freeze([16, 32, 48])

/** @typedef {{r: number, g: number, b: number}} Rgb */

/** The cleaning of a size: a detail thinner than about one pixel of it leaves; at least the master's own noise (a 5 px mesh). */
const radiusFor = (/** @type {number} */ size) =>
  Math.max(2, Math.round((MASTER / size) * (size <= 32 ? 0.45 : 0.3)))
const crumbFor = (/** @type {number} */ size) => Math.max(64, Math.round((MASTER / size) ** 2))

/**
 * @param {Uint8Array} bytes - the logo as the owner gave it, or the symbol drawn for the business
 * @returns {Promise<{png: Buffer, at: (size: number) => Promise<Buffer>, palette: Rgb[], reads: {light: boolean,
 *   dark: boolean}, how: string} | null>} the 512 px master and a maker of each size, or null when the mark makes no icon
 */
export async function faviconMark(bytes) {
  const v = await markVariants(bytes).catch(() => null)
  if (!v) return null
  const meta = await sharp(Buffer.from(v.mark)).metadata()
  const aspect = (meta.width ?? 1) / (meta.height ?? 1)
  if (aspect > SQUARE_ENOUGH || aspect < 1 / SQUARE_ENOUGH) return null
  const alpha = await silhouetteOf(v.mark, MARGIN)
  const palette = await paletteFor(v.mark, v.tile)
  const labels = await flatLabels(v.mark, palette, MARGIN)
  /** @type {Map<number, Promise<Buffer>>} */
  const masters = new Map()
  // The outline the drawing draws around the mark stays at least one pixel of each size wide, so a small icon keeps it.
  const outline = outlineOf(labels, alpha)
  const masterFor = (/** @type {number} */ size) => {
    const key = radiusFor(size)
    if (!masters.has(key)) {
      const clean = cleaned(labels, palette.length, key, crumbFor(size))
      const width = Math.round(MASTER / size)
      const drawn = outline !== null && size <= 48 ? withOutline(clean, alpha, outline, width) : clean
      masters.set(key, rendered(drawn, palette, alpha))
    }
    return /** @type {Promise<Buffer>} */ (masters.get(key))
  }
  const at = async (/** @type {number} */ size) => {
    const master = await masterFor(size)
    if (size === MASTER) return master
    const down = sharp(master).resize(size, size, { kernel: 'lanczos3' })
    return (size <= 32 ? down.sharpen({ sigma: 0.5 }) : down).png().toBuffer()
  }
  const png = await at(MASTER)
  const light = (await logoContrast(png, TAB_LIGHT)) >= READABLE_SHARE
  const dark = (await logoContrast(png, TAB_DARK)) >= READABLE_SHARE
  const words = v.words ? ', its words left out' : ''
  const ground = v.tile ? "on the logo's own ground colour" : 'on the colour that stands out most from it'
  const reads =
    light && dark
      ? 'reads on both tab bars'
      : light
        ? 'reads on the light tab bar only'
        : 'reads on the dark tab bar only'
  return { png, at, palette, reads: { light, dark }, how: `the punched mark${words}, ${ground}, ${reads}` }
}

/**
 * An ICO file whose entries are PNG pictures (every browser since Windows Vista reads them).
 * @param {Buffer[]} pngs - square PNGs, each at most 256 px
 * @returns {Promise<Buffer>}
 */
export async function icoOf(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const png of pngs) {
    const { width = 0, height = 0 } = await sharp(png).metadata()
    const entry = Buffer.alloc(16)
    entry.writeUInt8(width >= 256 ? 0 : width, 0)
    entry.writeUInt8(height >= 256 ? 0 : height, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    entries.push(entry)
  }
  return Buffer.concat([header, ...entries, ...pngs])
}

/**
 * The files of the icon, from what `faviconMark` made.
 * @param {{at: (size: number) => Promise<Buffer>, palette: Rgb[]}} icon
 * @returns {Promise<{ico: Buffer, apple: Buffer, png192: Buffer, png512: Buffer}>}
 */
export async function faviconSet(icon) {
  const small = []
  for (const size of ICO_SIZES) small.push(await icon.at(size))
  // 🔒 PLATFORM RULE: iOS paints a transparent apple touch icon black, so this one file alone is opaque, on the same ground
  // colour as the inside of the silhouette.
  const apple = await sharp(await icon.at(180))
    .flatten({ background: icon.palette[0] })
    .png()
    .toBuffer()
  return { ico: await icoOf(small), apple, png192: await icon.at(192), png512: await icon.at(MASTER) }
}

/**
 * The favicon a build sets: the one the customer uploaded, as given; else, on a brief build, the icon made from the
 * business's logo, else from the symbol drawn for it; else none (and why, for the build's notes).
 * @param {{uploaded?: Uint8Array | null, logo?: Uint8Array | null, symbol?: Uint8Array | null, briefBuild?: boolean}} input
 * @returns {Promise<{favicon: Uint8Array | null, how: string}>}
 */
export async function buildFavicon({ uploaded = null, logo = null, symbol = null, briefBuild = false }) {
  if (uploaded?.byteLength) return { favicon: uploaded, how: 'the favicon the customer uploaded' }
  if (!briefBuild) return { favicon: null, how: 'no favicon given: the template keeps its own' }
  for (const [bytes, from] of /** @type {const} */ ([
    [logo, 'the logo'],
    [symbol, 'the drawn symbol']
  ])) {
    if (!bytes?.byteLength) continue
    const icon = await faviconMark(bytes).catch(() => null)
    if (icon) return { favicon: icon.png, how: `${icon.how}, from ${from}` }
  }
  return { favicon: null, how: 'no mark of the business makes an icon: the template keeps its own' }
}
