// The ground removal of cut_mark (ported from the approved lab's cut-mark): per-pixel local ground by normalised
// convolution, an alpha ramp from the local ground to clearly-mark colours, a flood from the crop border so only
// OUTSIDE ground goes, and edge un-mixing on the outer silhouette only. Pure pixel work, no run folder.
import { dist, hex, sharp } from './common.js'

const EDGE = 3

/** Matte of a crop: { out (RGBA), fillMask (1 channel, 255 = enclosed ground kept), fillPixels, method }. */
export async function matteCrop(crop, W, H, g0) {
  const n = W * H
  const out = Buffer.alloc(n * 4)
  const fillMask = Buffer.alloc(n)
  if (g0.transparent) {
    crop.copy(out)
    return { out, fillMask, fillPixels: 0, method: 'source has its own transparency: alpha kept' }
  }
  const px = (i) => ({ r: crop[i * 4], g: crop[i * 4 + 1], b: crop[i * 4 + 2] })
  const thr = Math.max(40, (g0.spread ?? 0) * 1.6)
  // 1. pixels surely ground (near the global ground) carry the local ground colour
  const groundPx = Buffer.alloc(n * 3)
  const weight = Buffer.alloc(n)
  for (let i = 0; i < n; i++) {
    const p = px(i)
    if (dist(p, g0.colour) <= thr) {
      groundPx[i * 3] = p.r
      groundPx[i * 3 + 1] = p.g
      groundPx[i * 3 + 2] = p.b
      weight[i] = 255
    }
  }
  // 2. normalised convolution: blur colour*weight and weight separately, divide -> a smooth local ground
  const sigma = Math.max(6, Math.round(Math.max(W, H) * 0.03))
  const blurred = await sharp(groundPx, { raw: { width: W, height: H, channels: 3 } })
    .blur(sigma)
    .raw()
    .toBuffer()
  const wsum = await sharp(weight, { raw: { width: W, height: H, channels: 1 } })
    .blur(sigma)
    .extractChannel(0)
    .raw()
    .toBuffer()
  const local = (i) => {
    const wgt = wsum[i] / 255
    if (wgt < 0.02) return g0.colour
    return {
      r: Math.min(255, blurred[i * 3] / wgt),
      g: Math.min(255, blurred[i * 3 + 1] / wgt),
      b: Math.min(255, blurred[i * 3 + 2] / wgt)
    }
  }
  // 3. the mark's main colour: median of pixels far from the ground
  const far = []
  for (let i = 0; i < n; i += 3) if (dist(px(i), g0.colour) > thr * 2) far.push(px(i))
  const med = (k) => far.map((p) => p[k]).sort((x, y) => x - y)[far.length >> 1] ?? 0
  const D = Math.max(60, dist({ r: med('r'), g: med('g'), b: med('b') }, g0.colour))
  const lo = Math.max(14, (g0.spread ?? 0) * 0.9)
  const hi = lo + Math.max(36, D * 0.35)
  // 4. alpha per pixel from the distance to the local ground
  const alpha = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const d = dist(px(i), local(i))
    alpha[i] = d <= lo ? 0 : d >= hi ? 1 : (d - lo) / (hi - lo)
  }
  // 5. outside = surely-ground pixels (alpha 0) 4-connected to the crop border
  const outside = new Uint8Array(n)
  const queue = new Int32Array(n)
  let qh = 0
  let qt = 0
  const seed = (i) => {
    if (!outside[i] && alpha[i] === 0) {
      outside[i] = 1
      queue[qt++] = i
    }
  }
  for (let x = 0; x < W; x++) {
    seed(x)
    seed((H - 1) * W + x)
  }
  for (let y = 0; y < H; y++) {
    seed(y * W)
    seed(y * W + W - 1)
  }
  while (qh < qt) {
    const i = queue[qh++]
    const x = i % W
    const y = (i / W) | 0
    if (x > 0) seed(i - 1)
    if (x < W - 1) seed(i + 1)
    if (y > 0) seed(i - W)
    if (y < H - 1) seed(i + W)
  }
  // 6. distance (chessboard, up to EDGE px) from the outside: the outer silhouette band
  const near = new Uint8Array(n).fill(255)
  let front = []
  for (let i = 0; i < n; i++)
    if (outside[i]) {
      near[i] = 0
      front.push(i)
    }
  for (let step = 1; step <= EDGE; step++) {
    const next = []
    for (const i of front) {
      const x = i % W
      const y = (i / W) | 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
          const j = yy * W + xx
          if (near[j] === 255) {
            near[j] = step
            next.push(j)
          }
        }
    }
    front = next
  }
  // 7. write: outside transparent; outer edge un-mixed; everything else the original pixel, opaque
  let fillPixels = 0
  for (let i = 0; i < n; i++) {
    if (outside[i]) continue
    const p = px(i)
    const al = alpha[i]
    if (near[i] <= EDGE && al < 1) {
      if (al === 0) continue // a ground speck touching the outer edge: part of the outside
      const g = local(i)
      const un = (k) => Math.max(0, Math.min(255, (p[k] - (1 - al) * g[k]) / al))
      out[i * 4] = un('r')
      out[i * 4 + 1] = un('g')
      out[i * 4 + 2] = un('b')
      out[i * 4 + 3] = Math.round(al * 255)
    } else {
      out[i * 4] = p.r
      out[i * 4 + 1] = p.g
      out[i * 4 + 2] = p.b
      out[i * 4 + 3] = 255
      if (al === 0) {
        fillMask[i] = 255
        fillPixels++
      }
    }
  }
  const c = g0.colour
  const method = `local-ground matting: global ground ${hex(c.r, c.g, c.b)} (spread ${Math.round(g0.spread)}), local ground by normalised convolution (sigma ${sigma}px), alpha ramp ${Math.round(lo)}..${Math.round(hi)}, edge colours un-mixed from the local ground on the outer silhouette only (${EDGE} px); only ground connected to the crop border removed, enclosed ground kept opaque (${fillPixels} px at crop size)`
  return { out, fillMask, fillPixels, method }
}
