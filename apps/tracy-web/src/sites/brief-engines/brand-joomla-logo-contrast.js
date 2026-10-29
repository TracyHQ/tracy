/**
 * A brief build's logo stays readable on the ground it is shown on (spec TracyHQ/tracy#193): a dark logo on a dark header or
 * footer, or a white one on a light header, is set on a plate of the colour that contrasts with the logo itself.
 *
 *   logoContrast       the share of the logo's opaque pixels that reach 3:1 (WCAG non-text contrast) against a ground
 *   logosByContrast    the logos the spots take: each variant checked against the ground of the spots it goes to (a light
 *                      spot for `light`, a dark spot for `dark`, both for `single`); one under the bar gets a plated copy
 *
 * 🔒 BY THE SPOT'S MEASURED SIDE, NOT BY TEMPLATE. Which spot is dark is the profile row's measured `darkSpots`
 * (`brand-joomla-places.js` `darkSpotsOf`); the writers already send the `dark` variant to a dark spot and `light` to a light
 * one. A single logo that fails one side becomes a pair, the plated copy on that side, so every writer keeps its own rule.
 * The grounds below stand for "a dark spot" and "a light spot" on any template: the darkest light ground and the lightest
 * dark ground the profile rows were measured at, so a logo that passes them passes the real spot too.
 */
import sharp from 'sharp'

/** The ground of a spot the profile marks dark (lighter than the dark headers and footers measured, rgb 18 to 31). */
export const DARK_GROUND = { r: 40, g: 40, b: 40 }
/** The ground of a light spot (darker than the white and off-white headers measured). */
export const LIGHT_GROUND = { r: 240, g: 240, b: 240 }
/** WCAG 2 non-text contrast: a logo's marks against what is behind them. */
export const MIN_CONTRAST = 3
/** Below this share of opaque pixels reaching `MIN_CONTRAST`, the logo is not readable on that ground. */
const READABLE_SHARE = 0.5
/** Pixels read for the measure, at most (a 4K logo is read every few pixels). */
const SAMPLE = 200_000
/** Plate colours: the light one behind a dark logo, the dark one behind a light logo. */
const LIGHT_PLATE = { r: 255, g: 255, b: 255 }
const DARK_PLATE = { r: 24, g: 24, b: 24 }

/** WCAG relative luminance of an sRGB colour. @param {{r: number, g: number, b: number}} c */
export function luminance({ r, g, b }) {
  const lin = (/** @type {number} */ v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio of two luminances. */
const ratio = (/** @type {number} */ a, /** @type {number} */ b) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * The luminances of a picture's opaque pixels, sampled.
 * @param {Uint8Array} bytes @returns {Promise<number[]>}
 */
async function inkOf(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = info.width * info.height
  const step = Math.max(1, Math.floor(pixels / SAMPLE))
  /** @type {number[]} */
  const ink = []
  for (let i = 0; i < pixels; i += step) {
    const o = i * 4
    if (data[o + 3] < 128) continue
    ink.push(luminance({ r: data[o], g: data[o + 1], b: data[o + 2] }))
  }
  return ink
}

/**
 * The share of a logo's opaque pixels that reach `MIN_CONTRAST` against a ground; 1 for a picture with no opaque pixel
 * (nothing to read, nothing to judge).
 * @param {Uint8Array} bytes @param {{r: number, g: number, b: number}} ground
 */
export async function logoContrast(bytes, ground) {
  const ink = await inkOf(bytes)
  if (ink.length === 0) return 1
  const behind = luminance(ground)
  return ink.filter((l) => ratio(l, behind) >= MIN_CONTRAST).length / ink.length
}

/**
 * The logo on a rounded plate of the colour that contrasts most with its own marks, on a canvas of the same size (the frame
 * the logo was padded to stays its shape): the drawing is scaled into the canvas less a margin, the plate around it.
 * @param {Uint8Array} bytes @returns {Promise<Buffer>}
 */
export async function platedLogo(bytes) {
  const ink = await inkOf(bytes)
  const mean = ink.length ? ink.reduce((a, b) => a + b, 0) / ink.length : 0
  const plate =
    ratio(mean, luminance(LIGHT_PLATE)) >= ratio(mean, luminance(DARK_PLATE)) ? LIGHT_PLATE : DARK_PLATE
  const meta = await sharp(bytes).metadata()
  const width = meta.width ?? 1
  const height = meta.height ?? 1
  // The drawing alone (its transparent margin trimmed), scaled to leave a margin of an eighth of the height all round.
  const drawn = await sharp(bytes)
    .ensureAlpha()
    .trim({ threshold: 1 })
    .toBuffer()
    .catch(() => Buffer.from(bytes))
  // Never enlarged: a plate makes a logo readable, not bigger (`logoForSlot` still judges the drawing's own height).
  const own = await sharp(drawn).metadata()
  const margin = Math.max(2, Math.round((own.height ?? height) / 8))
  const inner = await sharp(drawn)
    .resize({
      width: Math.max(1, width - 4 * margin),
      height: Math.max(1, height - 2 * margin),
      fit: 'inside',
      withoutEnlargement: true
    })
    .png()
    .toBuffer()
  const im = await sharp(inner).metadata()
  const plateW = Math.min(width, (im.width ?? 1) + 2 * margin)
  const plateH = Math.min(height, (im.height ?? 1) + 2 * margin)
  const radius = Math.round(Math.min(plateW, plateH) / 8)
  const rect = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plateW}" height="${plateH}"><rect width="${plateW}" height="${plateH}" rx="${radius}" fill="rgb(${plate.r},${plate.g},${plate.b})"/></svg>`
  )
  const out = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([
      { input: rect, gravity: 'centre' },
      { input: inner, gravity: 'centre' }
    ])
    .png()
    .toBuffer()
  PLATED.set(out, im.height ?? 0)
  return out
}

/** A plated logo's own drawing height, the plate left out; `logoForSlot` reads the logo's legibility by it. */
const PLATED = new WeakMap()

/** The height of the logo's drawing inside a plated copy, or null for a picture that was not plated here. */
export function platedDrawingHeight(/** @type {Uint8Array} */ bytes) {
  return PLATED.has(bytes) ? Number(PLATED.get(bytes)) : null
}

/**
 * The logos the spots take, each readable on the side it goes to. A variant under the bar on its side is replaced by its
 * plated copy; a single logo under the bar on one side only becomes a pair (the plain logo where it reads, the plated copy
 * where it does not), so the writers place each by their own dark-spot rule.
 * @param {{light?: Uint8Array, dark?: Uint8Array, single?: Uint8Array}} logos
 * @param {(where: string, reason: string) => void} [note] - told which logo was plated and why
 * @returns {Promise<{light?: Uint8Array, dark?: Uint8Array, single?: Uint8Array}>}
 */
export async function logosByContrast(logos, note = () => {}) {
  const reads = async (
    /** @type {Uint8Array} */ bytes,
    /** @type {{r: number, g: number, b: number}} */ ground
  ) => (await logoContrast(bytes, ground)) >= READABLE_SHARE
  const said = (/** @type {string} */ side) =>
    note(
      'logo',
      `the logo is set on a plate on ${side} backgrounds, where its own colours would not stand out`
    )
  if (logos.single) {
    const onLight = await reads(logos.single, LIGHT_GROUND)
    const onDark = await reads(logos.single, DARK_GROUND)
    if (onLight && onDark) return logos
    const plated = await platedLogo(logos.single)
    if (!onDark) said('dark')
    if (!onLight) said('light')
    return { light: onLight ? logos.single : plated, dark: onDark ? logos.single : plated }
  }
  /** @type {{light?: Uint8Array, dark?: Uint8Array}} */
  const out = { ...logos }
  if (logos.light && !(await reads(logos.light, LIGHT_GROUND))) {
    out.light = await platedLogo(logos.light)
    said('light')
  }
  if (logos.dark && !(await reads(logos.dark, DARK_GROUND))) {
    out.dark = await platedLogo(logos.dark)
    said('dark')
  }
  return out
}
