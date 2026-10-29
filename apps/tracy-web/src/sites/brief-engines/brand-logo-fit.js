/**
 * A brief build's logo made to FIT the template's logo frame (spec TracyHQ/tracy#189, COO rules of 29/10/2026). Run by the
 * brand seam (`brand.js` `setSiteBrand`) before the logo is padded into the frame, for every CMS writer.
 *
 *   wrong shape (square, tall) the owner's mark, cut free of its tile when it has one (`logo-mark.js`), on the left of the
 *                              business name set as type (`logo-lockup.js`): a light-ground and a dark-ground variant, the
 *                              colours read from the owner's logo
 *   no logo, a symbol drawn    the same lockup around a symbol the picture model drew (no letters: `brand-logo-symbol.js`),
 *                              recoloured from the TEMPLATE's own logo colours when it is flat
 *   no logo, nothing drawn     a wordmark: the name alone, in the template's logo colours
 *   wide and fitting           kept; a variant that does not read on a ground is recoloured when the logo is flat (else
 *                              the plate rule of `brand-joomla-logo-contrast.js` takes it); a wide logo on a tile loses
 *                              the tile
 *
 * 🔒 NEVER A MODEL'S LETTERS: the name is always type set here. 🔒 A LOGO TRACY MADE SAYS SO (`made`), and the seam tells
 * the owner it is temporary. 🔒 BY SHAPE AND FRAME, NEVER BY TEMPLATE: the frame is the profile row's measured `frame`
 * (`frameOfProfile`, a default logo shape where the row measured none).
 * Whatever cannot be made (no frame, a name the font cannot set, a name too long to read in the frame) leaves the logo as
 * given, so the existing rules (padding, plate, name as text) still hold.
 */
import { DARK_GROUND, LIGHT_GROUND, logoContrast } from './brand-joomla-logo-contrast.js'
import { logoColours, paletteOf } from './logo-colours.js'
import { composeLockup, markSlotOf } from './logo-lockup.js'
import { readMark, recoloured } from './logo-mark.js'

/** What the owner is told when Tracy made the logo. */
export const TEMPORARY_LOGO_NOTE =
  'Tracy made a temporary logo from your details; you can replace it at any time'
/** A drawing at least this share of the frame's aspect is wide enough to stand in the frame on its own. */
export const WIDE_SHARE = 0.5
/** A drawing reads on a ground when this share of its pixels reaches 3:1 there (as `logosByContrast` judges it). */
const READABLE_SHARE = 0.5

/** @typedef {{light?: Uint8Array, dark?: Uint8Array, single?: Uint8Array}} Logos */
/** @typedef {import('./logo-colours.js').Palette} Palette */

const GROUNDS = /** @type {const} */ ({ light: LIGHT_GROUND, dark: DARK_GROUND })

/** Whether a picture reads on a ground. */
const reads = async (
  /** @type {Uint8Array} */ bytes,
  /** @type {{r: number, g: number, b: number}} */ ground
) => (await logoContrast(bytes, ground)) >= READABLE_SHARE

/**
 * The height and shape a made logo takes where the profile row measured no frame: the header height most rows cap a logo at,
 * and the median shape of the measured frames (195 x 56, 161 x 49, 156 x 48, 132 x 40 ...).
 */
export const DEFAULT_LOGO_HEIGHT = 56
export const DEFAULT_LOGO_ASPECT = 3.4

/**
 * The frame a made logo is composed for: the profile row's measured `frame`; else its `logoHeight` (or the default height)
 * at the default shape, so a template whose row has no frame still gets a logo of a logo's shape. Null without a profile.
 */
export function frameOfProfile(/** @type {any} */ profile) {
  if (!profile) return null
  const f = profile.frame
  if (f && Number(f.width) > 0 && Number(f.height) > 0)
    return { width: Number(f.width), height: Number(f.height) }
  const height =
    Number.isInteger(profile.logoHeight) && profile.logoHeight > 0 ? profile.logoHeight : DEFAULT_LOGO_HEIGHT
  return { width: Math.round(height * DEFAULT_LOGO_ASPECT), height }
}

/**
 * The mark each ground takes: the cut mark where it reads; else, flat, recoloured; else the drawing on its own tile.
 * @param {NonNullable<Awaited<ReturnType<typeof readMark>>>} m
 * @param {ReturnType<typeof logoColours>} colours
 */
async function marksByGround(m, colours) {
  /** @type {Record<'light' | 'dark', Uint8Array>} */
  const out = /** @type {any} */ ({})
  for (const side of /** @type {const} */ (['light', 'dark'])) {
    if (await reads(m.mark, GROUNDS[side])) out[side] = m.mark
    else if (m.flat) out[side] = await recoloured(m.mark, colours[side].mark)
    else out[side] = m.tiled ?? m.mark
  }
  return out
}

/** A light and a dark lockup, or null when either cannot be set. */
async function lockups({ marks, name, descriptor, frame, colours }) {
  const markSlot = marks
    ? Math.max(await markSlotOf(marks.light, frame), await markSlotOf(marks.dark, frame))
    : 0
  const light = await composeLockup({
    mark: marks?.light ?? null,
    name,
    descriptor,
    frame,
    text: colours.light.text,
    markSlot
  })
  const dark = await composeLockup({
    mark: marks?.dark ?? null,
    name,
    descriptor,
    frame,
    text: colours.dark.text,
    markSlot
  })
  return light && dark ? { light, dark } : null
}

/**
 * The palette of the owner's mark: its main colour first, then its tile's (the colour the owner set the mark on is a brand
 * colour, chosen before the shades inside the drawing), then the rest.
 */
function markPalette(/** @type {NonNullable<Awaited<ReturnType<typeof readMark>>>} */ m) {
  const palette = paletteOf(m.swatches)
  if (!m.tile) return palette
  const [main, ...rest] = palette.colours
  return { ...palette, colours: [...(main ? [main] : []), m.tile, ...rest] }
}

/**
 * The palette of the template's own logos (its demo logo files), each read as a mark so a logo exported on a white box
 * gives its drawing's colours, not the box's. Null when none can be read.
 * @param {Uint8Array[]} logos @returns {Promise<Palette | null>}
 */
export async function paletteOfLogos(logos) {
  const swatches = []
  for (const bytes of logos) {
    const m = await readMark(bytes).catch(() => null)
    if (m) swatches.push(...m.swatches.map((s) => ({ ...s, share: s.share / logos.length })))
  }
  const palette = paletteOf(swatches)
  return palette.colours.length ? palette : null
}

/**
 * The template's logo pictures a page shows, for its palette when the content map names none: every `<img>` whose class,
 * alt or file name says logo, in page order, at most four, raster files only.
 * @param {string} html @returns {string[]} their `src` as written
 */
export function logoFilesOfPage(html) {
  const out = []
  for (const tag of String(html ?? '').match(/<img\b[^>]*>/gi) ?? []) {
    const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (!src || !/\.(?:png|jpe?g|webp|gif)(?:[?#]|$)/i.test(src)) continue
    if (!/logo/i.test(tag)) continue
    if (!out.includes(src)) out.push(src)
    if (out.length === 4) break
  }
  return out
}

/**
 * @param {object} input
 * @param {Logos | undefined} input.logo - the logo as given (a brief's is one picture)
 * @param {string} input.name
 * @param {string | null} [input.descriptor]
 * @param {{width: number, height: number} | null} input.frame
 * @param {Uint8Array | null} [input.symbol] - no logo given: the symbol drawn for the business, on a plain ground
 * @param {Palette | null} [input.templatePalette] - the template's own logo colours, for a logo made without the owner's
 * @returns {Promise<{logo: Logos | undefined, made: 'lockup' | 'symbol' | 'wordmark' | null, how: string}>}
 */
export async function fitBriefLogo({
  logo,
  name,
  descriptor = null,
  frame,
  symbol = null,
  templatePalette = null
}) {
  const keep = (/** @type {string} */ how) => ({ logo, made: null, how })
  if (!frame) return keep('no measured logo frame')
  const given = logo ?? {}
  const variants = Object.values(given).filter((v) => v instanceof Uint8Array && v.length > 0)
  if (variants.length > 1) return keep('the owner gave both variants')
  const fallbackPalette = templatePalette ?? { accent: null, colours: [] }
  if (variants.length === 0) {
    const m = symbol ? await readMark(symbol).catch(() => null) : null
    if (m) {
      const colours = logoColours(fallbackPalette.colours.length ? fallbackPalette : paletteOf(m.swatches))
      /** @type {Record<'light' | 'dark', Uint8Array>} */
      const marks = m.flat
        ? {
            light: await recoloured(m.mark, colours.light.mark),
            dark: await recoloured(m.mark, colours.dark.mark)
          }
        : await marksByGround(m, colours)
      const made = await lockups({ marks, name, descriptor, frame, colours })
      if (made) return { logo: made, made: 'symbol', how: 'a drawn symbol beside the name' }
    }
    const words = await lockups({
      marks: null,
      name,
      descriptor,
      frame,
      colours: logoColours(fallbackPalette)
    })
    return words
      ? { logo: words, made: 'wordmark', how: 'the name as a wordmark' }
      : keep('the name cannot be set')
  }
  const source = variants[0]
  const m = await readMark(source).catch(() => null)
  if (!m) return keep('the logo could not be read')
  const colours = logoColours(markPalette(m))
  if (m.aspect >= (frame.width / frame.height) * WIDE_SHARE) {
    if (!m.tile && (await reads(source, LIGHT_GROUND)) && (await reads(source, DARK_GROUND)))
      return keep('the logo already fits')
    const marks = await marksByGround(m, colours)
    if (marks.light === marks.dark)
      return { logo: { single: marks.light }, made: null, how: 'tile taken off' }
    return { logo: marks, made: null, how: 'a variant made for the other ground' }
  }
  const made = await lockups({ marks: await marksByGround(m, colours), name, descriptor, frame, colours })
  return made
    ? { logo: made, made: 'lockup', how: 'the mark beside the name' }
    : keep('the name cannot be set in the frame')
}
