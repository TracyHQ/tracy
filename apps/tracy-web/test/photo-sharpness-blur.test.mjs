// The sharpness gate's blur (lib/photo-sharpness-measure.js) was rewritten for speed: the edge clamp is paid at the
// edges only and the column pass adds whole rows. The gate's bars were calibrated on the first version, so the new one
// must give the same floats to the bit. The first version is kept here as the reference.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blur } from '../src/lib/photo-sharpness-measure.js'

function reference(src, w, h, sigma) {
  const r = Math.ceil(sigma * 3)
  const k = new Float32Array(2 * r + 1)
  let total = 0
  for (let i = -r; i <= r; i += 1) total += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma))
  for (let i = 0; i < k.length; i += 1) k[i] /= total
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      let a = 0
      for (let i = -r; i <= r; i += 1) a += k[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))]
      tmp[y * w + x] = a
    }
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      let a = 0
      for (let i = -r; i <= r; i += 1) a += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]
      out[y * w + x] = a
    }
  return out
}

// A grey picture of whole grey levels (what `render` hands over) from a fixed seed.
function picture(w, h, seed) {
  let s = seed >>> 0
  const px = new Float32Array(w * h)
  for (let i = 0; i < px.length; i += 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    px[i] = s % 256
  }
  return px
}

test('the blur gives the same floats to the bit as the first version, edges and tiny pictures included', () => {
  const sizes = [
    [1, 1],
    [2, 3],
    [5, 4],
    [7, 19],
    [19, 7],
    [20, 21],
    [64, 48],
    [257, 131]
  ]
  for (const sigma of [1, 3])
    for (const [w, h] of sizes) {
      const src = picture(w, h, w * 1000 + h * 7 + sigma)
      const want = reference(src, w, h, sigma)
      const got = blur(src, w, h, sigma)
      assert.equal(got.length, want.length)
      for (let i = 0; i < want.length; i += 1)
        if (!Object.is(got[i], want[i]))
          assert.fail(`sigma ${sigma}, ${w}x${h}, pixel ${i}: ${got[i]} instead of ${want[i]}`)
    }
})

// Speed is not asserted (a busy runner makes any timing flaky): dev measured 166 s to 94 s of frame preparation.
test('the blur of a large picture, both sigmas the gate uses, is equal to the first version', () => {
  const [w, h] = [1200, 900]
  const src = picture(w, h, 42)
  for (const sigma of [1, 3]) assert.deepEqual(blur(src, w, h, sigma), reference(src, w, h, sigma))
})
