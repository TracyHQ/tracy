// Inputs of the brand tool tests: the JA Boxing 1.0.10 kit committed in the repo, a heading font that is in the repo
// (the wordmark Teko face of tracy-host), an invented brief, and logos DRAWN BY CODE (no copied logo, no real brand).
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { memoryRunFiles } from '../src/brand-step/run-files.js'

const read = (rel) => readFileSync(new URL(rel, import.meta.url))
export const KIT = JSON.parse(
  read(
    '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.10/template-kit.json'
  ).toString('utf8')
)
export const FONT = {
  family: 'Teko',
  bytes: read('../../tracy-host/src/wordmark-fonts/teko-700-latin.woff2')
}

export const BRIEF = {
  brand: { name: 'Harbor Padel Club', logo: null },
  business: { trade: 'sports club' },
  missing: []
}

/** A review double: the answers it was scripted with, in order; the calls it saw are kept. */
export function fakeReview(answers) {
  const calls = []
  const review = async (call) => {
    calls.push(call)
    const a = answers[Math.min(calls.length - 1, answers.length - 1)]
    return { answer: typeof a === 'string' ? a : JSON.stringify(a), cost: 0.0001 }
  }
  return { review, calls }
}

export function makeCtx(extra = {}) {
  return {
    files: memoryRunFiles(),
    kit: KIT,
    brief: BRIEF,
    font: FONT,
    review: null,
    runId: 'test-run',
    ...extra
  }
}

const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
const encode = (w, h, pixel) => {
  const data = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(pixel(x, y), (y * w + x) * 4)
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer()
}

/** A transparent mark: a disc with a square cut out, in one colour. */
export const markPng = (colour = '#2a7f5f', n = 200) => {
  const c = rgb(colour)
  return encode(n, n, (x, y) => {
    const d = (x - n / 2) ** 2 + (y - n / 2) ** 2
    const hole = Math.abs(x - n / 2) < n / 8 && Math.abs(y - n / 2) < n / 8
    return d < (n * 0.45) ** 2 && !hole ? [...c, 255] : [0, 0, 0, 0]
  })
}

/** Found material: a symbol on top of two text-like bars, on a solid ground (or transparent when ground is null). */
export const materialPng = (ground = '#f4efe6', ink = '#1d3b2f') => {
  const g = ground ? [...rgb(ground), 255] : [0, 0, 0, 0]
  const c = [...rgb(ink), 255]
  const W = 400
  const H = 360
  return encode(W, H, (x, y) => {
    if ((x - 200) ** 2 + (y - 90) ** 2 < 70 ** 2) return c
    if (y > 200 && y < 250 && x > 60 && x < 340) return c
    if (y > 290 && y < 300 && x > 120 && x < 280) return c
    return g
  })
}

/**
 * Found material with a standalone symbol: a ring (a "shield" with a closed outline) in `ink` with a grey bar inside
 * it, on a solid `ground`, above two text-like bars. The ground inside the ring is enclosed by the figure.
 * The symbol box is { x: 100, y: 20, w: 200, h: 200 }.
 */
export const ringMaterialPng = (ground = '#f4efe6', ink = '#1d3b2f', inside = '#8a8f98') => {
  const g = [...rgb(ground), 255]
  const c = [...rgb(ink), 255]
  const s = [...rgb(inside), 255]
  return encode(400, 300, (x, y) => {
    const d = (x - 200) ** 2 + (y - 120) ** 2
    if (d < 100 ** 2 && d > 70 ** 2) return c
    if (d < 70 ** 2 && Math.abs(x - 200) < 12 && Math.abs(y - 120) < 40) return s
    if (y > 235 && y < 260 && x > 80 && x < 320) return c
    if (y > 275 && y < 285 && x > 120 && x < 280) return c
    return g
  })
}
export const RING_BOX = { x: 100, y: 20, w: 200, h: 200 }
