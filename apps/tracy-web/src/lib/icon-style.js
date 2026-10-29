/**
 * The style of a template's demo icon, as the Phosphor weight that matches it (spec TracyHQ/tracy#189): a new item icon
 * takes the look of the icon it replaces, so a section of bold line icons gets bold icons and a section of solid ones gets
 * solid ones.
 *
 * Measured on the demo picture itself, never on a template name:
 * - the ink: the opaque pixels, or, on an icon that carries its own ground (a disc or tile behind the glyph, solid or
 *   half clear), the pixels that stand apart from that ground;
 * - two-tone: a second ink colour of its own, or a wide tinted (half-clear) area beside the ink → `duotone`;
 * - filled: the ink's mean stroke, read as twice its area over its edge, is thick against the glyph's box → `fill`;
 * - else an outline, whose stroke against the glyph's box picks `thin`, `light`, `regular` or `bold`.
 * The bounds were measured on Phosphor's own icons rendered in each weight (`test/icon-style.test.mjs`).
 */
import sharp from 'sharp'

/** The longest side a demo icon is read at. */
const SIDE = 128
/** Stroke against the glyph's box: below each bound, that weight (measured on Phosphor's own renders). */
export const STROKE_BOUNDS = Object.freeze([
  ['thin', 0.0525],
  ['light', 0.0725],
  ['regular', 0.099],
  ['bold', 0.16]
])
/** Ink this deep against the box (its deepest few pixels) is a solid shape, not a line. */
const SOLID_DEPTH = 0.12
/**
 * A line is about half its mean stroke deep; a solid shape is deeper than that against its own mean stroke (a solid
 * racquet's head), even where its parts are thin.
 */
const SOLID_SHAPE = 0.7
/** Below this depth a mark is a few pixels thin, where depth and mean stroke cannot be told apart. */
const SOLID_SHAPE_DEPTH = 0.06

/** WCAG relative luminance of an sRGB colour. */
function luminance(r, g, b) {
  const lin = (/** @type {number} */ v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (/** @type {number} */ a, /** @type {number} */ b) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * The ground a demo icon draws behind its glyph, as fractions of the icon's box, so a new glyph is set on the same ground
 * (COO 29/10/2026: replace the content, never the template's style).
 * @typedef {{colour: string, opacity: number, box: {x: number, y: number, w: number, h: number}, radius: number,
 *   glyph: {x: number, y: number, w: number, h: number}}} GroundShape
 * - `box`: the ground's bounding box; `radius`: its corner radius against its shorter side (0.5 is a disc or an ellipse,
 *   0 a square tile), read from how much of its box it fills, row by row (a rounded box of radius r fills
 *   1 - (4 - pi) r^2 of it);
 * - `colour`, `opacity`: the median of the ground's own pixels (not the glyph's, nor the anti-aliased rim around it);
 * - `glyph`: the box of the demo's glyph, which the new glyph's drawing takes.
 * @param {{data: Buffer, w: number, h: number, ch: number, ink: Uint8Array, inkBox: number[],
 *   full: {data: Buffer, width: number, height: number, channels: number}}} input
 * @returns {GroundShape | null}
 */
function groundShapeOf({ data, w, h, ch, ink, inkBox, full }) {
  const alpha = (/** @type {number} */ p) => data[p * ch + 3]
  const median = (/** @type {number[]} */ list) => list.sort((a, z) => a - z)[Math.floor(list.length / 2)]
  // The ground's own pixels: visible, off the glyph and away from its rim. Read on the full-size picture, where a faint
  // ground keeps its exact colour (a downscaled pixel at a tenth of opacity does not).
  const near = (/** @type {number} */ x, /** @type {number} */ y) => {
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const qx = x + dx
        const qy = y + dy
        if (qx < 0 || qy < 0 || qx >= w || qy >= h || ink[qy * w + qx] || alpha(qy * w + qx) < 12) return true
      }
    return false
  }
  const rs = []
  const gs = []
  const bs = []
  const as = []
  for (let Y = 0; Y < full.height; Y += 1)
    for (let X = 0; X < full.width; X += 1) {
      const q = (Y * full.width + X) * full.channels
      if (full.data[q + 3] < 12) continue
      if (near(Math.floor((X * w) / full.width), Math.floor((Y * h) / full.height))) continue
      rs.push(full.data[q])
      gs.push(full.data[q + 1])
      bs.push(full.data[q + 2])
      as.push(full.data[q + 3])
    }
  if (as.length === 0) return null
  const opacity = median(as)
  // The ground's outline at half its own opacity (its anti-aliased rim is not the ground): the box, and how much of it
  // the ground fills, row by row (the glyph sits on the ground, so it fills no hole).
  const edge = Math.max(6, opacity / 2)
  let x0 = w
  let x1 = -1
  let y0 = h
  let y1 = -1
  let filled = 0
  for (let y = 0; y < h; y += 1) {
    let left = -1
    let right = -1
    for (let x = 0; x < w; x += 1)
      if (alpha(y * w + x) >= edge) {
        if (left < 0) left = x
        right = x
      }
    if (left < 0) continue
    filled += right - left + 1
    x0 = Math.min(x0, left)
    x1 = Math.max(x1, right)
    y0 = Math.min(y0, y)
    y1 = y
  }
  if (x1 < 0) return null
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  const fill = Math.min(1, filled / (bw * bh))
  const radius = Math.min(0.5, Math.sqrt(Math.max(0, 1 - fill) / (4 - Math.PI)))
  const hex = (/** @type {number} */ v) => v.toString(16).padStart(2, '0')
  const [ix0, ix1, iy0, iy1] = inkBox
  const round = (/** @type {number} */ v) => Number(v.toFixed(4))
  return {
    colour: `#${hex(median(rs))}${hex(median(gs))}${hex(median(bs))}`,
    opacity: round(opacity / 255),
    box: { x: round(x0 / w), y: round(y0 / h), w: round(bw / w), h: round(bh / h) },
    radius: round(radius),
    glyph: {
      x: round(ix0 / w),
      y: round(iy0 / h),
      w: round((ix1 - ix0 + 1) / w),
      h: round((iy1 - iy0 + 1) / h)
    }
  }
}

/**
 * The style of a demo icon; null when it cannot be read or holds too little ink.
 * @param {Uint8Array | Buffer | null} bytes
 * @returns {Promise<{weight: string, stroke: number, depth: number, coverage: number, twoTone: boolean, ground: boolean, groundShape: GroundShape | null} | null>}
 */
export async function iconStyleOf(bytes) {
  if (!bytes) return null
  try {
    const { data, info } = await sharp(Buffer.from(bytes), { failOn: 'none' })
      .ensureAlpha()
      .resize(SIDE, SIDE, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const { width: w, height: h, channels: ch } = info
    const fullOf = async () => {
      const got = await sharp(Buffer.from(bytes), { failOn: 'none' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      return { data: got.data, ...got.info }
    }
    const n = w * h
    const alpha = (/** @type {number} */ p) => data[p * ch + 3]
    const lum = new Float64Array(n)
    for (let p = 0; p < n; p += 1) lum[p] = luminance(data[p * ch], data[p * ch + 1], data[p * ch + 2])

    // A ground: one colour over a third of the box, spanning most of it both ways (as `iconColourOf` reads it).
    const clusters = new Map()
    for (let p = 0; p < n; p += 1) {
      if (alpha(p) < 128) continue
      const key = `${data[p * ch] >> 5},${data[p * ch + 1] >> 5},${data[p * ch + 2] >> 5}`
      const x = p % w
      const y = Math.floor(p / w)
      const c = clusters.get(key) ?? { n: 0, l: 0, x0: x, x1: x, y0: y, y1: y }
      c.n += 1
      c.l += lum[p]
      c.x0 = Math.min(c.x0, x)
      c.x1 = Math.max(c.x1, x)
      c.y0 = Math.min(c.y0, y)
      c.y1 = Math.max(c.y1, y)
      clusters.set(key, c)
    }
    const ranked = [...clusters.values()].sort((a, z) => z.n - a.n)
    const top = ranked[0]
    const spans = top && top.n >= n / 3 && top.x1 - top.x0 + 1 >= w * 0.7 && top.y1 - top.y0 + 1 >= h * 0.7
    // A solid icon is one colour too: it is a ground only when another opaque colour stands on it (the glyph).
    const opaque = ranked.reduce((sum, c) => sum + c.n, 0)
    const onIt = spans
      ? ranked
          .slice(1)
          .filter((c) => contrast(c.l / c.n, top.l / top.n) >= 1.5)
          .reduce((sum, c) => sum + c.n, 0)
      : 0
    const ground = spans && onIt >= opaque * 0.03 ? top.l / top.n : null

    // The ink mask.
    const ink = new Uint8Array(n)
    let count = 0
    for (let p = 0; p < n; p += 1) {
      const on = alpha(p) >= 128 && (ground === null || contrast(lum[p], ground) >= 1.5)
      if (on) {
        ink[p] = 1
        count += 1
      }
    }
    if (count < 20) return null
    let x0 = w
    let x1 = -1
    let y0 = h
    let y1 = -1
    let edges = 0
    for (let p = 0; p < n; p += 1) {
      if (!ink[p]) continue
      const x = p % w
      const y = Math.floor(p / w)
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
      const edge =
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        !ink[p - 1] ||
        !ink[p + 1] ||
        !ink[p - w] ||
        !ink[p + w]
      if (edge) edges += 1
    }
    const boxSide = Math.max(x1 - x0 + 1, y1 - y0 + 1)
    // How deep the ink goes: each ink pixel's chamfer distance to the nearest clear pixel. A line is at most half its
    // stroke deep; a solid shape is deep in its middle.
    const depth = new Float32Array(n)
    for (let p = 0; p < n; p += 1) depth[p] = ink[p] ? 1e6 : 0
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const p = y * w + x
        if (!depth[p]) continue
        const up = y > 0 ? depth[p - w] : 0
        const left = x > 0 ? depth[p - 1] : 0
        const ul = y > 0 && x > 0 ? depth[p - w - 1] : 0
        const ur = y > 0 && x < w - 1 ? depth[p - w + 1] : 0
        depth[p] = Math.min(depth[p], up + 1, left + 1, ul + 1.4, ur + 1.4)
      }
    for (let y = h - 1; y >= 0; y -= 1)
      for (let x = w - 1; x >= 0; x -= 1) {
        const p = y * w + x
        if (!depth[p]) continue
        const down = y < h - 1 ? depth[p + w] : 0
        const right = x < w - 1 ? depth[p + 1] : 0
        const dl = y < h - 1 && x > 0 ? depth[p + w - 1] : 0
        const dr = y < h - 1 && x < w - 1 ? depth[p + w + 1] : 0
        depth[p] = Math.min(depth[p], down + 1, right + 1, dl + 1.4, dr + 1.4)
      }
    const depths = []
    for (let p = 0; p < n; p += 1) if (ink[p]) depths.push(depth[p])
    depths.sort((a, z) => a - z)
    const deep = depths[Math.floor(depths.length * 0.97)] / boxSide
    const coverage = count / ((x1 - x0 + 1) * (y1 - y0 + 1))
    // Mean stroke: a line of width s and length L has area s*L and about 2*L edge pixels.
    const stroke = (2 * count) / Math.max(1, edges) / boxSide

    // Two-tone: a tinted, half-clear area (inside, not the anti-aliased rim of the ink), or a second ink colour.
    let tint = 0
    let tx0 = w
    let tx1 = -1
    let ty0 = h
    let ty1 = -1
    const half = (/** @type {number} */ p) => alpha(p) >= 25 && alpha(p) <= 110
    for (let y = 1; y < h - 1; y += 1)
      for (let x = 1; x < w - 1; x += 1) {
        const p = y * w + x
        if (half(p) && half(p - 1) && half(p + 1) && half(p - w) && half(p + w)) {
          tint += 1
          tx0 = Math.min(tx0, x)
          tx1 = Math.max(tx1, x)
          ty0 = Math.min(ty0, y)
          ty1 = Math.max(ty1, y)
        }
      }
    // A half-clear disc or tile behind the glyph spans the whole box: it is a ground, not a tint inside the glyph.
    const halfGround = tint >= n / 3 && tx1 - tx0 + 1 >= w * 0.7 && ty1 - ty0 + 1 >= h * 0.7
    if (halfGround) tint = 0
    let second = 0
    if (ground === null) {
      const inkClusters = ranked.filter((c) => c.n >= count * 0.12)
      const first = inkClusters[0]
      if (first)
        for (const c of inkClusters.slice(1))
          if (contrast(c.l / c.n, first.l / first.n) >= 1.6) second = Math.max(second, c.n)
    }
    const twoTone = tint >= count * 0.12 || second > 0
    const weight = twoTone
      ? 'duotone'
      : deep >= SOLID_DEPTH || (deep >= SOLID_SHAPE_DEPTH && deep >= stroke * SOLID_SHAPE)
        ? 'fill'
        : (STROKE_BOUNDS.find(([, bound]) => stroke < bound)?.[0] ?? 'bold')
    return {
      weight,
      stroke: Number(stroke.toFixed(4)),
      depth: Number(deep.toFixed(4)),
      coverage: Number(coverage.toFixed(4)),
      twoTone,
      ground: ground !== null || halfGround,
      groundShape:
        ground !== null || halfGround
          ? groundShapeOf({ data, w, h, ch, ink, inkBox: [x0, x1, y0, y1], full: await fullOf() })
          : null
    }
  } catch {
    return null
  }
}

/**
 * One weight for a section: the weight most of its demo icons measure, the first measured winning a tie; `regular` when
 * none could be read.
 * @param {Array<{weight: string} | null>} styles
 */
export function sectionWeightOf(styles) {
  const counts = new Map()
  for (const s of styles) if (s?.weight) counts.set(s.weight, (counts.get(s.weight) ?? 0) + 1)
  let best = null
  for (const [weight, c] of counts) if (!best || c > best[1]) best = [weight, c]
  return best?.[0] ?? 'regular'
}
