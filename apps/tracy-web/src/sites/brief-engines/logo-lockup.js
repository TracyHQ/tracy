/**
 * A horizontal logo LOCKUP composed by code (spec TracyHQ/tracy#189): the owner's mark on the left (or none, a wordmark),
 * the business name set as real type on the right, on a transparent picture twice the size of the template's logo frame.
 *
 *   composeLockup   one variant: the mark as given (never redrawn), the name in one colour, an optional short descriptor
 *                   under a one-line name; null when the name cannot be set legibly in the frame (or the font lacks a letter)
 *
 * 🔒 THE NAME IS TYPE, NEVER A MODEL'S DRAWING: glyph outlines from the shipped face (`lib/logo-type.js`), so it is sharp at
 * any size and identical on every machine.
 * 🔒 THE FRAME DECIDES THE SIZE: the picture is `2 x frame.height` tall (sharp on a dense screen) and at most
 * `2 x frame.width` wide, so the brand step's padding into the frame (`prepareBrand`) never shrinks it.
 */
import sharp from 'sharp'
import { canTypeset, typeset } from '../../lib/logo-type.js'
import { hexOf } from './logo-colours.js'

/** The picture is drawn at this many pixels per CSS pixel of the frame. */
export const LOCKUP_SCALE = 2
/** The least cap height, in CSS pixels on the page, the name may show at. */
const LEGIBLE_CAP_PX = 7
/** Space around the content and between mark and name, as shares of the picture's height. */
const PAD = 0.06
const GAP = 0.16
/** The name's largest size for one line and for two, as shares of the height; each shrinks in steps until it fits. */
const ONE_LINE = 0.46
const TWO_LINES = 0.34
const STEP = 0.96
/** The descriptor's size against the name's, and its letter spacing. */
const DESCRIPTOR = 0.42
const DESCRIPTOR_TRACKING = 0.08
const LINE_GAP = 0.12

/** @typedef {{r: number, g: number, b: number}} Rgb */

/**
 * The width a mark takes in a lockup for `frame`, in picture pixels: what `composeLockup` scales it to.
 * @param {Uint8Array} mark @param {{width: number, height: number}} frame
 */
export async function markSlotOf(mark, frame) {
  const h = Math.round(frame.height * LOCKUP_SCALE)
  const pad = Math.round(h * PAD)
  const meta = await sharp(Buffer.from(mark)).metadata()
  if (!meta.width || !meta.height) return 0
  const maxW = Math.round((frame.width * LOCKUP_SCALE - 2 * pad) / 2)
  return Math.min(maxW, Math.round((meta.width * (h - 2 * pad)) / meta.height))
}

/** The ways a name splits in two lines, at a space, most even first. */
function splits(/** @type {string} */ name) {
  const words = name.trim().split(/\s+/)
  const out = []
  for (let i = 1; i < words.length; i += 1) out.push([words.slice(0, i).join(' '), words.slice(i).join(' ')])
  return out.sort((a, b) => Math.abs(a[0].length - a[1].length) - Math.abs(b[0].length - b[1].length))
}

/** The largest lines of `lines` (each typeset at one size) that fit `width`, from `start` down to `floor` (shares of h). */
function fitLines(/** @type {string[]} */ lines, width, h, start, floor) {
  for (let share = start; share >= floor; share *= STEP) {
    const set = lines.map((line) => typeset(line, h * share))
    if (set.some((s) => s === null)) return null
    if (Math.max(...set.map((s) => /** @type {any} */ (s).width)) <= width) return { set, px: h * share }
  }
  return null
}

/**
 * @param {object} input
 * @param {Uint8Array | null} input.mark - the mark, trimmed (transparent or on its own tile); null for a wordmark
 * @param {string} input.name
 * @param {string | null} [input.descriptor]
 * @param {{width: number, height: number}} input.frame - the template's logo frame, CSS pixels
 * @param {Rgb} input.text - the name's colour on the ground this variant goes to
 * @param {number} [input.markSlot] - the width (picture pixels) kept for the mark, so a pair of variants whose marks differ
 *   in width (one cut free, one on its tile) sets the name the same way in both (`markSlotOf`)
 * @returns {Promise<Buffer | null>}
 */
export async function composeLockup({ mark, name, descriptor = null, frame, text, markSlot = 0 }) {
  const clean = String(name ?? '').trim()
  if (!clean || !canTypeset(clean)) return null
  const h = Math.round(frame.height * LOCKUP_SCALE)
  const maxW = Math.round(frame.width * LOCKUP_SCALE)
  const pad = Math.round(h * PAD)
  /** @type {{input: Buffer, left: number, top: number} | null} */
  let markLayer = null
  let x = pad
  if (mark) {
    const fitted = await sharp(Buffer.from(mark))
      .resize({ height: h - 2 * pad, width: Math.round((maxW - 2 * pad) / 2), fit: 'inside' })
      .png()
      .toBuffer({ resolveWithObject: true })
    const slot = Math.max(markSlot, fitted.info.width)
    markLayer = {
      input: fitted.data,
      left: pad + Math.round((slot - fitted.info.width) / 2),
      top: Math.round((h - fitted.info.height) / 2)
    }
    x += slot + Math.round(h * GAP)
  }
  const room = maxW - x - pad
  // The least font size, as a share of the height, whose capitals show `LEGIBLE_CAP_PX` high (cap height about 0.74 of it).
  const floor = (LEGIBLE_CAP_PX * LOCKUP_SCALE) / 0.74 / h
  let fit = fitLines([clean], room, h, mark ? ONE_LINE : ONE_LINE * 1.15, floor)
  if (!fit)
    for (const pair of splits(clean)) {
      fit = fitLines(pair, room, h, TWO_LINES, floor)
      if (fit) break
    }
  if (!fit) return null
  const lines = fit.set.map((s) => /** @type {NonNullable<typeof s>} */ (s))
  const sub =
    descriptor && lines.length === 1
      ? typeset(String(descriptor).trim(), fit.px * DESCRIPTOR, { tracking: DESCRIPTOR_TRACKING })
      : null
  const useSub = sub && sub.width <= room ? sub : null
  // Lines stacked cap to baseline: each line's box is its cap height, the descriptor's its own.
  const lineBox = lines[0].capHeight
  const gap = fit.px * LINE_GAP * 2
  const blockH = lines.length * lineBox + (lines.length - 1) * gap + (useSub ? gap + useSub.capHeight : 0)
  let baseline = (h - blockH) / 2 + lineBox
  const fill = hexOf(text)
  const paths = []
  for (const line of lines) {
    paths.push(
      `<path transform="translate(${x.toFixed(2)} ${(baseline - line.ascent).toFixed(2)})" d="${line.d}" fill="${fill}"/>`
    )
    baseline += gap + lineBox
  }
  if (useSub) {
    baseline += useSub.capHeight - lineBox
    paths.push(
      `<path transform="translate(${x.toFixed(2)} ${(baseline - useSub.ascent).toFixed(2)})" d="${useSub.d}" fill="${fill}" fill-opacity="0.85"/>`
    )
  }
  const textW = Math.max(...lines.map((l) => l.width), useSub?.width ?? 0)
  const width = Math.min(maxW, Math.ceil(x + textW + pad))
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">${paths.join('')}</svg>`
  )
  return sharp({ create: { width, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([...(markLayer ? [markLayer] : []), { input: svg, left: 0, top: 0 }])
    .png()
    .toBuffer()
}
