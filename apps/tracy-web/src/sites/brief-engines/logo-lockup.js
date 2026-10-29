/**
 * A horizontal logo LOCKUP composed by code (spec TracyHQ/tracy#189): the owner's mark on the left (or a drawn symbol in a
 * badge, or none, a wordmark), then a two-tier type block, on a transparent picture twice the size of the template's logo
 * frame. Styled as one approved reference (COO 29/10/2026): the business name bold, condensed, in capitals, tight, in the
 * ground's strong text colour; under it a short descriptor line, small, in capitals, widely spaced, in the accent colour.
 *
 *   composeLockup   one variant: the mark as given (never redrawn), the name, the descriptor when it fits; null when the name
 *                   cannot be set legibly in the frame (or the face lacks a letter)
 *   badged          a drawn symbol set inside a solid circle of one colour, in one ink
 *
 * 🔒 THE NAME IS TYPE, NEVER A MODEL'S DRAWING: glyph outlines from the shipped faces (`lib/logo-type.js`), so it is sharp at
 * any size and identical on every machine.
 * 🔒 THE FRAME DECIDES THE SIZE: the picture is `2 x frame.height` tall (sharp on a dense screen) and at most
 * `2 x frame.width` wide, so the brand step's padding into the frame (`prepareBrand`) never shrinks it.
 */
import sharp from 'sharp'
import { canTypeset, typeset } from '../../lib/logo-type.js'
import { hexOf } from './logo-colours.js'
import { recoloured } from './logo-mark.js'

/** The picture is drawn at this many pixels per CSS pixel of the frame. */
export const LOCKUP_SCALE = 2
/** The least cap height, in CSS pixels on the page, the name and the descriptor may show at. */
const LEGIBLE_CAP_PX = 7
const LEGIBLE_LINE_CAP_PX = 4.5
/** Space around the content, as a share of the picture's height. */
const PAD = 0.06
/** Space between mark and name, as a share of the name's cap height (measured on the proof sheets: 0.35 crowds a round
 * mark, 0.5 lets a tall crest drift from its name). */
export const GAP_OF_CAP = 0.45
/** The name's largest size for one line and for two (a wordmark's one line larger), as shares of the height; each
 * shrinks in steps until the block fits. */
const ONE_LINE = 0.6
const WORDMARK_LINE = 0.7
const TWO_LINES = 0.4
const STEP = 0.96
/** Two lines are taken over one only when they set the name this much larger. */
const TWO_LINES_GAIN = 1.25
/** The name's letter spacing (tight), the descriptor's size against the name's and its spacing (wide), and the space
 * between the tiers, as a share of the name's cap height. */
const NAME_TRACKING = 0
const DESCRIPTOR = 0.3
const DESCRIPTOR_TRACKING = 0.22
const TIER_GAP = 0.3
const LINE_GAP = 0.14
/** A badge's symbol fills this share of its circle. */
const BADGE_FILL = 0.6
const BADGE_PX = 512

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

/**
 * A drawn symbol (cut free, transparent) inside a solid circle of `fill`, the symbol in `ink`: a square transparent PNG.
 * @param {Uint8Array} symbol @param {{fill: Rgb, ink: Rgb}} colours
 */
export async function badged(symbol, { fill, ink }) {
  const inner = Math.round(BADGE_PX * BADGE_FILL)
  const glyph = await sharp(await recoloured(symbol, ink))
    .resize({ width: inner, height: inner, fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true })
  const r = BADGE_PX / 2
  const circle = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_PX}" height="${BADGE_PX}"><circle cx="${r}" cy="${r}" r="${r}" fill="${hexOf(fill)}"/></svg>`
  )
  return sharp(circle)
    .composite([
      {
        input: glyph.data,
        left: Math.round((BADGE_PX - glyph.info.width) / 2),
        top: Math.round((BADGE_PX - glyph.info.height) / 2)
      }
    ])
    .png()
    .toBuffer()
}

/** The ways a name splits in two lines, at a space, most even first. */
function splits(/** @type {string} */ name) {
  const words = name.trim().split(/\s+/)
  const out = []
  for (let i = 1; i < words.length; i += 1) out.push([words.slice(0, i).join(' '), words.slice(i).join(' ')])
  return out.sort((a, b) => Math.abs(a[0].length - a[1].length) - Math.abs(b[0].length - b[1].length))
}

/** @typedef {NonNullable<ReturnType<typeof typeset>>} Set */

/**
 * The largest type block of `lines` (and `descriptor` under them, when given) that fits `room` wide and `tall` high, from
 * `start` down to the least legible size (shares of h).
 * @param {string[]} lines @param {string | null} descriptor
 * @param {(set: Set[]) => number} roomOf @param {number} h @param {number} tall @param {number} start
 * @returns {{set: Set[], sub: Set | null, px: number} | null}
 */
function fitBlock(lines, descriptor, roomOf, h, tall, start) {
  for (let px = h * start; ; px *= STEP) {
    const set = lines.map((line) => typeset(line, px, { tracking: NAME_TRACKING }))
    if (set.some((one) => one === null)) return null
    const name = /** @type {Set[]} */ (set)
    const cap = name[0].capHeight
    if (cap < LEGIBLE_CAP_PX * LOCKUP_SCALE) return null
    const sub = descriptor
      ? typeset(descriptor, px * DESCRIPTOR, { tracking: DESCRIPTOR_TRACKING, face: 'line' })
      : null
    if (descriptor && (!sub || sub.capHeight < LEGIBLE_LINE_CAP_PX * LOCKUP_SCALE)) return null
    const wide = Math.max(...name.map((s) => s.width), sub?.width ?? 0)
    if (wide <= roomOf(name) && blockHeight(name, sub) <= tall) return { set: name, sub, px }
  }
}

/** The height of a type block, cap to baseline. @param {Set[]} lines @param {Set | null} sub */
function blockHeight(lines, sub) {
  const cap = lines[0].capHeight
  return lines.length * cap + (lines.length - 1) * cap * LINE_GAP + (sub ? cap * TIER_GAP + sub.capHeight : 0)
}

/**
 * @param {object} input
 * @param {Uint8Array | null} input.mark - the mark, cut free (or a badge); null for a wordmark
 * @param {string} input.name
 * @param {string | null} [input.descriptor]
 * @param {{width: number, height: number}} input.frame - the template's logo frame, CSS pixels
 * @param {Rgb} input.text - the name's colour on the ground this variant goes to
 * @param {Rgb} [input.accent] - the descriptor's colour there (the name's when none)
 * @param {number} [input.markSlot] - the width (picture pixels) kept for the mark, so a pair of variants whose marks differ
 *   in width sets the name the same way in both (`markSlotOf`)
 * @returns {Promise<Buffer | null>}
 */
export async function composeLockup({ mark, name, descriptor = null, frame, text, accent, markSlot = 0 }) {
  const clean = String(name ?? '')
    .trim()
    .toLocaleUpperCase()
  if (!clean || !canTypeset(clean)) return null
  const line = descriptor ? String(descriptor).trim().toLocaleUpperCase() : ''
  const h = Math.round(frame.height * LOCKUP_SCALE)
  const maxW = Math.round(frame.width * LOCKUP_SCALE)
  const pad = Math.round(h * PAD)
  /** @type {{input: Buffer, left: number, top: number} | null} */
  let markLayer = null
  let x = pad
  // The type block is centred on the mark's own middle (the canvas middle for a wordmark).
  let middle = h / 2
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
    middle = markLayer.top + fitted.info.height / 2
    x += slot
  }
  const gapOf = (/** @type {Set[]} */ set) => (mark ? Math.round(set[0].capHeight * GAP_OF_CAP) : 0)
  const roomOf = (/** @type {Set[]} */ set) => maxW - x - gapOf(set) - pad
  const tall = h - 2 * pad
  /** The best block for a descriptor (or none): one line, or the most even split in two when clearly larger. */
  const best = (/** @type {string | null} */ sub) => {
    let fit = fitBlock([clean], sub, roomOf, h, tall, mark ? ONE_LINE : WORDMARK_LINE)
    for (const pair of splits(clean)) {
      const two = fitBlock(pair, sub, roomOf, h, tall, TWO_LINES)
      if (two && (!fit || two.px > fit.px * TWO_LINES_GAIN)) fit = two
      if (two) break
    }
    return fit
  }
  // The descriptor goes when the block cannot hold it legibly; the name never does.
  const fit = (line && canTypeset(line, 'line') ? best(line) : null) ?? best(null)
  if (!fit) return null
  const lines = fit.set
  x += gapOf(lines)
  const cap = lines[0].capHeight
  const blockH = blockHeight(lines, fit.sub)
  let top = Math.min(Math.max(middle - blockH / 2, pad), h - pad - blockH)
  const paths = []
  const draw = (/** @type {Set} */ s, /** @type {number} */ baseline, /** @type {Rgb} */ colour) =>
    paths.push(
      `<path transform="translate(${x.toFixed(2)} ${(baseline - s.ascent).toFixed(2)})" d="${s.d}" fill="${hexOf(colour)}"/>`
    )
  for (const one of lines) {
    draw(one, top + cap, text)
    top += cap * (1 + LINE_GAP)
  }
  if (fit.sub) draw(fit.sub, top - cap * LINE_GAP + cap * TIER_GAP + fit.sub.capHeight, accent ?? text)
  const textW = Math.max(...lines.map((l) => l.width), fit.sub?.width ?? 0)
  const width = Math.min(maxW, Math.ceil(x + textW + pad))
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">${paths.join('')}</svg>`
  )
  return sharp({ create: { width, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([...(markLayer ? [markLayer] : []), { input: svg, left: 0, top: 0 }])
    .png()
    .toBuffer()
}
