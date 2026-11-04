// The plate (ground) a demo icon draws behind its glyph, measured as fractions of the icon's box (ported from the
// brief build branch, #189; spec #345). Pure pixel reading.
/**
 * The ground a demo icon draws behind its glyph, as fractions of the icon's box, so a new glyph is set on the same ground
 * (the content changes, never the template's style).
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
export function groundShapeOf({ data, w, h, ch, ink, inkBox, full }) {
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
