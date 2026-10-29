/**
 * The browser-tab icon of a brief build, made from the business's own mark (spec TracyHQ/tracy#189, COO name rule 3 of
 * 29/10/2026). The template's favicon is a demo leftover like its logo: a brief build that has a logo of the business,
 * or a symbol drawn for one that gave none (`brand-logo-symbol.js`), shows that mark in the tab.
 *
 *   faviconMark  the square picture the icon is drawn from: the mark read out of the logo (`logo-mark.js readMark`), its
 *                lines of letters cut away when they lie apart from the picture (`logo-mark-text.js`), set on the logo's
 *                own tile colour when the logo was a tile (a social avatar), else on a transparent ground
 *   faviconSet   the files a site serves for it: `favicon.ico` (16, 32 and 48 px PNG entries), a 180 px apple touch icon
 *                (always opaque: iOS paints transparency black), and 192 and 512 px PNGs
 *
 * 🔒 THE OWNER'S DRAWING, NEVER REDRAWN. Only image processing: trimmed, cropped, padded, scaled. A mark that is a wide
 * wordmark with no picture apart from its letters makes no icon (letters shrunk to 16 px read as a smudge); the caller then
 * uses the drawn symbol, and with neither the template's icon stays and the build says so.
 */
import sharp from 'sharp'

import { readMark } from './logo-mark.js'
import { splitMarkText } from './logo-mark-text.js'

/** The icon's side at its largest. */
const EDGE = 512
/** Margin around the mark, as a share of the side, so it does not touch the tab's edge. */
const MARGIN = 0.08
/** A mark at most this far from square fills an icon; a wider one is a wordmark. */
const SQUARE_ENOUGH = 1.6
/** The sizes `favicon.ico` carries. */
export const ICO_SIZES = Object.freeze([16, 32, 48])

/**
 * @typedef {{r: number, g: number, b: number}} Rgb
 * @param {Uint8Array} bytes - the logo as the owner gave it, or the symbol drawn for the business
 * @returns {Promise<{png: Buffer, ground: Rgb | null, how: string} | null>} a 512 px square, or null when the mark makes
 *   no icon
 */
export async function faviconMark(bytes) {
  const m = await readMark(bytes).catch(() => null)
  if (!m) return null
  let picture = m.mark
  const split = await splitMarkText(m.mark).catch(() => ({ letters: false, pictorial: null }))
  let how = 'the whole mark'
  if (split.letters && split.pictorial) {
    picture = split.pictorial
    how = 'the picture of the mark, its words cut away'
  }
  const meta = await sharp(picture).metadata()
  const aspect = (meta.width ?? 1) / (meta.height ?? 1)
  if (aspect > SQUARE_ENOUGH || aspect < 1 / SQUARE_ENOUGH) return null
  const ground = m.tile ?? null
  const inner = Math.round(EDGE * (1 - 2 * MARGIN))
  const fitted = await sharp(picture)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const png = await sharp({
    create: {
      width: EDGE,
      height: EDGE,
      channels: 4,
      background: ground ? { ...ground, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: fitted, gravity: 'centre' }])
    .png()
    .toBuffer()
  return { png, ground, how: ground ? `${how}, on the logo's own tile colour` : how }
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
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
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
 * The files of the icon, from the 512 px square `faviconMark` made.
 * @param {{png: Buffer, ground: Rgb | null}} icon
 * @returns {Promise<{ico: Buffer, apple: Buffer, png192: Buffer, png512: Buffer}>}
 */
export async function faviconSet(icon) {
  const at = (/** @type {number} */ size) => sharp(icon.png).resize(size, size).png().toBuffer()
  const small = await Promise.all(ICO_SIZES.map(at))
  // An apple touch icon is shown on an opaque square: a transparent ground becomes white, never black.
  const apple = await sharp(icon.png)
    .resize(180, 180)
    .flatten({ background: icon.ground ?? { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer()
  return { ico: await icoOf(small), apple, png192: await at(192), png512: icon.png }
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
