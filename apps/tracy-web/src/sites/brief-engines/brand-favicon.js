/**
 * The browser-tab icon of a brief build, made from the business's own mark (spec TracyHQ/tracy#189, COO name rule 3 of
 * 29/10/2026). The template's favicon is a demo leftover like its logo: a brief build that has a logo of the business,
 * or a symbol drawn for one that gave none (`brand-logo-symbol.js`), shows that mark in the tab.
 *
 *   faviconMark  the cut-out mark on transparency, trimmed and centred with a small margin: the SAME cut the logo work makes
 *                (`brand-logo-fit.js markVariants`: tile cut away, words left out when they stand apart from the picture).
 *                It must read on both tab bars (light `TAB_LIGHT`, dark `TAB_DARK`): the mark as cut when it does, else the
 *                logo work's own variant that reads on both, else the one that reads on the light bar
 *   faviconSet   the files: `favicon.ico` (16, 32 and 48 px PNG entries) and 192 and 512 px PNGs, all transparent; a
 *                180 px apple touch icon on the logo's own ground colour
 *
 * 🔒 THE ICON IS A PNG OF THE MARK ONLY, ITS BACKGROUND AND TILE CUT AWAY (COO 29/10/2026, the rule of the logo icon). A
 * mark that does not read on a tab bar takes the logo's recoloured variant, never a tile behind it. Only the apple touch
 * icon has a ground, because iOS paints transparency black (a platform rule).
 * 🔒 THE OWNER'S DRAWING, NEVER REDRAWN: only cut, recoloured as the logo is, padded and scaled. A wide wordmark makes no
 * icon (letters shrunk to 16 px read as a smudge); the caller then uses the drawn symbol, and with neither the template's
 * icon stays and the build says so.
 */
import sharp from 'sharp'

import { logoContrast } from './brand-joomla-logo-contrast.js'
import { markVariants } from './brand-logo-fit.js'

/** The icon's side at its largest. */
const EDGE = 512
/** Margin around the mark, as a share of the side, so it does not touch the tab's edge. */
const MARGIN = 0.06
/** A mark at most this far from square fills an icon; a wider one is a wordmark. */
const SQUARE_ENOUGH = 1.6
/** The tab bars an icon must read on: a browser's light and dark tab strip. */
export const TAB_LIGHT = Object.freeze({ r: 241, g: 243, b: 244 })
export const TAB_DARK = Object.freeze({ r: 32, g: 33, b: 36 })
/** A mark reads on a bar when this share of its pixels reaches 3:1 there (the logo work's own measure). */
const READABLE_SHARE = 0.5
/** The sizes `favicon.ico` carries. */
export const ICO_SIZES = Object.freeze([16, 32, 48])
const WHITE = Object.freeze({ r: 255, g: 255, b: 255 })

/** @typedef {{r: number, g: number, b: number}} Rgb */
/** @typedef {'mark' | 'light' | 'dark'} Variant */

/** The cut-out picture on a transparent square of `edge`, trimmed and centred with the margin. */
async function squared(/** @type {Uint8Array} */ bytes, edge = EDGE) {
  const trimmed = await sharp(Buffer.from(bytes))
    .ensureAlpha()
    .trim({ threshold: 1 })
    .png()
    .toBuffer()
    .catch(() => Buffer.from(bytes))
  const inner = Math.round(edge * (1 - 2 * MARGIN))
  const fitted = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp({
    create: { width: edge, height: edge, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: fitted, gravity: 'centre' }])
    .png()
    .toBuffer()
}

/**
 * @param {Uint8Array} bytes - the logo as the owner gave it, or the symbol drawn for the business
 * @returns {Promise<{png: Buffer, variant: Variant, reads: {light: boolean, dark: boolean}, ground: Rgb,
 *   appleMark: Uint8Array, how: string} | null>} a transparent 512 px square, or null when the mark makes no icon
 */
export async function faviconMark(bytes) {
  const v = await markVariants(bytes).catch(() => null)
  if (!v) return null
  const meta = await sharp(Buffer.from(v.mark)).metadata()
  const aspect = (meta.width ?? 1) / (meta.height ?? 1)
  if (aspect > SQUARE_ENOUGH || aspect < 1 / SQUARE_ENOUGH) return null
  /** @type {Array<[Variant, Uint8Array]>} */
  const candidates = [
    ['mark', v.mark],
    ['light', v.light],
    ['dark', v.dark]
  ]
  const measured = []
  for (const [variant, picture] of candidates) {
    const light = (await logoContrast(picture, TAB_LIGHT)) >= READABLE_SHARE
    const dark = (await logoContrast(picture, TAB_DARK)) >= READABLE_SHARE
    measured.push({ variant, picture, reads: { light, dark } })
  }
  // ICO cannot switch with the tab's theme: the variant that reads on both bars, else the one that reads on the light one.
  const both = measured.find((c) => c.reads.light && c.reads.dark)
  const chosen = both ?? measured.find((c) => c.reads.light) ?? measured[0]
  const ground = v.tile ?? WHITE
  const words = v.words ? ', its words left out' : ''
  const how = both
    ? `the ${chosen.variant === 'mark' ? 'mark as cut' : `${chosen.variant}-ground variant`}${words}, read on both tab bars`
    : `the ${chosen.variant === 'mark' ? 'mark as cut' : `${chosen.variant}-ground variant`}${words}, read on the light tab bar only`
  return {
    png: await squared(chosen.picture),
    variant: chosen.variant,
    reads: chosen.reads,
    ground,
    // The mark on its own tile reads there by definition; on white, the light-ground variant does.
    appleMark: v.tile ? v.mark : v.light,
    how
  }
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
 * @param {{png: Buffer, ground: Rgb, appleMark: Uint8Array}} icon
 * @returns {Promise<{ico: Buffer, apple: Buffer, png192: Buffer, png512: Buffer}>}
 */
export async function faviconSet(icon) {
  const at = (/** @type {number} */ size) => sharp(icon.png).resize(size, size).png().toBuffer()
  const small = await Promise.all(ICO_SIZES.map(at))
  // 🔒 PLATFORM RULE: iOS paints a transparent apple touch icon black, so this one file alone keeps an opaque ground, the
  // logo's own ground colour (its tile, else white), with the mark centred on it.
  const apple = await sharp(await squared(icon.appleMark, 180))
    .flatten({ background: icon.ground })
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
