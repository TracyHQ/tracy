// Copied from tracy-web `lib/picture-cut.js` `pictureFeatures` (ADR 0036): the standalone host's measuring eyes.
import sharp from 'sharp'

const MAX_PIXELS = 100_000_000
/** A Laplacian response past this (0–255 scale) is an edge. */
const EDGE = 48

const open = (bytes) => sharp(Buffer.from(bytes), { limitInputPixels: MAX_PIXELS, failOn: 'none' })

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<{dhash: string, top2Share: number, edgeDensity: number, centreLuminance: number}>}
 */
export async function pictureFeatures(bytes) {
  const tiny = await open(bytes).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
  let hash = 0n
  for (let y = 0; y < 8; y += 1)
    for (let x = 0; x < 8; x += 1) hash = (hash << 1n) | (tiny[y * 9 + x] > tiny[y * 9 + x + 1] ? 1n : 0n)
  const size = 64
  const grey = await open(bytes).greyscale().resize(size, size, { fit: 'fill' }).raw().toBuffer()
  const bins = Array.from({ length: 16 }, () => 0)
  for (const v of grey) bins[v >> 4] += 1
  bins.sort((a, b) => b - a)
  let edges = 0
  for (let y = 1; y < size - 1; y += 1)
    for (let x = 1; x < size - 1; x += 1) {
      const at = y * size + x
      const lap = Math.abs(4 * grey[at] - grey[at - 1] - grey[at + 1] - grey[at - size] - grey[at + size])
      if (lap > EDGE) edges += 1
    }
  let centre = 0
  let n = 0
  for (let y = size / 4; y < (size * 3) / 4; y += 1)
    for (let x = size / 4; x < (size * 3) / 4; x += 1) {
      centre += grey[y * size + x]
      n += 1
    }
  return {
    dhash: hash.toString(16).padStart(16, '0'),
    top2Share: Number(((bins[0] + bins[1]) / grey.length).toFixed(4)),
    edgeDensity: Number((edges / ((size - 2) * (size - 2))).toFixed(4)),
    centreLuminance: Number((centre / n / 255).toFixed(4))
  }
}
