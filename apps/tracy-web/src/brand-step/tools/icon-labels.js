// Pixel labelling of an image-model icon: which requested colour every pixel belongs to, how solid it is, and the
// clean-up of edges and specks. Pure functions over raw RGBA. Ported from the approved lab's icon-quantize.
import { dist } from './common.js'

const FLOOR = 0.08 // alpha under this is ground noise (JPEG, faint haze)
const CEIL = 0.92 // alpha over this is solid (compression noise inside a shape must not make it see-through)
export const STRAY_RES = 40 // a solid pixel this far (RGB) from the line ground..colour is off-palette

/**
 * The model never paints the exact hex. Start at the requested colours `P`, refine twice from pixels that are surely
 * solid (projection >= 0.9) so the alpha ramp follows what was actually painted.
 * @returns {{ O: object[], label: Uint8Array, alpha: Float32Array, res: Float32Array }}
 */
export function labelPixels({ data, w, h, P, G, srcAlpha }) {
  const n = w * h
  let O = P.map((c) => ({ ...c }))
  const label = new Uint8Array(n)
  const alpha = new Float32Array(n)
  const res = new Float32Array(n)
  for (let it = 0; it < 3; it++) {
    const acc = O.map(() => ({ r: 0, g: 0, b: 0, k: 0 }))
    for (let i = 0; i < n; i++) {
      const p = { r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] }
      let best = 0
      let bestRes = Number.POSITIVE_INFINITY
      let bestA = 0
      let rawA = 0
      for (let k = 0; k < O.length; k++) {
        let a
        let r
        if (srcAlpha) {
          a = data[i * 4 + 3] / 255
          r = dist(p, O[k])
        } else {
          const v = { r: O[k].r - G.r, g: O[k].g - G.g, b: O[k].b - G.b }
          const vv = v.r * v.r + v.g * v.g + v.b * v.b || 1
          const t = ((p.r - G.r) * v.r + (p.g - G.g) * v.g + (p.b - G.b) * v.b) / vv
          a = Math.max(0, Math.min(1, t))
          r = Math.hypot(p.r - (G.r + a * v.r), p.g - (G.g + a * v.g), p.b - (G.b + a * v.b))
          if (k === 0 || r < bestRes) rawA = t
        }
        if (r < bestRes) {
          bestRes = r
          best = k
          bestA = a
        }
      }
      label[i] = best
      alpha[i] = bestA < FLOOR ? 0 : bestA > CEIL ? 1 : bestA
      res[i] = bestRes
      if ((srcAlpha ? bestA : rawA) >= 0.9 && bestRes < STRAY_RES) {
        const e = acc[best]
        e.r += p.r
        e.g += p.g
        e.b += p.b
        e.k++
      }
    }
    O = O.map((c, k) =>
      acc[k].k > 50 ? { r: acc[k].r / acc[k].k, g: acc[k].g / acc[k].k, b: acc[k].b / acc[k].k } : c
    )
  }
  return { O, label, alpha, res }
}

/**
 * A partly transparent edge pixel lies close to the ground, where every colour line ground..colour meets, so its
 * label is a guess. Edge pixels take the label of the nearest solid pixel (multi-source breadth-first search, up to
 * 4 px). With one colour this changes nothing.
 */
export function relabelEdges({ label, alpha, w, h }) {
  const n = w * h
  const reached = new Int16Array(n).fill(-1)
  let queue = []
  for (let i = 0; i < n; i++)
    if (alpha[i] >= 1) {
      reached[i] = 0
      queue.push(i)
    }
  for (let d = 1; d <= 4 && queue.length; d++) {
    const next = []
    for (const i of queue) {
      const x = i % w
      const y = (i / w) | 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx
          const Y = y + dy
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue
          const j = Y * w + X
          if (reached[j] !== -1 || alpha[j] <= 0 || alpha[j] >= 1) continue
          reached[j] = d
          label[j] = label[i]
          next.push(j)
        }
    }
    queue = next
  }
}

/** Drops specks: 8-connected components of solid pixels smaller than 0.05% of the image. Returns how many. */
export function removeSpecks({ alpha, w, h }) {
  const n = w * h
  const minArea = Math.max(16, Math.round(n * 0.0005))
  const seen = new Uint8Array(n)
  let specks = 0
  for (let s = 0; s < n; s++) {
    if (seen[s] || alpha[s] < 0.5) continue
    const comp = [s]
    seen[s] = 1
    for (let q = 0; q < comp.length; q++) {
      const x = comp[q] % w
      const y = (comp[q] / w) | 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx
          const Y = y + dy
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue
          const j = Y * w + X
          if (!seen[j] && alpha[j] >= 0.5) {
            seen[j] = 1
            comp.push(j)
          }
        }
    }
    if (comp.length < minArea) {
      specks++
      for (const j of comp) alpha[j] = 0
    }
  }
  return specks
}
