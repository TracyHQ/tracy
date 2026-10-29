/**
 * The PUNCHED icon of a mark (spec TracyHQ/tracy#189, COO 29/10/2026): cut only outside the mark's outer outline, everything
 * inside it kept filled. The inside of the silhouette is the logo's own ground colour (its tile), with the drawing on it in
 * a few flat colours; outside the silhouette is fully transparent, with a crisp anti-aliased edge and no fringe.
 *
 *   silhouetteOf   the mark's outer outline at 4x the master size: its ink, holes filled (everything a flood from the border
 *                  cannot reach), crumbs left out; brought down by box averaging so the edge is at most one or two pixels wide
 *   flatLabels     every pixel of the master as one colour of a small palette (the ground and the mark's 1 to 3 main colours),
 *                  read over the ground, so soft edges and AI texture fall into flat colours
 *   cleaned        an opening of each colour of the drawing whose size grows as the icon shrinks, then crumbs merged into
 *                  their surroundings: details thinner than about one pixel of the target size (a string mesh) leave cleanly
 *   rendered       the labels as RGBA under the silhouette's alpha; a pixel at the edge takes its own label's colour, never grey
 *
 * Pure image processing (no tracer is a dependency here, so no vector step): denoise, quantise, then each size is drawn
 * down from the 512 master. No template, trade or business is named.
 */
import sharp from 'sharp'

import { luminance } from './brand-joomla-logo-contrast.js'
import { swatchesOf } from './logo-colours.js'

/** The master's side, and the oversampling of its outline. */
export const MASTER = 512
const OVER = 4
/** Ink is a pixel at least this opaque. */
const INK = 128
/** A part of the outline smaller than this share of the largest part is a crumb. */
const CRUMB = 0.01
/** A colour this close to the line between the tile and an ink is a blend of the two. */
const BLEND_NEAR = 36

/** @typedef {{r: number, g: number, b: number}} Rgb */

const dist = (/** @type {Rgb} */ a, /** @type {Rgb} */ b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)
const ratio = (/** @type {Rgb} */ a, /** @type {Rgb} */ b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The 4-connected regions of `on` cells, as arrays of indexes. */
function regionsOf(/** @type {Uint8Array} */ on, /** @type {number} */ w, /** @type {number} */ h) {
  const seen = new Uint8Array(w * h)
  const out = []
  const stack = new Int32Array(w * h)
  for (let i = 0; i < w * h; i += 1) {
    if (!on[i] || seen[i]) continue
    let top = 0
    stack[top++] = i
    seen[i] = 1
    const cells = []
    while (top) {
      const c = stack[--top]
      cells.push(c)
      const x = c % w
      for (const n of [c - w, c + w, x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1])
        if (n >= 0 && n < w * h && on[n] && !seen[n]) {
          seen[n] = 1
          stack[top++] = n
        }
    }
    out.push(cells)
  }
  return out
}

/** The mark centred on a transparent square of `edge` px, `inner` px across. */
async function placed(
  /** @type {Uint8Array} */ mark,
  /** @type {number} */ edge,
  /** @type {number} */ inner
) {
  const fitted = await sharp(Buffer.from(mark))
    .ensureAlpha()
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp({
    create: { width: edge, height: edge, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: fitted, gravity: 'centre' }])
    .raw()
    .toBuffer()
}

/**
 * The silhouette's alpha at the master size: holes filled, crumbs out, box-averaged from 4x.
 * @param {Uint8Array} mark @param {number} margin - share of the side left clear on each side
 * @returns {Promise<Uint8Array>} MASTER x MASTER alpha
 */
export async function silhouetteOf(mark, margin) {
  const big = MASTER * OVER
  const raw = await placed(mark, big, Math.round(big * (1 - 2 * margin)))
  const ink = new Uint8Array(big * big)
  for (let i = 0; i < big * big; i += 1) ink[i] = raw[i * 4 + 3] >= INK ? 1 : 0
  // Outside: every non-ink cell a flood from the border reaches. Everything else is the silhouette.
  const free = new Uint8Array(big * big)
  for (let i = 0; i < big * big; i += 1) free[i] = ink[i] ? 0 : 1
  const outside = new Uint8Array(big * big)
  for (const cells of regionsOf(free, big, big)) {
    const touches = cells.some((c) => c < big || c >= big * (big - 1) || c % big === 0 || c % big === big - 1)
    if (touches) for (const c of cells) outside[c] = 1
  }
  const sil = new Uint8Array(big * big)
  for (let i = 0; i < big * big; i += 1) sil[i] = outside[i] ? 0 : 1
  const parts = regionsOf(sil, big, big)
  const largest = Math.max(0, ...parts.map((p) => p.length))
  for (const p of parts) if (p.length < largest * CRUMB) for (const c of p) sil[c] = 0
  const alpha = new Uint8Array(MASTER * MASTER)
  for (let y = 0; y < MASTER; y += 1)
    for (let x = 0; x < MASTER; x += 1) {
      let n = 0
      for (let dy = 0; dy < OVER; dy += 1)
        for (let dx = 0; dx < OVER; dx += 1) n += sil[(y * OVER + dy) * big + x * OVER + dx]
      alpha[y * MASTER + x] = Math.round((n / (OVER * OVER)) * 255)
    }
  return alpha
}

/**
 * The palette of the punched icon: the ground first, then the mark's main colours (1 to 3, near twins merged).
 * The ground is the logo's own tile colour; a mark with none takes, of its own colours, the one with the best contrast to
 * its main colour, else white or near black, whichever stands out more.
 * @param {Uint8Array} mark @param {Rgb | null} tile
 * @returns {Promise<Rgb[]>}
 */
export async function paletteFor(mark, tile) {
  const swatches = (await swatchesOf(mark)).filter((s) => s.share >= 0.02)
  // A soft edge of the drawing over its tile is a blend of the two, not a colour of the mark: left out.
  const blendOf = (/** @type {Rgb} */ s, /** @type {Rgb} */ k, /** @type {Rgb | null} */ g) => {
    if (!g) return false
    const d = { r: k.r - g.r, g: k.g - g.g, b: k.b - g.b }
    const len = d.r * d.r + d.g * d.g + d.b * d.b
    if (!len) return false
    const t = ((s.r - g.r) * d.r + (s.g - g.g) * d.g + (s.b - g.b) * d.b) / len
    if (t <= 0 || t >= 1) return false
    return dist(s, { r: g.r + t * d.r, g: g.g + t * d.g, b: g.b + t * d.b }) < BLEND_NEAR
  }
  const inks = []
  for (const s of swatches)
    if (inks.length < 3 && inks.every((k) => dist(k, s) > 48 && !blendOf(s, k, tile))) inks.push(s)
  if (!inks.length) inks.push({ r: 0, g: 0, b: 0 })
  const main = inks[0]
  let ground = tile
  if (!ground) {
    const own = inks.slice(1).sort((a, b) => ratio(b, main) - ratio(a, main))[0]
    const plain = [
      { r: 255, g: 255, b: 255 },
      { r: 24, g: 24, b: 24 }
    ].sort((a, b) => ratio(b, main) - ratio(a, main))[0]
    ground = own && ratio(own, main) >= 3 ? own : plain
  }
  const rgb = ({ r, g, b }) => ({ r, g, b })
  return [rgb(ground), ...inks.filter((k) => dist(k, ground) > 48).map(rgb)]
}

/**
 * Each master pixel as its nearest palette colour, the mark read over the ground (index 0).
 * @param {Uint8Array} mark @param {Rgb[]} palette @param {number} margin
 * @returns {Promise<Uint8Array>}
 */
export async function flatLabels(mark, palette, margin) {
  const raw = await placed(mark, MASTER, Math.round(MASTER * (1 - 2 * margin)))
  const [g] = palette
  const labels = new Uint8Array(MASTER * MASTER)
  for (let i = 0; i < MASTER * MASTER; i += 1) {
    const a = raw[i * 4 + 3] / 255
    const px = {
      r: raw[i * 4] * a + g.r * (1 - a),
      g: raw[i * 4 + 1] * a + g.g * (1 - a),
      b: raw[i * 4 + 2] * a + g.b * (1 - a)
    }
    let best = 0
    for (let k = 1; k < palette.length; k += 1) if (dist(px, palette[k]) < dist(px, palette[best])) best = k
    labels[i] = best
  }
  return labels
}

/** A 1-D running min or max of `radius` over rows (`step` 1) or columns (`step` MASTER) of a 0/1 mask. */
function sweep(
  /** @type {Uint8Array} */ src,
  /** @type {number} */ radius,
  /** @type {boolean} */ rows,
  /** @type {boolean} */ max
) {
  const out = new Uint8Array(src.length)
  for (let line = 0; line < MASTER; line += 1)
    for (let i = 0; i < MASTER; i += 1) {
      let v = max ? 0 : 1
      for (let d = -radius; d <= radius; d += 1) {
        const j = Math.min(MASTER - 1, Math.max(0, i + d))
        const cell = src[rows ? line * MASTER + j : j * MASTER + line]
        if (max ? cell : !cell) {
          v = max ? 1 : 0
          break
        }
      }
      out[rows ? line * MASTER + i : i * MASTER + line] = v
    }
  return out
}

/** A mask opened by a square of side 2r+1: every part thinner than that leaves, the rest keeps its shape. */
function opened(/** @type {Uint8Array} */ mask, /** @type {number} */ r) {
  if (r <= 0) return mask
  const eroded = sweep(sweep(mask, r, true, false), r, false, false)
  return sweep(sweep(eroded, r, true, true), r, false, true)
}

/**
 * The labels with every part of the drawing thinner than `2 * radius + 1` px taken back to the ground (an opening, so what
 * stays keeps its shape), then crumbs under `minArea` of any colour merged into what surrounds them.
 * @param {Uint8Array} labels @param {number} count - palette size @param {number} radius @param {number} minArea
 */
export function cleaned(labels, count, radius, minArea) {
  const cur = Uint8Array.from(labels)
  for (let k = 1; k < count; k += 1) {
    const mask = new Uint8Array(cur.length)
    for (let i = 0; i < cur.length; i += 1) mask[i] = cur[i] === k ? 1 : 0
    const kept = opened(mask, radius)
    for (let i = 0; i < cur.length; i += 1) if (mask[i] && !kept[i]) cur[i] = 0
  }
  for (let k = 0; k < count; k += 1) {
    const on = new Uint8Array(cur.length)
    for (let i = 0; i < cur.length; i += 1) on[i] = cur[i] === k ? 1 : 0
    for (const cells of regionsOf(on, MASTER, MASTER)) {
      if (cells.length >= minArea) continue
      const around = new Int32Array(count)
      for (const c of cells) {
        const x = c % MASTER
        for (const n of [c - MASTER, c + MASTER, x > 0 ? c - 1 : -1, x < MASTER - 1 ? c + 1 : -1])
          if (n >= 0 && n < cur.length && cur[n] !== k) around[cur[n]] += 1
      }
      let best = -1
      for (let j = 0; j < count; j += 1) if (around[j] > 0 && (best < 0 || around[j] > around[best])) best = j
      if (best >= 0) for (const c of cells) cur[c] = best
    }
  }
  return cur
}

/** A share of the silhouette's edge band this large in one colour of the drawing makes that colour its outline. */
const OUTLINE_SHARE = 0.6

/**
 * The colour of the drawing that outlines the mark (a crest's border, a badge's ring), or null: the colour most of the
 * band just inside the silhouette's edge has, when it is a colour of the drawing (not the ground).
 * @param {Uint8Array} labels @param {Uint8Array} alpha @returns {number | null}
 */
export function outlineOf(labels, alpha) {
  const inside = new Uint8Array(alpha.length)
  for (let i = 0; i < alpha.length; i += 1) inside[i] = alpha[i] >= 128 ? 1 : 0
  const core = sweep(sweep(inside, 3, true, false), 3, false, false)
  const tally = new Map()
  let band = 0
  for (let i = 0; i < alpha.length; i += 1)
    if (inside[i] && !core[i]) {
      band += 1
      tally.set(labels[i], (tally.get(labels[i]) ?? 0) + 1)
    }
  const [best, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]
  return best !== 0 && band > 0 && n / band >= OUTLINE_SHARE ? best : null
}

/**
 * The mark's outline kept at least `width` px wide (one pixel of a small icon): the band of that width inside the
 * silhouette's edge takes the outline's colour, so a small icon keeps the shape the outline draws.
 * @param {Uint8Array} labels @param {Uint8Array} alpha @param {number} label @param {number} width
 */
export function withOutline(labels, alpha, label, width) {
  const inside = new Uint8Array(alpha.length)
  for (let i = 0; i < alpha.length; i += 1) inside[i] = alpha[i] >= 128 ? 1 : 0
  const core = sweep(sweep(inside, width, true, false), width, false, false)
  const out = Uint8Array.from(labels)
  for (let i = 0; i < out.length; i += 1) if (alpha[i] > 0 && !core[i]) out[i] = label
  return out
}

/** The labels drawn as RGBA under the silhouette's alpha (a PNG of the master size). */
export function rendered(
  /** @type {Uint8Array} */ labels,
  /** @type {Rgb[]} */ palette,
  /** @type {Uint8Array} */ alpha
) {
  const out = Buffer.alloc(MASTER * MASTER * 4)
  for (let i = 0; i < MASTER * MASTER; i += 1) {
    const c = palette[labels[i]]
    out[i * 4] = c.r
    out[i * 4 + 1] = c.g
    out[i * 4 + 2] = c.b
    out[i * 4 + 3] = alpha[i]
  }
  return sharp(out, { raw: { width: MASTER, height: MASTER, channels: 4 } })
    .png()
    .toBuffer()
}
